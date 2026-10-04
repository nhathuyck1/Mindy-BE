import type { ClassEntity } from '../entities/class.entity.js';
import type { ClassSessionEntity } from '../entities/class-session.entity.js';
import type { ClassUnitEntity } from '../entities/class-unit.entity.js';

/** A class together with the read-side data every listing needs. */
export interface ClassView {
  readonly classEntity: ClassEntity;
  readonly mentorName: string | null;
  readonly occupiedSeats: number;
}

export interface ClassUnitView {
  readonly unit: ClassUnitEntity;
  /** Title of the course unit this class unit delivers. */
  readonly title: string;
  readonly sessions: ClassSessionEntity[];
}

export interface ClassDetailView extends ClassView {
  readonly units: ClassUnitView[];
}
