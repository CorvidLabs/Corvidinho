/**
 * DISCORD-15 / DISCORD-15.a / DISCORD-16 (#75, REQ-discord-075,
 * REQ-discord-457) — the bridge's final answers: split at Discord's
 * 2000-character limit without breaking code fences (chat reply, button-pick
 * resume, `/work`, `/session start`, and the reply fallbacks), a footer with
 * model and time on every answer plus tokens and cost on the owner's own
 * runs only (unknown, never $0), the live status's token use on owner runs
 * only, the Discord spawn client passing the whole answer and the run's usage
 * through (WATCH keeps its 1800 cap), and the live gateway sending a full
 * 2000-character part with its embed.
 *
 * This file imports only modules that exist on the base branch, so every
 * test here runs (and fails on its assertions) against the base sources.
 * Fixture tests: null gateway, in-memory thinking outbound, injected agents,
 * fake bins; no live Discord, no network, no token.
 */
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "discord.js";
import { resultFrame, serializeFrame, usageFrame } from "../src/agent/events-ndjson.ts";
import { loadLlmEnv } from "../src/agent/execute.ts";
import { costMicroUsd, formatUsd, priceForModel } from "../src/agent/spend.ts";
import type { AgentTokenUsage, HumanAsk, SpendWarning, TaskResult } from "../src/agent/types.ts";
import { emptyConfig } from "../src/allowlist/types.ts";
import { pickCustomId } from "../src/discord/ask-buttons.ts";
import {
  createEchoAgentClient,
  createSpawnAgentClient as createDiscordClient,
  type AgentClient,
} from "../src/discord/agent-client.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { handleSessionStart } from "../src/discord/command-handlers/session.ts";
import { handleWorkCommand } from "../src/discord/command-handlers/work.ts";
import {
  createLiveGateway,
  createNullGateway,
  type GatewayHandlers,
} from "../src/discord/gateway.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import type { SlashContext, SlashInteraction, SlashReplyPayload } from "../src/discord/slash-types.ts";
import type {
  DiscordEmbedPayload,
  EditMessageOpts,
  ThinkingOutbound,
} from "../src/discord/thinking-status.ts";
import type { BridgeConfig } from "../src/discord/types.ts";
import { WorkStore } from "../src/discord/work-store.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { createSpawnAgentClient as createWatchClient } from "../src/watch/agent-client.ts";
import { useConfiguredModel } from "./fixtures/fake-llm.ts";

// The footer names the configured model; there is no built-in default
// (AGENT-13), so this file configures one (a priced id; the stub agent calls
// no model).
useConfiguredModel();

const MAX = 2000;
const OWNER_ID = "111122223333444455";
const OTHER_ID = "222233334444555566";
const model = () => loadLlmEnv(process.env).model;
const NO_ALLOWLIST = join(mkdtempSync(join(tmpdir(), "corvidinho-rich-")), "no-allowlist.toml");

function prose(n: number, tag: string): string {
  return Array.from({ length: n }, (_, i) => `${tag} line ${i}: some words of plain prose here.`).join("\n");
}

/** An answer over two messages long with a code block across the 2000 mark. */
function longAnswer(): string {
  const code = ["```ts", ...Array.from({ length: 70 }, (_, i) => `const v${i} = compute(${i}); // step ${i}`), "```"];
  return `${prose(30, "Intro")}\n\n${code.join("\n")}\n\n${prose(25, "Outro")}`;
}

function fenceCount(text: string): number {
  return text.split("```").length - 1;
}

/** Non-blank lines minus fence lines — what the reader sees, in order. */
function textLines(texts: string[]): string[] {
  return texts
    .join("\n")
    .split("\n")
    .filter((l) => l.trim() && !/^```[A-Za-z0-9_+#.-]*$/.test(l));
}

function esc(t: string): string {
  return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Every part of a split answer: ≤ 2000 chars, fences balanced, all text kept. */
function expectSplit(parts: string[], original: string): void {
  expect(parts.length).toBeGreaterThanOrEqual(2);
  for (const p of parts) {
    expect(p.length).toBeLessThanOrEqual(MAX);
    expect(fenceCount(p) % 2).toBe(0);
  }
  expect(textLines(parts)).toEqual(textLines([original]));
}

async function bridgeWith(
  agent: AgentClient,
  opts: { owner?: string; outbound?: ThinkingOutbound } = {},
) {
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  // The in-memory outbound unless a test brings its own (e.g. no editMessage).
  const outbound = (opts.outbound ?? memoryThinkingOutbound()) as ReturnType<
    typeof memoryThinkingOutbound
  >;
  const replies: Array<{
    content: string;
    embed?: DiscordEmbedPayload;
    replyToMessageId?: string;
    mentionUserIds?: string[];
    messageId: string;
  }> = [];
  const dms: Array<{ userId: string; content: string }> = [];
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: "chan-1",
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      CORVIDINHO_ALLOWLIST_FILE: NO_ALLOWLIST,
      ...(opts.owner ? { CORVIDINHO_OWNER_DISCORD_ID: opts.owner } : {}),
    },
    projectRoot: mkdtempSync(join(tmpdir(), "corvidinho-rich-proj-")),
    skipProtocolCheck: true,
    disableScheduler: true,
    thinkingOutbound: outbound,
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
    agent,
    gatewayFactory: async (_cfg, handlers) => {
      box.handlers = handlers;
      handlers.reply = async (p) => {
        const messageId = `bot_${replies.length + 1}`;
        replies.push({ ...(p as unknown as (typeof replies)[number]), messageId });
        return { messageId };
      };
      handlers.sendDm = async ({ userId, content }) => {
        dms.push({ userId, content });
        return { channelId: `dm_${userId}`, messageId: `dm_${dms.length}` };
      };
      return createNullGateway();
    },
  });
  if (result.ok !== true || !box.handlers) throw new Error("bridge failed");
  return { result, handlers: box.handlers, outbound, replies, dms };
}

function mention(authorId: string) {
  return {
    id: "m1",
    channelId: "chan-1",
    authorId,
    authorBot: false,
    content: "@bot explain it",
    mentionedBot: true,
  };
}

function answerAgent(summary: string, extra: { usage?: AgentTokenUsage } = {}): AgentClient {
  return {
    async runChat({ sessionId }) {
      return { ok: true, sessionId, summary, exitCode: 0, ...extra };
    },
  };
}

type PartPost = { content: string; embed?: unknown; messageId: string };

describe("chat answers are split at 2000 without breaking code fences (DISCORD-16)", () => {
  test("a long answer: first part edited into the thinking message, the rest fresh posts, footer only on the last", async () => {
    const answer = longAnswer();
    expect(answer.length).toBeGreaterThan(2 * MAX);
    const { result, handlers, outbound, replies } = await bridgeWith(answerAgent(answer));
    await handlers.onMessage(mention(OTHER_ID));

    const first = outbound.contentEdits.at(-1)!;
    const posts = ((outbound as { posts?: PartPost[] }).posts ?? []) as PartPost[];
    const parts = [String(first.content), ...posts.map((p) => p.content)];
    expectSplit(parts, answer);
    // The footer (model | time; not the owner: no tokens or cost) rides the last part only.
    expect(first.embed).toBeNull();
    for (const p of posts.slice(0, -1)) expect(p.embed).toBeUndefined();
    const footer = (posts.at(-1)!.embed as DiscordEmbedPayload).footer!.text;
    expect(footer).toMatch(new RegExp(`^${esc(model())} \\| \\d+s$`));
    // No extra reply went out, and a reply to any part continues the session.
    expect(replies).toHaveLength(0);
    const session = result.store.list()[0]!;
    for (const id of [first.messageId, ...posts.map((p) => p.messageId)]) {
      expect(result.store.getByBotMessage(id)?.id).toBe(session.id);
    }
    await result.stop();
  });

  test("long plain prose goes out as one embed with its footer (never code in an embed)", async () => {
    const answer = prose(70, "Essay");
    expect(answer.length).toBeGreaterThan(MAX);
    const { result, handlers, outbound } = await bridgeWith(answerAgent(answer));
    await handlers.onMessage(mention(OTHER_ID));
    const edit = outbound.contentEdits.at(-1)!;
    expect(edit.content).toBeNull();
    const embed = edit.embed as DiscordEmbedPayload;
    expect(embed.description).toBe(answer);
    expect(embed.footer!.text).toMatch(new RegExp(`^${esc(model())} \\| \\d+s$`));
    expect((outbound as { posts?: PartPost[] }).posts ?? []).toHaveLength(0);
    await result.stop();
  });

  test("the ROLES-CHAT-3 note stays whole in the last part", async () => {
    const note = "\n\n(not allowed for your role)";
    const answer = `${longAnswer()}${note}`;
    const { result, handlers, outbound } = await bridgeWith(answerAgent(answer));
    await handlers.onMessage(mention(OTHER_ID));
    const posts = ((outbound as { posts?: PartPost[] }).posts ?? []) as PartPost[];
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.at(-1)!.content.endsWith(note)).toBe(true);
    expect(String(outbound.contentEdits.at(-1)!.content)).not.toContain("not allowed");
    await result.stop();
  });

  test("without an editable thinking message the fallback reply is split too, footer on its last part", async () => {
    const base = memoryThinkingOutbound();
    const noEdit: ThinkingOutbound = { sendEmbed: base.sendEmbed, editEmbed: base.editEmbed };
    const answer = longAnswer();
    const { result, handlers, replies } = await bridgeWith(answerAgent(answer), { outbound: noEdit });
    await handlers.onMessage(mention(OTHER_ID));
    expectSplit(
      replies.map((r) => r.content),
      answer,
    );
    expect(replies[0]!.replyToMessageId).toBe("m1");
    // Later parts reply to nothing and ping nobody (model text never pings).
    for (const r of replies.slice(1)) {
      expect(r.replyToMessageId).toBeUndefined();
      expect(r.mentionUserIds).toEqual([]);
    }
    for (const r of replies.slice(0, -1)) expect(r.embed).toBeUndefined();
    expect(replies.at(-1)!.embed!.footer!.text).toMatch(new RegExp(`^${esc(model())} \\| \\d+s$`));
    await result.stop();
  });

  test("a split fallback reply to someone else carries no SAFE-8 warning line and pings nobody; the owner gets the warning by DM (SAFE-14.a)", async () => {
    const base = memoryThinkingOutbound();
    const noEdit: ThinkingOutbound = { sendEmbed: base.sendEmbed, editEmbed: base.editEmbed };
    const answer = longAnswer();
    const warning: SpendWarning = { spentMicroUsd: 4_100_000, capMicroUsd: 5_000_000, percent: 82 };
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ok: true, sessionId, summary: answer, exitCode: 0, spendWarning: warning };
      },
    };
    const { result, handlers, replies, dms } = await bridgeWith(agent, { outbound: noEdit, owner: OWNER_ID });
    await handlers.onMessage(mention(OTHER_ID));
    // DISCORD-16: the answer alone, split as before.
    expectSplit(
      replies.map((r) => r.content),
      answer,
    );
    for (const r of replies) {
      expect(r.content).not.toContain("82%");
      expect(r.content).not.toContain(`<@${OWNER_ID}>`);
      expect(r.mentionUserIds ?? []).not.toContain(OWNER_ID);
    }
    // DISCORD-15.a: someone else's footer still shows model and time only.
    expect(replies.at(-1)!.embed!.footer!.text).toMatch(new RegExp(`^${esc(model())} \\| \\d+s$`));
    expect(dms).toHaveLength(1);
    expect(dms[0]!.userId).toBe(OWNER_ID);
    expect(dms[0]!.content).toContain("$4.10 of the $5.00 daily cap used in the last 24h (82%)");
    await result.stop();
  });

  test("a split fallback reply keeps the whole answer and pings the owner once on the part that holds the SAFE-13 line", async () => {
    const base = memoryThinkingOutbound();
    const noEdit: ThinkingOutbound = { sendEmbed: base.sendEmbed, editEmbed: base.editEmbed };
    const answer = longAnswer();
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return {
          ok: true,
          sessionId,
          summary: answer,
          exitCode: 0,
          injection: { source: "web-fetch", reasons: ["ignore-rules"] },
        };
      },
    };
    const { result, handlers, replies } = await bridgeWith(agent, { outbound: noEdit, owner: OWNER_ID });
    await handlers.onMessage(mention(OTHER_ID));
    // The SAFE-13 line is appended after the whole answer (never cut to one
    // message), so it lands in a later part.
    const line = replies.at(-1)!.content.split("\n").at(-1)!;
    expect(line).toContain(`🛡️ <@${OWNER_ID}> heads-up: a web-fetch result`);
    expectSplit(
      replies.map((r) => r.content),
      `${answer}\n\n${line}`,
    );
    const holder = replies.find((r) => r.content.includes(`<@${OWNER_ID}>`))!;
    expect(holder).not.toBe(replies[0]);
    expect(holder.mentionUserIds).toEqual([OWNER_ID]);
    for (const r of replies.slice(1)) {
      if (r !== holder) expect(r.mentionUserIds).toEqual([]);
    }
    await result.stop();
  });

  test("a collapsed split answer keeps the whole answer and the ROLES-CHAT-3 note with the SAFE-13 line; the owner gets one ping post", async () => {
    const note = "(not allowed for your role)";
    const answer = `${longAnswer()}\n\n${note}`;
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return {
          ok: true,
          sessionId,
          summary: answer,
          exitCode: 0,
          injection: { source: "web-fetch", reasons: ["ignore-rules"] },
        };
      },
    };
    const { result, handlers, outbound, replies } = await bridgeWith(agent, { owner: OWNER_ID });
    await handlers.onMessage(mention(OTHER_ID));
    const first = outbound.contentEdits.at(-1)!;
    const posts = ((outbound as { posts?: PartPost[] }).posts ?? []) as PartPost[];
    const parts = [String(first.content), ...posts.map((p) => p.content)];
    const line = parts.at(-1)!.split("\n").at(-1)!;
    expect(line).toContain(`🛡️ <@${OWNER_ID}> heads-up: a web-fetch result`);
    expectSplit(parts, `${answer}\n\n${line}`);
    // The role note stays whole, once, in the last part with the owner line.
    expect(parts.filter((p) => p.includes(note))).toEqual([parts.at(-1)!]);
    expect(parts.at(-1)!.endsWith(`${note}\n\n${line}`)).toBe(true);
    // An edit does not notify: the owner gets exactly one fresh ping post.
    const pings = replies.filter((r) => r.mentionUserIds?.includes(OWNER_ID));
    expect(pings).toHaveLength(1);
    await result.stop();
  });

  test("a button-pick resume splits its long answer the same way", async () => {
    const ask: HumanAsk = {
      reason: "clarify",
      question: "Which one?",
      options: [
        { id: "1", label: "Postgres" },
        { id: "2", label: "SQLite" },
      ],
    };
    const answer = longAnswer();
    let n = 0;
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        n += 1;
        return n === 1
          ? { ok: true, sessionId, summary: "Needs your input", exitCode: 0, ask }
          : { ok: true, sessionId, summary: answer, exitCode: 0 };
      },
    };
    const { result, handlers, outbound } = await bridgeWith(agent);
    await handlers.onMessage(mention(OTHER_ID));
    const pending = result.store.list()[0]!.pendingAsk!;
    await handlers.onComponent!({
      id: "ix-pick",
      customId: pickCustomId(pending.askId, "1"),
      channelId: "chan-1",
      userId: OTHER_ID,
      messageId: pending.stubMessageId!,
      reply: async () => {},
      deleteReply: async () => {},
    });
    expect(n).toBe(2);
    const first = outbound.contentEdits.at(-1)!;
    expect(first.messageId).toBe(pending.stubMessageId!);
    const posts = ((outbound as { posts?: PartPost[] }).posts ?? []) as PartPost[];
    expectSplit([String(first.content), ...posts.map((p) => p.content)], answer);
    expect((posts.at(-1)?.embed as DiscordEmbedPayload | undefined)?.footer?.text).toMatch(
      new RegExp(`^${esc(model())} \\| \\d+s$`),
    );
    await result.stop();
  });
});

describe("answer footer: model and time for everyone, tokens and cost on the owner's runs (DISCORD-15/15.a)", () => {
  const usage: AgentTokenUsage = { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 };

  test("the owner's run shows tokens and the priced cost", async () => {
    const { result, handlers, outbound } = await bridgeWith(answerAgent("Short answer.", { usage }), {
      owner: OWNER_ID,
    });
    await handlers.onMessage(mention(OWNER_ID));
    const edit = outbound.contentEdits.at(-1)!;
    expect(edit.content).toBe("Short answer.");
    const price = priceForModel(model());
    const cost = price ? formatUsd(costMicroUsd(price, usage)) : "cost unknown";
    expect((edit.embed as DiscordEmbedPayload).footer!.text).toMatch(
      new RegExp(`^${esc(model())} \\| 2k tokens \\| ${esc(cost)} \\| \\d+s$`),
    );
    await result.stop();
  });

  test("the owner's run without usage shows tokens and cost as unknown, never $0", async () => {
    const { result, handlers, outbound } = await bridgeWith(answerAgent("Short answer."), {
      owner: OWNER_ID,
    });
    await handlers.onMessage(mention(OWNER_ID));
    const text = (outbound.contentEdits.at(-1)!.embed as DiscordEmbedPayload).footer!.text;
    expect(text).toMatch(new RegExp(`^${esc(model())} \\| tokens unknown \\| cost unknown \\| \\d+s$`));
    expect(text).not.toContain("$0");
    await result.stop();
  });

  test("anyone else's run shows model and time only, never amounts", async () => {
    const { result, handlers, outbound } = await bridgeWith(answerAgent("Short answer.", { usage }), {
      owner: OWNER_ID,
    });
    await handlers.onMessage(mention(OTHER_ID));
    const text = (outbound.contentEdits.at(-1)!.embed as DiscordEmbedPayload).footer!.text;
    expect(text).toMatch(new RegExp(`^${esc(model())} \\| \\d+s$`));
    expect(text).not.toContain("token");
    expect(text).not.toContain("$");
    await result.stop();
  });

  test("a free-text ask's Answer button keeps the answer footer, collapsed and on the fallback reply (DISCORD-ASK-4.a)", async () => {
    const ask: HumanAsk = { reason: "clarify", question: "Which database should I target?" };
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ok: true, sessionId, summary: "Needs your input", exitCode: 0, ask };
      },
    };
    const footerRe = new RegExp(`^${esc(model())} \\| \\d+s$`);

    const collapsed = await bridgeWith(agent);
    await collapsed.handlers.onMessage(mention(OTHER_ID));
    const edit = collapsed.outbound.contentEdits.at(-1)!;
    expect(edit.components?.length).toBe(1);
    expect((edit.embed as DiscordEmbedPayload).footer!.text).toMatch(footerRe);
    await collapsed.result.stop();

    const base = memoryThinkingOutbound();
    const noEdit: ThinkingOutbound = { sendEmbed: base.sendEmbed, editEmbed: base.editEmbed };
    const fallback = await bridgeWith(agent, { outbound: noEdit });
    await fallback.handlers.onMessage(mention(OTHER_ID));
    const reply = fallback.replies.at(-1)! as (typeof fallback.replies)[number] & { components?: unknown[] };
    expect(reply.components?.length).toBe(1);
    expect(reply.embed!.footer!.text).toMatch(footerRe);
    const pending = fallback.result.store.list()[0]!.pendingAsk!;
    expect(pending.stubMessageId).toBe(reply.messageId);
    await fallback.result.stop();
  });

  test("the live status shows token use on the owner's runs only", async () => {
    const agent = createEchoAgentClient({
      delayMs: 10,
      statusUpdates: [{ tool: "Read", tokens: { estimated: 250 } }],
    });
    const footers = (outbound: ReturnType<typeof memoryThinkingOutbound>) =>
      outbound.edits.map((e) => String((e.embed as DiscordEmbedPayload).footer?.text ?? ""));

    const other = await bridgeWith(agent, { owner: OWNER_ID });
    await other.handlers.onMessage(mention(OTHER_ID));
    const otherOut = other.outbound;
    expect(footers(otherOut).length).toBeGreaterThan(0);
    expect(footers(otherOut).some((f) => f.includes("tok"))).toBe(false);
    await other.result.stop();

    const owner = await bridgeWith(agent, { owner: OWNER_ID });
    await owner.handlers.onMessage(mention(OWNER_ID));
    const ownerOut = owner.outbound;
    expect(footers(ownerOut).some((f) => f.includes("~250 tok"))).toBe(true);
    await owner.result.stop();
  });
});

// ── /work and /session start ────────────────────────────────────────────────

function initGitRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  const run = (args: string[]) => {
    const p = Bun.spawnSync(["git", ...args], { cwd: dir, stdout: "pipe", stderr: "pipe" });
    if (p.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed`);
  };
  run(["init"]);
  run(["config", "user.email", "test@example.com"]);
  run(["config", "user.name", "Test"]);
  writeFileSync(join(dir, "README.md"), "# test\n");
  run(["add", "."]);
  run(["commit", "-m", "init"]);
}

describe("/work and /session start split long answers (DISCORD-16) with the owner's footer (DISCORD-15)", () => {
  async function withRepo(fn: (store: SessionStore) => Promise<void>): Promise<void> {
    const root = mkdtempSync(join(tmpdir(), "corvidinho-rich-slash-"));
    try {
      const project = join(root, "proj");
      initGitRepo(project);
      process.env.WORKTREE_BASE_DIR = join(root, "wts");
      const store = new SessionStore({
        db: openCorvidinhoDb({ memory: true }),
        ttlMs: 45 * 60 * 1000,
        defaultProjectRoot: project,
      });
      await fn(store);
    } finally {
      delete process.env.WORKTREE_BASE_DIR;
      rmSync(root, { recursive: true, force: true });
    }
  }

  function outboundWith(opts: { editMessage: boolean }) {
    const contentEdits: EditMessageOpts[] = [];
    const posts: Array<{ content: string; embed?: DiscordEmbedPayload; messageId: string }> = [];
    let n = 0;
    const outbound: ThinkingOutbound = {
      async sendEmbed() {
        n += 1;
        return { messageId: `msg_${n}` };
      },
      async editEmbed() {
        return true;
      },
      ...(opts.editMessage
        ? {
            async editMessage(o: EditMessageOpts) {
              contentEdits.push(o);
              return true;
            },
          }
        : {}),
      async sendMessage(o: { content: string; embed?: DiscordEmbedPayload }) {
        n += 1;
        const messageId = `part_${n}`;
        posts.push({ content: o.content, ...(o.embed ? { embed: o.embed } : {}), messageId });
        return { messageId };
      },
    } as ThinkingOutbound;
    return { outbound, contentEdits, posts };
  }

  function ctxFor(
    store: SessionStore,
    outbound: ThinkingOutbound,
    agent: AgentClient,
    extra: Partial<SlashContext> = {},
  ): SlashContext {
    return {
      store,
      workStore: new WorkStore(),
      allowlist: emptyConfig(),
      agent,
      version: "0.0.0",
      protocolVersion: 2,
      startedAt: Date.now(),
      channelIds: ["chan-1"],
      owner: { discordId: OWNER_ID },
      thinkingOutbound: outbound,
      thinkingDebounceMs: 0,
      thinkingTickMs: 60_000,
      openWorkPr: async () => ({
        opened: false as const,
        reason: "verify-failed" as const,
        line: "PR: not opened — test stub",
      }),
      ...extra,
    };
  }

  function slashIx(commandName: string, options: Record<string, string>, subcommand?: string) {
    const edits: SlashReplyPayload[] = [];
    const ix: SlashInteraction = {
      id: "ix",
      commandName,
      subcommand,
      channelId: "chan-1",
      userId: OWNER_ID,
      options,
      reply: async (p) => void edits.push(p),
      deferReply: async () => {},
      editReply: async (p) => {
        edits.push(p);
        return { messageId: "deferred_reply" };
      },
      deleteReply: async () => {},
    };
    return { ix, edits };
  }

  test("/work: the collapsed answer is split fence-safe; the owner's footer (tokens / cost unknown) is on the last part", async () => {
    await withRepo(async (store) => {
      const answer = longAnswer();
      const { outbound, contentEdits, posts } = outboundWith({ editMessage: true });
      const { ix } = slashIx("work", { description: "Explain the module" });
      await handleWorkCommand(ctxFor(store, outbound, answerAgent(answer)), ix);
      const first = String(contentEdits.at(-1)!.content);
      expect(first).toContain("Work task");
      const parts = [first, ...posts.map((p) => p.content)];
      for (const p of parts) {
        expect(p.length).toBeLessThanOrEqual(MAX);
        expect(fenceCount(p) % 2).toBe(0);
      }
      expect(posts.length).toBeGreaterThan(0);
      expect(textLines(parts).slice(-textLines([answer]).length)).toEqual(textLines([answer]));
      expect(contentEdits.at(-1)!.embed).toBeNull();
      expect(posts.at(-1)!.embed!.footer!.text).toMatch(
        new RegExp(`^${esc(model())} \\| tokens unknown \\| cost unknown \\| \\d+s$`),
      );
    });
  });

  test("/session start without an editable thinking message: the deferred reply holds part one, the rest are posted", async () => {
    await withRepo(async (store) => {
      const answer = longAnswer();
      const { outbound } = outboundWith({ editMessage: false });
      const posted: Array<{ content: string; embed?: DiscordEmbedPayload; mentionUserIds?: string[] }> = [];
      const post = async (p: { content: string; embed?: DiscordEmbedPayload; mentionUserIds?: string[] }) => {
        posted.push(p);
        return { messageId: `post_${posted.length}` };
      };
      const { ix, edits } = slashIx("session", { topic: "Walk me through it" }, "start");
      await handleSessionStart(
        ctxFor(store, outbound, answerAgent(answer), { post: post as SlashContext["post"] }),
        ix,
      );
      const firstPart = String(edits.at(-1)!.content);
      expect(firstPart).toContain("started.");
      const parts = [firstPart, ...posted.map((p) => p.content)];
      for (const p of parts) {
        expect(p.length).toBeLessThanOrEqual(MAX);
        expect(fenceCount(p) % 2).toBe(0);
      }
      expect(posted.length).toBeGreaterThan(0);
      expect(textLines(parts).slice(-textLines([answer]).length)).toEqual(textLines([answer]));
      for (const p of posted) expect(p.mentionUserIds).toEqual([]);
      expect(posted.at(-1)!.embed!.footer!.text).toMatch(
        new RegExp(`^${esc(model())} \\| tokens unknown \\| cost unknown \\| \\d+s$`),
      );
    });
  });
});

// ── spawn clients ───────────────────────────────────────────────────────────

function fakeBin(lines: string[]): { bin: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "corvidinho-rich-bin-"));
  const bin = join(dir, "corvidinho");
  const body = lines.map((l) => `cat <<'NDJSON_EOF'\n${l}\nNDJSON_EOF`).join("\n");
  writeFileSync(bin, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  chmodSync(bin, 0o755);
  return { bin, dir };
}

describe("spawn clients: Discord gets the whole answer and the run's usage; WATCH keeps its cap", () => {
  const summary = prose(80, "Answer");
  const result: TaskResult = {
    summary,
    filesChanged: [],
    verified: false,
    verifySkipped: true,
    cancelled: false,
    state: "done",
    attempts: 1,
  };
  const frames = [
    serializeFrame(usageFrame({ promptTokens: 1200, completionTokens: 300, totalTokens: 1500 })),
    serializeFrame(resultFrame(result)),
  ];

  test("the Discord client passes the answer uncut (for the bridge to split) and the last usage frame", async () => {
    expect(summary.length).toBeGreaterThan(MAX);
    expect(summary.length).toBeLessThan(4000);
    const { bin, dir } = fakeBin(frames);
    const out = await createDiscordClient({ bin, cwd: dir }).runChat({ prompt: "x", sessionId: "s1" });
    expect(out.summary).toBe(summary);
    expect((out as { usage?: AgentTokenUsage }).usage).toEqual({
      promptTokens: 1200,
      completionTokens: 300,
      totalTokens: 1500,
    });
  }, 30_000);

  test("the WATCH client still caps the same answer at 1800 characters", async () => {
    const { bin, dir } = fakeBin(frames);
    const out = await createWatchClient({ bin, cwd: dir }).runChat({ prompt: "x", sessionId: "w1" });
    expect(out.summary).toBe(summary.slice(0, 1800));
  }, 30_000);
});

// ── live gateway ────────────────────────────────────────────────────────────

describe("live gateway posts a full 2000-character part with its embed (DISCORD-15/16)", () => {
  test("reply keeps all 2000 characters and forwards the footer embed", async () => {
    const realLogin = Client.prototype.login;
    let client: Client | null = null;
    Client.prototype.login = async function (this: Client, token?: string) {
      client = this;
      (this.ws as unknown as { connect: () => Promise<void> }).connect = async () => {};
      return realLogin.call(this, token);
    };
    const handlers: GatewayHandlers = { onMessage: () => {} };
    let gateway;
    try {
      gateway = await createLiveGateway(
        { token: "fixture-token-not-real", channelIds: ["chan-1"] } as unknown as BridgeConfig,
        handlers,
        { version: "9.9.9" },
      );
      await gateway.start();
    } finally {
      Client.prototype.login = realLogin;
    }
    if (!client) throw new Error("login was not called");
    const sent: Array<Record<string, unknown>> = [];
    (client as Client).channels.fetch = (async () => ({
      send: async (p: Record<string, unknown>) => {
        sent.push(p);
        return { id: "sent_1" };
      },
    })) as never;
    const embed: DiscordEmbedPayload = { color: 1, footer: { text: "gpt-4o-mini | 3s" } };
    const out = await handlers.reply!({
      channelId: "chan-1",
      content: "x".repeat(MAX),
      mentionUserIds: [],
      ...({ embed } as object),
    });
    expect(out).toEqual({ messageId: "sent_1" });
    expect(String(sent[0]!.content)).toHaveLength(MAX);
    expect(sent[0]!.embeds).toEqual([{ description: undefined, color: 1, footer: { text: "gpt-4o-mini | 3s" } }]);
    await gateway!.stop();
  });
});
