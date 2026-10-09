import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '../../src/modules/auth/auth.types.js';
import { CoursesService } from '../../src/modules/catalog/services/courses.service.js';
import { ClassEntity } from '../../src/modules/classes/entities/class.entity.js';
import { ClassSessionEntity } from '../../src/modules/classes/entities/class-session.entity.js';
import { ClassUnitEntity } from '../../src/modules/classes/entities/class-unit.entity.js';
import { ClassStatus } from '../../src/modules/classes/enums/class-status.enum.js';
import { ClassUnitStatus } from '../../src/modules/classes/enums/class-unit-status.enum.js';
import { SessionStatus } from '../../src/modules/classes/enums/session-status.enum.js';
import { ClassContentContextService } from '../../src/modules/classes/services/class-content-context.service.js';
import { PaymentType } from '../../src/modules/commerce/enums/payment-type.enum.js';
import { EnrollmentEntity } from '../../src/modules/enrollments/entities/enrollment.entity.js';
import { EnrollmentStatus } from '../../src/modules/enrollments/enums/enrollment-status.enum.js';
import { EnrollmentsService } from '../../src/modules/enrollments/services/enrollments.service.js';
import { FileUploadPolicyService } from '../../src/modules/files/services/file-upload-policy.service.js';
import type { MaterialContent } from '../../src/modules/materials/domain/material-contract.js';
import { MaterialPolicyService } from '../../src/modules/materials/services/material-policy.service.js';
import { UserEntity } from '../../src/modules/users/user.entity.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import { UserStatus } from '../../src/modules/users/user-status.enum.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

describe.skipIf(!separateTestUrl('material_policy'))(
  'Phase 3.1 policy with real Catalog/Classes/Enrollments',
  () => {
    let db: DataSource;
    let fixture: ReturnType<typeof paymentFixture>;
    let contexts: ClassContentContextService;
    let policy: MaterialPolicyService;
    const now = new Date();
    const principal = (user: Pick<UserEntity, 'id' | 'role'>): AuthenticatedUser => ({
      userId: user.id,
      role: user.role,
      sessionId: randomUUID(),
    });
    beforeAll(async () => {
      db = await paymentDatabase('material_policy');
      fixture = paymentFixture(db);
      contexts = new ClassContentContextService(db);
      policy = new MaterialPolicyService(
        fixture.users,
        new CoursesService(db),
        contexts,
        new EnrollmentsService(db),
        new FileUploadPolicyService(fixture.users, new CoursesService(db), contexts),
      );
    }, 30000);
    afterAll(async () => {
      if (db?.isInitialized) await db.destroy();
    });

    async function scope(classId: string) {
      const [unit] = await db
        .getRepository(ClassUnitEntity)
        .find({ where: { classId }, order: { position: 'ASC' } });
      if (!unit) throw new Error('Missing test Unit');
      return { classId, classUnitId: unit.id, courseUnitId: unit.courseUnitId };
    }
    function content(courseUnitId: string, owner: UserEntity): MaterialContent {
      return {
        title: 'Shared main document',
        description: null,
        sortOrder: 0,
        availableAt: null,
        sessionId: null,
        file: { id: randomUUID(), courseUnitId, ownerUserId: owner.id, status: 'READY' },
      };
    }
    const declaration = { filename: 'unit.pdf', mimeType: 'application/pdf', sizeBytes: 10 };

    it('authorizes Manager or assigned Mentor and denies students/admins, wrong parents and mismatched Course Units', async () => {
      const order = await fixture.order();
      const classId = order.classIds[0];
      if (!classId) throw new Error('Missing Class');
      const target = await scope(classId);
      const manager = await fixture.user(UserRole.MANAGER);
      expect(
        await policy.authorizeUpload(
          principal(manager),
          { courseUnitId: target.courseUnitId },
          declaration,
        ),
      ).toMatchObject({ classContext: null });
      expect(
        await policy.authorizeUpload(principal(order.mentor), target, declaration),
      ).toMatchObject({ classContext: { mentorId: order.mentor.id, classId } });
      for (const role of [UserRole.MENTOR, UserRole.ADMIN, UserRole.STUDENT]) {
        const other = await fixture.user(role);
        await expect(
          policy.authorizeUpload(principal(other), target, declaration),
        ).rejects.toMatchObject({ status: 403 });
      }
      await expect(
        policy.authorizeUpload(
          principal(order.mentor),
          { ...target, classId: randomUUID() },
          declaration,
        ),
      ).rejects.toMatchObject({ status: 404 });
      const otherOrder = await fixture.order();
      const otherClassId = otherOrder.classIds[0];
      if (!otherClassId) throw new Error('Missing other Class');
      const otherScope = await scope(otherClassId);
      await expect(
        policy.authorizeUpload(
          principal(manager),
          { ...target, courseUnitId: otherScope.courseUnitId },
          declaration,
        ),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('revokes old Mentor permissions on reassignment and rejects suspended users or stale roles', async () => {
      const order = await fixture.order();
      const classId = order.classIds[0];
      if (!classId) throw new Error('Missing Class');
      const target = await scope(classId);
      const replacement = await fixture.user(UserRole.MENTOR);
      await db.getRepository(ClassEntity).update(classId, { mentorId: replacement.id });
      await expect(
        policy.authorizeUpload(principal(order.mentor), target, declaration),
      ).rejects.toMatchObject({ status: 403 });
      await db.getRepository(UserEntity).update(replacement.id, { status: UserStatus.SUSPENDED });
      await expect(
        policy.authorizeUpload(principal(replacement), target, declaration),
      ).rejects.toMatchObject({ status: 403 });
      const manager = await fixture.user(UserRole.MANAGER);
      await db.getRepository(UserEntity).update(manager.id, { role: UserRole.STUDENT });
      await expect(
        policy.authorizeUpload(principal(manager), target, declaration),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('keeps Course Unit ownership through optional Session linkage and Manager review', async () => {
      const order = await fixture.order();
      const classId = order.classIds[0];
      if (!classId) throw new Error('Missing Class');
      const target = await scope(classId);
      const [session] = await db
        .getRepository(ClassSessionEntity)
        .findBy({ classUnitId: target.classUnitId });
      if (!session) throw new Error('Missing Session');
      expect(await contexts.getSession(session.id, classId)).toMatchObject({
        classId,
        courseUnitId: target.courseUnitId,
      });
      expect(await contexts.getSession(session.id, classId)).not.toHaveProperty('meetingUrl');
      await expect(contexts.getSession(session.id, randomUUID())).rejects.toMatchObject({
        status: 404,
      });
      const materialContent = {
        ...content(target.courseUnitId, order.mentor),
        sessionId: session.id,
      };
      const draft = (
        await policy.createDraft(
          principal(order.mentor),
          randomUUID(),
          target,
          materialContent,
          now,
        )
      ).material;
      const pending = (
        await policy.applyCommand(
          principal(order.mentor),
          draft,
          { action: 'SUBMIT', expectedRevision: 1 },
          now,
          classId,
        )
      ).material;
      const manager = await fixture.user(UserRole.MANAGER);
      const reviewed = await policy.applyCommand(
        principal(manager),
        pending,
        { action: 'APPROVE', expectedRevision: 1 },
        now,
      );
      expect(reviewed.material).toMatchObject({
        courseUnitId: target.courseUnitId,
        sessionId: session.id,
        reviewStatus: 'APPROVED',
      });
      expect(reviewed.audit).toMatchObject({ actorId: manager.id, action: 'APPROVE' });
      await expect(
        policy.applyCommand(
          principal(order.mentor),
          pending,
          { action: 'APPROVE', expectedRevision: 1 },
          now,
          classId,
        ),
      ).rejects.toMatchObject({ status: 403 });
      const secondUnit = await db
        .getRepository(ClassUnitEntity)
        .findOneByOrFail({ classId, position: 2 });
      await expect(
        policy.createDraft(
          principal(manager),
          randomUUID(),
          { courseUnitId: secondUnit.courseUnitId },
          materialContent,
          now,
        ),
      ).rejects.toMatchObject({ status: 422 });
    });

    it.each([PaymentType.CASH, PaymentType.PAYOS])(
      'denies %s pending and applies release/ACTIVE gates independently to shared classes',
      async (paymentType) => {
        const order = await fixture.order({ paymentType, count: 2 });
        const [classA, classB] = order.classIds;
        if (!classA || !classB) throw new Error('Missing shared classes');
        const targetA = await scope(classA);
        const targetB = await scope(classB);
        const manager = await fixture.user(UserRole.MANAGER);
        const draft = (
          await policy.createDraft(
            principal(manager),
            randomUUID(),
            { courseUnitId: targetA.courseUnitId },
            content(targetA.courseUnitId, manager),
            now,
          )
        ).material;
        const approved = (
          await policy.applyCommand(
            principal(manager),
            draft,
            { action: 'APPROVE', expectedRevision: 1 },
            now,
          )
        ).material;
        await db
          .getRepository(ClassUnitEntity)
          .update(targetA.classUnitId, { status: ClassUnitStatus.OPEN });
        expect(await policy.canRead(principal(order.student), classA, approved, now)).toBe(false);
        for (const classId of order.classIds) {
          await db
            .getRepository(EnrollmentEntity)
            .update(
              { studentId: order.student.id, classId },
              { status: EnrollmentStatus.ACTIVE, enrolledAt: now },
            );
        }
        expect(await policy.canRead(principal(order.student), classA, approved, now)).toBe(true);
        expect(await policy.canRead(principal(order.student), classB, approved, now)).toBe(false);
        await db
          .getRepository(ClassUnitEntity)
          .update(targetB.classUnitId, { status: ClassUnitStatus.OPEN });
        expect(await policy.canRead(principal(order.student), classB, approved, now)).toBe(true);
        await db.getRepository(ClassEntity).update(classA, { status: ClassStatus.COMPLETED });
        expect(await policy.canRead(principal(order.student), classA, approved, now)).toBe(true);
        await db
          .getRepository(EnrollmentEntity)
          .update(
            { studentId: order.student.id, classId: classA },
            { status: EnrollmentStatus.COMPLETED },
          );
        expect(await policy.canRead(principal(order.student), classA, approved, now)).toBe(false);
        await db.getRepository(ClassEntity).update(classB, { status: ClassStatus.CANCELLED });
        expect(await policy.canRead(principal(order.student), classB, approved, now)).toBe(false);
        const outsider = await fixture.user();
        expect(await policy.canRead(principal(outsider), classA, approved, now)).toBe(false);
      },
    );

    it('does not let Session cancellation revoke the main Course Unit document', async () => {
      const order = await fixture.order();
      const classId = order.classIds[0];
      if (!classId) throw new Error('Missing Class');
      const target = await scope(classId);
      const [session] = await db
        .getRepository(ClassSessionEntity)
        .findBy({ classUnitId: target.classUnitId });
      if (!session) throw new Error('Missing Session');
      const manager = await fixture.user(UserRole.MANAGER);
      const draft = (
        await policy.createDraft(
          principal(manager),
          randomUUID(),
          target,
          { ...content(target.courseUnitId, manager), sessionId: session.id },
          now,
        )
      ).material;
      const approved = (
        await policy.applyCommand(
          principal(manager),
          draft,
          { action: 'APPROVE', expectedRevision: 1 },
          now,
        )
      ).material;
      await db
        .getRepository(ClassUnitEntity)
        .update(target.classUnitId, { status: ClassUnitStatus.OPEN });
      await db
        .getRepository(EnrollmentEntity)
        .update(
          { studentId: order.student.id, classId },
          { status: EnrollmentStatus.ACTIVE, enrolledAt: now },
        );
      await db
        .getRepository(ClassSessionEntity)
        .update(session.id, { status: SessionStatus.CANCELLED });
      expect(await policy.canRead(principal(order.student), classId, approved, now)).toBe(true);
    });
  },
);
