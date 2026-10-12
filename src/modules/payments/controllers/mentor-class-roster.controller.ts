import {
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest query validation needs runtime DTO metadata.
import {
  MentorClassDto,
  MentorClassPageDto,
  MentorClassPageOptionsDto,
  MentorRosterPageDto,
  MentorRosterPageOptionsDto,
  MentorRosterStudentDto,
} from '../dtos/mentor-class-roster.dto.js';
// biome-ignore lint/style/useImportType: Nest DI requires runtime constructor.
import { MentorClassRosterService } from '../services/mentor-class-roster.service.js';

@ApiTags('mentor classes')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.MENTOR)
@ApiErrors(
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
  HttpStatus.UNPROCESSABLE_ENTITY,
)
@Controller('mentor/classes')
export class MentorClassRosterController {
  constructor(private readonly roster: MentorClassRosterService) {}

  @Get()
  @ApiOperation({ summary: 'List classes currently assigned to the signed-in mentor' })
  @ApiOkResponse({ type: MentorClassPageDto })
  async classes(
    @CurrentUser() user: AuthenticatedUser,
    @Query() options: MentorClassPageOptionsDto,
  ): Promise<MentorClassPageDto> {
    const result = await this.roster.classes(user.userId, options);
    return new MentorClassPageDto(
      result.items.map((view) => new MentorClassDto(view)),
      options.page,
      options.pageSize,
      result.total,
    );
  }

  @Get(':classId/students')
  @ApiOperation({
    summary: 'List effective enrollments and payment status for an assigned class',
    description:
      'Cash confirmation still uses the full order total. A single cash order can cover multiple classes.',
  })
  @ApiOkResponse({ type: MentorRosterPageDto })
  async students(
    @CurrentUser() user: AuthenticatedUser,
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Query() options: MentorRosterPageOptionsDto,
  ): Promise<MentorRosterPageDto> {
    const result = await this.roster.students(user.userId, classId, options);
    return new MentorRosterPageDto(
      result.items.map((row) => new MentorRosterStudentDto(row)),
      options.page,
      options.pageSize,
      result.total,
    );
  }
}
