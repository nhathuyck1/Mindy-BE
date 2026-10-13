import { type ChildProcess, fork } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
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
        MINIO_PUBLIC_URL: 'http://127.0.0.1:19000',
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
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3001',
        ...(cookie ? { cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  describe('Phase 3.3.4 Class Unit release HTTP', () => {
    afterAll(async () => {
      await db.query("UPDATE class_units SET status='LOCKED',unlock_at=NULL WHERE id=$1", [
        scope.classUnitId,
      ]);
    });
    const releasePath = () => `/admin/classes/${scope.classId}/units/${scope.classUnitId}/release`;
    const mentorRelease = () =>
      `/mentor/classes/${scope.classId}/units/${scope.classUnitId}/release`;
    it('checks cookie/role/Origin and strict body/path validation', async () => {
      const body = { status: 'OPEN' };
      expect((await request(releasePath(), undefined, body, 'PATCH')).status).toBe(401);
      for (const cookie of [managerCookie, mentorCookie, studentCookie])
        expect((await request(releasePath(), cookie, body, 'PATCH')).status).toBe(403);
      expect((await request(mentorRelease(), adminCookie, body, 'PATCH')).status).toBe(403);
      for (const origin of [undefined, 'http://evil.test', 'null']) {
        const response = await fetch(`${url}${releasePath()}`, {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            cookie: adminCookie,
            ...(origin === undefined ? {} : { origin }),
          },
          body: JSON.stringify(body),
        });
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ code: 'ORIGIN_NOT_ALLOWED' });
      }
      for (const invalid of [
        {},
        { status: 'COMPLETED' },
        { status: null },
        { ...body, expectedRevision: 1 },
        { ...body, unlockAt: '2026-02-30T12:00:00Z' },
        { ...body, unlockAt: '2026-10-13T12:00:00' },
        { ...body, unlockAt: 1 },
      ])
        expect((await request(releasePath(), adminCookie, invalid, 'PATCH')).status).toBe(422);
      expect(
        (await request('/admin/classes/bad/units/bad/release', adminCookie, body, 'PATCH')).status,
      ).toBe(400);
    });
    it('sets/retains/clears schedule, preserves timestamps on retry and returns safe no-store context', async () => {
      const opened = await request(
        releasePath(),
        adminCookie,
        { status: 'OPEN', unlockAt: '2030-01-01T07:00:00+07:00' },
        'PATCH',
      );
      expect(opened.status).toBe(200);
      expect(opened.headers.get('cache-control')).toBe('no-store');
      expect(await opened.json()).toMatchObject({
        id: scope.classUnitId,
        classId: scope.classId,
        courseUnitId: scope.courseUnitId,
        status: 'OPEN',
        unlockAt: '2030-01-01T00:00:00.000Z',
      });
      const before = await db.query('SELECT * FROM class_units WHERE id=$1', [scope.classUnitId]);
      const audits = await db.query(
        'SELECT * FROM class_unit_release_audit WHERE class_unit_id=$1 ORDER BY id',
        [scope.classUnitId],
      );
      expect(
        (
          await request(
            mentorRelease(),
            mentorCookie,
            { status: 'OPEN', unlockAt: '2030-01-01T00:00:00Z' },
            'PATCH',
          )
        ).status,
      ).toBe(200);
      expect(await db.query('SELECT * FROM class_units WHERE id=$1', [scope.classUnitId])).toEqual(
        before,
      );
      expect(
        await db.query(
          'SELECT * FROM class_unit_release_audit WHERE class_unit_id=$1 ORDER BY id',
          [scope.classUnitId],
        ),
      ).toEqual(audits);
      expect(
        await (await request(mentorRelease(), mentorCookie, { status: 'LOCKED' }, 'PATCH')).json(),
      ).toMatchObject({ status: 'LOCKED', unlockAt: '2030-01-01T00:00:00.000Z' });
      const cleared = await request(
        mentorRelease(),
        mentorCookie,
        { status: 'OPEN', unlockAt: null },
        'PATCH',
      );
      expect(cleared.status).toBe(200);
      expect(Object.keys((await cleared.json()) as object).sort()).toEqual([
        'classId',
        'courseUnitId',
        'id',
        'position',
        'status',
        'title',
        'unlockAt',
      ]);
    });
    it('checks unit ancestry and completed/cancelled conflicts', async () => {
      expect(
        (
          await request(
            `/admin/classes/${scope.classId}/units/11111111-1111-4111-8111-111111111111/release`,
            adminCookie,
            { status: 'OPEN' },
            'PATCH',
          )
        ).status,
      ).toBe(404);
      await db.query("UPDATE class_units SET status='COMPLETED' WHERE id=$1", [scope.classUnitId]);
      try {
        const response = await request(releasePath(), adminCookie, { status: 'OPEN' }, 'PATCH');
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ code: 'UNIT_RELEASE_CONFLICT' });
      } finally {
        await db.query("UPDATE class_units SET status='OPEN' WHERE id=$1", [scope.classUnitId]);
      }
      await db.query("UPDATE classes SET status='CANCELLED' WHERE id=$1", [scope.classId]);
      try {
        expect(
          (await request(mentorRelease(), mentorCookie, { status: 'OPEN' }, 'PATCH')).status,
        ).toBe(409);
      } finally {
        await db.query("UPDATE classes SET status='OPEN' WHERE id=$1", [scope.classId]);
      }
    });
    it('publishes both routes with separate roles and release enum in Swagger', async () => {
      const response = await fetch(`${url.replace('/api/v1', '')}/docs-json`);
      expect(response.status).toBe(200);
      const spec = (await response.json()) as {
        paths: Record<string, unknown>;
        components: { schemas: Record<string, { properties: { status: { enum: string[] } } }> };
      };
      expect(spec.paths).toHaveProperty('/api/v1/admin/classes/{classId}/units/{unitId}/release');
      expect(spec.paths).toHaveProperty('/api/v1/mentor/classes/{classId}/units/{unitId}/release');
      expect(spec.components.schemas.UpdateClassUnitReleaseDto?.properties.status.enum).toEqual([
        'LOCKED',
        'OPEN',
      ]);
    });
  });

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
  it('publishes Files Swagger contracts without exposing generic Student file downloads', async () => {
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

  it('documents all three Student material routes and enforces roles/UUID/query validation', async () => {
    const doc = (await (await fetch(url.replace('/api/v1', '/docs-json'))).json()) as {
      paths: Record<string, unknown>;
    };
    for (const path of [
      '/api/v1/me/classes/{classId}/units/{classUnitId}/materials',
      '/api/v1/me/classes/{classId}/materials/{materialId}',
      '/api/v1/me/classes/{classId}/materials/{materialId}/download',
    ])
      expect(doc.paths).toHaveProperty(path);
    const paths = [
      `/me/classes/${scope.classId}/units/${scope.classUnitId}/materials`,
      `/me/classes/${scope.classId}/materials/00000000-0000-4000-8000-000000000000`,
      `/me/classes/${scope.classId}/materials/00000000-0000-4000-8000-000000000000/download`,
    ];
    for (const path of paths) {
      expect((await request(path)).status).toBe(401);
      for (const cookie of [managerCookie, mentorCookie, adminCookie])
        expect((await request(path, cookie)).status).toBe(403);
      expect((await request(path, studentCookie)).status).toBe(403);
    }
    expect(
      (
        await request(
          '/me/classes/not-a-uuid/materials/00000000-0000-4000-8000-000000000000',
          studentCookie,
        )
      ).status,
    ).toBe(400);
    for (const query of ['page=0', 'pageSize=101', 'pageSize=1.5', 'studentId=forged'])
      expect((await request(`${paths[0]}?${query}`, studentCookie)).status).toBe(422);
  });

  it('CASH pending cannot read/download; confirmed student follows list → detail → PDF/MP4 signed GET', async () => {
    await db.query(
      "UPDATE classes SET mentor_id=(SELECT id FROM users WHERE email='mentor@http.test') WHERE id=$1",
      [scope.classId],
    );
    expect(
      (await request('/me/cart/items', studentCookie, { classId: scope.classId })).status,
    ).toBe(201);
    const checkout = await request('/me/cart/checkout', studentCookie, { paymentType: 'CASH' });
    expect(checkout.status).toBe(201);
    const order = ((await checkout.json()) as { orders: { id: string; totalAmount: number }[] })
      .orders[0];
    if (!order) throw new Error('Missing cash order');
    const created = (await db.query(
      `INSERT INTO materials(course_unit_id,file_object_id,content_type,title,created_by,review_status,approved_revision,reviewed_by,reviewed_at,first_approved_at,published_at)
      SELECT course_unit_id,id,CASE WHEN kind='VIDEO' THEN 'VIDEO'::material_content_type_enum ELSE 'FILE'::material_content_type_enum END,original_name,owner_user_id,'APPROVED',1,owner_user_id,now(),now(),now()
      FROM file_objects WHERE status='READY' AND course_unit_id=$1 AND kind IN ('PDF','VIDEO') RETURNING id,content_type`,
      [scope.courseUnitId],
    )) as { id: string; content_type: string }[];
    expect(created).toHaveLength(2);
    for (const material of created)
      expect(
        (
          await request(
            `/me/classes/${scope.classId}/materials/${material.id}/download`,
            studentCookie,
          )
        ).status,
      ).toBe(403);
    expect(
      (
        await request(`/mentor/cash-orders/${order.id}/confirm`, mentorCookie, {
          receivedAmount: order.totalAmount,
        })
      ).status,
    ).toBe(200);
    const path = `/me/classes/${scope.classId}/units/${scope.classUnitId}/materials`;
    expect(await (await request(path, studentCookie)).json()).toMatchObject({
      items: [],
      total: 0,
    });
    await db.query("UPDATE class_units SET status='OPEN' WHERE id=$1", [scope.classUnitId]);
    const listing = await request(`${path}?pageSize=1`, studentCookie);
    expect(listing.status).toBe(200);
    expect(listing.headers.get('cache-control')).toBe('private, no-store');
    expect(await listing.json()).toMatchObject({ page: 1, pageSize: 1, total: 2 });
    for (const material of created) {
      const detail = await request(
        `/me/classes/${scope.classId}/materials/${material.id}`,
        studentCookie,
      );
      expect(detail.status).toBe(200);
      expect(await detail.json()).toMatchObject({
        id: material.id,
        contentType: material.content_type,
      });
      const download = await request(
        `/me/classes/${scope.classId}/materials/${material.id}/download`,
        studentCookie,
      );
      expect(download.status).toBe(200);
      expect(download.headers.get('cache-control')).toBe('private, no-store');
      const signed = (await download.json()) as {
        materialId: string;
        fileId: string;
        url: string;
        expiresAt: string;
      };
      expect(signed.materialId).toBe(material.id);
      expect(new URL(signed.url).searchParams.get('X-Amz-Expires')).toBe('60');
      const range = await fetch(signed.url, { headers: { range: 'bytes=0-7' } });
      expect(range.status).toBe(206);
      expect((await range.arrayBuffer()).byteLength).toBe(8);
      expect(range.headers.get('content-type')).toBe(
        material.content_type === 'VIDEO' ? 'video/mp4' : 'application/pdf',
      );
    }
    await db.query('UPDATE materials SET published_at=NULL WHERE course_unit_id=$1', [
      scope.courseUnitId,
    ]);
    expect(await (await request(path, studentCookie)).json()).toMatchObject({
      items: [],
      total: 0,
    });
    for (const material of created)
      expect(
        (
          await request(
            `/me/classes/${scope.classId}/materials/${material.id}/download`,
            studentCookie,
          )
        ).status,
      ).toBe(404);
  });
  describe('Phase 3.3.1 Manager authoring HTTP', () => {
    const article = {
      contentType: 'ARTICLE',
      title: 'HTTP lesson',
      contentHtml: '<p onclick="bad()">Knowledge</p><script>bad()</script>',
    };
    const unitPath = () => `/manager/course-units/${scope.courseUnitId}/materials`;
    it('enforces roles, mandatory Origin, UUID paths and strict typed DTOs', async () => {
      expect((await request(unitPath(), undefined, article)).status).toBe(401);
      for (const cookie of [adminCookie, studentCookie, mentorCookie])
        expect((await request(unitPath(), cookie, article)).status).toBe(403);
      for (const origin of [undefined, 'null', 'https://evil.test']) {
        const response = await fetch(`${url}${unitPath()}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: managerCookie,
            ...(origin ? { origin } : {}),
          },
          body: JSON.stringify(article),
        });
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ code: 'ORIGIN_NOT_ALLOWED' });
      }
      expect((await request('/manager/materials/invalid', managerCookie)).status).toBe(400);
      for (const input of [
        { ...article, fileId: scope.courseUnitId },
        { ...article, contentSchemaVersion: 2 },
        { ...article, attachmentFileIds: null },
        { ...article, sortOrder: null },
        { ...article, availableAt: '2026-10-13T12:00:00' },
        { ...article, title: '  ' },
        { ...article, contentHtml: '<script>bad()</script>' },
        { ...article, bucket: 'secret' },
        { contentType: 'FILE', title: 'missing primary' },
      ])
        expect((await request(unitPath(), managerCookie, input)).status).toBe(422);
      expect((await request('/manager/materials?pageSize=101', managerCookie)).status).toBe(422);
    });

    it('creates/reads/edits/deletes canonical text-only ARTICLE with no-store and conflict handling', async () => {
      const response = await request(unitPath(), managerCookie, article);
      expect(response.status).toBe(201);
      expect(response.headers.get('cache-control')).toBe('no-store');
      const created = (await response.json()) as { id: string; revision: number };
      expect(created).toMatchObject({
        contentHtml: '<p>Knowledge</p>',
        contentSchemaVersion: 1,
        file: null,
        revision: 1,
        attachments: [],
        inlineImages: [],
      });
      const path = `/manager/materials/${created.id}`;
      const detail = await request(path, managerCookie);
      expect(detail.status).toBe(200);
      const listing = (await (
        await request(`${unitPath()}?pageSize=1&contentType=ARTICLE`, managerCookie)
      ).json()) as { items: unknown[]; total: number };
      expect(listing.total).toBeGreaterThan(0);
      expect(listing.items[0]).not.toHaveProperty('contentHtml');
      const patch = await request(
        path,
        managerCookie,
        { expectedRevision: 1, title: 'Edited' },
        'PATCH',
      );
      expect(patch.status).toBe(200);
      expect(await patch.json()).toMatchObject({
        revision: 2,
        title: 'Edited',
        reviewStatus: 'DRAFT',
        publishedAt: null,
      });
      expect(
        (await request(path, managerCookie, { expectedRevision: 1, title: 'stale' }, 'PATCH'))
          .status,
      ).toBe(409);
      for (const input of [
        { expectedRevision: 2 },
        { expectedRevision: 2, contentType: 'FILE' },
        { expectedRevision: 2, contentSchemaVersion: 1 },
        { title: 'missing revision' },
        { expectedRevision: 2, attachmentFileIds: null },
        { expectedRevision: 2, fileId: null },
        { expectedRevision: 2, contentHtml: null },
      ])
        expect((await request(path, managerCookie, input, 'PATCH')).status).toBe(422);
      for (let retry = 0; retry < 2; retry++)
        expect(
          (await request(`${path}?expectedRevision=2`, managerCookie, undefined, 'DELETE')).status,
        ).toBe(204);
      expect((await request(path, managerCookie)).status).toBe(404);
    });

    it('checks HTML UTF-8 and total JSON body byte limits', async () => {
      expect(
        (await request(unitPath(), managerCookie, { ...article, contentHtml: 'đ'.repeat(25000) }))
          .status,
      ).toBe(413);
      expect(
        (await request(unitPath(), managerCookie, { ...article, contentHtml: 'x'.repeat(70000) }))
          .status,
      ).toBe(413);
    });

    it('attaches real validated MinIO PDF/MP4 as FILE/VIDEO and rejects kind mismatch', async () => {
      const rows = (await db.query(
        "SELECT id,kind FROM file_objects WHERE course_unit_id=$1 AND status='READY' AND kind IN ('PDF','VIDEO') ORDER BY id",
        [scope.courseUnitId],
      )) as { id: string; kind: string }[];
      expect(rows).toHaveLength(2);
      for (const file of rows) {
        const type = file.kind === 'VIDEO' ? 'VIDEO' : 'FILE';
        const response = await request(unitPath(), managerCookie, {
          contentType: type,
          title: 'Ready binary',
          fileId: file.id,
        });
        expect(response.status).toBe(201);
        const result = await response.json();
        expect(result).toMatchObject({
          contentType: type,
          contentHtml: null,
          contentSchemaVersion: null,
          file: { id: file.id, kind: file.kind },
        });
        expect(JSON.stringify(result)).not.toMatch(/bucket|objectKey|staging|signed|uploadUrl/);
        expect(
          (
            await request(unitPath(), managerCookie, {
              contentType: type === 'FILE' ? 'VIDEO' : 'FILE',
              title: 'Wrong kind',
              fileId: file.id,
            })
          ).status,
        ).toBe(422);
      }
      const pdf = rows.find((file) => file.kind === 'PDF');
      const response = await request(unitPath(), managerCookie, {
        ...article,
        attachmentFileIds: [pdf?.id],
      });
      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({ attachments: [{ id: pdf?.id }] });
    });

    it('documents the implemented endpoints and typed schema in Swagger', async () => {
      const response = await fetch(`${url.replace('/api/v1', '')}/docs-json`);
      expect(response.status).toBe(200);
      const schema = (await response.json()) as {
        paths: Record<string, unknown>;
        components: { schemas: Record<string, unknown> };
      };
      expect(schema.paths).toHaveProperty('/api/v1/manager/materials/{materialId}');
      expect(schema.components.schemas).toHaveProperty('ManagerMaterialDetailDto');
    });
  });

  describe('Phase 3.3.2 Mentor context/submission HTTP', () => {
    beforeAll(async () => {
      await db.query(
        "UPDATE classes SET mentor_id=(SELECT id FROM users WHERE email='mentor@http.test') WHERE id=$1",
        [scope.classId],
      );
    });
    const article = {
      contentType: 'ARTICLE',
      title: 'Mentor lesson',
      contentHtml: '<p onclick="bad()">Knowledge</p>',
    };
    const unitPath = () => `/mentor/classes/${scope.classId}/units/${scope.classUnitId}/materials`;
    const itemPath = (id: string) => `/mentor/classes/${scope.classId}/materials/${id}`;

    it('documents all context/content routes, validates roles/Origin/UUID/query/body', async () => {
      const prefix = `/mentor/classes/${scope.classId}`;
      for (const path of [
        `${prefix}/units`,
        `${prefix}/units/${scope.classUnitId}/sessions`,
        unitPath(),
      ]) {
        expect((await request(path)).status).toBe(401);
        for (const cookie of [managerCookie, adminCookie, studentCookie])
          expect((await request(path, cookie)).status).toBe(403);
        expect((await request(`${path}?pageSize=101`, mentorCookie)).status).toBe(422);
      }
      expect((await request('/mentor/classes/invalid/units', mentorCookie)).status).toBe(400);
      for (const input of [
        { ...article, createdBy: scope.classId },
        { ...article, fileId: scope.courseUnitId },
        { ...article, attachmentFileIds: null },
      ])
        expect((await request(unitPath(), mentorCookie, input)).status).toBe(422);
      for (const origin of [undefined, 'null', 'https://evil.test']) {
        const response = await fetch(`${url}${unitPath()}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: mentorCookie,
            ...(origin ? { origin } : {}),
          },
          body: JSON.stringify(article),
        });
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ code: 'ORIGIN_NOT_ALLOWED' });
      }
      expect(
        (await request(unitPath(), mentorCookie, { ...article, contentHtml: 'x'.repeat(70000) }))
          .status,
      ).toBe(413);
      expect(
        (await request(`${unitPath()}?courseUnitId=${scope.courseUnitId}`, mentorCookie)).status,
      ).toBe(422);
      const doc = (await (await fetch(`${url.replace('/api/v1', '')}/docs-json`)).json()) as {
        paths: Record<string, unknown>;
      };
      for (const path of [
        '/api/v1/mentor/classes/{classId}/units',
        '/api/v1/mentor/classes/{classId}/units/{unitId}/sessions',
        '/api/v1/mentor/classes/{classId}/units/{unitId}/materials',
        '/api/v1/mentor/classes/{classId}/materials/{materialId}',
        '/api/v1/mentor/classes/{classId}/materials/{materialId}/submit',
      ])
        expect(doc.paths).toHaveProperty(path);
    });

    it('follows picker → canonical draft → EDIT → SUBMIT/retry; locks pending editing and handles delete retries', async () => {
      const units = await request(`/mentor/classes/${scope.classId}/units`, mentorCookie);
      expect(units.status).toBe(200);
      expect(units.headers.get('cache-control')).toBe('no-store');
      expect(await units.json()).toMatchObject({
        items: [{ id: scope.classUnitId, courseUnitId: scope.courseUnitId }],
      });
      const sessions = await request(
        `/mentor/classes/${scope.classId}/units/${scope.classUnitId}/sessions`,
        mentorCookie,
      );
      expect(sessions.status).toBe(200);
      expect(JSON.stringify(await sessions.json())).not.toMatch(/meetingUrl|roomName|enrollment/);
      const response = await request(unitPath(), mentorCookie, article);
      expect(response.status).toBe(201);
      const created = (await response.json()) as { id: string };
      expect(created).toMatchObject({
        contentHtml: '<p>Knowledge</p>',
        createdInClassId: scope.classId,
        file: null,
        canEdit: true,
        revision: 1,
      });
      const path = itemPath(created.id);
      expect(
        (await request(path, mentorCookie, { title: 'missing revision' }, 'PATCH')).status,
      ).toBe(422);
      expect(
        (await request(`${path}/submit`, mentorCookie, { expectedRevision: null })).status,
      ).toBe(422);
      expect(
        (await request(path, mentorCookie, { expectedRevision: 1, title: 'Edited' }, 'PATCH'))
          .status,
      ).toBe(200);
      expect(
        (await request(path, mentorCookie, { expectedRevision: 1, title: 'stale' }, 'PATCH'))
          .status,
      ).toBe(409);
      const pending = await request(`${path}/submit`, mentorCookie, { expectedRevision: 2 });
      expect(pending.status).toBe(200);
      const result = await pending.json();
      expect(result).toMatchObject({ reviewStatus: 'PENDING_REVIEW', revision: 2, canEdit: false });
      expect(
        await (await request(`${path}/submit`, mentorCookie, { expectedRevision: 2 })).json(),
      ).toEqual(result);
      expect(
        (await request(path, mentorCookie, { expectedRevision: 2, title: 'locked' }, 'PATCH'))
          .status,
      ).toBe(403);
      expect(
        (await request(`${path}?expectedRevision=2`, mentorCookie, undefined, 'DELETE')).status,
      ).toBe(403);
      expect((await request(path, mentorCookie)).status).toBe(200);
      expect((await request(`${path}/submit`, mentorCookie, { expectedRevision: 1 })).status).toBe(
        409,
      );
      expect(
        await db.query('SELECT action FROM material_audit_events WHERE material_id=$1', [
          created.id,
        ]),
      ).toHaveLength(3);
      const another = (await (await request(unitPath(), mentorCookie, article)).json()) as {
        id: string;
      };
      expect((await request(itemPath(another.id), mentorCookie, undefined, 'DELETE')).status).toBe(
        422,
      );
      for (let i = 0; i < 2; i++)
        expect(
          (
            await request(
              `${itemPath(another.id)}?expectedRevision=1`,
              mentorCookie,
              undefined,
              'DELETE',
            )
          ).status,
        ).toBe(204);
      expect((await request(itemPath(another.id), mentorCookie)).status).toBe(404);
    });

    it('uploads own PDF/MP4 to real MinIO, validates READY, creates FILE/VIDEO and submits', async () => {
      const selected = binaries.filter((fixture) =>
        ['application/pdf', 'video/mp4'].includes(fixture.mimeType),
      );
      expect(selected).toHaveLength(2);
      for (const binary of selected) {
        const kind = binary.mimeType === 'video/mp4' ? 'VIDEO' : 'PDF';
        const response = await request('/files/upload-intents', mentorCookie, {
          ...scope,
          originalFilename: binary.filename,
          declaredMimeType: binary.mimeType,
          declaredSizeBytes: binary.bytes.length,
        });
        expect(response.status).toBe(201);
        const intent = (await response.json()) as { fileId: string; uploadUrl: string };
        await upload(intent.uploadUrl, binary.mimeType, binary.bytes);
        expect((await request(`/files/${intent.fileId}/complete`, mentorCookie, {})).status).toBe(
          202,
        );
        await invokeWorker(intent.fileId);
        const createdResponse = await request(unitPath(), mentorCookie, {
          contentType: kind === 'VIDEO' ? 'VIDEO' : 'FILE',
          title: binary.filename,
          fileId: intent.fileId,
        });
        expect(createdResponse.status).toBe(201);
        const created = (await createdResponse.json()) as { id: string };
        expect(created).toMatchObject({ file: { id: intent.fileId, kind } });
        const submit = await request(`${itemPath(created.id)}/submit`, mentorCookie, {
          expectedRevision: 1,
        });
        expect(submit.status).toBe(200);
        expect(await submit.json()).toMatchObject({
          reviewStatus: 'PENDING_REVIEW',
          canEdit: false,
        });
      }
    });

    it('new assigned Mentor cannot see former drafts; revoke/cancel blocks all context/content access', async () => {
      const response = await request(unitPath(), mentorCookie, article);
      expect(response.status).toBe(201);
      const own = (await response.json()) as { id: string };
      expect(
        (
          await request('/admin/users', adminCookie, {
            email: 'second-mentor@http.test',
            displayName: 'Second',
            password: 'Http-test-password1!',
            role: 'MENTOR',
          })
        ).status,
      ).toBe(201);
      const login = await request('/auth/login', undefined, {
        email: 'second-mentor@http.test',
        password: 'Http-test-password1!',
      });
      const secondCookie = login.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; ');
      const original = (await db.query('SELECT mentor_id,status FROM classes WHERE id=$1', [
        scope.classId,
      ])) as { mentor_id: string; status: string }[];
      try {
        await db.query(
          "UPDATE classes SET mentor_id=(SELECT id FROM users WHERE email='second-mentor@http.test') WHERE id=$1",
          [scope.classId],
        );
        expect((await request(itemPath(own.id), secondCookie)).status).toBe(404);
        expect((await request(`${unitPath()}?reviewStatus=DRAFT`, secondCookie)).status).toBe(200);
        expect(
          await (await request(`${unitPath()}?reviewStatus=DRAFT`, secondCookie)).json(),
        ).toMatchObject({ total: 0, items: [] });
        for (const path of [`/mentor/classes/${scope.classId}/units`, unitPath(), itemPath(own.id)])
          expect((await request(path, mentorCookie)).status).toBe(403);
        expect(
          (await request(`${itemPath(own.id)}/submit`, mentorCookie, { expectedRevision: 1 }))
            .status,
        ).toBe(403);
        await db.query("UPDATE classes SET status='CANCELLED' WHERE id=$1", [scope.classId]);
        expect((await request(unitPath(), secondCookie, article)).status).toBe(403);
        expect((await request(`/mentor/classes/${scope.classId}/units`, secondCookie)).status).toBe(
          403,
        );
        expect((await request(`/manager/materials/${own.id}`, managerCookie)).status).toBe(200);
      } finally {
        await db.query('UPDATE classes SET mentor_id=$2,status=$3 WHERE id=$1', [
          scope.classId,
          original[0]?.mentor_id,
          original[0]?.status,
        ]);
      }
    });
  });

  describe('Phase 3.3.5 metadata acceptance and handoff HTTP', () => {
    it('boots all source migrations and keeps Phase33 Postman routes aligned with Swagger', async () => {
      const migrations = readdirSync('src/database/migrations')
        .filter((name) => /^\d+.*\.ts$/.test(name))
        .map((name) => Number(name.split('-')[0]))
        .sort();
      const applied = (await db.query('SELECT timestamp FROM migrations ORDER BY timestamp')) as {
        timestamp: string;
      }[];
      expect(applied.map((row) => Number(row.timestamp)).sort()).toEqual(migrations);
      type Item = {
        item?: Item[];
        request?: { method: string; url: string | { raw: string }; body?: { raw?: string } };
      };
      const collection = JSON.parse(
        readFileSync('postman/Mindy-Materials-Phase33.postman_collection.json', 'utf8'),
      ) as { item: Item[] };
      const document = (await (await fetch(url.replace('/api/v1', '/docs-json'))).json()) as {
        paths: Record<string, Record<string, unknown>>;
      };
      const normalize = (path: string) => path.replace(/\{[^}]+\}/g, '{}');
      const operations = new Set(
        Object.entries(document.paths).flatMap(([path, verbs]) =>
          Object.keys(verbs).map((verb) => `${verb.toUpperCase()} ${normalize(path)}`),
        ),
      );
      let requests = 0;
      function visit(items: Item[]): void {
        for (const item of items) {
          if (item.item) visit(item.item);
          if (!item.request) continue;
          requests++;
          const raw =
            typeof item.request.url === 'string' ? item.request.url : item.request.url.raw;
          const path = raw
            .replace('{{base_url}}', '')
            .split('?')[0]
            ?.replace(/\{\{[^}]+\}\}/g, '{}');
          expect(operations.has(`${item.request.method} ${path}`), raw).toBe(true);
          if (item.request.body?.raw)
            expect(() =>
              JSON.parse((item.request?.body?.raw ?? '').replace(/\{\{[^}]+\}\}/g, '1')),
            ).not.toThrow();
        }
      }
      visit(collection.item);
      expect(requests).toBeGreaterThanOrEqual(34);
    });
    it.each(['ARTICLE', 'FILE', 'VIDEO'] as const)(
      '%s follows real upload → submit → reject/edit → approve → release → withdraw',
      async (contentType) => {
        async function readyFile(extension: string): Promise<string> {
          const binary = binaries.find((item) => item.filename.endsWith(`.${extension}`));
          if (!binary) throw new Error(`Missing ${extension} fixture`);
          const response = await request('/files/upload-intents', mentorCookie, {
            ...scope,
            originalFilename: binary.filename,
            declaredMimeType: binary.mimeType,
            declaredSizeBytes: binary.bytes.length,
          });
          expect(response.status).toBe(201);
          const intent = (await response.json()) as { fileId: string; uploadUrl: string };
          await upload(intent.uploadUrl, binary.mimeType, binary.bytes);
          expect((await request(`/files/${intent.fileId}/complete`, mentorCookie, {})).status).toBe(
            202,
          );
          await invokeWorker(intent.fileId);
          expect(
            await (await request(`/files/${intent.fileId}`, mentorCookie)).json(),
          ).toMatchObject({ status: 'READY' });
          return intent.fileId;
        }
        const fileId = await readyFile(contentType === 'VIDEO' ? 'mp4' : 'pdf');
        const imageId = contentType === 'ARTICLE' ? await readyFile('png') : undefined;
        const createdResponse = await request(
          `/mentor/classes/${scope.classId}/units/${scope.classUnitId}/materials`,
          mentorCookie,
          {
            contentType,
            title: `Acceptance ${contentType}`,
            ...(imageId
              ? {
                  contentHtml: `<p>Lesson</p><img data-file-id="${imageId}">`,
                  attachmentFileIds: [fileId],
                }
              : { fileId }),
          },
        );
        expect(createdResponse.status).toBe(201);
        const created = (await createdResponse.json()) as { id: string };
        const mentorPath = `/mentor/classes/${scope.classId}/materials/${created.id}`;
        const managerPath = `/manager/materials/${created.id}`;
        async function command(path: string, cookie: string, body: unknown, method = 'POST') {
          const response = await request(path, cookie, body, method);
          expect(response.status).toBe(200);
          expect(response.headers.get('cache-control')).toContain('no-store');
          const result: unknown = await response.json();
          expect(JSON.stringify(result)).not.toMatch(
            /objectKey|objectVersion|bucket|uploadUrl|signedUrl|ownerUserId/,
          );
          return result;
        }
        expect(
          await command(`${mentorPath}/submit`, mentorCookie, { expectedRevision: 1 }),
        ).toMatchObject({ reviewStatus: 'PENDING_REVIEW', canEdit: false });
        await command(`${managerPath}/reject`, managerCookie, {
          expectedRevision: 1,
          reason: 'Add examples',
        });
        expect(
          await command(
            mentorPath,
            mentorCookie,
            { expectedRevision: 1, title: 'Lesson with examples' },
            'PATCH',
          ),
        ).toMatchObject({ revision: 2, reviewStatus: 'DRAFT' });
        await command(`${mentorPath}/submit`, mentorCookie, { expectedRevision: 2 });
        const approved = await command(`${managerPath}/approve`, managerCookie, {
          expectedRevision: 2,
        });
        expect(approved).toMatchObject({
          contentType,
          revision: 2,
          approvedRevision: 2,
          reviewStatus: 'APPROVED',
          canEdit: true,
        });
        if (imageId)
          expect(approved).toMatchObject({
            file: null,
            inlineImages: [{ id: imageId }],
            attachments: [{ id: fileId }],
          });
        else expect(approved).toMatchObject({ file: { id: fileId }, contentHtml: null });
        const refs = await db.query(
          'SELECT * FROM material_file_references WHERE material_id=$1 ORDER BY file_id, role',
          [created.id],
        );
        const enrollments = await db.query(
          'SELECT * FROM enrollments WHERE class_id=$1 ORDER BY id',
          [scope.classId],
        );
        const releasePath = `/mentor/classes/${scope.classId}/units/${scope.classUnitId}/release`;
        try {
          await command(releasePath, mentorCookie, { status: 'OPEN', unlockAt: null }, 'PATCH');
          expect(await (await request(managerPath, managerCookie)).json()).toEqual(approved);
          expect(
            await db.query('SELECT * FROM enrollments WHERE class_id=$1 ORDER BY id', [
              scope.classId,
            ]),
          ).toEqual(enrollments);
          const withdrawn = await command(`${managerPath}/unpublish`, managerCookie, {
            expectedRevision: 2,
          });
          expect(withdrawn).toMatchObject({ publishedAt: null, approvedRevision: 2 });
          expect(
            await command(`${managerPath}/approve`, managerCookie, { expectedRevision: 2 }),
          ).toEqual(withdrawn);
          expect(
            await command(`${managerPath}/publish`, managerCookie, { expectedRevision: 2 }),
          ).toMatchObject({ approvedRevision: 2 });
          expect(
            await db.query(
              'SELECT * FROM material_file_references WHERE material_id=$1 ORDER BY file_id, role',
              [created.id],
            ),
          ).toEqual(refs);
          expect(
            await command(
              managerPath,
              managerCookie,
              { expectedRevision: 2, title: 'Next revision' },
              'PATCH',
            ),
          ).toMatchObject({
            revision: 3,
            reviewStatus: 'DRAFT',
            approvedRevision: null,
            publishedAt: null,
          });
          expect(
            (await request(`${managerPath}/publish`, managerCookie, { expectedRevision: 2 }))
              .status,
          ).toBe(409);
        } finally {
          await command(releasePath, mentorCookie, { status: 'LOCKED', unlockAt: null }, 'PATCH');
        }
      },
      30000,
    );
  });
  describe('Phase 3.3.3 Manager review/publication HTTP', () => {
    const commands = ['approve', 'reject', 'publish', 'unpublish'];
    const article = {
      contentType: 'ARTICLE',
      title: 'Review lesson',
      contentHtml: '<p>Knowledge</p>',
    };
    const mentorPath = () =>
      `/mentor/classes/${scope.classId}/units/${scope.classUnitId}/materials`;
    const managerPath = (id: string) => `/manager/materials/${id}`;
    async function pending() {
      const response = await request(mentorPath(), mentorCookie, article);
      expect(response.status).toBe(201);
      const created = (await response.json()) as { id: string };
      expect(
        (
          await request(
            `/mentor/classes/${scope.classId}/materials/${created.id}/submit`,
            mentorCookie,
            { expectedRevision: 1 },
          )
        ).status,
      ).toBe(200);
      return created.id;
    }

    it('documents commands and enforces cookie role, Origin, UUID and strict revision/reason validation', async () => {
      const id = await pending();
      const doc = (await (await fetch(`${url.replace('/api/v1', '')}/docs-json`)).json()) as {
        paths: Record<string, { post: { responses: Record<string, unknown> } }>;
      };
      for (const command of commands) {
        expect(
          doc.paths[`/api/v1/manager/materials/{materialId}/${command}`]?.post.responses,
        ).toHaveProperty('200');
        const path = `${managerPath(id)}/${command}`;
        const valid = {
          expectedRevision: 1,
          ...(command === 'reject' ? { reason: 'Examples' } : {}),
        };
        expect((await request(path, undefined, valid)).status).toBe(401);
        for (const cookie of [mentorCookie, studentCookie, adminCookie])
          expect((await request(path, cookie, valid)).status).toBe(403);
        for (const origin of [undefined, 'https://evil.test'])
          expect(
            (
              await fetch(`${url}${path}`, {
                method: 'POST',
                headers: {
                  'content-type': 'application/json',
                  cookie: managerCookie,
                  ...(origin ? { origin } : {}),
                },
                body: JSON.stringify(valid),
              })
            ).status,
          ).toBe(403);
        for (const expectedRevision of [undefined, null, '1', 0, 1.5, 2147483648])
          expect((await request(path, managerCookie, { ...valid, expectedRevision })).status).toBe(
            422,
          );
        expect((await request(path, managerCookie, { ...valid, action: 'DELETE' })).status).toBe(
          422,
        );
        expect(
          (await request(`/manager/materials/not-a-uuid/${command}`, managerCookie, valid)).status,
        ).toBe(400);
        expect(
          (
            await request(
              `/manager/materials/00000000-0000-4000-8000-000000000000/${command}`,
              managerCookie,
              valid,
            )
          ).status,
        ).toBe(404);
      }
      for (const reason of [undefined, null, '', '   ', 42, 'x'.repeat(2001)])
        expect(
          (
            await request(`${managerPath(id)}/reject`, managerCookie, {
              expectedRevision: 1,
              reason,
            })
          ).status,
        ).toBe(422);
    });

    it('queue → reject/retry → Mentor edit/resubmit → approve; safe detail and publication retries', async () => {
      const id = await pending();
      const queue = await request(
        `/manager/materials?courseUnitId=${scope.courseUnitId}&reviewStatus=PENDING_REVIEW&contentType=ARTICLE`,
        managerCookie,
      );
      expect(queue.headers.get('cache-control')).toBe('no-store');
      const queued = (await queue.json()) as { items: { id: string }[] };
      expect(queued.items.some((item) => item.id === id)).toBe(true);
      expect(queued.items[0]).not.toHaveProperty('contentHtml');
      const reject = () =>
        request(`${managerPath(id)}/reject`, managerCookie, {
          expectedRevision: 1,
          reason: '  Add examples  ',
        });
      const response = await reject();
      expect(response.status).toBe(200);
      const rejected = await response.json();
      expect(rejected).toMatchObject({
        reviewStatus: 'REJECTED',
        rejectionReason: 'Add examples',
        revision: 1,
      });
      expect(await (await reject()).json()).toEqual(rejected);
      expect(
        (
          await request(`${managerPath(id)}/reject`, managerCookie, {
            expectedRevision: 1,
            reason: 'Different',
          })
        ).status,
      ).toBe(409);
      const item = `/mentor/classes/${scope.classId}/materials/${id}`;
      expect(
        (await request(item, mentorCookie, { expectedRevision: 1, title: 'Examples' }, 'PATCH'))
          .status,
      ).toBe(200);
      expect((await request(`${item}/submit`, mentorCookie, { expectedRevision: 2 })).status).toBe(
        200,
      );
      expect(
        (await request(`${managerPath(id)}/approve`, managerCookie, { expectedRevision: 1 }))
          .status,
      ).toBe(409);
      const approval = await request(`${managerPath(id)}/approve`, managerCookie, {
        expectedRevision: 2,
      });
      expect(approval.status).toBe(200);
      expect(approval.headers.get('cache-control')).toBe('no-store');
      const approved = await approval.json();
      expect(approved).toMatchObject({
        reviewStatus: 'APPROVED',
        revision: 2,
        approvedRevision: 2,
        contentHtml: '<p>Knowledge</p>',
        canEdit: true,
        file: null,
        inlineImages: [],
        attachments: [],
      });
      expect(JSON.stringify(approved)).not.toMatch(/bucket|objectKey|signed|ownerUserId/);
      expect(await (await request(item, mentorCookie)).json()).toMatchObject({ canEdit: false });
      const hidden = await (
        await request(`${managerPath(id)}/unpublish`, managerCookie, { expectedRevision: 2 })
      ).json();
      expect(hidden).toMatchObject({ publishedAt: null, approvedRevision: 2 });
      expect(
        await (
          await request(`${managerPath(id)}/approve`, managerCookie, { expectedRevision: 2 })
        ).json(),
      ).toEqual(hidden);
      expect(
        await (
          await request(`${managerPath(id)}/unpublish`, managerCookie, { expectedRevision: 2 })
        ).json(),
      ).toEqual(hidden);
      const published = await (
        await request(`${managerPath(id)}/publish`, managerCookie, { expectedRevision: 2 })
      ).json();
      expect(published).toMatchObject({ reviewStatus: 'APPROVED', approvedRevision: 2 });
      expect(
        await (
          await request(`${managerPath(id)}/publish`, managerCookie, { expectedRevision: 2 })
        ).json(),
      ).toEqual(published);
      const changed = await request(
        managerPath(id),
        managerCookie,
        { expectedRevision: 2, title: 'Examples' },
        'PATCH',
      );
      expect(await changed.json()).toMatchObject({
        revision: 3,
        reviewStatus: 'DRAFT',
        publishedAt: null,
        approvedRevision: null,
      });
      expect((await request(`${item}/submit`, mentorCookie, { expectedRevision: 3 })).status).toBe(
        403,
      );
      expect(
        (await request(`${managerPath(id)}/approve`, managerCookie, { expectedRevision: 3 }))
          .status,
      ).toBe(200);
    });

    it('reviews validated real MinIO PDF/MP4 without signing URLs or changing reference rows', async () => {
      const rows = (await db.query(
        "SELECT id,kind FROM file_objects WHERE status='READY' AND kind IN ('PDF','VIDEO') AND course_unit_id=$1 ORDER BY kind",
        [scope.courseUnitId],
      )) as { id: string; kind: string }[];
      for (const kind of ['PDF', 'VIDEO']) {
        const file = rows.find((row) => row.kind === kind);
        if (!file) throw new Error(`Missing validated ${kind}`);
        const created = await request(
          `/manager/course-units/${scope.courseUnitId}/materials`,
          managerCookie,
          {
            contentType: kind === 'VIDEO' ? 'VIDEO' : 'FILE',
            title: 'Binary review',
            fileId: file.id,
          },
        );
        expect(created.status).toBe(201);
        const data = (await created.json()) as { id: string };
        const response = await request(`${managerPath(data.id)}/approve`, managerCookie, {
          expectedRevision: 1,
        });
        expect(response.status).toBe(200);
        const approved = await response.json();
        expect(approved).toMatchObject({ reviewStatus: 'APPROVED', file: { id: file.id } });
        expect(JSON.stringify(approved)).not.toMatch(/bucket|objectKey|signed|ownerUserId/);
      }
    });

    it('decision races return a single winner and reject decisions on deleted materials', async () => {
      const id = await pending();
      const responses = await Promise.all([
        request(`${managerPath(id)}/approve`, managerCookie, { expectedRevision: 1 }),
        request(`${managerPath(id)}/reject`, managerCookie, {
          expectedRevision: 1,
          reason: 'Needs work',
        }),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
      expect(
        (await request(`${managerPath(id)}?expectedRevision=1`, managerCookie, undefined, 'DELETE'))
          .status,
      ).toBe(204);
      for (const command of commands)
        expect(
          (
            await request(`${managerPath(id)}/${command}`, managerCookie, {
              expectedRevision: 1,
              ...(command === 'reject' ? { reason: 'No' } : {}),
            })
          ).status,
        ).toBe(404);
    });
  });
});
