import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { ClassesModule } from '../classes/classes.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';
import { FilesModule } from '../files/files.module.js';
import { UsersModule } from '../users/users.module.js';
import { ManagerMaterialsController } from './controllers/manager-materials.controller.js';
import { MentorMaterialsController } from './controllers/mentor-materials.controller.js';
import { StudentMaterialsController } from './controllers/student-materials.controller.js';
import { MaterialEntity } from './entities/material.entity.js';
import { MaterialAuditEventEntity } from './entities/material-audit-event.entity.js';
import { MaterialFileReferenceEntity } from './entities/material-file-reference.entity.js';
import { MaterialOriginGuard } from './guards/material-origin.guard.js';
import { MaterialAuthoringService } from './services/material-authoring.service.js';
import { MaterialPolicyService } from './services/material-policy.service.js';
import { StudentMaterialsService } from './services/student-materials.service.js';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    CatalogModule,
    ClassesModule,
    EnrollmentsModule,
    FilesModule,
    TypeOrmModule.forFeature([
      MaterialEntity,
      MaterialFileReferenceEntity,
      MaterialAuditEventEntity,
    ]),
  ],
  controllers: [StudentMaterialsController, ManagerMaterialsController, MentorMaterialsController],
  providers: [
    MaterialPolicyService,
    StudentMaterialsService,
    MaterialAuthoringService,
    MaterialOriginGuard,
  ],
  exports: [MaterialPolicyService],
})
export class MaterialsModule {}
