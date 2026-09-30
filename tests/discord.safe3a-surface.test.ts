/**
 * SAFE-3.a (REQ-discord-735, REQ-watch-735): every spawning client stamps the
 * surface a run came from in `CORVIDINHO_ACTING_SURFACE`, always overwritten,
 * never inherited: the bridge's chat message → `chat`, an ask-button pick
 * continuing the talk → `ask`, `/session start` → `session`, `/work` →
 * `work`, a schedule tick → `schedule`, a WATCH event → `watch`; a Discord
 * spawn that names none gets an empty stamp. The shell gate
 * (src/agent/shell-gate.ts) offers the shell, runners and Fledge runs only on
 * chat, ask, session and work.
 *
 * Fake spawn bins, a recording agent client, the bridge with a null gateway
 * and the scheduler in manual mode; no token, no network.
 */
import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HumanAsk } from "../src/agent/types.ts";
import { emptyConfig } from "../src/allowlist/types.ts";
import type { AgentClient, AgentRunChatOpts } from "../src/discord/agent-client.ts";
import { createSpawnAgentClient as createDiscordClient } from "../src/discord/agent-client.ts";
import { pickCustomId } from "../src/discord/ask-buttons.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createNullGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import type { SlashInteraction } from "../src/discord/slash-types.ts";
import { ScheduleStore } from "../src/scheduler/store.ts";
import { SchedulerService } from "../src/scheduler/service.ts";
import { createSpawnAgentClient as createWatchClient } from "../src/watch/agent-client.ts";

const SURFACE = "CORVIDINHO_ACTING_SURFACE";
const OWNER = "181969874455756800";
const CHAN = "999000000000000011";

const temps: string[] = [];
let saved: string | undefined;

function tempDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  temps.push(d);
  return d;
}

beforeEach(() => {
  saved = process.env[SURFACE];
});

afterEach(() => {
  if (saved === undefined) delete process.env[SURFACE];
  else process.env[SURFACE] = saved;
});

afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});

describe("the spawn clients stamp the surface, never inherited (SAFE-3.a)", () => {
  test("Discord: the caller's surface, else empty; WATCH: always watch", async () => {
    const dir = tempDir("corvidinho-safe3a-surface-");
    const bin = join(dir, "fake-cli.ts");
    writeFileSync(bin, `console.log("surface=[" + (process.env.${SURFACE} ?? "unset") + "]");\n`);
    // A stale stamp in the bridge's or watcher's own env never reaches a run.
    process.env[SURFACE] = "chat";
    const discord = createDiscordClient({ bin, cwd: dir });
    const run = async (o: Partial<AgentRunChatOpts>) =>
      (await discord.runChat({ prompt: "hi", sessionId: "s1", actingUserId: OWNER, actingIsAdmin: true, ...o }))
        .summary;
    for (const surface of ["chat", "ask", "session", "work", "schedule"] as const) {
      expect(await run({ surface })).toContain(`surface=[${surface}]`);
    }
    expect(await run({})).toContain("surface=[]");
    const watch = createWatchClient({ bin, cwd: dir });
    expect((await watch.runChat({ prompt: "gh", sessionId: "w1" })).summary).toContain("surface=[watch]");
  });
});

describe("each Discord surface and the scheduler pass their own surface (REQ-discord-735)", () => {
  test("chat message → chat, ask pick → ask, /session start → session, /work → work", async () => {
    const ask: HumanAsk = {
      reason: "clarify",
      question: "Which one?",
      options: [
        { id: "1", label: "the first" },
        { id: "2", label: "the second" },
      ],
    };
    const calls: AgentRunChatOpts[] = [];
    const agent: AgentClient = {
      async runChat(opts) {
        calls.push(opts);
        return calls.length === 1
          ? {
              ok: true,
              sessionId: opts.sessionId,
              summary: "need input",
              exitCode: 0,
              ask,
              task: { verified: false, verifySkipped: true, state: "blocked" },
            }
          : { ok: true, sessionId: opts.sessionId, summary: "done", exitCode: 0 };
      },
    };
    const box: { handlers: GatewayHandlers | null } = { handlers: null };
    const result = await startBridge({
      env: {
        DISCORD_BOT_TOKEN: "fake",
        DISCORD_CHANNEL_IDS: CHAN,
        CORVIDINHO_DISCORD_DRY_RUN: "1",
        CORVIDINHO_ALLOWLIST_FILE: join(tempDir("corvidinho-safe3a-allow-"), "none.toml"),
        CORVIDINHO_OWNER_DISCORD_ID: OWNER,
      },
      projectRoot: tempDir("corvidinho-safe3a-proj-"),
      skipProtocolCheck: true,
      disableScheduler: true,
      thinkingOutbound: memoryThinkingOutbound(),
      thinkingDebounceMs: 0,
      thinkingTickMs: 60_000,
      agent,
      gatewayFactory: async (_cfg, handlers) => {
        box.handlers = handlers;
        let n = 0;
        handlers.reply = async () => ({ messageId: `bot-reply-${++n}` });
        return createNullGateway();
      },
    });
    if (result.ok !== true || !box.handlers) throw new Error("bridge did not start");
    try {
      const h = box.handlers;
      await h.onMessage({
        id: "m1",
        channelId: CHAN,
        authorId: OWNER,
        authorBot: false,
        content: "pick one",
        mentionedBot: true,
      });
      const askId = result.store.list()[0]?.pendingAsk?.askId;
      if (!askId) throw new Error("no button ask");
      await h.onComponent!({
        id: "ix-1",
        customId: pickCustomId(askId, "2"),
        channelId: CHAN,
        userId: OWNER,
        reply: async () => {},
        deleteReply: async () => {},
      });
      const slash = (n: number, command: "session" | "work"): SlashInteraction => ({
        id: `ix-s${n}`,
        commandName: command,
        ...(command === "session" ? { subcommand: "start" } : {}),
        channelId: CHAN,
        userId: OWNER,
        options: command === "session" ? { topic: "look around" } : { description: "fix it" },
        reply: async () => {},
        deferReply: async () => {},
        editReply: async () => ({ messageId: `slash-reply-${n}` }),
        deleteReply: async () => {},
      });
      await h.onSlash?.(slash(1, "session"));
      await h.onSlash?.(slash(2, "work"));
      expect(calls.map((c) => c.surface)).toEqual(["chat", "ask", "session", "work"]);
      // The ask answer continues the same talk (same session, same worktree cwd).
      expect(calls[1]!.sessionId).toBe(calls[0]!.sessionId);
      expect(calls[1]!.cwd).toBe(calls[0]!.cwd);
    } finally {
      await result.stop();
    }
  });

  test("a schedule tick → schedule", async () => {
    const store = new ScheduleStore();
    const seen: AgentRunChatOpts[] = [];
    const agent: AgentClient = {
      async runChat(opts) {
        seen.push(opts);
        return { ok: true, sessionId: opts.sessionId, summary: "done", exitCode: 0 };
      },
    };
    const past = Date.now() - 60_000;
    const s = store.create({
      name: "tick",
      cronExpression: "0 * * * *",
      project: "p",
      prompt: "x",
      createdByUserId: OWNER,
      now: past - 3_600_000,
    });
    s.nextRunAt = past;
    const cfg = emptyConfig();
    const svc = new SchedulerService({ store, agent, allowlist: cfg, manual: true, useWorktrees: false });
    const r = await svc.tick();
    expect(r.started).toContain(s.id);
    for (let i = 0; i < 100 && seen.length === 0; i++) await Bun.sleep(10);
    svc.stop();
    expect(seen.map((o) => o.surface)).toEqual(["schedule"]);
  });
});
