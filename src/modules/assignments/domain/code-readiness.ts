/** Publication gate for CODE assignments (Phase 7 §7.3, decision D11). */
export interface CodeReadinessInput {
  readonly hasProblem: boolean;
  readonly statementMd: string;
  readonly languageCount: number;
  readonly sampleCount: number;
  readonly hiddenCount: number;
  readonly referenceCount: number;
  readonly validatedRevision: number | null;
  readonly revision: number;
}

export type CodeReadinessBlocker =
  | 'CODE_PROBLEM_REQUIRED'
  | 'CODE_STATEMENT_REQUIRED'
  | 'CODE_LANGUAGES_REQUIRED'
  | 'CODE_SAMPLE_TEST_REQUIRED'
  | 'CODE_HIDDEN_TEST_REQUIRED'
  | 'CODE_REFERENCE_REQUIRED'
  | 'CODE_REFERENCE_NOT_VALIDATED';

/** Every unmet requirement, in the order the mentor wizard presents them. */
export function codeReadinessBlockers(input: CodeReadinessInput): CodeReadinessBlocker[] {
  if (!input.hasProblem) return ['CODE_PROBLEM_REQUIRED'];
  const blockers: CodeReadinessBlocker[] = [];
  if (!input.statementMd.trim()) blockers.push('CODE_STATEMENT_REQUIRED');
  if (input.languageCount < 1) blockers.push('CODE_LANGUAGES_REQUIRED');
  if (input.sampleCount < 1) blockers.push('CODE_SAMPLE_TEST_REQUIRED');
  if (input.hiddenCount < 1) blockers.push('CODE_HIDDEN_TEST_REQUIRED');
  if (input.referenceCount < 1) blockers.push('CODE_REFERENCE_REQUIRED');
  if (input.validatedRevision !== input.revision) blockers.push('CODE_REFERENCE_NOT_VALIDATED');
  return blockers;
}
