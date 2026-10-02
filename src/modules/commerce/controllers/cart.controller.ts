import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest request validation needs runtime DTO metadata.
import { AddCartItemDto } from '../dtos/add-cart-item.dto.js';
import { CartDto } from '../dtos/cart.dto.js';
// biome-ignore lint/style/useImportType: Nest request validation needs runtime DTO metadata.
import { CheckoutDto } from '../dtos/checkout.dto.js';
import { CheckoutResultDto } from '../dtos/order.dto.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { CartService } from '../services/cart.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { CheckoutService } from '../services/checkout.service.js';

/** The cart always belongs to the signed-in student; no student ID is accepted from the client. */
@ApiTags('cart')
@Controller('me/cart')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.STUDENT)
@ApiCookieAuth('access_token')
@ApiErrors(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN)
export class CartController {
  constructor(
    private readonly cartService: CartService,
    private readonly checkoutService: CheckoutService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get my cart with current prices' })
  @ApiOkResponse({ type: CartDto })
  async get(@CurrentUser() user: AuthenticatedUser): Promise<CartDto> {
    return new CartDto(await this.cartService.getCart(user.userId));
  }

  @Post('items')
  @ApiOperation({ summary: 'Add an open class to my cart' })
  @ApiCreatedResponse({ type: CartDto })
  @ApiErrors(HttpStatus.NOT_FOUND, HttpStatus.CONFLICT, HttpStatus.UNPROCESSABLE_ENTITY)
  async addItem(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddCartItemDto,
  ): Promise<CartDto> {
    return new CartDto(await this.cartService.addItem(user.userId, dto.classId));
  }

  @Delete('items/:classId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a class from my cart' })
  @ApiNoContentResponse()
  @ApiErrors(HttpStatus.NOT_FOUND)
  async removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('classId', new ParseUUIDPipe()) classId: string,
  ): Promise<void> {
    await this.cartService.removeItem(user.userId, classId);
  }

  @Post('checkout')
  @ApiOperation({
    summary: 'Check out the whole cart into pending order(s) and hold the seats',
    description:
      'PayOS creates one order for the cart; cash creates one order per mentor. All orders ' +
      'are created in one transaction, or none is. Payment is a separate step.',
  })
  @ApiCreatedResponse({ type: CheckoutResultDto })
  @ApiErrors(HttpStatus.CONFLICT, HttpStatus.UNPROCESSABLE_ENTITY)
  async checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CheckoutDto,
  ): Promise<CheckoutResultDto> {
    return new CheckoutResultDto(await this.checkoutService.checkout(user.userId, dto.paymentType));
  }
}
