import { Module } from '@nestjs/common';

import { CatalogModule } from '../catalog/catalog.module.js';
import { ClassesModule } from '../classes/classes.module.js';
import { CourseBrowseController } from './controllers/course-browse.controller.js';
import { CourseBrowseService } from './services/course-browse.service.js';

/** Public browsing of active courses and their open classes. */
@Module({
  imports: [CatalogModule, ClassesModule],
  controllers: [CourseBrowseController],
  providers: [CourseBrowseService],
})
export class CourseBrowseModule {}
