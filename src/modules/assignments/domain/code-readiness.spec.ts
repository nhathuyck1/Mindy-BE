import { describe, expect, it } from 'vitest';
import { codeReadinessBlockers } from './code-readiness.js';

const ready = {
  hasProblem: true,
  statementMd: 'Return indices',
  languageCount: 2,
  sampleCount: 1,
  hiddenCount: 3,
  referenceCount: 1,
  validatedRevision: 7,
  revision: 7,
};

describe('CODE publication readiness', () => {
  it('allows a complete, validated problem', () => {
    expect(codeReadinessBlockers(ready)).toEqual([]);
  });

  it('requires a problem first', () => {
    expect(codeReadinessBlockers({ ...ready, hasProblem: false })).toEqual([
      'CODE_PROBLEM_REQUIRED',
    ]);
  });

  it('lists every missing piece and requires validation of the current revision', () => {
    expect(
      codeReadinessBlockers({
        ...ready,
        statementMd: '  ',
        languageCount: 0,
        sampleCount: 0,
        hiddenCount: 0,
        referenceCount: 0,
        validatedRevision: 6,
      }),
    ).toEqual([
      'CODE_STATEMENT_REQUIRED',
      'CODE_LANGUAGES_REQUIRED',
      'CODE_SAMPLE_TEST_REQUIRED',
      'CODE_HIDDEN_TEST_REQUIRED',
      'CODE_REFERENCE_REQUIRED',
      'CODE_REFERENCE_NOT_VALIDATED',
    ]);
    expect(codeReadinessBlockers({ ...ready, validatedRevision: null })).toEqual([
      'CODE_REFERENCE_NOT_VALIDATED',
    ]);
  });
});
