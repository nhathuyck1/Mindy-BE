import { describe, expect, it } from 'vitest';
import {
  buildSource,
  demotePublicSolution,
  parseProgramOutput,
  RESULT_PREFIX,
  stdinFor,
} from './code-driver.js';
import { parseSignature } from './code-signature.js';

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
