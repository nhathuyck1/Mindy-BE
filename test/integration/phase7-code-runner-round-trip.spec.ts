import { randomBytes, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import {
  buildSource,
  parseProgramOutput,
  stdinFor,
} from '../../src/modules/assignments/domain/code-driver.js';
import { runnerLimits } from '../../src/modules/assignments/domain/code-grading.js';
import {
  CODE_LANGUAGE_KEYS,
  CODE_VALUE_TYPES,
  type CodeLanguageKey,
  type CodeValueType,
  starterCode,
} from '../../src/modules/assignments/domain/code-signature.js';
import { HttpCodeExecutor } from '../../src/modules/assignments/services/code-executor.service.js';

const url = process.env.CODE_RUNNER_URL;
const token = process.env.CODE_RUNNER_TOKEN;
const edgeString = 'a"b\\c\nđ😀';
const values: Record<CodeValueType, unknown[]> = {
  int: [-2147483648, 0, 2147483647],
  long: [-1, Number.MAX_SAFE_INTEGER],
  double: [-2.5, 0.1, 1e-7],
  boolean: [true, false],
  string: ['', edgeString],
  'int[]': [[], [-1, 2]],
  'long[]': [[], [Number.MAX_SAFE_INTEGER, -1]],
  'double[]': [[], [-2.5, 0.1, 1e-7]],
  'boolean[]': [[], [true, false]],
  'string[]': [[], ['', edgeString]],
  'int[][]': [[], [[], [-1, 2]]],
  'string[][]': [[], [[], ['', edgeString]]],
};

async function execute(language: CodeLanguageKey, source: string, inputs: unknown[]) {
  if (!token || token.length < 32) throw new Error('Set CODE_RUNNER_TOKEN for runner integration.');
  const executor = new HttpCodeExecutor(
    new ConfigService({
      CODE_RUNNER_URL: url,
      CODE_RUNNER_TOKEN: token,
      CODE_RUNNER_TIMEOUT_MS: 45_000,
    }),
  );
  return executor.execute({
    executionId: randomUUID(),
    language,
    priority: 'interactive',
    source,
    limits: runnerLimits({ cpuTimeLimitMs: 3000, memoryLimitMb: 256, timeMultiplier: 1 }),
    tests: inputs.map((value, i) => ({ id: `t${i + 1}`, stdin: stdinFor([value]) })),
  });
}

describe.skipIf(!url)('Phase 7 driver through the Docker judge', () => {
  for (const language of CODE_LANGUAGE_KEYS) {
    it.each(CODE_VALUE_TYPES)(
      `${language} round-trips %s`,
      async (type) => {
        const signature = {
          functionName: 'identity',
          params: [{ name: 'value', type }],
          returnType: type,
        };
        const nonce = randomBytes(12).toString('hex');
        const starter = starterCode(language, signature);
        const solution =
          language === 'python3'
            ? starter.replace(
                '        pass',
                '        print("debug", end="")\n        return value',
              )
            : starter.replace('\n\n', '\n        return value;\n');
        const result = await execute(
          language,
          buildSource(language, signature, solution, nonce),
          values[type],
        );
        expect(result.compile.status, result.compile.output).toBe('OK');
        expect(result.tests).toHaveLength(values[type].length);
        result.tests.forEach((test, index) => {
          expect(test.status, test.stderr).toBe('OK');
          expect(parseProgramOutput(test.stdout, nonce)).toEqual({
            console: language === 'python3' ? 'debug' : '',
            result: { found: true, value: values[type][index] },
          });
        });
      },
      50_000,
    );
  }

  it.each([
    [
      'python3',
      `class Solution:
    def depth(self, n):
        if n < 0:
            raise ValueError("sample error")
        return 0 if n == 0 else self.depth(n - 1) + 1
`,
    ],
    [
      'csharp',
      `using System.Linq;
public class Solution {
    public static void Main() { throw new Exception("wrong entry point"); }
    public int depth(int n) {
        if (n < 0) throw new ArgumentException("sample error");
        return n == 0 ? 0 : depth(n - 1) + 1;
    }
}
`,
    ],
  ] as const)(
    '%s supports deep recursion and returns thread exceptions as runtime errors',
    async (language, solution) => {
      const signature = {
        functionName: 'depth',
        params: [{ name: 'n', type: 'int' }],
        returnType: 'int',
      } as const;
      const nonce = randomBytes(12).toString('hex');
      const result = await execute(
        language,
        buildSource(language, signature, solution, nonce),
        [100_000, -1],
      );
      expect(result.compile.status, result.compile.output).toBe('OK');
      expect(result.tests.map((test) => test.status)).toEqual(['OK', 'RUNTIME_ERROR']);
      expect(parseProgramOutput(result.tests[0]?.stdout ?? '', nonce).result).toEqual({
        found: true,
        value: 100_000,
      });
      expect(result.tests[1]?.stderr).toContain('sample error');
    },
    50_000,
  );
});
