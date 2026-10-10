import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { ClassesModule } from '../classes/classes.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';
import { FilesModule } from '../files/files.module.js';
import { UsersModule } from '../users/users.module.js';
import { MaterialPolicyService } from './services/material-policy.service.js';

/** Phase 3.1 exports policy only; HTTP/persistence/storage are subsequent slices. */
@Module({
  imports: [UsersModule, CatalogModule, ClassesModule, EnrollmentsModule, FilesModule],
  providers: [MaterialPolicyService],
  exports: [MaterialPolicyService],
})
export class MaterialsModule {}
