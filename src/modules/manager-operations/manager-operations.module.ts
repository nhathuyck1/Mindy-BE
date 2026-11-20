import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { ClassesModule } from '../classes/classes.module.js';
import { CommerceModule } from '../commerce/commerce.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { UsersModule } from '../users/users.module.js';
import { ManagerOperationsController } from './manager-operations.controller.js';
import { ManagerOperationsService } from './services/manager-operations.service.js';
@Module({
  imports: [
    AuthModule,
    UsersModule,
    CatalogModule,
    ClassesModule,
    EnrollmentsModule,
    CommerceModule,
    PaymentsModule,
  ],
  controllers: [ManagerOperationsController],
  providers: [ManagerOperationsService],
})
export class ManagerOperationsModule {}
