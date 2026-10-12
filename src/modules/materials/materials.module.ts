import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { ClassesModule } from '../classes/classes.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';
import { FilesModule } from '../files/files.module.js';
import { UsersModule } from '../users/users.module.js';
import { StudentMaterialsController } from './controllers/student-materials.controller.js';
import { MaterialEntity } from './entities/material.entity.js';
import { MaterialPolicyService } from './services/material-policy.service.js';
import { StudentMaterialsService } from './services/student-materials.service.js';

/** Policy + Student read slice. Manager/Mentor authoring remains Phase 3.3. */
@Module({
  imports: [
    AuthModule,
    UsersModule,
    CatalogModule,
    ClassesModule,
    EnrollmentsModule,
    FilesModule,
    TypeOrmModule.forFeature([MaterialEntity]),
  ],
  controllers: [StudentMaterialsController],
  providers: [MaterialPolicyService, StudentMaterialsService],
  exports: [MaterialPolicyService],
})
export class MaterialsModule {}
