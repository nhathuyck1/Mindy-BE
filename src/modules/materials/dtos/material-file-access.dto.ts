import { ApiProperty } from '@nestjs/swagger';
import { MATERIAL_FILE_ROLES, type MaterialFileRole } from '../domain/material-file-access.js';

export class MaterialFileAccessDto {
  @ApiProperty({ type: String, format: 'uuid' }) readonly materialId: string;
  @ApiProperty({ type: String, format: 'uuid' }) readonly fileId: string;
  @ApiProperty({
    type: String,
    enum: MATERIAL_FILE_ROLES,
    description:
      'PRIMARY/INLINE_IMAGE are signed with inline disposition; ATTACHMENT with attachment disposition.',
  })
  readonly role: MaterialFileRole;
  @ApiProperty({ type: Number, description: 'Material revision that was authorized.' })
  readonly revision: number;
  @ApiProperty({
    type: String,
    format: 'uri',
    description:
      'Short-lived signed GET for the verified object version; keep in memory only, refresh through this endpoint.',
  })
  readonly url: string;
  @ApiProperty({ type: String, format: 'date-time' }) readonly expiresAt: Date;
  constructor(
    materialId: string,
    fileId: string,
    role: MaterialFileRole,
    revision: number,
    url: string,
    expiresAt: Date,
  ) {
    this.materialId = materialId;
    this.fileId = fileId;
    this.role = role;
    this.revision = revision;
    this.url = url;
    this.expiresAt = expiresAt;
  }
}
