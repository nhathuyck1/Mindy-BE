import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

import { TimestampedEntity } from '../../../common/database/base.entity.js';
import { numericColumnTransformer } from '../../../common/database/column-transformers.js';

@Entity({ name: 'course_units' })
@Unique('uq_course_units_course_number', ['courseId', 'unitNumber'], {
  deferrable: 'INITIALLY IMMEDIATE',
})
export class CourseUnitEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'course_id', type: 'uuid' })
  courseId!: string;

  @Column({ name: 'unit_number', type: 'integer' })
  unitNumber!: number;

  @Column({ name: 'title', type: 'varchar', length: 250 })
  title!: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null;

  @Column({
    name: 'required_score_percent',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 80,
    transformer: numericColumnTransformer,
  })
  requiredScorePercent!: number;
}
