/**
 * The bun test preload keeps every temp dir a run makes under one per-run root
 * and removes that root when the run ends (REQ-cli-711). Before, each
 * `bun test` (and each verify-lane run of it) left ~500 mkdtemp dirs in the
 * OS temp dir, which filled the agent box's disk.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";

const root = join(import.meta.dir, "..");

type Probe = {
  tmpdir: string;
  topLevel: string;
  env: { TMPDIR: string | null; TMP: string | null; TEMP: string | null };
  dataDir: string;
  made: string[];
};

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A fresh, empty dir to hand the child `bun test` as its TMPDIR. */
function parentTmp(): string {
  const d = mkdtempSync(join(tmpdir(), "corvidinho-preload-parent-"));
  dirs.push(d);
  return d;
}

function isUnder(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/** Child `bun test` in this repo (its bunfig preload applies) with TMPDIR = `parent`. */
async function runProbe(
  parent: string,
  end?: "fail" | "exit",
): Promise<{ code: number; probe: Probe | null; out: string }> {
  const env: Record<string, string | undefined> = { ...process.env, TMPDIR: parent, TMP: parent, TEMP: parent };
  if (end) env.PRELOAD_TMP_PROBE_END = end;
  const proc = Bun.spawn([process.execPath, "test", "./tests/fixtures/preload-tmp-probe.ts"], {
    cwd: root,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const out = `${stdout}${stderr}`;
  const line = out.split("\n").find((l) => l.startsWith("PRELOAD_TMP_PROBE "));
  const probe = line ? (JSON.parse(line.slice("PRELOAD_TMP_PROBE ".length)) as Probe) : null;
  return { code, probe, out };
}

describe("bun test keeps its temp dirs under one per-run root and removes it (REQ-cli-711)", () => {
  test("every temp dir the run makes lands under one corvidinho-test-run-* root in TMPDIR", async () => {
    const parent = parentTmp();
    const { code, probe, out } = await runProbe(parent);
    expect(code, out).toBe(0);
    expect(probe, out).not.toBeNull();
    const runRoot = probe!.tmpdir;
    expect(dirname(runRoot)).toBe(parent);
    expect(runRoot.slice(parent.length + 1)).toStartWith("corvidinho-test-run-");
    // Top-level tmpdir() (preload runs first) and TMPDIR / TMP / TEMP agree.
    expect(probe!.topLevel).toBe(runRoot);
    expect(probe!.env).toEqual({ TMPDIR: runRoot, TMP: runRoot, TEMP: runRoot });
    // The scratch data dir, the test's mkdtemp dirs and a shell's `mktemp -d`
    // (spawned with no explicit env) are all inside the root.
    expect(isUnder(probe!.dataDir, runRoot)).toBe(true);
    expect(probe!.made).toHaveLength(3);
    for (const d of probe!.made) expect(isUnder(d, runRoot), d).toBe(true);
  }, 60_000);

  test("the root is removed when the run ends: TMPDIR is left empty", async () => {
    const parent = parentTmp();
    const { code, probe, out } = await runProbe(parent);
    expect(code, out).toBe(0);
    expect(probe, out).not.toBeNull();
    expect(existsSync(probe!.tmpdir)).toBe(false);
    expect(readdirSync(parent)).toEqual([]);
  }, 60_000);

  test("a failing run still removes its root and still reports the failure", async () => {
    const parent = parentTmp();
    const { code, probe, out } = await runProbe(parent, "fail");
    expect(code, out).toBe(1);
    expect(out).toContain("failed on purpose");
    expect(probe, out).not.toBeNull();
    expect(readdirSync(parent)).toEqual([]);
  }, 60_000);

  test("a test that calls process.exit() still removes the root and keeps its exit code", async () => {
    const parent = parentTmp();
    const { code, probe, out } = await runProbe(parent, "exit");
    expect(code, out).toBe(7);
    expect(probe, out).not.toBeNull();
    expect(readdirSync(parent)).toEqual([]);
  }, 60_000);
});
