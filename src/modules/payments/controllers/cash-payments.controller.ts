import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
// biome-ignore lint/style/useImportType: Nest validation requires runtime DTO.
import { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { ClassDetailDto } from '../../classes/dtos/class.dto.js';
import { OrderDto, OrderPageDto } from '../../commerce/dtos/order.dto.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest validation requires runtime DTO.
import { ConfirmCashDto } from '../dtos/confirm-cash.dto.js';
// biome-ignore lint/style/useImportType: Nest DI requires runtime constructor.
import { CashPaymentsService } from '../services/cash-payments.service.js';

@ApiTags('cash payments')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.MENTOR)
@ApiErrors(
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
  HttpStatus.CONFLICT,
  HttpStatus.UNPROCESSABLE_ENTITY,
)
@Controller('mentor/cash-orders')
export class CashPaymentsController {
  constructor(private readonly cash: CashPaymentsService) {}
  @Get()
  @ApiOkResponse({ type: OrderPageDto })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() options: PageOptionsDto,
  ): Promise<OrderPageDto> {
    const result = await this.cash.list(user.userId, options);
    return new OrderPageDto(
      result.items.map((o) => new OrderDto(o)),
      options.page,
      options.pageSize,
      result.total,
    );
  }
  @Post(':orderId/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assigned cash mentor confirms full amount; retries are idempotent' })
  @ApiOkResponse({ type: OrderDto })
  async confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', new ParseUUIDPipe()) id: string,
    @Body() body: ConfirmCashDto,
  ): Promise<OrderDto> {
    return new OrderDto(await this.cash.confirm(user.userId, id, body.receivedAmount));
  }
}

@ApiTags('student classes')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.STUDENT)
@ApiErrors(
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
  HttpStatus.UNPROCESSABLE_ENTITY,
)
@Controller('me/classes')
export class CashPreviewController {
  constructor(private readonly cash: CashPaymentsService) {}
  @Get(':classId/preview')
  @ApiOperation({ summary: 'Pending CASH owner sees titles/timetable/room only' })
  @ApiOkResponse({ type: ClassDetailDto })
  async preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('classId', new ParseUUIDPipe()) id: string,
  ): Promise<ClassDetailDto> {
    return new ClassDetailDto(await this.cash.preview(user.userId, id));
  }
}
