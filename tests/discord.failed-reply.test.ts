/**
 * DISCORD-3.b (#122) — when a run fails, the owner's own runs say why in one
 * plain line; everyone else gets "That didn't work — the owner has been
 * told.", and the reason is always logged.
 *
 * Leif's live failure: "show me a gif of a dog" → `session sess_… failed
 * (exit 1)` with no reason anywhere. Covers the reason itself (harness text
 * only: the result frame's `error`, the AGENT-10 no-provider notice, the
 * stderr end; SAFE-6 scrubbed, one line, no host paths or stack frames), the
 * owner DM (true, deduplicated, never claimed when it did not go out), the log
 * line, and every surface that posts a failed run: chat, an ask pick,
 * `/session start`, `/work` and a schedule's result post — with the
 * DISCORD-3.a plumbing still only in the embed footer. The end-to-end case
 * spawns the real `task run` against a localhost model that answers 401.
 * Fixtures only: stub agents, a dry-run bridge whose gateway stub captures
 * `sendDm`, in-memory SQLite, a localhost mock provider. No network.
 */
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseNdjsonLine, resultFrame, serializeFrame } from "../src/agent/events-ndjson.ts";
import * as loop from "../src/agent/loop.ts";
import * as providers from "../src/agent/providers.ts";
import { NO_PROVIDER_NOTICE } from "../src/agent/providers.ts";
import type { TaskResult } from "../src/agent/types.ts";
import { emptyConfig } from "../src/allowlist/types.ts";
import { createSpawnAgentClient, type AgentClient } from "../src/discord/agent-client.ts";
import { pickCustomId } from "../src/discord/ask-buttons.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import {
  createFailureOwnerDm,
  FAILED_TEXT,
  FAILED_TOLD_OWNER_TEXT,
  FAILURE_DM_DEDUP_MS,
  FAILURE_REASON_MAX,
  failedRunReply,
  failureReasonFor,
  formatFailureDm,
  plainFailureLine,
} from "../src/discord/failure-reason.ts";
import { createNullGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import type { SendPrivateDm } from "../src/discord/private-reply.ts";
import type { SlashInteraction, SlashReplyPayload } from "../src/discord/slash-types.ts";
import type { AgentSpawnResult } from "../src/discord/types.ts";
import { SchedulerService } from "../src/scheduler/service.ts";
import { ScheduleStore } from "../src/scheduler/store.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { useConfiguredModel } from "./fixtures/fake-llm.ts";
import { teamPeopleFile } from "./fixtures/team-people.ts";

// The footer names the configured model; the stub agents call no model. Its
// key is unset, so a run with no reason of its own falls back to the AGENT-10
// notice ("gpt-4o-mini needs CORVIDINHO_LLM_API_KEY …").
useConfiguredModel();

const OWNER_ID = "111122223333444455";
const OWNER = { discordId: OWNER_ID, display: "Leif" };
const TEAM_ID = "222233334444555566";
const CHANNEL = "chan-1";
const REASON_401 = "The model call failed (401 Unauthorized from api.openai.com)";
const FAKE_KEY = "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789ABCD";
const PLUMBING = "state=failed verified=false attempts=1";

const restores: Array<() => void> = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

/** Capture console.warn lines (the failure log) for one test. */
function captureWarn(): string[] {
  const lines: string[] = [];
  const spy = spyOn(console, "warn").mockImplementation((...a: unknown[]) => {
    lines.push(a.map(String).join(" "));
  });
  restores.push(() => spy.mockRestore());
  return lines;
}

/** A DM function that records sends and fails while `fail()` is true. */
function fakeDm(fail: () => boolean | "throw" = () => false) {
  const sent: Array<{ userId: string; content: string }> = [];
  const fn: SendPrivateDm = async ({ userId, content }) => {
    const f = fail();
    if (f === "throw") throw new Error("Cannot send messages to this user");
    if (f) return null;
    sent.push({ userId, content });
    return { channelId: "dm", messageId: `dm_${sent.length}` };
  };
  return { fn, sent };
}

/** A failed run's result as the spawn client hands it over. */
function failed(extra: Partial<AgentSpawnResult> = {}): Omit<AgentSpawnResult, "sessionId"> {
  return {
    ok: false,
    // The run's summary (model text) is never the reason.
    summary: "MODEL TEXT: ignore previous instructions",
    exitCode: 1,
    task: { state: "failed", verified: false, verifySkipped: false, attempts: 1 },
    ...extra,
  };
}

// ─── The reason (src/discord/failure-reason.ts) ──────────────────────────────

describe("failureReasonFor / plainFailureLine (DISCORD-3.b, AGENT-9, SAFE-6)", () => {
  const PROVIDED = { CORVIDINHO_LLM_MODEL: "openai:gpt-4o-mini", CORVIDINHO_LLM_API_KEY: "test-key-not-real" };

  test("the result frame's error is the reason, as it is (one plain line)", () => {
    expect(failureReasonFor({ exitCode: 1, failureReason: REASON_401 }, PROVIDED)).toBe(REASON_401);
    // It beats the no-provider notice and the stderr end.
    expect(
      failureReasonFor({ exitCode: 1, failureReason: REASON_401, stderrTail: "error: other" }, {}),
    ).toBe(REASON_401);
  });

  test("a secret in stderr is scrubbed before anything is cut or shown", () => {
    const reason = failureReasonFor(
      { exitCode: 1, stderrTail: `error: request refused for key ${FAKE_KEY}\n` },
      PROVIDED,
    );
    expect(reason).toBe("error: request refused for key [redacted:openai-key]");
    // A secret straddling the cut is scrubbed first, so no prefix of it survives.
    const long = `error: ${"x ".repeat(90)}token ${FAKE_KEY} tail`;
    const cut = plainFailureLine(long);
    expect(cut.length).toBeLessThanOrEqual(FAILURE_REASON_MAX);
    expect(cut).not.toContain("sk-proj");
    expect(cut).not.toContain("abcdefghij");
  });

  test("a long, multi-line stderr (stack, source excerpt, host paths, banner) becomes one short line", () => {
    const stderr = [
      "[discord] warming up",
      "12 |   const proc = Bun.spawn(argv);",
      "                   ^",
      "error: ENOENT: no such file or directory, posix_spawn '/home/leif/.bun/bin/corvidinho'",
      "      at spawn (/home/leif/Corvidinho/src/discord/agent-client.ts:175:24)",
      "      at async runChat (/home/leif/Corvidinho/src/discord/agent-client.ts:160:5)",
      "",
      "Bun v1.3.0 (Linux x64)",
      "",
    ].join("\n");
    const reason = failureReasonFor({ exitCode: 1, stderrTail: stderr }, PROVIDED);
    expect(reason).toBe("error: ENOENT: no such file or directory, posix_spawn '…/corvidinho'");
    expect(reason).not.toContain("\n");
    expect(reason).not.toContain("/home/");
    expect(reason).not.toMatch(/\bat \w/);
    expect(reason).not.toContain("Bun v");
    // A very long line is cut to the cap, at a word end with an ellipsis.
    const huge = plainFailureLine(`error: ${"word ".repeat(200)}`);
    expect(huge.length).toBeLessThanOrEqual(FAILURE_REASON_MAX);
    expect(huge.endsWith("…")).toBe(true);
    expect(huge).not.toContain("\n");
    // URLs keep their host; mass mentions are defanged; ANSI codes dropped.
    expect(plainFailureLine("\x1b[31merror:\x1b[0m https://api.openai.com/v1 said no @everyone")).toBe(
      "error: https://api.openai.com/v1 said no @​everyone",
    );
  });

  test("with no reason from the run: the AGENT-10 no-provider notice, else the stderr end, else the exit code — never the summary", () => {
    const noProvider = failureReasonFor({ exitCode: 1, stderrTail: "error: something else" }, {});
    expect(noProvider).toBe(`${NO_PROVIDER_NOTICE}: CORVIDINHO_LLM_MODEL is not set.`);
    const noKey = failureReasonFor({ exitCode: 1 }, { CORVIDINHO_LLM_MODEL: "openai:gpt-4o-mini" });
    expect(noKey).toBe(`${NO_PROVIDER_NOTICE}: gpt-4o-mini needs CORVIDINHO_LLM_API_KEY or OPENAI_API_KEY, which is not set.`);
    expect(failureReasonFor({ exitCode: 1, stderrTail: "\n  \n" }, PROVIDED)).toBe(
      "The run failed (exit 1) without saying why",
    );
    expect(failureReasonFor({ exitCode: 130 }, PROVIDED)).toBe("The run was interrupted before it finished");
    expect(failureReasonFor({}, PROVIDED)).toBe("The run failed without saying why");
  });
});

describe("modelCallFailedLine (DISCORD-3.b): which model call failed and how, never the reply body", () => {
  // Read off the module at call time (the fail-on-base proof loads this file
  // against the base's providers.ts, which has no such export).
  const modelCallFailedLine = (...a: Parameters<typeof providers.modelCallFailedLine>) =>
    providers.modelCallFailedLine(...a);
  const provider = { baseUrl: "https://api.openai.com/v1", entry: { kind: "openai" as const, model: "gpt-4o-mini" } };
  test("each failure kind", () => {
    expect(modelCallFailedLine({ kind: "http", status: 401 }, provider)).toBe(REASON_401);
    expect(modelCallFailedLine({ kind: "http", status: 599 }, provider)).toBe("The model call failed (599 from api.openai.com)");
    expect(modelCallFailedLine({ kind: "timeout" }, provider)).toBe("The model call timed out (api.openai.com)");
    expect(modelCallFailedLine({ kind: "network" }, provider)).toBe("The model call failed (network error reaching api.openai.com)");
    expect(modelCallFailedLine({ kind: "malformed" }, provider)).toBe("The model call failed (malformed reply from api.openai.com)");
    expect(modelCallFailedLine({ kind: "no-key", keyEnv: "ANTHROPIC_API_KEY" }, { baseUrl: "https://api.anthropic.com/v1", entry: { kind: "anthropic", model: "claude-x" } })).toBe(
      "The model call failed (anthropic:claude-x needs ANTHROPIC_API_KEY, which is not set)",
    );
    expect(modelCallFailedLine(null, null)).toBe(NO_PROVIDER_NOTICE);
  });

  test("verify failures name themselves", () => {
    expect(loop.verifyGaveUpReason(2)).toBe("Verification failed after 2 retries");
    expect(loop.VERIFY_RERUN_FAILED_REASON).toStartWith("Verification failed when re-run");
  });
});

describe("createFailureOwnerDm (the owner is really told, once per reason per hour)", () => {
  test("the same reason within the hour sends one DM; another reason or a later hour sends again", async () => {
    const dm = fakeDm();
    const clock = { now: 1_000_000 };
    const ownerDm = createFailureOwnerDm({ owner: () => OWNER, sendDm: () => dm.fn, now: () => clock.now });
    expect(await ownerDm.tell({ reason: REASON_401, surface: "chat", channelId: CHANNEL })).toBe(true);
    expect(dm.sent).toEqual([{ userId: OWNER_ID, content: `❌ A run failed (chat in <#${CHANNEL}>): ${REASON_401}` }]);
    clock.now += FAILURE_DM_DEDUP_MS - 1;
    expect(await ownerDm.tell({ reason: REASON_401, surface: "work", channelId: "other" })).toBe(true);
    expect(dm.sent).toHaveLength(1);
    expect(await ownerDm.tell({ reason: "The model call timed out (api.openai.com)", surface: "chat" })).toBe(true);
    expect(dm.sent).toHaveLength(2);
    expect(dm.sent[1]!.content).toBe("❌ A run failed (chat): The model call timed out (api.openai.com)");
    clock.now += 1;
    expect(await ownerDm.tell({ reason: REASON_401, surface: "chat" })).toBe(true);
    expect(dm.sent).toHaveLength(3);
  });

  test("a DM that does not go out is false and not remembered; no owner or no DM path is false", async () => {
    let fail: boolean | "throw" = true;
    const dm = fakeDm(() => fail);
    const ownerDm = createFailureOwnerDm({ owner: () => OWNER, sendDm: () => dm.fn });
    expect(await ownerDm.tell({ reason: REASON_401, surface: "chat" })).toBe(false);
    fail = "throw";
    expect(await ownerDm.tell({ reason: REASON_401, surface: "chat" })).toBe(false);
    fail = false;
    expect(await ownerDm.tell({ reason: REASON_401, surface: "chat" })).toBe(true);
    expect(dm.sent).toHaveLength(1);
    expect(await createFailureOwnerDm({ owner: () => null, sendDm: () => dm.fn }).tell({ reason: "r", surface: "chat" })).toBe(false);
    expect(await createFailureOwnerDm({ owner: () => OWNER, sendDm: () => undefined }).tell({ reason: "r", surface: "chat" })).toBe(false);
    expect(formatFailureDm({ reason: "r", surface: "schedule sch_1", channelId: " " })).toBe("❌ A run failed (schedule sch_1): r");
  });
});

describe("failedRunReply", () => {
  test("owner: the reason; anyone else: told (DM went out) or the plain line; always one log line", async () => {
    const log: string[] = [];
    const run = { exitCode: 1, failureReason: REASON_401 };
    expect(await failedRunReply({ run, ownerRun: true, surface: "chat", log: (l) => log.push(l) })).toBe(REASON_401);
    const dm = fakeDm();
    const ownerDm = createFailureOwnerDm({ owner: () => OWNER, sendDm: () => dm.fn });
    expect(await failedRunReply({ run, ownerRun: false, surface: "work", channelId: CHANNEL, ownerDm, log: (l) => log.push(l) })).toBe(
      FAILED_TOLD_OWNER_TEXT,
    );
    const broken = createFailureOwnerDm({ owner: () => OWNER, sendDm: () => fakeDm(() => true).fn });
    expect(await failedRunReply({ run, ownerRun: false, surface: "session", ownerDm: broken, log: (l) => log.push(l) })).toBe(FAILED_TEXT);
    expect(await failedRunReply({ run, ownerRun: false, surface: "ask", log: (l) => log.push(l) })).toBe(FAILED_TEXT);
    expect(log).toEqual([
      `[discord] run failed (chat, exit 1): ${REASON_401}`,
      `[discord] run failed (work, exit 1): ${REASON_401}`,
      `[discord] run failed (session, exit 1): ${REASON_401}`,
      `[discord] run failed (ask, exit 1): ${REASON_401}`,
    ]);
    expect(FAILED_TOLD_OWNER_TEXT).toBe("That didn't work — the owner has been told.");
    expect(FAILED_TEXT).toBe("That didn't work.");
  });
});

// ─── The result frame and the spawn client ───────────────────────────────────

const ROOT = join(import.meta.dir, "..");

/** A localhost provider that answers every chat call with 401 and a body quoting a key. */
function unauthorizedLlm() {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(JSON.stringify({ error: { message: `Incorrect API key provided: ${FAKE_KEY}` } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
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

describe("task run: a failed run's result frame carries a plain `error` (real CLI)", () => {
  test("a model call that answers 401: the error names the status and host, never the body; no provider: the AGENT-10 notice", async () => {
    const llm = unauthorizedLlm();
    try {
      const run = async (env: Record<string, string>) => {
        const proc = Bun.spawn(["bun", join(ROOT, "src/cli.ts"), "task", "run", "--task", "show me a gif of a dog", "--output", "ndjson"], {
          cwd: mkdtempSync(join(tmpdir(), "corvidinho-failed-reply-cli-")),
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, ...env },
        });
        const [code, out] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
        const frame = out.split("\n").map((l) => parseNdjsonLine(l)).find((f) => f?.type === "result");
        if (frame?.type !== "result") throw new Error("no result frame");
        return { code, result: frame.result };
      };
      const denied = await run(llm.env);
      expect(denied.code).toBe(1);
      expect(denied.result.state).toBe("failed");
      expect(denied.result.error).toBe(`The model call failed (401 Unauthorized from ${llm.host})`);
      expect(JSON.stringify(denied.result.error)).not.toContain("Incorrect API key");
      const none = await run({ CORVIDINHO_LLM_MODEL: "", CORVIDINHO_LLM_TIER: "tool" });
      expect(none.code).toBe(1);
      expect(none.result.error).toStartWith(`${NO_PROVIDER_NOTICE}: CORVIDINHO_LLM_MODEL is not set.`);
    } finally {
      llm.stop();
    }
  }, 60_000);

  test("the spawn client hands over the frame's error, and the stderr end when there is no frame", async () => {
    const bin = (script: string) => {
      const dir = mkdtempSync(join(tmpdir(), "corvidinho-failed-reply-bin-"));
      const path = join(dir, "corvidinho");
      writeFileSync(path, `#!/bin/sh\n${script}`, { mode: 0o755 });
      chmodSync(path, 0o755);
      return { dir, path };
    };
    const base: TaskResult = {
      summary: "LLM HTTP 401: body text",
      filesChanged: [],
      verified: false,
      verifySkipped: false,
      cancelled: false,
      state: "failed",
      attempts: 1,
      error: REASON_401,
    };
    const framed = bin(`cat <<'EOF'\n${serializeFrame(resultFrame(base))}\nEOF\nexit 1\n`);
    const a = await createSpawnAgentClient({ bin: framed.path, cwd: framed.dir }).runChat({ prompt: "p", sessionId: "s1" });
    expect(a.ok).toBe(false);
    expect(a.failureReason).toBe(REASON_401);
    const crashed = bin(`echo "error: boom at /home/leif/x.ts ${FAKE_KEY}" >&2\nexit 3\n`);
    const b = await createSpawnAgentClient({ bin: crashed.path, cwd: crashed.dir }).runChat({ prompt: "p", sessionId: "s2" });
    expect(b.exitCode).toBe(3);
    expect(b.failureReason).toBeUndefined();
    expect(b.stderrTail).toContain("error: boom");
    expect(b.stderrTail!.length).toBeLessThanOrEqual(4000);
    expect(failureReasonFor(b, { CORVIDINHO_LLM_MODEL: "ollama:m" })).toBe("error: boom at …/x.ts [redacted:openai-key]");
    // A run that succeeded carries neither.
    const ok = bin(`cat <<'EOF'\n${serializeFrame(resultFrame({ ...base, state: "done", verified: true, error: undefined }))}\nEOF\necho noise >&2\n`);
    const c = await createSpawnAgentClient({ bin: ok.path, cwd: ok.dir }).runChat({ prompt: "p", sessionId: "s3" });
    expect(c.ok).toBe(true);
    expect(c.failureReason).toBeUndefined();
    expect(c.stderrTail).toBeUndefined();
  });
});

// ─── Bridge surfaces ─────────────────────────────────────────────────────────

type Dm = { userId: string; content: string };

async function bridgeWith(
  agent: AgentClient,
  opts: { owner?: boolean; failDms?: () => boolean } = {},
) {
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const outbound = memoryThinkingOutbound();
  const replies: string[] = [];
  const dms: Dm[] = [];
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: CHANNEL,
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      // The non-owner is a declared team member (so /work runs for them).
      CORVIDINHO_ALLOWLIST_FILE: teamPeopleFile(TEAM_ID),
      ...(opts.owner === false ? {} : { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID }),
    },
    db: openCorvidinhoDb({ memory: true }),
    projectRoot: mkdtempSync(join(tmpdir(), "corvidinho-failed-reply-proj-")),
    skipProtocolCheck: true,
    disableScheduler: true,
    thinkingOutbound: outbound,
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
    agent,
    gatewayFactory: async (_cfg, handlers) => {
      box.handlers = handlers;
      handlers.reply = async ({ content }) => {
        replies.push(content);
        return { messageId: `bot_${replies.length}` };
      };
      handlers.sendDm = async ({ userId, content }) => {
        if (opts.failDms?.()) return null;
        dms.push({ userId, content });
        return { channelId: `dm_${userId}`, messageId: `dm_${dms.length}` };
      };
      return createNullGateway();
    },
  });
  if (!result.ok || !box.handlers) throw new Error("bridge did not start");
  restores.push(() => void result.stop());
  return { result, handlers: box.handlers, outbound, replies, dms };
}

const mention = (authorId: string, id = "m1") => ({
  id,
  channelId: CHANNEL,
  authorId,
  authorBot: false,
  content: "@bot show me a gif of a dog",
  mentionedBot: true,
});

/** The last message body the run posted (the collapsed progress message). */
function lastBody(outbound: ReturnType<typeof memoryThinkingOutbound>): string {
  return String(outbound.contentEdits.at(-1)?.content ?? "");
}

function stubAgent(result: () => Omit<AgentSpawnResult, "sessionId">): AgentClient {
  return {
    async runChat({ sessionId }) {
      return { ...result(), sessionId };
    },
  };
}

describe("chat (DISCORD-3.b)", () => {
  test("the owner's run: the reason is the body; the plumbing stays in the footer (DISCORD-3.a); no DM; one log line", async () => {
    const warns = captureWarn();
    const { handlers, outbound, dms } = await bridgeWith(stubAgent(() => failed({ failureReason: REASON_401 })));
    await handlers.onMessage(mention(OWNER_ID));
    const edit = outbound.contentEdits.at(-1)!;
    expect(edit.content).toBe(REASON_401);
    expect(String(edit.content)).not.toContain("state=");
    expect(String(edit.content)).not.toContain("MODEL TEXT");
    expect(JSON.stringify(edit.embed)).toContain(PLUMBING);
    expect(dms).toEqual([]);
    expect(warns.filter((l) => l.startsWith("[discord] run failed"))).toEqual([
      `[discord] run failed (chat, exit 1): ${REASON_401}`,
    ]);
  });

  test("someone else's run: 'the owner has been told' and it is true — the owner is DMed the reason once per reason", async () => {
    const warns = captureWarn();
    let reason = REASON_401;
    const { handlers, outbound, dms } = await bridgeWith(stubAgent(() => failed({ failureReason: reason })));
    await handlers.onMessage(mention(TEAM_ID, "m1"));
    expect(lastBody(outbound)).toBe(FAILED_TOLD_OWNER_TEXT);
    expect(dms).toEqual([{ userId: OWNER_ID, content: `❌ A run failed (chat in <#${CHANNEL}>): ${REASON_401}` }]);
    // The same reason again: still told, no second DM.
    await handlers.onMessage(mention(TEAM_ID, "m2"));
    expect(lastBody(outbound)).toBe(FAILED_TOLD_OWNER_TEXT);
    expect(dms).toHaveLength(1);
    reason = "The model call timed out (api.openai.com)";
    await handlers.onMessage(mention(TEAM_ID, "m3"));
    expect(dms).toHaveLength(2);
    // The reason never reaches the channel; it is logged every time.
    expect(outbound.contentEdits.some((e) => String(e.content).includes("401"))).toBe(false);
    expect(warns.filter((l) => l.startsWith("[discord] run failed (chat, exit 1)"))).toHaveLength(3);
  });

  test("no DM claim when the DM fails or there is no owner", async () => {
    captureWarn();
    const failing = await bridgeWith(stubAgent(() => failed({ failureReason: REASON_401 })), { failDms: () => true });
    await failing.handlers.onMessage(mention(TEAM_ID));
    expect(lastBody(failing.outbound)).toBe(FAILED_TEXT);
    const ownerless = await bridgeWith(stubAgent(() => failed({ failureReason: REASON_401 })), { owner: false });
    await ownerless.handlers.onMessage(mention(TEAM_ID));
    expect(lastBody(ownerless.outbound)).toBe(FAILED_TEXT);
    expect(ownerless.dms).toEqual([]);
  });

  test("no provider configured: the owner sees the AGENT-10 notice", async () => {
    captureWarn();
    const { handlers, outbound } = await bridgeWith(stubAgent(() => failed()));
    await handlers.onMessage(mention(OWNER_ID));
    expect(lastBody(outbound)).toBe(
      `${NO_PROVIDER_NOTICE}: gpt-4o-mini needs CORVIDINHO_LLM_API_KEY or OPENAI_API_KEY, which is not set.`,
    );
  });

  test("a secret or a multi-line stack in the run's stderr never reaches the owner's reply raw", async () => {
    captureWarn();
    const prev = process.env.CORVIDINHO_LLM_API_KEY;
    process.env.CORVIDINHO_LLM_API_KEY = "test-key-not-real";
    restores.push(() => {
      if (prev === undefined) delete process.env.CORVIDINHO_LLM_API_KEY;
      else process.env.CORVIDINHO_LLM_API_KEY = prev;
    });
    const stderr = `boot\nerror: auth refused for ${FAKE_KEY}\n    at run (/home/leif/Corvidinho/src/cli.ts:1:1)\nBun v1.3.0 (Linux x64)\n`;
    const { handlers, outbound } = await bridgeWith(stubAgent(() => failed({ stderrTail: stderr })));
    await handlers.onMessage(mention(OWNER_ID));
    expect(lastBody(outbound)).toBe("error: auth refused for [redacted:openai-key]");
  });

  test("a run that throws: the owner sees the scrubbed line, anyone else only that it didn't work", async () => {
    captureWarn();
    const agent: AgentClient = {
      async runChat() {
        throw new Error(`spawn /opt/host-only/bin/corvidinho ENOENT ${FAKE_KEY}`);
      },
    };
    const { handlers, outbound, dms } = await bridgeWith(agent);
    await Promise.resolve(handlers.onMessage(mention(OWNER_ID, "m1"))).catch(() => {});
    const ownerFail = JSON.stringify(outbound.edits.at(-1)?.embed ?? outbound.contentEdits.at(-1));
    expect(ownerFail).toContain("❌ spawn …/corvidinho ENOENT [redacted:openai-key]");
    expect(ownerFail).not.toContain("/opt/host-only");
    await Promise.resolve(handlers.onMessage(mention(TEAM_ID, "m2"))).catch(() => {});
    const teamFail = JSON.stringify(outbound.edits.at(-1)?.embed ?? outbound.contentEdits.at(-1));
    expect(teamFail).toContain(`❌ ${FAILED_TOLD_OWNER_TEXT}`);
    expect(teamFail).not.toContain("ENOENT");
    expect(dms).toHaveLength(1);
  });

  test("end to end: a real `task run` whose model call answers 401 — the owner is told why, anyone else that the owner was told", async () => {
    captureWarn();
    const llm = unauthorizedLlm();
    restores.push(llm.stop);
    const agent = createSpawnAgentClient({
      bin: join(ROOT, "src/cli.ts"),
      cwd: mkdtempSync(join(tmpdir(), "corvidinho-failed-reply-e2e-")),
      env: llm.env,
    });
    const { handlers, outbound, dms } = await bridgeWith(agent);
    await handlers.onMessage(mention(OWNER_ID, "m1"));
    const reason = `The model call failed (401 Unauthorized from ${llm.host})`;
    expect(lastBody(outbound)).toBe(reason);
    await handlers.onMessage(mention(TEAM_ID, "m2"));
    expect(lastBody(outbound)).toBe(FAILED_TOLD_OWNER_TEXT);
    expect(dms).toEqual([{ userId: OWNER_ID, content: `❌ A run failed (chat in <#${CHANNEL}>): ${reason}` }]);
    expect(JSON.stringify(outbound.contentEdits)).not.toContain("Incorrect API key");
  }, 60_000);
});

describe("an ask pick resuming a talk (DISCORD-3.b)", () => {
  test("owner pick: the reason; someone else's pick: told, and the owner DMed", async () => {
    captureWarn();
    for (const who of [OWNER_ID, TEAM_ID]) {
      let n = 0;
      const agent: AgentClient = {
        async runChat({ sessionId }) {
          n += 1;
          if (n === 1) {
            return {
              ok: true,
              sessionId,
              summary: "Needs your input",
              exitCode: 0,
              ask: { reason: "clarify", question: "Which DB?", options: [{ id: "1", label: "Postgres" }, { id: "2", label: "SQLite" }] },
              task: { state: "blocked", verified: false, verifySkipped: true, attempts: 1 },
            };
          }
          return { ...failed({ failureReason: REASON_401 }), sessionId };
        },
      };
      const { result, handlers, outbound, dms } = await bridgeWith(agent);
      await handlers.onMessage(mention(who));
      const pending = result.store.list()[0]!.pendingAsk!;
      await handlers.onComponent!({
        id: "ix-pick",
        customId: pickCustomId(pending.askId, "1"),
        channelId: CHANNEL,
        userId: who,
        messageId: pending.stubMessageId!,
        reply: async () => {},
        deleteReply: async () => {},
      });
      expect(n).toBe(2);
      const edit = outbound.contentEdits.at(-1)!;
      expect(edit.content).toBe(who === OWNER_ID ? REASON_401 : FAILED_TOLD_OWNER_TEXT);
      expect(JSON.stringify(edit.embed)).toContain(PLUMBING);
      expect(dms).toEqual(
        who === OWNER_ID ? [] : [{ userId: OWNER_ID, content: `❌ A run failed (ask in <#${CHANNEL}>): ${REASON_401}` }],
      );
    }
  });
});

function slash(commandName: "work" | "session", userId: string) {
  const edits: SlashReplyPayload[] = [];
  const ix: SlashInteraction = {
    id: `ix_${commandName}_${Math.random()}`,
    commandName,
    ...(commandName === "session" ? { subcommand: "start" } : {}),
    channelId: CHANNEL,
    userId,
    options: commandName === "session" ? { topic: "show me a gif of a dog" } : { description: "show me a gif of a dog" },
    reply: async (p) => void edits.push(p),
    deferReply: async () => {},
    editReply: async (p) => void edits.push(p),
    deleteReply: async () => {},
  };
  return { ix, edits };
}

describe("/session start and /work (DISCORD-3.b)", () => {
  for (const command of ["session", "work"] as const) {
    test(`/${command}: the owner's run shows the reason; a team member's says the owner was told (DMed once)`, async () => {
      const warns = captureWarn();
      const { handlers, outbound, dms } = await bridgeWith(stubAgent(() => failed({ failureReason: REASON_401 })));
      const own = slash(command, OWNER_ID);
      await handlers.onSlash!(own.ix);
      const ownerBody = lastBody(outbound) || String(own.edits.at(-1)?.content ?? "");
      expect(ownerBody).toContain(REASON_401);
      expect(ownerBody).not.toContain("failed (exit");
      expect(ownerBody).not.toContain("MODEL TEXT");
      expect(dms).toEqual([]);
      const team = slash(command, TEAM_ID);
      await handlers.onSlash!(team.ix);
      const teamBody = lastBody(outbound) || String(team.edits.at(-1)?.content ?? "");
      expect(teamBody).toContain(FAILED_TOLD_OWNER_TEXT);
      expect(teamBody).not.toContain("401");
      expect(dms).toEqual([{ userId: OWNER_ID, content: `❌ A run failed (${command} in <#${CHANNEL}>): ${REASON_401}` }]);
      expect(warns.filter((l) => l.startsWith(`[discord] run failed (${command}, exit 1)`))).toHaveLength(2);
    });
  }
});

describe("schedule result posts (DISCORD-3.b)", () => {
  async function scheduleRun(opts: { creator: string; failureDm?: boolean; failDm?: boolean }) {
    const db = openCorvidinhoDb({ memory: true });
    restores.push(() => db.close());
    const clock = { now: Date.parse("2026-09-30T10:30:00Z") };
    const store = new ScheduleStore({ db });
    const schedule = store.create({
      name: "Nightly",
      cronExpression: "0 * * * *",
      project: "proj-a",
      prompt: "do thing",
      createdByUserId: opts.creator,
      channelId: CHANNEL,
      now: clock.now,
    });
    const cfg = emptyConfig();
    cfg.discord.channels = [CHANNEL];
    const posts: Array<{ channelId: string; content: string }> = [];
    const dm = fakeDm(() => opts.failDm === true);
    const svc = new SchedulerService({
      store,
      agent: stubAgent(() => failed({ failureReason: REASON_401 })),
      allowlist: cfg,
      manual: true,
      useWorktrees: false,
      owner: OWNER,
      now: () => clock.now,
      ...(opts.failureDm ? { failureDm: createFailureOwnerDm({ owner: () => OWNER, sendDm: () => dm.fn }) } : {}),
      outbound: { post: async (p) => void posts.push(p) },
    });
    clock.now += 3_600_000;
    expect((await svc.tick()).started).toEqual([schedule.id]);
    for (let i = 0; i < 200 && svc.runningIds().length > 0; i++) await Bun.sleep(5);
    const row = db.query("SELECT summary, error FROM schedule_runs WHERE schedule_id = ?").get(schedule.id) as {
      summary: string;
      error: string;
    };
    return { schedule, posts, dms: dm.sent, row };
  }

  test("the owner's schedule posts the reason; someone else's says the owner was told (DMed), or only that it didn't work", async () => {
    const warns = captureWarn();
    const own = await scheduleRun({ creator: OWNER_ID, failureDm: true });
    expect(own.posts).toHaveLength(1);
    expect(own.posts[0]!.content).toBe(`❌ Schedule **Nightly** (\`${own.schedule.id.slice(0, 12)}\`) on \`proj-a\`:\n${REASON_401}`);
    expect(own.dms).toEqual([]);
    expect(own.row).toEqual({ summary: REASON_401, error: `failed (exit 1): ${REASON_401}` });

    const other = await scheduleRun({ creator: TEAM_ID, failureDm: true });
    expect(other.posts[0]!.content).toEndWith(`:\n${FAILED_TOLD_OWNER_TEXT}`);
    expect(other.posts[0]!.content).not.toContain("401");
    expect(other.dms).toEqual([
      { userId: OWNER_ID, content: `❌ A run failed (schedule ${other.schedule.id} in <#${CHANNEL}>): ${REASON_401}` },
    ]);
    // The reason is kept for the owner on the row (never posted).
    expect(other.row.error).toBe(`failed (exit 1): ${REASON_401}`);

    // No DM path (the daemon), or a DM that failed: never claims the owner was told.
    const daemon = await scheduleRun({ creator: TEAM_ID });
    expect(daemon.posts[0]!.content).toEndWith(`:\n${FAILED_TEXT}`);
    const failedDm = await scheduleRun({ creator: TEAM_ID, failureDm: true, failDm: true });
    expect(failedDm.posts[0]!.content).toEndWith(`:\n${FAILED_TEXT}`);

    expect(warns.filter((l) => l.startsWith("[scheduler] run failed (schedule "))).toHaveLength(4);
    expect(warns).toContain(`[scheduler] run failed (schedule ${own.schedule.id}, exit 1): ${REASON_401}`);
  });
});
