import { ApiProperty } from '@nestjs/swagger';
import type { FileSummary } from '../../files/files.contracts.js';
import { MaterialReviewStatus } from '../domain/material-contract.js';
import { MaterialContentType, type MaterialEntity } from '../entities/material.entity.js';
import { StudentMaterialFileDto } from './student-material.dto.js';

export interface MaterialStaffView {
  material: MaterialEntity;
  file: FileSummary | null;
  inlineImages: FileSummary[];
  attachments: FileSummary[];
  canEdit: boolean;
}
export class MaterialManagementDto {
  @ApiProperty({ format: 'uuid' }) readonly id: string;
  @ApiProperty({ format: 'uuid' }) readonly courseUnitId: string;
  @ApiProperty({ enum: MaterialContentType }) readonly contentType: MaterialContentType;
  @ApiProperty() readonly title: string;
  @ApiProperty({ type: String, nullable: true }) readonly description: string | null;
  @ApiProperty() readonly sortOrder: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readonly availableAt: Date | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) readonly sessionId: string | null;
  @ApiProperty({ type: () => StudentMaterialFileDto, nullable: true })
  readonly file: StudentMaterialFileDto | null;
  @ApiProperty({ type: () => [StudentMaterialFileDto] })
  readonly inlineImages: StudentMaterialFileDto[];
  @ApiProperty({ type: () => [StudentMaterialFileDto] })
  readonly attachments: StudentMaterialFileDto[];
  @ApiProperty({ enum: MaterialReviewStatus }) readonly reviewStatus: MaterialReviewStatus;
  @ApiProperty() readonly revision: number;
  @ApiProperty({ type: Number, nullable: true }) readonly approvedRevision: number | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) readonly reviewedBy: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readonly reviewedAt: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readonly firstApprovedAt: Date | null;
  @ApiProperty({ type: String, nullable: true }) readonly rejectionReason: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readonly publishedAt: Date | null;
  @ApiProperty({ format: 'uuid' }) readonly createdBy: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) readonly createdInClassId:
    | string
    | null;
  @ApiProperty({ format: 'date-time' }) readonly createdAt: Date;
  @ApiProperty({ format: 'date-time' }) readonly updatedAt: Date;
  @ApiProperty() readonly canEdit: boolean;
  constructor(view: MaterialStaffView) {
    const m = view.material;
    this.id = m.id;
    this.courseUnitId = m.courseUnitId;
    this.contentType = m.contentType;
    this.title = m.title;
    this.description = m.description;
    this.sortOrder = m.sortOrder;
    this.availableAt = m.availableAt;
    this.sessionId = m.sessionId;
    this.file = view.file ? new StudentMaterialFileDto(view.file) : null;
    this.inlineImages = view.inlineImages.map((file) => new StudentMaterialFileDto(file));
    this.attachments = view.attachments.map((file) => new StudentMaterialFileDto(file));
    this.reviewStatus = m.reviewStatus;
    this.revision = m.revision;
    this.approvedRevision = m.approvedRevision;
    this.reviewedBy = m.reviewedBy;
    this.reviewedAt = m.reviewedAt;
    this.firstApprovedAt = m.firstApprovedAt;
    this.rejectionReason = m.rejectionReason;
    this.publishedAt = m.publishedAt;
    this.createdBy = m.createdBy;
    this.createdInClassId = m.createdInClassId;
    this.createdAt = m.createdAt;
    this.updatedAt = m.updatedAt;
    this.canEdit = view.canEdit;
  }
}
export class MaterialManagementDetailDto extends MaterialManagementDto {
  @ApiProperty({ type: String, nullable: true }) readonly contentHtml: string | null;
  @ApiProperty({ type: Number, nullable: true }) readonly contentSchemaVersion: number | null;
  constructor(view: MaterialStaffView) {
    super(view);
    this.contentHtml = view.material.contentHtml;
    this.contentSchemaVersion = view.material.contentSchemaVersion;
  }
}
export class MaterialManagementPageDto {
  @ApiProperty({ type: () => [MaterialManagementDto] }) readonly items: MaterialManagementDto[];
  @ApiProperty() readonly page: number;
  @ApiProperty() readonly pageSize: number;
  @ApiProperty() readonly total: number;
  constructor(items: MaterialStaffView[], page: number, pageSize: number, total: number) {
    this.items = items.map((item) => new MaterialManagementDto(item));
    this.page = page;
    this.pageSize = pageSize;
    this.total = total;
  }
}
export class MaterialAssetAccessDto {
  @ApiProperty({ format: 'uuid' }) readonly materialId: string;
  @ApiProperty({ format: 'uuid' }) readonly fileId: string;
  @ApiProperty() readonly revision: number;
  @ApiProperty({ format: 'uri' }) readonly url: string;
  @ApiProperty({ format: 'date-time' }) readonly expiresAt: Date;
  constructor(
    materialId: string,
    fileId: string,
    revision: number,
    signed: { url: string; expiresAt: Date },
  ) {
    this.materialId = materialId;
    this.fileId = fileId;
    this.revision = revision;
    this.url = signed.url;
    this.expiresAt = signed.expiresAt;
  }
}
