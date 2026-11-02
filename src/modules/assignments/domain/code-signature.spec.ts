import { describe, expect, it } from 'vitest';
import {
  assertTestMatchesSignature,
  CodeDomainError,
  describeArgs,
  matchesType,
  parseSignature,
  starterCode,
} from './code-signature.js';

const twoSum = {
  functionName: 'twoSum',
  params: [
    { name: 'nums', type: 'int[]' },
    { name: 'target', type: 'int' },
  ],
  returnType: 'int[]',
};

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof CodeDomainError) return error.code;
    throw error;
  }
  return undefined;
}

describe('CODE function signatures', () => {
  it('accepts a LeetCode style signature', () => {
    expect(parseSignature(twoSum)).toEqual(twoSum);
  });

  it.each([
    ['reserved function name', { ...twoSum, functionName: 'class' }],
    ['driver name', { ...twoSum, functionName: 'Main' }],
    ['bad identifier', { ...twoSum, functionName: '1x' }],
    ['unknown type', { ...twoSum, returnType: 'char' }],
    ['void return', { ...twoSum, returnType: 'void' }],
    ['no params', { ...twoSum, params: [] }],
    [
      'seven params',
      { ...twoSum, params: Array.from({ length: 7 }, (_, i) => ({ name: `p${i}`, type: 'int' })) },
    ],
    ['duplicate params', { ...twoSum, params: [twoSum.params[0], twoSum.params[0]] }],
    ['param equals function', { ...twoSum, params: [{ name: 'twoSum', type: 'int' }] }],
    ['extra field', { ...twoSum, extra: true }],
    ['not an object', 'twoSum(nums)'],
  ])('rejects %s', (_name, raw) => {
    expect(code(() => parseSignature(raw))).toBe('CODE_SIGNATURE_INVALID');
  });

  it('checks values against types representable in JS and Java', () => {
    expect(matchesType('int', 2147483647)).toBe(true);
    expect(matchesType('int', 2147483648)).toBe(false);
    expect(matchesType('int', 1.5)).toBe(false);
    expect(matchesType('long', 9007199254740991)).toBe(true);
    expect(matchesType('long', 9007199254740992)).toBe(false);
    expect(matchesType('double', 1)).toBe(true);
    expect(matchesType('boolean', 0)).toBe(false);
    expect(matchesType('string[]', ['a', ''])).toBe(true);
    expect(matchesType('int[][]', [[1], []])).toBe(true);
    expect(matchesType('int[][]', [1])).toBe(false);
    expect(matchesType('string', null)).toBe(false);
  });

  it('validates test cases without echoing values', () => {
    const s = parseSignature(twoSum);
    expect(code(() => assertTestMatchesSignature(s, [[2, 7], 9], [0, 1]))).toBeUndefined();
    expect(code(() => assertTestMatchesSignature(s, [[2, 7]], [0, 1]))).toBe(
      'CODE_TEST_TYPE_MISMATCH',
    );
    expect(code(() => assertTestMatchesSignature(s, [[2, '7'], 9], [0, 1]))).toBe(
      'CODE_TEST_TYPE_MISMATCH',
    );
    expect(code(() => assertTestMatchesSignature(s, [[2, 7], 9], 1))).toBe(
      'CODE_TEST_TYPE_MISMATCH',
    );
    try {
      assertTestMatchesSignature(s, [['secret'], 9], [0]);
    } catch (error) {
      expect(JSON.stringify((error as CodeDomainError).details)).not.toContain('secret');
    }
  });

  it('generates starter code for JavaScript and Java', () => {
    const s = parseSignature({
      functionName: 'group',
      params: [
        { name: 'words', type: 'string[]' },
        { name: 'grid', type: 'int[][]' },
      ],
      returnType: 'string[][]',
    });
    expect(starterCode('javascript', s)).toContain('function group(words, grid) {');
    expect(starterCode('javascript', s)).toContain('@param {string[]} words');
    expect(starterCode('java21', s)).toContain(
      'public String[][] group(String[] words, int[][] grid) {',
    );
    expect(starterCode('java21', s)).toMatch(/^class Solution \{/);
  });

  it('describes sample arguments', () => {
    expect(describeArgs(parseSignature(twoSum), [[2, 7], 9])).toBe('nums = [2,7], target = 9');
  });
});
