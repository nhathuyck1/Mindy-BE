import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, Matches, ValidateIf } from 'class-validator';
import type { ClassUnitEntity } from '../entities/class-unit.entity.js';
import { ClassUnitStatus } from '../enums/class-unit-status.enum.js';
import { ClassUnitManagementDto } from './class.dto.js';

export class UpdateUnitReleaseDto {
  @ApiPropertyOptional({ enum: [ClassUnitStatus.LOCKED, ClassUnitStatus.OPEN] })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn([ClassUnitStatus.LOCKED, ClassUnitStatus.OPEN])
  readonly status?: ClassUnitStatus.LOCKED | ClassUnitStatus.OPEN;
  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Omit to preserve; null clears the schedule.',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  readonly unlockAt?: string | null;
}
export class UnitReleaseDto {
  @ApiProperty({ format: 'uuid' }) readonly id: string;
  @ApiProperty({ format: 'uuid' }) readonly classId: string;
  @ApiProperty({ format: 'uuid' }) readonly courseUnitId: string;
  @ApiProperty({ enum: ClassUnitStatus }) readonly status: ClassUnitStatus;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readonly unlockAt: Date | null;
  constructor(unit: ClassUnitEntity) {
    this.id = unit.id;
    this.classId = unit.classId;
    this.courseUnitId = unit.courseUnitId;
    this.status = unit.status;
    this.unlockAt = unit.unlockAt;
  }
}
export class MentorContentUnitPageDto {
  @ApiProperty({ type: () => [ClassUnitManagementDto] }) readonly items: ClassUnitManagementDto[];
  @ApiProperty() readonly page: number;
  @ApiProperty() readonly pageSize: number;
  @ApiProperty() readonly total: number;
  constructor(items: ClassUnitManagementDto[], page: number, pageSize: number, total: number) {
    this.items = items;
    this.page = page;
    this.pageSize = pageSize;
    this.total = total;
  }
}
