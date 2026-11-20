import { ApiProperty } from '@nestjs/swagger';

import type { CourseCategoryEntity } from '../entities/course-category.entity.js';

export class CourseCategoryDto {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly id: string;

  @ApiProperty({ type: String })
  readonly name: string;

  @ApiProperty({ type: String })
  readonly slug: string;

  @ApiProperty({ type: String, nullable: true })
  readonly description: string | null;

  @ApiProperty({ type: Boolean })
  readonly isActive: boolean;

  constructor(category: CourseCategoryEntity) {
    this.id = category.id;
    this.name = category.name;
    this.slug = category.slug;
    this.description = category.description;
    this.isActive = category.isActive;
  }
}

export class CourseCategoryPageDto {
  @ApiProperty({ type: () => CourseCategoryDto, isArray: true })
  readonly items: CourseCategoryDto[];

  @ApiProperty({ type: Number, example: 1 })
  readonly page: number;

  @ApiProperty({ type: Number, example: 20 })
  readonly pageSize: number;

  @ApiProperty({ type: Number, example: 42 })
  readonly total: number;

  constructor(items: CourseCategoryDto[], page: number, pageSize: number, total: number) {
    this.items = items;
    this.page = page;
    this.pageSize = pageSize;
    this.total = total;
  }
}
