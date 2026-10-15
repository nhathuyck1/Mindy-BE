import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
// biome-ignore lint/style/useImportType: Nest query validation needs runtime DTO metadata.
import { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
import {
  AdminClassStudentDetailDto,
  AdminClassStudentDto,
  AdminClassStudentPageDto,
} from '../dtos/admin-class-student.dto.js';
import {
  ClassManagementDetailDto,
  ClassManagementDto,
  ClassManagementPageDto,
} from '../dtos/class.dto.js';
// biome-ignore lint/style/useImportType: Nest request validation needs runtime DTO metadata.
import { AdminClassPageOptionsDto } from '../dtos/class-page-options.dto.js';
// biome-ignore lint/style/useImportType: Nest request validation needs runtime DTO metadata.
import { CreateClassDto } from '../dtos/create-class.dto.js';
// biome-ignore lint/style/useImportType: Nest request validation needs runtime DTO metadata.
import { ScheduleClassSessionDto } from '../dtos/schedule-class-session.dto.js';
// biome-ignore lint/style/useImportType: Nest request validation needs runtime DTO metadata.
import { UpdateClassDto } from '../dtos/update-class.dto.js';
// biome-ignore lint/style/useImportType: Nest request validation needs runtime DTO metadata.
import {
  BulkUpdateClassSessionTimeDto,
  UpdateClassSessionTimeDto,
} from '../dtos/update-class-session-time.dto.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ClassReadService } from '../services/class-read.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ClassesService } from '../services/classes.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { TeachingAssignmentService } from '../services/teaching-assignment.service.js';

@ApiTags('admin-classes')
@Controller('admin/classes')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiCookieAuth('access_token')
@ApiErrors(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN)
export class AdminClassesController {
  constructor(
    private readonly classesService: ClassesService,
    private readonly readService: ClassReadService,
    private readonly assignments: TeachingAssignmentService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List classes for management in every status' })
  @ApiOkResponse({ type: ClassManagementPageDto })
  @ApiErrors(HttpStatus.UNPROCESSABLE_ENTITY)
  async list(@Query() options: AdminClassPageOptionsDto): Promise<ClassManagementPageDto> {
    const result = await this.readService.listForManagement(options);
    return new ClassManagementPageDto(
      result.items.map((view) => new ClassManagementDto(view)),
      options.page,
      options.pageSize,
      result.total,
    );
  }

  @Get(':classId')
  @ApiOperation({ summary: 'Get a class with its units and sessions for management' })
  @ApiOkResponse({ type: ClassManagementDetailDto })
  @ApiErrors(HttpStatus.NOT_FOUND)
  async get(
    @Param('classId', new ParseUUIDPipe()) classId: string,
  ): Promise<ClassManagementDetailDto> {
    return new ClassManagementDetailDto(await this.readService.getDetail(classId));
  }

  @Post()
  @ApiOperation({ summary: 'Create a DRAFT class from an active course and copy its units' })
  @ApiCreatedResponse({ type: ClassManagementDetailDto })
  @ApiErrors(HttpStatus.NOT_FOUND, HttpStatus.CONFLICT, HttpStatus.UNPROCESSABLE_ENTITY)
  async create(@Body() dto: CreateClassDto): Promise<ClassManagementDetailDto> {
    return new ClassManagementDetailDto(await this.classesService.create(dto));
  }

  @Get(':classId/students')
  @ApiOperation({ summary: 'List pending, active and completed students in a class for admin' })
  @ApiOkResponse({ type: AdminClassStudentPageDto })
  @ApiErrors(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND, HttpStatus.UNPROCESSABLE_ENTITY)
  async students(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Query() options: PageOptionsDto,
  ): Promise<AdminClassStudentPageDto> {
    const result = await this.readService.listStudentsForManagement(classId, options);
    return new AdminClassStudentPageDto(
      result.items.map((view) => new AdminClassStudentDto(view)),
      options.page,
      options.pageSize,
      result.total,
    );
  }

  @Get(':classId/students/:studentId')
  @ApiOperation({
    summary: 'Get student contact and registration details within a class for admin',
  })
  @ApiOkResponse({ type: AdminClassStudentDetailDto })
  @ApiErrors(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async student(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
  ): Promise<AdminClassStudentDetailDto> {
    return new AdminClassStudentDetailDto(
      await this.readService.getStudentForManagement(classId, studentId),
    );
  }

  @Patch(':classId')
  @ApiOperation({
    summary: 'Update a class; dates, capacity and delivery mode are editable only in DRAFT',
  })
  @ApiOkResponse({ type: ClassManagementDetailDto })
  @ApiErrors(HttpStatus.NOT_FOUND, HttpStatus.CONFLICT, HttpStatus.UNPROCESSABLE_ENTITY)
  async update(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Body() dto: UpdateClassDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<ClassManagementDetailDto> {
    if (dto.mentorId !== undefined) {
      if (
        dto.expectedVersion === undefined ||
        dto.reason === undefined ||
        Object.keys(dto).some((field) => !['mentorId', 'expectedVersion', 'reason'].includes(field))
      ) {
        throw new UnprocessableEntityException(
          'Assign mentors separately using reason and expectedVersion',
        );
      }
      await this.assignments.assignClass(
        classId,
        {
          mentorId: dto.mentorId,
          expectedVersion: dto.expectedVersion,
          reason: dto.reason.trim(),
        },
        actor,
        key,
      );
      return new ClassManagementDetailDto(await this.readService.getDetail(classId));
    }
    return new ClassManagementDetailDto(await this.classesService.update(classId, dto));
  }

  @Post(':classId/sessions')
  @ApiOperation({ summary: 'Schedule a session for one unit of the class' })
  @ApiCreatedResponse({ type: ClassManagementDetailDto })
  @ApiErrors(HttpStatus.NOT_FOUND, HttpStatus.CONFLICT, HttpStatus.UNPROCESSABLE_ENTITY)
  async scheduleSession(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Body() dto: ScheduleClassSessionDto,
  ): Promise<ClassManagementDetailDto> {
    return new ClassManagementDetailDto(await this.classesService.scheduleSession(classId, dto));
  }

  @Patch(':classId/sessions/bulk')
  @ApiOperation({ summary: 'Change the clock times of selected sessions atomically; keep dates' })
  @ApiOkResponse({ type: ClassManagementDetailDto })
  @ApiErrors(HttpStatus.NOT_FOUND, HttpStatus.CONFLICT, HttpStatus.UNPROCESSABLE_ENTITY)
  async bulkUpdateSessionTimes(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Body() dto: BulkUpdateClassSessionTimeDto,
  ): Promise<ClassManagementDetailDto> {
    return new ClassManagementDetailDto(
      await this.classesService.updateSessionTimes(classId, dto.sessionIds, dto),
    );
  }

  @Patch(':classId/sessions/:sessionId')
  @ApiOperation({ summary: 'Change the clock times of one session; keep its local dates' })
  @ApiOkResponse({ type: ClassManagementDetailDto })
  @ApiErrors(HttpStatus.NOT_FOUND, HttpStatus.CONFLICT, HttpStatus.UNPROCESSABLE_ENTITY)
  async updateSessionTime(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() dto: UpdateClassSessionTimeDto,
  ): Promise<ClassManagementDetailDto> {
    return new ClassManagementDetailDto(
      await this.classesService.updateSessionTimes(classId, [sessionId], dto),
    );
  }

  @Post(':classId/open')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Open a DRAFT class for registration' })
  @ApiOkResponse({ type: ClassManagementDetailDto })
  @ApiErrors(HttpStatus.NOT_FOUND, HttpStatus.CONFLICT)
  async open(
    @Param('classId', new ParseUUIDPipe()) classId: string,
  ): Promise<ClassManagementDetailDto> {
    return new ClassManagementDetailDto(await this.classesService.open(classId));
  }

  @Post(':classId/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start an OPEN class; registration closes' })
  @ApiOkResponse({ type: ClassManagementDetailDto })
  @ApiErrors(HttpStatus.NOT_FOUND, HttpStatus.CONFLICT)
  async start(
    @Param('classId', new ParseUUIDPipe()) classId: string,
  ): Promise<ClassManagementDetailDto> {
    return new ClassManagementDetailDto(await this.classesService.start(classId));
  }

  @Post(':classId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete an IN_PROGRESS class' })
  @ApiOkResponse({ type: ClassManagementDetailDto })
  @ApiErrors(HttpStatus.NOT_FOUND, HttpStatus.CONFLICT)
  async complete(
    @Param('classId', new ParseUUIDPipe()) classId: string,
  ): Promise<ClassManagementDetailDto> {
    return new ClassManagementDetailDto(await this.classesService.complete(classId));
  }

  @Post(':classId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a class that is not completed yet' })
  @ApiOkResponse({ type: ClassManagementDetailDto })
  @ApiErrors(HttpStatus.NOT_FOUND, HttpStatus.CONFLICT)
  async cancel(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ClassManagementDetailDto> {
    return new ClassManagementDetailDto(await this.classesService.cancel(classId, actor.userId));
  }
}
