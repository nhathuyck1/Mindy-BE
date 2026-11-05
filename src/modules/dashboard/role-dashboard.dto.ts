import { ApiProperty } from '@nestjs/swagger';

export class RevenueSummaryDto {
  @ApiProperty({ description: 'Integer VND encoded as decimal string' })
  readonly collectedAmount!: string;
  @ApiProperty() readonly paidOrders!: number;
  @ApiProperty() readonly pendingAmount!: string;
  @ApiProperty() readonly pendingOrders!: number;
}
export class RevenueGroupDto {
  @ApiProperty() readonly id!: string;
  @ApiProperty() readonly name!: string;
  @ApiProperty() readonly amount!: string;
  @ApiProperty() readonly orders!: number;
}
export class RevenueTrendDto {
  @ApiProperty() readonly date!: string;
  @ApiProperty() readonly amount!: string;
  @ApiProperty() readonly orders!: number;
}
export class OpeningAlertDto {
  @ApiProperty() readonly classId!: string;
  @ApiProperty() readonly className!: string;
  @ApiProperty() readonly scheduledStartAt!: string;
  @ApiProperty() readonly activeStudentCount!: number;
  @ApiProperty() readonly missingStudents!: number;
}
export class ReconciliationOrderDto {
  @ApiProperty() readonly orderId!: string;
  @ApiProperty() readonly amount!: string;
  @ApiProperty() readonly reason!: string;
}
export class ManagerDashboardDto {
  @ApiProperty() readonly scope!: string;
  @ApiProperty() readonly generatedAt!: string;
  @ApiProperty() readonly from!: string;
  @ApiProperty() readonly to!: string;
  @ApiProperty() readonly timeZone!: string;
  @ApiProperty({ type: RevenueSummaryDto }) readonly summary!: RevenueSummaryDto;
  @ApiProperty({ type: [RevenueGroupDto] }) readonly paymentMethods!: RevenueGroupDto[];
  @ApiProperty({ type: [RevenueTrendDto] }) readonly trend!: RevenueTrendDto[];
  @ApiProperty({ type: [RevenueGroupDto] }) readonly courses!: RevenueGroupDto[];
  @ApiProperty({ type: [RevenueGroupDto] }) readonly classes!: RevenueGroupDto[];
  @ApiProperty({ type: [ReconciliationOrderDto] })
  readonly reconciliation!: ReconciliationOrderDto[];
  @ApiProperty({ type: [OpeningAlertDto] }) readonly openingAlerts!: OpeningAlertDto[];
}
export class MentorDashboardSummaryDto {
  @ApiProperty() readonly primaryClasses!: number;
  @ApiProperty() readonly students!: number;
  @ApiProperty() readonly assignedSessions!: number;
  @ApiProperty() readonly substituteSessions!: number;
  @ApiProperty() readonly completedSessions!: number;
  @ApiProperty() readonly actualTeachingHours!: number;
}
export class MentorUpcomingDto {
  @ApiProperty() readonly sessionId!: string;
  @ApiProperty() readonly classId!: string;
  @ApiProperty() readonly title!: string;
  @ApiProperty() readonly startsAt!: string;
  @ApiProperty() readonly endsAt!: string;
}
export class MentorLeaveSummaryDto {
  @ApiProperty() readonly status!: string;
  @ApiProperty() readonly count!: number;
}
export class MentorDashboardDto {
  @ApiProperty() readonly scope!: string;
  @ApiProperty() readonly generatedAt!: string;
  @ApiProperty() readonly from!: string;
  @ApiProperty() readonly to!: string;
  @ApiProperty() readonly timeZone!: string;
  @ApiProperty({ type: MentorDashboardSummaryDto }) readonly summary!: MentorDashboardSummaryDto;
  @ApiProperty({ type: [MentorUpcomingDto] }) readonly upcoming!: MentorUpcomingDto[];
  @ApiProperty({ type: [MentorLeaveSummaryDto] }) readonly leaveRequests!: MentorLeaveSummaryDto[];
}
