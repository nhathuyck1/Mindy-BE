import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { TimestampedEntity } from '../../../common/database/base.entity.js';

/** One mutable cart per student. */
@Entity({ name: 'carts' })
export class CartEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'student_id', type: 'uuid', unique: true })
  studentId!: string;
}
