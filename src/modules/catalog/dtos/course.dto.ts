import { ApiProperty } from '@nestjs/swagger';

import type { CourseEntity } from '../entities/course.entity.js';
import type { CourseCategoryEntity } from '../entities/course-category.entity.js';
import type { CourseUnitEntity } from '../entities/course-unit.entity.js';

export class CourseCategoryRefDto {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly id: string;

  @ApiProperty({ type: String })
  readonly name: string;

  @ApiProperty({ type: String })
  readonly slug: string;

  constructor(category: CourseCategoryEntity) {
    this.id = category.id;
    this.name = category.name;
    this.slug = category.slug;
  }
}

export class CourseUnitDto {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly id: string;

  @ApiProperty({ type: Number, example: 1 })
  readonly unitNumber: number;

  @ApiProperty({ type: String })
  readonly title: string;

  @ApiProperty({ type: String, nullable: true })
  readonly description: string | null;

  @ApiProperty({ type: Number, example: 80 })
  readonly requiredScorePercent: number;

  constructor(unit: CourseUnitEntity) {
    this.id = unit.id;
    this.unitNumber = unit.unitNumber;
    this.title = unit.title;
    this.description = unit.description;
    this.requiredScorePercent = unit.requiredScorePercent;
  }
}

/** Public course fields shared by list items and detail views. */
export class CourseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly id: string;

  @ApiProperty({ type: String, example: 'WEB101' })
  readonly code: string;

  @ApiProperty({ type: String })
  readonly title: string;

  @ApiProperty({ type: String, nullable: true })
  readonly description: string | null;

  @ApiProperty({ type: String, format: 'uri', nullable: true, maxLength: 2048 })
  readonly imgUrl: string | null;

  @ApiProperty({ type: Number, example: 2_500_000, description: 'Integer VND amount' })
  readonly priceAmount: number;

  @ApiProperty({ type: () => CourseCategoryRefDto })
  readonly category: CourseCategoryRefDto;

  constructor(course: CourseEntity, category: CourseCategoryEntity) {
    this.id = course.id;
    this.code = course.code;
    this.title = course.title;
    this.description = course.description;
    this.imgUrl = course.imgUrl;
    this.priceAmount = course.priceAmount;
    this.category = new CourseCategoryRefDto(category);
  }
}

export class CoursePageDto {
  @ApiProperty({ type: () => CourseDto, isArray: true })
  readonly items: CourseDto[];

  @ApiProperty({ type: Number, example: 1 })
  readonly page: number;

  @ApiProperty({ type: Number, example: 20 })
  readonly pageSize: number;

  @ApiProperty({ type: Number, example: 42 })
  readonly total: number;

  constructor(items: CourseDto[], page: number, pageSize: number, total: number) {
    this.items = items;
    this.page = page;
    this.pageSize = pageSize;
    this.total = total;
  }
}

/** Management view: adds activation state and audit timestamps. */
export class CourseManagementDto extends CourseDto {
  @ApiProperty({ type: Boolean })
  readonly isActive: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly updatedAt: Date;

  constructor(course: CourseEntity, category: CourseCategoryEntity) {
    super(course, category);
    this.isActive = course.isActive;
    this.createdAt = course.createdAt;
    this.updatedAt = course.updatedAt;
  }
}

export class CourseManagementDetailDto extends CourseManagementDto {
  @ApiProperty({ type: () => CourseUnitDto, isArray: true })
  readonly units: CourseUnitDto[];

  constructor(course: CourseEntity, category: CourseCategoryEntity, units: CourseUnitEntity[]) {
    super(course, category);
    this.units = units.map((unit) => new CourseUnitDto(unit));
  }
}

export class CourseManagementPageDto {
  @ApiProperty({ type: () => CourseManagementDto, isArray: true })
  readonly items: CourseManagementDto[];

  @ApiProperty({ type: Number, example: 1 })
  readonly page: number;

  @ApiProperty({ type: Number, example: 20 })
  readonly pageSize: number;

  @ApiProperty({ type: Number, example: 42 })
  readonly total: number;

  constructor(items: CourseManagementDto[], page: number, pageSize: number, total: number) {
    this.items = items;
    this.page = page;
    this.pageSize = pageSize;
    this.total = total;
  }
}
