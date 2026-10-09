import { type ChildProcess, fork } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type BinaryFixture,
  binaryFixtures,
  fileConfig,
  storageFixture,
  upload,
} from '../helpers/files-fixture.js';
import { separateTestUrl } from '../helpers/payment-fixture.js';

describe('Phase 3.2 built-app HTTP + real MinIO', () => {
  let server: ChildProcess;
  let remote: Awaited<ReturnType<typeof storageFixture>>;
  let db: DataSource;
  let url: string;
  let managerCookie: string;
  let mentorCookie: string;
  let adminCookie: string;
  let studentCookie: string;
  let scope: { courseUnitId: string; classId: string; classUnitId: string };
  let output = '';
  let binaries: BinaryFixture[];
  const bytes = Buffer.from('Source text need not compile or parse JSON.');
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL)
      throw new Error('Files HTTP tests require TEST_DATABASE_URL + compose.files-test.yaml');
    const config = fileConfig();
    remote = await storageFixture(config);
    const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const databaseUrl = separateTestUrl('files_http');
    server = fork('test/http/payment-server.mjs', [], {
      execArgv: [],
      silent: true,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL: databaseUrl,
        DATABASE_LOGGING: 'false',
        COOKIE_SECURE: 'false',
        CORS_ORIGINS: 'http://localhost:3001',
        SWAGGER_ENABLED: 'true',
        GOOGLE_AUTH_ENABLED: 'false',
        MAIL_ENABLED: 'false',
        JWT_PRIVATE_KEY_BASE64: Buffer.from(
          keys.privateKey.export({ type: 'pkcs8', format: 'pem' }),
        ).toString('base64'),
        JWT_PUBLIC_KEY_BASE64: Buffer.from(
          keys.publicKey.export({ type: 'spki', format: 'pem' }),
        ).toString('base64'),
        ORDER_EXPIRY_JOB_ENABLED: 'false',
        PAYMENT_MAIL_JOB_ENABLED: 'false',
        PAYOS_ENABLED: 'false',
        MINIO_ENABLED: 'true',
        MINIO_ENDPOINT: '127.0.0.1',
        MINIO_PORT: '19000',
        MINIO_USE_SSL: 'false',
        MINIO_ACCESS_KEY: 'mindy-files-test',
        MINIO_SECRET_KEY: 'mindy-files-test-only-password',
        MINIO_BUCKET: config.getOrThrow<string>('MINIO_BUCKET'),
        FILE_JOB_ENABLED: 'false',
      },
    });
    server.stdout?.on('data', (chunk) => {
      output += String(chunk);
    });
    server.stderr?.on('data', (chunk) => {
      output += String(chunk);
    });
    const ready = await new Promise<{
      url: string;
      classId: string;
      classUnitId: string;
      courseUnitId: string;
    }>((resolve, reject) => {
      server.once('message', (message) =>
        resolve(
          message as { url: string; classId: string; classUnitId: string; courseUnitId: string },
        ),
      );
      server.once('exit', (code) => reject(new Error(`HTTP fixture exited ${code}: ${output}`)));
      server.once('error', reject);
    });
    url = `${ready.url}/api/v1`;
    scope = {
      classId: ready.classId,
      classUnitId: ready.classUnitId,
      courseUnitId: ready.courseUnitId,
    };
    const login = async (email: string) => {
      const response = await fetch(`${url}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'Http-test-password1!' }),
      });
      expect(response.status, output).toBe(200);
      return response.headers
        .getSetCookie()
        .map((c) => c.split(';')[0])
        .join('; ');
    };
    adminCookie = await login('admin@http.test');
    mentorCookie = await login('mentor@http.test');
    studentCookie = await login('student@http.test');
    expect(
      (
        await request('/admin/users', adminCookie, {
          email: 'files-manager@http.test',
          displayName: 'Files Manager',
          password: 'Http-test-password1!',
          role: 'MANAGER',
        })
      ).status,
    ).toBe(201);
    managerCookie = await login('files-manager@http.test');
    db = new DataSource({ type: 'postgres', url: databaseUrl });
    await db.initialize();
    binaries = await binaryFixtures();
  }, 60000);
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
    if (remote) await remote.cleanup();
  }, 30000);
  function request(
    path: string,
    cookie?: string,
    body?: unknown,
    method = body === undefined ? 'GET' : 'POST',
  ) {
    return fetch(`${url}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  function declaration() {
    return {
      ...scope,
      originalFilename: 'source.ts',
      declaredMimeType: 'text/plain',
      declaredSizeBytes: bytes.length,
    };
  }
  async function invokeWorker(fileId: string) {
    const processed = new Promise<{ processed: string | null }>((resolve) =>
      server.once('message', (message) => resolve(message as { processed: string | null })),
    );
    server.send('files-process');
    expect((await processed).processed).toBe(fileId);
  }
  it('enforces cookie roles, DTO fields and UUID v4', async () => {
    expect((await request('/files/upload-intents', undefined, declaration())).status).toBe(401);
    for (const cookie of [adminCookie, studentCookie])
      expect((await request('/files/upload-intents', cookie, declaration())).status).toBe(403);
    expect(
      (
        await request('/files/upload-intents', managerCookie, {
          ...declaration(),
          bucket: 'chosen-by-client',
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await request('/files/upload-intents', managerCookie, {
          ...declaration(),
          declaredSizeBytes: 1.5,
        })
      ).status,
    ).toBe(422);
    expect((await request('/files/not-a-uuid', managerCookie)).status).toBe(422);
  });
  it('uploads as assigned Mentor, runs bounded compiled validation and exposes safe READY status', async () => {
    const response = await request('/files/upload-intents', mentorCookie, declaration());
    expect(response.status, output).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const intent = (await response.json()) as {
      fileId: string;
      uploadUrl: string;
      requiredHeaders: Record<string, string>;
    };
    expect(intent.requiredHeaders).toEqual({ 'content-type': 'text/plain' });
    await upload(intent.uploadUrl, 'text/plain', bytes);
    expect(
      (
        await request(`/files/${intent.fileId}/complete`, mentorCookie, {
          checksum: 'trusted-client',
        })
      ).status,
    ).toBe(422);
    expect((await request(`/files/${intent.fileId}/complete`, mentorCookie, {})).status).toBe(202);
    await invokeWorker(intent.fileId);
    const ready = await request(`/files/${intent.fileId}`, mentorCookie);
    expect(ready.status).toBe(200);
    expect(ready.headers.get('cache-control')).toBe('no-store');
    const status = await ready.json();
    expect(status).toMatchObject({
      status: 'READY',
      sizeBytes: bytes.length,
      metadataStatus: 'PENDING',
    });
    expect(JSON.stringify(status)).not.toMatch(
      /staging\/|final\/|objectKey|objectVersion|uploadUrl/,
    );
    expect((await request(`/files/${intent.fileId}/complete`, managerCookie, {})).status).toBe(200);
  });
  it('rejects unknown JSON fields and paired class context mismatch consistently with 3.1', async () => {
    const missing = await request('/files/upload-intents', mentorCookie, {
      ...declaration(),
      classUnitId: undefined,
    });
    expect(missing.status).toBe(422);
    const missingRole = await request('/files/upload-intents', mentorCookie, {
      courseUnitId: scope.courseUnitId,
      originalFilename: 'x.txt',
      declaredMimeType: 'text/plain',
      declaredSizeBytes: 1,
    });
    expect(missingRole.status).toBe(403);
  });
  it('puts spoofed PDFs into FAILED and refuses complete retries', async () => {
    const response = await request('/files/upload-intents', managerCookie, {
      courseUnitId: scope.courseUnitId,
      originalFilename: 'bad.pdf',
      declaredMimeType: 'application/pdf',
      declaredSizeBytes: bytes.length,
    });
    expect(response.status).toBe(201);
    const intent = (await response.json()) as { fileId: string; uploadUrl: string };
    await upload(intent.uploadUrl, 'application/pdf', bytes);
    expect((await request(`/files/${intent.fileId}/complete`, managerCookie, {})).status).toBe(202);
    await invokeWorker(intent.fileId);
    expect(await (await request(`/files/${intent.fileId}`, managerCookie)).json()).toMatchObject({
      status: 'FAILED',
      errorCode: 'FILE_BINARY_INVALID',
    });
    expect((await request(`/files/${intent.fileId}/complete`, managerCookie, {})).status).toBe(409);
  });
  it('revokes Mentor access after reassignment and keeps Manager takeover', async () => {
    const response = await request('/files/upload-intents', mentorCookie, declaration());
    const intent = (await response.json()) as { fileId: string };
    const managers = (await db.query(
      "SELECT id FROM users WHERE email='files-manager@http.test'",
    )) as { id: string }[];
    const manager = managers[0];
    if (!manager) throw new Error('Missing files Manager fixture');
    await db.query('UPDATE classes SET mentor_id=$1 WHERE id=$2', [manager.id, scope.classId]);
    expect((await request(`/files/${intent.fileId}`, mentorCookie)).status).toBe(403);
    expect((await request(`/files/${intent.fileId}`, managerCookie)).status).toBe(200);
  });
  it('publishes Swagger contracts without introducing Student download routes', async () => {
    const document = (await (await fetch(url.replace('/api/v1', '/docs-json'))).json()) as {
      paths: Record<string, unknown>;
    };
    expect(document.paths).toHaveProperty('/api/v1/files/upload-intents');
    expect(document.paths).toHaveProperty('/api/v1/files/{fileId}/complete');
    expect(
      (await request('/files/00000000-0000-4000-8000-000000000000/download', studentCookie, {}))
        .status,
    ).toBe(404);
  });
  it.each(['pdf', 'png', 'jpg', 'docx', 'pptx', 'xlsx', 'mp3', 'mp4'])(
    'validates .%s using the built isolated parser process',
    async (extension) => {
      const binary = binaries.find((b) => b.filename.endsWith(`.${extension}`));
      if (!binary) throw new Error('Missing binary fixture');
      const response = await request('/files/upload-intents', managerCookie, {
        courseUnitId: scope.courseUnitId,
        originalFilename: binary.filename,
        declaredMimeType: binary.mimeType,
        declaredSizeBytes: binary.bytes.length,
      });
      expect(response.status).toBe(201);
      const intent = (await response.json()) as { fileId: string; uploadUrl: string };
      await upload(intent.uploadUrl, binary.mimeType, binary.bytes);
      expect((await request(`/files/${intent.fileId}/complete`, managerCookie, {})).status).toBe(
        202,
      );
      await invokeWorker(intent.fileId);
      expect(await (await request(`/files/${intent.fileId}`, managerCookie)).json()).toMatchObject({
        status: 'READY',
        mimeType: binary.mimeType,
        sizeBytes: binary.bytes.length,
      });
    },
  );
});
