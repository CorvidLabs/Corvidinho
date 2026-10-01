/**
 * REQ-watch-009 (DISCORD-3.b on GitHub) — a failed WATCH run's public summary
 * comment says why in one plain line (which model call failed: status and
 * host), never the provider's raw error body.
 *
 * Found in #340's review: a failed run's comment posted the run summary,
 * which for a model failure is `LLM HTTP <status>: <provider body>` —
 * scrubbed of keys, but the provider's body (account / org names, request
 * ids, quota details) on a public issue or PR. Now a failed run without an
 * ask of its own shows the same reason the Discord surfaces give
 * (`failureReasonFor`, src/discord/failure-reason.ts), logs it, and keeps it
 * as the thread's agent turn; a successful run, a run that stopped on an ask
 * (`Needs your input: …`, AGENT-16.a) and a spend-cap stop ("Work is paused
 * for budget.", SAFE-14.a) are unchanged. The operator-only spawn log keeps
 * the scrubbed summary.
 *
 * The end-to-end case spawns the real `task run` through the WATCH spawn
 * client against a localhost model that answers 429 with an org name and a
 * request id. Fixtures only: the echo ack client, in-memory SQLite, stub
 * agents, a localhost mock provider. No network, no real key or token.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NO_PROVIDER_NOTICE } from "../src/agent/providers.ts";
import { attribution } from "../src/attribution.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { createEchoAckClient } from "../src/watch/ack.ts";
import { createSpawnAgentClient, type AgentClient } from "../src/watch/agent-client.ts";
import { startWatchPoller } from "../src/watch/poller.ts";
import { createMemorySpawnOutcomeStore } from "../src/watch/spawn-log.ts";
import { buildSummaryBody, watchFailureReason } from "../src/watch/summary.ts";
import type { AgentSpawnResult, DetectedEvent } from "../src/watch/types.ts";

const ROOT = join(import.meta.dir, "..");
const ORG = "org-acme-widgets-7731";
const REQUEST_ID = "req_7f3c9a1b2d4e5f60";
const FOOT = `\n\n---\n${attribution("markdown")}`;
const TOKEN = "ghp_" + "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";

const envBase = {
  GITHUB_TOKEN: "fake",
  CORVIDINHO_WATCH_USERNAME: "corvid-agent",
  CORVIDINHO_GITHUB_ALLOW_REPOS: "CorvidLabs/Corvidinho",
  CORVIDINHO_GITHUB_ALLOW_USERS: "0xLeif",
  CORVIDINHO_WATCH_DRY_RUN: "1",
  CORVIDINHO_LLM_MODEL: "ollama:qwen3",
};

const restores: Array<() => void> = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

function mkEvent(id: string): DetectedEvent {
  return {
    id,
    type: "issue_comment",
    body: "@corvid-agent show me a gif of a dog",
    sender: "0xLeif",
    repo: "CorvidLabs/Corvidinho",
    number: 42,
    title: "t",
    htmlUrl: "https://github.com/CorvidLabs/Corvidinho/issues/42#issuecomment-1",
    createdAt: "2026-10-01T12:00:00Z",
    isPullRequest: false,
  };
}

/** Drive one allowlisted comment through the poller (with a DB, so the thread is kept). */
async function runOnce(agent: AgentClient, id: string) {
  const ack = createEchoAckClient();
  const logs: string[] = [];
  const outcomes = createMemorySpawnOutcomeStore();
  const db = openCorvidinhoDb({ memory: true });
  restores.push(() => db.close());
  const result = await startWatchPoller({
    env: envBase,
    filePath: null,
    runLoop: false,
    agent,
    ackClient: ack,
    db,
    spawnOutcomeStore: outcomes,
    log: (m) => logs.push(m),
    logError: (m) => logs.push(m),
    fetchEvents: async () => [mkEvent(id)],
  });
  if (!result.ok) throw new Error("poller did not start");
  await result.pollOnce();
  await result.stop();
  const turns = (
    db.query("SELECT turns FROM conversation_threads").all() as Array<{ turns: string }>
  ).map((r) => JSON.parse(r.turns) as Array<{ role: string; content: string }>);
  return { posts: ack.posts, logs, outcomes: outcomes.list(), turns: turns[0] ?? [] };
}

function stubAgent(result: Omit<AgentSpawnResult, "sessionId">): AgentClient {
  return {
    async runChat({ sessionId }) {
      return { ...result, sessionId };
    },
  };
}

/** A localhost provider that answers every chat call 429 with an org name and a request id. */
function rateLimitedLlm() {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(
        JSON.stringify({
          error: {
            message: `Rate limit reached for gpt-4o-mini in organization ${ORG} on requests per min (RPM): Limit 3, Used 3, Requested 1. Please try again in 20s.`,
            type: "requests",
            code: "rate_limit_exceeded",
          },
          request_id: REQUEST_ID,
        }),
        { status: 429, headers: { "content-type": "application/json", "x-request-id": REQUEST_ID } },
      ),
  });
  return {
    host: `127.0.0.1:${server.port}`,
    env: {
      CORVIDINHO_LLM_MODEL: "gpt-4o-mini",
      CORVIDINHO_LLM_API_KEY: "test-key-not-real",
      OPENAI_API_KEY: "",
      CORVIDINHO_LLM_BASE_URL: `http://127.0.0.1:${server.port}/v1`,
      CORVIDINHO_LLM_TIER: "tool",
      CORVIDINHO_DELEGATE_DEPTH: "",
    },
    stop: () => server.stop(true),
  };
}

describe("a failed WATCH run's comment says which model call failed, never the provider body (REQ-watch-009)", () => {
  test("end to end: a real `task run` whose model answers 429 with an org name and a request id", async () => {
    const llm = rateLimitedLlm();
    restores.push(llm.stop);
    const agent = createSpawnAgentClient({
      bin: join(ROOT, "src/cli.ts"),
      cwd: mkdtempSync(join(tmpdir(), "corvidinho-watch-failed-e2e-")),
      env: llm.env,
    });
    const { posts, logs, outcomes, turns } = await runOnce(agent, "comment-failed-e2e");
    const reason = `The model call failed (429 Too Many Requests from ${llm.host})`;

    // The ack, then the summary: the status line, the one plain line, the footer.
    expect(posts).toHaveLength(2);
    expect(posts[1]!.body).toBe(`Corvidinho WATCH run summary — Failed (exit 1).\n\n${reason}${FOOT}`);
    for (const p of posts) {
      expect(p.body).not.toContain(ORG);
      expect(p.body).not.toContain(REQUEST_ID);
      expect(p.body).not.toContain("LLM HTTP");
      expect(p.body).not.toContain("Rate limit reached");
    }
    // The reason is logged; no log line carries the provider body.
    expect(logs).toContain(`[watch] run failed (CorvidLabs/Corvidinho#42 id=comment-failed-e2e, exit 1): ${reason}`);
    for (const secret of [ORG, REQUEST_ID, "LLM HTTP"]) expect(logs.join("\n")).not.toContain(secret);
    // The thread's kept agent turn is the posted reason, so a follow-up run
    // never replays the provider body to the model (REQ-watch-472).
    expect(turns.map((t) => t.role)).toEqual(["human", "agent"]);
    expect(turns[1]!.content).toBe(reason);
    expect(JSON.stringify(turns)).not.toContain(ORG);
    // Operator-only: the spawn log keeps the scrubbed summary for diagnosis.
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]!.ok).toBe(false);
    expect(outcomes[0]!.summaryPreview).toStartWith("LLM HTTP 429: ");
  }, 60_000);

  test("a failed run's provider body never reaches the comment, even with no result `error` (stderr end, then exit code)", async () => {
    // An older child, or one that crashed: no frame `error`; its summary is the
    // provider body. A model is configured, so the reason is the stderr end.
    const body = `LLM HTTP 401: {"error":{"message":"Incorrect API key for ${ORG}","request_id":"${REQUEST_ID}"}}`;
    const crashed = await runOnce(
      stubAgent({
        ok: false,
        summary: body,
        exitCode: 1,
        stderrTail: `error: run aborted at /home/leif/src/x.ts with ${TOKEN}\n    at main (/home/leif/src/x.ts:1:2)\n`,
      }),
      "comment-failed-stderr",
    );
    expect(crashed.posts[1]!.body).toBe(
      `Corvidinho WATCH run summary — Failed (exit 1).\n\nerror: run aborted at …/x.ts with [redacted:github-token]${FOOT}`,
    );
    const silent = await runOnce(stubAgent({ ok: false, summary: body, exitCode: 2 }), "comment-failed-silent");
    expect(silent.posts[1]!.body).toBe(
      `Corvidinho WATCH run summary — Failed (exit 2).\n\nThe run failed (exit 2) without saying why${FOOT}`,
    );
    for (const r of [crashed, silent]) {
      expect(r.posts[1]!.body).not.toContain(ORG);
      expect(r.posts[1]!.body).not.toContain(REQUEST_ID);
      expect(JSON.stringify(r.turns)).not.toContain(ORG);
    }
  });

  test("a spawn that throws: the comment and the log are its scrubbed one-line message (no exit code)", async () => {
    const agent: AgentClient = {
      async runChat() {
        throw new Error(`posix_spawn '/home/leif/bin/corvidinho' failed: ENOENT with ${TOKEN}\nstack line`);
      },
    };
    const { posts, logs } = await runOnce(agent, "comment-failed-throw");
    const reason = "posix_spawn '…/corvidinho' failed: ENOENT with [redacted:github-token]";
    expect(posts[1]!.body).toBe(`Corvidinho WATCH run summary — Failed (exit 1).\n\n${reason}${FOOT}`);
    expect(logs).toContain(`[watch] run failed (CorvidLabs/Corvidinho#42 id=comment-failed-throw): ${reason}`);
  });

  test("success is unchanged: the run's summary is posted, nothing is logged as failed", async () => {
    const { posts, logs, turns } = await runOnce(
      stubAgent({ ok: true, summary: "shipped the thing", exitCode: 0 }),
      "comment-ok",
    );
    expect(posts[1]!.body).toBe(`Corvidinho WATCH run summary — Done (exit 0).\n\nshipped the thing${FOOT}`);
    expect(logs.some((l) => l.includes("run failed"))).toBe(false);
    expect(turns[1]!.content).toBe("shipped the thing");
  });

  test("a failed run that stopped on an ask keeps its summary (Needs your input, AGENT-16.a); a spend-cap stop stays generic (SAFE-14.a)", async () => {
    const stuck = "Verification failed after 2 retries:\nlane output\n\nNeeds your input: verify keeps failing — how should I proceed?";
    const asked = await runOnce(
      stubAgent({
        ok: false,
        summary: stuck,
        exitCode: 1,
        ask: { reason: "stuck", question: "verify keeps failing — how should I proceed?" },
        failureReason: "Verification failed after 2 retries",
      }),
      "comment-failed-ask",
    );
    expect(asked.posts[1]!.body).toBe(`Corvidinho WATCH run summary — Failed (exit 1).\n\n${stuck}${FOOT}`);
    expect(asked.logs.some((l) => l.includes("run failed"))).toBe(false);

    const capped = await runOnce(
      stubAgent({
        ok: true,
        summary: "Work is paused for budget.",
        exitCode: 0,
        ask: { reason: "spend-cap", question: "Stopped at cap: total." },
      }),
      "comment-spend-cap",
    );
    expect(capped.posts[1]!.body).toBe(`Corvidinho WATCH run summary — Done (exit 0).\n\nWork is paused for budget.${FOOT}`);
  });
});

describe("watchFailureReason / buildSummaryBody (REQ-watch-009)", () => {
  const model = { CORVIDINHO_LLM_MODEL: "ollama:qwen3" };

  test("the order: the result's error, the no-provider notice, the stderr end, the exit code; null on success or an ask", () => {
    const failed = { ok: false, exitCode: 1 } as const;
    const reason = "The model call failed (503 Service Unavailable from api.openai.com)";
    expect(watchFailureReason({ ...failed, failureReason: reason, stderrTail: "error: other" }, model)).toBe(reason);
    expect(watchFailureReason({ ...failed, stderrTail: "error: boom" }, { CORVIDINHO_LLM_MODEL: "" })).toStartWith(
      `${NO_PROVIDER_NOTICE}: CORVIDINHO_LLM_MODEL is not set.`,
    );
    expect(watchFailureReason({ ...failed, stderrTail: "warming up\nerror: boom\n" }, model)).toBe("error: boom");
    expect(watchFailureReason({ ok: false, exitCode: 130 }, model)).toBe("The run was interrupted before it finished");
    expect(watchFailureReason({ ok: true, exitCode: 0, failureReason: reason }, model)).toBeNull();
    expect(
      watchFailureReason({ ...failed, failureReason: reason, ask: { reason: "stuck", question: "q?" } }, model),
    ).toBeNull();
  });

  test("a failed run's body is the reason line, with the SAFE-13 owner line and the footer kept", () => {
    const body = buildSummaryBody(
      {
        ok: false,
        sessionId: "s",
        summary: `LLM HTTP 429: {"error":{"message":"quota for ${ORG}"},"request_id":"${REQUEST_ID}"}`,
        exitCode: 1,
        failureReason: "The model call failed (429 Too Many Requests from api.openai.com)",
        injection: { source: "web-fetch", reasons: ["ignore-rules"] },
      },
      "0xLeif",
      model,
    );
    expect(body).toStartWith(
      "Corvidinho WATCH run summary — Failed (exit 1).\n\nThe model call failed (429 Too Many Requests from api.openai.com)\n\n@0xLeif heads-up: a web-fetch result",
    );
    expect(body.endsWith(FOOT)).toBe(true);
    expect(body).not.toContain(ORG);
    expect(body).not.toContain(REQUEST_ID);
  });
});
