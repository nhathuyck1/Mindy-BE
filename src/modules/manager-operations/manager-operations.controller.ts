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
// biome-ignore lint/style/useImportType: Nest query validation requires runtime DTO metadata.
import { PageOptionsDto } from '../../common/dtos/page-options.dto.js';
import { ApiErrors } from '../../decorators/api-errors.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { AdminClassStudentDetailDto } from '../classes/dtos/admin-class-student.dto.js';
import { MentorClassPageDto } from '../payments/dtos/mentor-class-roster.dto.js';
import { UserRole } from '../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest query validation requires runtime DTO metadata.
import {
  ManagerClassQueryDto,
  ManagerMentorClassesQueryDto,
  ManagerMentorScheduleQueryDto,
  ManagerOrdersQueryDto,
  ManagerPaymentsQueryDto,
  ManagerPeopleQueryDto,
  ManagerStudentClassesQueryDto,
} from './dtos/manager-query.dto.js';
import {
  ManagerClassDetailDto,
  ManagerMentorClassesPageDto,
  ManagerOrderDetailDto,
  ManagerOrdersPageDto,
  ManagerPaymentDto,
  ManagerPaymentsPageDto,
  ManagerPeoplePageDto,
  ManagerPersonDto,
  ManagerSchedulePageDto,
  ManagerStudentClassesPageDto,
  ManagerUnitsPageDto,
} from './dtos/manager-response.dto.js';
// biome-ignore lint/style/useImportType: Nest DI requires runtime constructor tokens.
import { ManagerOperationsService } from './services/manager-operations.service.js';

@ApiTags('manager operations')
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
@Controller('manager')
export class ManagerOperationsController {
  constructor(private readonly operations: ManagerOperationsService) {}
  @Get('classes')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Manager read: classes' })
  @ApiOkResponse({ type: MentorClassPageDto })
  async classes(@Query() options: ManagerClassQueryDto): Promise<MentorClassPageDto> {
    return this.operations.listClasses(options);
  }
  @Get('classes/:classId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Manager read: classes/:classId' })
  @ApiOkResponse({ type: ManagerClassDetailDto })
  async classDetail(
    @Param('classId', new ParseUUIDPipe({ version: '4' })) classId: string,
  ): Promise<ManagerClassDetailDto> {
    return this.operations.classDetail(classId);
  }
  @Get('classes/:classId/units')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Manager read: classes/:classId/units' })
  @ApiOkResponse({ type: ManagerUnitsPageDto })
  async units(
    @Param('classId', new ParseUUIDPipe({ version: '4' })) classId: string,
    @Query() options: PageOptionsDto,
  ): Promise<ManagerUnitsPageDto> {
    return this.operations.units(classId, options);
  }
  @Get('mentors')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Manager read: mentors' })
  @ApiOkResponse({ type: ManagerPeoplePageDto })
  async mentors(@Query() options: ManagerPeopleQueryDto): Promise<ManagerPeoplePageDto> {
    return this.operations.people(UserRole.MENTOR, options);
  }
  @Get('mentors/:mentorId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Manager read: mentors/:mentorId' })
  @ApiOkResponse({ type: ManagerPersonDto })
  async mentor(
    @Param('mentorId', new ParseUUIDPipe({ version: '4' })) mentorId: string,
  ): Promise<ManagerPersonDto> {
    return this.operations.person(mentorId, UserRole.MENTOR);
  }
  @Get('students')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Manager read: students' })
  @ApiOkResponse({ type: ManagerPeoplePageDto })
  async students(@Query() options: ManagerPeopleQueryDto): Promise<ManagerPeoplePageDto> {
    return this.operations.people(UserRole.STUDENT, options);
  }
  @Get('students/:studentId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Manager read: students/:studentId' })
  @ApiOkResponse({ type: ManagerPersonDto })
  async student(
    @Param('studentId', new ParseUUIDPipe({ version: '4' })) studentId: string,
  ): Promise<ManagerPersonDto> {
    return this.operations.person(studentId, UserRole.STUDENT);
  }
  @Get('mentors/:mentorId/classes')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Manager read: mentors/:mentorId/classes' })
  @ApiOkResponse({ type: ManagerMentorClassesPageDto })
  async mentorClasses(
    @Param('mentorId', new ParseUUIDPipe({ version: '4' })) mentorId: string,
    @Query() options: ManagerMentorClassesQueryDto,
  ): Promise<ManagerMentorClassesPageDto> {
    return this.operations.mentorClasses(mentorId, options);
  }
  @Get('mentors/:mentorId/schedule')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Manager read: mentors/:mentorId/schedule' })
  @ApiOkResponse({ type: ManagerSchedulePageDto })
  async mentorSchedule(
    @Param('mentorId', new ParseUUIDPipe({ version: '4' })) mentorId: string,
    @Query() options: ManagerMentorScheduleQueryDto,
  ): Promise<ManagerSchedulePageDto> {
    return this.operations.mentorSchedule(mentorId, options);
  }
  @Get('students/:studentId/classes')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Manager read: students/:studentId/classes' })
  @ApiOkResponse({ type: ManagerStudentClassesPageDto })
  async studentClasses(
    @Param('studentId', new ParseUUIDPipe({ version: '4' })) studentId: string,
    @Query() options: ManagerStudentClassesQueryDto,
  ): Promise<ManagerStudentClassesPageDto> {
    return this.operations.studentClasses(studentId, options);
  }
  @Get('orders')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Manager read: orders' })
  @ApiOkResponse({ type: ManagerOrdersPageDto })
  async orders(@Query() options: ManagerOrdersQueryDto): Promise<ManagerOrdersPageDto> {
    return this.operations.listOrders(options);
  }
  @Get('orders/:orderId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Manager read: orders/:orderId' })
  @ApiOkResponse({ type: ManagerOrderDetailDto })
  async order(
    @Param('orderId', new ParseUUIDPipe({ version: '4' })) orderId: string,
  ): Promise<ManagerOrderDetailDto> {
    return this.operations.orderDetail(orderId);
  }
  @Get('payments')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Manager read: payments' })
  @ApiOkResponse({ type: ManagerPaymentsPageDto })
  async payments(@Query() options: ManagerPaymentsQueryDto): Promise<ManagerPaymentsPageDto> {
    return this.operations.listPayments(options);
  }
  @Get('payments/:paymentId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Manager read: payments/:paymentId' })
  @ApiOkResponse({ type: ManagerPaymentDto })
  async payment(
    @Param('paymentId', new ParseUUIDPipe({ version: '4' })) paymentId: string,
  ): Promise<ManagerPaymentDto> {
    return this.operations.paymentDetail(paymentId);
  }
  @Get('classes/:classId/students/:studentId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read student contact within an effective class enrollment' })
  @ApiOkResponse({ type: AdminClassStudentDetailDto })
  async classStudent(
    @Param('classId', new ParseUUIDPipe({ version: '4' })) classId: string,
    @Param('studentId', new ParseUUIDPipe({ version: '4' })) studentId: string,
  ): Promise<AdminClassStudentDetailDto> {
    return this.operations.classStudent(classId, studentId);
  }
}
