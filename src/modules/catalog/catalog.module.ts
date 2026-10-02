import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module.js';
import { AdminCatalogController } from './controllers/admin-catalog.controller.js';
import { CourseCategoriesController } from './controllers/course-categories.controller.js';
import { CourseEntity } from './entities/course.entity.js';
import { CourseCategoryEntity } from './entities/course-category.entity.js';
import { CourseUnitEntity } from './entities/course-unit.entity.js';
import { CourseCategoriesService } from './services/course-categories.service.js';
import { CoursesService } from './services/courses.service.js';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([CourseCategoryEntity, CourseEntity, CourseUnitEntity]),
  ],
  controllers: [CourseCategoriesController, AdminCatalogController],
  providers: [CourseCategoriesService, CoursesService],
  exports: [CoursesService],
})
export class CatalogModule {}
