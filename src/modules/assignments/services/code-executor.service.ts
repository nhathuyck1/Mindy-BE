import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ConfigService } from '@nestjs/config';
import type { RunnerTestStatus } from '../domain/code-grading.js';
import type { CodeLanguageKey } from '../domain/code-signature.js';

/** Port to the code execution engine (compiler-runner v2 today; replaceable by another adapter). */
export interface CodeExecutionRequest {
  readonly executionId: string;
  readonly language: CodeLanguageKey;
  readonly priority: 'interactive' | 'batch';
  readonly source: string;
  readonly limits: {
    readonly compileTimeoutMs: number;
    readonly cpuTimeMs: number;
    readonly wallTimeMs: number;
    readonly memoryMb: number;
    readonly outputBytes: number;
  };
  readonly tests: readonly { readonly id: string; readonly stdin: string }[];
}

export interface CodeExecutionReport {
  readonly runtimeVersion: string;
  readonly compile: {
    readonly status: 'OK' | 'ERROR' | 'TIMEOUT' | 'SKIPPED';
    readonly output: string;
  };
  readonly tests: readonly {
    readonly id: string;
    readonly status: RunnerTestStatus;
    readonly stdout: string;
    readonly stderr: string;
    readonly timeMs: number;
    readonly memoryKb: number;
  }[];
}

export interface CodeExecutor {
  /** Never call inside a database transaction. */
  execute(request: CodeExecutionRequest): Promise<CodeExecutionReport>;
}
export const CODE_EXECUTOR = Symbol('CODE_EXECUTOR');

/** No free runner slot; retry later. Not a verdict about the code. */
export class CodeRunnerBusyError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('CODE_RUNNER_BUSY');
    this.name = 'CodeRunnerBusyError';
  }
}
/** Runner not configured, unreachable or failing. Not a verdict about the code. */
export class CodeRunnerUnavailableError extends Error {
  constructor(reason: string) {
    super(`CODE_RUNNER_UNAVAILABLE: ${reason}`);
    this.name = 'CodeRunnerUnavailableError';
  }
}

const COMPILE = new Set(['OK', 'ERROR', 'TIMEOUT', 'SKIPPED']);
const TEST = new Set(['OK', 'TIME_LIMIT', 'MEMORY_LIMIT', 'RUNTIME_ERROR', 'OUTPUT_LIMIT']);

/** Strictly validates the runner response; any drift is treated as an unavailable runner. */
export function parseRunnerReport(
  value: unknown,
  request: CodeExecutionRequest,
): CodeExecutionReport {
  const report = value as Partial<CodeExecutionReport> | null;
  if (
    !report ||
    typeof report.runtimeVersion !== 'string' ||
    !report.compile ||
    !COMPILE.has(report.compile.status) ||
    typeof report.compile.output !== 'string' ||
    !Array.isArray(report.tests)
  )
    throw new CodeRunnerUnavailableError('invalid runner response');
  const compiled = report.compile.status === 'OK' || report.compile.status === 'SKIPPED';
  const ids = request.tests.map((t) => t.id);
  if (
    compiled
      ? JSON.stringify(report.tests.map((t) => t?.id)) !== JSON.stringify(ids)
      : report.tests.length
  )
    throw new CodeRunnerUnavailableError('runner test ids mismatch');
  for (const t of report.tests)
    if (
      !TEST.has(t.status) ||
      typeof t.stdout !== 'string' ||
      typeof t.stderr !== 'string' ||
      typeof t.timeMs !== 'number' ||
      typeof t.memoryKb !== 'number'
    )
      throw new CodeRunnerUnavailableError('invalid runner test result');
  return {
    runtimeVersion: report.runtimeVersion,
    compile: { status: report.compile.status, output: report.compile.output },
    tests: report.tests.map((t) => ({
      id: t.id,
      status: t.status,
      stdout: t.stdout,
      stderr: t.stderr,
      timeMs: Math.max(0, Math.round(t.timeMs)),
      memoryKb: Math.max(0, Math.round(t.memoryKb)),
    })),
  };
}

@Injectable()
export class HttpCodeExecutor implements CodeExecutor {
  constructor(private readonly config: ConfigService) {}

  async execute(request: CodeExecutionRequest): Promise<CodeExecutionReport> {
    const base = this.config.getOrThrow<string>('CODE_RUNNER_URL');
    const token = this.config.getOrThrow<string>('CODE_RUNNER_TOKEN');
    if (!base || !token) throw new CodeRunnerUnavailableError('not configured');
    let response: Response;
    try {
      response = await fetch(new URL('/internal/v1/executions', base), {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.config.getOrThrow<number>('CODE_RUNNER_TIMEOUT_MS')),
      });
    } catch {
      throw new CodeRunnerUnavailableError('unreachable');
    }
    if (response.status === 429) {
      const body = (await response.json().catch(() => null)) as {
        retryAfterSeconds?: unknown;
      } | null;
      const retry = typeof body?.retryAfterSeconds === 'number' ? body.retryAfterSeconds : 2;
      throw new CodeRunnerBusyError(Math.min(60, Math.max(1, Math.round(retry))));
    }
    if (!response.ok) throw new CodeRunnerUnavailableError(`status ${response.status}`);
    return parseRunnerReport(await response.json().catch(() => null), request);
  }
}
