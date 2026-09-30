import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { loadLlmEnv } from "../src/agent/execute.ts";
import type { HumanAsk } from "../src/agent/types.ts";
import { startBridge, memoryThinkingOutbound } from "../src/discord/bridge.ts";
import {
  createEchoAgentClient,
  type AgentClient,
} from "../src/discord/agent-client.ts";
import { pickCustomId } from "../src/discord/ask-buttons.ts";
import {
  createNullGateway,
  type GatewayHandlers,
} from "../src/discord/gateway.ts";
import {
  THINKING_COLORS,
  type DiscordEmbedPayload,
} from "../src/discord/thinking-status.ts";
import { useConfiguredModel } from "./fixtures/fake-llm.ts";

// The footer names the configured model; there is no built-in default
// (AGENT-13), so this file configures one (a priced id; the stub agent calls
// no model).
useConfiguredModel();

/** DISCORD-15: an answer footer is `<before> | <time> [| <after>]` (time from the real clock). */
function answerFooterText(before: string, after?: string) {
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return expect.stringMatching(
    new RegExp(`^${esc(before)} \\| \\d+s${after ? ` \\| ${esc(after)}` : ""}$`),
  );
}

/** The model the bridge shows (DISCORD-3.a): same lookup as the bridge. */
const model = () => loadLlmEnv(process.env).model;

/** Missing allowlist file: never read the operator's allowlist (ALLOW-4). */
const NO_ALLOWLIST = join(mkdtempSync(join(tmpdir(), "corvidinho-thinking-")), "no-allowlist.toml");

describe("bridge thinking status wiring (DISCORD-3)", () => {
  test("mention path posts progress then collapses into final answer (ASK-7)", async () => {
    const box: { handlers: GatewayHandlers | null } = { handlers: null };
    const outbound = memoryThinkingOutbound();
    const replies: Array<{ content: string; messageId: string }> = [];

    const result = await startBridge({
      env: {
        DISCORD_BOT_TOKEN: "fake",
        DISCORD_CHANNEL_IDS: "chan-1",
        CORVIDINHO_DISCORD_DRY_RUN: "1",
        CORVIDINHO_ALLOWLIST_FILE: NO_ALLOWLIST,
      },
      // Temp non-git project: never create real worktrees/branches in this repo.
      projectRoot: mkdtempSync(join(tmpdir(), "corvidinho-bridge-proj-")),
      skipProtocolCheck: true,
      thinkingOutbound: outbound,
      thinkingDebounceMs: 0,
      thinkingTickMs: 60_000,
      agent: createEchoAgentClient({
        delayMs: 20,
        statusUpdates: [
          { tool: "Read", tokens: { estimated: 100 } },
          { tool: "Shell", tokens: { estimated: 250 } },
        ],
      }),
      gatewayFactory: async (_cfg, handlers) => {
        box.handlers = handlers;
        handlers.reply = async ({ content }) => {
          const messageId = `bot_${replies.length + 1}`;
          replies.push({ content, messageId });
          return { messageId };
        };
        return createNullGateway();
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok !== true) return;
    const handlers = box.handlers;
    expect(handlers).not.toBeNull();
    if (!handlers) return;

    await handlers.onMessage({
      id: "m1",
      channelId: "chan-1",
      authorId: "u1",
      authorBot: false,
      content: "@bot do a thing",
      mentionedBot: true,
    });

    expect(outbound.sends.length).toBe(1);
    expect(outbound.sends[0]!.embed).toMatchObject({
      color: THINKING_COLORS.working,
    });
    // Progress edits while working; final is content collapse (no Done+reply).
    expect(outbound.edits.length).toBeGreaterThanOrEqual(1);
    expect(replies).toHaveLength(0);
    const finalEdit = outbound.contentEdits.find(
      (e) => typeof e.content === "string" && e.content.includes("echo:"),
    );
    expect(finalEdit).toBeDefined();
    expect(finalEdit!.messageId).toBe(outbound.sends[0]!.messageId);
    // DISCORD-3.a — footer-only embed (model; no task plumbing from echo).
    expect(finalEdit!.embed).toStrictEqual({
      color: THINKING_COLORS.success,
      footer: { text: answerFooterText(model()) },
    });
    expect(result.store.bySessionId.size).toBe(1);

    await result.stop();
  });

  test("failed agent marks progress error", async () => {
    const box: { handlers: GatewayHandlers | null } = { handlers: null };
    const outbound = memoryThinkingOutbound();

    const result = await startBridge({
      env: {
        DISCORD_BOT_TOKEN: "fake",
        DISCORD_CHANNEL_IDS: "chan-1",
        CORVIDINHO_DISCORD_DRY_RUN: "1",
        CORVIDINHO_ALLOWLIST_FILE: NO_ALLOWLIST,
      },
      // Temp non-git project: never create real worktrees/branches in this repo.
      projectRoot: mkdtempSync(join(tmpdir(), "corvidinho-bridge-proj-")),
      skipProtocolCheck: true,
      thinkingOutbound: outbound,
      thinkingDebounceMs: 0,
      thinkingTickMs: 60_000,
      agent: {
        async runChat() {
          return {
            ok: false,
            sessionId: "x",
            summary: "boom",
            exitCode: 7,
          };
        },
      },
      gatewayFactory: async (_cfg, handlers) => {
        box.handlers = handlers;
        handlers.reply = async ({ content }) => ({
          messageId: `bot_${content.slice(0, 8)}`,
        });
        return createNullGateway();
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok !== true) return;
    const handlers = box.handlers;
    expect(handlers).not.toBeNull();
    if (!handlers) return;

    await handlers.onMessage({
      id: "m2",
      channelId: "chan-1",
      authorId: "u1",
      authorBot: false,
      content: "@bot fail",
      mentionedBot: true,
    });

    // ASK-7 collapse: failure body edited into the progress message.
    const failEdit = outbound.contentEdits.find(
      (e) =>
        typeof e.content === "string" &&
        (e.content.includes("failed") || e.content.includes("exit")),
    );
    expect(failEdit).toBeDefined();
    // DISCORD-3.a — the failure line keeps an error-colored footer-only embed.
    expect(failEdit!.embed).toStrictEqual({
      color: THINKING_COLORS.error,
      footer: { text: answerFooterText(model()) },
    });
    await result.stop();
  });
});

async function bridgeWith(agent: AgentClient) {
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const outbound = memoryThinkingOutbound();
  const replies: string[] = [];
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: "chan-1",
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      CORVIDINHO_ALLOWLIST_FILE: NO_ALLOWLIST,
    },
    // Temp non-git project: never create real worktrees/branches in this repo.
    projectRoot: mkdtempSync(join(tmpdir(), "corvidinho-bridge-proj-")),
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
      return createNullGateway();
    },
  });
  if (result.ok !== true || !box.handlers) throw new Error("bridge failed");
  return { result, handlers: box.handlers, outbound, replies };
}

const MENTION = {
  id: "m1",
  channelId: "chan-1",
  authorId: "u1",
  authorBot: false,
  content: "@bot ship it",
  mentionedBot: true,
};

describe("collapsed answer keeps a footer-only embed (DISCORD-3.a)", () => {
  test("mention answer: model and state/verified/verifySkipped/attempts in the embed footer, never in the body", async () => {
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return {
          ok: true,
          sessionId,
          summary: "Shipped the fix.",
          exitCode: 0,
          task: { state: "done", verified: false, verifySkipped: true, attempts: 2 },
        };
      },
    };
    const { result, handlers, outbound, replies } = await bridgeWith(agent);
    await handlers.onMessage(MENTION);

    expect(replies).toHaveLength(0);
    const answer = outbound.contentEdits.find((e) => e.content === "Shipped the fix.");
    expect(answer).toBeDefined();
    expect(answer!.messageId).toBe(outbound.sends[0]!.messageId);
    expect(answer!.components).toBeNull();
    expect(answer!.embed).toStrictEqual({
      color: THINKING_COLORS.success,
      footer: { text: answerFooterText(model(), "state=done verified=false verifySkipped attempts=2") },
    });
    // The plumbing never reached the body or a separate ✅ Done embed edit.
    expect(String(answer!.content)).not.toContain("state=");
    expect(
      outbound.edits.some((e) =>
        String((e.embed as DiscordEmbedPayload).description ?? "").includes("✅ Done"),
      ),
    ).toBe(false);
    await result.stop();
  });

  test("button pick: the Choose stub has no embed; the answer the pick resumed keeps the footer", async () => {
    const ask: HumanAsk = {
      reason: "clarify",
      question: "Which DB?",
      options: [
        { id: "1", label: "Postgres" },
        { id: "2", label: "SQLite" },
      ],
    };
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
            ask,
            task: { state: "blocked", verified: false, verifySkipped: true, attempts: 1 },
          };
        }
        return {
          ok: false,
          sessionId,
          summary: "Postgres migration failed",
          exitCode: 1,
          task: { state: "failed", verified: false, verifySkipped: false, attempts: 3 },
        };
      },
    };
    const { result, handlers, outbound } = await bridgeWith(agent);
    await handlers.onMessage(MENTION);

    const stub = outbound.contentEdits.find((e) => (e.components ?? []).length > 0);
    expect(stub).toBeDefined();
    expect(stub!.embed).toBeNull();
    const pending = result.store.list()[0]!.pendingAsk!;
    expect(pending.stubMessageId).toBe(stub!.messageId);

    await handlers.onComponent!({
      id: "ix-pick",
      customId: pickCustomId(pending.askId, "1"),
      channelId: "chan-1",
      userId: "u1",
      messageId: pending.stubMessageId!,
      reply: async () => {},
      deleteReply: async () => {},
    });

    expect(n).toBe(2);
    const answer = outbound.contentEdits.at(-1)!;
    expect(answer.messageId).toBe(stub!.messageId);
    expect(String(answer.content)).toContain("failed (exit 1)");
    expect(String(answer.content)).not.toContain("state=");
    expect(answer.components).toBeNull();
    expect(answer.embed).toStrictEqual({
      color: THINKING_COLORS.error,
      footer: { text: answerFooterText(model(), "state=failed verified=false attempts=3") },
    });
    await result.stop();
  });
});
