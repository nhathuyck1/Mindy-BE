import {
  Controller,
  Get,
  Header,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
// biome-ignore lint/style/useImportType: Nest DI requires runtime constructor.
import { DataSource } from 'typeorm';
import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
import { ManagerRosterPageDto, ManagerRosterStudentDto } from '../dtos/manager-class-roster.dto.js';
// biome-ignore lint/style/useImportType: Nest query validation needs runtime DTO metadata.
import { MentorRosterPageOptionsDto } from '../dtos/mentor-class-roster.dto.js';
// biome-ignore lint/style/useImportType: Nest DI requires runtime constructor.
import { MentorClassRosterService } from '../services/mentor-class-roster.service.js';

@ApiTags('manager cash collection')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.MANAGER)
@ApiErrors(
  HttpStatus.BAD_REQUEST,
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
  HttpStatus.UNPROCESSABLE_ENTITY,
)
@Controller('manager/classes')
export class ManagerClassRosterController {
  constructor(
    private readonly roster: MentorClassRosterService,
    private readonly db: DataSource,
  ) {}

  @Get(':classId/students')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'List effective enrollments and payment status for any class',
    description:
      'Cash confirmation still uses the full order total. A single cash order can cover multiple classes.',
  })
  @ApiOkResponse({ type: ManagerRosterPageDto })
  async students(
    @Param('classId', new ParseUUIDPipe({ version: '4' })) classId: string,
    @Query() options: MentorRosterPageOptionsDto,
  ): Promise<ManagerRosterPageDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const result = await this.roster.students(undefined, classId, options, m);
      return {
        items: result.items.map((row) => new ManagerRosterStudentDto(row)),
        page: options.page,
        pageSize: options.pageSize,
        total: result.total,
      };
    });
  }
}
