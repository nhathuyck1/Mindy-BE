import { ApiProperty } from '@nestjs/swagger';

import { DeliveryMode } from '../../classes/enums/delivery-mode.enum.js';
import type { CartItemView } from '../services/cart.service.js';

export class CartItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly classId: string;

  @ApiProperty({ type: String })
  readonly classCode: string;

  @ApiProperty({ type: String })
  readonly className: string;

  @ApiProperty({ type: String, format: 'uuid' })
  readonly courseId: string;

  @ApiProperty({ type: String })
  readonly courseTitle: string;

  @ApiProperty({ type: String, enum: DeliveryMode })
  readonly deliveryMode: DeliveryMode;

  @ApiProperty({ type: String, format: 'date' })
  readonly startDate: string;

  @ApiProperty({ type: String, format: 'date' })
  readonly endDate: string;

  @ApiProperty({ type: Number, description: 'VND price shown when the class was added' })
  readonly priceSnapshot: number;

  @ApiProperty({ type: Number, description: 'Current VND price; this is what checkout charges' })
  readonly currentPriceAmount: number;

  @ApiProperty({ type: Boolean, description: 'False when the class can no longer be purchased' })
  readonly isPurchasable: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly addedAt: Date;

  constructor(item: CartItemView) {
    this.classId = item.offer.classId;
    this.classCode = item.offer.code;
    this.className = item.offer.name;
    this.courseId = item.offer.courseId;
    this.courseTitle = item.offer.courseTitle;
    this.deliveryMode = item.offer.deliveryMode;
    this.startDate = item.offer.startDate;
    this.endDate = item.offer.endDate;
    this.priceSnapshot = item.detail.priceSnapshot;
    this.currentPriceAmount = item.offer.priceAmount;
    this.isPurchasable = item.offer.isPurchasable;
    this.addedAt = item.detail.createdAt;
  }
}

export class CartDto {
  @ApiProperty({ type: () => CartItemDto, isArray: true })
  readonly items: CartItemDto[];

  @ApiProperty({ type: Number, description: 'Sum of current prices in VND; display only' })
  readonly totalAmount: number;

  constructor(items: readonly CartItemView[]) {
    this.items = items.map((item) => new CartItemDto(item));
    this.totalAmount = this.items.reduce((total, item) => total + item.currentPriceAmount, 0);
  }
}
