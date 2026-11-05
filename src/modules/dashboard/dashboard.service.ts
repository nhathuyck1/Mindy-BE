import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { UserRole } from '../users/user-role.enum.js';
import type { DashboardDto } from './dashboard.dto.js';
import { DASHBOARD_SQL } from './dashboard.sql.js';
import type { ManagerDashboardDto, MentorDashboardDto } from './role-dashboard.dto.js';
import { MANAGER_DASHBOARD_SQL, MENTOR_DASHBOARD_SQL } from './role-dashboard.sql.js';

export function dashboardPeriod(days: number, now: Date): { from: Date; to: Date } {
  const localDay = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const from = new Date(
    Date.UTC(localDay.getUTCFullYear(), localDay.getUTCMonth(), localDay.getUTCDate() - days + 1) -
      7 * 60 * 60 * 1000,
  );
  return { from, to: now };
}

@Injectable()
export class DashboardService {
  constructor(private readonly dataSource: DataSource) {}

  async manager(actor: AuthenticatedUser, days: number): Promise<ManagerDashboardDto> {
    if (actor.role !== UserRole.MANAGER) throw new ForbiddenException();
    const { from, to } = dashboardPeriod(days, new Date());
    const rows = await this.dataSource.query<
      Pick<
        ManagerDashboardDto,
        | 'summary'
        | 'paymentMethods'
        | 'trend'
        | 'courses'
        | 'classes'
        | 'reconciliation'
        | 'openingAlerts'
      >[]
    >(MANAGER_DASHBOARD_SQL, [from, to, 'Asia/Ho_Chi_Minh']);
    if (!rows[0]) throw new ServiceUnavailableException();
    return {
      ...rows[0],
      scope: actor.role,
      timeZone: 'Asia/Ho_Chi_Minh',
      generatedAt: to.toISOString(),
      from: from.toISOString(),
      to: to.toISOString(),
    };
  }
  async mentor(actor: AuthenticatedUser, days: number): Promise<MentorDashboardDto> {
    if (actor.role !== UserRole.MENTOR) throw new ForbiddenException();
    const { from, to } = dashboardPeriod(days, new Date());
    const rows = await this.dataSource.query<
      Pick<MentorDashboardDto, 'summary' | 'upcoming' | 'leaveRequests'>[]
    >(MENTOR_DASHBOARD_SQL, [actor.userId, from, to]);
    if (!rows[0]) throw new ServiceUnavailableException();
    return {
      ...rows[0],
      scope: actor.role,
      timeZone: 'Asia/Ho_Chi_Minh',
      generatedAt: to.toISOString(),
      from: from.toISOString(),
      to: to.toISOString(),
    };
  }

  async overview(actor: AuthenticatedUser, days: number): Promise<DashboardDto> {
    if (![UserRole.ADMIN, UserRole.MANAGER, UserRole.MENTOR].includes(actor.role)) {
      throw new ForbiddenException();
    }
    const { from, to } = dashboardPeriod(days, new Date());
    try {
      const [result] = await this.dataSource.query<
        Pick<
          DashboardDto,
          'summary' | 'courses' | 'mentors' | 'classes' | 'trend' | 'classStatuses'
        >[]
      >(DASHBOARD_SQL, [actor.role === UserRole.MENTOR ? actor.userId : null, from, to]);
      if (!result) throw new ServiceUnavailableException();
      return {
        ...result,
        scope: actor.role,
        timeZone: 'Asia/Ho_Chi_Minh',
        generatedAt: to.toISOString(),
        from: from.toISOString(),
        to: to.toISOString(),
      };
    } catch (error) {
      if (
        error instanceof Error &&
        'driverError' in error &&
        typeof error.driverError === 'object' &&
        error.driverError !== null &&
        'code' in error.driverError &&
        error.driverError.code === '42P01'
      ) {
        throw new ServiceUnavailableException({
          code: 'DASHBOARD_SCHEMA_NOT_READY',
          message: 'Số liệu chưa sẵn sàng. Vui lòng thử lại sau.',
        });
      }
      throw error;
    }
  }
}
