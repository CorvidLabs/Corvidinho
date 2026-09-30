/**
 * The bun test preload keeps every temp dir a run makes under one per-run root
 * and removes that root when the run's process ends (REQ-cli-711). Before, each
 * `bun test` (and each verify-lane run of it) left ~500 mkdtemp dirs in the
 * OS temp dir, which filled the agent box's disk.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";

const root = join(import.meta.dir, "..");
const PROBE_LINE = "PRELOAD_TMP_PROBE ";

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

/**
 * What is left in `dir` once the run's root has had time to go: a watcher
 * removes the root just after the child's process exits, so poll briefly.
 */
async function settledEntries(dir: string, expected: string[] = []): Promise<string[]> {
  const want = JSON.stringify([...expected].sort());
  let left = readdirSync(dir).sort();
  for (let i = 0; i < 100 && JSON.stringify(left) !== want; i++) {
    await Bun.sleep(100);
    left = readdirSync(dir).sort();
  }
  return left;
}

/**
 * Child `bun test` in this repo (its bunfig preload applies) with TMPDIR =
 * `parent`. `kill` SIGKILLs the child's bun process (only it) once the probe
 * has printed its line.
 */
async function runProbe(
  parent: string,
  opts: { end?: "fail" | "exit" | "hang"; args?: string[]; link?: string; kill?: boolean } = {},
): Promise<{ code: number; probe: Probe | null; out: string }> {
  const env: Record<string, string | undefined> = { ...process.env, TMPDIR: parent, TMP: parent, TEMP: parent };
  if (opts.end) env.PRELOAD_TMP_PROBE_END = opts.end;
  if (opts.link) env.PRELOAD_TMP_PROBE_LINK = opts.link;
  const proc = Bun.spawn(
    [process.execPath, "test", ...(opts.args ?? []), "./tests/fixtures/preload-tmp-probe.ts"],
    { cwd: root, env, stdout: "pipe", stderr: "pipe" },
  );
  let stdout = "";
  const decoder = new TextDecoder();
  const readStdout = (async () => {
    for await (const chunk of proc.stdout) {
      stdout += decoder.decode(chunk, { stream: true });
      const at = stdout.indexOf(PROBE_LINE);
      if (opts.kill && at >= 0 && stdout.includes("\n", at)) proc.kill("SIGKILL");
    }
  })();
  const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited, readStdout]);
  const out = `${stdout}${stderr}`;
  const line = out.split("\n").find((l) => l.startsWith(PROBE_LINE));
  const probe = line ? (JSON.parse(line.slice(PROBE_LINE.length)) as Probe) : null;
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
    expect(await settledEntries(parent)).toEqual([]);
    expect(existsSync(probe!.tmpdir)).toBe(false);
  }, 60_000);

  test("a failing run still removes its root and still reports the failure, also under --bail", async () => {
    for (const args of [[], ["--bail"]]) {
      const parent = parentTmp();
      const { code, probe, out } = await runProbe(parent, { end: "fail", args });
      expect(code, out).toBe(1);
      expect(out).toContain("failed on purpose");
      expect(probe, out).not.toBeNull();
      expect(await settledEntries(parent), args.join(" ")).toEqual([]);
    }
  }, 60_000);

  test("a test that calls process.exit() still removes the root and keeps its exit code", async () => {
    const parent = parentTmp();
    const { code, probe, out } = await runProbe(parent, { end: "exit" });
    expect(code, out).toBe(7);
    expect(probe, out).not.toBeNull();
    expect(await settledEntries(parent)).toEqual([]);
  }, 60_000);

  test("a run whose bun process is SIGKILLed still has its root removed", async () => {
    const parent = parentTmp();
    const { code, probe, out } = await runProbe(parent, { end: "hang", kill: true });
    expect(code, out).toBe(137);
    expect(probe, out).not.toBeNull();
    expect(await settledEntries(parent)).toEqual([]);
  }, 60_000);

  test("--rerun-each finds the root on every run and removes it after the last", async () => {
    // A preload afterAll fires before the last file's rerun, so removing the
    // root there fails the rerun with ENOENT.
    const parent = parentTmp();
    const { code, probe, out } = await runProbe(parent, { args: ["--rerun-each=2"] });
    expect(code, out).toBe(0);
    expect(out).toContain(" 2 pass");
    expect(probe, out).not.toBeNull();
    expect(await settledEntries(parent)).toEqual([]);
  }, 60_000);

  test("removal stays inside its own root: other runs' roots and symlink targets are left alone", async () => {
    const parent = parentTmp();
    const other = join(parent, "corvidinho-test-run-other");
    const outside = join(parent, "outside");
    for (const d of [other, outside]) {
      mkdirSync(d);
      writeFileSync(join(d, "keep"), "keep");
    }
    const { code, probe, out } = await runProbe(parent, { link: outside });
    expect(code, out).toBe(0);
    expect(probe, out).not.toBeNull();
    expect(await settledEntries(parent, ["corvidinho-test-run-other", "outside"])).toEqual([
      "corvidinho-test-run-other",
      "outside",
    ]);
    expect(readFileSync(join(other, "keep"), "utf8")).toBe("keep");
    expect(readFileSync(join(outside, "keep"), "utf8")).toBe("keep");
  }, 60_000);
});
