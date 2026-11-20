import { HttpStatus, Injectable } from '@nestjs/common';
import { AppHttpException } from '../../../common/http/app-http.exception.js';
// biome-ignore lint/style/useImportType: Exported enrollment provider.
import { EnrollmentsService } from '../../enrollments/services/enrollments.service.js';
import type { StudentClassView } from '../domain/class-views.js';
import { ClassStatus } from '../enums/class-status.enum.js';
// biome-ignore lint/style/useImportType: Nest DI requires runtime constructor.
import { ClassReadService } from './class-read.service.js';

@Injectable()
export class StudentClassService {
  constructor(
    private readonly enrollments: EnrollmentsService,
    private readonly read: ClassReadService,
  ) {}
  async get(studentId: string, classId: string): Promise<StudentClassView> {
    const enrollment = await this.enrollments.findActive(studentId, classId);
    if (!enrollment)
      throw new AppHttpException(
        HttpStatus.FORBIDDEN,
        'CLASS_ACCESS_DENIED',
        'Active enrollment is required',
      );
    const view = await this.read.getDetail(classId);
    if (view.classEntity.status === ClassStatus.CANCELLED)
      throw new AppHttpException(HttpStatus.FORBIDDEN, 'CLASS_ACCESS_DENIED', 'Class is cancelled');
    return {
      ...view,
      enrollment: {
        id: enrollment.id,
        status: enrollment.status,
        enrolledAt: enrollment.enrolledAt,
      },
    };
  }
}
