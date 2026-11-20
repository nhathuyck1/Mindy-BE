/**
 * Output comparison, per-test verdicts and scoring for CODE assignments (Phase 7 §4.4, §6).
 * Pure functions; scores use integer cents and a single rounding step like quiz grading.
 */
import { parseProgramOutput } from './code-driver.js';

export type CodeCompareMode = 'EXACT' | 'FLOAT' | 'UNORDERED';
export type CodeScoringMode = 'PER_TEST' | 'ALL_OR_NOTHING';
export type RunnerTestStatus =
  | 'OK'
  | 'TIME_LIMIT'
  | 'MEMORY_LIMIT'
  | 'RUNTIME_ERROR'
  | 'OUTPUT_LIMIT';
export type CodeTestVerdict = 'PASSED' | 'WRONG_ANSWER' | Exclude<RunnerTestStatus, 'OK'>;
export type CodeSubmissionVerdict =
  | 'ACCEPTED'
  | 'PARTIAL'
  | 'WRONG_ANSWER'
  | 'TIME_LIMIT'
  | 'MEMORY_LIMIT'
  | 'RUNTIME_ERROR'
  | 'OUTPUT_LIMIT'
  | 'COMPILE_ERROR';

export interface CompareOptions {
  readonly mode: CodeCompareMode;
  /** Required for FLOAT: |a-b| <= epsilon * max(1, |a|, |b|). */
  readonly epsilon?: number;
}

function numbersEqual(a: number, b: number, options: CompareOptions): boolean {
  if (options.mode !== 'FLOAT') return a === b;
  const epsilon = options.epsilon ?? 0;
  return Math.abs(a - b) <= epsilon * Math.max(1, Math.abs(a), Math.abs(b));
}

function deepEqual(expected: unknown, actual: unknown, options: CompareOptions): boolean {
  if (typeof expected === 'number' && typeof actual === 'number')
    return numbersEqual(expected, actual, options);
  if (Array.isArray(expected) && Array.isArray(actual))
    return (
      expected.length === actual.length &&
      expected.every((e, i) => deepEqual(e, actual[i], options))
    );
  if (expected === null || actual === null || typeof expected !== typeof actual)
    return expected === actual;
  if (typeof expected === 'object') return false; // signatures never produce objects
  return expected === actual;
}

/** Canonical JSON for multiset comparison. */
function canonical(value: unknown): string {
  return JSON.stringify(value);
}

export function valuesEqual(expected: unknown, actual: unknown, options: CompareOptions): boolean {
  if (options.mode === 'UNORDERED' && Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) return false;
    const a = expected.map(canonical).sort();
    const b = actual.map(canonical).sort();
    return a.every((v, i) => v === b[i]);
  }
  return deepEqual(expected, actual, options);
}

export interface TestOutcome {
  readonly verdict: CodeTestVerdict;
  /** Parsed return value (only meaningful for SAMPLE projections). */
  readonly actual: unknown;
  readonly hasResult: boolean;
  readonly console: string;
}

/** Turns one runner test result into a verdict, comparing the nonce-tagged return value. */
export function judgeTest(
  runner: { readonly status: RunnerTestStatus; readonly stdout: string },
  expected: unknown,
  nonce: string,
  options: CompareOptions,
): TestOutcome {
  const parsed = parseProgramOutput(runner.stdout, nonce);
  const actual = parsed.result.found ? parsed.result.value : null;
  if (runner.status !== 'OK')
    return {
      verdict: runner.status,
      actual,
      hasResult: parsed.result.found,
      console: parsed.console,
    };
  if (!parsed.result.found)
    return { verdict: 'WRONG_ANSWER', actual: null, hasResult: false, console: parsed.console };
  return {
    verdict: valuesEqual(expected, actual, options) ? 'PASSED' : 'WRONG_ANSWER',
    actual,
    hasResult: true,
    console: parsed.console,
  };
}

function toCents(decimal: string): bigint {
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(decimal)) throw new Error('CODE_SCORE_INVARIANT');
  const [whole = '0', fraction = ''] = decimal.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

function fromCents(cents: bigint): string {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

/** score = round(passedWeight / totalWeight * maxScore, 2), half-up on cents, rounded once. */
export function scoreTests(
  tests: readonly { readonly verdict: CodeTestVerdict; readonly weight: number }[],
  maxScore: string,
  mode: CodeScoringMode,
): string {
  if (!tests.length || tests.some((t) => !Number.isInteger(t.weight) || t.weight < 1))
    throw new Error('CODE_SCORE_INVARIANT');
  const max = toCents(maxScore);
  const passed = tests.filter((t) => t.verdict === 'PASSED');
  if (mode === 'ALL_OR_NOTHING') return fromCents(passed.length === tests.length ? max : 0n);
  const total = BigInt(tests.reduce((sum, t) => sum + t.weight, 0));
  const won = BigInt(passed.reduce((sum, t) => sum + t.weight, 0));
  return fromCents((max * won * 2n + total) / (2n * total));
}

export function overallVerdict(
  verdicts: readonly CodeTestVerdict[],
): Exclude<CodeSubmissionVerdict, 'COMPILE_ERROR'> {
  if (!verdicts.length) throw new Error('CODE_VERDICT_INVARIANT');
  const passed = verdicts.filter((v) => v === 'PASSED').length;
  if (passed === verdicts.length) return 'ACCEPTED';
  if (passed > 0) return 'PARTIAL';
  const first = verdicts.find((v): v is Exclude<CodeTestVerdict, 'PASSED'> => v !== 'PASSED');
  return first ?? 'WRONG_ANSWER';
}

export interface CodeLimitsInput {
  readonly cpuTimeLimitMs: number;
  readonly memoryLimitMb: number;
  readonly timeMultiplier: number;
}

/** Runner limits for a problem/language pair. The runner adds its own start-up allowance. */
export function runnerLimits(input: CodeLimitsInput) {
  const cpuTimeMs = Math.min(
    20_000,
    Math.max(100, Math.round(input.cpuTimeLimitMs * input.timeMultiplier)),
  );
  return {
    compileTimeoutMs: 20_000,
    cpuTimeMs,
    wallTimeMs: Math.min(60_000, cpuTimeMs * 2 + 1_000),
    memoryMb: input.memoryLimitMb,
    outputBytes: 65_536,
  } as const;
}
