import { describe, expect, it } from 'vitest';
import { RESULT_PREFIX } from './code-driver.js';
import { gradeSubmission, judgeRetryDelaySeconds, runnerTestId, runStatus } from './code-judge.js';

const nonce = 'feedfacefeedfacefeed';
const line = (v: unknown, console = '') =>
  `${console}\n${RESULT_PREFIX}${nonce}:${JSON.stringify(v)}\n`;
const tests = [
  { id: 'a', position: 1, visibility: 'SAMPLE' as const, weight: 1, expected: [0, 1] },
  { id: 'b', position: 2, visibility: 'HIDDEN' as const, weight: 3, expected: [1, 2] },
];
const base = {
  tests,
  nonce,
  compare: { mode: 'EXACT' as const },
  scoringMode: 'PER_TEST' as const,
  maxScore: '10.00',
};

describe('CODE submission judging', () => {
  it('grades, weights and keeps outputs only for SAMPLE tests', () => {
    const outcome = gradeSubmission({
      ...base,
      report: {
        compile: { status: 'OK', output: '' },
        tests: [
          {
            id: runnerTestId(1),
            status: 'OK',
            stdout: line([0, 1], 'debug'),
            timeMs: 12,
            memoryKb: 900,
          },
          {
            id: runnerTestId(2),
            status: 'OK',
            stdout: line([9, 9], 'secret'),
            timeMs: 30,
            memoryKb: 1200,
          },
        ],
      },
    });
    expect(outcome).toMatchObject({
      kind: 'GRADED',
      verdict: 'PARTIAL',
      score: '2.50',
      passed: 1,
      total: 2,
      maxTimeMs: 30,
    });
    if (outcome.kind !== 'GRADED') throw new Error('expected graded');
    expect(outcome.tests[0]).toMatchObject({
      status: 'PASSED',
      actual: [0, 1],
      consoleExcerpt: 'debug',
    });
    expect(outcome.tests[1]).toMatchObject({
      status: 'WRONG_ANSWER',
      actual: null,
      consoleExcerpt: null,
    });
    expect(JSON.stringify(outcome)).not.toContain('secret');
  });

  it('accepts when everything passes and supports all-or-nothing', () => {
    const report = {
      compile: { status: 'SKIPPED' as const, output: '' },
      tests: [
        { id: 't1', status: 'OK' as const, stdout: line([0, 1]), timeMs: 1, memoryKb: 1 },
        { id: 't2', status: 'TIME_LIMIT' as const, stdout: '', timeMs: 2000, memoryKb: 1 },
      ],
    };
    expect(gradeSubmission({ ...base, scoringMode: 'ALL_OR_NOTHING', report })).toMatchObject({
      score: '0.00',
      verdict: 'PARTIAL',
    });
    const all = {
      ...report,
      tests: [
        report.tests[0]!,
        { ...report.tests[1]!, status: 'OK' as const, stdout: line([1, 2]) },
      ],
    };
    expect(gradeSubmission({ ...base, report: all })).toMatchObject({
      verdict: 'ACCEPTED',
      score: '10.00',
    });
  });

  it('turns compile failures into a zero-score COMPILE_ERROR without test rows', () => {
    expect(
      gradeSubmission({
        ...base,
        report: { compile: { status: 'ERROR', output: 'Main.java:1: error' }, tests: [] },
      }),
    ).toEqual({
      kind: 'COMPILE_ERROR',
      verdict: 'COMPILE_ERROR',
      score: '0.00',
      total: 2,
      compileOutput: 'Main.java:1: error',
    });
    expect(
      gradeSubmission({
        ...base,
        report: { compile: { status: 'TIMEOUT', output: '' }, tests: [] },
      }).kind,
    ).toBe('COMPILE_ERROR');
  });

  it('refuses incomplete runner reports', () => {
    expect(() =>
      gradeSubmission({ ...base, report: { compile: { status: 'OK', output: '' }, tests: [] } }),
    ).toThrow('CODE_JUDGE_REPORT_INVARIANT');
  });

  it('backs off after infrastructure failures', () => {
    expect([1, 2, 3, 4, 5, 9].map(judgeRetryDelaySeconds)).toEqual([5, 15, 45, 120, 300, 300]);
  });

  it('labels custom runs without an expected value', () => {
    expect(runStatus('CUSTOM', 'WRONG_ANSWER', true)).toBe('COMPLETED');
    expect(runStatus('CUSTOM', 'WRONG_ANSWER', false)).toBe('RUNTIME_ERROR');
    expect(runStatus('CUSTOM', 'TIME_LIMIT', false)).toBe('TIME_LIMIT');
    expect(runStatus('SAMPLE', 'WRONG_ANSWER', true)).toBe('WRONG_ANSWER');
  });
});
