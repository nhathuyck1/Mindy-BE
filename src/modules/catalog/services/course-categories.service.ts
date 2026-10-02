import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { DataSource } from 'typeorm';

import { isUniqueViolation } from '../../../common/database/postgres-error.js';
import { normalizeOptionalText } from '../../../common/text/normalize-text.js';
import { slugify } from '../domain/slug.js';
import type { CreateCourseCategoryDto } from '../dtos/create-course-category.dto.js';
import { CourseCategoryEntity } from '../entities/course-category.entity.js';
import {
  CourseCategorySlugAlreadyExistsException,
  CourseCategorySlugRequiredException,
} from '../exceptions/catalog.exceptions.js';

@Injectable()
export class CourseCategoriesService {
  constructor(private readonly dataSource: DataSource) {}

  async create(input: CreateCourseCategoryDto): Promise<CourseCategoryEntity> {
    const categories = this.dataSource.getRepository(CourseCategoryEntity);
    const name = input.name.trim();
    const slug = input.slug ?? slugify(name);
    if (slug.length === 0) {
      throw new CourseCategorySlugRequiredException();
    }
    if (await categories.exists({ where: { slug } })) {
      throw new CourseCategorySlugAlreadyExistsException();
    }

    try {
      return await categories.save(
        categories.create({
          name,
          slug,
          description: normalizeOptionalText(input.description),
          isActive: true,
        }),
      );
    } catch (error: unknown) {
      if (isUniqueViolation(error, 'uq_course_categories_slug')) {
        throw new CourseCategorySlugAlreadyExistsException();
      }

      throw error;
    }
  }

  async listActive(
    page: number,
    pageSize: number,
  ): Promise<{ items: CourseCategoryEntity[]; total: number }> {
    const [items, total] = await this.dataSource.getRepository(CourseCategoryEntity).findAndCount({
      where: { isActive: true },
      order: { name: 'ASC', id: 'ASC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return { items, total };
  }
}
