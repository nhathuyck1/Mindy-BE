import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
// biome-ignore lint/style/useImportType: Nest DI requires runtime constructor.
import { DataSource } from 'typeorm';
// biome-ignore lint/style/useImportType: Nest validation needs runtime DTO.
import { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import type { RequestWithContext } from '../../../common/http/request-context.js';
import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { OrderDto } from '../../commerce/dtos/order.dto.js';
import type { OrderWithDetails } from '../../commerce/services/checkout.service.js';
// biome-ignore lint/style/useImportType: Exported commerce provider.
import { OrderSettlementService } from '../../commerce/services/order-settlement.service.js';
import { UserRole } from '../../users/user-role.enum.js';
import { PaymentDto, WebhookAckDto } from '../dtos/payment.dto.js';
// biome-ignore lint/style/useImportType: Nest request validation requires runtime DTO.
import { PaymentResultQueryDto } from '../dtos/payment-result-query.dto.js';
import { ReconciliationPageDto, ReconciliationResultDto } from '../dtos/reconciliation.dto.js';
// biome-ignore lint/style/useImportType: Nest DI requires runtime constructor.
import { PaymentLinksService } from '../services/payment-links.service.js';
// biome-ignore lint/style/useImportType: Nest DI requires runtime constructor.
import { PaymentReconciliationService } from '../services/payment-reconciliation.service.js';
// biome-ignore lint/style/useImportType: Nest DI requires runtime constructor.
import { PaymentSettlementService } from '../services/payment-settlement.service.js';

class EmptyPaymentRequestDto {}

export class OrderPaymentDto extends OrderDto {
  @ApiProperty({ type: () => PaymentDto, nullable: true }) readonly payment: PaymentDto | null;
  constructor(order: OrderWithDetails, payment: PaymentDto | null) {
    super(order);
    this.payment = payment;
  }
}

@ApiTags('payments')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.STUDENT)
@ApiErrors(
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
  HttpStatus.CONFLICT,
  HttpStatus.UNPROCESSABLE_ENTITY,
  HttpStatus.SERVICE_UNAVAILABLE,
)
@Controller('me/orders')
export class PaymentsController {
  constructor(
    private readonly links: PaymentLinksService,
    private readonly orders: OrderSettlementService,
    private readonly db: DataSource,
  ) {}
  @Get('payment-result')
  @ApiOperation({
    summary: 'Resolve payOS redirect orderCode to my order; redirect never confirms payment',
  })
  @ApiOkResponse({ type: OrderPaymentDto })
  async result(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaymentResultQueryDto,
  ): Promise<OrderPaymentDto> {
    return this.get(user, await this.links.resolveOrder(user.userId, query.orderCode));
  }
  @Get(':orderId')
  @ApiOkResponse({ type: OrderPaymentDto })
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', new ParseUUIDPipe()) id: string,
  ): Promise<OrderPaymentDto> {
    const order = await this.orders.read(this.db.manager, id, user.userId);
    return new OrderPaymentDto(order, await this.links.get(user.userId, id));
  }
  @Post(':orderId/payments/payos')
  @ApiOperation({ summary: 'Create or reuse a payOS payment link; CREATING means retry later' })
  @ApiCreatedResponse({ type: PaymentDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', new ParseUUIDPipe()) id: string,
    @Body() _body: EmptyPaymentRequestDto,
  ): Promise<PaymentDto> {
    return this.links.create(user.userId, id);
  }
}

/** Public provider ingress; signed payload is validated by the adapter, not whitelist DTOs. */
@ApiTags('payment callbacks')
@Controller('payment-callbacks')
export class PaymentCallbacksController {
  private readonly logger = new Logger(PaymentCallbacksController.name);
  constructor(private readonly settlement: PaymentSettlementService) {}
  @Post('payos')
  @HttpCode(HttpStatus.OK)
  @ApiBody({
    schema: {
      type: 'object',
      required: ['code', 'desc', 'success', 'data', 'signature'],
      properties: {
        code: { type: 'string' },
        desc: { type: 'string' },
        success: { type: 'boolean' },
        signature: { type: 'string' },
        data: { type: 'object', additionalProperties: true },
      },
    },
  })
  @ApiOkResponse({ type: WebhookAckDto })
  @ApiErrors(
    HttpStatus.BAD_REQUEST,
    HttpStatus.PAYLOAD_TOO_LARGE,
    HttpStatus.SERVICE_UNAVAILABLE,
    HttpStatus.INTERNAL_SERVER_ERROR,
  )
  async webhook(@Body() body: unknown, @Req() request: RequestWithContext): Promise<WebhookAckDto> {
    const started = performance.now();
    const outcome = await this.settlement.webhook(body);
    this.logger.log(
      JSON.stringify({
        requestId: request.requestId,
        outcome,
        status: 200,
        latencyMs: Math.round((performance.now() - started) * 100) / 100,
      }),
    );
    return new WebhookAckDto();
  }
}

@ApiTags('payment reconciliation')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiErrors(
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.CONFLICT,
  HttpStatus.UNPROCESSABLE_ENTITY,
  HttpStatus.SERVICE_UNAVAILABLE,
)
@Controller('admin/payments')
export class PaymentReconciliationController {
  constructor(private readonly review: PaymentReconciliationService) {}
  @Get('reconciliation')
  @ApiOkResponse({ type: ReconciliationPageDto })
  async list(@Query() options: PageOptionsDto): Promise<ReconciliationPageDto> {
    const result = await this.review.list(options);
    return new ReconciliationPageDto(result.items, result.total, options.page, options.pageSize);
  }
  @Post(':paymentId/reconcile')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ReconciliationResultDto })
  async reconcile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('paymentId', new ParseUUIDPipe()) id: string,
    @Body() _body: EmptyPaymentRequestDto,
  ): Promise<ReconciliationResultDto> {
    return new ReconciliationResultDto((await this.review.reconcile(id, user.userId)).status);
  }
}
