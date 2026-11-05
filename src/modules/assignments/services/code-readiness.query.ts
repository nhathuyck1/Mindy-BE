import type { EntityManager } from 'typeorm';
import { type CodeReadinessBlocker, codeReadinessBlockers } from '../domain/code-readiness.js';

/** Loads the publication gate inputs for one CODE draft inside the caller's transaction. */
export async function loadCodeReadiness(
  m: EntityManager,
  assignmentId: string,
  revision: number,
): Promise<CodeReadinessBlocker[]> {
  const rows: {
    statement_md: string;
    validated_revision: number | null;
    languages: number;
    samples: number;
    hidden: number;
    refs: number;
  }[] = await m.query(
    `SELECT p.statement_md, p.validated_revision,
      (SELECT count(*)::int FROM code_problem_languages l WHERE l.assignment_id = p.assignment_id) AS languages,
      (SELECT count(*)::int FROM code_test_cases t WHERE t.assignment_id = p.assignment_id AND t.visibility = 'SAMPLE') AS samples,
      (SELECT count(*)::int FROM code_test_cases t WHERE t.assignment_id = p.assignment_id AND t.visibility = 'HIDDEN') AS hidden,
      (SELECT count(*)::int FROM code_reference_solutions r WHERE r.assignment_id = p.assignment_id) AS refs
    FROM code_problems p WHERE p.assignment_id = $1`,
    [assignmentId],
  );
  const state = rows[0];
  return codeReadinessBlockers({
    hasProblem: Boolean(state),
    statementMd: state?.statement_md ?? '',
    languageCount: state?.languages ?? 0,
    sampleCount: state?.samples ?? 0,
    hiddenCount: state?.hidden ?? 0,
    referenceCount: state?.refs ?? 0,
    validatedRevision: state?.validated_revision ?? null,
    revision,
  });
}
