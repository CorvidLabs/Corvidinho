/**
 * SPECSYNC-2 / SPECSYNC-3 / SPECSYNC-7 (REQ-agent-005, REQ-plugins-008,
 * REQ-cli-089).
 *
 * - The verify lane's `spec-check` task runs `specsync check` at the same
 *   strictness as the CI Spec Sync Action, so a tree CI rejects never reaches
 *   verified=true locally.
 * - `specsync-check` uses the project's Fledge `spec-check` task only when the
 *   project defines one; otherwise it runs the local `specsync check`.
 * - `specsync-score` (and `corvidinho specsync score`) returns the local
 *   `specsync score` report.
 *
 * CI installs neither fledge nor specsync, so these run the real CLI with stub
 * `fledge` / `specsync` on PATH (stub-bin pattern of cli.doctor-truth). The
 * last block uses the real binaries and is skipped when they are missing.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildOpenAiTools } from "../src/agent/tools.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry } from "../src/plugins/registry.ts";
import { projectDefinesSpecCheckTask } from "../plugins/specsync/api.ts";

const REPO = join(import.meta.dir, "..");
const CLI = join(REPO, "src", "cli.ts");

type Toml = { tasks?: Record<string, { cmd?: string }>; lanes?: Record<string, { steps?: unknown[] }> };

function repoFledge(): Toml {
  return Bun.TOML.parse(readFileSync(join(REPO, "fledge.toml"), "utf8")) as Toml;
}

function specSyncActionInputs(): Record<string, unknown> {
  const wf = Bun.YAML.parse(
    readFileSync(join(REPO, ".github", "workflows", "spec-sync.yml"), "utf8"),
  ) as { jobs: Record<string, { steps?: { uses?: string; with?: Record<string, unknown> }[] }> };
  const steps = Object.values(wf.jobs).flatMap((j) => j.steps ?? []);
  const action = steps.filter((s) => s.uses?.startsWith("CorvidLabs/spec-sync@"));
  expect(action).toHaveLength(1);
  return action[0]!.with ?? {};
}

function truthy(v: unknown): boolean {
  return v === true || (typeof v === "string" && v.trim().toLowerCase() === "true");
}

describe("spec-check runs at CI Spec Sync strictness (SPECSYNC-2/7, REQ-agent-005)", () => {
  test("fledge.toml spec-check carries the CI Spec Sync strictness (SPECSYNC-2)", () => {
    const inputs = specSyncActionInputs();
    // Inputs this parity check knows about. A new Action input may change what
    // CI Spec Sync rejects: map it onto the spec-check task, then list it here.
    const known = new Set(["version", "strict", "comment", "require-coverage"]);
    expect(Object.keys(inputs).filter((k) => !known.has(k))).toEqual([]);

    const cmd = repoFledge().tasks?.["spec-check"]?.cmd ?? "";
    const argv = cmd.trim().split(/\s+/);
    expect(argv.slice(0, 2)).toEqual(["specsync", "check"]);

    // The Action passes `--require-coverage N` only when N is not "0" (its
    // default when the input is left out).
    const coverage = String(inputs["require-coverage"] ?? "0").trim();
    const i = argv.indexOf("--require-coverage");
    const got =
      i >= 0
        ? argv[i + 1]
        : argv.find((a) => a.startsWith("--require-coverage="))?.split("=")[1];
    if (coverage === "0" || coverage === "") {
      expect(got).toBeUndefined();
    } else {
      expect(got).toBe(coverage);
    }

    expect(argv.includes("--strict")).toBe(truthy(inputs.strict));
  });

  test("spec-check stays on the verify lane", () => {
    expect(repoFledge().lanes?.verify?.steps).toContain("spec-check");
  });
});

// ── stub binaries ──────────────────────────────────────────────────────────

let root = "";
let bin = "";
let proj = "";
let log = "";

function stub(name: string, body: string) {
  const p = join(bin, name);
  writeFileSync(p, `#!/bin/sh\necho "${name} $*" >> "${log}"\n${body}\n`);
  chmodSync(p, 0o755);
}

function calls(): string[] {
  return existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean) : [];
}

async function cli(...args: string[]) {
  const proc = Bun.spawn([process.execPath, CLI, ...args], {
    cwd: proj,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` },
    stdout: "pipe",
    stderr: "pipe",
  });
  const code = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { code, stdout, stderr };
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "corvidinho-spec-parity-"));
  bin = join(root, "bin");
  mkdirSync(bin);
});

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  proj = mkdtempSync(join(root, "proj-"));
  log = join(proj, "..", `${proj.split("/").pop()}.calls`);
  mkdirSync(join(proj, ".specsync"));
  writeFileSync(join(proj, ".specsync", "registry.toml"), '[specs]\ngood = "specs/good/good.spec.md"\n');
  mkdirSync(join(proj, "specs", "good"), { recursive: true });
  writeFileSync(join(proj, "specs", "good", "good.spec.md"), "---\nmodule: good\n---\n# Good\n");
  // Behaves like fledge 1.8: unknown task / no fledge.toml → exit 1.
  stub(
    "fledge",
    [
      'if [ "$1" = run ] && [ "$2" = spec-check ]; then',
      '  if [ -f fledge.toml ] && grep -q "spec-check" fledge.toml; then echo "fledge spec-check ran"; exit "${FLEDGE_STUB_EXIT:-0}"; fi',
      "  if [ -f fledge.toml ]; then echo \"error: Unknown task 'spec-check'. Available tasks: test\" >&2; exit 1; fi",
      '  echo "error: Could not detect project type and no fledge.toml found." >&2; exit 1',
      "fi",
      "exit 0",
    ].join("\n"),
  );
  stub(
    "specsync",
    [
      'case "$1" in',
      '  check) echo "All specs passed (stub)";;',
      '  score) echo "5 specs scored: average 79.4/100 [C] (stub)"; case "$*" in *--min-score*) exit 3;; esac;;',
      "esac",
      "exit 0",
    ].join("\n"),
  );
});

describe("specsync-check uses the Fledge task only when the project defines it (REQ-plugins-008)", () => {
  test("specsync-check falls back to specsync check when Fledge has no spec-check task", async () => {
    writeFileSync(join(proj, "fledge.toml"), '[tasks.test]\ncmd = "true"\n');
    const r = await cli("specsync", "check", "--json");
    expect(r.stderr).not.toContain("Unknown task");
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: true });
    expect(r.stdout).toContain("All specs passed (stub)");
    expect(calls()).toEqual(["specsync check"]);
  });

  test("specsync-check falls back to specsync check when the project has no fledge.toml", async () => {
    const r = await cli("specsync", "check");
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("All specs passed (stub)");
    expect(calls()).toEqual(["specsync check"]);
  });

  test("specsync-check still runs the project's Fledge spec-check task when defined", async () => {
    writeFileSync(
      join(proj, "fledge.toml"),
      '[tasks.spec-check]\ncmd = "specsync check --require-coverage 100"\n',
    );
    const r = await cli("specsync", "check");
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("fledge spec-check ran");
    expect(calls()).toEqual(["fledge run spec-check"]);
  });

  test("a failing Fledge spec-check task fails specsync-check (blocks done)", async () => {
    writeFileSync(
      join(proj, "fledge.toml"),
      '[tasks]\n"spec-check" = "specsync check --require-coverage 100"\n',
    );
    const proc = Bun.spawn([process.execPath, CLI, "specsync", "check"], {
      cwd: proj,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}`, FLEDGE_STUB_EXIT: "1" },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await proc.exited).toBe(1);
    expect(await new Response(proc.stderr).text()).toContain("spec check failed");
    expect(calls()).toEqual(["fledge run spec-check"]);
  });

  test("an unparsable fledge.toml keeps the Fledge path (fail closed)", () => {
    writeFileSync(join(proj, "fledge.toml"), "[tasks.spec-check\ncmd = \n");
    expect(projectDefinesSpecCheckTask(proj)).toBe(true);
    writeFileSync(join(proj, "fledge.toml"), '[tasks.test]\ncmd = "true"\n# spec-check\n');
    expect(projectDefinesSpecCheckTask(proj)).toBe(false);
    rmSync(join(proj, "fledge.toml"));
    expect(projectDefinesSpecCheckTask(proj)).toBe(false);
    expect(projectDefinesSpecCheckTask(REPO)).toBe(true);
  });
});

describe("specsync-score reports SpecSync's numbers (SPECSYNC-3, REQ-plugins-008 / REQ-cli-089)", () => {
  test("specsync-score spawns local specsync score and returns its report", async () => {
    const r = await cli("specsync", "score", "good", "--explain");
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("5 specs scored: average 79.4/100 [C] (stub)");
    expect(calls()).toEqual(["specsync score good --explain"]);

    const j = await cli("plugins", "run", "specsync-score", "--json", "--", "--format", "json");
    expect(j.code).toBe(0);
    expect(JSON.parse(j.stdout).data.output).toContain("average 79.4/100");
    expect(calls()).toContain("specsync score --format json");
  });

  test("a failing specsync score returns its exit code and report", async () => {
    const r = await cli("specsync", "score", "--min-score", "90");
    expect(r.code).toBe(3);
    expect(r.stderr).toContain("average 79.4/100");
  });

  test("specsync-score is a read-only tool offered in the default tool catalog", () => {
    clearRegistry();
    loadBuiltins();
    const tool = buildOpenAiTools({ tier: "tool" }).find(
      (t) => t.function.name === "specsync-score",
    );
    expect(tool).toBeDefined();
    expect(tool!.function.description).toContain("SPECSYNC-3");
  });

  // A stopped run (AGENT-3 abort signal) must not wait on the spawned
  // specsync. Runs in a child Bun, whose `Bun.which` sees the stub PATH.
  for (const name of ["specsync-score", "specsync-check"]) {
    test(`${name} stops its specsync when the run is aborted`, async () => {
      writeFileSync(join(bin, "specsync"), `#!/bin/sh\necho "specsync $*" >> "${log}"\nexec sleep 10\n`);
      chmodSync(join(bin, "specsync"), 0o755);
      const script = join(proj, "..", `${proj.split("/").pop()}.abort.ts`);
      writeFileSync(
        script,
        [
          `import { loadBuiltins } from ${JSON.stringify(join(REPO, "src", "plugins", "builtins.ts"))};`,
          `import { runPlugin } from ${JSON.stringify(join(REPO, "src", "plugins", "run.ts"))};`,
          "loadBuiltins();",
          "const ac = new AbortController();",
          "setTimeout(() => ac.abort(), 300);",
          "const t0 = Date.now();",
          `const r = await runPlugin({ name: ${JSON.stringify(name)}, args: [], cwd: process.cwd(), nonInteractive: true, signal: ac.signal });`,
          "console.log(JSON.stringify({ ok: r.ok, ms: Date.now() - t0 }));",
        ].join("\n"),
      );
      const proc = Bun.spawn([process.execPath, script], {
        cwd: proj,
        env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` },
        stdout: "pipe",
        stderr: "pipe",
      });
      const code = await proc.exited;
      const out = await new Response(proc.stdout).text();
      expect(code).toBe(0);
      const r = JSON.parse(out.trim().split("\n").pop()!) as { ok: boolean; ms: number };
      expect(r.ok).toBe(false);
      expect(r.ms).toBeLessThan(6_000);
      expect(calls()[0]).toStartWith(name === "specsync-score" ? "specsync score" : "specsync check");
    }, 20_000);
  }
});

// ── real binaries (optional) ───────────────────────────────────────────────

const haveReal = Boolean(Bun.which("specsync")) && Boolean(Bun.which("fledge"));

describe.skipIf(!haveReal)("real fledge + specsync (optional)", () => {
  test("an unspecced source file fails the project's spec-check task", async () => {
    const copy = mkdtempSync(join(root, "repo-copy-"));
    for (const p of [".specsync", "specs", "src", "plugins", "fledge.toml"]) {
      cpSync(join(REPO, p), join(copy, p), { recursive: true });
    }
    const run = async () => {
      const proc = Bun.spawn([Bun.which("fledge")!, "run", "spec-check"], {
        cwd: copy,
        stdout: "pipe",
        stderr: "pipe",
      });
      const code = await proc.exited;
      const out = (await new Response(proc.stdout).text()) + (await new Response(proc.stderr).text());
      return { code, out };
    };
    const clean = await run();
    expect(clean.code).toBe(0);
    mkdirSync(join(copy, "src", "zzz"));
    writeFileSync(join(copy, "src", "zzz", "orphan.ts"), "export const orphan = 1;\n");
    const dirty = await run();
    expect(dirty.code).not.toBe(0);
    expect(dirty.out).toContain("src/zzz/orphan.ts");
  });
});
