import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SystemRulesController } from './system-rules.controller.js';
import { SystemRulesService } from './system-rules.service.js';

@Module({
  imports: [AuthModule],
  controllers: [SystemRulesController],
  providers: [SystemRulesService],
})
export class SystemSettingsModule {}
