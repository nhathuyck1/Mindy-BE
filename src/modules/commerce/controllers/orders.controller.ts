import { Controller, Get, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
import { OrderDto, OrderPageDto } from '../dtos/order.dto.js';
// biome-ignore lint/style/useImportType: Nest request validation needs runtime DTO metadata.
import { OrderPageOptionsDto } from '../dtos/order-page-options.dto.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { OrdersService } from '../services/orders.service.js';

@ApiTags('orders')
@Controller('me/orders')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.STUDENT)
@ApiCookieAuth('access_token')
@ApiErrors(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'List my orders, newest first' })
  @ApiOkResponse({ type: OrderPageDto })
  @ApiErrors(HttpStatus.UNPROCESSABLE_ENTITY)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() options: OrderPageOptionsDto,
  ): Promise<OrderPageDto> {
    const result = await this.ordersService.listForStudent(user.userId, options);
    return new OrderPageDto(
      result.items.map((order) => new OrderDto(order)),
      options.page,
      options.pageSize,
      result.total,
    );
  }
}
