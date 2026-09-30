/**
 * Test evidence for the verify gate (AGENT-15, REQ-agent-185).
 *
 * AGENT-15: "'verified' requires that tests ran and none were deleted." A
 * passing verify lane is not enough by itself: the lane must show that tests
 * ran, and the run must not have deleted or turned off a test.
 *
 * - Tests ran: `countExecutedTests` reads the test summary the lane printed.
 *   Only runners with a reliable summary line are recognised: `bun test`,
 *   jest, vitest, `cargo test`, pytest and `go test`. Executed means passed
 *   or failed; skipped, todo and ignored tests do not count. No recognised
 *   summary, or none executed, fails closed (there is no opt-out, AGENT-14).
 * - None deleted: test names are read from the source of the test files a
 *   run changed, before and after. A test counts as dropped when its name is
 *   gone from the changed set, or it is still there but no longer runs
 *   (`.skip`, `.todo`, `x`-prefixed, a conditional `.if` / `.skipIf`, a
 *   skip decorator or `#[ignore]`, or silenced by an `.only` elsewhere in its
 *   file). Renames and moves that keep the names are not deletions; a
 *   retitled test is, and the note names it.
 *
 * The git side of the none-deleted check lives on the workspace tracker
 * (`WorkspaceDiffTracker.testDrops`, `src/agent/workspace-diff.ts`). A
 * project with no git work tree gets a bounded walk of its test files at run
 * start instead (`startTestNameWalk`); a walk that could not finish, like a
 * diff git cannot read, fails closed.
 */

import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import type { TestDrop } from "./types.ts";

/** The runners whose summary line counts as evidence (in note order). */
export const TEST_SUMMARY_RUNNERS = [
  "bun test",
  "jest",
  "vitest",
  "cargo test",
  "pytest",
  "go test",
] as const;

export type TestSummaryRunner = (typeof TEST_SUMMARY_RUNNERS)[number];

/** A test file bigger than this is unreadable (the check fails closed). */
export const TEST_SOURCE_MAX_BYTES = 4 * 1024 * 1024;
/** Test source bytes one check reads (before + after); over it, unreadable. */
export const TEST_NAMES_BUDGET_BYTES = 64 * 1024 * 1024;
/** Changed test files one check compares; more makes it unreadable. */
export const TEST_NAMES_MAX_FILES = 2000;
/** Directory entries the non-git walk visits; more makes it unreadable. */
export const TEST_WALK_MAX_ENTRIES = 20_000;
/** Dropped tests a note names before "…". */
export const TEST_DROPS_NAMED = 10;

const ANSI_CSI_RE = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

export type RunnerCount = {
  runner: TestSummaryRunner;
  /** Tests that ran (passed or failed). */
  executed: number;
};

export type TestRunEvidence = {
  /** At least one recognised summary line was printed. */
  recognised: boolean;
  /** Executed tests over every recognised summary. */
  executed: number;
  /** One entry per runner seen, in `TEST_SUMMARY_RUNNERS` order. */
  runners: RunnerCount[];
};

function num(s: string | undefined): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** `(\d+) word` pairs of one summary line, summed per word. */
function tally(text: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of text.matchAll(/(\d+) ([a-z]+)/g)) {
    const word = m[2] ?? "";
    out.set(word, (out.get(word) ?? 0) + num(m[1]));
  }
  return out;
}

/**
 * Executed tests in a verify lane's output (stdout then stderr), from the
 * summary lines of `bun test`, jest, vitest, `cargo test`, pytest and
 * `go test`. Colour escapes are ignored. Never throws.
 */
export function countExecutedTests(output: string): TestRunEvidence {
  const lines = output.replace(ANSI_CSI_RE, "").split(/\r?\n/);
  const found = new Map<TestSummaryRunner, number>();
  const add = (runner: TestSummaryRunner, n: number) =>
    found.set(runner, (found.get(runner) ?? 0) + n);

  let goVerbose = 0;
  let goPackages = 0;
  let goSeen = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    // bun test: ` N pass` / ` N fail` / ` N skip` / ` N todo` lines, then
    // `Ran N tests across M files.`
    if (/^Ran \d+ tests? across \d+ files?\./.test(line)) {
      let pass: number | undefined;
      let fail: number | undefined;
      for (let j = i - 1; j >= 0 && j >= i - 12; j--) {
        const m = /^\s*(\d+) (pass|fail|skip|todo|error|filtered|snapshots?|expect\(\) calls)\b/.exec(
          lines[j] ?? "",
        );
        if (!m) break;
        if (m[2] === "pass") pass = num(m[1]);
        if (m[2] === "fail") fail = num(m[1]);
      }
      if (pass !== undefined || fail !== undefined) add("bun test", (pass ?? 0) + (fail ?? 0));
      continue;
    }
    // jest: `Tests:       1 failed, 2 skipped, 5 passed, 8 total`
    let m = /^Tests:\s+(.*\b\d+ total)\s*$/.exec(line);
    if (m) {
      const t = tally(m[1] ?? "");
      add("jest", (t.get("passed") ?? 0) + (t.get("failed") ?? 0));
      continue;
    }
    // vitest: `      Tests  1 failed | 4 passed | 1 skipped (6)`
    m = /^\s*Tests\s{2,}((?:\d+ [a-z]+(?: \| )?)+)\s*\(\d+\)\s*$/.exec(line);
    if (m) {
      const t = tally(m[1] ?? "");
      add("vitest", (t.get("passed") ?? 0) + (t.get("failed") ?? 0));
      continue;
    }
    // cargo test, one line per test binary:
    // `test result: ok. 3 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; …`
    m = /^test result: (?:ok|FAILED)\. (\d+) passed; (\d+) failed; \d+ ignored; \d+ measured; \d+ filtered out/.exec(
      line,
    );
    if (m) {
      add("cargo test", num(m[1]) + num(m[2]));
      continue;
    }
    // pytest: `==== 3 passed, 1 skipped in 0.12s ====` (or `-q`: `3 passed in 0.12s`),
    // `==== no tests ran in 0.01s ====`
    m = /^(?:=+ )?((?:\d+ (?:passed|failed|skipped|deselected|xfailed|xpassed|errors?|warnings?|rerun)(?:, )?)+) in \d+(?:\.\d+)?s\b.*$/.exec(
      line,
    );
    if (m) {
      const t = tally(m[1] ?? "");
      add(
        "pytest",
        (t.get("passed") ?? 0) + (t.get("failed") ?? 0) + (t.get("xfailed") ?? 0) + (t.get("xpassed") ?? 0),
      );
      continue;
    }
    if (/^(?:=+ )?no tests ran in \d+(?:\.\d+)?s\b/.test(line)) {
      add("pytest", 0);
      continue;
    }
    // go test -v: top-level `--- PASS: TestX (0.00s)` / `--- FAIL: …`
    // (subtests are indented); without -v, one `ok  <pkg>  <time>` line per
    // package that ran tests (`[no tests to run]` = none).
    if (/^--- (?:PASS|FAIL): \S+ \(/.test(line)) {
      goVerbose += 1;
      goSeen = true;
      continue;
    }
    m = /^ok\s+\S+\s+(?:\d+(?:\.\d+)?s|\(cached\))(.*)$/.exec(line);
    if (m) {
      goSeen = true;
      if (!/\[no tests to run\]/.test(m[1] ?? "")) goPackages += 1;
      continue;
    }
    if (/^\?\s+\S+\s+\[no test files\]/.test(line) || /^--- SKIP: \S+ \(/.test(line)) {
      goSeen = true;
    }
  }
  if (goSeen) add("go test", goVerbose > 0 ? goVerbose : goPackages);

  const runners: RunnerCount[] = [];
  for (const runner of TEST_SUMMARY_RUNNERS) {
    const executed = found.get(runner);
    if (executed !== undefined) runners.push({ runner, executed });
  }
  return {
    recognised: runners.length > 0,
    executed: runners.reduce((s, r) => s + r.executed, 0),
    runners,
  };
}

// ---------------------------------------------------------------------------
// Test declarations in source

/** One test a file declares; `active` = it would run. */
export type TestDecl = { name: string; active: boolean };

/** The test declarations of one file. */
export type FileTests = { file: string; decls: TestDecl[] };

const JS_EXT_RE = /\.[cm]?[jt]sx?$/;

/**
 * True for a path whose tests the none-deleted check reads: JS/TS test files
 * (`*.test.*`, `*.spec.*`, `*_test.*`, `*_spec.*`, `*_test_.*` or under
 * `__tests__/`), pytest files (`test_*.py`, `*_test.py`), Go `*_test.go` and
 * every Rust `.rs` file (unit tests live next to the code).
 */
export function isTestFilePath(path: string): boolean {
  const p = path.replace(/\\/g, "/");
  const base = p.slice(p.lastIndexOf("/") + 1);
  if (JS_EXT_RE.test(base)) {
    if (/[._](?:test|spec)_?\.[cm]?[jt]sx?$/.test(base)) return !base.endsWith(".d.ts");
    return /(?:^|\/)__tests__\//.test(p);
  }
  if (base.endsWith(".py")) return /^test_.*\.py$/.test(base) || /_test\.py$/.test(base);
  if (base.endsWith(".go")) return base.endsWith("_test.go");
  return base.endsWith(".rs");
}

/** Test declarations in `source` of the file at `path`; [] for other files. */
export function testDeclarations(path: string, source: string): TestDecl[] {
  if (!isTestFilePath(path)) return [];
  const base = path.slice(path.lastIndexOf("/") + 1);
  try {
    if (JS_EXT_RE.test(base)) return jsDeclarations(source);
    if (base.endsWith(".py")) return pyDeclarations(source);
    if (base.endsWith(".go")) return goDeclarations(source);
    return rustDeclarations(source);
  } catch {
    return [];
  }
}

type Tok = { t: "id" | "str" | "p"; v: string };

const REGEX_AFTER_WORD = new Set([
  "return",
  "typeof",
  "case",
  "do",
  "else",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "throw",
  "instanceof",
  "yield",
  "await",
]);

/** JS/TS tokens: identifiers, string literals, punctuation; comments dropped. */
function jsTokens(src: string): Tok[] {
  const out: Tok[] = [];
  const n = src.length;
  let i = 0;
  const regexAllowed = (): boolean => {
    const prev = out[out.length - 1];
    if (!prev) return true;
    if (prev.t === "str") return false;
    if (prev.t === "id") return REGEX_AFTER_WORD.has(prev.v);
    return !(prev.v === ")" || prev.v === "]" || prev.v === "}" || prev.v === "num");
  };
  while (i < n) {
    const c = src[i]!;
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      const e = src.indexOf("\n", i);
      i = e < 0 ? n : e;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const e = src.indexOf("*/", i + 2);
      i = e < 0 ? n : e + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let v = "";
      while (j < n && src[j] !== c && src[j] !== "\n") {
        if (src[j] === "\\" && j + 1 < n) {
          v += src[j + 1];
          j += 2;
          continue;
        }
        v += src[j];
        j++;
      }
      out.push({ t: "str", v });
      i = j + 1;
      continue;
    }
    if (c === "`") {
      let j = i + 1;
      let v = "";
      while (j < n && src[j] !== "`") {
        if (src[j] === "\\" && j + 1 < n) {
          v += src[j + 1];
          j += 2;
          continue;
        }
        if (src[j] === "$" && src[j + 1] === "{") {
          let depth = 1;
          v += "${";
          j += 2;
          while (j < n && depth > 0) {
            if (src[j] === "{") depth++;
            else if (src[j] === "}") depth--;
            if (depth > 0) v += src[j];
            j++;
          }
          v += "}";
          continue;
        }
        v += src[j];
        j++;
      }
      out.push({ t: "str", v });
      i = j + 1;
      continue;
    }
    if (c === "/" && regexAllowed()) {
      let j = i + 1;
      let inClass = false;
      while (j < n && src[j] !== "\n") {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === "[") inClass = true;
        else if (src[j] === "]") inClass = false;
        else if (src[j] === "/" && !inClass) break;
        j++;
      }
      j++;
      while (j < n && /[a-z]/i.test(src[j]!)) j++;
      out.push({ t: "p", v: "re" });
      i = j;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w$]/.test(src[j]!)) j++;
      out.push({ t: "id", v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w.]/.test(src[j]!)) j++;
      out.push({ t: "p", v: "num" });
      i = j;
      continue;
    }
    out.push({ t: "p", v: c });
    i++;
  }
  return out;
}

const JS_TEST_FNS = new Set(["test", "it", "xit", "xtest", "fit"]);
const JS_SUITE_FNS = new Set(["describe", "suite", "xdescribe", "fdescribe"]);
/** Modifiers that are called before the declaration call: `test.each(t)("x")`. */
const JS_CALL_MODS = new Set(["each", "if", "skipIf", "todoIf", "runIf", "failingIf", "for"]);
/** Modifiers (and x-names) whose declaration does not run, or may not. */
const JS_OFF_MODS = new Set(["skip", "todo", "if", "skipIf", "todoIf", "runIf"]);

type JsDecl = {
  kind: "test" | "suite";
  name: string;
  at: number;
  close: number;
  off: boolean;
  only: boolean;
};

function matchParen(toks: Tok[], open: number): number {
  let depth = 0;
  for (let k = open; k < toks.length; k++) {
    const v = toks[k]!;
    if (v.t !== "p") continue;
    if (v.v === "(") depth++;
    else if (v.v === ")") {
      depth--;
      if (depth === 0) return k;
    }
  }
  return toks.length;
}

function jsDeclarations(src: string): TestDecl[] {
  const toks = jsTokens(src);
  const decls: JsDecl[] = [];
  for (let k = 0; k < toks.length; k++) {
    const tok = toks[k]!;
    if (tok.t !== "id") continue;
    const kind = JS_TEST_FNS.has(tok.v) ? "test" : JS_SUITE_FNS.has(tok.v) ? "suite" : null;
    if (!kind) continue;
    const prev = toks[k - 1];
    if (prev && prev.t === "p" && prev.v === ".") continue;
    if (prev && prev.t === "id" && (prev.v === "function" || prev.v === "async")) continue;
    const mods: string[] = [];
    let j = k + 1;
    for (;;) {
      const a = toks[j];
      const b = toks[j + 1];
      if (a?.t === "p" && a.v === "." && b?.t === "id") {
        mods.push(b.v);
        j += 2;
        continue;
      }
      const last = mods[mods.length - 1];
      if (a?.t === "p" && a.v === "(" && last !== undefined && JS_CALL_MODS.has(last)) {
        j = matchParen(toks, j) + 1;
        mods.push(`${last}()`);
        continue;
      }
      if (a?.t === "str" && last === "each") {
        j += 1;
        mods.push("each()");
        continue;
      }
      break;
    }
    const open = toks[j];
    const title = toks[j + 1];
    if (open?.t !== "p" || open.v !== "(" || title?.t !== "str") continue;
    const plain = mods.map((m) => m.replace(/\(\)$/, ""));
    decls.push({
      kind,
      name: title.v,
      at: k,
      close: matchParen(toks, j),
      off: tok.v.startsWith("x") || plain.some((m) => JS_OFF_MODS.has(m)),
      only: tok.v === "fit" || tok.v === "fdescribe" || plain.includes("only"),
    });
  }
  const suites = decls.filter((d) => d.kind === "suite");
  const anyOnly = decls.some((d) => d.only);
  const out: TestDecl[] = [];
  for (const d of decls) {
    if (d.kind !== "test") continue;
    const around = suites.filter((s) => s.at < d.at && d.at < s.close);
    const off = d.off || around.some((s) => s.off);
    const only = d.only || around.some((s) => s.only);
    out.push({ name: d.name, active: !off && (!anyOnly || only) });
  }
  return out;
}

/** Net `(` minus `)` on a Python line (strings and comments ignored roughly). */
function parenDelta(line: string): number {
  let d = 0;
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "#") break;
    if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[" || c === "{") d++;
    else if (c === ")" || c === "]" || c === "}") d--;
  }
  return d;
}

const PY_SKIP_DECO_RE = /^@(?:[\w.]*\.)?(?:skip|skipif|skipIf|skipUnless)\b/;

function pyDeclarations(src: string): TestDecl[] {
  const out: TestDecl[] = [];
  const classes: { indent: number; skip: boolean; test: boolean }[] = [];
  let decos: string[] = [];
  let decoDepth = 0;
  let triple: string | null = null;
  let moduleSkip = false;
  for (const raw of src.split(/\r?\n/)) {
    if (triple) {
      if (raw.includes(triple)) triple = null;
      continue;
    }
    const line = raw.trimEnd();
    const stripped = line.trim();
    if (!stripped || stripped.startsWith("#")) continue;
    if (decoDepth > 0) {
      decoDepth = Math.max(0, decoDepth + parenDelta(stripped));
      continue;
    }
    const indent = line.length - line.trimStart().length;
    while (classes.length > 0 && classes[classes.length - 1]!.indent >= indent) classes.pop();
    if (stripped.startsWith("@")) {
      decos.push(stripped);
      decoDepth = Math.max(0, parenDelta(stripped));
      continue;
    }
    const def = /^(?:async\s+)?def\s+(\w+)\s*\(/.exec(stripped);
    if (def) {
      const name = def[1] ?? "";
      const inClass = classes[classes.length - 1];
      if (name.startsWith("test") && (!inClass || inClass.test)) {
        const off = moduleSkip || decos.some((d) => PY_SKIP_DECO_RE.test(d)) || classes.some((c) => c.skip);
        out.push({ name, active: !off });
      }
      decos = [];
      continue;
    }
    const cls = /^class\s+(\w+)\s*(\([^)]*\))?/.exec(stripped);
    if (cls) {
      classes.push({
        indent,
        skip: decos.some((d) => PY_SKIP_DECO_RE.test(d)),
        test: /^Test/.test(cls[1] ?? "") || /TestCase\b/.test(cls[2] ?? ""),
      });
      decos = [];
      continue;
    }
    decos = [];
    if (indent === 0 && /^pytestmark\s*=/.test(stripped) && /\bskip/.test(stripped)) moduleSkip = true;
    for (const q of ['"""', "'''"]) {
      const count = stripped.split(q).length - 1;
      if (count % 2 === 1) {
        triple = q;
        break;
      }
    }
  }
  return out;
}

/**
 * `src` with `//` and `/* *\/` comments blanked out (newlines kept), string,
 * raw-string and char literals kept, for Go and Rust.
 */
function stripCComments(src: string): string {
  let out = "";
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i]!;
    if (c === "/" && src[i + 1] === "/") {
      const e = src.indexOf("\n", i);
      i = e < 0 ? n : e;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      let depth = 1;
      let j = i + 2;
      while (j < n && depth > 0) {
        if (src[j] === "/" && src[j + 1] === "*") {
          depth++;
          j += 2;
        } else if (src[j] === "*" && src[j + 1] === "/") {
          depth--;
          j += 2;
        } else {
          if (src[j] === "\n") out += "\n";
          j++;
        }
      }
      i = j;
      out += " ";
      continue;
    }
    if (c === '"' || c === "`") {
      let j = i + 1;
      while (j < n && src[j] !== c) {
        if (c === '"' && src[j] === "\\") j++;
        j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === "'") {
      // A char / rune literal ('x', '\n'); otherwise a Rust lifetime.
      const end = src[i + 1] === "\\" ? src.indexOf("'", i + 3) : src[i + 2] === "'" ? i + 2 : -1;
      if (end > 0 && end - i <= 12) {
        out += src.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }
    out += c;
    i++;
  }
  return out;
}

function goDeclarations(src: string): TestDecl[] {
  const out: TestDecl[] = [];
  const code = stripCComments(src);
  for (const m of code.matchAll(/^func\s+(Test(?:[^a-z\s(]\w*)?)\s*\(\s*\w+\s+\*testing\.T\s*\)/gm)) {
    out.push({ name: m[1] ?? "", active: true });
  }
  return out;
}

const RUST_FN_RE =
  /((?:#\[(?:[^[\]]|\[[^\]]*\])*\]\s*)+)(?:pub(?:\s*\([^)]*\))?\s+)?(?:const\s+)?(?:async\s+)?(?:unsafe\s+)?(?:extern\s+"[^"]*"\s+)?fn\s+(\w+)/g;

function rustDeclarations(src: string): TestDecl[] {
  const out: TestDecl[] = [];
  const code = stripCComments(src);
  for (const m of code.matchAll(RUST_FN_RE)) {
    const attrs = [...(m[1] ?? "").matchAll(/#\[\s*([\w:]+)/g)].map((a) => a[1] ?? "");
    const isTest = attrs.some((a) => {
      const last = a.slice(a.lastIndexOf(":") + 1);
      return last === "test" || a === "rstest" || a === "test_case";
    });
    if (!isTest) continue;
    out.push({ name: m[2] ?? "", active: !attrs.includes("ignore") });
  }
  return out;
}

/**
 * Tests active in `before` that are not active in `after`, by name across
 * all the files given (a name counted once per declaration), so a test
 * moved to another file or a renamed file keeps its name and is not
 * dropped; a retitled, deleted or turned-off test is.
 */
export function droppedTests(before: FileTests[], after: FileTests[]): TestDrop[] {
  const left = new Map<string, number>();
  for (const f of after) {
    for (const d of f.decls) if (d.active) left.set(d.name, (left.get(d.name) ?? 0) + 1);
  }
  const drops: TestDrop[] = [];
  for (const f of before) {
    for (const d of f.decls) {
      if (!d.active) continue;
      const n = left.get(d.name) ?? 0;
      if (n > 0) left.set(d.name, n - 1);
      else drops.push({ name: d.name, file: f.file });
    }
  }
  return drops;
}

// ---------------------------------------------------------------------------
// Reading test files (no follow, bounded)

/** Stat identity of a path (no follow); "missing" when absent. */
export function statIdentity(abs: string): string {
  try {
    const st = lstatSync(abs, { bigint: true });
    return `${st.mode}:${st.size}:${st.ino}:${st.mtimeNs}:${st.ctimeNs}`;
  } catch {
    return "missing";
  }
}

/**
 * A test file's text: undefined when it is missing or not a regular file (a
 * symlink, a directory, a fifo: no tests there), null when it cannot be read
 * or is over `TEST_SOURCE_MAX_BYTES` (the check then fails closed).
 */
export function readTestSource(abs: string): string | null | undefined {
  let st;
  try {
    st = lstatSync(abs);
  } catch {
    return undefined;
  }
  if (!st.isFile()) return undefined;
  if (st.size > TEST_SOURCE_MAX_BYTES) return null;
  let fd: number | undefined;
  try {
    fd = openSync(abs, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const fst = fstatSync(fd);
    if (!fst.isFile()) return undefined;
    if (fst.size > TEST_SOURCE_MAX_BYTES) return null;
    return readFileSync(fd, "utf8");
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* already closed */
      }
    }
  }
}

/** A test file seen at a snapshot: its stat identity and its tests (null = unreadable). */
export type TestFileSnapshot = { fp: string; decls: TestDecl[] | null };

/** Snapshot one test file (never throws); `budget.left` counts bytes read. */
export function snapshotTestFile(
  root: string,
  path: string,
  budget: { left: number },
): TestFileSnapshot {
  const abs = join(root, path);
  const fp = statIdentity(abs);
  if (budget.left <= 0) return { fp, decls: null };
  const text = readTestSource(abs);
  if (text === null) return { fp, decls: null };
  if (text === undefined) return { fp, decls: [] };
  budget.left -= text.length;
  return { fp, decls: testDeclarations(path, text) };
}

/** Directories the non-git walk never enters (dependencies, build output, VCS). */
const WALK_SKIP_DIRS = new Set([
  "node_modules",
  "target",
  "vendor",
  "dist",
  "build",
  "coverage",
  "venv",
  "__pycache__",
]);

/**
 * Every test file under `root` (no symlinks followed; dot-directories and
 * `WALK_SKIP_DIRS` skipped), snapshotted; null when the walk is over
 * `TEST_WALK_MAX_ENTRIES` or cannot read `root`.
 */
function walkTests(root: string, maxEntries: number): Map<string, TestFileSnapshot> | null {
  const out = new Map<string, TestFileSnapshot>();
  const budget = { left: TEST_NAMES_BUDGET_BYTES };
  const stack: string[] = [""];
  let seen = 0;
  while (stack.length > 0) {
    const rel = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(join(root, rel), { withFileTypes: true });
    } catch {
      if (rel === "") return null;
      continue;
    }
    for (const e of entries) {
      seen += 1;
      if (seen > maxEntries) return null;
      const path = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!e.name.startsWith(".") && !WALK_SKIP_DIRS.has(e.name)) stack.push(path);
        continue;
      }
      if (e.isFile() && isTestFilePath(path)) out.set(path, snapshotTestFile(root, path, budget));
    }
  }
  return out;
}

/** The none-deleted check the gate calls after a passing lane (null = unreadable). */
export type TestDropCheck = { testDrops(): Promise<TestDrop[] | null> };

/**
 * Before/after comparison of two snapshots of the same files; null when a
 * changed file could not be read on either side.
 */
export function dropsBetween(
  start: Map<string, TestFileSnapshot>,
  now: Map<string, TestFileSnapshot>,
): TestDrop[] | null {
  const before: FileTests[] = [];
  const after: FileTests[] = [];
  for (const path of new Set([...start.keys(), ...now.keys()])) {
    const s = start.get(path);
    const c = now.get(path);
    if (s && c && s.fp === c.fp) continue;
    if (s) {
      if (!s.decls) return null;
      before.push({ file: path, decls: s.decls });
    }
    if (c) {
      if (!c.decls) return null;
      after.push({ file: path, decls: c.decls });
    }
  }
  return droppedTests(before, after);
}

/**
 * Non-git none-deleted check (REQ-agent-185): snapshot the test files under
 * `dir` now; `testDrops()` walks again and compares. A walk that could not
 * finish (too many entries, unreadable) makes `testDrops()` null, so the
 * gate fails closed, as REQ-agent-502 does for the diff. Never throws.
 */
export function startTestNameWalk(
  dir: string,
  maxEntries: number = TEST_WALK_MAX_ENTRIES,
): TestDropCheck {
  let start: Map<string, TestFileSnapshot> | null;
  try {
    start = walkTests(dir, maxEntries);
  } catch {
    start = null;
  }
  return {
    testDrops: async () => {
      if (!start) return null;
      try {
        const now = walkTests(dir, maxEntries);
        return now ? dropsBetween(start, now) : null;
      } catch {
        return null;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// The verdict

export type TestEvidenceVerdict = {
  /** Tests ran and none were deleted: the passing lane counts as verified. */
  ok: boolean;
  /** The one `Verify gate:` note for the run's events, feedback and summary. */
  note: string;
};

/** One line, at most `max` chars, never ending on half a surrogate pair. */
function cap(s: string, max: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  let cut = max - 1;
  const code = one.charCodeAt(cut - 1);
  if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
  return `${one.slice(0, cut)}…`;
}

/** Most chars the named drops take in a note (the feedback cap is 4000). */
export const TEST_DROPS_MAX_CHARS = 1500;

/**
 * `"name" (file)`, up to `TEST_DROPS_NAMED` and `TEST_DROPS_MAX_CHARS`,
 * then how many more.
 */
export function formatTestDrops(drops: TestDrop[]): string {
  const shown: string[] = [];
  let used = 0;
  for (const d of drops.slice(0, TEST_DROPS_NAMED)) {
    const item = `${JSON.stringify(cap(d.name, 100))} (${cap(d.file, 120)})`;
    if (shown.length > 0 && used + item.length + 2 > TEST_DROPS_MAX_CHARS) break;
    shown.push(item);
    used += item.length + 2;
  }
  const more = drops.length - shown.length;
  return more > 0 ? `${shown.join(", ")}, and ${more} more` : shown.join(", ");
}

function runnerList(e: TestRunEvidence): string {
  return e.runners.map((r) => `${r.runner}: ${r.executed}`).join(", ");
}

/**
 * The AGENT-15 verdict on a verify lane that passed (REQ-agent-185): tests
 * ran (a recognised summary with at least one executed test) and none were
 * deleted (`drops` empty; null = could not tell). Every problem is named in
 * one note, so a retry can fix them together.
 */
export function judgeTestEvidence(
  laneOutput: string,
  drops: TestDrop[] | null,
): TestEvidenceVerdict {
  const run = countExecutedTests(laneOutput);
  const problems: string[] = [];
  if (!run.recognised) {
    problems.push(
      `the verify lane (fledge lanes run verify) passed, but it printed no test summary Corvidinho recognises (${TEST_SUMMARY_RUNNERS.join(", ")}), so nothing shows that tests ran; the verify lane needs a test step that prints one`,
    );
  } else if (run.executed === 0) {
    problems.push(
      `the verify lane passed, but no test ran (${runnerList(run)}; skipped and todo tests don't count)`,
    );
  }
  if (drops === null) {
    problems.push("could not read the test files to check that no test was deleted");
  } else if (drops.length > 0) {
    problems.push(
      `${drops.length} test(s) were deleted or turned off (removed, retitled, skip, todo, or silenced by only): ${formatTestDrops(drops)}; restore them (a moved test keeps its name)`,
    );
  }
  if (problems.length === 0) {
    return {
      ok: true,
      note: `Verify gate: ${run.executed} test(s) ran (${runnerList(run)}), and none were deleted.`,
    };
  }
  return { ok: false, note: `Verify gate: not verified: ${problems.join("; and ")}.` };
}
