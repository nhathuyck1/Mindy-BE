import { ApiProperty } from '@nestjs/swagger';
import type { FileKind, FileStatus } from '../files.contracts.js';
export class FileStatusDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['PENDING_UPLOAD', 'PROCESSING', 'READY', 'FAILED', 'DELETED'] })
  status!: FileStatus;
  @ApiProperty() originalFilename!: string;
  @ApiProperty({ format: 'uuid' }) courseUnitId!: string;
  @ApiProperty() declaredSizeBytes!: number;
  @ApiProperty({ type: Number, nullable: true }) sizeBytes!: number | null;
  @ApiProperty({ type: String, nullable: true }) mimeType!: string | null;
  @ApiProperty({ type: String, nullable: true }) kind!: FileKind | null;
  @ApiProperty({ format: 'date-time' }) intentExpiresAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) readyAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) metadataStatus!: string | null;
  @ApiProperty({ type: String, nullable: true }) errorCode!: string | null;
}
export class UploadIntentDto {
  @ApiProperty({ format: 'uuid' }) fileId!: string;
  @ApiProperty() uploadUrl!: string;
  @ApiProperty({ type: Object }) requiredHeaders!: Record<string, string>;
  @ApiProperty({ format: 'date-time' }) uploadUrlExpiresAt!: string;
  @ApiProperty({ format: 'date-time' }) intentExpiresAt!: string;
}
