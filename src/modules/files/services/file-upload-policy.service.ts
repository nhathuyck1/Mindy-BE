import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
// biome-ignore lint/style/useImportType: Nest DI needs the runtime constructor.
import { CoursesService } from '../../catalog/services/courses.service.js';
import { ClassStatus } from '../../classes/enums/class-status.enum.js';
// biome-ignore lint/style/useImportType: Nest DI needs the runtime constructor.
import { ClassContentContextService } from '../../classes/services/class-content-context.service.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest DI needs the runtime constructor.
import { UsersService } from '../../users/users.service.js';
import { validateFileDeclaration } from '../domain/file-upload-policy.js';
import { UploadPolicyError, uploadPolicyException } from '../exceptions/file.exceptions.js';
import type { AuthorizedUpload, FileDeclaration, UploadScope } from '../files.contracts.js';

@Injectable()
export class FileUploadPolicyService {
  constructor(
    private readonly users: UsersService,
    private readonly courses: CoursesService,
    private readonly contexts: ClassContentContextService,
  ) {}
  async authorizeUpload(
    principal: AuthenticatedUser,
    scope: UploadScope,
    declaration: FileDeclaration,
    manager?: EntityManager,
  ): Promise<AuthorizedUpload> {
    try {
      const user = await this.users.findActiveByRole(principal.userId, principal.role, manager);
      if (user === null || (user.role !== UserRole.MANAGER && user.role !== UserRole.MENTOR))
        throw new UploadPolicyError('MATERIAL_ACCESS_DENIED');
      const unit = await this.courses.getUnitContext(scope.courseUnitId, manager);
      if (unit === null) throw new UploadPolicyError('MATERIAL_NOT_FOUND');
      if ((scope.classId === undefined) !== (scope.classUnitId === undefined))
        throw new UploadPolicyError('MATERIAL_SCOPE_MISMATCH');
      // When writing an intent/complete, serialize with the class owner's reassignment/cancel lock.
      if (manager && scope.classId !== undefined)
        await this.contexts.lockContentClass(scope.classId, manager);
      const context =
        scope.classUnitId === undefined
          ? null
          : await this.contexts.getUnit(scope.classUnitId, scope.classId, manager);
      if (
        context !== null &&
        (context.courseUnitId !== unit.courseUnitId || context.courseId !== unit.courseId)
      )
        throw new UploadPolicyError('MATERIAL_SCOPE_MISMATCH');
      if (
        user.role !== UserRole.MANAGER &&
        (context === null ||
          context.mentorId !== user.id ||
          context.classStatus === ClassStatus.CANCELLED)
      )
        throw new UploadPolicyError('MATERIAL_ACCESS_DENIED');
      return {
        courseUnitId: unit.courseUnitId,
        classContext: context,
        fileRule: validateFileDeclaration(
          declaration.filename,
          declaration.mimeType,
          declaration.sizeBytes,
        ),
      };
    } catch (error: unknown) {
      if (error instanceof UploadPolicyError) throw uploadPolicyException(error);
      throw error;
    }
  }
}
