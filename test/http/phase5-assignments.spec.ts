import { type ChildProcess, fork } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AssignmentDto,
  QuizAttemptDto,
} from '../../src/modules/assignments/dtos/assignment.dto.js';
import type { ZipView } from '../../src/modules/assignments/zip.types.js';
import { fileConfig, storageFixture, upload, zipBuffer } from '../helpers/files-fixture.js';
import { separateTestUrl } from '../helpers/payment-fixture.js';

async function json<T>(response: Response | Promise<Response>): Promise<T> {
  return (await (await response).json()) as T;
}
describe.skipIf(!separateTestUrl('phase5_http'))('Phase 5 compiled assignment HTTP', () => {
  let server: ChildProcess,
    db: DataSource,
    url: string,
    classId: string,
    sessionId: string,
    mentor: string,
    student: string,
    other: string;
  let remote: Awaited<ReturnType<typeof storageFixture>>;
  beforeAll(async () => {
    const fileSettings = fileConfig();
    remote = await storageFixture(fileSettings);
    const dbUrl = separateTestUrl('phase5_http'),
      keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
    server = fork('test/http/payment-server.mjs', [], {
      execArgv: [],
      silent: true,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL: dbUrl,
        DATABASE_LOGGING: 'false',
        COOKIE_SECURE: 'false',
        CORS_ORIGINS: 'http://localhost:3001',
        SWAGGER_ENABLED: 'true',
        GOOGLE_AUTH_ENABLED: 'false',
        MAIL_ENABLED: 'false',
        ORDER_EXPIRY_JOB_ENABLED: 'false',
        PAYMENT_MAIL_JOB_ENABLED: 'false',
        ASSIGNMENT_TIMEOUT_JOB_ENABLED: 'false',
        ASSIGNMENT_ZIP_ENABLED: 'true',
        ASSIGNMENT_FILE_JOB_ENABLED: 'false',
        FILE_JOB_ENABLED: 'false',
        MINIO_ENABLED: 'true',
        MINIO_ENDPOINT: '127.0.0.1',
        MINIO_PORT: '19000',
        MINIO_USE_SSL: 'false',
        MINIO_PUBLIC_URL: 'http://127.0.0.1:19000',
        MINIO_ACCESS_KEY: 'mindy-files-test',
        MINIO_SECRET_KEY: 'mindy-files-test-only-password',
        MINIO_BUCKET: fileSettings.getOrThrow<string>('MINIO_BUCKET'),
        PAYOS_ENABLED: 'true',
        PAYOS_CREATE_LINK_ENABLED: 'true',
        PAYOS_CLIENT_ID: 'http-client',
        PAYOS_API_KEY: 'http-key',
        PAYOS_CHECKSUM_KEY: 'http-checksum',
        PAYOS_RETURN_URL: 'https://example.test/paid',
        PAYOS_CANCEL_URL: 'https://example.test/cancel',
        PAYOS_WEBHOOK_URL: 'https://example.test/webhook',
        JWT_PRIVATE_KEY_BASE64: Buffer.from(
          keys.privateKey.export({ type: 'pkcs8', format: 'pem' }),
        ).toString('base64'),
        JWT_PUBLIC_KEY_BASE64: Buffer.from(
          keys.publicKey.export({ type: 'spki', format: 'pem' }),
        ).toString('base64'),
      },
    });
    let output = '';
    server.stdout?.on('data', (c) => {
      output += String(c);
    });
    server.stderr?.on('data', (c) => {
      output += String(c);
    });
    const ready = await new Promise<{ url: string; classId: string }>((resolve, reject) => {
      server.once('message', (m) => resolve(m as { url: string; classId: string }));
      server.once('exit', (code) => reject(new Error(`HTTP server exited ${code}: ${output}`)));
      server.once('error', reject);
    });
    url = `${ready.url}/api/v1`;
    classId = ready.classId;
    db = new DataSource({ type: 'postgres', url: dbUrl });
    await db.initialize();
    const sessions: { id: string }[] = await db.query(
      'SELECT id FROM class_sessions WHERE class_id=$1',
      [classId],
    );
    sessionId = sessions[0]?.id ?? '';
    async function login(email: string): Promise<string> {
      const res = await request('/auth/login', undefined, {
        email,
        password: 'Http-test-password1!',
      });
      expect(res.status, output).toBe(200);
      return res.headers
        .getSetCookie()
        .map((c) => c.split(';')[0])
        .join('; ');
    }
    mentor = await login('mentor@http.test');
    student = await login('student@http.test');
    other = await login('other@http.test');
    // Create the existing enrollment through checkout, without merchant network calls.
    expect((await request('/me/cart/items', student, { classId })).status).toBe(201);
    const checkout = await request('/me/cart/checkout', student, { paymentType: 'CASH' });
    expect(checkout.status).toBe(201);
    // Assignment tests start at settled enrollment; payment behavior has its own HTTP suites.
    await db.query(
      "UPDATE enrollments SET status='ACTIVE',enrolled_at=clock_timestamp() WHERE class_id=$1",
      [classId],
    );
  }, 45000);
  afterAll(async () => {
    if (remote) await remote.cleanup();
    if (db?.isInitialized) await db.destroy();
    if (server && server.exitCode === null)
      await new Promise<void>((resolve) => {
        server.once('exit', () => resolve());
        server.send('close');
        const timer = setTimeout(() => {
          server.kill();
          resolve();
        }, 5000);
        timer.unref();
      });
  });
  function request(
    path: string,
    cookie?: string,
    body?: unknown,
    method = body === undefined ? 'GET' : 'POST',
    key?: string,
    origin = 'http://localhost:3001',
  ): Promise<Response> {
    return fetch(`${url}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        origin,
        ...(cookie ? { cookie } : {}),
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  it('enforces authentication, roles, Origin, UUID paths, nested DTO limits and private authoring scope', async () => {
    const path = `/mentor/class-sessions/${sessionId}/assignments`;
    const body = { purpose: 'TEST', type: 'QUIZ', title: 'HTTP quiz', maxScore: '100.00' };
    expect((await request(path, undefined, body)).status).toBe(401);
    expect((await request(path, student, body)).status).toBe(403);
    expect((await request(path, mentor, body, 'POST', undefined, 'https://evil.test')).status).toBe(
      403,
    );
    expect((await request('/mentor/class-sessions/invalid/assignments', mentor, body)).status).toBe(
      400,
    );
    for (const bad of [
      { ...body, score: 100 },
      { ...body, maxScore: '0' },
      { ...body, title: '  ' },
      { ...body, timeLimitMinutes: 0 },
      { ...body, dueAt: '2026-10-22T20:00:00' },
    ])
      expect((await request(path, mentor, bad)).status).toBe(422);
    const created = await request(path, mentor, body);
    expect(created.status).toBe(201);
    const draft = await json<AssignmentDto>(created);
    expect((await request(`/me/assignments/${draft.id}`, student)).status).toBe(404);
    const invalid = {
      expectedRevision: 1,
      questions: [
        {
          prompt: 'Q',
          correctOption: 'A',
          options: [
            { label: 'A', text: 'x' },
            { label: 'B', text: 'x' },
            { label: 'C', text: 'x' },
            { label: 'D', text: 'x' },
          ],
          score: 1,
        },
      ],
    };
    expect(
      (await request(`/mentor/assignments/${draft.id}/questions`, mentor, invalid, 'PUT')).status,
    ).toBe(422);
    const doc = await json<{
      paths: Record<string, unknown>;
      components: { schemas: Record<string, { properties: Record<string, unknown> }> };
    }>(fetch(`${url.replace('/api/v1', '')}/docs-json`));
    expect(doc.paths).toHaveProperty('/api/v1/me/assignment-submissions/{submissionId}/submit');
    expect(doc.components.schemas.StudentAssignmentDto?.properties).not.toHaveProperty('questions');
    expect(doc.components.schemas.QuizQuestionDto?.properties).not.toHaveProperty('correctOption');
    expect(doc.components.schemas.QuizResultDto?.properties).toHaveProperty('results');
  });
  it('runs 40-question authoring/start/autosave/submit with immediate result and no draft key leakage', async () => {
    let draft = await json<AssignmentDto>(
      request(`/mentor/class-sessions/${sessionId}/assignments`, mentor, {
        purpose: 'HOMEWORK',
        type: 'QUIZ',
        title: 'Forty questions',
        maxScore: '100.00',
        timeLimitMinutes: 10,
      }),
    );
    const questionInput = Array.from({ length: 40 }, (_, i) => ({
      prompt: `Question ${i + 1}`,
      correctOption: 'A',
      options: ['A', 'B', 'C', 'D'].map((label) => ({ label, text: `Option ${label}` })),
    }));
    draft = await json<AssignmentDto>(
      request(
        `/mentor/assignments/${draft.id}/questions`,
        mentor,
        { expectedRevision: draft.revision, questions: questionInput },
        'PUT',
      ),
    );
    const publish = await request(`/mentor/assignments/${draft.id}/publish`, mentor, {
      expectedRevision: draft.revision,
    });
    expect(publish.status).toBe(200);
    const published = await json<AssignmentDto>(publish);
    const before = await json(request(`/me/assignments/${draft.id}`, student));
    expect(before).not.toHaveProperty('questions');
    const startPath = `/me/assignments/${draft.id}/start`,
      startBody = { expectedAssignmentRevision: published.revision },
      key = randomUUID();
    expect((await request(startPath, student, startBody)).status).toBe(422);
    const start = await request(startPath, student, startBody, 'POST', key);
    expect(start.status).toBe(201);
    const attempt = await json<QuizAttemptDto>(start);
    expect(JSON.stringify(attempt)).not.toMatch(/correctOption|isCorrect|"score"/);
    expect((await request(startPath, student, startBody, 'POST', key)).status).toBe(200);
    const path = `/me/assignment-submissions/${attempt.attemptId}`;
    expect((await request(path, other)).status).toBe(404);
    const answers = attempt.questions.map((q, i) => ({
      questionId: q.id,
      selectedOption: i < 33 ? 'A' : 'B',
    }));
    const input = { expectedVersion: 1, answers };
    expect(
      (
        await request(
          `${path}/submit`,
          student,
          { ...input, score: '100.00' },
          'POST',
          randomUUID(),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await request(
          `${path}/submit`,
          student,
          { ...input, answers: answers.slice(1) },
          'POST',
          randomUUID(),
        )
      ).status,
    ).toBe(422);
    const submitKey = randomUUID();
    const response = await request(`${path}/submit`, student, input, 'POST', submitKey);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const graded = await json<QuizAttemptDto>(response);
    expect(graded.result).toMatchObject({ correctCount: 33, wrongCount: 7, score: '82.50' });
    expect(
      (await json<QuizAttemptDto>(request(`${path}/submit`, student, input, 'POST', submitKey)))
        .result,
    ).toEqual(graded.result);
    expect((await json<QuizAttemptDto>(request(`${path}/result`, student))).result).toEqual(
      graded.result,
    );
  });
  it('imports 200 multilingual questions above 64 KiB, returns indexed errors and preserves the entire set on failure', async () => {
    const draft = await json<AssignmentDto>(
      request(`/mentor/class-sessions/${sessionId}/assignments`, mentor, {
        purpose: 'TEST',
        type: 'QUIZ',
        title: 'Bulk HTTP',
        maxScore: '100',
      }),
    );
    const path = `/mentor/assignments/${draft.id}/questions`;
    const questions = Array.from({ length: 200 }, (_, i) => ({
      prompt: `Câu ${i + 1}\n${'Tiếng Việt nhiều dòng\n'.repeat(40)}`,
      correctOption: 'D',
      options: ['A', 'B', 'C', 'D'].map((label) => ({
        label,
        text: `Đáp án ${label}\n${'Nội dung '.repeat(30)}`,
      })),
    }));
    const payload = { expectedRevision: 1, questions };
    expect(Buffer.byteLength(JSON.stringify(payload))).toBeGreaterThan(64 * 1024);
    const response = await request(path, mentor, payload, 'PUT');
    expect(response.status).toBe(200);
    const authored = await json<AssignmentDto>(response);
    expect(authored.questions).toHaveLength(200);
    expect(authored.questions?.[199]).toMatchObject(questions[199] ?? {});
    expect((await request(path, mentor, payload, 'PUT')).status).toBe(409);
    const base = { expectedRevision: authored.revision, questions };
    for (const [bad, field] of [
      [{ ...questions[1], prompt: '   ' }, 'questions.1.prompt'],
      [{ ...questions[1], correctOption: undefined }, 'questions.1.correctOption'],
      [{ ...questions[1], correctOption: 'PRIVATE_KEY_SENTINEL' }, 'questions.1.correctOption'],
      [
        {
          ...questions[1],
          options: [
            { label: 'A', text: 'ok' },
            { label: 'B', text: '  ' },
            { label: 'C', text: 'ok' },
            { label: 'D', text: 'ok' },
          ],
        },
        'questions.1.options.1.text',
      ],
      [{ ...questions[1], PRIVATE_KEY_SENTINEL: 'secret' }, 'questions.1.$unknown'],
      [
        { ...questions[1], options: ['A', 'A', 'C', 'D'].map((label) => ({ label, text: 'ok' })) },
        'questions.1.options',
      ],
    ] as const) {
      const invalid = await request(
        path,
        mentor,
        { ...base, questions: questions.map((q, i) => (i === 1 ? bad : q)) },
        'PUT',
      );
      expect(invalid.status).toBe(422);
      const body = await json<{
        code: string;
        details: { fields: { path: string; code: string }[] }[];
      }>(invalid);
      expect(body.code).toBe('INVALID_QUIZ_QUESTIONS');
      expect(body.details[0]?.fields).toContainEqual(expect.objectContaining({ path: field }));
      expect(JSON.stringify(body)).not.toMatch(/PRIVATE_KEY_SENTINEL|secret/);
    }
    expect(
      (await request(path, mentor, { ...base, questions: [...questions, questions[0]] }, 'PUT'))
        .status,
    ).toBe(422);
    expect(await json<AssignmentDto>(request(`/mentor/assignments/${draft.id}`, mentor))).toEqual(
      authored,
    );
    // Replace-all removes the omitted questions and keeps explicitly supplied IDs.
    const first = authored.questions?.[0];
    if (!first) throw new Error('Missing imported question');
    const replaced = await json<AssignmentDto>(
      request(
        path,
        mentor,
        {
          expectedRevision: authored.revision,
          questions: [
            {
              id: first.id,
              prompt: first.prompt,
              options: first.options,
              correctOption: 'B',
            },
          ],
        },
        'PUT',
      ),
    );
    expect(replaced.questions).toHaveLength(1);
    expect(replaced.questions?.[0]).toMatchObject({
      id: first.id,
      position: 1,
      correctOption: 'B',
    });
  });
  it('enforces exactly 1 MiB on only the bulk PUT route, counting UTF-8/escaping and preserving parser isolation', async () => {
    const draft = await json<AssignmentDto>(
      request(`/mentor/class-sessions/${sessionId}/assignments`, mentor, {
        purpose: 'TEST',
        type: 'QUIZ',
        title: 'Byte boundary',
        maxScore: '10',
      }),
    );
    const path = `/mentor/assignments/${draft.id}/questions`;
    const raw = JSON.stringify({
      expectedRevision: 1,
      questions: [
        {
          prompt: 'Tiếng Việt\n"Nhiều dòng"',
          correctOption: 'A',
          options: ['A', 'B', 'C', 'D'].map((label) => ({ label, text: 'Đáp án' })),
        },
      ],
    }).replaceAll('ệ', '\\u1ec7');
    const limit = 1 * 1024 * 1024;
    const padded = `${raw}${' '.repeat(limit - Buffer.byteLength(raw))}`;
    expect(Buffer.byteLength(padded)).toBe(limit);
    async function send(body: string, route = path, method = 'PUT') {
      return fetch(`${url}${route}`, {
        method,
        headers: {
          cookie: mentor,
          origin: 'http://localhost:3001',
          'content-type': 'application/json; charset=utf-8',
        },
        body,
      });
    }
    const exact = await send(padded, `${path}/?import=1`);
    expect(exact.status).toBe(200);
    const authored = await json<AssignmentDto>(exact);
    expect(authored.questions?.[0]?.prompt).toBe('Tiếng Việt\n"Nhiều dòng"');
    const oversized = await send(`${padded} `);
    expect(oversized.status).toBe(413);
    expect(await json(oversized)).toMatchObject({ code: 'INVALID_JSON_BODY' });
    expect((await send('{')).status).toBe(400);
    const overGlobal = `${raw}${' '.repeat(64 * 1024)}`;
    for (const [route, method] of [
      [`/mentor/assignments/${draft.id}`, 'PATCH'],
      [path, 'POST'],
      [`${path}/extra`, 'PUT'],
      ['/me/chat/conversations', 'POST'],
    ])
      expect((await send(overGlobal, route, method)).status).toBe(413);
    // Existing attendance recovery parser retains its separate 256 KiB budget.
    const recovery = `/management/class-sessions/${sessionId}/attendance/recover`;
    const attendanceRaw = '{}';
    expect(
      (await send(`${attendanceRaw}${' '.repeat(256 * 1024 - 2)}`, recovery, 'POST')).status,
    ).toBe(403);
    expect(
      (await send(`${attendanceRaw}${' '.repeat(256 * 1024 - 1)}`, recovery, 'POST')).status,
    ).toBe(413);
    expect(await json<AssignmentDto>(request(`/mentor/assignments/${draft.id}`, mentor))).toEqual(
      authored,
    );
  });
  it('runs compiled ZIP validation/submit/grade/release/history with guarded files and rollback flags', async () => {
    const assignment = await json<AssignmentDto>(
      request(`/mentor/class-sessions/${sessionId}/assignments`, mentor, {
        purpose: 'HOMEWORK',
        type: 'ZIP',
        title: 'ZIP HTTP',
        maxScore: '10.00',
        maxAttempts: 2,
        dueAt: new Date(Date.now() + 86400000).toISOString(),
      }),
    );
    const published = await json<AssignmentDto>(
      request(`/mentor/assignments/${assignment.id}/publish`, mentor, {
        expectedRevision: assignment.revision,
      }),
    );
    expect(published.status).toBe('PUBLISHED');
    const draftPath = `/me/assignments/${assignment.id}/zip-submissions`,
      draftInput = { expectedAssignmentRevision: published.revision };
    expect((await request(draftPath, student, draftInput)).status).toBe(422);
    expect((await request(draftPath, mentor, draftInput, 'POST', randomUUID())).status).toBe(403);
    expect(
      (await request(draftPath, student, draftInput, 'POST', randomUUID(), 'https://evil.test'))
        .status,
    ).toBe(403);
    const draftResponse = await request(draftPath, student, draftInput, 'POST', randomUUID());
    expect(draftResponse.status).toBe(201);
    const draft = await json<ZipView>(draftResponse);
    const bytes = await zipBuffer([['main.ts', Buffer.from('console.log("submitted");')]]),
      input = {
        expectedVersion: 1,
        originalFilename: 'answer.zip',
        declaredMimeType: 'application/zip',
        declaredSizeBytes: bytes.length,
      };
    const intentPath = `/me/zip-submissions/${draft.id}/upload-intents`;
    expect(
      (
        await request(
          intentPath,
          student,
          { ...input, ownerId: randomUUID() },
          'POST',
          randomUUID(),
        )
      ).status,
    ).toBe(422);
    expect((await request(intentPath, other, input, 'POST', randomUUID())).status).toBe(404);
    const intentResponse = await request(intentPath, student, input, 'POST', randomUUID());
    expect(intentResponse.status).toBe(201);
    const intent = await json<{ fileId: string; uploadUrl: string; version: number }>(
      intentResponse,
    );
    expect(JSON.stringify(intent)).not.toMatch(/staging_key|bucket|object_version/);
    await upload(intent.uploadUrl, 'application/zip', bytes);
    const completeInput = { expectedVersion: intent.version },
      completeKey = randomUUID(),
      completePath = `/assignment-files/${intent.fileId}/complete`;
    const complete = await request(completePath, student, completeInput, 'POST', completeKey);
    expect(complete.status).toBe(200);
    expect(await json(complete)).toMatchObject({ status: 'PROCESSING' });
    expect((await request(completePath, student, completeInput, 'POST', completeKey)).status).toBe(
      200,
    );
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Assignment validation IPC timeout')), 15000);
      server.once('message', (message) => {
        clearTimeout(timer);
        expect(message).toMatchObject({ assignmentProcessed: intent.fileId });
        resolve();
      });
      server.send('assignment-files-process');
    });
    expect(await json(request(`/assignment-files/${intent.fileId}`, student))).toMatchObject({
      status: 'READY',
    });
    expect((await request(`/assignment-files/${intent.fileId}/download`, other)).status).toBe(404);
    const attach = await request(
      `/me/zip-submissions/${draft.id}/file`,
      student,
      { expectedVersion: 1, fileId: intent.fileId },
      'PUT',
      randomUUID(),
    );
    expect(attach.status).toBe(200);
    const submitKey = randomUUID(),
      submitInput = { expectedVersion: 2 },
      submitPath = `/me/zip-submissions/${draft.id}/submit`;
    const submitted = await request(submitPath, student, submitInput, 'POST', submitKey);
    expect(submitted.status).toBe(200);
    expect(await json<ZipView>(submitted)).toMatchObject({
      status: 'SUBMITTED',
      attemptNumber: 1,
      grade: null,
    });
    const gradePath = `/mentor/zip-submissions/${draft.id}/grade`;
    for (const bad of [
      { expectedVersion: 0, score: '10.01', feedback: 'bad' },
      { expectedVersion: 0, score: '1.234', feedback: 'bad' },
      { expectedVersion: 0, score: '-1', feedback: 'bad' },
      { expectedVersion: 0, score: '8', feedback: 'bad', released: true },
    ])
      expect((await request(gradePath, mentor, bad, 'PUT', randomUUID())).status).toBe(422);
    expect(
      (
        await request(
          gradePath,
          mentor,
          { expectedVersion: 0, score: '8.25', feedback: 'DRAFT_GRADE_CANARY' },
          'PUT',
          randomUUID(),
        )
      ).status,
    ).toBe(200);
    const before = await json<ZipView>(request(`/me/zip-submissions/${draft.id}`, student));
    expect(before.grade).toBeNull();
    expect(JSON.stringify(before)).not.toMatch(/DRAFT_GRADE_CANARY|gradeVersion|releasedVersion/);
    const historyBefore = await json(
      request(`/me/assignments/${assignment.id}/submissions`, student),
    );
    expect(JSON.stringify(historyBefore)).not.toContain('DRAFT_GRADE_CANARY');
    expect(
      (await request(`/me/assignments/${assignment.id}/submissions?status=UNGRADED`, student))
        .status,
    ).toBe(422);
    expect(
      (
        await request(
          `${gradePath}/release`,
          mentor,
          { expectedVersion: 1, gradeVersion: 1 },
          'POST',
          randomUUID(),
        )
      ).status,
    ).toBe(200);
    expect(
      (await json<ZipView>(request(`/me/zip-submissions/${draft.id}`, student))).grade,
    ).toMatchObject({ score: '8.25', feedback: 'DRAFT_GRADE_CANARY' });
    expect(
      await json(request(`/mentor/assignments/${assignment.id}/submissions`, mentor)),
    ).toMatchObject({ total: 1 });
    expect(
      await json(request(`/mentor/assignments/${assignment.id}/roster`, mentor)),
    ).toMatchObject({
      total: 1,
      items: [{ submitted: true, graded: true, released: true, missing: false }],
    });
    expect(
      await json(request(`/mentor/classes/${classId}/assignment-metrics?type=ZIP`, mentor)),
    ).toMatchObject({ submitted: 1, released: 1 });
    const allMetrics = await json<{ submitted: number }>(
      request(`/mentor/classes/${classId}/assignment-metrics`, mentor),
    );
    expect(await json(request(`/mentor/classes/${classId}/progress`, mentor))).toMatchObject({
      assignmentSummary: { availability: 'AVAILABLE', counts: { submitted: allMetrics.submitted } },
    });
    const grades = await json<{ items: unknown[]; audits: unknown[] }>(
      request(`${gradePath}/history`, mentor),
    );
    expect(grades.items).toHaveLength(1);
    expect(grades.audits).toHaveLength(2);
    const signed = await json<{ url: string }>(
      request(`/assignment-files/${intent.fileId}/download`, mentor),
    );
    expect((await fetch(signed.url)).headers.get('content-disposition')).toContain('attachment');
    await new Promise<void>((resolve) => {
      server.once('message', () => resolve());
      server.send({ type: 'assignment-feature', enabled: false });
    });
    expect((await request(draftPath, student, draftInput, 'POST', randomUUID())).status).toBe(503);
    expect((await request(`/me/zip-submissions/${draft.id}`, student)).status).toBe(200);
    expect((await request(`/assignment-files/${intent.fileId}/download`, student)).status).toBe(
      200,
    );
    expect((await request(submitPath, student, submitInput, 'POST', submitKey)).status).toBe(200);
    await new Promise<void>((resolve) => {
      server.once('message', () => resolve());
      server.send({ type: 'assignment-feature', enabled: true });
    });
    const swagger = await json<{
      paths: Record<string, unknown>;
      components: { schemas: Record<string, { properties: Record<string, unknown> }> };
    }>(fetch(`${url.replace('/api/v1', '')}/docs-json`));
    expect(swagger.paths).toHaveProperty('/api/v1/assignment-files/{id}/complete');
    expect(swagger.components.schemas.StudentZipSubmissionDto?.properties).not.toHaveProperty(
      'gradeVersion',
    );
  });
});
