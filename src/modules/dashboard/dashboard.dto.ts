import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';

export class DashboardQueryDto {
  @ApiPropertyOptional({ enum: [30, 90, 365], default: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsIn([30, 90, 365])
  readonly days: number = 90;
}

export class DashboardSummaryDto {
  @ApiProperty() courses!: number;
  @ApiProperty() classes!: number;
  @ApiProperty() openClasses!: number;
  @ApiProperty() activeClasses!: number;
  @ApiProperty() registrations!: number;
  @ApiProperty() students!: number;
}

export class DashboardRankDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() registrations!: number;
  @ApiProperty() students!: number;
  @ApiProperty() classes!: number;
}

export class DashboardTrendDto {
  @ApiProperty({ example: '2026-11-03' }) date!: string;
  @ApiProperty() registrations!: number;
}

export class DashboardStatusDto {
  @ApiProperty() status!: string;
  @ApiProperty() count!: number;
}

export class DashboardDto {
  @ApiProperty({ enum: ['ADMIN', 'MANAGER', 'MENTOR'] }) scope!: string;
  @ApiProperty({ example: 'Asia/Ho_Chi_Minh' }) timeZone!: string;
  @ApiProperty({ format: 'date-time' }) generatedAt!: string;
  @ApiProperty({ format: 'date-time' }) from!: string;
  @ApiProperty({ format: 'date-time' }) to!: string;
  @ApiProperty({ type: DashboardSummaryDto }) summary!: DashboardSummaryDto;
  @ApiProperty({ type: [DashboardRankDto] }) courses!: DashboardRankDto[];
  @ApiProperty({ type: [DashboardRankDto] }) mentors!: DashboardRankDto[];
  @ApiProperty({ type: [DashboardRankDto] }) classes!: DashboardRankDto[];
  @ApiProperty({ type: [DashboardTrendDto] }) trend!: DashboardTrendDto[];
  @ApiProperty({ type: [DashboardStatusDto] }) classStatuses!: DashboardStatusDto[];
}
