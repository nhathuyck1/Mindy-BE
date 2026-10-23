import { type ChildProcess, fork } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AssignmentDto,
  QuizAttemptDto,
} from '../../src/modules/assignments/dtos/assignment.dto.js';
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
  beforeAll(async () => {
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
});
