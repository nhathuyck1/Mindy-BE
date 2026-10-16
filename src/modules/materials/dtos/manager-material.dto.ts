import { ApiProperty } from '@nestjs/swagger';
import { MaterialReviewStatus } from '../domain/material-contract.js';
import { MaterialContentType } from '../entities/material.entity.js';
import { StudentMaterialFileDto } from './student-material.dto.js';

export class ManagerMaterialDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) courseUnitId!: string;
  @ApiProperty({ enum: MaterialContentType }) contentType!: MaterialContentType;
  @ApiProperty() title!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) availableAt!: Date | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) sessionId!: string | null;
  @ApiProperty({ format: 'uuid' }) createdBy!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) createdInClassId!: string | null;
  @ApiProperty() revision!: number;
  @ApiProperty({ enum: MaterialReviewStatus }) reviewStatus!: MaterialReviewStatus;
  @ApiProperty({ type: Number, nullable: true }) approvedRevision!: number | null;
  @ApiProperty({ type: String, nullable: true }) reviewedBy!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) reviewedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) firstApprovedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true }) rejectionReason!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) publishedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
  @ApiProperty() canEdit!: boolean;
  @ApiProperty({ type: () => StudentMaterialFileDto, nullable: true })
  file!: StudentMaterialFileDto | null;
}

export class ManagerMaterialDetailDto extends ManagerMaterialDto {
  @ApiProperty({ type: String, nullable: true }) contentHtml!: string | null;
  @ApiProperty({ type: Number, nullable: true }) contentSchemaVersion!: number | null;
  @ApiProperty({ type: () => [StudentMaterialFileDto] }) inlineImages!: StudentMaterialFileDto[];
  @ApiProperty({ type: () => [StudentMaterialFileDto] }) attachments!: StudentMaterialFileDto[];
}

export class ManagerMaterialPageDto {
  @ApiProperty({ type: () => [ManagerMaterialDto] }) items!: ManagerMaterialDto[];
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() total!: number;
}
