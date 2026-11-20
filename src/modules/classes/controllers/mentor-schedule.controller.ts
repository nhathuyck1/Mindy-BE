import { Controller, Get, Header, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
import { MentorTeachingScheduleDto } from '../dtos/teaching.dto.js';
// biome-ignore lint/style/useImportType: Nest request validation needs runtime DTO metadata.
import { MentorScheduleQueryDto } from '../dtos/teaching-query.dto.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { TeachingReadService } from '../services/teaching-read.service.js';

@ApiTags('mentor-schedule')
@Controller('mentor/schedule')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.MENTOR)
@ApiCookieAuth('access_token')
@ApiErrors(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN, HttpStatus.UNPROCESSABLE_ENTITY)
export class MentorScheduleController {
  constructor(private readonly read: TeachingReadService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read my effective teaching assignments' })
  @ApiOkResponse({ type: MentorTeachingScheduleDto })
  async list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() q: MentorScheduleQueryDto,
  ): Promise<MentorTeachingScheduleDto> {
    return this.read.schedule(actor.userId, q);
  }
}
