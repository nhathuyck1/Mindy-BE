import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '../../users/user-status.enum.js';
import { type MentorRosterRow, MentorRosterStudentDto } from './mentor-class-roster.dto.js';
export class ManagerRosterStudentDto extends MentorRosterStudentDto {
  @ApiProperty({ type: String }) readonly email: string;
  @ApiProperty({ type: String, nullable: true }) readonly phone: string | null;
  @ApiProperty({ enum: UserStatus }) readonly studentStatus: UserStatus;
  constructor(
    row: MentorRosterRow & { email: string; phone: string | null; studentStatus: UserStatus },
  ) {
    super(row);
    this.email = row.email;
    this.phone = row.phone;
    this.studentStatus = row.studentStatus;
  }
}
export class ManagerRosterPageDto {
  @ApiProperty({ type: () => ManagerRosterStudentDto, isArray: true })
  readonly items!: ManagerRosterStudentDto[];
  @ApiProperty({ type: Number }) readonly page!: number;
  @ApiProperty({ type: Number }) readonly pageSize!: number;
  @ApiProperty({ type: Number }) readonly total!: number;
}
