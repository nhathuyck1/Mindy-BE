import type { QuizAnswer, QuizQuestion, QuizResult } from './domain/quiz.js';

/** Internal SQL rows. Explicit DTO projections are required at the HTTP boundary. */
export interface AssignmentRow {
  id: string;
  session_id: string;
  purpose: 'TEST' | 'HOMEWORK';
  type: 'QUIZ' | 'ZIP';
  title: string;
  description: string;
  max_score: string;
  due_at: Date | null;
  time_limit_minutes: number | null;
  max_attempts: number;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  revision: number;
  published_at: Date | null;
  deleted_at: Date | null;
}
export interface QuizSnapshot {
  readonly title: string;
  readonly maxScore: string;
  readonly questions: QuizQuestion[];
}
export interface SubmissionRow {
  id: string;
  assignment_id: string;
  student_id: string;
  enrollment_id: string;
  status: 'IN_PROGRESS' | 'GRADED' | 'VOIDED';
  version: number;
  started_at: Date;
  expires_at: Date | null;
  submitted_at: Date | null;
  submission_source: 'MANUAL' | 'TIMEOUT' | null;
  assignment_snapshot: QuizSnapshot;
  answers: QuizAnswer[];
  result: QuizResult | null;
}
