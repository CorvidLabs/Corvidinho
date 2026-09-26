/**
 * Always verify (AGENT-4 / AGENT-4.a / FLEDGE-2, #85): bridges never pass
 * --no-verify, a real worktree change triggers the verify lane even when no
 * tool reported it, and every result says plainly how verification went.
 * Temp git repos only (no network, no real tokens, no repo worktrees).
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTask } from "../src/agent/loop.ts";
import type { AgentEvent, VerifyRunner } from "../src/agent/types.ts";
import {
  describeFailedRun,
  NO_CHANGES_NOTE,
  verificationNote,
  withVerificationNote,
} from "../src/agent/verify-report.ts";
import {
  createGitWorkspaceProbe,
  gitWorkspaceProbe,
  parsePorcelainZ,
  snapshotWorkspace,
  workspaceChangedSince,
  type WorkspaceProbe,
  type WorkspaceSnapshot,
} from "../src/agent/workspace-delta.ts";
import { emptyConfig } from "../src/allowlist/types.ts";
import { createSpawnAgentClient as createDiscordClient } from "../src/discord/agent-client.ts";
import { ScheduleStore } from "../src/scheduler/store.ts";
import { SchedulerService } from "../src/scheduler/service.ts";
import { createSpawnAgentClient as createWatchClient } from "../src/watch/agent-client.ts";

const GIT_ENV_KEYS = ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"];

function gitEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const k of GIT_ENV_KEYS) delete env[k];
  return env;
}

function git(cwd: string, ...args: string[]): string {
  const r = Bun.spawnSync(
    [
      "git",
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "core.hooksPath=/dev/null",
      ...args,
    ],
    { cwd, env: gitEnv(), stdout: "pipe", stderr: "pipe" },
  );
  if (r.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")}: ${r.stderr.toString()}`);
  }
  return r.stdout.toString();
}

let dir = "";

function initRepo(): string {
  git(dir, "init", "-q", "-b", "main");
  writeFileSync(join(dir, "a.ts"), "export const a = 1;\n");
  git(dir, "add", "a.ts");
  git(dir, "commit", "-q", "-m", "init");
  return dir;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "corvidinho-verify-gate-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function passVerify(calls: string[]): VerifyRunner {
  return async (cwd) => {
    calls.push(cwd);
    return { success: true, output: "ok" };
  };
}

function fakeProbe(delta: string[]): WorkspaceProbe {
  const snap: WorkspaceSnapshot = { root: "/fake", head: null, entries: new Map() };
  return {
    snapshot: async () => snap,
    changedSince: async () => delta,
  };
}

describe("workspace delta probe (real worktree, #85)", () => {
  test("outside a git worktree the probe returns null (tool reports only)", async () => {
    expect(await snapshotWorkspace(dir)).toBeNull();
  });

  test("clean run → no delta", async () => {
    initRepo();
    const before = await snapshotWorkspace(dir);
    expect(before).not.toBeNull();
    expect(await workspaceChangedSince(before!)).toEqual([]);
  });

  test("untracked new file and tracked edit are listed", async () => {
    initRepo();
    const before = await snapshotWorkspace(dir);
    writeFileSync(join(dir, "a.ts"), "export const a = 2;\n");
    writeFileSync(join(dir, "b.ts"), "export const b = 1;\n");
    expect(await workspaceChangedSince(before!)).toEqual(["a.ts", "b.ts"]);
  });

  test("editing a file that was already dirty is still a change", async () => {
    initRepo();
    writeFileSync(join(dir, "a.ts"), "export const a = 'dirty';\n");
    const before = await snapshotWorkspace(dir);
    // Same porcelain status (" M a.ts") before and after — only content differs.
    writeFileSync(join(dir, "a.ts"), "export const a = 'agent edit';\n");
    expect(await workspaceChangedSince(before!)).toEqual(["a.ts"]);
  });

  test("committed work (clean status, HEAD moved) is a change", async () => {
    initRepo();
    const before = await snapshotWorkspace(dir);
    writeFileSync(join(dir, "c.ts"), "export const c = 1;\n");
    git(dir, "add", "c.ts");
    git(dir, "commit", "-q", "-m", "agent commit");
    expect(git(dir, "status", "--porcelain")).toBe("");
    expect(await workspaceChangedSince(before!)).toEqual(["c.ts"]);
  });

  test("a subdirectory cwd resolves to the worktree root", async () => {
    initRepo();
    const sub = join(dir, "sub");
    Bun.spawnSync(["mkdir", "-p", sub]);
    const before = await snapshotWorkspace(sub);
    expect(before?.root).toBeTruthy();
    writeFileSync(join(sub, "d.ts"), "x\n");
    expect(await workspaceChangedSince(before!)).toEqual(["sub/d.ts"]);
  });

  test("GIT_DIR in the parent env (e.g. a git hook) does not redirect the probe", async () => {
    initRepo();
    const saved = process.env.GIT_DIR;
    process.env.GIT_DIR = join(tmpdir(), "definitely-not-a-repo.git");
    try {
      const before = await snapshotWorkspace(dir);
      expect(before).not.toBeNull();
      writeFileSync(join(dir, "e.ts"), "x\n");
      expect(await workspaceChangedSince(before!)).toEqual(["e.ts"]);
    } finally {
      if (saved === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = saved;
    }
  });

  test("porcelain -z parse keeps both sides of a rename", () => {
    const out = "R  new.ts\0old.ts\0?? add.ts\0 M mod.ts\0";
    expect(parsePorcelainZ(out)).toEqual([
      { xy: "R ", path: "new.ts" },
      { xy: "R ", path: "old.ts" },
      { xy: "??", path: "add.ts" },
      { xy: " M", path: "mod.ts" },
    ]);
  });

  test("git runner failure degrades to no snapshot", async () => {
    const probe = createGitWorkspaceProbe(async () => ({ code: 128, stdout: "" }));
    expect(await probe.snapshot(dir)).toBeNull();
  });
});

describe("runTask gate uses the real worktree (AGENT-4 / FLEDGE-2)", () => {
  test("untracked edit no tool reported still runs the verify lane", async () => {
    initRepo();
    const calls: string[] = [];
    const events: AgentEvent[] = [];
    const result = await runTask({
      cwd: dir,
      verifyBeforeComplete: true,
      maxRetries: 0,
      verifyRunner: passVerify(calls),
      onEvent: (e) => events.push(e),
      execute: async () => {
        // e.g. shell-exec: writes a file but reports no filesChanged.
        writeFileSync(join(dir, "hidden.ts"), "export {};\n");
        return { summary: "fixed it", filesChanged: [] };
      },
    });
    expect(calls).toEqual([dir]);
    expect(result.verified).toBe(true);
    expect(result.verifySkipped).toBe(false);
    expect(result.summary.split("\n")[0]).toBe(verificationNote({ kind: "passed" }));
    expect(result.summary).toContain("fixed it");
    const texts = events
      .filter((e): e is Extract<AgentEvent, { type: "Text" }> => e.type === "Text")
      .map((e) => e.text);
    expect(texts.some((t) => t.includes("Worktree changed (1 path(s))"))).toBe(true);
  });

  test("chat-only run (no tool report, clean worktree) skips the lane and says so", async () => {
    initRepo();
    const calls: string[] = [];
    const result = await runTask({
      cwd: dir,
      verifyBeforeComplete: true,
      verifyRunner: passVerify(calls),
      execute: async () => ({ summary: "Here is the answer.", filesChanged: [] }),
    });
    expect(calls).toEqual([]);
    expect(result.state).toBe("done");
    expect(result.verified).toBe(false);
    expect(result.verifySkipped).toBe(true);
    expect(result.summary).toBe(`Here is the answer.\n\n${NO_CHANGES_NOTE}`);
  });

  test("tool-reported change verifies even when the probe sees nothing", async () => {
    const calls: string[] = [];
    const result = await runTask({
      cwd: "/tmp",
      verifyBeforeComplete: true,
      verifyRunner: passVerify(calls),
      workspaceProbe: fakeProbe([]),
      execute: async () => ({ summary: "edit", filesChanged: ["src/a.ts"] }),
    });
    expect(calls.length).toBe(1);
    expect(result.verified).toBe(true);
  });

  test("fake probe delta alone triggers verify; retries get the failure output (AGENT-4.a)", async () => {
    let n = 0;
    const feedback: (string | undefined)[] = [];
    const result = await runTask({
      cwd: "/tmp",
      verifyBeforeComplete: true,
      maxRetries: 2,
      workspaceProbe: fakeProbe(["x.ts"]),
      verifyRunner: async () => {
        n += 1;
        return n === 1
          ? { success: false, output: "tsc: boom" }
          : { success: true, output: "ok" };
      },
      execute: async ({ verifyFeedback }) => {
        feedback.push(verifyFeedback);
        return { summary: "work", filesChanged: [] };
      },
    });
    expect(result.verified).toBe(true);
    expect(result.attempts).toBe(2);
    expect(feedback[1]).toContain("tsc: boom");
  });

  test("exhausted retries → summary leads with a plain FAILED line", async () => {
    const result = await runTask({
      cwd: "/tmp",
      verifyBeforeComplete: true,
      maxRetries: 1,
      workspaceProbe: null,
      verifyRunner: async () => ({ success: false, output: "tests failed: 2" }),
      execute: async () => ({ summary: "work", filesChanged: ["x.ts"] }),
    });
    expect(result.state).toBe("failed");
    expect(result.summary.split("\n")[0]).toBe(
      "Verification FAILED: the project verify lane did not pass after 1 retry — not done.",
    );
    expect(result.summary).toContain("tests failed: 2");
  });

  test("gate off with a change says NOT verified (never a silent done)", async () => {
    let called = 0;
    const result = await runTask({
      cwd: "/tmp",
      verifyBeforeComplete: false,
      workspaceProbe: fakeProbe(["x.ts"]),
      verifyRunner: async () => {
        called += 1;
        return { success: true, output: "" };
      },
      execute: async () => ({ summary: "did it", filesChanged: [] }),
    });
    expect(called).toBe(0);
    expect(result.verifySkipped).toBe(true);
    expect(result.summary.startsWith("NOT verified:")).toBe(true);
    expect(result.summary).toContain("did it");
  });

  test("a throwing probe falls back to tool reports only", async () => {
    const broken: WorkspaceProbe = {
      snapshot: async () => {
        throw new Error("boom");
      },
      changedSince: async () => {
        throw new Error("boom");
      },
    };
    const calls: string[] = [];
    const result = await runTask({
      cwd: "/tmp",
      verifyBeforeComplete: true,
      verifyRunner: passVerify(calls),
      workspaceProbe: broken,
      execute: async () => ({ summary: "chat", filesChanged: [] }),
    });
    expect(calls).toEqual([]);
    expect(result.state).toBe("done");
  });

  test("default probe is the git probe", () => {
    expect(typeof gitWorkspaceProbe.snapshot).toBe("function");
    expect(typeof gitWorkspaceProbe.changedSince).toBe("function");
  });
});

describe("plain verification text (AGENT-4)", () => {
  test("notes for each outcome", () => {
    expect(verificationNote({ kind: "passed" })).toStartWith("Verified:");
    expect(verificationNote({ kind: "failed", retries: 3 })).toBe(
      "Verification FAILED: the project verify lane did not pass after 3 retries — not done.",
    );
    expect(verificationNote({ kind: "gate-off" })).toStartWith("NOT verified:");
    expect(verificationNote({ kind: "no-changes" })).toBe(NO_CHANGES_NOTE);
    expect(withVerificationNote("", { kind: "passed" })).toBe(
      verificationNote({ kind: "passed" }),
    );
  });

  test("describeFailedRun surfaces the verification failure plainly", () => {
    const summary =
      "state=failed verified=false attempts=4\n" +
      `${verificationNote({ kind: "failed", retries: 3 })}\n\nwork\n\nVerification failed after 3 retries:\nlane output`;
    expect(describeFailedRun({ exitCode: 1, summary })).toBe(
      `failed (exit 1)\n${verificationNote({ kind: "failed", retries: 3 })}`,
    );
  });

  test("describeFailedRun without a verification line stays the exit code only", () => {
    expect(describeFailedRun({ exitCode: 2, summary: "crash trace" })).toBe(
      "failed (exit 2)",
    );
    // Near-miss text (e.g. model-written) is not echoed.
    expect(
      describeFailedRun({
        exitCode: 1,
        summary: "Verification FAILED: the project verify lane did not pass after 3 retries — not done. token=abc",
      }),
    ).toBe("failed (exit 1)");
  });
});

describe("bridges never pass --no-verify (FLEDGE-2)", () => {
  let bin = "";
  beforeEach(() => {
    bin = join(dir, "fake-cli.ts");
    writeFileSync(bin, "console.log(`argv=${JSON.stringify(process.argv.slice(2))}`);\n");
  });

  test("Discord spawn argv has the verify gate on", async () => {
    const client = createDiscordClient({ bin, cwd: dir });
    const r = await client.runChat({ prompt: "fix the bug", sessionId: "s1" });
    expect(r.summary).toContain('argv=["task","run","--task","fix the bug","--output","ndjson"]');
    expect(r.summary).not.toContain("--no-verify");
  });

  test("WATCH spawn argv has the verify gate on", async () => {
    const client = createWatchClient({ bin, cwd: dir });
    const r = await client.runChat({ prompt: "review this", sessionId: "w1" });
    expect(r.summary).toContain('argv=["task","run","--task","review this","--output","ndjson"]');
    expect(r.summary).not.toContain("--no-verify");
  });
});

describe("schedule reply says verification failed plainly", () => {
  test("failed run posts the FAILED line, not only the exit code", async () => {
    const store = new ScheduleStore();
    const posts: Array<{ channelId: string; content: string }> = [];
    const failedLine = verificationNote({ kind: "failed", retries: 3 });
    const agent = {
      runChat: async () => ({
        ok: false as const,
        sessionId: "schedule_x",
        exitCode: 1,
        summary: `state=failed verified=false attempts=4\n${failedLine}\n\nwork`,
      }),
    };
    const past = Date.now() - 1000;
    const s = store.create({
      name: "Nightly",
      cronExpression: "0 * * * *",
      project: "p",
      prompt: "x",
      createdByUserId: "a",
      channelId: "chan-allowed",
      now: past - 3_600_000,
    });
    s.nextRunAt = past;
    const cfg = emptyConfig();
    cfg.discord.channels = ["chan-allowed"];
    const svc = new SchedulerService({
      store,
      agent: agent as never,
      allowlist: cfg,
      manual: true,
      useWorktrees: false,
      outbound: {
        post: async (p) => {
          posts.push(p);
        },
      },
    });
    await svc.tick();
    await new Promise((r) => setTimeout(r, 50));
    expect(posts.length).toBe(1);
    expect(posts[0]?.content).toContain(`failed (exit 1)\n${failedLine}`);
    svc.stop();
  });
});
