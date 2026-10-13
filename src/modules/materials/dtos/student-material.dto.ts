import { ApiProperty } from '@nestjs/swagger';
import type { FileKind, FileSummary } from '../../files/files.contracts.js';
import { MaterialContentType, type MaterialEntity } from '../entities/material.entity.js';

export interface StudentMaterialView {
  readonly material: MaterialEntity;
  readonly file: FileSummary;
  readonly classId: string;
  readonly classUnitId: string;
}

export class StudentMaterialFileDto {
  @ApiProperty({ type: String, format: 'uuid' }) readonly id: string;
  @ApiProperty({ type: String }) readonly originalFilename: string;
  @ApiProperty({ type: String }) readonly mimeType: string;
  @ApiProperty({ type: Number }) readonly sizeBytes: number;
  @ApiProperty({
    type: String,
    enum: [
      'PDF',
      'IMAGE',
      'DOCUMENT',
      'PRESENTATION',
      'SPREADSHEET',
      'AUDIO',
      'VIDEO',
      'SOURCE_CODE',
    ],
  })
  readonly kind: FileKind;
  constructor(file: FileSummary) {
    this.id = file.id;
    this.originalFilename = file.originalFilename;
    this.mimeType = file.mimeType;
    this.sizeBytes = file.sizeBytes;
    this.kind = file.kind;
  }
}

export class StudentMaterialDto {
  @ApiProperty({ type: String, format: 'uuid' }) readonly id: string;
  @ApiProperty({ type: String, format: 'uuid' }) readonly classId: string;
  @ApiProperty({ type: String, format: 'uuid' }) readonly classUnitId: string;
  @ApiProperty({ type: String, format: 'uuid' }) readonly courseUnitId: string;
  @ApiProperty({ type: String, enum: [MaterialContentType.FILE, MaterialContentType.VIDEO] })
  readonly contentType: MaterialContentType;
  @ApiProperty({ type: String }) readonly title: string;
  @ApiProperty({ type: String, nullable: true }) readonly description: string | null;
  @ApiProperty({ type: Number }) readonly sortOrder: number;
  @ApiProperty({ type: Number }) readonly revision: number;
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Optional usage association; does not restrict the shared Course Unit material to this session/class.',
  })
  readonly sessionId: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readonly availableAt: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) readonly publishedAt: Date;
  @ApiProperty({ type: String, format: 'date-time' }) readonly updatedAt: Date;
  @ApiProperty({ type: () => StudentMaterialFileDto }) readonly file: StudentMaterialFileDto;
  constructor(view: StudentMaterialView) {
    const { material } = view;
    this.id = material.id;
    this.classId = view.classId;
    this.classUnitId = view.classUnitId;
    this.courseUnitId = material.courseUnitId;
    this.contentType = material.contentType;
    this.title = material.title;
    this.description = material.description;
    this.sortOrder = material.sortOrder;
    this.revision = material.revision;
    this.sessionId = material.sessionId;
    this.availableAt = material.availableAt;
    if (material.publishedAt === null) throw new Error('Student material must be published');
    this.publishedAt = material.publishedAt;
    this.updatedAt = material.updatedAt;
    this.file = new StudentMaterialFileDto(view.file);
  }
}

export class StudentMaterialPageDto {
  @ApiProperty({ type: () => StudentMaterialDto, isArray: true })
  readonly items: StudentMaterialDto[];
  @ApiProperty({ type: Number }) readonly page: number;
  @ApiProperty({ type: Number }) readonly pageSize: number;
  @ApiProperty({ type: Number }) readonly total: number;
  @ApiProperty({ type: String, format: 'date-time' }) readonly asOf: Date;
  constructor(
    items: StudentMaterialDto[],
    page: number,
    pageSize: number,
    total: number,
    asOf: Date,
  ) {
    this.items = items;
    this.page = page;
    this.pageSize = pageSize;
    this.total = total;
    this.asOf = asOf;
  }
}

export class StudentMaterialDownloadDto {
  @ApiProperty({ type: String, format: 'uuid' }) readonly materialId: string;
  @ApiProperty({ type: String, format: 'uuid' }) readonly fileId: string;
  @ApiProperty({
    type: String,
    format: 'uri',
    description:
      'Short-lived signed GET for the verified version; suitable for view/download/MP4 Range requests.',
  })
  readonly url: string;
  @ApiProperty({ type: String, format: 'date-time' }) readonly expiresAt: Date;
  constructor(materialId: string, fileId: string, url: string, expiresAt: Date) {
    this.materialId = materialId;
    this.fileId = fileId;
    this.url = url;
    this.expiresAt = expiresAt;
  }
}
