import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
  ValidateBy,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import { AttendanceAdmissionBasis } from '../enums/attendance-admission-basis.enum.js';
import { AttendanceStatus } from '../enums/attendance-status.enum.js';

export class AttendanceMutationDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  readonly expectedVersion!: number;
  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 1000 })
  @ValidateIf((_o, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 1000)
  readonly reason?: string;
}
export class StartSessionDto extends AttendanceMutationDto {
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @ValidateIf((_o, value: unknown) => value !== undefined)
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  readonly actualStartedAt?: string;
}
export class FinalizeSessionDto extends AttendanceMutationDto {
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @ValidateIf((_o, value: unknown) => value !== undefined)
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  readonly actualEndedAt?: string;
}
export class AttendanceMarkDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsUUID('4')
  readonly enrollmentId!: string;
  @ApiProperty({ enum: AttendanceStatus })
  @IsEnum(AttendanceStatus)
  readonly status!: AttendanceStatus;
}
export class GuestAttendanceMarkDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsUUID('4')
  readonly makeupPlacementId!: string;
  @ApiProperty({ enum: AttendanceStatus })
  @IsEnum(AttendanceStatus)
  readonly status!: AttendanceStatus;
}
export class MarkAttendanceDto extends AttendanceMutationDto {
  @ApiProperty({ type: () => AttendanceMarkDto, isArray: true, minItems: 0, maxItems: 100 })
  @IsArray()
  @ArrayMinSize(0)
  @ValidateBy({
    name: 'nonEmptyAttendanceBatch',
    validator: {
      validate(value: unknown, args) {
        const object = args?.object as MarkAttendanceDto | undefined;
        return (
          Array.isArray(value) &&
          (value.length > 0 ||
            (Array.isArray(object?.guestRecords) && object.guestRecords.length > 0))
        );
      },
    },
  })
  @ArrayMaxSize(100)
  @ArrayUnique((item: AttendanceMarkDto) => item?.enrollmentId)
  @ValidateNested({ each: true })
  @Type(() => AttendanceMarkDto)
  readonly records!: AttendanceMarkDto[];

  @ApiPropertyOptional({ type: () => GuestAttendanceMarkDto, isArray: true, maxItems: 100 })
  @ValidateIf((_o, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique((item: GuestAttendanceMarkDto) => item?.makeupPlacementId)
  @ValidateNested({ each: true })
  @Type(() => GuestAttendanceMarkDto)
  readonly guestRecords?: GuestAttendanceMarkDto[];
}

export class AttendanceRecoveryRecordDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsUUID('4')
  readonly enrollmentId!: string;

  @ApiProperty({ enum: [AttendanceStatus.PRESENT, AttendanceStatus.ABSENT] })
  @IsIn([AttendanceStatus.PRESENT, AttendanceStatus.ABSENT])
  readonly status!: AttendanceStatus;

  @ApiProperty({ enum: AttendanceAdmissionBasis })
  @IsEnum(AttendanceAdmissionBasis)
  readonly admissionBasis!: AttendanceAdmissionBasis;
}

export class RecoverAttendanceDto extends AttendanceMutationDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 1000, required: true })
  // Override the inherited optional condition: recovery is always a Staff command.
  @ValidateIf(() => true)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 1000)
  override readonly reason!: string;

  @ApiProperty({ type: String, minLength: 1, maxLength: 2000 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 2000)
  readonly evidenceNote!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  readonly actualStartedAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  readonly actualEndedAt!: string;

  @ApiProperty({
    type: () => AttendanceRecoveryRecordDto,
    isArray: true,
    minItems: 1,
    maxItems: 1000,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ArrayUnique((item: AttendanceRecoveryRecordDto) => item?.enrollmentId)
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecoveryRecordDto)
  readonly records!: AttendanceRecoveryRecordDto[];
}

export class AttendanceAuditQueryDto extends PageOptionsDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @ValidateIf((_o, value: unknown) => value !== undefined)
  @IsUUID('4')
  readonly makeupPlacementId?: string;
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @ValidateIf((_o, value: unknown) => value !== undefined)
  @IsUUID('4')
  readonly enrollmentId?: string;
}
