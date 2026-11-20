import { describe, expect, it } from 'vitest';
import { RESULT_PREFIX } from './code-driver.js';
import {
  judgeTest,
  overallVerdict,
  runnerLimits,
  scoreTests,
  valuesEqual,
} from './code-grading.js';

const nonce = 'abcdefabcdefabcdef';
const out = (value: unknown, console = '') =>
  `${console}\n${RESULT_PREFIX}${nonce}:${JSON.stringify(value)}\n`;

describe('CODE output comparison', () => {
  it('EXACT compares JSON values deeply', () => {
    expect(valuesEqual([0, 1], [0, 1], { mode: 'EXACT' })).toBe(true);
    expect(valuesEqual([0, 1], [1, 0], { mode: 'EXACT' })).toBe(false);
    expect(valuesEqual([[1], []], [[1], []], { mode: 'EXACT' })).toBe(true);
    expect(valuesEqual('1', 1, { mode: 'EXACT' })).toBe(false);
    expect(valuesEqual(true, true, { mode: 'EXACT' })).toBe(true);
    expect(valuesEqual(2, 2.0000001, { mode: 'EXACT' })).toBe(false);
  });

  it('FLOAT allows absolute/relative epsilon', () => {
    const f = { mode: 'FLOAT', epsilon: 1e-6 } as const;
    expect(valuesEqual(0.3, 0.1 + 0.2, f)).toBe(true);
    expect(valuesEqual(1_000_000, 1_000_000.5, f)).toBe(true);
    expect(valuesEqual(1, 1.01, f)).toBe(false);
    expect(valuesEqual([1.5, 2], [1.5000001, 2], f)).toBe(true);
  });

  it('UNORDERED ignores top-level order but not nested order', () => {
    const u = { mode: 'UNORDERED' } as const;
    expect(valuesEqual([[1, 2], [3]], [[3], [1, 2]], u)).toBe(true);
    expect(valuesEqual([[1, 2]], [[2, 1]], u)).toBe(false);
    expect(valuesEqual([1, 1, 2], [1, 2, 2], u)).toBe(false);
  });
});

describe('CODE test verdicts', () => {
  it('passes, fails and keeps runner limits verdicts', () => {
    expect(
      judgeTest({ status: 'OK', stdout: out([0, 1], 'log') }, [0, 1], nonce, { mode: 'EXACT' }),
    ).toEqual({
      verdict: 'PASSED',
      actual: [0, 1],
      hasResult: true,
      console: 'log',
    });
    expect(
      judgeTest({ status: 'OK', stdout: out([1]) }, [0, 1], nonce, { mode: 'EXACT' }).verdict,
    ).toBe('WRONG_ANSWER');
    expect(
      judgeTest({ status: 'OK', stdout: 'no result' }, [0, 1], nonce, { mode: 'EXACT' }).verdict,
    ).toBe('WRONG_ANSWER');
    expect(
      judgeTest({ status: 'TIME_LIMIT', stdout: '' }, 1, nonce, { mode: 'EXACT' }).verdict,
    ).toBe('TIME_LIMIT');
    expect(
      judgeTest({ status: 'RUNTIME_ERROR', stdout: out(1) }, 1, nonce, { mode: 'EXACT' }).verdict,
    ).toBe('RUNTIME_ERROR');
  });

  it('summarises a submission', () => {
    expect(overallVerdict(['PASSED', 'PASSED'])).toBe('ACCEPTED');
    expect(overallVerdict(['PASSED', 'TIME_LIMIT'])).toBe('PARTIAL');
    expect(overallVerdict(['WRONG_ANSWER', 'TIME_LIMIT'])).toBe('WRONG_ANSWER');
    expect(overallVerdict(['MEMORY_LIMIT'])).toBe('MEMORY_LIMIT');
    expect(() => overallVerdict([])).toThrow();
  });
});

describe('CODE scoring', () => {
  const t = (verdict: 'PASSED' | 'WRONG_ANSWER', weight = 1) => ({ verdict, weight });

  it('PER_TEST uses weights and rounds once on cents', () => {
    expect(scoreTests([t('PASSED'), t('PASSED'), t('WRONG_ANSWER')], '10.00', 'PER_TEST')).toBe(
      '6.67',
    );
    expect(scoreTests([t('PASSED', 3), t('WRONG_ANSWER', 1)], '100', 'PER_TEST')).toBe('75.00');
    expect(scoreTests([t('WRONG_ANSWER')], '100.00', 'PER_TEST')).toBe('0.00');
    expect(scoreTests([t('PASSED')], '999999.99', 'PER_TEST')).toBe('999999.99');
    expect(scoreTests([t('PASSED'), t('WRONG_ANSWER')], '0.01', 'PER_TEST')).toBe('0.01');
  });

  it('ALL_OR_NOTHING gives max only when every test passes', () => {
    expect(scoreTests([t('PASSED'), t('PASSED')], '10.00', 'ALL_OR_NOTHING')).toBe('10.00');
    expect(scoreTests([t('PASSED'), t('WRONG_ANSWER', 100)], '10.00', 'ALL_OR_NOTHING')).toBe(
      '0.00',
    );
  });

  it('rejects invalid inputs', () => {
    expect(() => scoreTests([], '10', 'PER_TEST')).toThrow();
    expect(() => scoreTests([t('PASSED', 0)], '10', 'PER_TEST')).toThrow();
    expect(() => scoreTests([t('PASSED')], '1e3', 'PER_TEST')).toThrow();
  });
});

describe('runner limits', () => {
  it('applies the language multiplier and bounds', () => {
    expect(runnerLimits({ cpuTimeLimitMs: 2000, memoryLimitMb: 256, timeMultiplier: 2 })).toEqual({
      compileTimeoutMs: 20000,
      cpuTimeMs: 4000,
      wallTimeMs: 9000,
      memoryMb: 256,
      outputBytes: 65536,
    });
    expect(
      runnerLimits({ cpuTimeLimitMs: 10000, memoryLimitMb: 64, timeMultiplier: 5 }).wallTimeMs,
    ).toBe(41000);
  });
});
