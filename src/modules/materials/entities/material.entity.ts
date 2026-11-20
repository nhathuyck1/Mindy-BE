import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TimestampedEntity } from '../../../common/database/base.entity.js';
import { MaterialReviewStatus } from '../domain/material-contract.js';

export enum MaterialContentType {
  ARTICLE = 'ARTICLE',
  FILE = 'FILE',
  VIDEO = 'VIDEO',
}

@Entity('materials')
export class MaterialEntity extends TimestampedEntity {
  @Column({ name: 'last_seen_at', type: 'timestamptz', nullable: true }) lastSeenAt!: Date | null;
  @Column({ name: 'tracking_started_at', type: 'timestamptz', default: () => 'clock_timestamp()' })
  trackingStartedAt!: Date;
  @Column({ name: 'is_unseen', type: 'boolean', default: false }) isUnseen!: boolean;
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'course_unit_id', type: 'uuid' }) courseUnitId!: string;
  @Column({ name: 'file_object_id', type: 'uuid', nullable: true }) fileObjectId!: string | null;
  @Column({ name: 'content_html', type: 'text', nullable: true }) contentHtml!: string | null;
  @Column({ name: 'content_schema_version', type: 'integer', nullable: true })
  contentSchemaVersion!: number | null;
  @Column({
    name: 'content_type',
    type: 'enum',
    enum: MaterialContentType,
    enumName: 'material_content_type_enum',
  })
  contentType!: MaterialContentType;
  @Column({ type: 'varchar', length: 250 }) title!: string;
  @Column({ type: 'varchar', length: 5000, nullable: true }) description!: string | null;
  @Column({ name: 'sort_order', type: 'integer', default: 0 }) sortOrder!: number;
  @Column({ name: 'available_at', type: 'timestamptz', nullable: true }) availableAt!: Date | null;
  @Column({ name: 'session_id', type: 'uuid', nullable: true }) sessionId!: string | null;
  @Column({ name: 'created_by', type: 'uuid' }) createdBy!: string;
  @Column({ name: 'created_in_class_id', type: 'uuid', nullable: true }) createdInClassId!:
    | string
    | null;
  @Column({ type: 'integer', default: 1 }) revision!: number;
  @Column({
    name: 'review_status',
    type: 'enum',
    enum: MaterialReviewStatus,
    enumName: 'material_review_status_enum',
    default: MaterialReviewStatus.DRAFT,
  })
  reviewStatus!: MaterialReviewStatus;
  @Column({ name: 'approved_revision', type: 'integer', nullable: true }) approvedRevision!:
    | number
    | null;
  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true }) reviewedBy!: string | null;
  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true }) reviewedAt!: Date | null;
  @Column({ name: 'first_approved_at', type: 'timestamptz', nullable: true })
  firstApprovedAt!: Date | null;
  @Column({ name: 'rejection_reason', type: 'varchar', length: 2000, nullable: true })
  rejectionReason!: string | null;
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true }) publishedAt!: Date | null;
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true }) deletedAt!: Date | null;
}
