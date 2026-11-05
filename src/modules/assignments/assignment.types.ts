import type { CodeCompareMode, CodeScoringMode } from './domain/code-grading.js';
import type { CodeLanguageKey } from './domain/code-signature.js';
import type { QuizAnswer, QuizQuestion, QuizResult } from './domain/quiz.js';

/** Internal SQL rows. Explicit DTO projections are required at the HTTP boundary. */
export interface AssignmentRow {
  id: string;
  session_id: string;
  purpose: 'TEST' | 'HOMEWORK';
  type: 'QUIZ' | 'ZIP' | 'CODE';
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
  created_by: string;
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

/** Phase 7 CODE rows (internal; DTOs project them explicitly). */
export interface CodeLanguageRow {
  key: CodeLanguageKey;
  display_name: string;
  runtime_version: string;
  editor_mode: string;
  time_multiplier: string;
  enabled: boolean;
}
export interface CodeProblemRow {
  assignment_id: string;
  statement_md: string;
  constraints_md: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD' | null;
  signature: unknown;
  compare_mode: CodeCompareMode;
  float_epsilon: string | null;
  scoring_mode: CodeScoringMode;
  cpu_time_limit_ms: number;
  memory_limit_mb: number;
  validated_revision: number | null;
}
export interface CodeProblemLanguageRow {
  language_key: CodeLanguageKey;
  starter_code: string;
}
export interface CodeTestRow {
  id: string;
  position: number;
  visibility: 'SAMPLE' | 'HIDDEN';
  input_args: unknown[];
  expected: unknown;
  weight: number;
  explanation_md: string | null;
}
export interface CodeReferenceRow {
  language_key: CodeLanguageKey;
  source_code: string;
  last_validation: unknown;
  validated_at: Date | null;
}
export interface CodeSubmissionRow {
  id: string;
  assignment_id: string;
  student_id: string;
  enrollment_id: string;
  attempt_number: number;
  assignment_revision: number;
  language_key: CodeLanguageKey;
  runtime_version: string | null;
  source_code: string;
  status: 'QUEUED' | 'RUNNING' | 'GRADED' | 'FAILED' | 'VOIDED';
  verdict: string | null;
  counts_as_attempt: boolean;
  passed_count: number | null;
  total_count: number | null;
  score: string | null;
  max_score: string;
  compile_output: string | null;
  max_time_ms: number | null;
  max_memory_kb: number | null;
  submitted_at: Date;
  judged_at: Date | null;
  voided_reason: string | null;
}
export interface CodeSubmissionTestRow {
  test_case_id: string;
  position: number;
  visibility: 'SAMPLE' | 'HIDDEN';
  status: string;
  time_ms: number | null;
  memory_kb: number | null;
  actual: unknown;
  console_excerpt: string | null;
  input_args: unknown[] | null;
  expected: unknown;
}
