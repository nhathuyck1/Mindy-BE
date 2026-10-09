import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TimestampedEntity } from '../../../common/database/base.entity.js';
export interface CopyCandidate {
  readonly token: string;
  readonly key: string;
  readonly versionId: string | null;
}
@Entity('file_processing_jobs')
export class FileProcessingJobEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'file_object_id', type: 'uuid' }) fileObjectId!: string;
  @Column({ type: 'varchar', length: 20 }) kind!: 'VALIDATE' | 'EXTRACT' | 'PURGE';
  @Column({ type: 'varchar', length: 20, default: 'PENDING' }) status!:
    | 'PENDING'
    | 'PROCESSING'
    | 'SUCCEEDED'
    | 'FAILED';
  @Column({ type: 'integer', default: 0 }) attempts!: number;
  @Column({ name: 'max_attempts', type: 'integer', default: 5 }) maxAttempts!: number;
  @Column({ name: 'available_at', type: 'timestamptz' }) availableAt!: Date;
  @Column({ name: 'lease_until', type: 'timestamptz', nullable: true }) leaseUntil!: Date | null;
  @Column({ name: 'lease_token', type: 'uuid', nullable: true }) leaseToken!: string | null;
  @Column({ name: 'copy_candidates', type: 'jsonb', default: [] }) copyCandidates!: CopyCandidate[];
  @Column({ name: 'error_code', type: 'varchar', length: 80, nullable: true }) errorCode!:
    | string
    | null;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt!: Date | null;
}
