import { Column, Entity, PrimaryColumn } from 'typeorm';
import { TimestampedEntity } from '../../../common/database/base.entity.js';
@Entity('file_metadata')
export class FileMetadataEntity extends TimestampedEntity {
  @PrimaryColumn({ name: 'file_object_id', type: 'uuid' }) fileObjectId!: string;
  @Column({ name: 'processing_status', type: 'varchar', length: 20, default: 'PENDING' })
  processingStatus!: string;
  @Column({ type: 'jsonb', default: {} }) properties!: Record<string, unknown>;
  @Column({ name: 'preview_file_id', type: 'uuid', nullable: true }) previewFileId!: string | null;
  @Column({ name: 'extracted_at', type: 'timestamptz', nullable: true }) extractedAt!: Date | null;
}
