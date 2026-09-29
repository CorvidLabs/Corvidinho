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
import { chatBodyFromTaskResult, ROLE_REFUSED_SUMMARY_NOTE } from "../src/agent/task-summary.ts";
import { attribution } from "../src/attribution.ts";
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

  test(
    "a token straddling the 500-char stderr fallback cap leaks no prefix into the comment (REQ-agent-232)",
    async () => {
      // The stderr fallback is clipped to 500 chars before WATCH sees it; the
      // token starts at 477 so clip-then-scrub would post `ghp_` + 19 chars.
      const pad = "e".repeat(476);
      const { bin, dir } = fakeBin(`printf '%s %s\\n' "${pad}" "${TOKEN}" >&2\nexit 1`);
      const agent = createSpawnAgentClient({ bin, cwd: dir });
      const { posts, jsonl } = await runOnce(agent, dir, "comment-scrub-stderr-cap");

      expect(posts).toHaveLength(2);
      const summary = posts[1]!.body;
      expect(summary).toContain("Failed (exit 1)");
      expect(summary).not.toContain("ghp_");
      expect(summary).toContain(`${pad} ${REDACTED}`);
      expect(jsonl).not.toContain("ghp_");
    },
    30_000,
  );

  test(
    "a PEM key cut by the 1800-char chat body cap posts no key body (REQ-agent-232)",
    async () => {
      const keyLine = "MIIEpAIBAAKCAQEA" + "q1W2e3R4t5Y6u7I8o9P0".repeat(2) + "abcdefgh";
      const pem =
        "-----BEGIN RSA " +
        "PRIVATE KEY-----\n" +
        Array.from({ length: 26 }, () => keyLine).join("\n") +
        "\n-----END RSA PRIVATE KEY-----";
      // Key starts at 100 (inside both the 240-char preview and the 1200-char
      // comment cap) and ends past 1800, so the chat body clip drops its END.
      const summary = `${"s".repeat(99)}\n${pem}\nDone.`;
      expect(summary.indexOf("-----END")).toBeGreaterThan(1800);
      const frame = serializeFrame(
        resultFrame({
          summary,
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
      const { posts, jsonl } = await runOnce(agent, dir, "comment-scrub-pem");

      expect(posts).toHaveLength(2);
      const body = posts[1]!.body;
      expect(body).not.toContain("PRIVATE KEY");
      expect(body).not.toContain("MIIEpAIBAAKCAQEA");
      expect(body).toContain("[redacted:private-key]\nDone.");
      expect(jsonl).not.toContain("PRIVATE KEY");
      expect(jsonl).toContain("[redacted:private-key]");
    },
    30_000,
  );
});

describe("WATCH summary comment keeps the closing role note (REQ-watch-734, ROLES-CHAT-3)", () => {
  test("a long summary is clipped before its note, after the scrub; one without a note is clipped as before", () => {
    const tail = `\n\n${ROLE_REFUSED_SUMMARY_NOTE}`;
    const foot = `\n\n---\n${attribution("markdown")}`;
    // What a non-ADMIN WATCH run hands the poller: at most 1800 chars, note last.
    const summary = chatBodyFromTaskResult({ summary: `${"x".repeat(1500)}${tail}` });
    expect(summary.length).toBe(1529);
    expect(summary.endsWith(tail)).toBe(true);

    const body = buildSummaryBody({ ok: true, sessionId: "s", summary, exitCode: 0 });
    expect(body.endsWith(`${tail}${foot}`)).toBe(true);
    const preview = body.slice(body.indexOf("\n\n") + 2, body.length - foot.length);
    expect(preview.length).toBe(1200);
    expect(preview).toBe(`${"x".repeat(1200 - tail.length)}${tail}`);

    // The scrub still runs first: a token cut where the note makes room leaks no prefix.
    const secret = buildSummaryBody({
      ok: true,
      sessionId: "s",
      summary: `${"x".repeat(1160)} ${TOKEN} more text${tail}`,
      exitCode: 0,
    });
    expect(secret).not.toContain("ghp_");
    expect(secret.endsWith(`${tail}${foot}`)).toBe(true);

    // No note: the plain head cut, unchanged.
    const plain = buildSummaryBody({ ok: true, sessionId: "s", summary: "y".repeat(1500), exitCode: 0 });
    expect(plain).toContain(`\n\n${"y".repeat(1200)}${foot}`);
    expect(plain).not.toContain("y".repeat(1201));
  });
});
