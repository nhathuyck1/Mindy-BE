import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequestOriginGuard } from '../../../common/guards/request-origin.guard.js';
import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
import { TEACHING_SLOTS } from '../domain/weekly-schedule.js';
import { ClassManagementDetailDto } from '../dtos/class.dto.js';
// biome-ignore lint/style/useImportType: Request validation requires runtime DTO.
import {
  SwapSessionsInput,
  TeachingSlotDto,
  WeeklyScheduleConfigurationDto,
  WeeklyScheduleInput,
  WeeklySchedulePreviewDto,
} from '../dtos/weekly-schedule.dto.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ClassReadService } from '../services/class-read.service.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { WeeklyScheduleService } from '../services/weekly-schedule.service.js';

@ApiTags('weekly-schedule')
@ApiCookieAuth('access_token')
@ApiErrors(401, 403, 404, 409, 422)
@UseGuards(AccessTokenGuard, RolesGuard, RequestOriginGuard)
@Controller()
export class WeeklyScheduleController {
  constructor(
    private readonly schedules: WeeklyScheduleService,
    private readonly classes: ClassReadService,
  ) {}
  @Get('management/classes/:classId/weekly-schedule')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOkResponse({ type: WeeklyScheduleConfigurationDto })
  async configuration(
    @Param('classId', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<WeeklyScheduleConfigurationDto> {
    return {
      class: new ClassManagementDetailDto(await this.classes.getDetail(id)),
      weeklySlots: await this.schedules.savedSlots(id),
    };
  }
  @Get('teaching-slots')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.MENTOR)
  @ApiOkResponse({ type: [TeachingSlotDto] })
  slots(): typeof TEACHING_SLOTS {
    return TEACHING_SLOTS;
  }
  @Post('management/classes/:classId/weekly-schedule/preview')
  @HttpCode(200)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOkResponse({ type: WeeklySchedulePreviewDto })
  preview(
    @Param('classId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: WeeklyScheduleInput,
  ): Promise<WeeklySchedulePreviewDto> {
    return this.schedules.preview(id, input);
  }
  @Post('management/classes/:classId/weekly-schedule')
  @HttpCode(200)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOkResponse({ type: WeeklySchedulePreviewDto })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  apply(
    @Param('classId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: WeeklyScheduleInput,
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') key?: string,
  ): Promise<WeeklySchedulePreviewDto> {
    return this.schedules.apply(id, input, actor, key);
  }
  @Post('mentor/classes/:classId/sessions/swap')
  @HttpCode(200)
  @Roles(UserRole.MENTOR)
  @ApiOkResponse({ type: WeeklySchedulePreviewDto })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  swap(
    @Param('classId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: SwapSessionsInput,
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') key?: string,
  ): Promise<WeeklySchedulePreviewDto> {
    return this.schedules.swap(id, input, actor, key);
  }
}
