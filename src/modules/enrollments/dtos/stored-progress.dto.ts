import { ApiProperty } from '@nestjs/swagger';

export class StoredProgressSummaryDto {
  @ApiProperty({ format: 'uuid' }) readonly enrollmentId!: string;
  @ApiProperty({ format: 'uuid' }) readonly studentId!: string;
  @ApiProperty() readonly displayName!: string;
  @ApiProperty() readonly storedUnitCount!: number;
  @ApiProperty() readonly untrackedUnitCount!: number;
  @ApiProperty() readonly invalidStoredUnitCount!: number;
}
export class StoredProgressUnitDto {
  @ApiProperty({ format: 'uuid' }) readonly enrollmentId!: string;
  @ApiProperty({ format: 'uuid' }) readonly classUnitId!: string;
  @ApiProperty({ enum: ['STORED', 'UNTRACKED'] }) readonly trackingStatus!: 'STORED' | 'UNTRACKED';
  @ApiProperty({ nullable: true, type: String }) readonly status!: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Stored decimal, not a measured learning rate',
  })
  readonly progressPercent!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  readonly completedAt!: Date | null;
  @ApiProperty({ enum: ['VALID', 'INVALID_PERCENT', 'UNTRACKED'] }) readonly dataQuality!:
    | 'VALID'
    | 'INVALID_PERCENT'
    | 'UNTRACKED';
}
export class StoredProgressPageDto {
  @ApiProperty({ type: () => StoredProgressSummaryDto, isArray: true })
  readonly items!: StoredProgressSummaryDto[];
  @ApiProperty() readonly total!: number;
  @ApiProperty() readonly page!: number;
  @ApiProperty() readonly pageSize!: number;
  @ApiProperty({ enum: ['UNDEFINED'] }) readonly completionPolicy!: 'UNDEFINED';
  @ApiProperty({ nullable: true, type: String }) readonly policyVersion!: null;
  @ApiProperty({ example: { availability: 'NOT_IMPLEMENTED', counts: null } })
  readonly assignmentSummary!: { availability: 'NOT_IMPLEMENTED'; counts: null };
  @ApiProperty() readonly readonly!: boolean;
  @ApiProperty() readonly asOf!: Date;
  @ApiProperty() readonly timeZone!: string;
}
export class StoredProgressUnitPageDto {
  @ApiProperty({ type: () => StoredProgressUnitDto, isArray: true })
  readonly items!: StoredProgressUnitDto[];
  @ApiProperty() readonly total!: number;
  @ApiProperty() readonly page!: number;
  @ApiProperty() readonly pageSize!: number;
  @ApiProperty({ enum: ['UNDEFINED'] }) readonly completionPolicy!: 'UNDEFINED';
  @ApiProperty({ nullable: true, type: String }) readonly policyVersion!: null;
  @ApiProperty({ example: { availability: 'NOT_IMPLEMENTED', counts: null } })
  readonly assignmentSummary!: { availability: 'NOT_IMPLEMENTED'; counts: null };
  @ApiProperty() readonly readonly!: boolean;
  @ApiProperty() readonly asOf!: Date;
  @ApiProperty() readonly timeZone!: string;
}
