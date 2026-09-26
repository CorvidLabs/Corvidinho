/**
 * REQ-watch-231 — the WATCH run summary is secret-scrubbed (SAFE-6) before it
 * is posted to the GitHub thread or appended to the spawn-outcome JSONL.
 * Fake bins are sh scripts in mkdtemp dirs; fake tokens are built at runtime;
 * no network, no git worktrees.
 */
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resultFrame, serializeFrame } from "../src/agent/events-ndjson.ts";
import { createEchoAckClient } from "../src/watch/ack.ts";
import { createSpawnAgentClient, type AgentClient } from "../src/watch/agent-client.ts";
import { startWatchPoller } from "../src/watch/poller.ts";
import { SpawnOutcomeStore } from "../src/watch/spawn-log.ts";
import { buildSummaryBody } from "../src/watch/summary.ts";
import type { DetectedEvent } from "../src/watch/types.ts";

const TOKEN = "ghp_" + "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
const RAW_TOKEN_RE = /ghp_[A-Za-z0-9]{20,}/;
const REDACTED = "[redacted:github-token]";

const envBase = {
  GITHUB_TOKEN: "fake",
  CORVIDINHO_WATCH_USERNAME: "corvid-agent",
  CORVIDINHO_GITHUB_ALLOW_REPOS: "CorvidLabs/Corvidinho",
  CORVIDINHO_GITHUB_ALLOW_USERS: "0xLeif",
  CORVIDINHO_WATCH_DRY_RUN: "1",
};

function mkEvent(id: string): DetectedEvent {
  return {
    id,
    type: "issue_comment",
    body: "@corvid-agent please check the env",
    sender: "0xLeif",
    repo: "CorvidLabs/Corvidinho",
    number: 42,
    title: "t",
    htmlUrl: "https://example.com",
    createdAt: "2026-09-26T12:00:00Z",
    isPullRequest: false,
  };
}

/** Executable sh fake of the corvidinho bin. */
function fakeBin(body: string): { bin: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "corvidinho-watch-scrub-"));
  const bin = join(dir, "corvidinho");
  writeFileSync(bin, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  chmodSync(bin, 0o755);
  return { bin, dir };
}

/** Drive one allowlisted comment through the poller; return posts + JSONL. */
async function runOnce(agent: AgentClient, dir: string, id: string) {
  const ack = createEchoAckClient();
  const logPath = join(dir, "watch-spawn.jsonl");
  const result = await startWatchPoller({
    env: envBase,
    filePath: null,
    runLoop: false,
    agent,
    ackClient: ack,
    spawnOutcomeStore: new SpawnOutcomeStore({ path: logPath }),
    log: () => {},
    logError: () => {},
    fetchEvents: async () => [mkEvent(id)],
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("poller did not start");
  await result.pollOnce();
  await result.stop();
  return { posts: ack.posts, jsonl: readFileSync(logPath, "utf8") };
}

describe("WATCH summary is secret-scrubbed before public post and JSONL (REQ-watch-231)", () => {
  test(
    "token in the agent result frame is redacted in the posted summary and spawn log",
    async () => {
      const frame = serializeFrame(
        resultFrame({
          summary: `Used GITHUB_TOKEN=${TOKEN} to list repos.`,
          filesChanged: [],
          verified: false,
          verifySkipped: true,
          cancelled: false,
          state: "done",
          attempts: 1,
        }),
      );
      const { bin, dir } = fakeBin(`cat <<'NDJSON_EOF'\n${frame}\nNDJSON_EOF`);
      const agent = createSpawnAgentClient({ bin, cwd: dir });
      const { posts, jsonl } = await runOnce(agent, dir, "comment-scrub-result");

      expect(posts).toHaveLength(2);
      const summary = posts[1]!.body;
      expect(summary).toContain("Corvidinho WATCH run summary");
      expect(RAW_TOKEN_RE.test(summary)).toBe(false);
      expect(summary).toContain(`GITHUB_TOKEN=${REDACTED}`);

      expect(RAW_TOKEN_RE.test(jsonl)).toBe(false);
      expect(jsonl).toContain(REDACTED);
    },
    30_000,
  );

  test(
    "token in the stderr fallback (no result frame) is redacted too",
    async () => {
      const { bin, dir } = fakeBin(`echo "fatal: auth failed for ${TOKEN}" >&2\nexit 1`);
      const agent = createSpawnAgentClient({ bin, cwd: dir });
      const { posts, jsonl } = await runOnce(agent, dir, "comment-scrub-stderr");

      expect(posts).toHaveLength(2);
      const summary = posts[1]!.body;
      expect(summary).toContain("Failed (exit 1)");
      expect(RAW_TOKEN_RE.test(summary)).toBe(false);
      expect(summary).toContain(REDACTED);

      expect(RAW_TOKEN_RE.test(jsonl)).toBe(false);
      expect(jsonl).toContain(REDACTED);
    },
    30_000,
  );

  test("token in a thrown spawn error is redacted in the posted summary and spawn log", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-watch-scrub-"));
    const agent: AgentClient = {
      async runChat() {
        throw new Error(`spawn failed with GITHUB_TOKEN=${TOKEN}`);
      },
    };
    const { posts, jsonl } = await runOnce(agent, dir, "comment-scrub-throw");

    expect(posts).toHaveLength(2);
    expect(RAW_TOKEN_RE.test(posts[1]!.body)).toBe(false);
    expect(posts[1]!.body).toContain(REDACTED);
    expect(RAW_TOKEN_RE.test(jsonl)).toBe(false);
    expect(jsonl).toContain(REDACTED);
  });

  test("scrub runs before clipping, so a token cut at the length cap leaks no prefix", async () => {
    // Token starts 8 chars before the 1200-char body cap: clip-then-scrub
    // would leave `ghp_` plus a few token chars that no pattern matches.
    const body = buildSummaryBody({
      ok: true,
      sessionId: "s",
      summary: `${"x".repeat(1191)} ${TOKEN}`,
      exitCode: 0,
    });
    expect(body).not.toContain("ghp_");

    // Same for the 240-char spawn-log preview.
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-watch-scrub-"));
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ok: true, sessionId, summary: `${"y".repeat(231)} ${TOKEN}`, exitCode: 0 };
      },
    };
    const { jsonl } = await runOnce(agent, dir, "comment-scrub-clip");
    expect(jsonl).not.toContain("ghp_");
  });
});
