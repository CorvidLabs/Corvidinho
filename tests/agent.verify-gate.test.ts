/**
 * The verify gate can't be skipped, and the real diff since the talk started
 * decides what changed (AGENT-14, AGENT-15, AGENT-15.a; REQ-agent-003,
 * REQ-agent-085, REQ-agent-015, REQ-cli-085).
 *
 * - A project `fledge.toml` with `verify_before_complete = false` no longer
 *   turns the gate off (runTask and the real CLI).
 * - In a talk worktree, a run that follows one that ended blocked, failed or
 *   cancelled (or a process that died mid-run) verifies every edit since the
 *   talk started, including the ones the earlier run left; a run after a
 *   verified `done` starts from its own snapshot. The caller's own checkout
 *   keeps the run-start baseline.
 * - A path a tool claims but git does not show is not listed in
 *   `filesChanged`, yet the lane still runs.
 */
import { afterAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTask } from "../src/agent/loop.ts";
import type { AgentEvent, ExecuteFn, TaskResult, VerifyRunner } from "../src/agent/types.ts";
import { startWorkspaceDiff } from "../src/agent/workspace-diff.ts";
import {
  settleTalkVerified,
  takeTalkVerified,
  talkWorktreeGitDir,
  TALK_VERIFIED_MARKER,
} from "../src/worktree/base.ts";
import { gitIn, makeCarriedTalk, makeProject, makeTalk } from "./fixtures/talk-worktree.ts";
import { LANE_PASS_OUTPUT } from "./fixtures/lane-output.ts";
import { startFakeLlm } from "./fixtures/fake-llm.ts";

// AGENT-13: there is no built-in default model or stub, so spawned runs
// call this localhost fake provider (a keyless ollama: model).
const fakeLlm = startFakeLlm();
afterAll(() => fakeLlm.stop());

const root = join(import.meta.dir, "..");
const bases: string[] = [];
afterAll(() => {
  for (const b of bases) rmSync(b, { recursive: true, force: true });
});

function tempBase(): string {
  const b = mkdtempSync(join(tmpdir(), "corvidinho-verify-gate-"));
  bases.push(b);
  return b;
}

/** A verify runner that records calls and answers from `outcomes` (last repeats). */
function lane(outcomes: boolean[] = [true]) {
  const calls: string[] = [];
  const runner: VerifyRunner = async (cwd) => {
    calls.push(cwd);
    const ok = outcomes[Math.min(calls.length - 1, outcomes.length - 1)]!;
    return { success: ok, output: ok ? LANE_PASS_OUTPUT : "app.ts: syntax error" };
  };
  return { calls, runner };
}

function texts(events: AgentEvent[]): string[] {
  return events.filter((e) => e.type === "Text").map((e) => (e as { text: string }).text);
}

async function run(
  cwd: string,
  execute: ExecuteFn,
  verifyRunner: VerifyRunner,
  extra: { signal?: AbortSignal; maxRetries?: number } = {},
): Promise<{ result: TaskResult; events: AgentEvent[] }> {
  const events: AgentEvent[] = [];
  const result = await runTask({
    cwd,
    maxRetries: extra.maxRetries ?? 0,
    verifyRunner,
    execute,
    onEvent: (e) => events.push(e),
    ...(extra.signal ? { signal: extra.signal } : {}),
  });
  return { result, events };
}

const answerOnly: ExecuteFn = async () => ({ summary: "just answered", filesChanged: [] });

const CARRIED_NOTE =
  "Verify gate: the last run in this talk did not end verified, so every edit since the talk started is checked (from the talk branch's merge-base).";

describe("verification can't be switched off (AGENT-14, REQ-agent-003)", () => {
  test("fledge.toml verify_before_complete = false is ignored: a real edit is verified", async () => {
    const base = tempBase();
    const project = makeProject(base);
    writeFileSync(
      join(project, "fledge.toml"),
      "[corvidinho]\nverify_before_complete = false\nmax_retries = 0\n",
    );
    gitIn(project, "add", "fledge.toml");
    gitIn(project, "commit", "-q", "-m", "gate off");
    const v = lane([false]);
    const events: AgentEvent[] = [];
    // No config and no maxRetries passed: runTask reads the project's fledge.toml.
    const result = await runTask({
      cwd: project,
      verifyRunner: v.runner,
      onEvent: (e) => events.push(e),
      execute: async () => {
        writeFileSync(join(project, "app.ts"), "export const x = ;\n");
        return { summary: "edited", filesChanged: ["app.ts"] };
      },
    });
    expect(v.calls).toEqual([project]);
    expect(result.state).toBe("failed");
    expect(result.verified).toBe(false);
    expect(result.verifySkipped).toBe(false);
    expect(result.attempts).toBe(1);
  });

  test("the real CLI in a project whose fledge.toml sets it false still runs the lane (fake fledge)", async () => {
    const base = tempBase();
    const { work } = await makeCarriedTalk(base);
    writeFileSync(
      join(work, "fledge.toml"),
      "[corvidinho]\nverify_before_complete = false\nmax_retries = 0\n",
    );
    const bin = join(base, "bin");
    mkdirSync(bin);
    const calls = join(base, "fledge.calls");
    writeFileSync(join(bin, "fledge"), `#!/bin/sh\necho "$*" >> '${calls}'\necho 'app.ts: syntax error'\nexit 1\n`);
    chmodSync(join(bin, "fledge"), 0o755);
    const proc = Bun.spawn(["bun", join(root, "src/cli.ts"), "task", "run", "--task", "demo", "--json"], {
      cwd: work,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        CORVIDINHO_LLM_API_KEY: "",
        OPENAI_API_KEY: "",
        ...fakeLlm.env,
        // A top-level run, even when this suite runs inside a worker's lane.
        CORVIDINHO_DELEGATE_DEPTH: "",
      },
    });
    const [code, out] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
    const parsed = JSON.parse(out) as { result: TaskResult };
    expect(code).toBe(1);
    expect(parsed.result.state).toBe("failed");
    expect(parsed.result.verified).toBe(false);
    expect(parsed.result.verifySkipped).toBe(false);
    expect(parsed.result.filesChanged).toEqual(["app.ts", "fledge.toml"]);
    expect(readFileSync(calls, "utf8")).toContain("lanes run verify --non-interactive");
  }, 60_000);
});

describe("'verified' covers every edit since the talk started (AGENT-15.a, REQ-agent-015)", () => {
  test("a new talk worktree starts verified: its first run that changes nothing has nothing to verify", async () => {
    const talk = await makeTalk(tempBase());
    expect(existsSync(join(talk.gitDir, TALK_VERIFIED_MARKER))).toBe(true);
    const v = lane();
    const { result, events } = await run(talk.work, answerOnly, v.runner);
    expect(v.calls).toEqual([]);
    expect(result.state).toBe("done");
    expect(result.verifySkipped).toBe(true);
    expect(texts(events)).not.toContain(CARRIED_NOTE);
    expect(texts(events)).toContain("Verify gate: no changes, nothing to verify.");
    expect(existsSync(join(talk.gitDir, TALK_VERIFIED_MARKER))).toBe(true);
  });

  test("an edit left by a run that ended blocked on an ask is verified by the resumed run that changes nothing", async () => {
    const talk = await makeTalk(tempBase());
    const v = lane([true]);
    const first = await run(
      talk.work,
      async () => {
        writeFileSync(join(talk.work, "app.ts"), "export const x = ;\n");
        return {
          summary: "Needs your input: which value?",
          filesChanged: [],
          ask: { reason: "clarify", question: "which value?" },
        };
      },
      v.runner,
    );
    expect(first.result.state).toBe("blocked");
    expect(v.calls).toEqual([]);
    expect(existsSync(join(talk.gitDir, TALK_VERIFIED_MARKER))).toBe(false);

    // The resume (a fresh `task run` in the same worktree) only answers.
    const second = await run(talk.work, answerOnly, v.runner);
    expect(v.calls).toEqual([talk.work]);
    expect(second.result.state).toBe("done");
    expect(second.result.verified).toBe(true);
    expect(second.result.verifySkipped).toBe(false);
    expect(second.result.filesChanged).toEqual(["app.ts"]);
    expect(texts(second.events)).toContain(CARRIED_NOTE);
    expect(existsSync(join(talk.gitDir, TALK_VERIFIED_MARKER))).toBe(true);

    // After a verified done, the next turn starts from its own snapshot.
    const third = await run(talk.work, answerOnly, v.runner);
    expect(v.calls.length).toBe(1);
    expect(third.result.verifySkipped).toBe(true);
    expect(texts(third.events)).not.toContain(CARRIED_NOTE);
  });

  test("after a run that failed verify, a retry that changes nothing is verified again and cannot end done", async () => {
    const talk = await makeTalk(tempBase());
    const v = lane([false]);
    const first = await run(
      talk.work,
      async () => {
        writeFileSync(join(talk.work, "app.ts"), "export const x = ;\n");
        return { summary: "edited", filesChanged: ["app.ts"] };
      },
      v.runner,
    );
    expect(first.result.state).toBe("failed");
    const second = await run(talk.work, answerOnly, v.runner);
    expect(v.calls.length).toBe(2);
    expect(second.result.state).toBe("failed");
    expect(second.result.verified).toBe(false);
    expect(second.result.filesChanged).toEqual(["app.ts"]);
  });

  test("a commit an earlier run made through a shell is carried too (merge-base baseline)", async () => {
    const talk = await makeTalk(tempBase());
    const v = lane([true]);
    await run(
      talk.work,
      async () => {
        writeFileSync(join(talk.work, "lib.ts"), "export const y = ;\n");
        gitIn(talk.work, "add", "lib.ts");
        gitIn(talk.work, "commit", "-q", "-m", "wip");
        return { summary: "LLM HTTP 503", filesChanged: [], error: true };
      },
      v.runner,
    );
    expect(v.calls).toEqual([]);
    expect(gitIn(talk.work, "status", "--porcelain")).toBe("");
    const second = await run(talk.work, answerOnly, v.runner);
    expect(v.calls).toEqual([talk.work]);
    expect(second.result.filesChanged).toEqual(["lib.ts"]);
    expect(second.result.verified).toBe(true);
  });

  test("a run stopped mid-attempt (cancelled) leaves its edit to the next run's gate", async () => {
    const talk = await makeTalk(tempBase());
    const v = lane([true]);
    const ac = new AbortController();
    const first = await run(
      talk.work,
      async () => {
        writeFileSync(join(talk.work, "app.ts"), "export const x = ;\n");
        ac.abort();
        return { summary: "stopped", filesChanged: [] };
      },
      v.runner,
      { signal: ac.signal },
    );
    expect(first.result.cancelled).toBe(true);
    const second = await run(talk.work, answerOnly, v.runner);
    expect(v.calls).toEqual([talk.work]);
    expect(second.result.filesChanged).toEqual(["app.ts"]);
  });

  test("a process that died mid-run (marker taken, never settled) makes the next run carry its edits", async () => {
    const talk = await makeTalk(tempBase());
    // What a killed `task run` leaves: its start took the marker, its edit is on disk.
    expect(await startWorkspaceDiff(talk.work)).not.toBeNull();
    writeFileSync(join(talk.work, "app.ts"), "export const x = ;\n");
    const v = lane([true]);
    const { result, events } = await run(talk.work, answerOnly, v.runner);
    expect(v.calls).toEqual([talk.work]);
    expect(result.filesChanged).toEqual(["app.ts"]);
    expect(texts(events)).toContain(CARRIED_NOTE);
  });

  test("a talk whose base branch cannot be found verifies anyway, and without a readable baseline it is not verified (fail closed)", async () => {
    const base = tempBase();
    const talk = await makeTalk(base);
    gitIn(talk.project, "branch", "-m", "main", "trunk");
    settleTalkVerified(talk.gitDir, false);
    const v = lane([true]);
    const { result, events } = await run(talk.work, answerOnly, v.runner);
    expect(v.calls).toEqual([talk.work]);
    expect(texts(events)).toContain(
      "Verify gate: could not read the git working-tree diff, so verifying anyway.",
    );
    // AGENT-15 (REQ-agent-185): with no baseline, "none deleted" can't be shown.
    expect(result.verified).toBe(false);
    expect(result.state).toBe("failed");
    expect(result.summary).toContain("could not read the test files to check that no test was deleted");
  });

  test("the caller's own checkout keeps the run-start baseline", async () => {
    const project = makeProject(tempBase());
    expect(talkWorktreeGitDir(project)).toBeNull();
    const v = lane([true]);
    const first = await run(
      project,
      async () => {
        writeFileSync(join(project, "app.ts"), "export const x = 2;\n");
        return {
          summary: "Needs your input",
          filesChanged: [],
          ask: { reason: "clarify", question: "ok?" },
        };
      },
      v.runner,
    );
    expect(first.result.state).toBe("blocked");
    const second = await run(project, answerOnly, v.runner);
    expect(v.calls).toEqual([]);
    expect(second.result.verifySkipped).toBe(true);
    expect(texts(second.events)).not.toContain(CARRIED_NOTE);
  });
});

describe("delegate and council workers leave the marker to their lead (REQ-agent-015)", () => {
  const nested = (dir: string) => startWorkspaceDiff(dir, {}, { nested: true });

  test("a worker in the lead's talk worktree keeps its own baseline, never writes the marker, and the lead's death still carries every edit", async () => {
    const talk = await makeTalk(tempBase());
    const marker = join(talk.gitDir, TALK_VERIFIED_MARKER);
    // The lead's run has started (it took the marker) and edited app.ts.
    expect(takeTalkVerified(talk.gitDir)).toBe(true);
    writeFileSync(join(talk.work, "app.ts"), "export const x = ;\n");

    // A read-only council voice changes nothing: no lane on the lead's edit.
    const v = lane([true]);
    const voice = await runTask({
      cwd: talk.work,
      maxRetries: 0,
      verifyRunner: v.runner,
      workspaceDiff: nested,
      execute: answerOnly,
    });
    expect(v.calls).toEqual([]);
    expect(voice.state).toBe("done");
    expect(voice.verifySkipped).toBe(true);
    expect(existsSync(marker)).toBe(false);

    // A delegate worker verifies its own edit and ends done: still no marker.
    const worker = await runTask({
      cwd: talk.work,
      maxRetries: 0,
      verifyRunner: v.runner,
      workspaceDiff: nested,
      execute: async () => {
        writeFileSync(join(talk.work, "lib.ts"), "export const y = 1;\n");
        return { summary: "worker edit", filesChanged: ["lib.ts"] };
      },
    });
    expect(v.calls).toEqual([talk.work]);
    expect(worker.verified).toBe(true);
    expect(worker.filesChanged).toEqual(["lib.ts"]);
    expect(existsSync(marker)).toBe(false);

    // The lead's process dies before its gate: the next run carries both edits.
    const after = lane([true]);
    const { result, events } = await run(talk.work, answerOnly, after.runner);
    expect(after.calls).toEqual([talk.work]);
    expect(result.filesChanged).toEqual(["app.ts", "lib.ts"]);
    expect(texts(events)).toContain(CARRIED_NOTE);
  });

  test("a worker that does not end done removes a marker; one that ends done leaves it as it was", async () => {
    const talk = await makeTalk(tempBase());
    const marker = join(talk.gitDir, TALK_VERIFIED_MARKER);
    const ok = await runTask({
      cwd: talk.work,
      maxRetries: 0,
      verifyRunner: lane([true]).runner,
      workspaceDiff: nested,
      execute: answerOnly,
    });
    expect(ok.state).toBe("done");
    expect(existsSync(marker)).toBe(true);
    const bad = await runTask({
      cwd: talk.work,
      maxRetries: 0,
      verifyRunner: lane([false]).runner,
      workspaceDiff: nested,
      execute: async () => {
        writeFileSync(join(talk.work, "app.ts"), "export const x = ;\n");
        return { summary: "edited", filesChanged: ["app.ts"] };
      },
    });
    expect(bad.state).toBe("failed");
    expect(existsSync(marker)).toBe(false);
  });

  test("the real CLI as a worker (CORVIDINHO_DELEGATE_DEPTH=1) in a lead's talk worktree does not run the lane on the lead's edit or write the marker", async () => {
    const base = tempBase();
    const { work, gitDir } = await makeCarriedTalk(base);
    const bin = join(base, "bin");
    mkdirSync(bin);
    const calls = join(base, "fledge.calls");
    writeFileSync(join(bin, "fledge"), `#!/bin/sh\necho "$*" >> '${calls}'\nexit 0\n`);
    chmodSync(join(bin, "fledge"), 0o755);
    const proc = Bun.spawn(["bun", join(root, "src/cli.ts"), "task", "run", "--task", "demo", "--json"], {
      cwd: work,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        CORVIDINHO_LLM_API_KEY: "",
        OPENAI_API_KEY: "",
        ...fakeLlm.env,
        CORVIDINHO_DELEGATE_DEPTH: "1",
      },
    });
    const [code, out] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
    const parsed = JSON.parse(out) as { result: TaskResult };
    expect(code).toBe(0);
    expect(parsed.result.state).toBe("done");
    expect(parsed.result.verifySkipped).toBe(true);
    expect(parsed.result.filesChanged).toEqual([]);
    expect(existsSync(calls)).toBe(false);
    expect(existsSync(join(gitDir, TALK_VERIFIED_MARKER))).toBe(false);
  }, 60_000);
});

describe("the talk verified marker (src/worktree/base.ts)", () => {
  test("only a linked talk-* worktree has one; a main checkout or another linked worktree does not", async () => {
    const base = tempBase();
    const talk = await makeTalk(base);
    expect(talkWorktreeGitDir(talk.work)).toBe(talk.gitDir);
    expect(talkWorktreeGitDir(talk.project)).toBeNull();
    const other = join(base, "mine");
    gitIn(talk.project, "worktree", "add", "-q", "-b", "mine", other);
    expect(talkWorktreeGitDir(other)).toBeNull();
    expect(talkWorktreeGitDir(join(base, "nowhere"))).toBeNull();
  });

  test("take removes it once; a missing marker or a symlink in its place reads as not verified", async () => {
    const talk = await makeTalk(tempBase());
    expect(takeTalkVerified(talk.gitDir)).toBe(true);
    expect(takeTalkVerified(talk.gitDir)).toBe(false);
    const target = join(talk.project, "outside.txt");
    writeFileSync(target, "keep\n");
    symlinkSync(target, join(talk.gitDir, TALK_VERIFIED_MARKER));
    expect(takeTalkVerified(talk.gitDir)).toBe(false);
    // A done run never writes through the link.
    settleTalkVerified(talk.gitDir, true);
    expect(readFileSync(target, "utf8")).toBe("keep\n");
    expect(lstatSync(join(talk.gitDir, TALK_VERIFIED_MARKER)).isSymbolicLink()).toBe(true);
  });

  test("a marker planted during a run that does not end done is removed", async () => {
    const talk = await makeTalk(tempBase());
    const v = lane([false]);
    await run(
      talk.work,
      async () => {
        writeFileSync(join(talk.work, "app.ts"), "export const x = ;\n");
        writeFileSync(join(talk.gitDir, TALK_VERIFIED_MARKER), "forged\n");
        return { summary: "edited", filesChanged: [] };
      },
      v.runner,
    );
    expect(existsSync(join(talk.gitDir, TALK_VERIFIED_MARKER))).toBe(false);
  });
});

describe("the real git diff decides what changed (AGENT-15, REQ-agent-085)", () => {
  test("a path a tool claims but git does not show is not listed, yet the lane runs", async () => {
    const project = makeProject(tempBase());
    writeFileSync(join(project, ".gitignore"), "dist/\n");
    gitIn(project, "add", ".gitignore");
    gitIn(project, "commit", "-q", "-m", "ignore dist");
    const v = lane([false]);
    const { result, events } = await run(
      project,
      async () => {
        mkdirSync(join(project, "dist"), { recursive: true });
        writeFileSync(join(project, "dist", "out.js"), "1\n");
        writeFileSync(join(project, "app.ts"), "export const x = 5;\n");
        return { summary: "built", filesChanged: ["dist/out.js", "app.ts", "ghost.ts"] };
      },
      v.runner,
    );
    expect(v.calls).toEqual([project]);
    expect(result.state).toBe("failed");
    expect(result.filesChanged).toEqual(["app.ts"]);
    const note = texts(events).find((t) => t.includes("are not in the git diff"));
    expect(note).toBe(
      "Verify gate: 2 path(s) a tool reported changing are not in the git diff (dist/out.js, ghost.ts), so they are not listed as changed, but verifying anyway.",
    );
  });

  test("a ghost claim alone still runs the lane, and a retry after its failed verify runs it again", async () => {
    const project = makeProject(tempBase());
    const v = lane([false, true]);
    const { result } = await run(
      project,
      async ({ attempt }) => ({
        summary: `attempt ${attempt}`,
        filesChanged: attempt === 1 ? ["claimed-only.ts"] : [],
      }),
      v.runner,
      { maxRetries: 1 },
    );
    expect(v.calls.length).toBe(2);
    expect(result.state).toBe("done");
    expect(result.verified).toBe(true);
    expect(result.filesChanged).toEqual([]);
  });
});
