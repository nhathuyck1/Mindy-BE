import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { TimestampedEntity } from '../../../common/database/base.entity.js';
import { numericColumnTransformer } from '../../../common/database/column-transformers.js';

@Entity({ name: 'courses' })
@Index('idx_courses_category_active', ['categoryId', 'isActive'])
@Index('idx_courses_active_title', ['isActive', 'title'])
export class CourseEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId!: string;

  @Column({ name: 'code', type: 'varchar', length: 50, unique: true })
  code!: string;

  @Column({ name: 'title', type: 'varchar', length: 250 })
  title!: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'img_url', type: 'varchar', length: 2048, nullable: true })
  imgUrl!: string | null;

  /** Integer VND amount shared by every class of this course. */
  @Column({
    name: 'price_amount',
    type: 'bigint',
    default: 0,
    transformer: numericColumnTransformer,
  })
  priceAmount!: number;

  // The database default follows the DBML; the application always creates courses inactive.
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
