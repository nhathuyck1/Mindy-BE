import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ClassManagementDetailDto } from './class.dto.js';

export class WeeklySlotInput {
  @ApiProperty({ minimum: 1, maximum: 7, description: 'ISO weekday: Monday=1' })
  @IsInt()
  @Min(1)
  @Max(7)
  readonly weekday!: number;
  @ApiProperty({ minimum: 1, maximum: 7 })
  @IsInt()
  @Min(1)
  @Max(7)
  readonly slotId!: number;
}
export class WeeklySessionInput {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID('4') readonly sessionId?: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') readonly classUnitId!: string;
  @ApiProperty({ maxLength: 250 })
  @IsString()
  @Matches(/\S/)
  @MaxLength(250)
  readonly title!: string;
}
export class WeeklyScheduleInput {
  @ApiProperty({ format: 'date' }) @Matches(/^\d{4}-\d{2}-\d{2}$/) readonly startDate!: string;
  @ApiProperty({ type: [WeeklySlotInput] })
  @ArrayMinSize(1)
  @ArrayMaxSize(49)
  @ValidateNested({ each: true })
  @Type(() => WeeklySlotInput)
  readonly weeklySlots!: WeeklySlotInput[];
  @ApiProperty({
    type: [WeeklySessionInput],
    description: 'Full curriculum order; include existing session IDs when moving a class',
  })
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => WeeklySessionInput)
  readonly sessions!: WeeklySessionInput[];
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) readonly expectedVersion!: number;
  @ApiProperty({ maxLength: 1000 })
  @IsString()
  @Matches(/\S/)
  @MaxLength(1000)
  readonly reason!: string;
}
export class SwapSessionsInput {
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') readonly firstSessionId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') readonly secondSessionId!: string;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) readonly firstVersion!: number;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) readonly secondVersion!: number;
  @ApiProperty({ maxLength: 1000 })
  @IsString()
  @Matches(/\S/)
  @MaxLength(1000)
  readonly reason!: string;
}
export class CalendarConflictDto {
  @ApiProperty() readonly kind!: string;
  @ApiProperty() readonly sessionId!: string;
  @ApiProperty({ nullable: true }) readonly conflictingSessionId!: string | null;
  @ApiProperty() readonly startsAt!: Date;
  @ApiProperty() readonly endsAt!: Date;
}
export class WeeklyScheduleEntryDto {
  @ApiProperty({ nullable: true }) readonly sessionId!: string | null;
  @ApiProperty() readonly classUnitId!: string;
  @ApiProperty() readonly title!: string;
  @ApiProperty() readonly startsAt!: Date;
  @ApiProperty() readonly endsAt!: Date;
}
export class WeeklySchedulePreviewDto {
  @ApiProperty() readonly timeZone!: string;
  @ApiProperty() readonly expectedVersion!: number;
  @ApiProperty({ type: [WeeklyScheduleEntryDto] }) readonly sessions!: WeeklyScheduleEntryDto[];
  @ApiProperty({ type: [CalendarConflictDto] }) readonly conflicts!: CalendarConflictDto[];
}
export class TeachingSlotDto {
  @ApiProperty() readonly id!: number;
  @ApiProperty() readonly startsAt!: string;
  @ApiProperty() readonly endsAt!: string;
}
export class WeeklyScheduleConfigurationDto {
  @ApiProperty({ type: ClassManagementDetailDto }) readonly class!: ClassManagementDetailDto;
  @ApiProperty({ type: [WeeklySlotInput] }) readonly weeklySlots!: WeeklySlotInput[];
}
