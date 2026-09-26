/**
 * /work → draft PR (issue #88, REQ-discord-088; AUTONOMOUS-3, GITHUB-2/5, AGENT-4).
 * Every repo is `git init` inside mkdtemp; the push remote is a local bare repo
 * at <tmp>/acme/widget.git (OWNER/REPO "acme/widget"); github-pr-create runs in
 * CORVIDINHO_GITHUB_DRY_RUN mode or is mocked. The verify lane is mocked.
 * No network, no real tokens.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resultFrame, serializeFrame } from "../src/agent/events-ndjson.ts";
import type { TaskResult, VerifyRunner } from "../src/agent/types.ts";
import { emptyConfig } from "../src/allowlist/types.ts";
import { createSpawnAgentClient, type AgentClient } from "../src/discord/agent-client.ts";
import { handleWorkCommand } from "../src/discord/command-handlers/work.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import type { SlashContext, SlashReplyPayload } from "../src/discord/slash-types.ts";
import { WorkStore } from "../src/discord/work-store.ts";
import { CORVIDINHO_PROTOCOL_VERSION } from "../src/discord/protocol-version.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry } from "../src/plugins/registry.ts";
import { runPlugin, type RunOptions } from "../src/plugins/run.ts";
import type { PluginHandlerResult } from "../src/plugins/types.ts";
import {
  buildWorkPrBody,
  workCommitMessage,
  workPrTitle,
} from "../src/work/pr-body.ts";
import {
  openWorkPr,
  WORK_PR_PLUGINS,
  type OpenWorkPrDeps,
  type OpenWorkPrInput,
  type WorkPrOutcome,
} from "../src/work/pr.ts";

const ENV_KEYS = [
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_NOSYSTEM",
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "CORVIDINHO_ALLOWLIST",
  "CORVIDINHO_ALLOWLIST_FILE",
  "CORVIDINHO_GITHUB_ALLOW_REPOS",
  "CORVIDINHO_GITHUB_ALLOW_ORGS",
  "CORVIDINHO_GITHUB_DENY_REPOS",
  "CORVIDINHO_GITHUB_DENY_ORGS",
  "CORVIDINHO_GITHUB_DRY_RUN",
  "GITHUB_TOKEN",
  "GH_TOKEN",
] as const;

const saved: Record<string, string | undefined> = {};
let base = "";

function g(cwd: string, ...args: string[]): string {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined || k === "GIT_DIR" || k === "GIT_WORK_TREE" || k === "GIT_INDEX_FILE") {
      continue;
    }
    env[k] = v;
  }
  const r = Bun.spawnSync(["git", ...args], { cwd, env, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr.toString()}`);
  }
  return r.stdout.toString();
}

type Fixture = { repo: string; bare: string; wt: string; branch: string };

/**
 * Project repo on `main` pushed to a bare `origin` (acme/widget), with
 * `origin/HEAD` set, plus a /work-style worktree on branch talk/<id>.
 */
function makeFixture(id = "sess_fixture01"): Fixture {
  const repo = mkdtempSync(join(base, "repo-"));
  g(repo, "init", "-q", "-b", "main");
  g(repo, "config", "user.name", "Fixture Bot");
  g(repo, "config", "user.email", "fixture@example.invalid");
  g(repo, "config", "commit.gpgsign", "false");
  writeFileSync(join(repo, "README.md"), "hello\n");
  writeFileSync(join(repo, "old.txt"), "old\n");
  g(repo, "add", "README.md", "old.txt");
  g(repo, "commit", "-q", "-m", "init");
  const bare = join(mkdtempSync(join(base, "remote-")), "acme", "widget.git");
  mkdirSync(bare, { recursive: true });
  g(bare, "init", "-q", "--bare");
  g(repo, "remote", "add", "origin", bare);
  g(repo, "push", "-q", "origin", "main");
  g(repo, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
  const branch = `talk/${id}`;
  const wt = join(mkdtempSync(join(base, "wt-")), "talk");
  g(repo, "worktree", "add", "-q", "-b", branch, wt);
  return { repo, bare, wt, branch };
}

function remoteRef(bare: string, branch: string): string | null {
  const r = Bun.spawnSync(["git", "rev-parse", "--verify", "-q", `refs/heads/${branch}`], {
    cwd: bare,
    stdout: "pipe",
    stderr: "pipe",
  });
  return r.exitCode === 0 ? r.stdout.toString().trim() : null;
}

const ALL_ALLOWED = new Set<string>(WORK_PR_PLUGINS);
const passVerify: VerifyRunner = async () => ({ success: true, output: "ok" });
const failVerify: VerifyRunner = async () => ({ success: false, output: "tests failed" });
const allowAcme = () => ({ ok: true as const, repo: "acme/widget" });

type Recorder = {
  calls: RunOptions[];
  fn: (opts: RunOptions) => Promise<PluginHandlerResult>;
};

/** Records plugin calls; delegates to the real runPlugin unless overridden. */
function recorder(
  overrides: Record<string, PluginHandlerResult> = {},
): Recorder {
  const calls: RunOptions[] = [];
  return {
    calls,
    fn: async (opts) => {
      calls.push(opts);
      const o = overrides[opts.name];
      if (o) return o;
      return runPlugin(opts);
    },
  };
}

function input(fx: Fixture, over: Partial<OpenWorkPrInput> = {}): OpenWorkPrInput {
  return {
    worktreePath: fx.wt,
    branch: fx.branch,
    taskId: "work_fixture",
    description: "Add a greeting module",
    run: { ok: true, exitCode: 0, task: { verified: true, verifySkipped: false, state: "done" } },
    ...over,
  };
}

function deps(over: Partial<OpenWorkPrDeps> = {}): OpenWorkPrDeps {
  return {
    allowlist: ALL_ALLOWED,
    verify: failVerify,
    repoGate: allowAcme,
    ...over,
  };
}

beforeAll(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  base = mkdtempSync(join(tmpdir(), "corvidinho-work-pr-"));
  const globalCfg = join(base, "gitconfig");
  writeFileSync(globalCfg, "");
  process.env.GIT_CONFIG_GLOBAL = globalCfg;
  process.env.GIT_CONFIG_NOSYSTEM = "1";
  process.env.CORVIDINHO_ALLOWLIST_FILE = join(base, "no-allowlist.toml");
  delete process.env.GIT_DIR;
  delete process.env.GIT_WORK_TREE;
  delete process.env.GIT_INDEX_FILE;
  delete process.env.GITHUB_TOKEN;
  delete process.env.GH_TOKEN;
  delete process.env.CORVIDINHO_ALLOWLIST;
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(base, { recursive: true, force: true });
});

beforeEach(() => {
  clearRegistry();
  loadBuiltins();
  process.env.CORVIDINHO_GITHUB_ALLOW_REPOS = "acme/widget";
  delete process.env.CORVIDINHO_GITHUB_DENY_REPOS;
  process.env.CORVIDINHO_GITHUB_DRY_RUN = "1";
});

describe("PR title / body from the real diff (GITHUB-2)", () => {
  test("title: first non-empty line, collapsed, capped, never a flag", () => {
    expect(workPrTitle("\n  Fix   the parser \nmore detail")).toBe("Fix the parser");
    expect(workPrTitle("--repo evil/x")).toBe("repo evil/x");
    expect(workPrTitle("   ")).toBe("Corvidinho work task");
    const long = workPrTitle("x".repeat(200));
    expect(long.length).toBe(72);
    expect(long.endsWith("…")).toBe(true);
    expect(workCommitMessage("Add greeting", "work_1")).toBe(
      "work: Add greeting\n\nCorvidinho /work task work_1.",
    );
  });

  test("body lists files, diffstat, commits and verify; untrusted text fenced + scrubbed", () => {
    const token = `ghp_${"a".repeat(36)}`;
    const body = buildWorkPrBody({
      taskId: "work_1",
      description: "Please add greeting ``` @octocat #12",
      branch: "talk/sess_1",
      base: "main",
      files: [
        { status: "A", path: "src/greet.ts" },
        { status: "R", path: "new.txt", origPath: "old.txt" },
      ],
      diffstat: " src/greet.ts | 1 +\n 1 file changed",
      commits: [`abc1234 work: add greeting ${token}`],
      verify: "run",
    });
    expect(body).toContain("`/work` task `work_1` (branch `talk/sess_1` into `main`)");
    expect(body).toContain("2 file(s) changed against `main`");
    expect(body).toContain("A  src/greet.ts");
    expect(body).toContain("R  old.txt -> new.txt");
    expect(body).toContain("src/greet.ts | 1 +");
    expect(body).toContain("abc1234 work: add greeting");
    expect(body).toContain("`fledge lanes run verify --non-interactive` passed in the work run");
    // A backtick run in the description gets a longer fence around it.
    expect(body).toContain("````text\nPlease add greeting ``` @octocat #12\n````");
    expect(body).not.toContain(token);
    expect(body).toContain("[redacted:github-token]");
  });
});

describe("openWorkPr gates (AGENT-4, GITHUB-5, GITHUB-6)", () => {
  test("failed run or failed verify in the run: no PR, no git, no plugins", async () => {
    const rec = recorder();
    const failed = await openWorkPr(
      input(makeFixture(), { run: { ok: false, exitCode: 1 } }),
      deps({ runPlugin: rec.fn }),
    );
    expect(failed).toMatchObject({ opened: false, reason: "run-failed" });
    expect(failed.line).toContain("exit 1");
    const vf = await openWorkPr(
      input(makeFixture(), {
        run: { ok: true, exitCode: 0, task: { verified: false, verifySkipped: false, state: "failed" } },
      }),
      deps({ runPlugin: rec.fn }),
    );
    expect(vf).toMatchObject({ opened: false, reason: "verify-failed" });
    expect(vf.line).toBe("PR: not opened — verification failed in the work run.");
    expect(rec.calls).toEqual([]);
  });

  test("no worktree (scoped dir) → plain line", async () => {
    const r = await openWorkPr(
      { taskId: "w", description: "x", run: { ok: true, exitCode: 0 } },
      deps(),
    );
    expect(r).toMatchObject({ opened: false, reason: "no-worktree" });
    expect(r.line).toBe("PR: not opened — this work did not run in a git worktree.");
  });

  test("clean worktree → no PR, says no changes", async () => {
    const rec = recorder();
    const r = await openWorkPr(input(makeFixture()), deps({ runPlugin: rec.fn }));
    expect(r).toMatchObject({ opened: false, reason: "no-changes" });
    expect(r.line).toBe("PR: none — the work left no changes in its worktree.");
    expect(rec.calls).toEqual([]);
  });

  test("GITHUB-5: not allowlisted → nothing committed, pushed or verified", async () => {
    const fx = makeFixture();
    writeFileSync(join(fx.wt, "greet.ts"), "export const hi = 1;\n");
    const rec = recorder();
    let verifyCalls = 0;
    const r = await openWorkPr(
      input(fx, { run: { ok: true, exitCode: 0 } }),
      deps({
        runPlugin: rec.fn,
        allowlist: new Set(["git-commit"]),
        verify: async () => {
          verifyCalls += 1;
          return { success: true, output: "" };
        },
      }),
    );
    expect(r).toMatchObject({ opened: false, reason: "not-allowed" });
    expect(r.line).toContain("needs an explicit allow (GITHUB-5)");
    expect(r.line).toContain("allowlist git-push, github-pr-create");
    expect(r.line).toContain(`branch \`${fx.branch}\``);
    expect(rec.calls).toEqual([]);
    expect(verifyCalls).toBe(0);
    expect(g(fx.wt, "status", "--porcelain")).toContain("greet.ts");
    expect(remoteRef(fx.bare, fx.branch)).toBeNull();
  });

  test("GITHUB-6: repo gate refusal → no PR", async () => {
    const fx = makeFixture();
    writeFileSync(join(fx.wt, "greet.ts"), "x\n");
    const rec = recorder();
    const r = await openWorkPr(
      input(fx),
      deps({
        runPlugin: rec.fn,
        repoGate: (repo) => ({ ok: false, repo, error: `GITHUB-6: ${repo} is not allowed` }),
      }),
    );
    expect(r).toMatchObject({ opened: false, reason: "repo-denied" });
    expect(r.line).toBe("PR: not opened — GITHUB-6: acme/widget is not allowed");
    expect(rec.calls).toEqual([]);
  });

  test("AGENT-4: unverified run re-runs the verify lane once; failure ships nothing", async () => {
    const fx = makeFixture();
    writeFileSync(join(fx.wt, "greet.ts"), "x\n");
    const rec = recorder();
    const seen: string[] = [];
    const r = await openWorkPr(
      input(fx, { run: { ok: true, exitCode: 0, task: { verified: false, verifySkipped: true } } }),
      deps({
        runPlugin: rec.fn,
        verify: async (cwd) => {
          seen.push(cwd);
          return failVerify(cwd);
        },
      }),
    );
    expect(r).toMatchObject({ opened: false, reason: "verify-failed" });
    expect(r.line).toContain("the verify lane failed on the work tree");
    expect(seen).toEqual([fx.wt]);
    expect(rec.calls).toEqual([]);
    expect(remoteRef(fx.bare, fx.branch)).toBeNull();
  });
});

describe("openWorkPr ships through the git + github plugins (AUTONOMOUS-3, GITHUB-2)", () => {
  test("dirty verified worktree → commit, push, draft PR with a body from the real diff", async () => {
    const fx = makeFixture();
    writeFileSync(join(fx.wt, "greet.ts"), "export const hi = 'hi';\n");
    writeFileSync(join(fx.wt, "README.md"), "hello\nworld\n");
    unlinkSync(join(fx.wt, "old.txt"));
    const rec = recorder();
    let verifyCalls = 0;
    const r = await openWorkPr(
      input(fx),
      deps({
        runPlugin: rec.fn,
        verify: async () => {
          verifyCalls += 1;
          return { success: true, output: "" };
        },
      }),
    );
    expect(r).toMatchObject({
      opened: true,
      dryRun: true,
      repo: "acme/widget",
      branch: fx.branch,
      base: "main",
      verify: "run",
    });
    expect(r.line).toBe(
      `PR: dry run — would open a draft PR from \`${fx.branch}\` into \`main\` on acme/widget.`,
    );
    // Verified in the run: the lane is not re-run.
    expect(verifyCalls).toBe(0);
    expect(rec.calls.map((c) => c.name)).toEqual(["git-commit", "git-push", "github-pr-create"]);
    for (const c of rec.calls) {
      expect(c.nonInteractive).toBe(true);
      expect(c.cwd).toBe(fx.wt);
    }
    // Committed and pushed for real (local bare remote).
    expect(g(fx.wt, "status", "--porcelain")).toBe("");
    const head = g(fx.wt, "rev-parse", "HEAD").trim();
    expect(remoteRef(fx.bare, fx.branch)).toBe(head);
    expect(g(fx.wt, "log", "-1", "--format=%s").trim()).toBe("work: Add a greeting module");

    const pr = rec.calls[2]!;
    const args = pr.args ?? [];
    const flag = (n: string) => args[args.indexOf(n) + 1];
    expect(flag("--repo")).toBe("acme/widget");
    expect(flag("--head")).toBe(fx.branch);
    expect(flag("--base")).toBe("main");
    expect(flag("--title")).toBe("Add a greeting module");
    expect(args).toContain("--draft");
    const body = flag("--body") ?? "";
    expect(body).toContain("3 file(s) changed against `main`");
    expect(body).toContain("A  greet.ts");
    expect(body).toContain("M  README.md");
    expect(body).toContain("D  old.txt");
    expect(body).toContain("3 files changed");
    expect(body).toContain(`${head.slice(0, 7)} work: Add a greeting module`);
    expect(body).toContain("passed in the work run on this tree");
  });

  test("worktree not on the work branch (agent switched branches or detached) → no push", async () => {
    for (const move of [["checkout", "-q", "-b", "elsewhere"], ["checkout", "-q", "--detach"]]) {
      const fx = makeFixture(`sess_branch${move.length}`);
      writeFileSync(join(fx.wt, "greet.ts"), "export const hi = 'hi';\n");
      g(fx.wt, ...move);
      const rec = recorder();
      const r = await openWorkPr(input(fx), deps({ runPlugin: rec.fn, verify: passVerify }));
      expect(r).toMatchObject({ opened: false, reason: "wrong-branch" });
      expect(rec.calls.length).toBe(0);
      expect(remoteRef(fx.bare, fx.branch)).toBeNull();
    }
  });

  test("agent already committed: git-commit not needed or allowlisted; unverified run re-verifies", async () => {
    const fx = makeFixture();
    writeFileSync(join(fx.wt, "greet.ts"), "x\n");
    g(fx.wt, "add", "greet.ts");
    g(fx.wt, "commit", "-q", "-m", "feat: greet");
    const rec = recorder({
      "github-pr-create": {
        ok: true,
        exitCode: 0,
        data: { number: 7, url: "https://github.com/acme/widget/pull/7" },
      },
    });
    let verifyCalls = 0;
    const r = await openWorkPr(
      input(fx, { run: { ok: true, exitCode: 0, task: { verified: false, verifySkipped: true } } }),
      deps({
        runPlugin: rec.fn,
        allowlist: new Set(["git-push", "github-pr-create"]),
        verify: async () => {
          verifyCalls += 1;
          return { success: true, output: "" };
        },
      }),
    );
    expect(r).toMatchObject({ opened: true, dryRun: false, number: 7, verify: "pre-push" });
    expect(r.line).toBe(
      `PR: opened draft https://github.com/acme/widget/pull/7 (\`${fx.branch}\` into \`main\` on acme/widget).`,
    );
    expect(verifyCalls).toBe(1);
    expect(rec.calls.map((c) => c.name)).toEqual(["git-push", "github-pr-create"]);
    const body = rec.calls[1]!.args![rec.calls[1]!.args!.indexOf("--body") + 1]!;
    expect(body).toContain("feat: greet");
    expect(body).toContain("passed on this tree right before the push");
  });

  test("push failure or PR failure → plain line, never a claimed PR", async () => {
    const fx = makeFixture();
    writeFileSync(join(fx.wt, "greet.ts"), "x\n");
    const pushFail = recorder({
      "git-push": { ok: false, exitCode: 1, error: "git push was rejected" },
    });
    const a = await openWorkPr(input(fx), deps({ runPlugin: pushFail.fn }));
    expect(a).toMatchObject({ opened: false, reason: "push-failed" });
    expect(a.line).toBe("PR: not opened — push failed: git push was rejected");
    expect(pushFail.calls.map((c) => c.name)).toEqual(["git-commit", "git-push"]);

    const fx2 = makeFixture("sess_fixture02");
    writeFileSync(join(fx2.wt, "greet.ts"), "x\n");
    const prFail = recorder({
      "github-pr-create": { ok: false, exitCode: 1, error: "Validation Failed" },
    });
    const b = await openWorkPr(input(fx2), deps({ runPlugin: prFail.fn }));
    expect(b).toMatchObject({ opened: false, reason: "pr-failed" });
    expect(b.line).toContain(`branch \`${fx2.branch}\` was pushed, but opening the PR failed`);
  });

  test("real SAFE-1 deny still applies when the caller allowlist is bypassed", async () => {
    const fx = makeFixture();
    writeFileSync(join(fx.wt, "greet.ts"), "x\n");
    // Caller claims all allowed, but the plugin call carries an empty allowlist.
    const r = await openWorkPr(
      input(fx),
      deps({
        runPlugin: (opts) => runPlugin({ ...opts, allowlist: [] }),
      }),
    );
    expect(r).toMatchObject({ opened: false, reason: "commit-failed" });
    expect(r.line).toContain("SAFE-1");
    expect(remoteRef(fx.bare, fx.branch)).toBeNull();
  });
});

describe("Discord spawn client passes verify facts through (REQ-discord-088)", () => {
  test("result frame → AgentSpawnResult.task", async () => {
    const dir = mkdtempSync(join(base, "bin-"));
    const bin = join(dir, "corvidinho");
    const result: TaskResult = {
      summary: "done",
      filesChanged: ["a.ts"],
      verified: true,
      verifySkipped: false,
      cancelled: false,
      state: "done",
      attempts: 1,
    };
    writeFileSync(
      bin,
      `#!/bin/sh\ncat <<'EOF'\n${serializeFrame(resultFrame(result))}\nEOF\n`,
      { mode: 0o755 },
    );
    chmodSync(bin, 0o755);
    const res = await createSpawnAgentClient({ bin, cwd: dir }).runChat({
      prompt: "x",
      sessionId: "s",
      cwd: dir,
    });
    expect(res.task).toEqual({ verified: true, verifySkipped: false, state: "done" });
  });
});

describe("/work reply carries the PR line (AUTONOMOUS-3)", () => {
  function ctxFor(
    store: SessionStore,
    agent: AgentClient,
    openPr?: SlashContext["openWorkPr"],
  ): SlashContext {
    const allow = emptyConfig();
    allow.discord.channels = ["chan-allowed"];
    return {
      store,
      workStore: new WorkStore(),
      allowlist: allow,
      agent,
      version: "0.0.0",
      protocolVersion: CORVIDINHO_PROTOCOL_VERSION,
      startedAt: Date.now(),
      channelIds: ["chan-allowed"],
      openWorkPr: openPr,
      owner: { discordId: "user-1" },
    };
  }

  function interaction(description: string) {
    const edits: SlashReplyPayload[] = [];
    return {
      edits,
      ix: {
        id: "ix",
        commandName: "work",
        channelId: "chan-allowed",
        userId: "user-1",
        options: { description },
        reply: async (p: SlashReplyPayload) => {
          edits.push(p);
        },
        deferReply: async () => {},
        editReply: async (p: SlashReplyPayload) => {
          edits.push(p);
        },
      },
    };
  }

  test("injected PR step gets run facts + active worktree; reply shows its line", async () => {
    const store = new SessionStore({
      defaultProjectRoot: mkdtempSync(join(base, "proj-")),
    });
    const agent: AgentClient = {
      runChat: async ({ sessionId }) => ({
        ok: true,
        sessionId,
        summary: "did it",
        exitCode: 0,
        task: { verified: true, verifySkipped: false, state: "done" },
      }),
    };
    const seen: OpenWorkPrInput[] = [];
    const openPr = async (i: OpenWorkPrInput): Promise<WorkPrOutcome> => {
      seen.push(i);
      return { opened: false, reason: "not-allowed", line: "PR: not opened — fixture" };
    };
    const { ix, edits } = interaction("Add greeting");
    await handleWorkCommand(ctxFor(store, agent, openPr), ix);
    expect(seen.length).toBe(1);
    expect(seen[0]!.run).toEqual({
      ok: true,
      exitCode: 0,
      task: { verified: true, verifySkipped: false, state: "done" },
    });
    expect(seen[0]!.description).toBe("Add greeting");
    expect(seen[0]!.worktreePath).toBeTruthy();
    const body = edits.at(-1)?.content ?? "";
    expect(body).toContain("PR: not opened — fixture");
    expect(body.indexOf("PR: not opened")).toBeLessThan(body.indexOf("did it"));
  });

  test("default PR step in a scoped (non-git) dir says so plainly", async () => {
    const store = new SessionStore({
      defaultProjectRoot: mkdtempSync(join(base, "proj-")),
    });
    const agent: AgentClient = {
      runChat: async ({ sessionId }) => ({ ok: true, sessionId, summary: "ok", exitCode: 0 }),
    };
    const { ix, edits } = interaction("Do a thing");
    await handleWorkCommand(ctxFor(store, agent), ix);
    expect(edits.at(-1)?.content ?? "").toContain(
      "PR: not opened — this work did not run in a git worktree.",
    );
  });

  test("ROLES-CHAT-3: a non-owner's /work never runs the PR step", async () => {
    const store = new SessionStore({
      defaultProjectRoot: mkdtempSync(join(base, "proj-")),
    });
    const agent: AgentClient = {
      runChat: async ({ sessionId }) => ({
        ok: true,
        sessionId,
        summary: "did it",
        exitCode: 0,
        task: { verified: true, verifySkipped: false, state: "done" },
      }),
    };
    let called = 0;
    const openPr = async (): Promise<WorkPrOutcome> => {
      called += 1;
      return { opened: false, reason: "not-allowed", line: "PR: fixture" };
    };
    const ctx = { ...ctxFor(store, agent, openPr), owner: { discordId: "someone-else" } };
    const { ix, edits } = interaction("Add greeting");
    await handleWorkCommand(ctx, ix);
    expect(called).toBe(0);
    expect(edits.at(-1)?.content ?? "").toContain("only the owner (ADMIN) can ship /work as a PR");
  });

  test("a throwing PR step never breaks the reply", async () => {
    const store = new SessionStore({
      defaultProjectRoot: mkdtempSync(join(base, "proj-")),
    });
    const agent: AgentClient = {
      runChat: async ({ sessionId }) => ({ ok: true, sessionId, summary: "ok", exitCode: 0 }),
    };
    const { ix, edits } = interaction("Do a thing");
    await handleWorkCommand(
      ctxFor(store, agent, async () => {
        throw new Error("boom");
      }),
      ix,
    );
    expect(edits.at(-1)?.content ?? "").toContain("PR: not opened — boom");
  });
});
