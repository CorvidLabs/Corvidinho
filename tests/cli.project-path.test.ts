/**
 * CLI-5 / REQ-cli-505 — `--project <path>` points the CLI at another project
 * without `cd`: the top-level process runs as if started there, reading that
 * project's `fledge.toml`, specs and `.env` files (as Bun loads them there),
 * never the start directory's. Subprocess cases run the real CLI from one temp
 * dir (A) against another (P); no network, no real keys.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { enterProject, parseGlobalFlags, readStartEnv } from "../src/cli.ts";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");

/** Subprocess tests can be slow on a loaded box. */
const T = 60_000;

// Fake values assembled at runtime — never realistic literals in the repo.
const FAKE_LLM_KEY = "fake-llm-key-" + "a1".repeat(8);

type Run = { code: number; out: string; err: string };

type Fixture = { root: string; a: string; p: string; env: Record<string, string> };

function write(path: string, text: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
}

/**
 * A = the directory the CLI is started in: its own `.env` (a spend cap and an
 * LLM key) and a `fledge.toml` that keeps the verify gate on. P = the project
 * `--project` points at: its own `.env` / `.env.local`, a `fledge.toml` that
 * turns the verify gate off, and one SpecSync module `widget`.
 */
function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "corvidinho-project-path-"));
  const a = join(root, "A");
  const p = join(root, "P");
  write(
    join(a, ".env"),
    `CORVIDINHO_DAILY_SPEND_CAP_USD=3.00\nCORVIDINHO_LLM_API_KEY=${FAKE_LLM_KEY}\n`,
  );
  write(join(a, "fledge.toml"), "[corvidinho]\nverify_before_complete = true\nmax_retries = 0\n");
  // Bun's own loading: .env.local over .env, with $VAR expansion.
  write(join(p, ".env"), "P_CAP=6.50\nCORVIDINHO_DAILY_SPEND_CAP_USD=7.25\n");
  write(join(p, ".env.local"), "P_CAP=8.00\nCORVIDINHO_DAILY_SPEND_CAP_USD=${P_CAP}\n");
  write(join(p, "fledge.toml"), "[corvidinho]\nverify_before_complete = false\n");
  write(join(p, ".specsync", "registry.toml"), '[specs]\nwidget = "specs/widget/widget.spec.md"\n');
  write(
    join(p, "specs", "widget", "widget.spec.md"),
    "---\nmodule: widget\n---\n\n# Widget\n\n## Purpose\n\nWidget marker purpose-7f3a.\n",
  );
  const home = join(root, "home");
  const data = join(root, "data");
  mkdirSync(home, { recursive: true });
  // Exists up front, so every doctor run prints the same data-dir line.
  mkdirSync(data, { recursive: true });
  // No NODE_ENV (Bun then loads .env.local) and none of the operator's env.
  const env = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    CORVIDINHO_DATA_DIR: data,
    CORVIDINHO_ALLOWLIST_FILE: join(root, "no-allowlist.toml"),
  };
  return { root, a, p, env };
}

async function cli(
  args: string[],
  cwd: string,
  env: Record<string, string>,
): Promise<Run> {
  const proc = Bun.spawn(["bun", CLI, ...args], {
    cwd,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const timer = setTimeout(() => proc.kill("SIGKILL"), 45_000);
  const [code, out, err] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  clearTimeout(timer);
  return { code, out, err };
}

function line(out: string, name: string): string {
  return out.split("\n").find((l) => l.includes(`] ${name}:`)) ?? "";
}

type TaskJson = {
  result: { state: string; verifySkipped: boolean };
  events: { type: string; text?: string }[];
};

describe("parseGlobalFlags --project (CLI-5)", () => {
  test("takes --project <path> and --project=<path> anywhere before --", () => {
    const a = parseGlobalFlags(["--project", "/p", "doctor"]);
    expect(a.project).toBe("/p");
    expect(a.rest).toEqual(["doctor"]);
    const b = parseGlobalFlags(["task", "run", "--project=../p", "--json"]);
    expect(b.project).toBe("../p");
    expect(b.json).toBe(true);
    expect(b.rest).toEqual(["task", "run"]);
  });

  test("a --project with no path is empty (reported, never ignored)", () => {
    expect(parseGlobalFlags(["doctor", "--project"]).project).toBe("");
    const r = parseGlobalFlags(["--project", "--json", "doctor"]);
    expect(r.project).toBe("");
    expect(r.json).toBe(true);
    expect(r.rest).toEqual(["doctor"]);
    expect(parseGlobalFlags(["--project=", "doctor"]).project).toBe("");
  });

  test("a plugin argument after -- and --task text are never taken", () => {
    const r = parseGlobalFlags(["plugins", "run", "x", "--", "--project", "/p"]);
    expect(r.project).toBeUndefined();
    expect(r.rest).toEqual(["plugins", "run", "x", "--", "--project", "/p"]);
    const t = parseGlobalFlags(["task", "run", "--task", "--project"]);
    expect(t.taskText).toBe("--project");
    expect(t.project).toBeUndefined();
  });

  test("no --project leaves project undefined", () => {
    expect(parseGlobalFlags(["doctor"]).project).toBeUndefined();
  });
});

describe("readStartEnv / enterProject (CLI-5)", () => {
  test("readStartEnv parses a NUL-separated environ block; missing file is null", () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-environ-"));
    const path = join(dir, "environ");
    writeFileSync(path, "A=1\0B=x=y\0A=2\0junk\0=nokey\0C=\0");
    expect(readStartEnv(path)).toEqual({ A: "1", B: "x=y", C: "" });
    expect(readStartEnv(join(dir, "missing"))).toBeNull();
  });

  test("an unusable path changes nothing (no chdir, no env)", () => {
    const cwd = process.cwd();
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-enter-"));
    const file = join(dir, "file.txt");
    writeFileSync(file, "x");
    const missing = enterProject(join(dir, "nope"), { startEnv: {} });
    expect(missing).toMatchObject({ ok: false });
    expect(!missing.ok && missing.error).toContain("does not exist");
    const notDir = enterProject(file, { startEnv: {} });
    expect(!notDir.ok && notDir.error).toContain("is not a directory");
    const empty = enterProject("", { startEnv: {} });
    expect(!empty.ok && empty.error).toBe("--project needs a directory path");
    expect(process.cwd()).toBe(cwd);
    expect(process.env.PATH).toBeTruthy();
  });
});

describe("corvidinho --project <path> (CLI-5, REQ-cli-505)", () => {
  test("task run reads the project's fledge.toml and specs, not the start dir's", async () => {
    const f = fixture();
    for (const args of [
      ["--project", f.p, "task", "run", "--task", "touch widget", "--json"],
      // After the command, relative to the start dir.
      ["task", "run", "--task", "touch widget", "--json", "--project=../P"],
    ]) {
      const r = await cli(args, f.a, f.env);
      expect(r.code).toBe(0);
      const parsed = JSON.parse(r.out) as TaskJson;
      // P's fledge.toml turns the verify gate off (A's keeps it on).
      expect(parsed.result.state).toBe("done");
      expect(parsed.result.verifySkipped).toBe(true);
      // P's specs brief the planner.
      const planning = parsed.events.find((e) => e.text?.startsWith("Planning:"))?.text ?? "";
      expect(planning).toContain("# Spec: widget");
      expect(planning).toContain("Widget marker purpose-7f3a.");
    }
  }, T);

  test("loads the project's .env files exactly as starting there would, not the start dir's", async () => {
    const f = fixture();
    // Sanity: started in A, Bun auto-loads A's .env.
    const inA = await cli(["doctor"], f.a, f.env);
    expect(line(inA.out, "spend")).toContain("of $3.00 daily cap");
    expect(line(inA.out, "llm")).toContain("[ok] llm");

    const viaCd = await cli(["doctor"], f.p, f.env);
    const viaFlag = await cli(["--project", f.p, "doctor"], f.a, f.env);
    // .env.local wins over .env and ${P_CAP} expands, as Bun does.
    expect(line(viaFlag.out, "spend")).toContain("of $8.00 daily cap");
    // A's .env values do not carry over (A's LLM key is gone).
    expect(line(viaFlag.out, "llm")).toContain("[warn] llm");
    expect(viaFlag.out).toBe(viaCd.out);
    expect(viaFlag.code).toBe(viaCd.code);
    for (const r of [inA, viaCd, viaFlag]) expect(r.out + r.err).not.toContain(FAKE_LLM_KEY);
  }, T);

  test("a variable set in the environment still wins over the project's .env", async () => {
    const f = fixture();
    const r = await cli(["--project", f.p, "doctor"], f.a, {
      ...f.env,
      CORVIDINHO_DAILY_SPEND_CAP_USD: "9.50",
    });
    expect(line(r.out, "spend")).toContain("of $9.50 daily cap");
  }, T);

  test("an unusable --project is one clean error line + hint, exit 1, nothing run", async () => {
    const f = fixture();
    const cases: [string[], string][] = [
      [["--project", join(f.root, "nope"), "doctor"], `--project ${join(f.root, "nope")} does not exist`],
      [["--project", join(f.p, ".env"), "doctor"], `--project ${join(f.p, ".env")} is not a directory`],
      [["doctor", "--project"], "--project needs a directory path"],
    ];
    for (const [args, message] of cases) {
      const r = await cli(args, f.a, f.env);
      expect(r.code).toBe(1);
      expect(r.err.trim().split("\n")).toEqual([
        `corvidinho: ${message}`,
        "hint: pass --project the path of an existing project directory",
      ]);
      expect(r.out).not.toContain("corvidinho doctor");
      expect(r.err).not.toMatch(/^\s+at\s/m);
    }
    const json = await cli(["--project", join(f.root, "nope"), "--json", "doctor"], f.a, f.env);
    expect(json.code).toBe(1);
    expect(JSON.parse(json.out)).toEqual({
      ok: false,
      error: `--project ${join(f.root, "nope")} does not exist`,
    });
  }, T);
});
