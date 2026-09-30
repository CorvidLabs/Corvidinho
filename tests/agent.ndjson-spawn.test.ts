/**
 * REQ-discord-073 / REQ-watch-073 / REQ-cli-073 — bridges consume the
 * `task run --output ndjson` stream (issue #73; AGENT-8 / DISCORD-3 / DISCORD-10).
 * Fake bins are sh scripts in mkdtemp dirs; no live tokens, no network, no git worktrees.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  frameFromEvent,
  resultFrame,
  serializeFrame,
  usageFrame,
  type TaskProgress,
} from "../src/agent/events-ndjson.ts";
import { chatBodyFromTaskResult } from "../src/agent/task-summary.ts";
import type { TaskResult } from "../src/agent/types.ts";
import {
  createSpawnAgentClient as createDiscordClient,
  type AgentStatusUpdate,
} from "../src/discord/agent-client.ts";
import {
  CORVIDINHO_PROTOCOL_VERSION,
  checkProtocolVersion,
} from "../src/discord/protocol-version.ts";
import { createSpawnAgentClient as createWatchClient } from "../src/watch/agent-client.ts";
import { startFakeLlm } from "./fixtures/fake-llm.ts";

// AGENT-13: there is no built-in default model or stub, so spawned runs
// call this localhost fake provider (a keyless ollama: model).
const fakeLlm = startFakeLlm();
afterAll(() => fakeLlm.stop());

const root = import.meta.dir + "/..";
const SPAWN_TIMEOUT_MS = 30_000;

const RESULT: TaskResult = {
  summary: "Listed plugins.",
  filesChanged: [],
  verified: false,
  verifySkipped: true,
  cancelled: false,
  state: "done",
  attempts: 1,
};

/** Write an executable sh script; body lines run in order. */
function fakeBin(body: string): { bin: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "corvidinho-ndjson-"));
  const bin = join(dir, "corvidinho");
  writeFileSync(bin, `#!/bin/sh\nprintf '%s\\n' "$@" > "${dir}/argv.txt"\n${body}\n`, {
    mode: 0o755,
  });
  chmodSync(bin, 0o755);
  return { bin, dir };
}

/** sh line that prints one literal line (single-quoted heredoc, no expansion). */
function out(line: string): string {
  return `cat <<'NDJSON_EOF'\n${line}\nNDJSON_EOF`;
}

function streamingScript(): string {
  return [
    out("warning: stray plugin stdout"),
    out(serializeFrame(frameFromEvent({ type: "StateChanged", state: "planning" }))),
    "echo 'bridge-visible stderr' >&2",
    out(serializeFrame(frameFromEvent({ type: "StateChanged", state: "executing" }))),
    out(
      serializeFrame(
        frameFromEvent({ type: "ToolCall", name: "specsync-list", args: '{"argv":["agent"]}' }),
      ),
    ),
    out(serializeFrame(usageFrame({ promptTokens: 100, completionTokens: 20, totalTokens: 120 }))),
    // Pause so the test can prove updates arrive while the child still runs.
    "sleep 0.6",
    out(serializeFrame(frameFromEvent({ type: "ToolResult", name: "specsync-list", success: true }))),
    out(serializeFrame(frameFromEvent({ type: "StateChanged", state: "done" }))),
    // Final result line without a trailing newline (flushed at EOF).
    `printf '%s' '${serializeFrame(resultFrame(RESULT))}'`,
  ].join("\n");
}

describe("Discord spawn client reads the ndjson stream (REQ-discord-073)", () => {
  test(
    "argv uses --output ndjson; frames drive onStatus live; summary from result line",
    async () => {
      const { bin, dir } = fakeBin(streamingScript());
      const client = createDiscordClient({ bin, cwd: dir });
      const updates: Array<{ at: number; u: AgentStatusUpdate }> = [];
      const res = await client.runChat({
        prompt: "list plugins",
        sessionId: "sess-ndjson-1",
        cwd: dir,
        onStatus: (u) => updates.push({ at: Date.now(), u }),
      });
      const doneAt = Date.now();

      expect(readFileSync(join(dir, "argv.txt"), "utf8").trim().split("\n")).toEqual([
        "task",
        "run",
        "--task",
        "list plugins",
        "--output",
        "ndjson",
      ]);
      expect(readFileSync(join(dir, "argv.txt"), "utf8")).not.toContain("--no-verify");
      expect(res.ok).toBe(true);
      expect(res.exitCode).toBe(0);
      expect(res.summary).toBe(chatBodyFromTaskResult(RESULT));

      expect(updates.map((x) => x.u)).toEqual([
        { tool: "task run", message: "Spawning agent..." },
        { tool: "", message: "planning" },
        { tool: "", message: "working" },
        { tool: "specsync-list", message: "calling tool specsync-list" },
        { tokens: { estimated: 120 } },
        { tool: "specsync-list", message: "tool specsync-list ok" },
        { tool: "", message: "done" },
        { tool: "task run", tokens: { estimated: 120 }, message: "Agent finished" },
      ]);
      // Live, not after the fact: the tool update landed while the child slept.
      const toolAt = updates[3]?.at ?? doneAt;
      expect(doneAt - toolAt).toBeGreaterThanOrEqual(300);
    },
    SPAWN_TIMEOUT_MS,
  );

  test(
    "no result line: falls back to summarizeTaskRunOutput (stderr / exit)",
    async () => {
      const { bin, dir } = fakeBin(
        [
          out(serializeFrame(frameFromEvent({ type: "StateChanged", state: "planning" }))),
          "echo 'boom: provider down' >&2",
          "exit 3",
        ].join("\n"),
      );
      const updates: AgentStatusUpdate[] = [];
      const res = await createDiscordClient({ bin, cwd: dir }).runChat({
        prompt: "x",
        sessionId: "sess-ndjson-2",
        cwd: dir,
        onStatus: (u) => updates.push(u),
      });
      expect(res.ok).toBe(false);
      expect(res.exitCode).toBe(3);
      expect(res.summary).toBe("boom: provider down");
      // No usage frame → rough estimate from summary length.
      expect(updates.at(-1)).toEqual({
        tool: "task run",
        tokens: { estimated: Math.ceil("boom: provider down".length / 4) },
        message: "Agent finished",
      });
    },
    SPAWN_TIMEOUT_MS,
  );

  test(
    "old single --json document still summarizes via the fallback",
    async () => {
      const doc = JSON.stringify({ result: RESULT, events: [] }, null, 2);
      const { bin, dir } = fakeBin(out(doc));
      const res = await createDiscordClient({ bin, cwd: dir }).runChat({
        prompt: "x",
        sessionId: "sess-ndjson-3",
        cwd: dir,
      });
      expect(res.summary).toBe(chatBodyFromTaskResult(RESULT));
    },
    SPAWN_TIMEOUT_MS,
  );
});

describe("WATCH spawn client reads the ndjson stream (REQ-watch-073)", () => {
  test(
    "argv uses --output ndjson; onStatus gets progress; summary from result line",
    async () => {
      const { bin, dir } = fakeBin(streamingScript());
      const progress: TaskProgress[] = [];
      const res = await createWatchClient({ bin, cwd: dir }).runChat({
        prompt: "review this",
        sessionId: "watch-1",
        onStatus: (p) => progress.push(p),
      });
      expect(readFileSync(join(dir, "argv.txt"), "utf8").trim().split("\n")).toEqual([
        "task",
        "run",
        "--task",
        "review this",
        "--output",
        "ndjson",
      ]);
      expect(readFileSync(join(dir, "argv.txt"), "utf8")).not.toContain("--no-verify");
      expect(res.ok).toBe(true);
      expect(res.summary).toBe(chatBodyFromTaskResult(RESULT));
      expect(progress).toEqual([
        { state: "planning", tool: "", message: "planning" },
        { state: "executing", tool: "", message: "working" },
        { tool: "specsync-list", message: "calling tool specsync-list" },
        { totalTokens: 120 },
        { tool: "specsync-list", message: "tool specsync-list ok" },
        { state: "done", tool: "", message: "done" },
      ]);
    },
    SPAWN_TIMEOUT_MS,
  );

  test(
    "garbage-only stdout falls back to summarizeTaskRunOutput",
    async () => {
      const { bin, dir } = fakeBin([out("plain text answer"), "exit 0"].join("\n"));
      const res = await createWatchClient({ bin, cwd: dir }).runChat({
        prompt: "x",
        sessionId: "watch-2",
      });
      expect(res.ok).toBe(true);
      expect(res.summary).toBe("plain text answer");
    },
    SPAWN_TIMEOUT_MS,
  );
});

describe("DISCORD-10 lockstep on protocol 2", () => {
  test(
    "a protocol-1 binary is a mismatch (bridge refuses to start)",
    async () => {
      const { bin } = fakeBin("echo 1");
      const r = await checkProtocolVersion(bin, undefined, 25_000);
      expect(CORVIDINHO_PROTOCOL_VERSION).toBe(2);
      expect(r).toEqual({ kind: "mismatch", version: 1 });
    },
    SPAWN_TIMEOUT_MS,
  );
});

describe("real CLI: task run --output ndjson (REQ-cli-073)", () => {
  // The fake provider only: clear LLM keys so nothing reaches a real one.
  const env = {
    ...process.env,
    CORVIDINHO_LLM_API_KEY: "",
    OPENAI_API_KEY: "",
    ...fakeLlm.env,
  };

  // A scratch non-git project: never the repo's own snapshot or verify lane.
  const scratch = mkdtempSync(join(tmpdir(), "corvidinho-ndjson-cli-"));

  async function run(args: string[]) {
    const proc = Bun.spawn(["bun", join(root, "src/cli.ts"), ...args], {
      cwd: scratch,
      stdout: "pipe",
      stderr: "pipe",
      env,
    });
    const [code, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    return { code, stdout, stderr };
  }

  test(
    "prints only protocol-2 frames ending in a result equal to --json's result",
    async () => {
      const nd = await run(["task", "run", "--task", "hello", "--output", "ndjson"]);
      expect(nd.code).toBe(0);
      const lines = nd.stdout.trim().split("\n");
      const frames = lines.map(
        (l) => JSON.parse(l) as { protocol: number; type: string; state?: string; result?: unknown },
      );
      expect(frames.every((f) => f.protocol === 2)).toBe(true);
      expect(frames[0]).toEqual({ protocol: 2, type: "StateChanged", state: "planning" });
      expect(frames.at(-1)?.type).toBe("result");
      expect(frames.map((f) => f.type)).toContain("Text");

      const js = await run(["task", "run", "--task", "hello", "--json"]);
      expect(js.code).toBe(0);
      const doc = JSON.parse(js.stdout) as { result: unknown; events: unknown[] };
      expect(frames.at(-1)?.result).toEqual(doc.result);
      // Same events, one frame each, plus the result line.
      expect(frames.length).toBe(doc.events.length + 1);
    },
    SPAWN_TIMEOUT_MS,
  );

  test(
    "--output=json matches --json; unknown --output exits 1 with usage",
    async () => {
      const a = await run(["task", "run", "--output=json"]);
      expect(a.code).toBe(0);
      const doc = JSON.parse(a.stdout) as { result: { state: string }; events: unknown[] };
      expect(doc.result.state).toBe("done");
      expect(Array.isArray(doc.events)).toBe(true);

      const bad = await run(["task", "run", "--output", "yaml"]);
      expect(bad.code).toBe(1);
      expect(bad.stderr).toContain("--output text|json|ndjson");

      const missing = await run(["task", "run", "--output"]);
      expect(missing.code).toBe(1);
    },
    SPAWN_TIMEOUT_MS,
  );
});
