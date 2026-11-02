/**
 * LeetCode-style function signatures for CODE assignments (Phase 7, decision D4).
 * Pure functions: no Nest/TypeORM imports so they are unit-tested and reused by the driver builder.
 */

export const CODE_VALUE_TYPES = [
  'int',
  'long',
  'double',
  'boolean',
  'string',
  'int[]',
  'long[]',
  'double[]',
  'boolean[]',
  'string[]',
  'int[][]',
  'string[][]',
] as const;
export type CodeValueType = (typeof CODE_VALUE_TYPES)[number];
export type CodeLanguageKey = 'javascript' | 'java21';
export const CODE_LANGUAGE_KEYS: readonly CodeLanguageKey[] = ['javascript', 'java21'];

export interface CodeParam {
  readonly name: string;
  readonly type: CodeValueType;
}
export interface CodeSignature {
  readonly functionName: string;
  readonly params: readonly CodeParam[];
  readonly returnType: CodeValueType;
}

/** Domain failure with a stable API code; services map it to AssignmentException(422, code). */
export class CodeDomainError extends Error {
  constructor(
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
    this.name = 'CodeDomainError';
  }
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;
const INT_MIN = -2147483648;
const INT_MAX = 2147483647;
const MAX_STRING = 65536;
/** JS + Java reserved words, plus names the generated drivers use. */
const RESERVED = new Set(
  (
    'abstract arguments assert await boolean break byte case catch char class const continue debugger default delete do ' +
    'double else enum eval export extends false final finally float for function goto if implements import in instanceof ' +
    'int interface let long native new null package private protected public return short static strictfp super switch ' +
    'synchronized this throw throws transient true try typeof var void volatile while with yield undefined NaN Infinity ' +
    'Main Solution MindyJson main require process module exports String Object System Math'
  ).split(' '),
);

function invalid(reason: string): never {
  throw new CodeDomainError('CODE_SIGNATURE_INVALID', { reason });
}

function isValueType(value: unknown): value is CodeValueType {
  return typeof value === 'string' && (CODE_VALUE_TYPES as readonly string[]).includes(value);
}

/** Validates untrusted JSON (DTO or DB) into a signature. */
export function parseSignature(raw: unknown): CodeSignature {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid('signature must be an object');
  const input = raw as Record<string, unknown>;
  const { functionName, params, returnType } = input;
  if (Object.keys(input).some((k) => !['functionName', 'params', 'returnType'].includes(k)))
    invalid('unknown signature field');
  if (
    typeof functionName !== 'string' ||
    !IDENTIFIER.test(functionName) ||
    RESERVED.has(functionName)
  )
    invalid('functionName must be a non-reserved identifier');
  if (!isValueType(returnType)) invalid('returnType is not supported');
  if (!Array.isArray(params) || params.length < 1 || params.length > 6)
    invalid('params must contain 1..6 entries');
  const names = new Set<string>();
  const parsed = params.map((p: unknown) => {
    const param = p as Record<string, unknown> | null;
    if (
      !param ||
      typeof param !== 'object' ||
      Object.keys(param).some((k) => k !== 'name' && k !== 'type')
    )
      invalid('param must be {name,type}');
    if (typeof param.name !== 'string' || !IDENTIFIER.test(param.name) || RESERVED.has(param.name))
      invalid('param name must be a non-reserved identifier');
    if (param.name === functionName || names.has(param.name)) invalid('param names must be unique');
    if (!isValueType(param.type)) invalid('param type is not supported');
    names.add(param.name);
    return { name: param.name, type: param.type };
  });
  return { functionName, params: parsed, returnType };
}

/** True when a JSON value is representable as `type` in both JavaScript and Java. */
export function matchesType(type: CodeValueType, value: unknown): boolean {
  if (type.endsWith('[]')) {
    const inner = type.slice(0, -2) as CodeValueType;
    return (
      Array.isArray(value) && value.length <= 100_000 && value.every((v) => matchesType(inner, v))
    );
  }
  switch (type) {
    case 'int':
      return (
        typeof value === 'number' && Number.isInteger(value) && value >= INT_MIN && value <= INT_MAX
      );
    case 'long':
      // JavaScript represents integers exactly only up to 2^53 - 1.
      return typeof value === 'number' && Number.isSafeInteger(value);
    case 'double':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'string':
      return typeof value === 'string' && value.length <= MAX_STRING;
    default:
      return false;
  }
}

/** Validates one test case against the signature. Never echoes values (they may be hidden tests). */
export function assertTestMatchesSignature(
  signature: CodeSignature,
  inputArgs: unknown,
  expected: unknown,
): void {
  if (!Array.isArray(inputArgs) || inputArgs.length !== signature.params.length)
    throw new CodeDomainError('CODE_TEST_TYPE_MISMATCH', {
      field: 'inputArgs',
      reason: 'argument count',
    });
  signature.params.forEach((param, index) => {
    if (!matchesType(param.type, inputArgs[index]))
      throw new CodeDomainError('CODE_TEST_TYPE_MISMATCH', {
        field: 'inputArgs',
        param: param.name,
      });
  });
  if (!matchesType(signature.returnType, expected))
    throw new CodeDomainError('CODE_TEST_TYPE_MISMATCH', { field: 'expected' });
}

const JS_DOC: Record<CodeValueType, string> = {
  int: 'number',
  long: 'number',
  double: 'number',
  boolean: 'boolean',
  string: 'string',
  'int[]': 'number[]',
  'long[]': 'number[]',
  'double[]': 'number[]',
  'boolean[]': 'boolean[]',
  'string[]': 'string[]',
  'int[][]': 'number[][]',
  'string[][]': 'string[][]',
};

export function javaType(type: CodeValueType): string {
  return type.replace('string', 'String');
}

/** Starter code shown in the editor before the student writes anything. */
export function starterCode(language: CodeLanguageKey, s: CodeSignature): string {
  if (language === 'javascript') {
    const doc = [
      '/**',
      ...s.params.map((p) => ` * @param {${JS_DOC[p.type]}} ${p.name}`),
      ` * @return {${JS_DOC[s.returnType]}}`,
      ' */',
    ];
    return `${doc.join('\n')}\nfunction ${s.functionName}(${s.params.map((p) => p.name).join(', ')}) {\n\n}\n`;
  }
  const params = s.params.map((p) => `${javaType(p.type)} ${p.name}`).join(', ');
  return `class Solution {\n    public ${javaType(s.returnType)} ${s.functionName}(${params}) {\n\n    }\n}\n`;
}

/** Human readable call arguments, e.g. `nums = [2,7], target = 9` (sample tests only). */
export function describeArgs(s: CodeSignature, inputArgs: readonly unknown[]): string {
  return s.params.map((p, i) => `${p.name} = ${JSON.stringify(inputArgs[i])}`).join(', ');
}
