# Phase 7 mở rộng — Thêm Python và C# cho bài tập CODE

**v1 · 16/11/2026 · PLAN.** Hiện có: `javascript` (Node 22), `java21` (Temurin 21), đã chạy trên production.
Mục tiêu: thêm `python3` (Python 3.13) và `csharp` (.NET 10 LTS) cho cả mentor và học viên.

Phân công: **Codex làm backend** (`compiler-runner/` + `Mindy-BE/`, phần A–C). **Claude làm frontend**
(`Mindy-FE2/`, phần D). Phần 1 là hợp đồng chung, hai bên phải theo đúng.

Liên quan: [PHASE_7_CODE_ASSIGNMENTS.md](PHASE_7_CODE_ASSIGNMENTS.md) · runner `../../../../compiler-runner/README.md`.

---

## 1. Hợp đồng chung (chốt trước khi code)

| | Python | C# |
| --- | --- | --- |
| `language key` | `python3` | `csharp` |
| `display_name` | `Python` | `C#` |
| `runtime_version` | `Python 3.13` | `.NET 10` |
| `editor_mode` | `python` | `csharp` |
| `time_multiplier` | `3` | `2` |
| Thứ tự hiển thị | JavaScript, Java, Python, C# | |
| File nguồn trong container | `main.py` | `Main.cs` |
| Indent mặc định (FE) | 4 space | 4 space |

**Thứ tự key chuẩn** (BE `CODE_LANGUAGE_KEYS`, FE `codeLanguageKeys`): `['javascript', 'java21', 'python3', 'csharp']`.

**Kiểu dữ liệu** (giữ nguyên 12 kiểu của `CODE_VALUE_TYPES`, không thêm kiểu mới):

| Kiểu Mindy | Python (type hint) | C# |
| --- | --- | --- |
| `int` / `long` | `int` | `int` / `long` |
| `double` | `float` | `double` |
| `boolean` | `bool` | `bool` |
| `string` | `str` | `string` |
| `X[]` | `list[X]` | `X[]` |
| `int[][]` / `string[][]` | `list[list[int]]` / `list[list[str]]` | `int[][]` / `string[][]` |

**Starter code** (ví dụ chữ ký `sum(a: int, b: int) -> long`):

```python
class Solution:
    def sum(self, a: int, b: int) -> int:
        pass
```

```csharp
public class Solution
{
    public long sum(int a, int b)
    {

    }
}
```

- Python dùng `list[int]` (built-in generic) để **không cần `from typing import List`**: driver nối *sau* code học viên nên số dòng lỗi giữ đúng.
- C# giữ nguyên `functionName` mentor đặt (không tự viết hoa), để một chữ ký dùng chung cho mọi ngôn ngữ.

**API thay đổi mà FE phụ thuộc:**

1. Mọi chỗ nhận/trả `languageKey` chấp nhận thêm `python3`, `csharp`.
2. `POST /mentor/code-signatures/preview` trả thêm 2 field: `{ javascript, java21, python3, csharp }`.
3. `GET /mentor/code-languages` và `availableLanguages` sắp theo thứ tự key chuẩn (không còn `ORDER BY key`).
4. Whiteboard code shape (`language`) chấp nhận thêm `python3`, `csharp`.

**Thứ tự triển khai bắt buộc** (FE dùng `z.enum` chặt, nếu BE trả key lạ trước khi FE biết thì cả trang code bị lỗi parse):
runner → BE + migration (2 dòng mới `enabled = false`) → FE → bật `enabled = true`. Chi tiết ở §5.

---

## A. compiler-runner (Codex)

Harness Go **không cần sửa**: nó chỉ chạy `compile.argv`/`run.argv` do runner đưa, child env cố định
`PATH, HOME=/tmp, LANG=C.UTF-8, TMPDIR=/tmp` (+`JAVA_HOME`). Lưu ý: **ENV khai báo trong Dockerfile không tới được
process của học viên**, nên mọi biến cho .NET phải truyền qua argv (`env VAR=... cmd`) hoặc script wrapper.
Môi trường container: `--read-only`, `/work` tmpfs 64 MB (exec), `/tmp` tmpfs 16 MB **noexec**, user 65534, `--pids-limit 128`, không mạng.

### A1. `judge-images/python.Dockerfile`
Copy `node.Dockerfile`, đổi base thành `python:3.13-alpine`. Giữ `USER 65534`, `WORKDIR /work`, entrypoint harness.

### A2. `judge-images/csharp.Dockerfile`
- Base `mcr.microsoft.com/dotnet/sdk:10.0-alpine` (pin digest như các image khác).
- Lúc build, tìm sẵn đường dẫn và bake vào image (không glob lúc chạy):
  - `csc.dll`: `/usr/share/dotnet/sdk/<ver>/Roslyn/bincore/csc.dll`
  - reference assemblies: `/usr/share/dotnet/packs/Microsoft.NETCore.App.Ref/<ver>/ref/net10.0/*.dll`
  - sinh `/opt/mindy/csc.rsp`: `-noconfig -nostdlib -nologo -target:exe -main:MindyMain -optimize+ -langversion:latest -nullable:disable -warn:0 -utf8output -out:main.dll` + một dòng `-r:<path>` cho mỗi ref dll.
  - `/opt/mindy/main.runtimeconfig.json`: framework `Microsoft.NETCore.App` đúng bản runtime trong image, `configProperties`: `"System.Globalization.Invariant": true`.
- Script `/usr/local/bin/mindy-csc` (sh, chmod 755):
  ```sh
  #!/bin/sh
  export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1 DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_EnableDiagnostics=0
  dotnet /path/to/csc.dll @/opt/mindy/csc.rsp Main.cs || exit $?
  cp /opt/mindy/main.runtimeconfig.json ./main.runtimeconfig.json
  ```
- `-main:MindyMain` để học viên lỡ viết `static void Main` không gây lỗi CS0017.
- Kiểm tra bằng tay: `docker run --rm --read-only --network none --user 65534 --tmpfs /work:rw,exec,size=64m,uid=65534 --tmpfs /tmp:rw,noexec,size=16m,uid=65534 -w /work ...` compile + chạy Hello World, đo thời gian compile (mục tiêu ≤ 3 s) và RSS của csc.

### A3. `src/languages.ts` — thêm 2 entry
```ts
{
  key: 'python3',
  image: env.JUDGE_PYTHON_IMAGE || 'mindy-judge-python:1',
  runtimeVersion: 'Python 3.13',
  sourceFile: 'main.py',
  compile: ['python3', '-m', 'py_compile', 'main.py'],   // chỉ kiểm tra cú pháp, ghi __pycache__ vào /work
  compileTimeoutMs: 10_000,
  run: () => ['python3', '-I', '-B', '-X', 'utf8', 'main.py'],
  startupAllowanceMs: 150,
  memoryOverheadMb: 32,
  minContainerMemoryMb: 96,
  outOfMemoryMarkers: ['MemoryError'],
},
{
  key: 'csharp',
  image: env.JUDGE_CSHARP_IMAGE || 'mindy-judge-csharp:1',
  runtimeVersion: '.NET 10',
  sourceFile: 'Main.cs',
  compile: ['mindy-csc'],
  compileTimeoutMs: 20_000,
  run: (memoryMb) => [
    'env', 'DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1', 'DOTNET_EnableDiagnostics=0', 'DOTNET_TieredPGO=0',
    `DOTNET_GCHeapHardLimit=0x${(memoryMb * 1024 * 1024).toString(16)}`,
    'dotnet', 'main.dll',
  ],
  startupAllowanceMs: 400,
  memoryOverheadMb: 192,
  minContainerMemoryMb: 512,   // csc cần ~300–400 MB; đo thật ở A2 rồi chỉnh
  outOfMemoryMarkers: ['OutOfMemoryException'],
},
```
Python không có cờ giới hạn heap: vượt memory → cgroup SIGKILL → harness báo `MEMORY_LIMIT` (đã có sẵn ở `main.go`).
**Không** dùng `RLIMIT_AS` vì driver Python tạo thread stack lớn (B2) sẽ đụng giới hạn địa chỉ ảo.

### A4. Compose, README
- `compose.production.yaml`: thêm `JUDGE_PYTHON_IMAGE: mindy-judge-python:1`, `JUDGE_CSHARP_IMAGE: mindy-judge-csharp:1`; thêm service build `judge-python`, `judge-csharp` (profile `judge-images`).
- `README.md`: bảng ngôn ngữ, contract `language`, lệnh build/pull, phụ cấp khởi động.

### A5. Test runner
- `test/runner.test.mjs`, `test/contract.test.mjs`: registry có 4 key; payload Python/C# đúng argv; `containerMemoryMb` cho C# ≥ 512.
- `scripts/smoke-test.mjs`: thêm cho mỗi ngôn ngữ mới: OK, lỗi biên dịch, `TIME_LIMIT` (vòng lặp vô hạn), `RUNTIME_ERROR` (exception), `OUTPUT_LIMIT`, `MEMORY_LIMIT`.
- `scripts/load-test.mjs`: cho phép trộn 4 ngôn ngữ (ví dụ thêm `PYTHON_RATIO`, `CSHARP_RATIO`) để đo p95 khi C# compile nặng.

---

## B. Mindy-BE (Codex)

### B0. Kiểm tra dữ liệu trước (bắt buộc, chạy trên DB production)
Thêm từ khóa vào `RESERVED` có thể làm `parseSignature` ném lỗi khi đọc bài cũ từ DB. Chạy trước:
```sql
SELECT assignment_id, signature FROM code_problems
WHERE signature->>'functionName' = ANY(:words)
   OR EXISTS (SELECT 1 FROM jsonb_array_elements(signature->'params') p WHERE p->>'name' = ANY(:words));
```
với `:words` = danh sách từ mới ở B1. Có kết quả → báo lại trước khi merge (đổi tên ở bài nháp, hoặc bỏ từ đó khỏi RESERVED và chấp nhận bài đó không bật được Python/C#).

### B1. `src/modules/assignments/domain/code-signature.ts`
- `CodeLanguageKey = 'javascript' | 'java21' | 'python3' | 'csharp'`; `CODE_LANGUAGE_KEYS` theo thứ tự chuẩn.
- `RESERVED` thêm:
  - Python: `False None True and as assert async await def del elif except from global is lambda nonlocal not or pass raise with self json sys threading`
  - C#: `base bool checked decimal delegate event explicit extern fixed foreach implicit internal lock namespace object operator out override params readonly ref sbyte sealed sizeof stackalloc string struct uint ulong unchecked unsafe ushort using virtual MindyMain Console`
- Thêm `pythonType()` và `csharpType()` theo bảng §1; `starterCode()` đổi `if/else` thành `switch` đủ 4 nhánh, output đúng mẫu §1.
- `matchesType()` giữ nguyên (kiểu `long` vẫn giới hạn `Number.isSafeInteger` vì JS).

### B2. `src/modules/assignments/domain/code-driver.ts`
`buildSource()` đổi sang `switch (language)` với `default: throw` (đừng để ngôn ngữ mới rơi vào nhánh Java).

**Python** — nối sau code học viên:
```python
<student code>

def __mindy_main():
    import json as _j, sys as _s
    _args = _j.loads(_s.stdin.read())
    _res = Solution().<functionName>(*_args)
    try:
        _out = _j.dumps(_res, separators=(",", ":"), allow_nan=False)
    except ValueError:
        _out = "null"                      # NaN/Infinity giống Java
    _s.stdout.flush()
    _s.stdout.write("\n" + <JSON.stringify(PREFIX+nonce+":")> + _out + "\n")
    _s.stdout.flush()

if __name__ == "__main__":
    import sys as _s, threading as _t, traceback as _tb
    _s.setrecursionlimit(200000)
    _t.stack_size(64 * 1024 * 1024)
    _err = []
    def _run():
        try:
            __mindy_main()
        except BaseException:
            _err.append(1); _tb.print_exc()
    _th = _t.Thread(target=_run); _th.start(); _th.join()
    _s.exit(1 if _err else 0)
```
Bắt buộc bắt exception trong thread: exception trong `threading.Thread` **không** làm process thoát mã ≠ 0, nếu bỏ sót thì lỗi runtime bị chấm thành sai kết quả.

**C#** — prepend 4 dòng using, nối class driver sau code học viên:
```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
<student code>

public static class MindyMain
{
    public static int Main()
    {
        int exit = 0;
        var t = new System.Threading.Thread(() =>
        {
            try { Run(); } catch (Exception e) { Console.Error.WriteLine(e); exit = 1; }
        }, 256 * 1024 * 1024);
        t.Start(); t.Join();
        return exit;
    }
    static void Run()
    {
        using var doc = System.Text.Json.JsonDocument.Parse(Console.In.ReadToEnd());
        var a = doc.RootElement;
        int a0 = System.Text.Json.JsonSerializer.Deserialize<int>(a[0]);   // một dòng cho mỗi param, kiểu theo csharpType()
        ...
        var result = new Solution().<functionName>(a0, ...);
        string json;
        try { json = System.Text.Json.JsonSerializer.Serialize(result); } catch (ArgumentException) { json = "null"; }
        Console.Out.Flush();
        Console.Out.Write("\n" + "<PREFIX+nonce>:" + json + "\n");
        Console.Out.Flush();
    }
}
```
- Prepend using làm số dòng lỗi lệch +4. Cách nhẹ nhất: đặt cả 4 using trên **một dòng** (`using System; using System.Collections.Generic; ...`) để chỉ lệch +1, và ghi chú điều đó.
- Học viên viết `using System.Linq;` trùng chỉ ra warning CS0105, không lỗi (`-warn:0` tắt luôn).
- `Solution` phải ở global namespace (starter đã vậy). Block `namespace X { ... }` sẽ làm `new Solution()` lỗi biên dịch: chấp nhận, ghi rõ trong hướng dẫn học viên.
- Prefix chứa `\u001e`: trong C# literal viết `\u001e` là hợp lệ; dùng `JSON.stringify` như driver JS là an toàn cho cả Python và C#.

### B3. Services / DTO
- `services/code-authoring.service.ts`
  - `preview()`: trả đủ 4 key (`Object.fromEntries(CODE_LANGUAGE_KEYS.map(k => [k, starterCode(k, s)]))`).
  - `languages()` (dòng ~117) và truy vấn `availableLanguages` (dòng ~873): đổi `ORDER BY key` thành `ORDER BY array_position($1::varchar[], key)` với `CODE_LANGUAGE_KEYS`.
- `services/code-submissions.service.ts` dòng ~495: đang `ORDER BY l.key DESC` (JS đứng trước Java nhờ chữ cái). Thêm Python thì `python3` sẽ lên đầu và thành ngôn ngữ mặc định của học viên → đổi sang `array_position` như trên.
- `dtos/code.dto.ts`, `dtos/code-student.dto.ts`: thay các `enum: ['javascript', 'java21']` bằng `enum: CODE_LANGUAGE_KEYS`; `CodeStarterPreviewDto` thêm `python3`, `csharp`.
- Controllers đã dùng `CODE_LANGUAGE_KEYS` cho `ParseEnumPipe`, không cần sửa.

### B4. Migration `src/database/migrations/1793750400000-code-languages-python-csharp.ts`
```sql
INSERT INTO code_languages(key, display_name, runtime_version, editor_mode, time_multiplier, enabled) VALUES
  ('python3', 'Python', 'Python 3.13', 'python', 3, false),
  ('csharp',  'C#',     '.NET 10',     'csharp', 2, false)
ON CONFLICT (key) DO NOTHING;
```
`down`: `UPDATE code_languages SET enabled = false WHERE key IN ('python3','csharp')`. Không DELETE vì 4 bảng tham chiếu `code_languages(key) ON DELETE RESTRICT`.

### B5. Whiteboard (để mentor kéo code Python/C# từ trang "Mentor làm mẫu" lên bảng)
- `src/modules/whiteboards/domain/code-tokens.ts`: `CodeShapeLanguage`, `CODE_SHAPE_LANGUAGES` thêm 2 key; thêm bộ keyword/literal; comment `#` cho Python.
- `board-render.ts` dòng ~107: thay ternary `java21 ? 'Java' : 'JavaScript'` bằng map nhãn 4 ngôn ngữ.
- `board-document.ts` tự nhận nhờ `CODE_SHAPE_LANGUAGES`.

### B6. Test BE
- `code-signature.spec.ts`: starter Python/C# đúng mẫu; từ khóa mới bị từ chối; thứ tự `CODE_LANGUAGE_KEYS`.
- `code-driver.spec.ts`: source Python/C# chứa nonce, gọi đúng hàm, `buildSource` với key lạ thì throw.
- **Round-trip với runner thật (quan trọng nhất)**: script hoặc integration test có gate env `CODE_RUNNER_URL`. Với mỗi ngôn ngữ × 12 kiểu, lời giải là hàm identity `f(x) = x`, kiểm `parseProgramOutput()` trả đúng giá trị ban đầu. Bao gồm chuỗi có Unicode/escape (`"a\"b\\c\nđ😀"`), mảng rỗng, số âm, `long` lớn (`2^53-1`), `double` như `0.1`, `1e-7`.
- Ca chấm: exception → `RUNTIME_ERROR` (đặc biệt Python trong thread), đệ quy sâu 10^5 tầng chạy được, `print` của học viên không lẫn vào kết quả.
- `test/integration/phase7-code-*.spec.ts`, `test/http/phase7-code-assignments.spec.ts`: thêm ca tạo bài 4 ngôn ngữ, preview trả 4 field, thứ tự ngôn ngữ.

---

## C. Ước lượng & tiêu chí xong (backend)

| Hạng mục | Ước lượng |
| --- | --- |
| A Python (image + spec + test) | 0.5 ngày |
| A C# (image, mindy-csc, đo bộ nhớ) | 1–1.5 ngày |
| B signature/driver/DTO/migration/whiteboard | 1–1.5 ngày |
| B6 round-trip + smoke | 0.5–1 ngày |

Xong khi: `npm test` runner + `go test` harness + test BE xanh; smoke 4 ngôn ngữ PASS trên VPS; round-trip 12 kiểu × 4 ngôn ngữ PASS.

---

## D. Mindy-FE2 (Claude) — ĐÃ XONG 16/11/2026

1. **Nguồn duy nhất cho ngôn ngữ**: `src/features/code-assignments/lib/code-languages.ts`
   `codeLanguageMeta: Record<CodeLanguageKey, { label, indent, lineComment }>` + `languageName()`, `languageIndent()`, `isCodeLanguage()`.
   Đã thay toàn bộ ternary `java21 ? 'Java' : 'JavaScript'` / indent ở các màn tạo bài, test, làm mẫu, học viên, review, quick start.
   (Không thêm `indentAfter`/`fence` vào meta: dấu `:` chỉ Python dùng nên để trong editor; nhãn fence thuộc `chat-code.ts`.)
2. `schemas/code-contracts.ts`: 4 key; `starterPreviewSchema = z.partialRecord(...)` để FE chạy được cả khi BE trả thiếu ngôn ngữ.
3. `lib/code-highlight.ts`: keyword/literal/kiểu cho Python và C#; Python dùng regex riêng (`#` comment, `'''`/`"""`, `//` là phép chia); `@decorator` tô như annotation. **Bỏ qua** `[Attribute]` của C# và tiền tố `f"…"` của Python (chỉ ảnh hưởng màu).
4. `components/code-editor.tsx`: Ctrl/⌘+/ dùng `lineComment` (`#` cho Python); Enter sau `:` tự thụt lề cho Python.
   **Giữ nguyên** việc tự lùi `}` trên dòng trống cho mọi ngôn ngữ (kể cả Python): dict/set nhiều dòng của Python cũng cần lùi `}` như vậy, nên chặn cho Python sẽ tệ hơn.
5. Whiteboard: `whiteboard-contracts.ts` dùng `codeLanguageKeySchema`; nhãn ở `whiteboard-code-block.tsx`; guard kéo thả bằng `isCodeLanguage`.
6. Chat: `chat-code.ts` thêm `py`/`python` → `python3`, `cs`/`csharp` → `csharp` (fence `c#` không khả dụng vì regex nhãn là `[\w+-]*`); nhãn ở `chat-code-block.tsx`; guard ở `chat-composer.tsx`, `floating-chat.tsx`.
7. Test: `code-highlight.test.ts` (+2 ca Python/C#), `chat-code.test.ts` (`py`/`cs` giờ là ngôn ngữ đã biết, ví dụ "ngôn ngữ lạ" đổi sang `rb`), `src/lib/api/code-proxy.test.ts` (ví dụ ngoài allowlist đổi từ `python3` sang `ruby`).
   Đã chạy: `tsc --noEmit`, ESLint, Prettier sạch. **Chưa chạy `npm test` (vitest)** trên máy dev: chạy `cd Mindy-FE2 && npm test && npm run check:types` trước khi phát hành.

Ước lượng: 1.5–2 ngày, làm song song với backend.

---

## 5. Triển khai production (theo đúng thứ tự)

1. **Kiểm tra VPS**: `df -h` (image .NET SDK ~1 GB, Python ~60 MB), `free -m`.
2. **Runner**: pull base image, build `judge-python`, `judge-csharp`, rebuild + `up -d runner`. Chạy `smoke-test.mjs` (4 ngôn ngữ). Thêm runner trước là vô hại vì BE chưa gửi key mới.
3. **BE**: deploy + chạy migration (2 dòng `enabled = false`). Từ container BE, chạy round-trip qua runner production cho Python/C# (giống cách đã kiểm Java).
4. **FE**: deploy bản đã nhận 4 ngôn ngữ.
5. **Bật**: `UPDATE code_languages SET enabled = true WHERE key IN ('python3','csharp');`
6. **Nghiệm thu tay**: tạo bài nháp tick 4 ngôn ngữ → lời giải mẫu mỗi ngôn ngữ → validate → giao → tài khoản học viên chạy thử + nộp bằng Python và C#.

**Rollback**: `UPDATE code_languages SET enabled = false WHERE key IN (...)` (ẩn ngay khỏi mentor và học viên, không xoá dữ liệu). Bài đã nộp vẫn xem lại được.

## 6. Rủi ro đã biết

- C# compile nặng (csc ~1–3 s, ~300–400 MB RAM). VPS chạy `RUNNER_SLOTS_BATCH=2` → 2 bài C# cùng lúc có thể cần ~1 GB. Đo ở A2, chỉnh `minContainerMemoryMb` hoặc giảm slot.
- Python chậm, `time_multiplier = 3` có thể vẫn chưa đủ cho đề nặng: mentor nên chạy validate đủ 4 ngôn ngữ trước khi giao.
- Từ khóa mới trong `RESERVED` có thể chặn bài cũ (B0).
- MindyFlutter / MindyMobile chưa kiểm tra có hiển thị bài code không; nếu có thì cần cập nhật riêng.
