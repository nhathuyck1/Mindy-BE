/**
 * Turns one runner report into a persisted grading outcome (Phase 7 C3, §6).
 * Pure: the worker persists the result; hidden tests never carry outputs (DB CHECK enforces it too).
 */
import {
  type CodeScoringMode,
  type CodeSubmissionVerdict,
  type CodeTestVerdict,
  type CompareOptions,
  judgeTest,
  overallVerdict,
  type RunnerTestStatus,
  scoreTests,
} from './code-grading.js';

export const MAX_JUDGE_FAILURES = 5;
const RETRY_DELAYS_SECONDS = [5, 15, 45, 120, 300] as const;
const CONSOLE_EXCERPT_CHARS = 4096;
const COMPILE_OUTPUT_CHARS = 8192;

/** Back-off after an infrastructure failure (not after "busy", which is plain back-pressure). */
export function judgeRetryDelaySeconds(failures: number): number {
  const index = Math.min(Math.max(failures, 1), RETRY_DELAYS_SECONDS.length) - 1;
  return RETRY_DELAYS_SECONDS[index] ?? 300;
}

export interface JudgeTestCase {
  readonly id: string;
  readonly position: number;
  readonly visibility: 'SAMPLE' | 'HIDDEN';
  readonly weight: number;
  readonly expected: unknown;
}

export interface JudgeReport {
  readonly compile: {
    readonly status: 'OK' | 'ERROR' | 'TIMEOUT' | 'SKIPPED';
    readonly output: string;
  };
  readonly tests: readonly {
    readonly id: string;
    readonly status: RunnerTestStatus;
    readonly stdout: string;
    readonly timeMs: number;
    readonly memoryKb: number;
  }[];
}

export interface JudgedTestRow {
  readonly testCaseId: string;
  readonly position: number;
  readonly visibility: 'SAMPLE' | 'HIDDEN';
  readonly weight: number;
  readonly status: CodeTestVerdict;
  readonly timeMs: number;
  readonly memoryKb: number;
  /** SAMPLE only; null for HIDDEN. */
  readonly actual: unknown;
  readonly consoleExcerpt: string | null;
}

export type JudgeOutcome =
  | {
      readonly kind: 'COMPILE_ERROR';
      readonly verdict: 'COMPILE_ERROR';
      readonly score: string;
      readonly total: number;
      readonly compileOutput: string;
    }
  | {
      readonly kind: 'GRADED';
      readonly verdict: Exclude<CodeSubmissionVerdict, 'COMPILE_ERROR'>;
      readonly score: string;
      readonly passed: number;
      readonly total: number;
      readonly maxTimeMs: number;
      readonly maxMemoryKb: number;
      readonly compileOutput: string;
      readonly tests: readonly JudgedTestRow[];
    };

export const runnerTestId = (position: number): string => `t${position}`;

export function gradeSubmission(input: {
  readonly report: JudgeReport;
  readonly tests: readonly JudgeTestCase[];
  readonly nonce: string;
  readonly compare: CompareOptions;
  readonly scoringMode: CodeScoringMode;
  readonly maxScore: string;
}): JudgeOutcome {
  const { report, tests } = input;
  if (!tests.length) throw new Error('CODE_JUDGE_TESTS_INVARIANT');
  const compileOutput = report.compile.output.slice(0, COMPILE_OUTPUT_CHARS);
  if (report.compile.status === 'ERROR' || report.compile.status === 'TIMEOUT')
    return {
      kind: 'COMPILE_ERROR',
      verdict: 'COMPILE_ERROR',
      score: '0.00',
      total: tests.length,
      compileOutput,
    };
  const rows: JudgedTestRow[] = tests.map((t) => {
    const result = report.tests.find((r) => r.id === runnerTestId(t.position));
    if (!result) throw new Error('CODE_JUDGE_REPORT_INVARIANT');
    const outcome = judgeTest(result, t.expected, input.nonce, input.compare);
    const sample = t.visibility === 'SAMPLE';
    return {
      testCaseId: t.id,
      position: t.position,
      visibility: t.visibility,
      weight: t.weight,
      status: outcome.verdict,
      timeMs: Math.max(0, Math.round(result.timeMs)),
      memoryKb: Math.max(0, Math.round(result.memoryKb)),
      actual: sample && outcome.hasResult ? outcome.actual : null,
      consoleExcerpt: sample ? outcome.console.slice(0, CONSOLE_EXCERPT_CHARS) : null,
    };
  });
  return {
    kind: 'GRADED',
    verdict: overallVerdict(rows.map((r) => r.status)),
    score: scoreTests(
      rows.map((r) => ({ verdict: r.status, weight: r.weight })),
      input.maxScore,
      input.scoringMode,
    ),
    passed: rows.filter((r) => r.status === 'PASSED').length,
    total: rows.length,
    maxTimeMs: Math.max(...rows.map((r) => r.timeMs)),
    maxMemoryKb: Math.max(...rows.map((r) => r.memoryKb)),
    compileOutput,
    tests: rows,
  };
}

/** "Run" feedback for one test: SAMPLE gets a verdict, a custom input only reports the run status. */
export type RunTestStatus = CodeTestVerdict | 'COMPLETED';
export function runStatus(
  kind: 'SAMPLE' | 'CUSTOM',
  verdict: CodeTestVerdict,
  hasResult: boolean,
): RunTestStatus {
  if (kind === 'SAMPLE') return verdict;
  // A custom input has no expected value: WRONG_ANSWER here only means "no result line printed".
  return verdict === 'WRONG_ANSWER' && hasResult
    ? 'COMPLETED'
    : verdict === 'WRONG_ANSWER'
      ? 'RUNTIME_ERROR'
      : verdict;
}
