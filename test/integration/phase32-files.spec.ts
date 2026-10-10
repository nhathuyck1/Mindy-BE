import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { GetObjectCommand, PutBucketVersioningCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CoursesService } from '../../src/modules/catalog/services/courses.service.js';
import { ClassEntity } from '../../src/modules/classes/entities/class.entity.js';
import { ClassUnitEntity } from '../../src/modules/classes/entities/class-unit.entity.js';
import { ClassContentContextService } from '../../src/modules/classes/services/class-content-context.service.js';
import { FileMetadataEntity } from '../../src/modules/files/entities/file-metadata.entity.js';
import { FileObjectEntity } from '../../src/modules/files/entities/file-object.entity.js';
import { FileProcessingJobEntity } from '../../src/modules/files/entities/file-processing-job.entity.js';
import { BinaryValidationError } from '../../src/modules/files/exceptions/file.exceptions.js';
import { FileProcessingService } from '../../src/modules/files/services/file-processing.service.js';
import { FileUploadPolicyService } from '../../src/modules/files/services/file-upload-policy.service.js';
import { FilesService } from '../../src/modules/files/services/files.service.js';
import { validateBinary } from '../../src/modules/files/validation/binary-validation.js';
import { UserEntity } from '../../src/modules/users/user.entity.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import { UserStatus } from '../../src/modules/users/user-status.enum.js';
import {
  type BinaryFixture,
  binaryFixtures,
  fileConfig,
  fileDatabase,
  storageFixture,
  upload,
  zipBuffer,
} from '../helpers/files-fixture.js';
import { paymentFixture } from '../helpers/payment-fixture.js';

describe('Phase 3.2 PostgreSQL + private versioned MinIO', () => {
  let db: DataSource;
  let fixture: ReturnType<typeof paymentFixture>;
  let config: ConfigService;
  let remote: Awaited<ReturnType<typeof storageFixture>>;
  let files: FilesService;
  let worker: FileProcessingService;
  let binaries: BinaryFixture[];
  let actor: { userId: string; role: UserRole; sessionId: string };
  let mentor: typeof actor;
  let scope: { courseUnitId: string; classId: string; classUnitId: string };
  let policy: FileUploadPolicyService;
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL)
      throw new Error(
        'Set TEST_DATABASE_URL to a dedicated _test DB; start compose.files-test.yaml',
      );
    db = await fileDatabase();
    fixture = paymentFixture(db);
    config = fileConfig();
    remote = await storageFixture(config);
    policy = new FileUploadPolicyService(
      fixture.users,
      new CoursesService(db),
      new ClassContentContextService(db),
    );
    files = new FilesService(db, config, policy, remote.storage);
    worker = new FileProcessingService(db, config, remote.storage, { validate: validateBinary });
    const order = await fixture.order();
    const classId = order.classIds[0];
    if (!classId) throw new Error('Missing test Class');
    const unit = await db.getRepository(ClassUnitEntity).findOneByOrFail({ classId });
    scope = { classId, classUnitId: unit.id, courseUnitId: unit.courseUnitId };
    const manager = await fixture.user(UserRole.MANAGER);
    actor = { userId: manager.id, role: manager.role, sessionId: randomUUID() };
    mentor = { userId: order.mentor.id, role: UserRole.MENTOR, sessionId: randomUUID() };
    binaries = await binaryFixtures();
  }, 60000);
  afterAll(async () => {
    if (remote) await remote.cleanup();
    if (db?.isInitialized) await db.destroy();
  }, 30000);
  async function intent(binary: BinaryFixture, principal = actor) {
    return files.createIntent(principal, {
      ...scope,
      originalFilename: binary.filename,
      declaredMimeType: binary.mimeType,
      declaredSizeBytes: binary.bytes.length,
    });
  }
  async function runFile(id: string) {
    const claim = await worker.claim();
    expect(claim?.fileId).toBe(id);
    if (!claim) throw new Error('Missing claim');
    await worker.process(claim);
  }
  it('migrates clean DB and up/down/up, with provenance and READY constraints', async () => {
    await db.undoLastMigration();
    await db.runMigrations();
    const binary = binaries[0];
    if (!binary) throw new Error('Fixture');
    const created = await intent(binary);
    await expect(
      db.query("UPDATE file_objects SET status='READY' WHERE id=$1", [created.fileId]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db.query('UPDATE file_objects SET owner_user_id=$1 WHERE id=$2', [
        mentor.userId,
        created.fileId,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    const file = await db.getRepository(FileObjectEntity).findOneByOrFail({ id: created.fileId });
    await expect(
      db.query(
        `INSERT INTO file_objects(owner_user_id,course_unit_id,intent_class_id,intent_class_unit_id,bucket,staging_key,original_name,extension,declared_mime_type,declared_size_bytes,intent_expires_at) VALUES($1,$2,$3,$4,$5,$6,'x.pdf','.pdf','application/pdf',1,now()+interval '1 hour')`,
        [
          actor.userId,
          scope.courseUnitId,
          randomUUID(),
          scope.classUnitId,
          file.bucket,
          randomUUID(),
        ],
      ),
    ).rejects.toBeDefined();
  });
  it.each([
    'pdf',
    'png',
    'jpg',
    'docx',
    'pptx',
    'xlsx',
    'mp3',
    'mp4',
    'txt',
    'md',
    'csv',
    'json',
    'js',
    'ts',
    'py',
    'java',
    'c',
    'cpp',
    'h',
    'css',
    'sql',
  ])(
    'uploads and verifies real .%s bytes atomically',
    async (extension) => {
      const binary = binaries.find((item) => item.filename.endsWith(`.${extension}`));
      if (!binary) throw new Error('Fixture');
      const created = await intent(binary);
      await upload(created.uploadUrl, binary.mimeType, binary.bytes);
      const completed = await files.complete(actor, created.fileId);
      expect(completed.httpStatus).toBe(202);
      await runFile(created.fileId);
      const status = await files.detail(actor, created.fileId);
      expect(status.status).toBe('READY');
      expect(status.sizeBytes).toBe(binary.bytes.length);
      expect(status.metadataStatus).toBe('PENDING');
      expect(JSON.stringify(status)).not.toMatch(/staging\/|final\/|VersionId|uploadUrl/);
      const jobs = await db
        .getRepository(FileProcessingJobEntity)
        .findBy({ fileObjectId: created.fileId });
      expect(jobs.map((j) => `${j.kind}:${j.status}`).sort()).toEqual([
        'EXTRACT:PENDING',
        'VALIDATE:SUCCEEDED',
      ]);
    },
    20000,
  );
  it('denies unsupported roles, wrong ancestry and lost Mentor assignment', async () => {
    const binary = binaries[0];
    if (!binary) throw new Error('Fixture');
    for (const role of [UserRole.ADMIN, UserRole.STUDENT])
      await expect(
        files.createIntent(
          { ...actor, role },
          {
            ...scope,
            originalFilename: binary.filename,
            declaredMimeType: binary.mimeType,
            declaredSizeBytes: binary.bytes.length,
          },
        ),
      ).rejects.toMatchObject({ status: 403 });
    const created = await intent(binary, mentor);
    await db.getRepository(ClassEntity).update(scope.classId, { mentorId: actor.userId });
    await expect(files.detail(mentor, created.fileId)).rejects.toMatchObject({ status: 403 });
    await expect(files.complete(mentor, created.fileId)).rejects.toMatchObject({ status: 403 });
    expect((await files.detail(actor, created.fileId)).status).toBe('PENDING_UPLOAD');
    await db.getRepository(ClassEntity).update(scope.classId, { mentorId: mentor.userId });
    await expect(
      policy.authorizeUpload(
        actor,
        { ...scope, classId: randomUUID() },
        { filename: binary.filename, mimeType: binary.mimeType, sizeBytes: binary.bytes.length },
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('rejects binary mismatches and terminal complete calls without retry', async () => {
    const binary = {
      filename: 'fake.pdf',
      mimeType: 'application/pdf',
      bytes: Buffer.from('not a PDF'),
    };
    const created = await intent(binary);
    await upload(created.uploadUrl, binary.mimeType, binary.bytes);
    await files.complete(actor, created.fileId);
    await runFile(created.fileId);
    expect((await files.detail(actor, created.fileId)).status).toBe('FAILED');
    await expect(files.complete(actor, created.fileId)).rejects.toMatchObject({ status: 409 });
    expect(
      (
        await db
          .getRepository(FileProcessingJobEntity)
          .findOneByOrFail({ fileObjectId: created.fileId, kind: 'VALIDATE' })
      ).attempts,
    ).toBe(1);
  });
  it('rejects invalid/truncated payloads for every binary format and binary source', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mindy-invalid-tests-'));
    try {
      for (const binary of binaries.filter((b) => !b.filename.startsWith('source'))) {
        const path = join(directory, randomUUID());
        await writeFile(path, binary.bytes.subarray(0, Math.min(8, binary.bytes.length)));
        await expect(
          validateBinary(path, {
            filename: binary.filename,
            mimeType: binary.mimeType,
            sizeBytes: 8,
          }),
        ).rejects.toBeInstanceOf(BinaryValidationError);
      }
      const path = join(directory, 'source');
      await writeFile(path, Buffer.from([0xff, 0, 0xfe]));
      await expect(
        validateBinary(path, { filename: 'bad.ts', mimeType: 'text/plain', sizeBytes: 3 }),
      ).rejects.toBeInstanceOf(BinaryValidationError);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('completes concurrently once; READY cannot be overwritten by another staging PUT', async () => {
    const binary = {
      filename: 'source.txt',
      mimeType: 'text/plain',
      bytes: Buffer.from('version A'),
    };
    const created = await intent(binary);
    await upload(created.uploadUrl, binary.mimeType, binary.bytes);
    await Promise.all([
      files.complete(actor, created.fileId),
      files.complete(actor, created.fileId),
    ]);
    expect(
      await db
        .getRepository(FileProcessingJobEntity)
        .countBy({ fileObjectId: created.fileId, kind: 'VALIDATE' }),
    ).toBe(1);
    await runFile(created.fileId);
    const before = await db.getRepository(FileObjectEntity).findOneByOrFail({ id: created.fileId });
    await upload(created.uploadUrl, binary.mimeType, Buffer.from('version B'));
    expect((await files.complete(actor, created.fileId)).httpStatus).toBe(200);
    const after = await db.getRepository(FileObjectEntity).findOneByOrFail({ id: created.fileId });
    expect(after.sha256).toBe(before.sha256);
    expect(after.objectVersionId).toBe(before.objectVersionId);
    await expect(
      db.query('UPDATE file_objects SET staging_version_id=$1 WHERE id=$2', [
        'another-version',
        after.id,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    const response = await remote.client.send(
      new GetObjectCommand({
        Bucket: after.bucket,
        Key: after.objectKey ?? '',
        VersionId: after.objectVersionId ?? '',
      }),
    );
    expect(await response.Body?.transformToString()).toBe('version A');
  });
  it('pins staging version across an outage/retry and retains every copy candidate', async () => {
    const binary = {
      filename: 'retry.txt',
      mimeType: 'text/plain',
      bytes: Buffer.from('original'),
    };
    const created = await intent(binary);
    await upload(created.uploadUrl, binary.mimeType, binary.bytes);
    await files.complete(actor, created.fileId);
    const failing = {
      assertAvailable: () => remote.storage.assertAvailable(),
      presignPut: remote.storage.presignPut.bind(remote.storage),
      head: remote.storage.head.bind(remote.storage),
      copy: remote.storage.copy.bind(remote.storage),
      read: async () => {
        throw new Error('simulated outage after copy');
      },
    };
    const processor = new FileProcessingService(db, config, failing, { validate: validateBinary });
    const first = await processor.claim();
    if (!first) throw new Error('Claim');
    await processor.process(first);
    await upload(created.uploadUrl, binary.mimeType, Buffer.from('replaced'));
    await db.getRepository(FileProcessingJobEntity).update(first.id, { availableAt: new Date(0) });
    await runFile(created.fileId);
    const file = await db.getRepository(FileObjectEntity).findOneByOrFail({ id: created.fileId });
    const response = await remote.client.send(
      new GetObjectCommand({
        Bucket: file.bucket,
        Key: file.objectKey ?? '',
        VersionId: file.objectVersionId ?? '',
      }),
    );
    expect(await response.Body?.transformToString()).toBe('original');
    const job = await db.getRepository(FileProcessingJobEntity).findOneByOrFail({ id: first.id });
    expect(job.attempts).toBe(2);
    expect(job.copyCandidates).toHaveLength(2);
  });
  it('fences an expired worker token and recovers through another worker instance', async () => {
    const binary = { filename: 'lease.txt', mimeType: 'text/plain', bytes: Buffer.from('lease') };
    const created = await intent(binary);
    await upload(created.uploadUrl, binary.mimeType, binary.bytes);
    await files.complete(actor, created.fileId);
    const old = await worker.claim();
    if (!old) throw new Error('Claim');
    await db.getRepository(FileProcessingJobEntity).update(old.id, { leaseUntil: new Date(0) });
    const fresh = new FileProcessingService(db, config, remote.storage, {
      validate: validateBinary,
    });
    const replacement = await fresh.claim();
    if (!replacement) throw new Error('Claim');
    expect(await worker.heartbeat(old)).toBe(false);
    await worker.process(old);
    expect((await files.detail(actor, created.fileId)).status).toBe('PROCESSING');
    await fresh.process(replacement);
    expect((await files.detail(actor, created.fileId)).status).toBe('READY');
  });
  it('expires intents at the deadline, leaving accepted PROCESSING jobs alive', async () => {
    // The immutable expiry is set at insertion by a dedicated short-TTL test service.
    const short = new FilesService(
      db,
      new ConfigService({
        MINIO_ENABLED: true,
        MINIO_BUCKET: config.getOrThrow<string>('MINIO_BUCKET'),
        FILE_INTENT_TTL_SECONDS: 0,
        FILE_PUT_TTL_SECONDS: 600,
        FILE_MAX_OPEN_INTENTS: 20,
      }),
      policy,
      remote.storage,
    );
    const created = await short.createIntent(actor, {
      ...scope,
      originalFilename: 'x.txt',
      declaredMimeType: 'text/plain',
      declaredSizeBytes: 1,
    });
    await expect(files.complete(actor, created.fileId)).rejects.toMatchObject({ status: 409 });
    await worker.expireIntents();
    expect((await files.detail(actor, created.fileId)).errorCode).toBe('UPLOAD_EXPIRED');
  });
  it('requires an active transaction and locks READY references until caller commit', async () => {
    const ready = await db.getRepository(FileObjectEntity).findOneByOrFail({ status: 'READY' });
    await expect(
      files.assertReadyReference(actor, ready.id, scope.courseUnitId, db.manager),
    ).rejects.toThrow('active transaction');
    await db.transaction(async (manager) => {
      const summary = await files.assertReadyReference(
        actor,
        ready.id,
        scope.courseUnitId,
        manager,
      );
      expect(summary.status).toBe('READY');
      expect(summary).not.toHaveProperty('objectKey');
    });
    await db.transaction(async (manager) => {
      await expect(
        files.assertReadyReference(actor, ready.id, randomUUID(), manager),
      ).rejects.toMatchObject({ status: 422 });
    });
  });
  it('rejects disabled storage after authorization and revoked active roles', async () => {
    const disabled = new FilesService(
      db,
      new ConfigService({ MINIO_ENABLED: false }),
      policy,
      remote.storage,
    );
    await expect(
      disabled.createIntent(actor, {
        courseUnitId: scope.courseUnitId,
        originalFilename: 'x.txt',
        declaredMimeType: 'text/plain',
        declaredSizeBytes: 1,
      }),
    ).rejects.toMatchObject({ status: 503 });
    await db.getRepository(UserEntity).update(actor.userId, { status: UserStatus.SUSPENDED });
    await expect(
      files.createIntent(actor, {
        courseUnitId: scope.courseUnitId,
        originalFilename: 'x.txt',
        declaredMimeType: 'text/plain',
        declaredSizeBytes: 1,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await db.getRepository(UserEntity).update(actor.userId, { status: UserStatus.ACTIVE });
  });
  it('denies anonymous GET/PUT and rejects versioning-disabled buckets', async () => {
    const url = `http://127.0.0.1:19000/${config.getOrThrow<string>('MINIO_BUCKET')}/test`;
    expect((await fetch(url)).status).toBe(403);
    expect((await fetch(url, { method: 'PUT', body: 'x' })).status).toBe(403);
    expect((await fetch(url.replace(/\/test$/, ''), { method: 'GET' })).status).toBe(403);
    const Bucket = config.getOrThrow<string>('MINIO_BUCKET');
    await remote.client.send(
      new PutBucketVersioningCommand({ Bucket, VersioningConfiguration: { Status: 'Suspended' } }),
    );
    try {
      await expect(
        files.createIntent(actor, {
          ...scope,
          originalFilename: 'x.txt',
          declaredMimeType: 'text/plain',
          declaredSizeBytes: 1,
        }),
      ).rejects.toMatchObject({ status: 503 });
    } finally {
      await remote.client.send(
        new PutBucketVersioningCommand({ Bucket, VersioningConfiguration: { Status: 'Enabled' } }),
      );
    }
    // No client-supplied ETag/checksum ever reaches the READY transition.
    const put = await remote.client.send(
      new PutObjectCommand({
        Bucket: config.getOrThrow<string>('MINIO_BUCKET'),
        Key: 'test',
        Body: 'x',
      }),
    );
    expect(put.VersionId).toBeTruthy();
    expect(await worker.claim()).toBeNull();
    expect(await db.getRepository(FileMetadataEntity).count()).toBeGreaterThan(0);
  });
  it('signs content-type and allows the configured browser origin preflight', async () => {
    const created = await intent({
      filename: 'signed.txt',
      mimeType: 'text/plain',
      bytes: Buffer.from('x'),
    });
    const wrong = await fetch(created.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'application/pdf' },
      body: 'x',
    });
    expect(wrong.status).toBe(403);
    const preflight = await fetch(created.uploadUrl, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3001',
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost:3001');
    await upload(created.uploadUrl, 'text/plain', Buffer.from('x'));
  });
  it('rejects HEAD size mismatch and streams exceeding the declared length', async () => {
    for (const overflow of [false, true]) {
      const binary = { filename: 'size.txt', mimeType: 'text/plain', bytes: Buffer.from('x') };
      const created = await intent(binary);
      await upload(created.uploadUrl, binary.mimeType, overflow ? binary.bytes : Buffer.from('xx'));
      await files.complete(actor, created.fileId);
      const storage = overflow
        ? {
            assertAvailable: remote.storage.assertAvailable.bind(remote.storage),
            presignPut: remote.storage.presignPut.bind(remote.storage),
            head: remote.storage.head.bind(remote.storage),
            copy: remote.storage.copy.bind(remote.storage),
            read: async () => Readable.from([Buffer.from('xx')]),
          }
        : remote.storage;
      const processor = new FileProcessingService(db, config, storage, {
        validate: validateBinary,
      });
      const claim = await processor.claim();
      if (!claim) throw new Error('Claim');
      await processor.process(claim);
      expect(await files.detail(actor, created.fileId)).toMatchObject({
        status: 'FAILED',
        errorCode: 'FILE_SIZE_MISMATCH',
      });
    }
  });
  it('rolls back READY atomically if metadata insert fails, then recovers', async () => {
    const binary = { filename: 'atomic.txt', mimeType: 'text/plain', bytes: Buffer.from('atomic') };
    const created = await intent(binary);
    await upload(created.uploadUrl, binary.mimeType, binary.bytes);
    await files.complete(actor, created.fileId);
    await db.query(
      `CREATE FUNCTION reject_test_metadata() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated metadata outage'; END $$`,
    );
    await db.query(
      'CREATE TRIGGER reject_test_metadata BEFORE INSERT ON file_metadata FOR EACH ROW EXECUTE FUNCTION reject_test_metadata()',
    );
    try {
      await runFile(created.fileId);
    } finally {
      await db.query('DROP TRIGGER reject_test_metadata ON file_metadata');
      await db.query('DROP FUNCTION reject_test_metadata()');
    }
    expect((await files.detail(actor, created.fileId)).status).toBe('PROCESSING');
    expect(
      await db.getRepository(FileMetadataEntity).countBy({ fileObjectId: created.fileId }),
    ).toBe(0);
    expect(
      await db
        .getRepository(FileProcessingJobEntity)
        .countBy({ fileObjectId: created.fileId, kind: 'EXTRACT' }),
    ).toBe(0);
    await db
      .getRepository(FileProcessingJobEntity)
      .update({ fileObjectId: created.fileId, kind: 'VALIDATE' }, { availableAt: new Date(0) });
    await runFile(created.fileId);
    expect((await files.detail(actor, created.fileId)).status).toBe('READY');
  });
  it('bounds transient retries and never creates metadata on exhaustion', async () => {
    const binary = { filename: 'outage.txt', mimeType: 'text/plain', bytes: Buffer.from('x') };
    const created = await intent(binary);
    await files.complete(actor, created.fileId);
    await db
      .getRepository(FileProcessingJobEntity)
      .update({ fileObjectId: created.fileId, kind: 'VALIDATE' }, { maxAttempts: 1 });
    const processor = new FileProcessingService(db, config, remote.storage, {
      validate: validateBinary,
    });
    const claim = await processor.claim();
    if (!claim) throw new Error('Claim');
    await processor.process(claim);
    expect(await files.detail(actor, created.fileId)).toMatchObject({
      status: 'FAILED',
      errorCode: 'FILE_RETRY_EXHAUSTED',
    });
    expect(
      await db.getRepository(FileMetadataEntity).countBy({ fileObjectId: created.fileId }),
    ).toBe(0);
  });
  it('fences a worker after validation when a newer worker has already committed READY', async () => {
    const binary = { filename: 'stale.txt', mimeType: 'text/plain', bytes: Buffer.from('winner') };
    const created = await intent(binary);
    await upload(created.uploadUrl, binary.mimeType, binary.bytes);
    await files.complete(actor, created.fileId);
    const old = await worker.claim();
    if (!old) throw new Error('Claim');
    const stale = new FileProcessingService(db, config, remote.storage, {
      validate: async (path, declaration) => {
        await db.getRepository(FileProcessingJobEntity).update(old.id, { leaseUntil: new Date(0) });
        const fresh = await worker.claim();
        if (!fresh) throw new Error('Claim');
        await worker.process(fresh);
        return validateBinary(path, declaration);
      },
    });
    await stale.process(old);
    const job = await db.getRepository(FileProcessingJobEntity).findOneByOrFail({ id: old.id });
    const file = await db.getRepository(FileObjectEntity).findOneByOrFail({ id: created.fileId });
    expect(file.status).toBe('READY');
    expect(job.attempts).toBe(2);
    expect(job.copyCandidates).toHaveLength(2);
    expect(file.objectKey).toBe(job.copyCandidates[1]?.key);
    expect(
      await db
        .getRepository(FileProcessingJobEntity)
        .countBy({ fileObjectId: file.id, kind: 'EXTRACT' }),
    ).toBe(1);
  });
  it('serializes the actor quota across concurrent intent requests', async () => {
    const user = await fixture.user(UserRole.MANAGER);
    const principal = { ...actor, userId: user.id };
    const limited = new FilesService(
      db,
      fileConfig({
        MINIO_BUCKET: config.getOrThrow<string>('MINIO_BUCKET'),
        FILE_MAX_OPEN_INTENTS: 1,
      }),
      policy,
      remote.storage,
    );
    const body = {
      ...scope,
      originalFilename: 'quota.txt',
      declaredMimeType: 'text/plain',
      declaredSizeBytes: 1,
    };
    const outcomes = await Promise.allSettled([
      limited.createIntent(principal, body),
      limited.createIntent(principal, body),
    ]);
    expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { status: 429 },
    });
  });
  it('holds reference locks, rejects unready references and keeps accepted jobs past expiry', async () => {
    const binary = { filename: 'reference.txt', mimeType: 'text/plain', bytes: Buffer.from('x') };
    const created = await intent(binary);
    await db.transaction(async (manager) => {
      await expect(
        files.assertReadyReference(actor, created.fileId, scope.courseUnitId, manager),
      ).rejects.toMatchObject({ status: 409 });
    });
    await upload(created.uploadUrl, binary.mimeType, binary.bytes);
    await files.complete(actor, created.fileId);
    await worker.expireIntents();
    expect((await files.detail(actor, created.fileId)).status).toBe('PROCESSING');
    await runFile(created.fileId);
    const other = db.createQueryRunner();
    await other.connect();
    try {
      await db.transaction(async (manager) => {
        await files.assertReadyReference(actor, created.fileId, scope.courseUnitId, manager);
        await other.startTransaction();
        await other.query("SET LOCAL statement_timeout='150ms'");
        await expect(
          other.query("UPDATE file_objects SET status='DELETED' WHERE id=$1", [created.fileId]),
        ).rejects.toMatchObject({ code: '57014' });
        await other.rollbackTransaction();
      });
    } finally {
      await other.release();
    }
  });
  it('rejects Office impostors, expansion bombs, invalid UTF-8 and wrong image MIME', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mindy-adversarial-tests-'));
    try {
      const document = binaries.find((b) => b.filename.endsWith('.docx'));
      const image = binaries.find((b) => b.filename.endsWith('.jpg'));
      if (!document || !image) throw new Error('Fixture');
      const impostor = await zipBuffer([
        [
          '[Content_Types].xml',
          Buffer.from(
            '<Types>application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml</Types>',
          ),
        ],
        ['_rels/.rels', Buffer.from('<Relationships/>')],
        ['word/document.xml', Buffer.from('<root/>')],
      ]);
      const bomb = await zipBuffer([['large.txt', Buffer.alloc(2 * 1024 * 1024, 65)]]);
      for (const bytes of [impostor, bomb]) {
        const path = join(directory, 'office');
        await writeFile(path, bytes);
        await expect(
          validateBinary(path, {
            filename: 'x.docx',
            mimeType: document.mimeType,
            sizeBytes: bytes.length,
          }),
        ).rejects.toBeInstanceOf(BinaryValidationError);
      }
      const path = join(directory, 'invalid');
      await writeFile(path, Buffer.from([0xc3, 0x28]));
      await expect(
        validateBinary(path, { filename: 'x.ts', mimeType: 'text/plain', sizeBytes: 2 }),
      ).rejects.toBeInstanceOf(BinaryValidationError);
      await writeFile(path, image.bytes);
      await expect(
        validateBinary(path, {
          filename: 'x.png',
          mimeType: 'image/png',
          sizeBytes: image.bytes.length,
        }),
      ).rejects.toBeInstanceOf(BinaryValidationError);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('retains orphan keys when copy succeeds remotely but its reply is lost', async () => {
    const binary = {
      filename: 'copy-crash.txt',
      mimeType: 'text/plain',
      bytes: Buffer.from('original'),
    };
    const created = await intent(binary);
    await upload(created.uploadUrl, binary.mimeType, binary.bytes);
    await files.complete(actor, created.fileId);
    const copyCrash = {
      assertAvailable: remote.storage.assertAvailable.bind(remote.storage),
      presignPut: remote.storage.presignPut.bind(remote.storage),
      head: remote.storage.head.bind(remote.storage),
      read: remote.storage.read.bind(remote.storage),
      copy: async (...args: Parameters<typeof remote.storage.copy>) => {
        await remote.storage.copy(...args);
        throw new Error('Remote copy committed; reply lost before persistence');
      },
    };
    const interrupted = new FileProcessingService(db, config, copyCrash, {
      validate: validateBinary,
    });
    const claim = await interrupted.claim();
    if (!claim) throw new Error('Claim');
    await interrupted.process(claim);
    const job = await db.getRepository(FileProcessingJobEntity).findOneByOrFail({ id: claim.id });
    const orphan = job.copyCandidates[0];
    expect(orphan?.versionId).toBeNull();
    if (!orphan) throw new Error('Missing orphan provenance');
    expect(
      (await remote.storage.head(config.getOrThrow<string>('MINIO_BUCKET'), orphan.key)).size,
    ).toBe(binary.bytes.length);
    await upload(created.uploadUrl, binary.mimeType, Buffer.from('replaced'));
    await db.getRepository(FileProcessingJobEntity).update(job.id, { availableAt: new Date(0) });
    await runFile(created.fileId);
    const recovered = await db
      .getRepository(FileProcessingJobEntity)
      .findOneByOrFail({ id: job.id });
    expect(recovered.copyCandidates).toHaveLength(2);
    expect(recovered.copyCandidates[0]).toEqual(orphan);
    expect((await files.detail(actor, created.fileId)).status).toBe('READY');
  });
  it('allows one claimant across two workers and renews only its current lease', async () => {
    const binary = { filename: 'claims.txt', mimeType: 'text/plain', bytes: Buffer.from('claim') };
    const created = await intent(binary);
    await upload(created.uploadUrl, binary.mimeType, binary.bytes);
    await files.complete(actor, created.fileId);
    const second = new FileProcessingService(db, config, remote.storage, {
      validate: validateBinary,
    });
    const claims = (await Promise.all([worker.claim(), second.claim()])).filter(
      (claim) => claim !== null,
    );
    expect(claims).toHaveLength(1);
    const claim = claims[0];
    if (!claim) throw new Error('Claim');
    expect(await worker.heartbeat(claim)).toBe(true);
    await worker.process(claim);
    expect(await worker.heartbeat(claim)).toBe(false);
    expect((await files.detail(actor, created.fileId)).status).toBe('READY');
  });
});
