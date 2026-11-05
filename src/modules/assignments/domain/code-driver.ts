/**
 * Builds the executable source = student code + a generated driver (Phase 7 §4.3).
 * The driver reads one JSON array of arguments from stdin, calls the student's function and prints
 * the return value on its own line, tagged with a per-execution nonce so the student's own
 * console output can never be mistaken for the result.
 */
import {
  type CodeLanguageKey,
  type CodeSignature,
  type CodeValueType,
  javaType,
} from './code-signature.js';

export const RESULT_PREFIX = '\u001eMINDY:';
const NONCE = /^[a-f0-9]{16,64}$/;

export function stdinFor(inputArgs: readonly unknown[]): string {
  return `${JSON.stringify(inputArgs)}\n`;
}

export function buildSource(
  language: CodeLanguageKey,
  signature: CodeSignature,
  studentCode: string,
  nonce: string,
): string {
  if (!NONCE.test(nonce)) throw new Error('CODE_DRIVER_NONCE_INVARIANT');
  return language === 'javascript'
    ? javascriptSource(signature, studentCode, nonce)
    : javaSource(signature, studentCode, nonce);
}

function javascriptSource(s: CodeSignature, code: string, nonce: string): string {
  return `${code}
;(function __mindyMain() {
  const __mindyArgs = JSON.parse(require('fs').readFileSync(0, 'utf8'));
  const __mindyResult = ${s.functionName}(...__mindyArgs);
  process.stdout.write('\\n' + ${JSON.stringify(`${RESULT_PREFIX}${nonce}:`)} + JSON.stringify(__mindyResult === undefined ? null : __mindyResult) + '\\n');
})();
`;
}

const JAVA_READER: Record<CodeValueType, string> = {
  int: 'readInt',
  long: 'readLong',
  double: 'readDouble',
  boolean: 'readBool',
  string: 'readString',
  'int[]': 'readIntArray',
  'long[]': 'readLongArray',
  'double[]': 'readDoubleArray',
  'boolean[]': 'readBoolArray',
  'string[]': 'readStringArray',
  'int[][]': 'readIntMatrix',
  'string[][]': 'readStringMatrix',
};

/** `public class Solution` would not compile inside Main.java; the driver owns the public class. */
export function demotePublicSolution(code: string): string {
  return code.replace(
    /\bpublic\s+((?:(?:final|abstract)\s+)*)class\s+Solution\b/g,
    '$1class Solution',
  );
}

function javaSource(s: CodeSignature, code: string, nonce: string): string {
  const reads = s.params
    .map(
      (p, i) =>
        `${i ? "        in.expect(',');\n" : ''}        ${javaType(p.type)} a${i} = in.${JAVA_READER[p.type]}();`,
    )
    .join('\n');
  const args = s.params.map((_p, i) => `a${i}`).join(', ');
  return `${demotePublicSolution(code)}

public class Main {
    public static void main(String[] mindyArgs) throws Exception {
        String raw = new String(System.in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        MindyJson in = new MindyJson(raw);
        in.expect('[');
${reads}
        in.expect(']');
        ${javaType(s.returnType)} result = new Solution().${s.functionName}(${args});
        StringBuilder json = new StringBuilder();
        MindyJson.write(json, result);
        byte[] line = ("\\n" + "${RESULT_PREFIX.replace('\u001e', '\\u001e')}${nonce}:" + json + "\\n").getBytes(java.nio.charset.StandardCharsets.UTF_8);
        System.out.flush();
        System.out.write(line, 0, line.length);
        System.out.flush();
    }
}

${JAVA_JSON}`;
}

/** Minimal JSON reader/writer for exactly the types in CODE_VALUE_TYPES. */
const JAVA_JSON = `final class MindyJson {
    private final String s;
    private int i = 0;
    MindyJson(String s) { this.s = s; }
    private interface Reader<T> { T read(); }
    private void ws() { while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++; }
    private IllegalArgumentException bad() { return new IllegalArgumentException("Invalid judge input"); }
    void expect(char c) { ws(); if (i >= s.length() || s.charAt(i) != c) throw bad(); i++; }
    private boolean peek(char c) { ws(); return i < s.length() && s.charAt(i) == c; }
    private String number() {
        ws();
        int start = i;
        while (i < s.length() && "+-0123456789.eE".indexOf(s.charAt(i)) >= 0) i++;
        if (start == i) throw bad();
        return s.substring(start, i);
    }
    int readInt() { return Integer.parseInt(number()); }
    long readLong() { return Long.parseLong(number()); }
    double readDouble() { return Double.parseDouble(number()); }
    boolean readBool() {
        ws();
        if (s.startsWith("true", i)) { i += 4; return true; }
        if (s.startsWith("false", i)) { i += 5; return false; }
        throw bad();
    }
    String readString() {
        expect('"');
        StringBuilder b = new StringBuilder();
        while (true) {
            if (i >= s.length()) throw bad();
            char c = s.charAt(i++);
            if (c == '"') return b.toString();
            if (c != '\\\\') { b.append(c); continue; }
            char e = s.charAt(i++);
            switch (e) {
                case 'n': b.append('\\n'); break;
                case 't': b.append('\\t'); break;
                case 'r': b.append('\\r'); break;
                case 'b': b.append('\\b'); break;
                case 'f': b.append('\\f'); break;
                case 'u': b.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); i += 4; break;
                default: b.append(e);
            }
        }
    }
    private <T> java.util.List<T> list(Reader<T> reader) {
        expect('[');
        java.util.List<T> out = new java.util.ArrayList<>();
        if (peek(']')) { i++; return out; }
        while (true) {
            out.add(reader.read());
            if (peek(',')) { i++; continue; }
            expect(']');
            return out;
        }
    }
    int[] readIntArray() { java.util.List<Integer> l = list(this::readInt); int[] a = new int[l.size()]; for (int k = 0; k < a.length; k++) a[k] = l.get(k); return a; }
    long[] readLongArray() { java.util.List<Long> l = list(this::readLong); long[] a = new long[l.size()]; for (int k = 0; k < a.length; k++) a[k] = l.get(k); return a; }
    double[] readDoubleArray() { java.util.List<Double> l = list(this::readDouble); double[] a = new double[l.size()]; for (int k = 0; k < a.length; k++) a[k] = l.get(k); return a; }
    boolean[] readBoolArray() { java.util.List<Boolean> l = list(this::readBool); boolean[] a = new boolean[l.size()]; for (int k = 0; k < a.length; k++) a[k] = l.get(k); return a; }
    String[] readStringArray() { return list(this::readString).toArray(new String[0]); }
    int[][] readIntMatrix() { return list(this::readIntArray).toArray(new int[0][]); }
    String[][] readStringMatrix() { return list(this::readStringArray).toArray(new String[0][]); }

    static void write(StringBuilder b, int v) { b.append(v); }
    static void write(StringBuilder b, long v) { b.append(v); }
    static void write(StringBuilder b, boolean v) { b.append(v); }
    static void write(StringBuilder b, double v) {
        if (Double.isNaN(v) || Double.isInfinite(v)) b.append("null"); else b.append(Double.toString(v));
    }
    static void write(StringBuilder b, String v) {
        if (v == null) { b.append("null"); return; }
        b.append('"');
        for (int k = 0; k < v.length(); k++) {
            char c = v.charAt(k);
            if (c == '"') b.append("\\\\\\"");
            else if (c == '\\\\') b.append("\\\\\\\\");
            else if (c < 0x20) b.append(String.format("\\\\u%04x", (int) c));
            else b.append(c);
        }
        b.append('"');
    }
    static void write(StringBuilder b, int[] a) { if (a == null) { b.append("null"); return; } b.append('['); for (int k = 0; k < a.length; k++) { if (k > 0) b.append(','); write(b, a[k]); } b.append(']'); }
    static void write(StringBuilder b, long[] a) { if (a == null) { b.append("null"); return; } b.append('['); for (int k = 0; k < a.length; k++) { if (k > 0) b.append(','); write(b, a[k]); } b.append(']'); }
    static void write(StringBuilder b, double[] a) { if (a == null) { b.append("null"); return; } b.append('['); for (int k = 0; k < a.length; k++) { if (k > 0) b.append(','); write(b, a[k]); } b.append(']'); }
    static void write(StringBuilder b, boolean[] a) { if (a == null) { b.append("null"); return; } b.append('['); for (int k = 0; k < a.length; k++) { if (k > 0) b.append(','); write(b, a[k]); } b.append(']'); }
    static void write(StringBuilder b, String[] a) { if (a == null) { b.append("null"); return; } b.append('['); for (int k = 0; k < a.length; k++) { if (k > 0) b.append(','); write(b, a[k]); } b.append(']'); }
    static void write(StringBuilder b, int[][] a) { if (a == null) { b.append("null"); return; } b.append('['); for (int k = 0; k < a.length; k++) { if (k > 0) b.append(','); write(b, a[k]); } b.append(']'); }
    static void write(StringBuilder b, String[][] a) { if (a == null) { b.append("null"); return; } b.append('['); for (int k = 0; k < a.length; k++) { if (k > 0) b.append(','); write(b, a[k]); } b.append(']'); }
}
`;

export interface ParsedOutput {
  /** Everything the program printed except the result line (student console output). */
  readonly console: string;
  readonly result: { readonly found: true; readonly value: unknown } | { readonly found: false };
}

/** Extracts the nonce-tagged result line. A missing or unparsable line means "no result". */
export function parseProgramOutput(stdout: string, nonce: string): ParsedOutput {
  const marker = `\n${RESULT_PREFIX}${nonce}:`;
  const at = stdout.lastIndexOf(marker);
  if (at < 0) return { console: stdout, result: { found: false } };
  const start = at + marker.length;
  const end = stdout.indexOf('\n', start);
  const json = stdout.slice(start, end < 0 ? undefined : end);
  const console = stdout.slice(0, at) + (end < 0 ? '' : stdout.slice(end + 1));
  try {
    return { console, result: { found: true, value: JSON.parse(json) } };
  } catch {
    return { console, result: { found: false } };
  }
}
