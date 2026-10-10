import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

import type { AuthenticatedUser } from '../../auth/auth.types.js';
// biome-ignore lint/style/useImportType: Nest DI needs the runtime constructor.
import { CoursesService } from '../../catalog/services/courses.service.js';
import type { ClassContentContext } from '../../classes/domain/class-content-context.js';
// biome-ignore lint/style/useImportType: Nest DI needs the runtime constructor.
import { ClassContentContextService } from '../../classes/services/class-content-context.service.js';
// biome-ignore lint/style/useImportType: Nest DI needs the runtime constructor.
import { EnrollmentsService } from '../../enrollments/services/enrollments.service.js';
import type { FileRule as MaterialFileRule } from '../../files/files.contracts.js';
// biome-ignore lint/style/useImportType: Nest DI needs the runtime constructor.
import { FileUploadPolicyService } from '../../files/services/file-upload-policy.service.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest DI needs the runtime constructor.
import { UsersService } from '../../users/users.service.js';
import {
  canPreviewMaterial,
  canReadMaterial,
  isMaterialManager,
} from '../domain/material-access.js';
import type {
  MaterialActor,
  MaterialCommand,
  MaterialContent,
  MaterialSnapshot,
  MaterialTransition,
} from '../domain/material-contract.js';
import { MaterialPolicyError } from '../domain/material-policy.error.js';
import { applyMaterialCommand, createMaterialDraft } from '../domain/material-review.js';
import { MaterialPolicyException } from '../exceptions/material.exceptions.js';

export interface MaterialUploadScope {
  readonly courseUnitId: string;
  readonly classId?: string;
  readonly classUnitId?: string;
}

/** Public policy facade. Snapshots/file references must come from server-owned persistence. */
@Injectable()
export class MaterialPolicyService {
  constructor(
    private readonly users: UsersService,
    private readonly courses: CoursesService,
    private readonly contexts: ClassContentContextService,
    private readonly enrollments: EnrollmentsService,
    private readonly uploads: FileUploadPolicyService,
  ) {}

  async authorizeUpload(
    principal: AuthenticatedUser,
    scope: MaterialUploadScope,
    declaration: {
      readonly filename: string;
      readonly mimeType: string;
      readonly sizeBytes: number;
    },
    manager?: EntityManager,
  ): Promise<{
    readonly courseUnitId: string;
    readonly classContext: ClassContentContext | null;
    readonly fileRule: MaterialFileRule;
  }> {
    return this.uploads.authorizeUpload(principal, scope, declaration, manager);
  }

  async canRead(
    principal: AuthenticatedUser,
    classId: string,
    material: MaterialSnapshot,
    now: Date,
    manager?: EntityManager,
  ): Promise<boolean> {
    const actor = await this.actor(principal);
    if (actor.role !== UserRole.STUDENT) return false;
    const context = await this.contexts.getCourseUnitInClass(
      classId,
      material.courseUnitId,
      manager,
    );
    const courseUnit = await this.courses.getUnitContext(material.courseUnitId, manager);
    if (courseUnit === null || courseUnit.courseId !== context.courseId) return false;
    return canReadMaterial(material, {
      actor,
      classContext: context,
      now,
      hasActiveEnrollment: await this.enrollments.hasActiveAccess(actor.userId, classId, manager),
    });
  }

  async canPreview(
    principal: AuthenticatedUser,
    material: MaterialSnapshot,
    classId?: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const actor = await this.actor(principal);
    if (!isMaterialManager(actor) && actor.role !== UserRole.MENTOR) return false;
    const context =
      classId === undefined
        ? null
        : await this.contexts.getCourseUnitInClass(classId, material.courseUnitId, manager);
    if (context !== null) await this.assertCourseAncestry(material.courseUnitId, context, manager);
    return canPreviewMaterial(material, actor, context);
  }

  async createDraft(
    principal: AuthenticatedUser,
    id: string,
    scope: MaterialUploadScope,
    content: MaterialContent,
    now: Date,
    manager?: EntityManager,
  ): Promise<MaterialTransition> {
    const actor = await this.actor(principal);
    if (!isMaterialManager(actor) && actor.role !== UserRole.MENTOR) this.deny();
    const courseUnit = await this.courses.getUnitContext(scope.courseUnitId, manager);
    if (courseUnit === null) throw new MaterialPolicyException('MATERIAL_NOT_FOUND');
    const context = await this.contentContext(
      scope.courseUnitId,
      scope.classId,
      content.sessionId,
      manager,
    );
    if (
      scope.classUnitId !== undefined &&
      (context === null || context.classUnitId !== scope.classUnitId)
    ) {
      throw new MaterialPolicyException('MATERIAL_SCOPE_MISMATCH');
    }
    return this.domain(() =>
      createMaterialDraft(id, scope.courseUnitId, content, actor, context, now),
    );
  }

  async applyCommand(
    principal: AuthenticatedUser,
    material: MaterialSnapshot,
    command: MaterialCommand,
    now: Date,
    classId?: string,
    manager?: EntityManager,
  ): Promise<MaterialTransition> {
    const actor = await this.actor(principal);
    if (!isMaterialManager(actor) && actor.role !== UserRole.MENTOR) this.deny();
    const sessionId =
      command.action === 'EDIT' && command.changes.sessionId !== undefined
        ? command.changes.sessionId
        : material.sessionId;
    const context = await this.contentContext(material.courseUnitId, classId, sessionId, manager);
    return this.domain(() => applyMaterialCommand(material, command, actor, context, now));
  }

  private async contentContext(
    courseUnitId: string,
    classId: string | undefined,
    sessionId: string | null,
    manager?: EntityManager,
  ): Promise<ClassContentContext | null> {
    if (sessionId !== null) {
      const context = await this.contexts.getSession(sessionId, classId, manager);
      if (context.courseUnitId !== courseUnitId)
        throw new MaterialPolicyException('MATERIAL_SCOPE_MISMATCH');
      await this.assertCourseAncestry(courseUnitId, context, manager);
      return context;
    }
    if (classId === undefined) return null;
    const context = await this.contexts.getCourseUnitInClass(classId, courseUnitId, manager);
    await this.assertCourseAncestry(courseUnitId, context, manager);
    return context;
  }

  private async assertCourseAncestry(
    courseUnitId: string,
    context: ClassContentContext,
    manager?: EntityManager,
  ): Promise<void> {
    const unit = await this.courses.getUnitContext(courseUnitId, manager);
    if (unit === null || unit.courseId !== context.courseId) {
      throw new MaterialPolicyException('MATERIAL_SCOPE_MISMATCH');
    }
  }

  private async actor(principal: AuthenticatedUser): Promise<MaterialActor> {
    const user = await this.users.findActiveByRole(principal.userId, principal.role);
    if (user === null) this.deny();
    return { userId: user.id, role: user.role, active: true };
  }

  private deny(): never {
    throw new MaterialPolicyException('MATERIAL_ACCESS_DENIED');
  }

  private domain<T>(evaluate: () => T): T {
    try {
      return evaluate();
    } catch (error: unknown) {
      if (error instanceof MaterialPolicyError) throw new MaterialPolicyException(error.code);
      throw error;
    }
  }
}
