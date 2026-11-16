/**
 * Syntax colouring for "code" shapes in board exports. Mirrors the FE editor tokenizer
 * (Mindy-FE2 src/lib/code-highlight.ts); keep both in step.
 */
export const CODE_SHAPE_LANGUAGES = ['javascript', 'java21', 'python3', 'csharp'] as const;
export type CodeShapeLanguage = (typeof CODE_SHAPE_LANGUAGES)[number];

export const CODE_SHAPE_LANGUAGE_LABELS: Record<CodeShapeLanguage, string> = {
  javascript: 'JavaScript',
  java21: 'Java',
  python3: 'Python',
  csharp: 'C#',
};

type TokenKind =
  | 'keyword'
  | 'control'
  | 'string'
  | 'number'
  | 'literal'
  | 'function'
  | 'type'
  | 'property'
  | 'comment'
  | 'operator'
  | 'plain';

/** Mindy dark editor palette (fixed hex: SVG export cannot read CSS variables). */
export const CODE_SHAPE_PALETTE: Record<TokenKind | 'bg' | 'header' | 'muted', string> = {
  bg: '#1a2726',
  header: '#142120',
  muted: '#8aa19e',
  plain: '#e3ecea',
  keyword: '#ff9a74',
  control: '#e98bc4',
  string: '#9fdcb0',
  number: '#ffddae',
  literal: '#ff9566',
  function: '#8ec5f2',
  type: '#7fdcd0',
  property: '#c4d9ea',
  operator: '#b3c4c6',
  comment: '#7f9895',
};

const words = (text: string) => new Set(text.split(' '));
const control = words(
  'if else for while do return break continue switch case default try catch finally throw yield await',
);
const keywords: Record<CodeShapeLanguage, Set<string>> = {
  javascript: words(
    'const let var function class extends new delete typeof instanceof in of async static get set import export from as void with debugger',
  ),
  java21: words(
    'public private protected static final abstract class interface enum record extends implements new instanceof import package var void throws synchronized volatile transient native strictfp sealed permits assert',
  ),
  python3: words(
    'and as assert async class def del elif except from global import in is lambda nonlocal not or pass raise with match case',
  ),
  csharp: words(
    'abstract as async base class const delegate enum event explicit extern fixed foreach implicit in interface internal is lock namespace new operator out override params private protected public readonly ref sealed sizeof stackalloc static struct this typeof unchecked unsafe using var virtual void',
  ),
};
const literals: Record<CodeShapeLanguage, Set<string>> = {
  javascript: words('true false null undefined this super NaN Infinity arguments'),
  java21: words('true false null this super'),
  python3: words('True False None self'),
  csharp: words('true false null'),
};
const types: Record<CodeShapeLanguage, Set<string>> = {
  javascript: new Set(),
  java21: words('int long double float boolean char byte short'),
  python3: words('int float bool str list dict tuple set bytes'),
  csharp: words(
    'bool byte sbyte char decimal double float int uint long ulong object short ushort string',
  ),
};
const tokens =
  /|("(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|`(?:\\[\s\S]|[^`\\])*`?)|((?:0[xX][\da-fA-F_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)[lLfFdDn]?(?![\w$]))|(@[A-Za-z_]\w*)|([A-Za-z_$][\w$]*)|(\s+)|([\s\S])/;
const slashComment = new RegExp(/(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))/.source + tokens.source, 'g');
const hashComment = new RegExp(/(#[^\n]*)/.source + tokens.source, 'g');

export function codeTokens(
  source: string,
  language: CodeShapeLanguage,
): { kind: TokenKind; text: string }[] {
  const out: { kind: TokenKind; text: string }[] = [];
  let previous = '';
  for (const m of source.matchAll(language === 'python3' ? hashComment : slashComment)) {
    const text = m[0];
    let kind: TokenKind = 'plain';
    if (m[1] !== undefined) kind = 'comment';
    else if (m[2] !== undefined) kind = 'string';
    else if (m[3] !== undefined) kind = 'number';
    else if (m[4] !== undefined)
      kind = language === 'java21' || language === 'python3' ? 'type' : 'plain';
    else if (m[5] !== undefined) {
      const rest = source.slice((m.index ?? 0) + text.length);
      const next = rest.trimStart()[0] ?? '';
      if (control.has(text)) kind = 'control';
      else if (keywords[language].has(text)) kind = 'keyword';
      else if (literals[language].has(text)) kind = 'literal';
      else if (types[language].has(text)) kind = 'type';
      else if (next === '(') kind = 'function';
      else if (previous === '.') kind = 'property';
      else if (/^[A-Z]/.test(text)) kind = 'type';
    } else if (m[7] !== undefined) kind = 'operator';
    if (m[6] === undefined) previous = text;
    out.push({ kind, text });
  }
  return out;
}

/** Tokens split into lines (block comments and template strings may span several lines). */
export function codeLines(
  source: string,
  language: CodeShapeLanguage,
): { kind: TokenKind; text: string }[][] {
  const lines: { kind: TokenKind; text: string }[][] = [[]];
  for (const token of codeTokens(source, language)) {
    token.text.split('\n').forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1]?.push({ kind: token.kind, text: part });
    });
  }
  return lines;
}
