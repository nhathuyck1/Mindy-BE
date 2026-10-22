import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import { ClassStatus } from '../enums/class-status.enum.js';
import { TeachingSessionDto } from './teaching.dto.js';
import { MentorScheduleQueryDto } from './teaching-query.dto.js';

export class MentorWorkspaceQueryDto extends OmitType(MentorScheduleQueryDto, [
  'classId',
] as const) {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  readonly unitId?: string;
}
export class MentorProgressQueryDto extends PageOptionsDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  readonly unitId?: string;
}
export class MentorWorkspaceDto {
  @ApiProperty() readonly id!: string;
  @ApiProperty() readonly classId!: string;
  @ApiProperty() readonly code!: string;
  @ApiProperty() readonly name!: string;
  @ApiProperty({ enum: ClassStatus }) readonly status!: ClassStatus;
  @ApiProperty({ example: { id: 'uuid', title: 'Python' } }) readonly course!: {
    id: string;
    title: string;
  };
  @ApiProperty({ enum: ['CLASS', 'SESSION'] }) readonly accessScope!: 'CLASS' | 'SESSION';
  @ApiProperty({ enum: ['PRIMARY', 'SUBSTITUTE', 'BOTH'] }) readonly assignmentType!:
    | 'PRIMARY'
    | 'SUBSTITUTE'
    | 'BOTH';
  @ApiProperty() readonly readonly!: boolean;
  @ApiProperty({
    example: {
      readClass: true,
      readClassRoster: true,
      readClassReports: true,
      authorMaterials: true,
    },
  })
  readonly capabilities!: {
    readClass: boolean;
    readClassRoster: boolean;
    readClassReports: boolean;
    authorMaterials: boolean;
  };
  @ApiProperty() readonly visibleUnitCount!: number;
  @ApiProperty() readonly visibleSessionCount!: number;
  @ApiProperty() readonly asOf!: Date;
  @ApiProperty() readonly timeZone!: string;
}
export class MentorWorkspaceSessionDto extends TeachingSessionDto {
  @ApiProperty({ example: { readSessionContext: true, writeTeachingNotes: false } })
  readonly capabilities!: { readSessionContext: boolean; writeTeachingNotes: boolean };
}
export class MentorWorkspaceSessionPageDto {
  @ApiProperty({ type: () => [MentorWorkspaceSessionDto] })
  readonly items!: MentorWorkspaceSessionDto[];
  @ApiProperty() readonly total!: number;
  @ApiProperty() readonly page!: number;
  @ApiProperty() readonly pageSize!: number;
}
