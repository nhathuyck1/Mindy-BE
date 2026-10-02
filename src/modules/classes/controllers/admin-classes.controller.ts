import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
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
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ClassReadService } from '../services/class-read.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ClassesService } from '../services/classes.service.js';

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

  @Patch(':classId')
  @ApiOperation({
    summary: 'Update a class; dates, capacity and delivery mode are editable only in DRAFT',
  })
  @ApiOkResponse({ type: ClassManagementDetailDto })
  @ApiErrors(HttpStatus.NOT_FOUND, HttpStatus.CONFLICT, HttpStatus.UNPROCESSABLE_ENTITY)
  async update(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Body() dto: UpdateClassDto,
  ): Promise<ClassManagementDetailDto> {
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
  ): Promise<ClassManagementDetailDto> {
    return new ClassManagementDetailDto(await this.classesService.cancel(classId));
  }
}
