import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, ValidateBy, ValidateIf } from 'class-validator';
import { ClassUnitStatus } from '../enums/class-unit-status.enum.js';

export class UpdateClassUnitReleaseDto {
  @ApiProperty({ enum: [ClassUnitStatus.LOCKED, ClassUnitStatus.OPEN] })
  @IsIn([ClassUnitStatus.LOCKED, ClassUnitStatus.OPEN])
  readonly status!: ClassUnitStatus.LOCKED | ClassUnitStatus.OPEN;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'ISO timestamp with timezone (years 0001–9999), millisecond precision. Omit to retain; null to clear. Past times are valid.',
  })
  @ValidateIf((_object, value) => value != null)
  @ValidateBy({
    name: 'isReleaseTimestamp',
    validator: {
      validate: isReleaseTimestamp,
      defaultMessage: () =>
        'unlockAt must be a valid ISO timestamp with timezone and millisecond precision (years 0001–9999)',
    },
  })
  readonly unlockAt?: string | null;
}

function isReleaseTimestamp(value: unknown): boolean {
  if (
    typeof value !== 'string' ||
    !/^(?!0000)\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
      value,
    )
  )
    return false;
  // Compare the local calendar date separately: Date normalizes invalid days.
  const calendar = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  const instant = new Date(value);
  return (
    Number.isFinite(calendar.getTime()) &&
    calendar.toISOString().slice(0, 10) === value.slice(0, 10) &&
    Number.isFinite(instant.getTime()) &&
    instant.getUTCFullYear() >= 1 &&
    instant.getUTCFullYear() <= 9999
  );
}
