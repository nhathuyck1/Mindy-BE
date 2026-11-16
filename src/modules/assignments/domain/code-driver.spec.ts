import { describe, expect, it } from 'vitest';
import {
  buildSource,
  demotePublicSolution,
  parseProgramOutput,
  RESULT_PREFIX,
  stdinFor,
} from './code-driver.js';
import { type CodeLanguageKey, parseSignature } from './code-signature.js';

const nonce = '0123456789abcdef0123';
const sig = parseSignature({
  functionName: 'twoSum',
  params: [
    { name: 'nums', type: 'int[]' },
    { name: 'target', type: 'int' },
  ],
  returnType: 'int[]',
});

describe('CODE driver', () => {
  it('appends a JavaScript driver that calls the function with JSON args', () => {
    const src = buildSource('javascript', sig, 'function twoSum(a, t) { return [0, 1]; }', nonce);
    expect(src.startsWith('function twoSum')).toBe(true);
    expect(src).toContain('twoSum(...__mindyArgs)');
    expect(src).toContain(nonce);
  });

  it('appends a Java Main with typed readers and keeps student imports first', () => {
    const student =
      'import java.util.*;\npublic final class Solution { public int[] twoSum(int[] n, int t) { return n; } }';
    const src = buildSource('java21', sig, student, nonce);
    expect(src.startsWith('import java.util.*;')).toBe(true);
    expect(src).toContain('final class Solution');
    expect(src).not.toContain('public final class Solution');
    expect(src).toContain('int[] a0 = in.readIntArray();');
    expect(src).toContain('int a1 = in.readInt();');
    expect(src).toContain('new Solution().twoSum(a0, a1)');
    expect(src).toContain('public class Main');
  });

  it('refuses unsafe nonces', () => {
    expect(() => buildSource('javascript', sig, '', 'x"; process.exit(0); "')).toThrow();
  });

  it('appends Python driver code with the student function and nonce', () => {
    const student = 'class Solution:\n    def twoSum(self, nums, target):\n        return nums';
    const source = buildSource('python3', sig, student, nonce);
    expect(source.startsWith(student)).toBe(true);
    expect(source).toContain('Solution().twoSum(*_args)');
    expect(source).toContain(nonce);
  });

  it('generates typed C# argument reads and calls the original function name', () => {
    const source = buildSource('csharp', sig, 'public class Solution {}', nonce);
    expect(source).toContain('Deserialize<int[]>(a[0])');
    expect(source).toContain('Deserialize<int>(a[1])');
    expect(source).toContain('new Solution().twoSum(a0, a1)');
    expect(source).toContain(nonce);
  });

  it('rejects an unknown language without falling back to Java', () => {
    expect(() => buildSource('ruby' as CodeLanguageKey, sig, '', nonce)).toThrow(
      'CODE_DRIVER_LANGUAGE_INVARIANT',
    );
  });

  it('demotes only the Solution class', () => {
    expect(demotePublicSolution('public class Solution {}\npublic class Helper {}')).toBe(
      'class Solution {}\npublic class Helper {}',
    );
  });

  it('separates student console output from the tagged result', () => {
    const stdout = `debug 1\npartial line\n${RESULT_PREFIX}${nonce}:[0,1]\n`;
    expect(parseProgramOutput(stdout, nonce)).toEqual({
      console: 'debug 1\npartial line',
      result: { found: true, value: [0, 1] },
    });
  });

  it('ignores fake result lines with another nonce and unparsable results', () => {
    expect(parseProgramOutput(`\n${RESULT_PREFIX}ffffffffffffffff:[9]\n`, nonce).result.found).toBe(
      false,
    );
    expect(parseProgramOutput(`\n${RESULT_PREFIX}${nonce}:[0,\n`, nonce).result.found).toBe(false);
    expect(parseProgramOutput('', nonce)).toEqual({ console: '', result: { found: false } });
  });

  it('encodes stdin as one JSON line', () => {
    expect(stdinFor([[1, 2], 'a"b'])).toBe('[[1,2],"a\\"b"]\n');
  });
});
