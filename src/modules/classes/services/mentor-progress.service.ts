import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { DataSource } from 'typeorm';
import { inReadSnapshot } from '../../../common/database/read-snapshot.js';
import type { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import { AppHttpException } from '../../../common/http/app-http.exception.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import type {
  StoredProgressPageDto,
  StoredProgressUnitPageDto,
} from '../../enrollments/dtos/stored-progress.dto.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { EnrollmentsService } from '../../enrollments/services/enrollments.service.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { StoredProgressService } from '../../enrollments/services/stored-progress.service.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { MentorWorkspaceService } from './mentor-workspace.service.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { TeachingReadService } from './teaching-read.service.js';

@Injectable()
export class MentorProgressService {
  constructor(
    private readonly db: DataSource,
    private readonly workspace: MentorWorkspaceService,
    private readonly progress: StoredProgressService,
    private readonly enrollments: EnrollmentsService,
    private readonly teaching: TeachingReadService,
  ) {}
  async summary(
    actor: AuthenticatedUser,
    classId: string,
    page: PageOptionsDto,
    unitId?: string,
  ): Promise<StoredProgressPageDto> {
    return inReadSnapshot(this.db, async (m) => {
      const scope = await this.workspace.scope(m, actor, classId, true);
      if (unitId) await this.workspace.assertUnit(m, actor, scope, unitId);
      return {
        ...(await this.progress.summary(m, classId, page, unitId)),
        page: page.page,
        pageSize: page.pageSize,
        ...this.metadata(),
      };
    });
  }
  async units(
    actor: AuthenticatedUser,
    classId: string,
    studentId: string,
    page: PageOptionsDto,
  ): Promise<StoredProgressUnitPageDto> {
    return inReadSnapshot(this.db, async (m) => {
      await this.workspace.scope(m, actor, classId, true);
      if (!(await this.enrollments.hasOwnHistory(m, classId, studentId)))
        throw new AppHttpException(404, 'CLASS_STUDENT_NOT_FOUND', 'Class student not found');
      return {
        ...(await this.progress.units(m, classId, studentId, page)),
        page: page.page,
        pageSize: page.pageSize,
        ...this.metadata(),
      };
    });
  }
  private metadata() {
    return {
      completionPolicy: 'UNDEFINED' as const,
      policyVersion: null,
      assignmentSummary: { availability: 'NOT_IMPLEMENTED' as const, counts: null },
      readonly: true,
      asOf: new Date(),
      timeZone: this.teaching.timeZone(),
    };
  }
}
