import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { DataSource, type EntityManager } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { UserRole } from '../../users/user-role.enum.js';
import type {
  AssignmentRow,
  CodeLanguageRow,
  CodeProblemLanguageRow,
  CodeProblemRow,
  CodeReferenceRow,
  CodeTestRow,
} from '../assignment.types.js';
import { buildSource, parseProgramOutput, stdinFor } from '../domain/code-driver.js';
import { type CompareOptions, judgeTest, runnerLimits } from '../domain/code-grading.js';
import {
  assertTestMatchesSignature,
  CODE_LANGUAGE_KEYS,
  CodeDomainError,
  type CodeLanguageKey,
  type CodeSignature,
  matchesType,
  parseSignature,
  starterCode,
} from '../domain/code-signature.js';
import { AssignmentDto } from '../dtos/assignment.dto.js';
import {
  type CodeGeneratedOutputDto,
  type CodeGenerateResultDto,
  CodeLanguageDto,
  type CodeLibraryPageDto,
  CodeProblemDto,
  CodeProblemLanguageDto,
  CodeReferenceDto,
  type CodeStarterPreviewDto,
  type CodeValidationDto,
  type CodeValidationResultDto,
  type MentorCodeAuthoringDto,
  MentorCodeTestDto,
} from '../dtos/code.dto.js';
import type {
  CodeLibraryQueryDto,
  CodeSignaturePreviewInput,
  CodeTestItemInput,
  ExtendCodeAssignmentInput,
  GenerateCodeOutputsInput,
  ImportCodeProblemInput,
  ReplaceCodeLanguagesInput,
  ReplaceCodeTestsInput,
  UpsertCodeProblemInput,
  UpsertCodeReferenceInput,
  UpsertCodeTestInput,
} from '../dtos/code-input.dto.js';
import { AssignmentException } from '../exceptions/assignment.exceptions.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { AssignmentsService } from './assignments.service.js';
import {
  CODE_EXECUTOR,
  type CodeExecutionReport,
  type CodeExecutor,
  CodeRunnerBusyError,
  CodeRunnerUnavailableError,
} from './code-executor.service.js';
import { loadCodeReadiness } from './code-readiness.query.js';

const MAX_SOURCE_BYTES = 65536;
const MAX_TEST_JSON_BYTES = 65536;
const STDERR_EXCERPT = 2000;

function domain<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof CodeDomainError)
      throw new AssignmentException(422, error.code, error.details);
    throw error;
  }
}

function bytes(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

/** Mentor authoring of CODE assignments (Phase 7 slice C2). Runner calls never run inside a transaction. */
@Injectable()
export class CodeAuthoringService {
  constructor(
    private readonly db: DataSource,
    private readonly assignments: AssignmentsService,
    @Inject(CODE_EXECUTOR) private readonly executor: CodeExecutor,
  ) {}

  async languages(): Promise<CodeLanguageDto[]> {
    const rows: CodeLanguageRow[] = await this.db.query(
      'SELECT * FROM code_languages WHERE enabled ORDER BY key',
    );
    return rows.map((r) => new CodeLanguageDto(r));
  }

  preview(input: CodeSignaturePreviewInput): CodeStarterPreviewDto {
    const signature = domain(() => parseSignature(input.signature));
    return {
      javascript: starterCode('javascript', signature),
      java21: starterCode('java21', signature),
    };
  }

  async get(actor: AuthenticatedUser, id: string): Promise<MentorCodeAuthoringDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const a = await this.assignments.authorized(m, actor, id);
      this.mentorCode(actor, a);
      return this.authoring(m, a);
    });
  }

  async upsertProblem(
    actor: AuthenticatedUser,
    id: string,
    input: UpsertCodeProblemInput,
  ): Promise<MentorCodeAuthoringDto> {
    return this.db.transaction(async (m) => {
      const a = await this.draft(m, actor, id, input.expectedRevision);
      const signature = domain(() => parseSignature(input.signature));
      const epsilon = input.floatEpsilon ?? null;
      if ((input.compareMode === 'FLOAT') !== (epsilon !== null))
        throw new AssignmentException(422, 'CODE_FLOAT_EPSILON_INVALID');
      const old = await this.problem(m, id);
      if (old) {
        const previous = parseSignature(old.signature);
        if (JSON.stringify(previous) !== JSON.stringify(signature)) {
          const mismatched = (await this.tests(m, id)).filter((t) => {
            try {
              assertTestMatchesSignature(signature, t.input_args, t.expected);
              return false;
            } catch {
              return true;
            }
          });
          if (mismatched.length)
            throw new AssignmentException(422, 'CODE_TEST_TYPE_MISMATCH', {
              positions: mismatched.map((t) => t.position),
            });
          // Regenerate only starters the mentor never customised.
          for (const lang of await this.problemLanguages(m, id))
            if (lang.starter_code === starterCode(lang.language_key, previous))
              await m.query(
                'UPDATE code_problem_languages SET starter_code=$3 WHERE assignment_id=$1 AND language_key=$2',
                [id, lang.language_key, starterCode(lang.language_key, signature)],
              );
        }
      }
      await m.query(
        `INSERT INTO code_problems(assignment_id,statement_md,constraints_md,difficulty,signature,compare_mode,float_epsilon,scoring_mode,cpu_time_limit_ms,memory_limit_mb)
        VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10)
        ON CONFLICT (assignment_id) DO UPDATE SET statement_md=EXCLUDED.statement_md,constraints_md=EXCLUDED.constraints_md,
          difficulty=EXCLUDED.difficulty,signature=EXCLUDED.signature,compare_mode=EXCLUDED.compare_mode,
          float_epsilon=EXCLUDED.float_epsilon,scoring_mode=EXCLUDED.scoring_mode,cpu_time_limit_ms=EXCLUDED.cpu_time_limit_ms,
          memory_limit_mb=EXCLUDED.memory_limit_mb,updated_at=clock_timestamp()`,
        [
          id,
          input.statementMd,
          input.constraintsMd ?? old?.constraints_md ?? '',
          input.difficulty === undefined ? (old?.difficulty ?? null) : input.difficulty,
          JSON.stringify(signature),
          input.compareMode,
          epsilon,
          input.scoringMode,
          input.cpuTimeLimitMs,
          input.memoryLimitMb,
        ],
      );
      return this.changed(m, a, actor.userId, 'CODE_PROBLEM');
    });
  }

  async replaceLanguages(
    actor: AuthenticatedUser,
    id: string,
    input: ReplaceCodeLanguagesInput,
  ): Promise<MentorCodeAuthoringDto> {
    return this.db.transaction(async (m) => {
      const a = await this.draft(m, actor, id, input.expectedRevision);
      const problem = await this.requireProblem(m, id);
      const signature = parseSignature(problem.signature);
      const keys = input.languages.map((l) => l.languageKey);
      if (new Set(keys).size !== keys.length)
        throw new AssignmentException(422, 'CODE_LANGUAGE_DUPLICATE');
      const enabled = new Set((await this.languages()).map((l) => l.key));
      if (keys.some((k) => !enabled.has(k)))
        throw new AssignmentException(422, 'CODE_LANGUAGE_NOT_ALLOWED');
      for (const l of input.languages)
        if (l.starterCode !== undefined && bytes(l.starterCode) > MAX_SOURCE_BYTES)
          throw new AssignmentException(422, 'CODE_SOURCE_TOO_LARGE');
      await m.query(
        'DELETE FROM code_reference_solutions WHERE assignment_id=$1 AND NOT (language_key = ANY($2::varchar[]))',
        [id, keys],
      );
      await m.query(
        'DELETE FROM code_problem_languages WHERE assignment_id=$1 AND NOT (language_key = ANY($2::varchar[]))',
        [id, keys],
      );
      for (const l of input.languages)
        await m.query(
          `INSERT INTO code_problem_languages(assignment_id,language_key,starter_code) VALUES($1,$2,$3)
          ON CONFLICT (assignment_id,language_key) DO UPDATE SET starter_code=EXCLUDED.starter_code`,
          [id, l.languageKey, l.starterCode ?? starterCode(l.languageKey, signature)],
        );
      return this.changed(m, a, actor.userId, 'CODE_LANGUAGES');
    });
  }

  async upsertTest(
    actor: AuthenticatedUser,
    id: string,
    position: number,
    input: UpsertCodeTestInput,
  ): Promise<MentorCodeAuthoringDto> {
    return this.db.transaction(async (m) => {
      if (!Number.isInteger(position) || position < 1 || position > 30)
        throw new AssignmentException(422, 'CODE_TEST_POSITION_INVALID');
      const a = await this.draft(m, actor, id, input.expectedRevision);
      const signature = parseSignature((await this.requireProblem(m, id)).signature);
      const { args, expected } = this.checkTest(signature, input);
      await m.query(
        `INSERT INTO code_test_cases(assignment_id,position,visibility,input_args,expected,weight,explanation_md)
        VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7)
        ON CONFLICT (assignment_id,position) DO UPDATE SET visibility=EXCLUDED.visibility,input_args=EXCLUDED.input_args,
          expected=EXCLUDED.expected,weight=EXCLUDED.weight,explanation_md=EXCLUDED.explanation_md`,
        [
          id,
          position,
          input.visibility,
          args,
          expected,
          input.weight ?? 1,
          input.visibility === 'SAMPLE' ? (input.explanationMd ?? null) : null,
        ],
      );
      return this.changed(m, a, actor.userId, 'CODE_TEST');
    });
  }

  /** Replaces the whole test table in one revision (wizard "save tests"). Positions become 1..n. */
  async replaceTests(
    actor: AuthenticatedUser,
    id: string,
    input: ReplaceCodeTestsInput,
  ): Promise<MentorCodeAuthoringDto> {
    return this.db.transaction(async (m) => {
      const a = await this.draft(m, actor, id, input.expectedRevision);
      const signature = parseSignature((await this.requireProblem(m, id)).signature);
      const rows = input.tests.map((test, index) => {
        try {
          return this.checkTest(signature, test);
        } catch (error) {
          if (error instanceof AssignmentException) {
            const body = error.getResponse() as { code?: string; details?: unknown[] };
            const details = (body.details?.[0] ?? {}) as Record<string, unknown>;
            throw new AssignmentException(error.getStatus(), body.code ?? 'CODE_TEST_INVALID', {
              ...details,
              position: index + 1,
            });
          }
          throw error;
        }
      });
      await m.query('DELETE FROM code_test_cases WHERE assignment_id=$1', [id]);
      for (const [index, test] of input.tests.entries())
        await m.query(
          `INSERT INTO code_test_cases(assignment_id,position,visibility,input_args,expected,weight,explanation_md)
          VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7)`,
          [
            id,
            index + 1,
            test.visibility,
            rows[index]?.args,
            rows[index]?.expected,
            test.weight ?? 1,
            test.visibility === 'SAMPLE' ? (test.explanationMd ?? null) : null,
          ],
        );
      return this.changed(m, a, actor.userId, 'CODE_TESTS_REPLACE');
    });
  }

  /**
   * Runs the reference solution the mentor is editing on each input and returns its return values,
   * which the wizard offers as expected outputs. Nothing is stored; the runner call is outside a transaction.
   */
  async generateOutputs(
    actor: AuthenticatedUser,
    id: string,
    input: GenerateCodeOutputsInput,
  ): Promise<CodeGenerateResultDto> {
    const plan = await this.db.transaction('REPEATABLE READ', async (m) => {
      const a = await this.assignments.authorized(m, actor, id);
      this.mentorCode(actor, a);
      if (a.status !== 'DRAFT') throw new AssignmentException(409, 'ASSIGNMENT_CONTENT_FROZEN');
      const problem = await this.requireProblem(m, id);
      const allowed = (await this.problemLanguages(m, id)).map((l) => l.language_key);
      if (!allowed.includes(input.languageKey))
        throw new AssignmentException(422, 'CODE_LANGUAGE_NOT_ALLOWED');
      const rows: { time_multiplier: string }[] = await m.query(
        'SELECT time_multiplier FROM code_languages WHERE key=$1',
        [input.languageKey],
      );
      return { problem, multiplier: Number(rows[0]?.time_multiplier ?? 1) };
    });
    if (bytes(input.sourceCode) > MAX_SOURCE_BYTES)
      throw new AssignmentException(422, 'CODE_SOURCE_TOO_LARGE');
    const signature = parseSignature(plan.problem.signature);
    input.inputs.forEach((args, index) => {
      const bad =
        args.length !== signature.params.length ||
        signature.params.some((p, i) => !matchesType(p.type, args[i]));
      if (bad)
        throw new AssignmentException(422, 'CODE_TEST_TYPE_MISMATCH', { position: index + 1 });
      if (bytes(JSON.stringify(args)) > MAX_TEST_JSON_BYTES)
        throw new AssignmentException(422, 'CODE_TEST_TOO_LARGE', { position: index + 1 });
    });
    const nonce = randomBytes(12).toString('hex');
    const report = await this.run(
      input.languageKey,
      signature,
      input.sourceCode,
      nonce,
      plan.problem,
      plan.multiplier,
      input.inputs.map((args, index) => ({ id: `g${index + 1}`, args })),
    );
    const compiled = report.compile.status === 'OK' || report.compile.status === 'SKIPPED';
    const outputs: CodeGeneratedOutputDto[] = compiled
      ? input.inputs.map((_args, index) => {
          const r = report.tests.find((x) => x.id === `g${index + 1}`);
          if (!r) throw new AssignmentException(503, 'CODE_RUNNER_UNAVAILABLE');
          const parsed = parseProgramOutput(r.stdout, nonce);
          const base = {
            index,
            console: parsed.console.slice(0, STDERR_EXCERPT),
            stderr: r.stderr.slice(0, STDERR_EXCERPT),
            timeMs: r.timeMs,
            memoryKb: r.memoryKb,
          };
          if (r.status !== 'OK') return { ...base, status: r.status, expected: null };
          if (!parsed.result.found) return { ...base, status: 'NO_RESULT', expected: null };
          const value = parsed.result.value;
          if (
            !matchesType(signature.returnType, value) ||
            bytes(JSON.stringify(value)) > MAX_TEST_JSON_BYTES
          )
            return { ...base, status: 'INVALID_RETURN', expected: null };
          return { ...base, status: 'OK', expected: value };
        })
      : [];
    return {
      languageKey: input.languageKey,
      compileStatus: report.compile.status === 'SKIPPED' ? 'OK' : report.compile.status,
      compileOutput: report.compile.output.slice(0, 8192),
      runtimeVersion: report.runtimeVersion,
      outputs,
    };
  }

  /** CODE assignments this mentor authored (any class), newest first, to reuse as a starting point. */
  async library(actor: AuthenticatedUser, query: CodeLibraryQueryDto): Promise<CodeLibraryPageDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      await this.assignments.activeActor(m, actor);
      if (actor.role !== UserRole.MENTOR)
        throw new AssignmentException(403, 'ASSIGNMENT_SCOPE_REQUIRED');
      const q = query.q?.trim() ? `%${query.q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
      const rows: {
        id: string;
        title: string;
        status: string;
        updated_at: Date;
        class_code: string;
        class_name: string;
        session_number: number;
        session_title: string;
        test_count: number;
        languages: string[];
        difficulty: string | null;
        total: number;
      }[] = await m.query(
        `SELECT a.id,a.title,a.status,a.updated_at,c.code AS class_code,c.name AS class_name,
          s.session_number,s.title AS session_title,p.difficulty,
          (SELECT count(*)::int FROM code_test_cases t WHERE t.assignment_id=a.id) AS test_count,
          COALESCE((SELECT array_agg(l.language_key::text ORDER BY l.language_key) FROM code_problem_languages l
            WHERE l.assignment_id=a.id), '{}'::text[]) AS languages,
          count(*) OVER()::int AS total
        FROM assignments a
        JOIN code_problems p ON p.assignment_id=a.id
        JOIN class_sessions s ON s.id=a.session_id
        JOIN class_units u ON u.id=s.class_unit_id
        JOIN classes c ON c.id=u.class_id
        WHERE a.type='CODE' AND a.deleted_at IS NULL AND a.created_by=$1
          AND ($2::text IS NULL OR a.title ILIKE $2 ESCAPE '\\' OR c.code ILIKE $2 ESCAPE '\\')
        ORDER BY a.updated_at DESC, a.id
        LIMIT $3 OFFSET $4`,
        [actor.userId, q, query.pageSize, (query.page - 1) * query.pageSize],
      );
      return {
        items: rows.map((r) => ({
          assignmentId: r.id,
          title: r.title,
          status: r.status,
          classCode: r.class_code,
          className: r.class_name,
          sessionNumber: r.session_number,
          sessionTitle: r.session_title,
          testCount: r.test_count,
          languages: r.languages,
          difficulty: r.difficulty,
          updatedAt: new Date(r.updated_at).toISOString(),
        })),
        total: rows[0]?.total ?? 0,
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  /**
   * Copies statement, signature, settings, languages, tests and reference solutions from another
   * CODE assignment into this draft (replacing its content). Validation is never copied.
   */
  async importProblem(
    actor: AuthenticatedUser,
    id: string,
    input: ImportCodeProblemInput,
  ): Promise<MentorCodeAuthoringDto> {
    return this.db.transaction(async (m) => {
      if (input.sourceAssignmentId === id) throw new AssignmentException(422, 'CODE_IMPORT_SELF');
      const a = await this.draft(m, actor, id, input.expectedRevision);
      const source = await this.assignments.row(m, input.sourceAssignmentId);
      // Own work is always reusable; otherwise the mentor must still see the source class/session.
      if (source.created_by !== actor.userId)
        await this.assignments.authorized(m, actor, source.id);
      if (source.type !== 'CODE') throw new AssignmentException(422, 'ASSIGNMENT_TYPE_MISMATCH');
      if (!(await this.problem(m, source.id)))
        throw new AssignmentException(422, 'CODE_IMPORT_SOURCE_EMPTY');
      await m.query('DELETE FROM code_test_cases WHERE assignment_id=$1', [id]);
      await m.query('DELETE FROM code_reference_solutions WHERE assignment_id=$1', [id]);
      await m.query('DELETE FROM code_problem_languages WHERE assignment_id=$1', [id]);
      await m.query(
        `INSERT INTO code_problems(assignment_id,statement_md,constraints_md,difficulty,signature,compare_mode,float_epsilon,scoring_mode,cpu_time_limit_ms,memory_limit_mb)
        SELECT $1,statement_md,constraints_md,difficulty,signature,compare_mode,float_epsilon,scoring_mode,cpu_time_limit_ms,memory_limit_mb
        FROM code_problems WHERE assignment_id=$2
        ON CONFLICT (assignment_id) DO UPDATE SET statement_md=EXCLUDED.statement_md,constraints_md=EXCLUDED.constraints_md,
          difficulty=EXCLUDED.difficulty,signature=EXCLUDED.signature,compare_mode=EXCLUDED.compare_mode,
          float_epsilon=EXCLUDED.float_epsilon,scoring_mode=EXCLUDED.scoring_mode,cpu_time_limit_ms=EXCLUDED.cpu_time_limit_ms,
          memory_limit_mb=EXCLUDED.memory_limit_mb,validated_revision=NULL,updated_at=clock_timestamp()`,
        [id, source.id],
      );
      await m.query(
        `INSERT INTO code_problem_languages(assignment_id,language_key,starter_code)
        SELECT $1,language_key,starter_code FROM code_problem_languages WHERE assignment_id=$2`,
        [id, source.id],
      );
      await m.query(
        `INSERT INTO code_test_cases(assignment_id,position,visibility,input_args,expected,weight,explanation_md)
        SELECT $1,position,visibility,input_args,expected,weight,explanation_md FROM code_test_cases WHERE assignment_id=$2`,
        [id, source.id],
      );
      await m.query(
        `INSERT INTO code_reference_solutions(assignment_id,language_key,source_code)
        SELECT $1,language_key,source_code FROM code_reference_solutions WHERE assignment_id=$2`,
        [id, source.id],
      );
      if (!a.description.trim() && source.description.trim())
        await m.query('UPDATE assignments SET description=$2 WHERE id=$1', [
          id,
          source.description,
        ]);
      return this.changed(m, a, actor.userId, 'CODE_IMPORTED');
    });
  }

  async deleteTest(
    actor: AuthenticatedUser,
    id: string,
    position: number,
    revision: number,
  ): Promise<MentorCodeAuthoringDto> {
    return this.db.transaction(async (m) => {
      const a = await this.draft(m, actor, id, revision);
      const deleted: unknown[] = await m.query(
        'DELETE FROM code_test_cases WHERE assignment_id=$1 AND position=$2 RETURNING id',
        [id, position],
      );
      if (!deleted.length) throw new AssignmentException(404, 'CODE_TEST_NOT_FOUND');
      return this.changed(m, a, actor.userId, 'CODE_TEST_DELETE');
    });
  }

  async upsertReference(
    actor: AuthenticatedUser,
    id: string,
    languageKey: string,
    input: UpsertCodeReferenceInput,
  ): Promise<MentorCodeAuthoringDto> {
    return this.db.transaction(async (m) => {
      const a = await this.draft(m, actor, id, input.expectedRevision);
      await this.requireProblem(m, id);
      const allowed = (await this.problemLanguages(m, id)).map((l) => l.language_key);
      if (!allowed.includes(languageKey as CodeLanguageKey))
        throw new AssignmentException(422, 'CODE_LANGUAGE_NOT_ALLOWED');
      if (bytes(input.sourceCode) > MAX_SOURCE_BYTES)
        throw new AssignmentException(422, 'CODE_SOURCE_TOO_LARGE');
      await m.query(
        `INSERT INTO code_reference_solutions(assignment_id,language_key,source_code) VALUES($1,$2,$3)
        ON CONFLICT (assignment_id,language_key) DO UPDATE SET source_code=EXCLUDED.source_code,
          last_validation=NULL,validated_at=NULL,updated_at=clock_timestamp()`,
        [id, languageKey, input.sourceCode],
      );
      return this.changed(m, a, actor.userId, 'CODE_REFERENCE');
    });
  }

  /**
   * Runs every reference solution against every test. Passing all of them marks the current
   * revision as validated (publish gate, decision D11). Any edit afterwards bumps the revision.
   */
  async validate(
    actor: AuthenticatedUser,
    id: string,
    revision: number,
  ): Promise<CodeValidationResultDto> {
    const plan = await this.db.transaction('REPEATABLE READ', async (m) => {
      const a = await this.assignments.authorized(m, actor, id);
      this.mentorCode(actor, a);
      if (a.revision !== revision)
        throw new AssignmentException(409, 'ASSIGNMENT_VERSION_CONFLICT');
      if (a.status !== 'DRAFT') throw new AssignmentException(409, 'ASSIGNMENT_CONTENT_FROZEN');
      const problem = await this.requireProblem(m, id);
      const tests = await this.tests(m, id);
      const references = await this.references(m, id);
      if (!tests.length) throw new AssignmentException(422, 'CODE_TESTS_REQUIRED');
      if (!references.length) throw new AssignmentException(422, 'CODE_REFERENCE_REQUIRED');
      const multipliers: { key: CodeLanguageKey; time_multiplier: string }[] = await m.query(
        'SELECT key,time_multiplier FROM code_languages',
      );
      return { problem, tests, references, multipliers };
    });

    const signature = parseSignature(plan.problem.signature);
    const compare: CompareOptions = {
      mode: plan.problem.compare_mode,
      ...(plan.problem.float_epsilon === null
        ? {}
        : { epsilon: Number(plan.problem.float_epsilon) }),
    };
    const results: CodeValidationDto[] = [];
    for (const ref of plan.references) {
      const multiplier = Number(
        plan.multipliers.find((x) => x.key === ref.language_key)?.time_multiplier ?? 1,
      );
      const nonce = randomBytes(12).toString('hex');
      const report = await this.run(
        ref.language_key,
        signature,
        ref.source_code,
        nonce,
        plan.problem,
        multiplier,
        plan.tests.map((t) => ({ id: `t${t.position}`, args: t.input_args })),
      );
      results.push(this.validationResult(ref.language_key, report, plan.tests, nonce, compare));
    }
    const validated = results.every((r) => r.passed === r.total && r.compileStatus === 'OK');

    return this.db.transaction(async (m) => {
      const a = await this.draft(m, actor, id, revision);
      for (const r of results)
        await m.query(
          'UPDATE code_reference_solutions SET last_validation=$3::jsonb,validated_at=clock_timestamp() WHERE assignment_id=$1 AND language_key=$2',
          [id, r.languageKey, JSON.stringify(r)],
        );
      await m.query(
        'UPDATE code_problems SET validated_revision=$2,updated_at=clock_timestamp() WHERE assignment_id=$1',
        [id, validated ? a.revision : null],
      );
      await this.assignments.audit(
        m,
        a,
        actor.userId,
        validated ? 'CODE_VALIDATED' : 'CODE_VALIDATION_FAILED',
      );
      return { validated, revision: a.revision, results };
    });
  }

  /** After publish only the deadline (later) and attempts (more) may change, with a reason. */
  async extend(
    actor: AuthenticatedUser,
    id: string,
    input: ExtendCodeAssignmentInput,
  ): Promise<AssignmentDto> {
    return this.db.transaction(async (m) => {
      const a = await this.assignments.authorized(m, actor, id, true);
      this.mentorCode(actor, a);
      if (a.revision !== input.expectedRevision)
        throw new AssignmentException(409, 'ASSIGNMENT_VERSION_CONFLICT');
      if (a.status !== 'PUBLISHED') throw new AssignmentException(409, 'ASSIGNMENT_STATE_CONFLICT');
      const now = await this.assignments.now(m);
      const dueAt = input.dueAt === undefined ? a.due_at : new Date(input.dueAt);
      const maxAttempts = input.maxAttempts ?? a.max_attempts;
      if (input.dueAt !== undefined && (!dueAt || dueAt <= now || (a.due_at && dueAt <= a.due_at)))
        throw new AssignmentException(422, 'INVALID_ASSIGNMENT_DEADLINE');
      if (maxAttempts < a.max_attempts)
        throw new AssignmentException(422, 'CODE_ATTEMPTS_DECREASE_FORBIDDEN');
      if (dueAt?.getTime() === a.due_at?.getTime() && maxAttempts === a.max_attempts)
        throw new AssignmentException(422, 'CODE_EXTENSION_EMPTY');
      await m.query(
        'UPDATE assignments SET due_at=$2,max_attempts=$3,revision=revision+1,updated_at=clock_timestamp() WHERE id=$1',
        [id, dueAt, maxAttempts],
      );
      const row = await this.assignments.row(m, id);
      await this.assignments.audit(m, row, actor.userId, 'CODE_EXTENDED', input.reason);
      return new AssignmentDto(row);
    });
  }

  private async run(
    language: CodeLanguageKey,
    signature: CodeSignature,
    code: string,
    nonce: string,
    problem: CodeProblemRow,
    multiplier: number,
    cases: readonly { readonly id: string; readonly args: readonly unknown[] }[],
  ): Promise<CodeExecutionReport> {
    try {
      return await this.executor.execute({
        executionId: randomUUID(),
        language,
        priority: 'interactive',
        source: buildSource(language, signature, code, nonce),
        limits: runnerLimits({
          cpuTimeLimitMs: problem.cpu_time_limit_ms,
          memoryLimitMb: problem.memory_limit_mb,
          timeMultiplier: multiplier,
        }),
        tests: cases.map((c) => ({ id: c.id, stdin: stdinFor(c.args) })),
      });
    } catch (error) {
      if (error instanceof CodeRunnerBusyError)
        throw new AssignmentException(429, 'CODE_RUNNER_BUSY', {
          retryAfterSeconds: error.retryAfterSeconds,
        });
      if (error instanceof CodeRunnerUnavailableError)
        throw new AssignmentException(503, 'CODE_RUNNER_UNAVAILABLE');
      throw error;
    }
  }

  private validationResult(
    languageKey: CodeLanguageKey,
    report: CodeExecutionReport,
    tests: readonly CodeTestRow[],
    nonce: string,
    compare: CompareOptions,
  ): CodeValidationDto {
    const compiled = report.compile.status === 'OK' || report.compile.status === 'SKIPPED';
    const judged = compiled
      ? tests.map((t) => {
          const r = report.tests.find((x) => x.id === `t${t.position}`);
          if (!r) throw new AssignmentException(503, 'CODE_RUNNER_UNAVAILABLE');
          const outcome = judgeTest(r, t.expected, nonce, compare);
          return {
            position: t.position,
            visibility: t.visibility,
            verdict: outcome.verdict,
            actual: outcome.actual,
            timeMs: r.timeMs,
            memoryKb: r.memoryKb,
            stderr: r.stderr.slice(0, STDERR_EXCERPT),
          };
        })
      : [];
    return {
      languageKey,
      compileStatus: report.compile.status === 'SKIPPED' ? 'OK' : report.compile.status,
      compileOutput: report.compile.output.slice(0, 8192),
      passed: judged.filter((t) => t.verdict === 'PASSED').length,
      total: tests.length,
      runtimeVersion: report.runtimeVersion,
      tests: judged,
    };
  }

  /** Shared validation of one test row; returns the JSON text to store. Never echoes hidden values. */
  private checkTest(
    signature: CodeSignature,
    input: CodeTestItemInput,
  ): { args: string; expected: string } {
    if (input.visibility === 'HIDDEN' && input.explanationMd)
      throw new AssignmentException(422, 'CODE_TEST_EXPLANATION_SAMPLE_ONLY');
    const args = JSON.stringify(input.inputArgs);
    const expected = JSON.stringify(input.expected);
    if (bytes(args) > MAX_TEST_JSON_BYTES || bytes(expected) > MAX_TEST_JSON_BYTES)
      throw new AssignmentException(422, 'CODE_TEST_TOO_LARGE');
    domain(() => assertTestMatchesSignature(signature, input.inputArgs, input.expected));
    return { args, expected };
  }

  private mentorCode(actor: AuthenticatedUser, a: AssignmentRow): void {
    if (actor.role !== UserRole.MENTOR)
      throw new AssignmentException(403, 'ASSIGNMENT_SCOPE_REQUIRED');
    if (a.type !== 'CODE') throw new AssignmentException(422, 'ASSIGNMENT_TYPE_MISMATCH');
  }

  private async draft(
    m: EntityManager,
    actor: AuthenticatedUser,
    id: string,
    revision: number,
  ): Promise<AssignmentRow> {
    const a = await this.assignments.authorized(m, actor, id, true);
    this.mentorCode(actor, a);
    if (a.revision !== revision) throw new AssignmentException(409, 'ASSIGNMENT_VERSION_CONFLICT');
    if (a.status !== 'DRAFT') throw new AssignmentException(409, 'ASSIGNMENT_CONTENT_FROZEN');
    return a;
  }

  private async changed(
    m: EntityManager,
    a: AssignmentRow,
    actorId: string,
    action: string,
  ): Promise<MentorCodeAuthoringDto> {
    await m.query(
      'UPDATE assignments SET revision=revision+1,updated_at=clock_timestamp() WHERE id=$1',
      [a.id],
    );
    const row = await this.assignments.row(m, a.id);
    await this.assignments.audit(m, row, actorId, action);
    return this.authoring(m, row);
  }

  private async authoring(m: EntityManager, a: AssignmentRow): Promise<MentorCodeAuthoringDto> {
    const problem = await this.problem(m, a.id);
    // Sequential: one transaction connection serves one query at a time.
    const languages = await this.problemLanguages(m, a.id);
    const tests = await this.tests(m, a.id);
    const references = await this.references(m, a.id);
    const available: CodeLanguageRow[] = await m.query(
      'SELECT * FROM code_languages WHERE enabled ORDER BY key',
    );
    return {
      assignment: new AssignmentDto(a),
      problem: problem ? new CodeProblemDto(problem, parseSignature(problem.signature)) : null,
      languages: languages.map((l) => new CodeProblemLanguageDto(l)),
      tests: tests.map((t) => new MentorCodeTestDto(t)),
      references: references.map((r) => new CodeReferenceDto(r)),
      validatedRevision: problem?.validated_revision ?? null,
      publishBlockers: a.status === 'DRAFT' ? await loadCodeReadiness(m, a.id, a.revision) : [],
      availableLanguages: available.map((l) => new CodeLanguageDto(l)),
    };
  }

  private async problem(m: EntityManager, id: string): Promise<CodeProblemRow | undefined> {
    const rows: CodeProblemRow[] = await m.query(
      'SELECT * FROM code_problems WHERE assignment_id=$1',
      [id],
    );
    return rows[0];
  }
  private async requireProblem(m: EntityManager, id: string): Promise<CodeProblemRow> {
    const problem = await this.problem(m, id);
    if (!problem) throw new AssignmentException(409, 'CODE_PROBLEM_REQUIRED');
    return problem;
  }
  private problemLanguages(m: EntityManager, id: string): Promise<CodeProblemLanguageRow[]> {
    return m.query(
      'SELECT language_key,starter_code FROM code_problem_languages WHERE assignment_id=$1 ORDER BY array_position($2::varchar[],language_key)',
      [id, CODE_LANGUAGE_KEYS],
    );
  }
  private tests(m: EntityManager, id: string): Promise<CodeTestRow[]> {
    return m.query(
      'SELECT id,position,visibility,input_args,expected,weight,explanation_md FROM code_test_cases WHERE assignment_id=$1 ORDER BY position',
      [id],
    );
  }
  private references(m: EntityManager, id: string): Promise<CodeReferenceRow[]> {
    return m.query(
      'SELECT language_key,source_code,last_validation,validated_at FROM code_reference_solutions WHERE assignment_id=$1 ORDER BY language_key',
      [id],
    );
  }
}
