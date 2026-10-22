import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { TrackingController } from './tracking.controller.js';
import { TrackingService } from './tracking.service.js';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [TrackingController],
  providers: [TrackingService],
})
export class TrackingModule {}
