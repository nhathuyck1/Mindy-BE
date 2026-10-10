import { Controller, Get, Header, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
import { MySchedulePageDto } from '../dtos/my-schedule.dto.js';
// biome-ignore lint/style/useImportType: Nest query validation needs runtime DTO metadata.
import { MyScheduleQueryDto } from '../dtos/my-schedule-query.dto.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { MyScheduleService } from '../services/my-schedule.service.js';

@ApiTags('student schedule')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.STUDENT)
@ApiErrors(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN, HttpStatus.UNPROCESSABLE_ENTITY)
@Controller('me/schedule')
export class MyScheduleController {
  constructor(private readonly schedule: MyScheduleService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Sessions of every class the student can view, overlapping [from, to)',
    description:
      'Range at most 31 days; timestamps need Z or an offset. Sorted by startsAt then sessionId; ' +
      'fetch every page of the range. No meeting URLs: open the class detail to join.',
  })
  @ApiOkResponse({ type: MySchedulePageDto })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MyScheduleQueryDto,
  ): Promise<MySchedulePageDto> {
    return new MySchedulePageDto(
      await this.schedule.list(user.userId, {
        from: new Date(query.from),
        to: new Date(query.to),
        page: query.page,
        pageSize: query.pageSize,
        includeCancelled: query.includeCancelled,
        ...(query.classId === undefined ? {} : { classId: query.classId }),
      }),
    );
  }
}
