import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module.js';
import { ClassesModule } from '../classes/classes.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';
import { CartController } from './controllers/cart.controller.js';
import { OrdersController } from './controllers/orders.controller.js';
import { CartEntity } from './entities/cart.entity.js';
import { CartDetailEntity } from './entities/cart-detail.entity.js';
import { OrderEntity } from './entities/order.entity.js';
import { OrderDetailEntity } from './entities/order-detail.entity.js';
import { CartService } from './services/cart.service.js';
import { CheckoutService } from './services/checkout.service.js';
import { OrderExpiryService } from './services/order-expiry.service.js';
import { OrderExpiryWorker } from './services/order-expiry.worker.js';
import { OrderSettlementService } from './services/order-settlement.service.js';
import { OrdersService } from './services/orders.service.js';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    ClassesModule,
    EnrollmentsModule,
    TypeOrmModule.forFeature([CartEntity, CartDetailEntity, OrderEntity, OrderDetailEntity]),
  ],
  controllers: [CartController, OrdersController],
  providers: [
    CartService,
    CheckoutService,
    OrdersService,
    OrderExpiryService,
    OrderExpiryWorker,
    OrderSettlementService,
  ],
  exports: [OrderSettlementService],
})
export class CommerceModule {}
