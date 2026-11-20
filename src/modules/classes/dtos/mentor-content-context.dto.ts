import { ApiProperty } from '@nestjs/swagger';
import { ClassUnitStatus } from '../enums/class-unit-status.enum.js';
import { SessionStatus } from '../enums/session-status.enum.js';

export class MentorContentUnitDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) classId!: string;
  @ApiProperty({ format: 'uuid' }) courseUnitId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() position!: number;
  @ApiProperty({ enum: ClassUnitStatus }) status!: ClassUnitStatus;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) unlockAt!: Date | null;
}
export class MentorContentSessionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) classUnitId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() sessionNumber!: number;
  @ApiProperty({ enum: SessionStatus }) status!: SessionStatus;
}
export class MentorContentUnitPageDto {
  @ApiProperty({ type: () => [MentorContentUnitDto] }) items!: MentorContentUnitDto[];
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() total!: number;
}
export class MentorContentSessionPageDto {
  @ApiProperty({ type: () => [MentorContentSessionDto] }) items!: MentorContentSessionDto[];
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() total!: number;
}
