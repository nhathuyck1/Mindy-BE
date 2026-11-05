import { type ChildProcess, fork } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { separateTestUrl } from '../helpers/payment-fixture.js';

const RUNNER_TOKEN = 'phase7-http-runner-token-0123456789abcdef';
// Opt in to real Docker judging locally; the default suite keeps its isolated fake runner.
const realRunnerUrl = process.env.TEST_CODE_RUNNER_URL;
const runnerToken = realRunnerUrl ? process.env.TEST_CODE_RUNNER_TOKEN : RUNNER_TOKEN;
if (realRunnerUrl && (!runnerToken || runnerToken.length < 32))
  throw new Error('TEST_CODE_RUNNER_TOKEN (>=32 characters) is required with TEST_CODE_RUNNER_URL');
const solution = `function twoSum(nums, target) {
  for (let i = 0; i < nums.length; i++)
    for (let j = i + 1; j < nums.length; j++)
      if (nums[i] + nums[j] === target) return [i, j];
  return [];
}`;

function twoSum(args: unknown[]): number[] {
  const [nums, target] = args as [number[], number];
  for (let i = 0; i < nums.length; i++)
    for (let j = i + 1; j < nums.length; j++) if (nums[i]! + nums[j]! === target) return [i, j];
  return [];
}

/** Fake compiler-runner v2: checks the bearer token and answers like the real driver output. */
function fakeRunner(seen: { auth: string[] }): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => {
      body += String(c);
    });
    req.on('end', () => {
      seen.auth.push(req.headers.authorization ?? '');
      if (req.headers.authorization !== `Bearer ${RUNNER_TOKEN}`) {
        res.writeHead(401).end();
        return;
      }
      const request = JSON.parse(body) as {
        executionId: string;
        language: string;
        source: string;
        tests: { id: string; stdin: string }[];
      };
      const nonce = /MINDY:([a-f0-9]{16,64}):/.exec(request.source)?.[1] ?? '';
      const wrong = request.source.includes('WRONG');
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          executionId: request.executionId,
          language: request.language,
          runtimeVersion: 'Node.js 22 (fake)',
          compile: { status: 'OK', output: '' },
          tests: request.tests.map((t) => ({
            id: t.id,
            status: 'OK',
            stdout: `log\n\u001eMINDY:${nonce}:${JSON.stringify(wrong ? [9, 9] : twoSum(JSON.parse(t.stdin)))}\n`,
            stderr: '',
            exitCode: 0,
            timeMs: 3,
            memoryKb: 1000,
          })),
          durationMs: 5,
        }),
      );
    });
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }),
    ),
  );
}

async function json<T>(response: Response | Promise<Response>): Promise<T> {
  return (await (await response).json()) as T;
}

describe.skipIf(!separateTestUrl('phase7_http'))('Phase 7 compiled CODE assignment HTTP', () => {
  let server: ChildProcess,
    runner: Server,
    db: DataSource,
    url: string,
    classId: string,
    sessionId: string;
  let mentor: string, student: string, other: string;
  const seen = { auth: [] as string[] };
  beforeAll(async () => {
    const fake = realRunnerUrl ? null : await fakeRunner(seen);
    if (fake) runner = fake.server;
    const dbUrl = separateTestUrl('phase7_http'),
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
        CODE_RUNNER_URL: realRunnerUrl ?? fake?.url,
        CODE_RUNNER_TOKEN: runnerToken,
        CODE_JUDGE_JOB_ENABLED: 'true',
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
    expect((await request('/me/cart/items', student, { classId })).status).toBe(201);
    expect((await request('/me/cart/checkout', student, { paymentType: 'CASH' })).status).toBe(201);
    // CODE tests start at a settled enrollment; payment behaviour has its own HTTP suites.
    await db.query(
      "UPDATE enrollments SET status='ACTIVE',enrolled_at=clock_timestamp() WHERE class_id=$1",
      [classId],
    );
  }, 45000);
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
    runner?.close();
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

  it('authors, validates through the runner, publishes, judges and reviews a CODE assignment', async () => {
    const create = `/mentor/class-sessions/${sessionId}/assignments`;
    const body = {
      purpose: 'HOMEWORK',
      type: 'CODE',
      title: 'Two Sum',
      maxScore: '10.00',
      maxAttempts: 3,
      dueAt: new Date(Date.now() + 5 * 86400000).toISOString(),
    };
    expect((await request(create, undefined, body)).status).toBe(401);
    expect((await request(create, student, body)).status).toBe(403);
    expect(
      (await request(create, mentor, body, 'POST', undefined, 'https://evil.test')).status,
    ).toBe(403);
    const created = await request(create, mentor, body);
    expect(created.status).toBe(201);
    let a = await json<{ id: string; revision: number }>(created);
    type Authoring = { assignment: { revision: number }; publishBlockers: string[] };
    const put = async (path: string, payload: Record<string, unknown>) => {
      const res = await request(
        `/mentor/assignments/${a.id}${path}`,
        mentor,
        { expectedRevision: a.revision, ...payload },
        'PUT',
      );
      expect(res.status, path).toBe(200);
      const dto = await json<Authoring>(res);
      a = { ...a, revision: dto.assignment.revision };
      return dto;
    };
    await put('/code-problem', {
      statementMd: 'Two Sum',
      signature: {
        functionName: 'twoSum',
        params: [
          { name: 'nums', type: 'int[]' },
          { name: 'target', type: 'int' },
        ],
        returnType: 'int[]',
      },
      compareMode: 'EXACT',
      scoringMode: 'PER_TEST',
      cpuTimeLimitMs: 2000,
      memoryLimitMb: 256,
    });
    await put('/code-languages', { languages: [{ languageKey: 'javascript' }] });
    await put('/code-tests/1', {
      visibility: 'SAMPLE',
      inputArgs: [[2, 7, 11, 15], 9],
      expected: [0, 1],
    });
    await put('/code-tests/2', {
      visibility: 'HIDDEN',
      inputArgs: [[3, 2, 4], 6],
      expected: [1, 2],
      weight: 3,
    });
    // Larger than the 64kb default but within the 256kb CODE limit: business validation answers, not 413.
    const big = await request(
      `/mentor/assignments/${a.id}/code-reference/javascript`,
      mentor,
      { expectedRevision: a.revision, sourceCode: 'x'.repeat(100_000) },
      'PUT',
    );
    expect(big.status).toBe(422);
    const ref = await put('/code-reference/javascript', {
      sourceCode: solution,
    });
    expect(ref.publishBlockers).toEqual(['CODE_REFERENCE_NOT_VALIDATED']);
    const validated = await request(`/mentor/assignments/${a.id}/code-validate`, mentor, {
      expectedRevision: a.revision,
    });
    expect(await json<{ validated: boolean }>(validated)).toMatchObject({ validated: true });
    if (!realRunnerUrl) {
      expect(seen.auth.length).toBeGreaterThan(0);
      expect(seen.auth.every((h) => h === `Bearer ${RUNNER_TOKEN}`)).toBe(true);
    }
    const published = await request(`/mentor/assignments/${a.id}/publish`, mentor, {
      expectedRevision: a.revision,
    });
    expect(published.status).toBe(200);

    const view = await json<{ samples: unknown[]; hiddenTestCount: number }>(
      request(`/me/assignments/${a.id}/code`, student),
    );
    expect(view).toMatchObject({ hiddenTestCount: 1 });
    expect(JSON.stringify(view)).not.toContain('[3,2,4]');
    expect((await request(`/me/assignments/${a.id}/code`, other)).status).toBe(404);
    const run = await request(`/me/assignments/${a.id}/code-runs`, student, {
      languageKey: 'javascript',
      sourceCode: solution,
    });
    expect(await json<{ tests: { status: string }[] }>(run)).toMatchObject({
      tests: [{ status: 'PASSED' }],
    });

    const submitPath = `/me/assignments/${a.id}/code-submissions`;
    expect(
      (await request(submitPath, student, { languageKey: 'javascript', sourceCode: solution }))
        .status,
    ).toBe(422);
    const key = randomUUID();
    const first = await request(
      submitPath,
      student,
      { languageKey: 'javascript', sourceCode: solution },
      'POST',
      key,
    );
    expect(first.status).toBe(202);
    const submission = await json<{ id: string }>(first);
    const replay = await request(
      submitPath,
      student,
      { languageKey: 'javascript', sourceCode: solution },
      'POST',
      key,
    );
    expect(replay.status).toBe(200);
    expect((await json<{ id: string }>(replay)).id).toBe(submission.id);

    let detail = { status: 'QUEUED' } as { status: string; score?: string; tests?: unknown[] };
    for (let i = 0; i < 40 && (detail.status === 'QUEUED' || detail.status === 'RUNNING'); i++) {
      await new Promise((r) => setTimeout(r, 250));
      detail = await json(request(`/me/code-submissions/${submission.id}`, student));
    }
    expect(detail).toMatchObject({ status: 'GRADED', verdict: 'ACCEPTED', score: '10.00' });
    expect((await request(`/me/code-submissions/${submission.id}`, other)).status).toBe(404);

    const summary = await json<{ totals: { submitted: number; accepted: number } }>(
      request(`/mentor/assignments/${a.id}/code-summary`, mentor),
    );
    expect(summary.totals).toMatchObject({ submitted: 1, accepted: 1 });
    expect((await request(`/mentor/assignments/${a.id}/code-summary`, student)).status).toBe(403);
    const mentorDetail = await json<{ mentorTests: { inputArgs: unknown }[] }>(
      request(`/mentor/code-submissions/${submission.id}`, mentor),
    );
    expect(mentorDetail.mentorTests[1]?.inputArgs).toEqual([[3, 2, 4], 6]);
    const voided = await request(`/mentor/code-submissions/${submission.id}/void`, mentor, {
      reason: 'Kiểm tra',
    });
    expect(await json<{ status: string }>(voided)).toMatchObject({ status: 'VOIDED' });
    expect(
      await json<{ attemptsUsed: number; bestScore: string | null }>(
        request(`/me/assignments/${a.id}/code`, student),
      ),
    ).toMatchObject({ attemptsUsed: 1, bestScore: null });
  }, 60000);
});
