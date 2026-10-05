/**
 * It works each repo's own way: the SpecSync clause (AGENT-18) and, on
 * Corvidinho only, approving and archiving its own change once verify is
 * green (AGENT-18.a). REQ-agent-518, REQ-agent-519, REQ-plugins-518,
 * REQ-plugins-519, REQ-discord-518.
 *
 * Temp git repos, a fake `specsync` and a fake `hi` on PATH (no real binary,
 * no network), stub verify runners. "Corvidinho itself" is a temp repo whose
 * origin is github.com/CorvidLabs/Corvidinho and that the test seam names as
 * the checkout this code runs from.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isSddRecordPath } from "../plugins/files/protectedPaths.ts";
import { createTaskExecute } from "../src/agent/execute.ts";
import { runTask } from "../src/agent/loop.ts";
import {
  beginSddRun,
  citedHiIds,
  detectRepoWays,
  endSddRun,
  formatRepoWaysLine,
  HUMAN_LIFECYCLE_LINE,
  isCorvidinhoOriginUrl,
  isCorvidinhoProject,
  isMeaningfulPath,
  mergeSddPolicies,
  parseSddPolicy,
  renderRepoWaysBlock,
  scanRepoWays,
  sddUncovered,
  selfLifecycleRefusal,
  setCorvidinhoCheckoutForTests,
  type RepoWays,
} from "../src/agent/repo-ways.ts";
import { buildOpenAiTools } from "../src/agent/tools.ts";
import type { AgentEvent, ExecuteContext, ExecuteFn, VerifyRunner } from "../src/agent/types.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { get } from "../src/plugins/registry.ts";
import { roleAllowsPlugin, TEAM_WORK_TOOLS } from "../src/plugins/roles.ts";
import { runPlugin, type RunOptions } from "../src/plugins/run.ts";
import type { PluginHandlerResult } from "../src/plugins/types.ts";
import { openWorkPr } from "../src/work/pr.ts";
import { gitIn } from "./fixtures/talk-worktree.ts";
import { LANE_PASS_OUTPUT } from "./fixtures/lane-output.ts";

const bases: string[] = [];
function tempBase(): string {
  const b = mkdtempSync(join(tmpdir(), "corvidinho-repo-ways-"));
  bases.push(b);
  return b;
}

/** The SpecSync policy Corvidinho itself uses (trimmed). */
const SDD_ON = {
  version: 2,
  enabled: true,
  require_change_for_meaningful_files: true,
  meaningful_paths: ["src/", "tests/", "hi/", "docs/", "package.json"],
  ignored_paths: ["specs/", ".specsync/changes/", ".specsync/archive/"],
};

/** `SDD_OFF_REFUSAL` (plugins/specsync/commands.ts), spelled out so the file loads on the base. */
const SDD_OFF_REFUSAL =
  "refused: this project's SpecSync change workflow is off (no .specsync/sdd.json with enabled: true), " +
  "so there is no change to open or work; edit as usual (AGENT-18)";

const HI_FILE = "---\nhi: 1\nfamilies: [AGENT]\nowner: leif\n---\n\n# Agent\n\n## Criteria\n\n- **AGENT-18**  Works each repo's own way.\n";

/** A git repo on `main` with `app.txt` (+ `files`) committed. */
function makeRepo(files: Record<string, string> = {}, dir = join(tempBase(), "repo")): string {
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

function sddRepo(extra: Record<string, string> = {}): string {
  return makeRepo({
    ".specsync/sdd.json": JSON.stringify(SDD_ON),
    ".specsync/changes/.gitkeep": "",
    "src/app.ts": "export const x = 1;\n",
    ...extra,
  });
}

/** An open change folder as `specsync change new` leaves it. */
function openChange(repo: string, id: string, paths: string[]): void {
  const dir = join(repo, ".specsync", "changes", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "state.json"), JSON.stringify({ id, state: "draft", affected_paths: paths }));
}

// ------------------------------------------------------------------ fakes

let fakeBin = "";
let specsyncLog = "";
const savedPath = process.env.PATH;
const savedAllow = process.env.CORVIDINHO_ALLOWLIST;

/** Fake `specsync`: logs argv + cwd; `change new` writes the change folder, `finalize` archives it. */
const FAKE_SPECSYNC = (log: string) => `#!/usr/bin/env bun
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ cwd: process.cwd(), args }) + "\\n");
if (args[0] !== "change") { console.log("ok"); process.exit(0); }
const sub = args[1];
if (sub === "new") {
  const desc = args[2] || "";
  const id = desc.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const paths = [];
  for (let i = 3; i < args.length; i++) if (args[i] === "--path") paths.push(args[++i]);
  const dir = path.join(".specsync", "changes", id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "state.json"), JSON.stringify({ id, state: "draft", affected_paths: paths }));
  console.log(id + " " + desc + "\\n  State: draft");
  process.exit(0);
}
const id = args[2] || "";
if (id.startsWith("fail-" + sub)) { console.error("error: " + sub + " refused by fake"); process.exit(1); }
if (sub === "approve") fs.writeFileSync(path.join(".specsync", "changes", id, "approvals.json"), "[]");
if (sub === "finalize") {
  fs.mkdirSync(path.join(".specsync", "archive", "changes"), { recursive: true });
  fs.renameSync(path.join(".specsync", "changes", id), path.join(".specsync", "archive", "changes", "2026-09-30-" + id));
}
console.log("ok " + sub);
`;

/** Fake `hi export`: AGENT family, AGENT-18 and AGENT-18.a captured. */
const FAKE_HI = `#!/bin/sh
[ "$1" = "export" ] || exit 2
cat <<'JSON'
{"hi":1,"export":1,"scope":"repo","files":[{"file":"hi/agent.md","families":["AGENT"],"criteria":[{"id":"AGENT-18","text":"x","depth":1,"parent":null},{"id":"AGENT-18.a","text":"y","depth":2,"parent":"AGENT-18"}],"retired":[{"id":"AGENT-2","text":"z","retired":"gone"}]}]}
JSON
`;

type SpecsyncCall = { cwd: string; args: string[] };
function specsyncCalls(): SpecsyncCall[] {
  if (!existsSync(specsyncLog)) return [];
  return readFileSync(specsyncLog, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as SpecsyncCall);
}

beforeAll(() => {
  fakeBin = join(tempBase(), "bin");
  mkdirSync(fakeBin, { recursive: true });
  specsyncLog = join(fakeBin, "specsync.log");
  writeFileSync(join(fakeBin, "specsync"), FAKE_SPECSYNC(specsyncLog));
  writeFileSync(join(fakeBin, "hi"), FAKE_HI);
  chmodSync(join(fakeBin, "specsync"), 0o755);
  chmodSync(join(fakeBin, "hi"), 0o755);
  process.env.PATH = `${fakeBin}:${savedPath ?? "/usr/bin:/bin"}`;
  loadBuiltins();
});

afterEach(() => {
  setCorvidinhoCheckoutForTests(null);
  if (savedAllow === undefined) delete process.env.CORVIDINHO_ALLOWLIST;
  else process.env.CORVIDINHO_ALLOWLIST = savedAllow;
  rmSync(specsyncLog, { force: true });
});

afterAll(() => {
  process.env.PATH = savedPath;
  for (const b of bases) rmSync(b, { recursive: true, force: true });
});

function lane(outcomes: boolean[] = [true]) {
  const calls: string[] = [];
  const runner: VerifyRunner = async (cwd) => {
    calls.push(cwd);
    const ok = outcomes[Math.min(calls.length - 1, outcomes.length - 1)]!;
    return { success: ok, output: ok ? LANE_PASS_OUTPUT : "spec-check: bad delta" };
  };
  return { calls, runner };
}

function texts(events: AgentEvent[]): string[] {
  return events.filter((e) => e.type === "Text").map((e) => (e as { text: string }).text);
}

function tool(name: string, args: string[], cwd: string, extra: Partial<RunOptions> = {}): Promise<PluginHandlerResult> {
  return runPlugin({ name, args, cwd, nonInteractive: true, ...extra });
}

// ------------------------------------------------------------------ detect

describe("detectRepoWays: base tree ∪ HEAD ∪ working tree (AGENT-18, REQ-agent-518)", () => {
  test("finds SpecSync changes, hi criteria and Trust; none in a plain repo", async () => {
    const all = makeRepo({
      ".specsync/sdd.json": JSON.stringify(SDD_ON),
      "hi/agent.md": HI_FILE,
      ".trust.toml": "[trust]\n",
    });
    expect(await detectRepoWays(all, null)).toEqual({ sdd: true, hi: true, trust: true });
    const plain = makeRepo({ "hi/README.md": "# not hi\n", ".specsync/sdd.json": JSON.stringify({ ...SDD_ON, enabled: false }) });
    expect(await detectRepoWays(plain, null)).toEqual({ sdd: false, hi: false, trust: false });
  });

  test("a deletion in the working tree or a commit mid-run can't switch a way off", async () => {
    const repo = sddRepo({ "hi/agent.md": HI_FILE, ".trust.toml": "" });
    const base = gitIn(repo, "rev-parse", "HEAD").trim();
    rmSync(join(repo, ".specsync", "sdd.json"));
    rmSync(join(repo, "hi"), { recursive: true });
    rmSync(join(repo, ".trust.toml"));
    // HEAD still has them.
    expect(await detectRepoWays(repo, null)).toEqual({ sdd: true, hi: true, trust: true });
    gitIn(repo, "checkout", "-q", "-b", "work");
    gitIn(repo, "add", "-A");
    gitIn(repo, "commit", "-q", "-m", "drop the gates");
    // Gone from HEAD and the working tree: only the session base still has them.
    expect(await detectRepoWays(repo, null)).toEqual({ sdd: false, hi: false, trust: false });
    expect(await detectRepoWays(repo, base)).toEqual({ sdd: true, hi: true, trust: true });
    // Turning the workflow off in sdd.json is not a way out either.
    writeFileSync(join(repo, "x"), "");
    const scan = await scanRepoWays(repo, base);
    expect(scan.sdd.enabled).toBe(true);
    expect(scan.sdd.require).toBe(true);
  });

  test("a non-git project reads its working tree only", async () => {
    const dir = join(tempBase(), "plain");
    mkdirSync(join(dir, ".specsync"), { recursive: true });
    writeFileSync(join(dir, ".specsync", "sdd.json"), JSON.stringify(SDD_ON));
    expect(await detectRepoWays(dir, null)).toEqual({ sdd: true, hi: false, trust: false });
  });

  test("the operator line names what was found, nothing when none", () => {
    expect(formatRepoWaysLine({ sdd: true, hi: true, trust: false })).toBe(
      "Repo ways (AGENT-18): SpecSync changes (.specsync/sdd.json), hi criteria (hi/).",
    );
    expect(formatRepoWaysLine({ sdd: false, hi: false, trust: true })).toContain("Trust (.trust.toml");
    expect(formatRepoWaysLine({ sdd: false, hi: false, trust: false })).toBeNull();
  });
});

// ------------------------------------------------------------------ policy + coverage

describe("SpecSync coverage (AGENT-18, REQ-agent-518)", () => {
  test("meaningful vs ignored paths follow the repo's sdd.json; the more specific entry wins", () => {
    const p = parseSddPolicy(JSON.stringify(SDD_ON));
    expect(isMeaningfulPath("src/a.ts", p)).toBe(true);
    expect(isMeaningfulPath("hi/agent.md", p)).toBe(true);
    expect(isMeaningfulPath("package.json", p)).toBe(true);
    expect(isMeaningfulPath("specs/agent/agent.spec.md", p)).toBe(false);
    expect(isMeaningfulPath(".specsync/changes/x/state.json", p)).toBe(false);
    expect(isMeaningfulPath("README.md", p)).toBe(false);
    const d = parseSddPolicy(JSON.stringify({ enabled: true, require_change_for_meaningful_files: true }));
    // SpecSync's defaults: `.specsync/` ignored, but `.specsync/sdd.json` meaningful.
    expect(isMeaningfulPath(".specsync/sdd.json", d)).toBe(true);
    expect(isMeaningfulPath(".specsync/lifecycle/x", d)).toBe(false);
  });

  test("an unreadable sdd.json fails closed; merged policies keep the strictest reading", () => {
    const broken = parseSddPolicy("{ nope");
    expect(broken.enabled && broken.require).toBe(true);
    expect(isMeaningfulPath("anything/at/all.txt", broken)).toBe(true);
    const loose = parseSddPolicy(JSON.stringify({ ...SDD_ON, ignored_paths: [...SDD_ON.ignored_paths, "src/"] }));
    const merged = mergeSddPolicies([parseSddPolicy(JSON.stringify(SDD_ON)), loose]);
    expect(isMeaningfulPath("src/a.ts", merged)).toBe(true);
    const off = parseSddPolicy(JSON.stringify({ ...SDD_ON, require_change_for_meaningful_files: false }));
    expect(mergeSddPolicies([off, parseSddPolicy(JSON.stringify(SDD_ON))]).require).toBe(true);
    expect(mergeSddPolicies([off]).require).toBe(false);
  });

  test("an open change's paths (file or dir) cover; a change archived in the same diff covers", () => {
    const repo = sddRepo();
    const policy = parseSddPolicy(JSON.stringify(SDD_ON));
    const changed = ["src/app.ts", "src/lib/b.ts", "tests/b.test.ts", "specs/x.md", "README.md"];
    expect(sddUncovered(repo, changed, policy)).toEqual(["src/app.ts", "src/lib/b.ts", "tests/b.test.ts"]);
    openChange(repo, "fix-it", ["src/app.ts", "src/lib"]);
    expect(sddUncovered(repo, changed, policy)).toEqual(["tests/b.test.ts"]);
    const arch = join(repo, ".specsync", "archive", "changes", "2026-09-30-tests");
    mkdirSync(arch, { recursive: true });
    writeFileSync(join(arch, "state.json"), JSON.stringify({ id: "tests", affected_paths: ["tests/"] }));
    // Archived before this diff: does not cover.
    expect(sddUncovered(repo, changed, policy)).toEqual(["tests/b.test.ts"]);
    expect(sddUncovered(repo, [...changed, ".specsync/archive/changes/2026-09-30-tests/state.json"], policy)).toEqual([]);
    // Not required → nothing to cover.
    const off = parseSddPolicy(JSON.stringify({ ...SDD_ON, require_change_for_meaningful_files: false }));
    expect(sddUncovered(repo, ["src/zzz.ts"], off)).toEqual([]);
  });
});

// ------------------------------------------------------------------ the gate

describe("the verify gate needs every changed meaningful path in a SpecSync change (AGENT-18, REQ-agent-518)", () => {
  test("an uncovered edit is not verified and runs no lane; once a change covers it, the lane runs and it is verified", async () => {
    const repo = sddRepo({ "hi/agent.md": HI_FILE });
    const v = lane();
    const events: AgentEvent[] = [];
    const seen: ExecuteContext[] = [];
    const result = await runTask({
      cwd: repo,
      maxRetries: 1,
      verifyRunner: v.runner,
      onEvent: (e) => events.push(e),
      execute: async (ctx) => {
        seen.push(ctx);
        writeFileSync(join(repo, "src", "app.ts"), `export const x = ${ctx.attempt + 10};\n`);
        if (ctx.attempt === 2) openChange(repo, "bump-x", ["src/app.ts"]);
        return { summary: `attempt ${ctx.attempt}`, filesChanged: ["src/app.ts"] };
      },
    });
    expect(result.verified).toBe(true);
    expect(result.state).toBe("done");
    expect(result.attempts).toBe(2);
    expect(v.calls).toEqual([repo]);
    const t = texts(events);
    expect(t).toContain("Repo ways (AGENT-18): SpecSync changes (.specsync/sdd.json), hi criteria (hi/).");
    const note = t.find((x) => x.startsWith("SpecSync gate:"))!;
    expect(note).toContain("src/app.ts");
    expect(note).toContain("specsync-change-new");
    expect(seen[0]!.repoWays).toEqual({ sdd: true, hi: true, trust: false });
    expect(seen[1]!.verifyFeedback).toContain("SpecSync gate:");
    const verdicts = events.filter((e) => e.type === "VerifyResult") as { success: boolean }[];
    expect(verdicts.map((e) => e.success)).toEqual([false, true]);
  });

  test("deleting sdd.json and committing mid-run does not switch the gate off", async () => {
    const repo = sddRepo();
    gitIn(repo, "checkout", "-q", "-b", "work");
    const v = lane();
    const result = await runTask({
      cwd: repo,
      maxRetries: 0,
      verifyRunner: v.runner,
      execute: async () => {
        rmSync(join(repo, ".specsync", "sdd.json"));
        writeFileSync(join(repo, "src", "app.ts"), "export const x = 2;\n");
        gitIn(repo, "add", "-A");
        gitIn(repo, "commit", "-q", "-m", "sneak");
        return { summary: "done", filesChanged: ["src/app.ts"] };
      },
    });
    expect(result.verified).toBe(false);
    expect(result.state).toBe("failed");
    expect(result.summary).toContain("SpecSync gate:");
    expect(v.calls).toEqual([]);
  });

  test("a repo without a SpecSync workflow is gated as before (no ways line, no repoWays)", async () => {
    const repo = makeRepo();
    const v = lane();
    const events: AgentEvent[] = [];
    let ctxWays: RepoWays | undefined = { sdd: true, hi: true, trust: true };
    const result = await runTask({
      cwd: repo,
      maxRetries: 0,
      verifyRunner: v.runner,
      onEvent: (e) => events.push(e),
      execute: async (ctx) => {
        ctxWays = ctx.repoWays;
        writeFileSync(join(repo, "app.txt"), "changed\n");
        return { summary: "edited", filesChanged: ["app.txt"] };
      },
    });
    expect(result.verified).toBe(true);
    expect(ctxWays).toBeUndefined();
    expect(texts(events).some((t) => t.startsWith("Repo ways") || t.startsWith("SpecSync gate"))).toBe(false);
  });
});

describe("the tool loop gets one fixed prompt block for the ways (AGENT-18, REQ-agent-518)", () => {
  test("SpecSync and hi lines are in the system prompt only when found", async () => {
    const bodies: { messages: { role: string; content: string }[] }[] = [];
    const exec = createTaskExecute({
      taskText: "fix x",
      cwd: makeRepo(),
      env: {
        CORVIDINHO_LLM_API_KEY: "test-key-not-real",
        CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1",
        CORVIDINHO_LLM_MODEL: "test-model",
        CORVIDINHO_LLM_TIER: "code",
      },
      tier: "code",
      projectInstructions: false,
      fetchImpl: async (_i: string | URL | Request, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body ?? "{}")));
        return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "ok" } }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    const signal = new AbortController().signal;
    await exec({ attempt: 1, signal, repoWays: { sdd: true, hi: true, trust: false } });
    await exec({ attempt: 1, signal });
    const system = (n: number) => bodies[n]!.messages.find((m) => m.role === "system")!.content;
    expect(system(0)).toContain(renderRepoWaysBlock({ sdd: true, hi: true, trust: false }).trim());
    expect(system(0)).toContain("This repo works through SpecSync changes (AGENT-18)");
    expect(system(0)).toContain("Never invent criteria");
    expect(system(1)).not.toContain("This repo works through SpecSync changes");
    expect(renderRepoWaysBlock({ sdd: false, hi: false, trust: true })).toBe("");
  });
});

// ------------------------------------------------------------------ tools

describe("SpecSync change tools (AGENT-18, REQ-plugins-518)", () => {
  test("shape: new/answer mutating code tier, status read-only, approve/finalize dangerous and never offered", () => {
    for (const name of ["specsync-change-new", "specsync-change-answer"]) {
      const c = get(name)!;
      expect(c.mutating).toBe(true);
      expect(Boolean(c.dangerous)).toBe(false);
      expect(c.minTier).toBe(2);
      expect(TEAM_WORK_TOOLS.has(name)).toBe(true);
      expect(roleAllowsPlugin("team", c, true)).toBe(true);
      expect(roleAllowsPlugin("team", c, false)).toBe(false);
      expect(roleAllowsPlugin("community", c, true)).toBe(false);
    }
    const status = get("specsync-change-status")!;
    expect(Boolean(status.dangerous || status.mutating)).toBe(false);
    expect(status.minTier).toBe(0);
    for (const name of ["specsync-change-approve", "specsync-change-finalize"]) {
      const c = get(name)!;
      expect(c.dangerous).toBe(true);
      expect(c.minTier).toBe(2);
      expect(c.agentTool).toBe(false);
      expect(roleAllowsPlugin("community", c, true)).toBe(false);
    }
    const every = new Set(["specsync-change-approve", "specsync-change-finalize", "specsync-change-new"]);
    const offered = buildOpenAiTools({ tier: "code", allowlist: every, actingRole: "owner" }).map((t) => t.function.name);
    expect(offered).toContain("specsync-change-new");
    expect(offered).not.toContain("specsync-change-approve");
    expect(offered).not.toContain("specsync-change-finalize");
  });

  test("new/answer refuse --root and a repo whose workflow is off; new records the change this run opened", async () => {
    const plain = makeRepo();
    const off = await tool("specsync-change-new", ["x", "--path", "app.txt"], plain);
    expect(off.ok).toBe(false);
    expect(off.error).toBe(SDD_OFF_REFUSAL);
    expect((await tool("specsync-change-answer", ["x", "public_contract", "no"], plain)).error).toBe(SDD_OFF_REFUSAL);
    const repo = sddRepo();
    const root = await tool("specsync-change-new", ["x", "--root", "/etc"], repo);
    expect(root.error).toContain("--root is not allowed");
    expect(specsyncCalls()).toEqual([]);

    const run = beginSddRun(repo);
    try {
      const made = await tool("specsync-change-new", ["Fix the app", "--kind", "bug-fix", "--path", "src/app.ts"], repo);
      expect(made.ok).toBe(true);
      expect((made.data as { opened: string[] }).opened).toEqual(["fix-the-app"]);
      expect(run.opened).toEqual(["fix-the-app"]);
    } finally {
      endSddRun(run);
    }
    expect(specsyncCalls()[0]!.args.slice(0, 3)).toEqual(["change", "new", "Fix the app"]);
    const status = await tool("specsync-change-status", ["fix-the-app"], repo);
    expect(status.ok).toBe(true);
    expect(specsyncCalls().at(-1)!.args).toEqual(["change", "status", "fix-the-app"]);
  });

  test("in a hi repo an acceptance_criteria answer must cite captured hi ids, and only those", async () => {
    const repo = sddRepo({ "hi/agent.md": HI_FILE });
    openChange(repo, "c1", ["src/app.ts"]);
    const none = await tool("specsync-change-answer", ["c1", "acceptance_criteria", "it works great"], repo);
    expect(none.ok).toBe(false);
    expect(none.error).toContain("cites none");
    const invented = await tool("specsync-change-answer", ["c1", "acceptance_criteria", "meets AGENT-18 and AGENT-99"], repo);
    expect(invented.error).toContain("AGENT-99 is not captured");
    const retired = await tool("specsync-change-answer", ["c1", "acceptance_criteria", "AGENT-2 holds"], repo);
    expect(retired.error).toContain("AGENT-2 is not captured");
    expect(specsyncCalls()).toEqual([]);
    const good = await tool("specsync-change-answer", ["c1", "acceptance_criteria", "AGENT-18.a:", "approves", "its", "own"], repo);
    expect(good.ok).toBe(true);
    expect(specsyncCalls()[0]!.args).toEqual(["change", "answer", "c1", "acceptance_criteria", "AGENT-18.a: approves its own"]);
    // Other questions, and repos without hi, are not checked.
    expect((await tool("specsync-change-answer", ["c1", "public_contract", "no"], repo)).ok).toBe(true);
    const noHi = sddRepo();
    openChange(noHi, "c2", ["src/app.ts"]);
    expect((await tool("specsync-change-answer", ["c2", "acceptance_criteria", "it works"], noHi)).ok).toBe(true);
  });

  test("file tools leave SpecSync's own records in a change folder to the specsync change commands (REQ-plugins-083)", async () => {
    expect(isSddRecordPath(".specsync/changes/c1/state.json")).toBe(true);
    expect(isSddRecordPath("./.specsync/changes/c1/approvals.json")).toBe(true);
    expect(isSddRecordPath(".SpecSync/Changes/c1/Review.JSON")).toBe(true);
    expect(isSddRecordPath("/abs/proj/.specsync/changes/c1/verification.json")).toBe(true);
    expect(isSddRecordPath(".specsync/changes/c1/change.md")).toBe(false);
    expect(isSddRecordPath(".specsync/changes/c1/deltas/plugins.md")).toBe(false);
    expect(isSddRecordPath(".specsync/changes/c1/deltas/x.json")).toBe(false);
    expect(isSddRecordPath("src/state.json")).toBe(false);

    const repo = sddRepo();
    openChange(repo, "c1", ["src/app.ts"]);
    const statePath = join(repo, ".specsync", "changes", "c1", "state.json");
    const before = readFileSync(statePath, "utf8");
    const widen = JSON.stringify({ id: "c1", state: "approved", affected_paths: ["src/"] });
    const refused = [
      await tool("files-write", [".specsync/changes/c1/state.json", widen], repo),
      await tool("files-edit", [".specsync/changes/c1/state.json", "--old", "src/app.ts", "--new", "src/"], repo),
      await tool("files-write", [".specsync/changes/c1/approvals.json", "[]"], repo),
      await tool("files-write", [".specsync/changes/planted/state.json", widen], repo),
      await tool("files-delete", [".specsync/changes/c1/state.json"], repo, { allowlist: ["files-delete"] }),
    ];
    for (const r of refused) {
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(2);
      expect(r.error).toContain("SpecSync lifecycle record");
    }
    expect(readFileSync(statePath, "utf8")).toBe(before);
    expect(existsSync(join(repo, ".specsync", "changes", "c1", "approvals.json"))).toBe(false);
    expect(existsSync(join(repo, ".specsync", "changes", "planted"))).toBe(false);
    // So a planted or widened change can't cover an edit past the gate.
    expect(sddUncovered(repo, ["src/other.ts"], parseSddPolicy(JSON.stringify(SDD_ON)))).toEqual(["src/other.ts"]);
    // The change's artifacts stay writable (SPECSYNC-4).
    const tasks = await tool("files-write", [".specsync/changes/c1/tasks.md", "- [x] a\n"], repo);
    expect(tasks.ok).toBe(true);
    const delta = await tool("files-write", [".specsync/changes/c1/deltas/agent.md", "# Delta\n"], repo);
    expect(delta.ok).toBe(true);
  });

  test("hi ids are read by family; other upper-case tokens are not citations", () => {
    const fam = new Set(["AGENT", "DISCORD-SCHEDULE", "MEMORY"]);
    expect(citedHiIds("AGENT-18, DISCORD-SCHEDULE-1.a and MEMORY-7.a; SHA-256, UTF-8, REQ-agent-518", fam).sort()).toEqual([
      "AGENT-18",
      "DISCORD-SCHEDULE-1.a",
      "MEMORY-7.a",
    ]);
  });
});

// ------------------------------------------------------------------ AGENT-18.a

/** A temp repo that plays Corvidinho itself: origin CorvidLabs/Corvidinho, named as this checkout. */
function corvidinhoRepo(): string {
  const repo = sddRepo();
  gitIn(repo, "remote", "add", "origin", "https://github.com/CorvidLabs/Corvidinho.git");
  setCorvidinhoCheckoutForTests(repo);
  return repo;
}

describe("Corvidinho is a fixed fact, never a flag (AGENT-18.a, REQ-plugins-519)", () => {
  test("origin URL forms", () => {
    for (const u of [
      "https://github.com/CorvidLabs/Corvidinho",
      "https://github.com/corvidlabs/corvidinho.git",
      "https://x-access-token:abc@github.com/CorvidLabs/Corvidinho.git/",
      "git@github.com:CorvidLabs/Corvidinho.git",
      "ssh://git@github.com/CorvidLabs/Corvidinho.git",
    ]) {
      expect(isCorvidinhoOriginUrl(u)).toBe(true);
    }
    for (const u of [
      "https://github.com/CorvidLabs/Corvidinho-fork",
      "https://gitlab.com/CorvidLabs/Corvidinho",
      "https://github.com/evil/CorvidLabs/Corvidinho",
      "https://github.com.evil.io/CorvidLabs/Corvidinho",
      "/srv/git/CorvidLabs/Corvidinho.git",
    ]) {
      expect(isCorvidinhoOriginUrl(u)).toBe(false);
    }
  });

  test("a repo with Corvidinho's origin is not Corvidinho unless it is the checkout this runs from (or its worktree)", async () => {
    const lookalike = sddRepo();
    gitIn(lookalike, "remote", "add", "origin", "https://github.com/CorvidLabs/Corvidinho.git");
    expect(await isCorvidinhoProject(lookalike)).toBe(false);
    setCorvidinhoCheckoutForTests(lookalike);
    expect(await isCorvidinhoProject(lookalike)).toBe(true);
    const wt = join(tempBase(), "talk");
    gitIn(lookalike, "worktree", "add", "-q", "-b", "talk/x", wt);
    expect(await isCorvidinhoProject(wt)).toBe(true);
    gitIn(lookalike, "remote", "set-url", "origin", "https://github.com/acme/widget.git");
    expect(await isCorvidinhoProject(lookalike)).toBe(false);
  });
});

describe("approve and finalize: only its own change, on Corvidinho, right after a green lane (AGENT-18.a, REQ-plugins-519)", () => {
  test("outside Corvidinho they refuse with the human line and run nothing", async () => {
    const repo = sddRepo();
    openChange(repo, "c1", ["src/app.ts"]);
    const run = beginSddRun(repo);
    run.opened.push("c1");
    run.verified = true;
    try {
      for (const name of ["specsync-change-approve", "specsync-change-finalize"]) {
        const r = await tool(name, ["c1"], repo, { allowlist: [name] });
        expect(r.ok).toBe(false);
        expect(r.error).toBe(HUMAN_LIFECYCLE_LINE);
      }
    } finally {
      endSddRun(run);
    }
    expect(specsyncCalls()).toEqual([]);
  });

  test("on Corvidinho: not this run's change, or no green lane now, or WATCH / schedule / worker → refused", async () => {
    const repo = corvidinhoRepo();
    openChange(repo, "c1", ["src/app.ts"]);
    expect(await selfLifecycleRefusal(repo, "c1", {})).toContain("not a SpecSync change this run opened");
    const run = beginSddRun(repo);
    try {
      run.opened.push("c1");
      expect(await selfLifecycleRefusal(repo, "c1", {})).toContain("only right after the verify lane is green");
      run.verified = true;
      expect(await selfLifecycleRefusal(repo, "c1", {})).toBeNull();
      expect(await selfLifecycleRefusal(repo, "c2", {})).toContain("not a SpecSync change this run opened");
      expect(await selfLifecycleRefusal(repo, "c1", { CORVIDINHO_WATCH_SESSION_ID: "w1" })).toContain("WATCH runs and schedules");
      expect(await selfLifecycleRefusal(repo, "c1", { CORVIDINHO_DISCORD_SESSION_ID: "schedule_7" })).toContain(
        "WATCH runs and schedules",
      );
      expect(await selfLifecycleRefusal(repo, "c1", { CORVIDINHO_ACTING_SURFACE: "schedule" })).toContain(
        "WATCH runs and schedules",
      );
      expect(await selfLifecycleRefusal(repo, "c1", { CORVIDINHO_DELEGATE_DEPTH: "1" })).toContain("delegate or council worker");
      expect(
        await selfLifecycleRefusal(repo, "c1", { CORVIDINHO_ACTING_IS_ADMIN: "0", CORVIDINHO_ACTING_ROLE: "community" }),
      ).toContain("only the owner's and the team's runs");
      // Through the tool (SAFE-1 allowlisted): approve runs with the agent as actor.
      const ok = await tool("specsync-change-approve", ["c1"], repo, { allowlist: ["specsync-change-approve"] });
      expect(ok.ok).toBe(true);
      expect(specsyncCalls().map((c) => c.args)).toEqual([["change", "approve", "c1", "--actor", "corvid-agent"]]);
      // SAFE-1 still applies: not allowlisted → denied before the handler.
      const denied = await tool("specsync-change-finalize", ["c1"], repo, { allowlist: [] });
      expect(denied.error).toContain("SAFE-1");
      expect(specsyncCalls()).toHaveLength(1);
    } finally {
      endSddRun(run);
    }
  });
});

describe("runTask approves and archives its own change on Corvidinho once verify is green (AGENT-18.a, REQ-agent-519)", () => {
  /** An execute that opens a change through the tool (as the model would) and makes the covered edit. */
  const openAndEdit =
    (repo: string, desc = "Bump x"): ExecuteFn =>
    async () => {
      const made = await tool("specsync-change-new", [desc, "--kind", "bug-fix", "--path", "src/app.ts"], repo);
      if (!made.ok) throw new Error(made.error);
      writeFileSync(join(repo, "src", "app.ts"), "export const x = 2;\n");
      return { summary: "bumped x", filesChanged: ["src/app.ts"] };
    };

  test("verify green → approve, check, review, finalize its own change, then the lane runs again", async () => {
    const repo = corvidinhoRepo();
    process.env.CORVIDINHO_ALLOWLIST = "specsync-change-approve,specsync-change-finalize";
    const v = lane();
    const events: AgentEvent[] = [];
    const result = await runTask({ cwd: repo, maxRetries: 0, verifyRunner: v.runner, onEvent: (e) => events.push(e), execute: openAndEdit(repo) });
    expect(result.verified).toBe(true);
    expect(result.state).toBe("done");
    expect(specsyncCalls().map((c) => c.args.slice(0, 3).join(" "))).toEqual([
      "change new Bump x",
      "change approve bump-x",
      "change check bump-x",
      "change review bump-x",
      "change finalize bump-x",
    ]);
    expect(specsyncCalls()[1]!.args).toContain("corvid-agent");
    expect(specsyncCalls()[3]!.args).toEqual(["change", "review", "bump-x", "--reviewer", "corvid-agent"]);
    expect(v.calls).toEqual([repo, repo]);
    expect(texts(events)).toContain("SpecSync: verify is green, so it approved and archived its own change bump-x (AGENT-18.a).");
    expect(existsSync(join(repo, ".specsync", "archive", "changes", "2026-09-30-bump-x", "state.json"))).toBe(true);
  });

  test("elsewhere the change stays open for a human, and no approve runs", async () => {
    const repo = sddRepo();
    gitIn(repo, "remote", "add", "origin", "https://github.com/acme/widget.git");
    process.env.CORVIDINHO_ALLOWLIST = "specsync-change-approve,specsync-change-finalize";
    const v = lane();
    const events: AgentEvent[] = [];
    const result = await runTask({ cwd: repo, maxRetries: 0, verifyRunner: v.runner, onEvent: (e) => events.push(e), execute: openAndEdit(repo) });
    expect(result.verified).toBe(true);
    expect(specsyncCalls().map((c) => c.args[1])).toEqual(["new"]);
    expect(v.calls).toEqual([repo]);
    expect(texts(events).find((t) => t.startsWith("SpecSync: bump-x stays open for a human"))).toBeDefined();
  });

  test("on Corvidinho without the SAFE-1 allowlist it only says why; a change it did not open is never touched", async () => {
    const repo = corvidinhoRepo();
    openChange(repo, "someone-elses", ["src/other.ts"]);
    const v = lane();
    const events: AgentEvent[] = [];
    const result = await runTask({ cwd: repo, maxRetries: 0, verifyRunner: v.runner, onEvent: (e) => events.push(e), execute: openAndEdit(repo) });
    expect(result.verified).toBe(true);
    expect(specsyncCalls().map((c) => c.args[1])).toEqual(["new"]);
    const line = texts(events).find((t) => t.startsWith("SpecSync: did not approve its own change bump-x"))!;
    expect(line).toContain("SAFE-1");
    expect(line).toContain("stays open for a human");
    expect(existsSync(join(repo, ".specsync", "changes", "someone-elses", "state.json"))).toBe(true);
  });

  test("a lane that fails over what the lifecycle wrote fails the run", async () => {
    const repo = corvidinhoRepo();
    process.env.CORVIDINHO_ALLOWLIST = "specsync-change-approve,specsync-change-finalize";
    const v = lane([true, false]);
    const result = await runTask({ cwd: repo, maxRetries: 3, verifyRunner: v.runner, execute: openAndEdit(repo) });
    expect(result.verified).toBe(false);
    expect(result.state).toBe("failed");
    expect(result.summary).toContain("Verification failed when re-run over what approving and archiving its own SpecSync change wrote");
    expect(v.calls).toHaveLength(2);
  });

  test("a failed approve leaves the change for a human and the run stays verified", async () => {
    const repo = corvidinhoRepo();
    process.env.CORVIDINHO_ALLOWLIST = "specsync-change-approve,specsync-change-finalize";
    const v = lane();
    const events: AgentEvent[] = [];
    const result = await runTask({
      cwd: repo,
      maxRetries: 0,
      verifyRunner: v.runner,
      onEvent: (e) => events.push(e),
      execute: openAndEdit(repo, "fail approve"),
    });
    expect(result.verified).toBe(true);
    expect(specsyncCalls().map((c) => c.args[1])).toEqual(["new", "approve"]);
    expect(texts(events).find((t) => t.startsWith("SpecSync: did not approve its own change fail-approve"))).toContain(
      "approve refused by fake",
    );
    expect(v.calls).toEqual([repo]);
  });
});

// ------------------------------------------------------------------ /work

describe("/work checks SpecSync coverage before commit and push (AGENT-18, REQ-discord-518)", () => {
  function workFixture(): { wt: string; branch: string } {
    const repo = sddRepo();
    const bare = join(tempBase(), "acme", "widget.git");
    mkdirSync(bare, { recursive: true });
    gitIn(bare, "init", "-q", "--bare");
    gitIn(repo, "remote", "add", "origin", bare);
    gitIn(repo, "push", "-q", "origin", "main");
    gitIn(repo, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
    const branch = "talk/sess_sdd";
    const wt = join(tempBase(), "talk");
    gitIn(repo, "worktree", "add", "-q", "-b", branch, wt);
    return { wt, branch };
  }

  const verified = { ok: true, exitCode: 0, task: { verified: true, verifySkipped: false, state: "done" } };

  test("an uncovered path keeps the PR from opening; covered (open or archived on the branch) ships", async () => {
    const { wt, branch } = workFixture();
    writeFileSync(join(wt, "src", "app.ts"), "export const x = 3;\n");
    const calls: string[] = [];
    const deps = {
      allowlist: new Set(["git-commit", "git-push", "github-pr-create"]),
      repoGate: () => ({ ok: true as const, repo: "acme/widget" }),
      runPlugin: async (o: RunOptions): Promise<PluginHandlerResult> => {
        calls.push(o.name);
        return { ok: true, data: { url: "https://github.com/acme/widget/pull/1", number: 1 } };
      },
      // GITHUB-9's own gate is tested in tests/work.review.test.ts.
      reviewed: async () => true,
    };
    const input = { worktreePath: wt, branch, taskId: "work_1", description: "bump x", run: verified };
    const blocked = await openWorkPr(input, deps);
    expect(blocked.opened).toBe(false);
    expect(blocked.opened ? "" : blocked.reason).toBe("sdd-uncovered");
    expect(blocked.line).toContain("src/app.ts");
    expect(calls).toEqual([]);

    const arch = join(wt, ".specsync", "archive", "changes", "2026-09-30-bump-x");
    mkdirSync(arch, { recursive: true });
    writeFileSync(join(arch, "state.json"), JSON.stringify({ id: "bump-x", affected_paths: ["src/app.ts"] }));
    const shipped = await openWorkPr(input, deps);
    expect(shipped.opened).toBe(true);
    expect(calls).toEqual(["git-commit", "git-push", "github-pr-create"]);
  });

  test("turning the workflow off on the branch does not skip the check", async () => {
    const { wt, branch } = workFixture();
    rmSync(join(wt, ".specsync", "sdd.json"));
    writeFileSync(join(wt, "src", "app.ts"), "export const x = 4;\n");
    gitIn(wt, "add", "-A");
    gitIn(wt, "commit", "-q", "-m", "off");
    const out = await openWorkPr(
      { worktreePath: wt, branch, taskId: "work_2", description: "x", run: verified },
      {
        allowlist: new Set(["git-commit", "git-push", "github-pr-create"]),
        repoGate: () => ({ ok: true as const, repo: "acme/widget" }),
        runPlugin: async () => ({ ok: true }),
      },
    );
    expect(out.opened ? "" : out.reason).toBe("sdd-uncovered");
  });
});
