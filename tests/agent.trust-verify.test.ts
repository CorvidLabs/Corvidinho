/**
 * It works each repo's own way: the Trust clause of AGENT-18 (captured on
 * main from Leif's 2026-09-28 interview). REQ-agent-525, REQ-plugins-525.
 *
 * - In a repo with `.trust.toml` the default verify runner runs `fledge trust
 *   verify` after `fledge lanes run verify`, and the run is verified only
 *   when both pass; a fledge with no `trust` command fails closed with the
 *   exact reason. A repo without `.trust.toml` runs the lane alone, as before.
 * - `.trust.toml` is SAFE-2 protected like `fledge.toml`.
 *
 * A stand-in `fledge` on PATH (never the host's): the default runner reads
 * PATH as its process started, so it runs in a child `bun` process, as in
 * tests/agent.verify-env.test.ts. Constants are spelled out here so the file
 * loads on the base sources.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileAttachment } from "../plugins/discord/send-file.ts";
import { isProtectedPath } from "../plugins/files/protectedPaths.ts";
import { runTask } from "../src/agent/loop.ts";
import type { AgentEvent, ExecuteContext, VerifyRunner } from "../src/agent/types.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { LANE_PASS_OUTPUT } from "./fixtures/lane-output.ts";
import { gitIn } from "./fixtures/talk-worktree.ts";

const LANE_ARGV = "lanes run verify --non-interactive";
const PROBE_ARGV = "--non-interactive trust --help";
const TRUST_ARGV = "--non-interactive trust verify";
/** fledge 1.8.0's own answer to `fledge trust --help` (no built-in `trust`). */
const NO_TRUST_LINE = "error: unrecognized subcommand 'trust'";
const UNAVAILABLE_REASON =
  "Trust gate: this repo uses Trust (.trust.toml), but `fledge trust` is not available here " +
  `(\`fledge trust --help\` exited 2: ${NO_TRUST_LINE}), so \`fledge trust verify\` cannot run and the run is not verified (AGENT-18). ` +
  "Nothing in the repo can fix this: the owner installs Trust for fledge on this machine.";
const PASSED_LINE = "Trust gate: fledge trust verify passed (.trust.toml, AGENT-18).";
const FAILED_HEAD =
  "Trust gate: fledge lanes run verify passed, but fledge trust verify failed (exit 3), so the run is not verified (.trust.toml, AGENT-18).";
const SECRET = "ghp_trustverifysecret0000000000000000000";

const bases: string[] = [];
function tempBase(): string {
  const b = mkdtempSync(join(tmpdir(), "corvidinho-trust-verify-"));
  bases.push(b);
  return b;
}

let fakeBin = "";
let laneFile = "";

/**
 * Stand-in fledge: logs its argv (and whether the Trust step saw a GitHub
 * token) to $FAKE_FLEDGE_LOG. FAKE_LANE=fail fails the lane; FAKE_TRUST=
 * missing answers like a fledge with no `trust` command, fail fails
 * `trust verify`, hang makes it sleep until an abort kills it.
 */
function fakeFledge(): string {
  return `#!/bin/sh
echo "$*" >> "$FAKE_FLEDGE_LOG"
case "$*" in
  "${LANE_ARGV}")
    if [ "$FAKE_LANE" = fail ]; then
      echo "  ▶️ Running task: test"
      echo "(fail) app > adds"
      echo "Lane 'verify' failed at step 1 (test) after 4ms" >&2
      exit 1
    fi
    cat "${laneFile}"
    exit 0;;
  "${PROBE_ARGV}")
    if [ "$FAKE_TRUST" = missing ]; then
      echo "${NO_TRUST_LINE}" >&2
      echo "" >&2
      echo "  tip: use fledge help for help" >&2
      exit 2
    fi
    echo "Usage: fledge trust <COMMAND>"
    exit 0;;
  "${TRUST_ARGV}")
    echo "trust-env GITHUB_TOKEN=\${GITHUB_TOKEN:-unset}" >> "$FAKE_FLEDGE_LOG"
    if [ "$FAKE_TRUST" = hang ]; then
      sleep 30
      echo "trust verify outlived its abort" >> "$FAKE_FLEDGE_LOG"
      exit 0
    fi
    if [ "$FAKE_TRUST" = fail ]; then
      echo "attest: commit abc1234 has no attestation"
      exit 3
    fi
    echo "trust: lifecycle, specsync, augur, attest ok"
    exit 0;;
esac
echo "unexpected fledge $*" >&2
exit 64
`;
}

beforeAll(() => {
  fakeBin = join(tempBase(), "bin");
  mkdirSync(fakeBin, { recursive: true });
  laneFile = join(fakeBin, "lane-output.txt");
  writeFileSync(laneFile, LANE_PASS_OUTPUT);
  writeFileSync(join(fakeBin, "fledge"), fakeFledge());
  chmodSync(join(fakeBin, "fledge"), 0o755);
  loadBuiltins();
});

afterAll(() => {
  for (const b of bases) rmSync(b, { recursive: true, force: true });
});

/** A git repo on `main` with `app.txt` (+ `files`) committed. */
function makeRepo(files: Record<string, string> = {}): string {
  const dir = join(tempBase(), "repo");
  mkdirSync(dir, { recursive: true });
  gitIn(dir, "init", "-q", "-b", "main");
  gitIn(dir, "config", "user.name", "Fixture Bot");
  gitIn(dir, "config", "user.email", "fixture@example.invalid");
  gitIn(dir, "config", "commit.gpgsign", "false");
  writeFileSync(join(dir, "app.txt"), "hello\n");
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  gitIn(dir, "add", "-A");
  gitIn(dir, "commit", "-q", "-m", "init");
  return dir;
}

type Outcome = { success: boolean; output: string; trustNote?: string };

/**
 * The default verify runner in a child process with the stand-in fledge
 * first on PATH. `ledger` starts a run in `cwd` whose start scan found Trust.
 */
async function runDefault(
  cwd: string,
  opts: { lane?: "fail"; trust?: "missing" | "fail" | "hang"; ledger?: boolean; abortOnTrust?: boolean } = {},
): Promise<{ res: Outcome; calls: string[] }> {
  const log = join(tempBase(), "fledge.log");
  const verify = join(import.meta.dir, "..", "src", "agent", "verify.ts");
  const ways = join(import.meta.dir, "..", "src", "agent", "repo-ways.ts");
  const script =
    `const { defaultVerifyRunner } = await import(${JSON.stringify(verify)});` +
    (opts.ledger
      ? `const { beginSddRun } = await import(${JSON.stringify(ways)});` +
        `beginSddRun(${JSON.stringify(cwd)}).scan.ways.trust = true;`
      : "") +
    (opts.abortOnTrust
      ? // Abort once the Trust step has started (its env line is logged), however
        // slow the probe and the lane were; a runner that never starts it is
        // aborted after 20 s.
        `const { readFileSync } = await import("node:fs");` +
        `const ac = new AbortController(); const t0 = Date.now();` +
        `const poll = setInterval(() => { let t = ""; try { t = readFileSync(${JSON.stringify(log)}, "utf8"); } catch {}` +
        ` if (t.includes("trust-env") || Date.now() - t0 > 20000) { clearInterval(poll); ac.abort(); } }, 20);` +
        `const r = await defaultVerifyRunner(${JSON.stringify(cwd)}, ac.signal); clearInterval(poll);`
      : `const r = await defaultVerifyRunner(${JSON.stringify(cwd)});`) +
    `process.stdout.write(JSON.stringify(r));`;
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === "string" && !k.startsWith("GIT_")) env[k] = v;
  }
  Object.assign(env, {
    PATH: `${fakeBin}:${process.env.PATH ?? "/usr/bin:/bin"}`,
    FAKE_FLEDGE_LOG: log,
    FAKE_LANE: opts.lane ?? "",
    FAKE_TRUST: opts.trust ?? "",
    GITHUB_TOKEN: SECRET,
  });
  const proc = Bun.spawn([process.execPath, "--no-env-file", "-e", script], {
    cwd: fakeBin,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  expect(code, stderr).toBe(0);
  const calls = existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean) : [];
  return { res: JSON.parse(stdout) as Outcome, calls };
}

describe("in a Trust repo the verify gate also runs fledge trust verify (AGENT-18, REQ-agent-525)", () => {
  test("a repo without .trust.toml runs only the lane, exactly as before", async () => {
    const repo = makeRepo({ "trust.toml": "not the Trust file\n", "docs/trust.md": "x\n" });
    const { res, calls } = await runDefault(repo);
    expect(calls).toEqual([LANE_ARGV]);
    expect(res).toEqual({ success: true, output: LANE_PASS_OUTPUT });
  });

  test("with .trust.toml the lane, then fledge trust verify run; verified when both pass, without operator secrets", async () => {
    const repo = makeRepo({ ".trust.toml": "[trust]\n" });
    const { res, calls } = await runDefault(repo);
    expect(calls).toEqual([PROBE_ARGV, LANE_ARGV, TRUST_ARGV, "trust-env GITHUB_TOKEN=unset"]);
    expect(res.success).toBe(true);
    expect(res.output.startsWith(LANE_PASS_OUTPUT)).toBe(true);
    expect(res.output).toContain(PASSED_LINE);
    // The lane's test summary is there once: the Trust step adds one line.
    expect(res.output.match(/^Ran \d+ tests? across/gm)).toHaveLength(1);
    expect(res.output).not.toContain(SECRET);
  });

  test("a failing fledge trust verify fails the verify after a passing lane, with its output", async () => {
    const repo = makeRepo({ ".trust.toml": "[trust]\n" });
    const { res, calls } = await runDefault(repo, { trust: "fail" });
    expect(calls.slice(0, 3)).toEqual([PROBE_ARGV, LANE_ARGV, TRUST_ARGV]);
    expect(res.success).toBe(false);
    expect(res.output).toStartWith(`${FAILED_HEAD}\n`);
    expect(res.output).toContain("attest: commit abc1234 has no attestation");
    expect(res.trustNote).toBe(FAILED_HEAD);
  });

  test("a failing lane is not followed by fledge trust verify", async () => {
    const repo = makeRepo({ ".trust.toml": "[trust]\n" });
    const { res, calls } = await runDefault(repo, { lane: "fail" });
    expect(calls).toEqual([PROBE_ARGV, LANE_ARGV]);
    expect(res.success).toBe(false);
    expect(res.output).toContain("Lane 'verify' failed at step 1 (test)");
    expect(res.output).not.toContain("Trust gate");
    expect(res.trustNote).toBeUndefined();
  });

  test("a fledge with no trust command fails closed with the exact reason, and the lane never runs", async () => {
    const repo = makeRepo({ ".trust.toml": "[trust]\n" });
    const { res, calls } = await runDefault(repo, { trust: "missing" });
    expect(calls).toEqual([PROBE_ARGV]);
    expect(res).toEqual({ success: false, output: UNAVAILABLE_REASON, trustNote: UNAVAILABLE_REASON });
  });

  test("an abort during fledge trust verify stops it and the verify is not passed", async () => {
    const repo = makeRepo({ ".trust.toml": "[trust]\n" });
    const started = Date.now();
    const { res, calls } = await runDefault(repo, { trust: "hang", abortOnTrust: true });
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(res).toEqual({ success: false, output: "verify lane aborted" });
    expect(calls).toEqual([PROBE_ARGV, LANE_ARGV, TRUST_ARGV, "trust-env GITHUB_TOKEN=unset"]);
  });

  test("a .trust.toml deleted, committed away on a branch, or seen only at the run's start still counts", async () => {
    // Deleted from the working tree: HEAD still has it.
    const deleted = makeRepo({ ".trust.toml": "[trust]\n" });
    unlinkSync(join(deleted, ".trust.toml"));
    expect((await runDefault(deleted)).calls).toEqual([PROBE_ARGV, LANE_ARGV, TRUST_ARGV, "trust-env GITHUB_TOKEN=unset"]);

    // Committed away on a branch: only the merge-base with main has it.
    const branch = makeRepo({ ".trust.toml": "[trust]\n" });
    gitIn(branch, "checkout", "-q", "-b", "work");
    gitIn(branch, "rm", "-q", ".trust.toml");
    gitIn(branch, "commit", "-q", "-m", "drop trust");
    const fromBase = await runDefault(branch, { trust: "missing" });
    expect(fromBase.calls).toEqual([PROBE_ARGV]);
    expect(fromBase.res.output).toBe(UNAVAILABLE_REASON);

    // A run in progress whose start scan found Trust (a non-git folder now without it).
    const plain = join(tempBase(), "plain");
    mkdirSync(plain, { recursive: true });
    const ledger = await runDefault(plain, { ledger: true, trust: "missing" });
    expect(ledger.calls).toEqual([PROBE_ARGV]);
    expect(ledger.res.success).toBe(false);
  });

  test("the run names the Trust step in its ways line and its verifying line", async () => {
    const repo = makeRepo({ ".trust.toml": "[trust]\n" });
    const events: AgentEvent[] = [];
    const runner: VerifyRunner = async () => ({ success: true, output: LANE_PASS_OUTPUT });
    const result = await runTask({
      cwd: repo,
      maxRetries: 0,
      verifyRunner: runner,
      onEvent: (e) => events.push(e),
      execute: async () => {
        writeFileSync(join(repo, "app.txt"), "changed\n");
        return { summary: "edited", filesChanged: ["app.txt"] };
      },
    });
    expect(result.verified).toBe(true);
    const texts = events.filter((e) => e.type === "Text").map((e) => (e as { text: string }).text);
    expect(texts).toContain("Repo ways (AGENT-18): Trust (.trust.toml: verify also runs fledge trust verify).");
    expect(texts).toContain(
      "Running fledge lanes run verify --non-interactive (includes spec-check), then fledge trust verify (.trust.toml)…",
    );
  });

  test("a failed Trust step's reason leads the failure summary and the retry feedback, however long its output", async () => {
    const repo = makeRepo({ ".trust.toml": "[trust]\n" });
    // Over the 4000-char feedback cap: the excerpt alone would drop the head.
    const stepOutput =
      Array.from({ length: 200 }, (_, i) => `trust: checked commit ${String(i).padStart(4, "0")} ok`).join("\n") +
      "\nattest: commit abc1234 has no attestation\n";
    expect(stepOutput.length).toBeGreaterThan(4000);
    const runner: VerifyRunner = async () => ({
      success: false,
      output: `${FAILED_HEAD}\n${stepOutput}`,
      trustNote: FAILED_HEAD,
    });
    const seen: ExecuteContext[] = [];
    const result = await runTask({
      cwd: repo,
      maxRetries: 1,
      verifyRunner: runner,
      execute: async (ctx) => {
        seen.push(ctx);
        writeFileSync(join(repo, "app.txt"), `changed ${ctx.attempt}\n`);
        return { summary: `attempt ${ctx.attempt}`, filesChanged: ["app.txt"] };
      },
    });
    expect(result.verified).toBe(false);
    expect(result.state).toBe("failed");
    expect(seen).toHaveLength(2);
    const feedback = seen[1]!.verifyFeedback ?? "";
    expect(feedback).toStartWith(`Verification failed. Fix these errors and try again:\n\n${FAILED_HEAD}\n\n`);
    expect(feedback).toContain("attest: commit abc1234 has no attestation");
    expect(feedback.length).toBeLessThanOrEqual(4000);
    expect(result.summary).toContain(`Verification failed after 1 retries:\n${FAILED_HEAD}\n\n`);

    // Unavailable Trust: the reason is the whole feedback.
    const repo2 = makeRepo({ ".trust.toml": "[trust]\n" });
    const seen2: ExecuteContext[] = [];
    const unavailable = await runTask({
      cwd: repo2,
      maxRetries: 1,
      verifyRunner: async () => ({ success: false, output: UNAVAILABLE_REASON, trustNote: UNAVAILABLE_REASON }),
      execute: async (ctx) => {
        seen2.push(ctx);
        writeFileSync(join(repo2, "app.txt"), `changed ${ctx.attempt}\n`);
        return { summary: `attempt ${ctx.attempt}`, filesChanged: ["app.txt"] };
      },
    });
    expect(unavailable.verified).toBe(false);
    expect(seen2[1]!.verifyFeedback).toBe(`Verification failed. Fix these errors and try again:\n\n${UNAVAILABLE_REASON}`);
    expect(unavailable.summary).toContain(`Verification failed after 1 retries:\n${UNAVAILABLE_REASON}\n\n`);
  });
});

describe(".trust.toml is SAFE-2 protected like fledge.toml (REQ-plugins-525)", () => {
  test("files-write, files-edit, files-delete and discord-send-file refuse it; reads and look-alike names stay open", async () => {
    expect(isProtectedPath(".trust.toml")).toBe(true);
    expect(isProtectedPath("./.trust.toml")).toBe(true);
    expect(isProtectedPath("pkg/.Trust.TOML")).toBe(true);
    expect(isProtectedPath("/home/u/proj/.trust.toml", "/home/u/proj")).toBe(true);
    expect(isProtectedPath("trust.toml")).toBe(false);
    expect(isProtectedPath("docs/trust.md")).toBe(false);
    expect(isProtectedPath(".trust.toml.bak")).toBe(false);

    const dir = join(tempBase(), "proj");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".trust.toml"), "ORIGINAL\n");
    const refused = (r: { ok: boolean; exitCode?: number; error?: string }) => {
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(2);
      expect(r.error).toContain("refused (SAFE-2)");
      expect(r.error).toContain(".trust.toml");
    };
    for (const target of [".trust.toml", "./.trust.toml", join(dir, ".trust.toml"), "sub/.trust.toml"]) {
      refused(await runPlugin({ name: "files-write", args: [target, "HACKED"], cwd: dir, nonInteractive: true }));
    }
    refused(
      await runPlugin({
        name: "files-edit",
        args: [".trust.toml", "--old", "ORIGINAL", "--new", "HACKED"],
        cwd: dir,
        nonInteractive: true,
      }),
    );
    refused(
      await runPlugin({
        name: "files-delete",
        args: [".trust.toml"],
        cwd: dir,
        nonInteractive: true,
        allowlist: ["files-delete"],
      }),
    );
    expect(readFileSync(join(dir, ".trust.toml"), "utf8")).toBe("ORIGINAL\n");
    expect(existsSync(join(dir, "sub", ".trust.toml"))).toBe(false);

    const read = await runPlugin({ name: "files-read", args: [".trust.toml"], cwd: dir, nonInteractive: true });
    expect(read.ok).toBe(true);
    // discord-send-file never attaches it either.
    expect(() => fileAttachment(dir, ".trust.toml")).toThrow("refused (SAFE-2)");
    const other = await runPlugin({ name: "files-write", args: ["trust.toml", "ok"], cwd: dir, nonInteractive: true });
    expect(other.ok).toBe(true);
  });

  test("git-commit refuses to stage the deletion of a tracked .trust.toml", async () => {
    const repo = makeRepo({ ".trust.toml": "[trust]\n" });
    unlinkSync(join(repo, ".trust.toml"));
    const r = await runPlugin({
      name: "git-commit",
      args: ["-m", "drop trust", ".trust.toml"],
      cwd: repo,
      json: true,
      nonInteractive: true,
      allowlist: ["git-commit"],
    });
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(2);
    expect(r.error).toContain("SAFE-2");
    expect(gitIn(repo, "ls-files", ".trust.toml").trim()).toBe(".trust.toml");
    expect(gitIn(repo, "diff", "--cached", "--name-only").trim()).toBe("");
  });
});
