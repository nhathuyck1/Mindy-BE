import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TimestampedEntity } from '../../../common/database/base.entity.js';
import type { FileKind, FileStatus } from '../files.contracts.js';

@Entity('file_objects')
export class FileObjectEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'owner_user_id', type: 'uuid' }) ownerUserId!: string;
  @Column({ name: 'course_unit_id', type: 'uuid' }) courseUnitId!: string;
  @Column({ name: 'intent_class_id', type: 'uuid', nullable: true }) intentClassId!: string | null;
  @Column({ name: 'intent_class_unit_id', type: 'uuid', nullable: true }) intentClassUnitId!:
    | string
    | null;
  @Column({ type: 'varchar', length: 100 }) bucket!: string;
  @Column({ name: 'staging_key', type: 'varchar', length: 1024 }) stagingKey!: string;
  @Column({ name: 'staging_version_id', type: 'varchar', length: 1024, nullable: true })
  stagingVersionId!: string | null;
  @Column({ name: 'object_key', type: 'varchar', length: 1024, nullable: true }) objectKey!:
    | string
    | null;
  @Column({ name: 'object_version_id', type: 'varchar', length: 1024, nullable: true })
  objectVersionId!: string | null;
  @Column({ name: 'original_name', type: 'varchar', length: 250 }) originalName!: string;
  @Column({ type: 'varchar', length: 20 }) extension!: string;
  @Column({ name: 'declared_mime_type', type: 'varchar', length: 150 }) declaredMimeType!: string;
  @Column({ name: 'declared_size_bytes', type: 'bigint' }) declaredSizeBytes!: string;
  @Column({ name: 'mime_type', type: 'varchar', length: 150, nullable: true }) mimeType!:
    | string
    | null;
  @Column({ name: 'size_bytes', type: 'bigint', nullable: true }) sizeBytes!: string | null;
  @Column({ type: 'varchar', length: 30, nullable: true }) kind!: FileKind | null;
  @Column({ type: 'char', length: 64, nullable: true }) sha256!: string | null;
  @Column({
    type: 'enum',
    enum: ['PENDING_UPLOAD', 'PROCESSING', 'READY', 'FAILED', 'DELETED'],
    enumName: 'file_status_enum',
  })
  status!: FileStatus;
  @Column({ name: 'intent_expires_at', type: 'timestamptz' }) intentExpiresAt!: Date;
  @Column({ name: 'processing_at', type: 'timestamptz', nullable: true })
  processingAt!: Date | null;
  @Column({ name: 'ready_at', type: 'timestamptz', nullable: true }) readyAt!: Date | null;
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true }) deletedAt!: Date | null;
  @Column({ name: 'error_code', type: 'varchar', length: 80, nullable: true }) errorCode!:
    | string
    | null;
}
