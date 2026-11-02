import { ApiProperty } from '@nestjs/swagger';

export class AssignmentInstructionFileDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() originalFilename!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty() position!: number;
}
export class ZipFileDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() originalFilename!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty() sizeBytes!: number;
}
export class ReleasedZipGradeDto {
  @ApiProperty() version!: number;
  @ApiProperty({ example: '8.50' }) score!: string;
  @ApiProperty() feedback!: string;
}
export class ZipSnapshotDto {
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty() maxScore!: string;
  @ApiProperty({ format: 'date-time' }) dueAt!: string;
  @ApiProperty({ type: [AssignmentInstructionFileDto] })
  instructionFiles!: AssignmentInstructionFileDto[];
}
export class StudentZipSubmissionDto {
  @ApiProperty({ enum: ['ZIP'] }) type!: 'ZIP';
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) assignmentId!: string;
  @ApiProperty({ format: 'uuid' }) studentId!: string;
  @ApiProperty({ enum: ['DRAFT', 'SUBMITTED', 'VOIDED'] }) status!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ type: Number, nullable: true }) attemptNumber!: number | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) submittedAt!: Date | null;
  @ApiProperty({ type: ZipSnapshotDto, nullable: true }) snapshot!: ZipSnapshotDto | null;
  @ApiProperty({ type: ZipFileDto, nullable: true }) file!: ZipFileDto | null;
  @ApiProperty({
    type: ReleasedZipGradeDto,
    nullable: true,
    description: 'Only released revision for students; null until released.',
  })
  grade!: ReleasedZipGradeDto | null;
}
export class MentorZipSubmissionDto extends StudentZipSubmissionDto {
  @ApiProperty() gradeVersion!: number;
  @ApiProperty({ type: Number, nullable: true }) releasedVersion!: number | null;
}
export class AssignmentFileStatusDto extends ZipFileDto {
  @ApiProperty({ enum: ['PENDING_UPLOAD', 'PROCESSING', 'READY', 'FAILED', 'DELETING', 'DELETED'] })
  status!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ enum: ['INSTRUCTION', 'SUBMISSION'] }) purpose!: string;
  @ApiProperty({ type: String, nullable: true }) errorCode!: string | null;
}
export class AssignmentUploadDto extends AssignmentFileStatusDto {
  @ApiProperty({ format: 'uuid' }) fileId!: string;
  @ApiProperty() uploadUrl!: string;
  @ApiProperty({ type: Object, additionalProperties: { type: 'string' } }) requiredHeaders!: Record<
    string,
    string
  >;
  @ApiProperty({ format: 'date-time' }) uploadUrlExpiresAt!: string;
  @ApiProperty({ format: 'date-time' }) intentExpiresAt!: string;
}
export class AssignmentDownloadDto {
  @ApiProperty() url!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
}
export class AssignmentInstructionsDto {
  @ApiProperty() revision!: number;
  @ApiProperty({ type: [AssignmentInstructionFileDto] })
  instructionFiles!: AssignmentInstructionFileDto[];
}
export class AssignmentExtensionDto {
  @ApiProperty() revision!: number;
  @ApiProperty({ format: 'date-time' }) dueAt!: string;
  @ApiProperty() maxAttempts!: number;
}
export class ZipGradeRevisionDto extends ReleasedZipGradeDto {
  @ApiProperty({ format: 'uuid' }) actorId!: string;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}
export class ZipGradeHistoryDto {
  @ApiProperty({
    type: [Object],
    description: 'Paginated GRADE/RELEASE audit events: action,version,actorId,reason,createdAt',
  })
  audits!: {
    action: string;
    version: number;
    actorId: string;
    reason: string | null;
    createdAt: Date;
  }[];
  @ApiProperty() totalAudits!: number;
  @ApiProperty({ type: [ZipGradeRevisionDto] }) items!: ZipGradeRevisionDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}
export class AssignmentCountsDto {
  @ApiProperty() assignments!: number;
  @ApiProperty() eligible!: number;
  @ApiProperty() submitted!: number;
  @ApiProperty() missing!: number;
  @ApiProperty() ungraded!: number;
  @ApiProperty() unreleased!: number;
  @ApiProperty() released!: number;
}
export class AssignmentMetricsDto extends AssignmentCountsDto {
  @ApiProperty() denominator!: string;
  @ApiProperty() historyIncludesTerminalEnrollments!: boolean;
  @ApiProperty() missingIsHistorical!: boolean;
}
export class AssignmentRosterItemDto {
  @ApiProperty({ format: 'uuid' }) studentId!: string;
  @ApiProperty({ format: 'uuid' }) enrollmentId!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ type: String, nullable: true }) submissionId!: string | null;
  @ApiProperty() submitted!: boolean;
  @ApiProperty() graded!: boolean;
  @ApiProperty() released!: boolean;
  @ApiProperty() missing!: boolean;
}
export class AssignmentRosterDto {
  @ApiProperty({ type: [AssignmentRosterItemDto] }) items!: AssignmentRosterItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() denominator!: string;
}
