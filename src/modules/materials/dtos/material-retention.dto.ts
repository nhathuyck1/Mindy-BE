import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class MaterialOpenInput {
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') readonly classId!: string;
  @ApiProperty() @IsInt() @Min(1) readonly expectedRevision!: number;
}
export class MaterialBulkDeleteItem {
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') readonly materialId!: string;
  @ApiProperty() @IsInt() @Min(1) readonly expectedRevision!: number;
  @ApiProperty({ type: String, nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  readonly lastSeenAt!: string | null;
  @ApiProperty() @IsISO8601({ strict: true }) readonly trackingStartedAt!: string;
}
export class MaterialBulkDeleteInput {
  @ApiProperty({ type: [MaterialBulkDeleteItem], maxItems: 100 })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => MaterialBulkDeleteItem)
  readonly items!: MaterialBulkDeleteItem[];
}
export class MaterialBulkDeleteResultDto {
  @ApiProperty() readonly materialId!: string;
  @ApiProperty({ enum: ['DELETED', 'STALE', 'NOT_FOUND', 'ALREADY_DELETED'] }) readonly status!:
    | 'DELETED'
    | 'STALE'
    | 'NOT_FOUND'
    | 'ALREADY_DELETED';
}
export class MaterialBulkDeleteResponseDto {
  @ApiProperty({ type: [MaterialBulkDeleteResultDto] })
  readonly items!: MaterialBulkDeleteResultDto[];
}
export class MaterialCleanupStatsDto {
  @ApiProperty({
    description: 'Estimated bytes eligible for cleanup; excludes live shared references',
  })
  readonly reclaimableBytes!: string;
  @ApiProperty({ description: 'Confirmed and recorded storage deletions' })
  readonly reclaimedBytes!: string;
  @ApiProperty() readonly pendingFiles!: number;
  @ApiProperty() readonly failedFiles!: number;
}
