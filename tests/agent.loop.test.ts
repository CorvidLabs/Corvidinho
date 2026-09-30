import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createNdjsonParser,
  NDJSON_LIMITS,
  resultFrame,
  serializeFrame,
} from "../src/agent/events-ndjson.ts";
import { runTask } from "../src/agent/loop.ts";
import type { AgentEvent, VerifyRunner } from "../src/agent/types.ts";
import { startWorkspaceDiff, WORKSPACE_DIFF_MAX_FILES } from "../src/agent/workspace-diff.ts";
import { failingLaneLog, HELP_HEAD, LANE_FAILED_LINE } from "./fixtures/verify-lane-log.ts";

/** The model-facing verify feedback cap (`VERIFY_FEEDBACK_MAX_CHARS`, AGENT-4.a). */
const FEEDBACK_CAP = 4000;

function collect() {
  const events: AgentEvent[] = [];
  return {
    events,
    onEvent: (e: AgentEvent) => events.push(e),
    states: () =>
      events
        .filter((e): e is Extract<AgentEvent, { type: "StateChanged" }> => e.type === "StateChanged")
        .map((e) => e.state),
  };
}

describe("runTask prove-before-done", () => {
  test("verify pass → done verified=true", async () => {
    const c = collect();
    const verifyCalls: number[] = [];
    const verify: VerifyRunner = async () => {
      verifyCalls.push(1);
      return { success: true, output: "ok" };
    };
    const result = await runTask({
      cwd: "/tmp",
      maxRetries: 3,
      verifyRunner: verify,
      onEvent: c.onEvent,
      execute: async () => ({
        summary: "wrote stuff",
        filesChanged: ["src/a.ts"],
      }),
    });
    expect(result.verified).toBe(true);
    expect(result.verifySkipped).toBe(false);
    expect(result.state).toBe("done");
    expect(result.cancelled).toBe(false);
    expect(verifyCalls.length).toBe(1);
    expect(c.states()).toEqual(["planning", "executing", "verifying", "done"]);
  });

  test("verify fail then pass retries with feedback (AGENT-4.a)", async () => {
    const c = collect();
    let verifyN = 0;
    const feedbacks: (string | undefined)[] = [];
    const verify: VerifyRunner = async () => {
      verifyN += 1;
      if (verifyN === 1) return { success: false, output: "lint boom" };
      return { success: true, output: "ok" };
    };
    const result = await runTask({
      cwd: "/tmp",
      maxRetries: 3,
      verifyRunner: verify,
      onEvent: c.onEvent,
      execute: async ({ attempt, verifyFeedback }) => {
        feedbacks.push(verifyFeedback);
        return {
          summary: `attempt ${attempt}`,
          filesChanged: ["src/a.ts"],
        };
      },
    });
    expect(result.verified).toBe(true);
    expect(result.attempts).toBe(2);
    expect(feedbacks[0]).toBeUndefined();
    expect(feedbacks[1]).toContain("lint boom");
    expect(c.states()).toEqual([
      "planning",
      "executing",
      "verifying",
      "executing",
      "verifying",
      "done",
    ]);
  });

  test("a lane log whose passing steps fill the first 4000 chars still gives the retry the failing step's output (AGENT-4.a)", async () => {
    const { log } = failingLaneLog();
    let verifyN = 0;
    const feedbacks: (string | undefined)[] = [];
    const result = await runTask({
      cwd: "/tmp",
      maxRetries: 3,
      verifyRunner: async () => {
        verifyN += 1;
        return verifyN === 1 ? { success: false, output: log } : { success: true, output: "ok" };
      },
      execute: async ({ attempt, verifyFeedback }) => {
        feedbacks.push(verifyFeedback);
        return { summary: `attempt ${attempt}`, filesChanged: ["src/a.ts"] };
      },
    });
    expect(result.state).toBe("done");
    expect(result.verified).toBe(true);
    const fb = feedbacks[1] ?? "";
    expect(fb.startsWith("Verification failed. Fix these errors and try again:\n\n")).toBe(true);
    expect(fb.length).toBeLessThanOrEqual(FEEDBACK_CAP);
    expect(fb).toContain("Failing step: test (step 3 of lane 'verify')");
    expect(fb).toContain("error: expect(received).toBe(expected)");
    expect(fb).toContain("Expected: 7\nReceived: 6");
    expect(fb).toContain("(fail) sum of three");
    expect(fb).toContain(LANE_FAILED_LINE);
    expect(fb).not.toContain(HELP_HEAD);
  });

  test("a verify output within the cap reaches the retry whole (AGENT-4.a)", async () => {
    const output = "src/a.ts(3,5): error TS2322: Type 'string' is not assignable to type 'number'.";
    let verifyN = 0;
    const feedbacks: (string | undefined)[] = [];
    await runTask({
      cwd: "/tmp",
      maxRetries: 1,
      verifyRunner: async () => {
        verifyN += 1;
        return verifyN === 1 ? { success: false, output } : { success: true, output: "ok" };
      },
      execute: async ({ verifyFeedback }) => {
        feedbacks.push(verifyFeedback);
        return { summary: "x", filesChanged: ["src/a.ts"] };
      },
    });
    expect(feedbacks[1]).toBe(`Verification failed. Fix these errors and try again:\n\n${output}`);
  });

  test("exhausted retries → failed verified=false", async () => {
    const c = collect();
    const verify: VerifyRunner = async () => ({
      success: false,
      output: "always fail",
    });
    const result = await runTask({
      cwd: "/tmp",
      maxRetries: 1,
      verifyRunner: verify,
      onEvent: c.onEvent,
      execute: async () => ({
        summary: "work",
        filesChanged: ["x.ts"],
      }),
    });
    expect(result.verified).toBe(false);
    expect(result.verifySkipped).toBe(false);
    expect(result.state).toBe("failed");
    expect(result.attempts).toBe(2); // initial + 1 retry
    expect(result.summary).toContain("always fail");
    expect(c.states().at(-1)).toBe("failed");
  });

  test("a run that changed files is verified: there is no skip (AGENT-14, REQ-agent-003)", async () => {
    let called = 0;
    const verify: VerifyRunner = async () => {
      called += 1;
      return { success: false, output: "lint broke" };
    };
    const result = await runTask({
      cwd: "/tmp",
      maxRetries: 0,
      verifyRunner: verify,
      execute: async () => ({
        summary: "chat reply",
        filesChanged: ["anything.ts"],
      }),
    });
    expect(called).toBe(1);
    expect(result.verifySkipped).toBe(false);
    expect(result.verified).toBe(false);
    expect(result.state).toBe("failed");
  });

  test("a run that changed nothing ends done with one 'no changes, nothing to verify' note (REQ-agent-003)", async () => {
    let called = 0;
    const c = collect();
    const verify: VerifyRunner = async () => {
      called += 1;
      return { success: true, output: "ok" };
    };
    const result = await runTask({
      cwd: "/tmp",
      verifyRunner: verify,
      onEvent: c.onEvent,
      execute: async () => ({
        summary: "no edits",
        filesChanged: [],
      }),
    });
    expect(called).toBe(0);
    expect(result.verifySkipped).toBe(true);
    expect(result.state).toBe("done");
    const texts = c.events.filter((e) => e.type === "Text").map((e) => (e as { text: string }).text);
    expect(texts.filter((t) => t === "Verify gate: no changes, nothing to verify.")).toHaveLength(1);
  });

  test("failed verify then a retry that changes no files is never done (AGENT-4, REQ-agent-242)", async () => {
    const c = collect();
    let verifyN = 0;
    const verify: VerifyRunner = async () => {
      verifyN += 1;
      return { success: false, output: "app.ts: syntax error" };
    };
    const result = await runTask({
      cwd: "/tmp",
      maxRetries: 2,
      verifyRunner: verify,
      onEvent: c.onEvent,
      // Attempt 1 writes broken code; retries only answer in text.
      execute: async ({ attempt }) => ({
        summary: attempt === 1 ? "wrote app.ts" : "I couldn't fix it",
        filesChanged: attempt === 1 ? ["app.ts"] : [],
      }),
    });
    expect(result.state).toBe("failed");
    expect(result.verified).toBe(false);
    expect(result.verifySkipped).toBe(false);
    expect(result.filesChanged).toEqual(["app.ts"]);
    expect(result.attempts).toBe(3);
    expect(verifyN).toBe(3);
    expect(c.states()).not.toContain("done");
  });

  test("files changed across attempts are reported as a union (REQ-agent-242)", async () => {
    let verifyN = 0;
    const verify: VerifyRunner = async () => {
      verifyN += 1;
      return verifyN === 1
        ? { success: false, output: "boom" }
        : { success: true, output: "ok" };
    };
    const result = await runTask({
      cwd: "/tmp",
      maxRetries: 3,
      verifyRunner: verify,
      execute: async ({ attempt }) => ({
        summary: `attempt ${attempt}`,
        filesChanged: attempt === 1 ? ["a.ts", "b.ts"] : ["b.ts", "c.ts"],
      }),
    });
    expect(result.state).toBe("done");
    expect(result.verified).toBe(true);
    expect(result.filesChanged).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  test("execute error (provider failure) → failed, not done (AGENT-4/8, REQ-agent-242)", async () => {
    const c = collect();
    let verifyN = 0;
    const result = await runTask({
      cwd: "/tmp",
      maxRetries: 3,
      verifyRunner: async () => {
        verifyN += 1;
        return { success: true, output: "ok" };
      },
      onEvent: c.onEvent,
      execute: async () => ({
        summary: "LLM HTTP 401: bad key",
        filesChanged: [],
        error: true,
      }),
    });
    expect(result.state).toBe("failed");
    expect(result.verified).toBe(false);
    expect(result.cancelled).toBe(false);
    expect(result.attempts).toBe(1);
    expect(result.summary).toContain("LLM HTTP 401");
    // No verify ran, so none is claimed to have failed.
    expect(result.summary).not.toContain("Verification failed");
    expect(verifyN).toBe(0);
    expect(c.states()).toEqual(["planning", "executing", "failed"]);
  });

  test("execute error on a retry after a failed verify → failed (REQ-agent-242)", async () => {
    let verifyN = 0;
    const result = await runTask({
      cwd: "/tmp",
      maxRetries: 3,
      verifyRunner: async () => {
        verifyN += 1;
        return { success: false, output: "broken" };
      },
      execute: async ({ attempt }) =>
        attempt === 1
          ? { summary: "wrote app.ts", filesChanged: ["app.ts"] }
          : {
              summary: "LLM HTTP 503: upstream overloaded",
              filesChanged: [],
              error: true,
            },
    });
    expect(result.state).toBe("failed");
    expect(result.verified).toBe(false);
    expect(result.filesChanged).toEqual(["app.ts"]);
    expect(result.attempts).toBe(2);
    expect(result.summary).toContain("LLM HTTP 503");
    expect(verifyN).toBe(1);
  });

  test("execute error after a failed verify still says plainly that verification failed (AGENT-4, REQ-agent-242)", async () => {
    const c = collect();
    const result = await runTask({
      cwd: "/tmp",
      maxRetries: 3,
      verifyRunner: async () => ({ success: false, output: "app.ts:3 syntax error" }),
      onEvent: c.onEvent,
      execute: async ({ attempt }) =>
        attempt === 1
          ? { summary: "wrote app.ts", filesChanged: ["app.ts"] }
          : {
              summary: "LLM HTTP 503: upstream overloaded",
              filesChanged: [],
              error: true,
            },
    });
    expect(result.state).toBe("failed");
    expect(result.verified).toBe(false);
    expect(result.summary.startsWith("LLM HTTP 503: upstream overloaded")).toBe(true);
    expect(result.summary).toContain(
      "Verification failed on an earlier attempt and was not re-run:\napp.ts:3 syntax error",
    );
    expect(c.states()).toEqual([
      "planning",
      "executing",
      "verifying",
      "executing",
      "failed",
    ]);
  });

  test("execute error with no files changed is still failed (REQ-agent-242)", async () => {
    const result = await runTask({
      cwd: "/tmp",
      verifyRunner: async () => ({ success: true, output: "ok" }),
      execute: async () => ({
        summary: "LLM request failed: network down",
        filesChanged: [],
        error: true,
      }),
    });
    expect(result.state).toBe("failed");
    expect(result.verified).toBe(false);
  });

  test("AbortSignal cancels promptly (AGENT-3)", async () => {
    const ac = new AbortController();
    ac.abort();
    const result = await runTask({
      cwd: "/tmp",
      signal: ac.signal,
      verifyRunner: async () => ({ success: true, output: "ok" }),
      execute: async () => ({
        summary: "never",
        filesChanged: ["x.ts"],
      }),
    });
    expect(result.cancelled).toBe(true);
    expect(result.verified).toBe(false);
    expect(result.state).toBe("failed");
  });

  test("abort while verify runs → cancelled, not a failed verify or stuck ask (AGENT-3)", async () => {
    // The runner returns (a killed lane exits non-zero) rather than throwing.
    const ac = new AbortController();
    const c = collect();
    let executeCalls = 0;
    const result = await runTask({
      cwd: "/tmp",
      maxRetries: 0,
      signal: ac.signal,
      onEvent: c.onEvent,
      verifyRunner: async () => {
        ac.abort();
        return { success: false, output: "killed by SIGTERM" };
      },
      execute: async () => {
        executeCalls += 1;
        return { summary: "wrote", filesChanged: ["x.ts"] };
      },
    });
    expect(result.cancelled).toBe(true);
    expect(result.verified).toBe(false);
    expect(result.state).toBe("failed");
    expect(result.ask).toBeUndefined();
    expect(executeCalls).toBe(1);
    expect(c.events.some((e) => e.type === "VerifyResult")).toBe(false);
  });

  test("defaultVerifyRunner argv shape (FLEDGE-2/3 agree)", async () => {
    const { VERIFY_ARGS } = await import("../src/agent/verify.ts");
    expect([...VERIFY_ARGS]).toEqual([
      "lanes",
      "run",
      "verify",
      "--non-interactive",
    ]);
  });
});

describe("runTask SpecSync Planning briefing", () => {
  const root = import.meta.dir + "/..";

  test("task mentioning agent emits Spec briefing Text", async () => {
    const c = collect();
    const result = await runTask({
      cwd: root,
      task: "Improve the agent prove-before-done loop",
      // Never the repo's own snapshot or lane from inside its test run.
      workspaceDiff: async () => ({ changed: async () => [] }),
      verifyRunner: async () => ({ success: true, output: "ok" }),
      onEvent: c.onEvent,
      execute: async () => ({
        summary: "noop",
        filesChanged: [],
      }),
    });
    expect(result.state).toBe("done");
    const texts = c.events
      .filter((e): e is Extract<AgentEvent, { type: "Text" }> => e.type === "Text")
      .map((e) => e.text)
      .join("\n");
    expect(texts).toContain("# Spec: agent");
    expect(texts).toContain("Planning: SpecSync briefing");
  });

  test("fledge.toml verify lane includes spec-check", async () => {
    const toml = await Bun.file(`${root}/fledge.toml`).text();
    expect(toml).toMatch(/\[lanes\.verify\][\s\S]*spec-check/);
  });
});

describe("runTask verify gate uses the real git working-tree diff (AGENT-4, REQ-agent-085)", () => {
  const base = mkdtempSync(join(tmpdir(), "corvidinho-real-diff-"));
  afterAll(() => rmSync(base, { recursive: true, force: true }));

  /** Test-side git (setup / assertions), repo-locating env stripped. */
  function g(cwd: string, ...args: string[]): string {
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v === undefined || k.startsWith("GIT_")) continue;
      env[k] = v;
    }
    const r = Bun.spawnSync(["git", ...args], { cwd, env, stdout: "pipe", stderr: "pipe" });
    if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString()}`);
    return r.stdout.toString();
  }

  /** Temp repo with app.ts committed (and nothing else unless `commit` is false). */
  function makeRepo(commit = true): string {
    const dir = mkdtempSync(join(base, "repo-"));
    g(dir, "init", "-q", "-b", "main");
    g(dir, "config", "user.name", "Fixture Bot");
    g(dir, "config", "user.email", "fixture@example.invalid");
    g(dir, "config", "commit.gpgsign", "false");
    writeFileSync(join(dir, ".gitignore"), "dist/\n");
    writeFileSync(join(dir, "app.ts"), "export const x = 1;\n");
    if (commit) {
      g(dir, "add", ".gitignore", "app.ts");
      g(dir, "commit", "-q", "-m", "init");
    }
    return dir;
  }

  function counter(outcomes: boolean[] = [false]) {
    const calls: string[] = [];
    const runner: VerifyRunner = async (cwd) => {
      calls.push(cwd);
      const ok = outcomes[Math.min(calls.length - 1, outcomes.length - 1)]!;
      return { success: ok, output: ok ? "ok" : "app.ts: syntax error" };
    };
    return { calls, runner };
  }

  test("an edit made outside file tools (shell-exec) that reports no filesChanged is still verified", async () => {
    const dir = makeRepo();
    const v = counter([false]);
    const c = collect();
    const result = await runTask({
      cwd: dir,
      maxRetries: 1,
      verifyRunner: v.runner,
      onEvent: c.onEvent,
      // What a shell-exec `echo 'export const x = ;' > app.ts` does: no filesChanged.
      execute: async () => {
        writeFileSync(join(dir, "app.ts"), "export const x = ;\n");
        return { summary: "fixed it", filesChanged: [] };
      },
    });
    expect(result.state).toBe("failed");
    expect(result.verified).toBe(false);
    expect(result.verifySkipped).toBe(false);
    expect(v.calls.length).toBe(2);
    expect(result.filesChanged).toEqual(["app.ts"]);
    expect(result.summary).toContain("Verification failed after 1 retries");
    expect(c.states()).not.toContain("done");
    const texts = c.events.filter((e) => e.type === "Text").map((e) => (e as { text: string }).text);
    expect(texts.some((t) => t.includes("no tool reported (app.ts)"))).toBe(true);
  });

  test("the same unreported edit ends done verified=true only when verify passes", async () => {
    const dir = makeRepo();
    const v = counter([true]);
    const result = await runTask({
      cwd: dir,
      maxRetries: 1,
      verifyRunner: v.runner,
      execute: async () => {
        writeFileSync(join(dir, "app.ts"), "export const x = 2;\n");
        return { summary: "changed x", filesChanged: [] };
      },
    });
    expect(result.state).toBe("done");
    expect(result.verified).toBe(true);
    expect(result.verifySkipped).toBe(false);
    expect(v.calls).toEqual([dir]);
    expect(result.filesChanged).toEqual(["app.ts"]);
  });

  test("a new untracked file and a deleted tracked file are detected", async () => {
    const dir = makeRepo();
    const v = counter([true]);
    const result = await runTask({
      cwd: dir,
      verifyRunner: v.runner,
      execute: async () => {
        mkdirSync(join(dir, "src"));
        writeFileSync(join(dir, "src", "new.ts"), "export {};\n");
        unlinkSync(join(dir, "app.ts"));
        return { summary: "moved things", filesChanged: [] };
      },
    });
    expect(v.calls.length).toBe(1);
    expect(result.verified).toBe(true);
    expect(result.filesChanged).toEqual(["app.ts", "src/new.ts"]);
  });

  test("an edit to a file already dirty before the run is detected (status unchanged, content changed)", async () => {
    const dir = makeRepo();
    writeFileSync(join(dir, "app.ts"), "export const x = 3;\n");
    writeFileSync(join(dir, "scratch.txt"), "operator notes\n");
    expect(g(dir, "status", "--porcelain")).toContain(" M app.ts");
    const v = counter([true]);
    const result = await runTask({
      cwd: dir,
      verifyRunner: v.runner,
      // Same length, same ` M` status: only the content differs.
      execute: async () => {
        writeFileSync(join(dir, "app.ts"), "export const x = ;;\n");
        return { summary: "edited", filesChanged: [] };
      },
    });
    expect(g(dir, "status", "--porcelain")).toContain(" M app.ts");
    expect(v.calls.length).toBe(1);
    expect(result.filesChanged).toEqual(["app.ts"]);
  });

  test("a commit made through a shell (HEAD moved, clean tree) is detected", async () => {
    const dir = makeRepo();
    const v = counter([true]);
    const result = await runTask({
      cwd: dir,
      verifyRunner: v.runner,
      execute: async () => {
        writeFileSync(join(dir, "app.ts"), "export const x = ;\n");
        g(dir, "commit", "-q", "-am", "broken");
        return { summary: "committed", filesChanged: [] };
      },
    });
    expect(g(dir, "status", "--porcelain")).toBe("");
    expect(v.calls.length).toBe(1);
    expect(result.filesChanged).toEqual(["app.ts"]);
  });

  test("the first commit on an unborn HEAD is detected", async () => {
    const dir = makeRepo(false);
    g(dir, "add", ".gitignore", "app.ts");
    const v = counter([true]);
    const result = await runTask({
      cwd: dir,
      verifyRunner: v.runner,
      execute: async () => {
        g(dir, "commit", "-q", "-m", "first");
        return { summary: "committed", filesChanged: [] };
      },
    });
    expect(v.calls.length).toBe(1);
    expect(result.filesChanged).toEqual([".gitignore", "app.ts"]);
  });

  test("a retry after a failed verify that edits via shell is verified again (AGENT-4.a)", async () => {
    const dir = makeRepo();
    const v = counter([false, true]);
    const feedbacks: (string | undefined)[] = [];
    const result = await runTask({
      cwd: dir,
      maxRetries: 2,
      verifyRunner: v.runner,
      execute: async ({ attempt, verifyFeedback }) => {
        feedbacks.push(verifyFeedback);
        writeFileSync(join(dir, "app.ts"), attempt === 1 ? "export const x = ;\n" : "export const x = 4;\n");
        return { summary: `attempt ${attempt}`, filesChanged: [] };
      },
    });
    expect(v.calls.length).toBe(2);
    expect(result.attempts).toBe(2);
    expect(result.state).toBe("done");
    expect(result.verified).toBe(true);
    expect(feedbacks[1]).toContain("app.ts: syntax error");
  });

  test("an edit in the run's subdirectory of a repo is detected, relative to the cwd", async () => {
    const dir = makeRepo();
    const sub = join(dir, "pkg");
    mkdirSync(sub);
    writeFileSync(join(sub, "lib.ts"), "export const y = 1;\n");
    g(dir, "add", "pkg/lib.ts");
    g(dir, "commit", "-q", "-m", "pkg");
    const v = counter([true]);
    const result = await runTask({
      cwd: sub,
      verifyRunner: v.runner,
      execute: async () => {
        writeFileSync(join(sub, "lib.ts"), "export const y = ;\n");
        // Outside the run's cwd: not this run's change.
        writeFileSync(join(dir, "app.ts"), "export const x = 9;\n");
        return { summary: "edited", filesChanged: [] };
      },
    });
    expect(v.calls).toEqual([sub]);
    expect(result.filesChanged).toEqual(["lib.ts"]);
  });

  test("dirt present before the run and left untouched does not trigger verify", async () => {
    const dir = makeRepo();
    writeFileSync(join(dir, "app.ts"), "export const x = 5;\n");
    writeFileSync(join(dir, "notes.md"), "wip\n");
    const v = counter([true]);
    const result = await runTask({
      cwd: dir,
      verifyRunner: v.runner,
      execute: async () => ({ summary: "just answered", filesChanged: [] }),
    });
    expect(v.calls.length).toBe(0);
    expect(result.state).toBe("done");
    expect(result.verified).toBe(false);
    expect(result.verifySkipped).toBe(true);
    expect(result.filesChanged).toEqual([]);
  });

  test("a change only under a gitignored path does not trigger verify", async () => {
    const dir = makeRepo();
    const v = counter([true]);
    const result = await runTask({
      cwd: dir,
      verifyRunner: v.runner,
      execute: async () => {
        mkdirSync(join(dir, "dist"));
        writeFileSync(join(dir, "dist", "out.js"), "1\n");
        return { summary: "built", filesChanged: [] };
      },
    });
    expect(v.calls.length).toBe(0);
    expect(result.verifySkipped).toBe(true);
  });

  test("a non-git cwd falls back to tool-reported filesChanged", async () => {
    const dir = mkdtempSync(join(base, "plain-"));
    const v = counter([true]);
    const result = await runTask({
      cwd: dir,
      verifyRunner: v.runner,
      execute: async () => {
        writeFileSync(join(dir, "app.ts"), "export const x = ;\n");
        return { summary: "wrote", filesChanged: [] };
      },
    });
    expect(v.calls.length).toBe(0);
    expect(result.verifySkipped).toBe(true);
  });

  test("a diff git cannot read after a good snapshot fails closed: verify runs", async () => {
    const v = counter([true]);
    const c = collect();
    const result = await runTask({
      cwd: "/tmp",
      verifyRunner: v.runner,
      onEvent: c.onEvent,
      workspaceDiff: async () => ({ changed: async () => null }),
      execute: async () => ({ summary: "answered", filesChanged: [] }),
    });
    expect(v.calls.length).toBe(1);
    expect(result.verified).toBe(true);
    expect(result.verifySkipped).toBe(false);
    const texts = c.events.filter((e) => e.type === "Text").map((e) => (e as { text: string }).text);
    expect(texts).toContain("Verify gate: could not read the git working-tree diff, so verifying anyway.");
  });

  test("a huge real diff adds at most WORKSPACE_DIFF_MAX_FILES paths, so the streamed NDJSON result still says verification failed", async () => {
    // An install or branch switch through a shell: tens of thousands of paths.
    const huge = Array.from(
      { length: 30_000 },
      (_, i) => `node_modules/@scope/package-${i % 900}/dist/esm/file-${i}.js`,
    );
    const v = counter([false]);
    const c = collect();
    const result = await runTask({
      cwd: "/tmp",
      maxRetries: 1,
      verifyRunner: v.runner,
      onEvent: c.onEvent,
      workspaceDiff: async () => ({ changed: async () => ["package.json", ...huge] }),
      execute: async () => ({ summary: "installed", filesChanged: ["package.json"] }),
    });
    expect(v.calls.length).toBe(2);
    expect(result.state).toBe("failed");
    expect(result.filesChanged.length).toBe(WORKSPACE_DIFF_MAX_FILES);
    expect(result.filesChanged.slice(0, 2)).toEqual(["package.json", huge[0]!]);
    const texts = c.events.filter((e) => e.type === "Text").map((e) => (e as { text: string }).text);
    expect(
      texts.some((t) =>
        t.includes(`30000 changed path(s) no tool reported`) &&
        t.includes(`${WORKSPACE_DIFF_MAX_FILES} of the 30001 changed path(s) listed in filesChanged`),
      ),
    ).toBe(true);
    // A bridge reads the child's stdout in chunks: the result line must parse.
    const line = `${serializeFrame(resultFrame(result))}\n`;
    expect(line.length).toBeLessThan(NDJSON_LIMITS.maxLine);
    const parser = createNdjsonParser({ protocol: 2 });
    const frames = [];
    for (let i = 0; i < line.length; i += 65_536) frames.push(...parser.push(line.slice(i, i + 65_536)));
    frames.push(...parser.end());
    const last = frames.at(-1)?.frame;
    expect(last?.type).toBe("result");
    expect(last?.type === "result" ? last.result.summary : "").toContain("Verification failed after 1 retries");
  });

  test("an already-dirty file past the hash budget is compared by stat: untouched is quiet, edited is caught", async () => {
    const dir = makeRepo();
    writeFileSync(join(dir, "app.ts"), "export const x = 6;\n");
    writeFileSync(join(dir, "notes.md"), "wip\n");
    const tracker = await startWorkspaceDiff(dir, { hashBudgetBytes: 0 });
    expect(tracker).not.toBeNull();
    expect(await tracker!.changed()).toEqual([]);
    writeFileSync(join(dir, "app.ts"), "export const x = 7;\n");
    expect(await tracker!.changed()).toEqual(["app.ts"]);
  });

  test("the snapshot is always taken and a real change always verifies (AGENT-14)", async () => {
    let starts = 0;
    const v = counter([true]);
    const result = await runTask({
      cwd: "/tmp",
      verifyRunner: v.runner,
      workspaceDiff: async () => {
        starts += 1;
        return { changed: async () => ["app.ts"] };
      },
      execute: async () => ({ summary: "wrote", filesChanged: [] }),
    });
    expect(starts).toBe(1);
    expect(v.calls.length).toBe(1);
    expect(result.verified).toBe(true);
    expect(result.verifySkipped).toBe(false);
    expect(result.filesChanged).toEqual(["app.ts"]);
  });
});
