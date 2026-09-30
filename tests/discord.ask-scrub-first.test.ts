/**
 * SAFE-6.a (REQ-discord-066) — ask questions and choice labels are
 * secret-scrubbed before they are cut or posted. A secret that straddles a
 * cut (the 1500-char question cap, the 80-char label cap) shows as
 * `[redacted:<kind>]`, never as a raw piece shorter than its scrub pattern's
 * minimum, in what the bridge posts (Choose buttons, the Answer stub and its
 * form, an ask restated after a restart) and in what it stores
 * (`discord_sessions.pending_ask`). Option ids keep today's behaviour.
 *
 * The run's ask reaches the bridge as the spawn client parses the child's
 * result frame (`askFromUnknown`, src/discord/agent-client.ts). Fixtures
 * only: a runtime-built fake key, temp SQLite, a null gateway; no network.
 */
import { afterEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ASK_QUESTION_MAX, askFromUnknown } from "../src/agent/ask.ts";
import { ASK_OPTION_LABEL_MAX } from "../src/agent/ask-options.ts";
import type { HumanAsk } from "../src/agent/types.ts";
import type { AgentClient, AgentRunChatOpts } from "../src/discord/agent-client.ts";
import { openCustomId, pickCustomId, type DiscordModal } from "../src/discord/ask-buttons.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import {
  createNullGateway,
  type ComponentInteraction,
  type GatewayHandlers,
} from "../src/discord/gateway.ts";
import type { InboundMessage } from "../src/discord/types.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";

/** A fake GitHub token, built at runtime (never a real key). */
const TOKEN = "gh" + "p_" + "a1B2c3D4e5".repeat(4).slice(0, 36);
/** What a raw piece of it would start with; must never be posted or stored. */
const HEAD = TOKEN.slice(0, 4);
const MARK = "[redacted:github-token]";
const USER = "222233334444555566";
const CHAN = "chan-scrub";

/**
 * `pad` chars ending in a space, then the token, then `tail`. With
 * `pad = max - MARK.length - 1` the whole marker fits before the cut at
 * `max`, while a cut before the scrub keeps `ghp_` plus 19 raw characters —
 * one short of the pattern, so no later scrub catches it.
 */
function straddle(max: number, tail: string, fill = "x"): string {
  const pad = max - MARK.length - 1;
  return `${fill.repeat(pad - 1)} ${TOKEN}${tail}`;
}
const LABEL = straddle(ASK_OPTION_LABEL_MAX, " for the deploy");
const LABEL_SHOWN = `${"x".repeat(ASK_OPTION_LABEL_MAX - MARK.length - 2)} ${MARK}…`;
const QUESTION = straddle(ASK_QUESTION_MAX, " — which region should it use?", "q");
const QUESTION_SHOWN = `${"q".repeat(ASK_QUESTION_MAX - MARK.length - 2)} ${MARK}…`;

/** As the spawn client reads the child's result frame. */
const BUTTON_ASK: HumanAsk = askFromUnknown({
  reason: "clarify",
  question: "Which key should the deploy use?",
  options: [LABEL, "Neither"],
})!;
const FREE_ASK: HumanAsk = askFromUnknown({ reason: "clarify", question: QUESTION })!;

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Everything a bridge posted or showed, as one string. */
type Seen = { payloads: unknown[] };

async function bridgeOn(db: Database, steps: Array<HumanAsk | string>, seen: Seen) {
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const outbound = memoryThinkingOutbound();
  const calls: AgentRunChatOpts[] = [];
  const agent: AgentClient = {
    async runChat(o) {
      calls.push(o);
      const step = steps[calls.length - 1] ?? "done";
      if (typeof step === "string") {
        return {
          ok: true,
          sessionId: o.sessionId,
          summary: step,
          exitCode: 0,
          task: { verified: true, verifySkipped: false, state: "done" },
        };
      }
      return {
        ok: true,
        sessionId: o.sessionId,
        summary: "need input",
        exitCode: 0,
        ask: step,
        task: { verified: false, verifySkipped: true, state: "blocked" },
      };
    },
  };
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: CHAN,
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      // Missing allowlist file: never read the operator's allowlist (ALLOW-4).
      CORVIDINHO_ALLOWLIST_FILE: join(tempDir("corvidinho-scrub-first-"), "none.toml"),
    },
    // Temp non-git project: never create real worktrees in this repo.
    projectRoot: tempDir("corvidinho-scrub-first-proj-"),
    db,
    agent,
    skipProtocolCheck: true,
    disableScheduler: true,
    thinkingOutbound: outbound,
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
    gatewayFactory: async (_cfg, h) => {
      box.handlers = h;
      h.reply = async (opts) => {
        seen.payloads.push(opts);
        seq += 1;
        return { messageId: `bot_${seq}` };
      };
      return createNullGateway();
    },
  });
  if (!result.ok || !box.handlers) throw new Error("bridge did not start");
  seen.payloads.push(outbound);
  cleanups.push(() => result.stop());
  return { result, handlers: box.handlers, calls };
}

function posted(seen: Seen): string {
  return JSON.stringify(seen.payloads);
}

let seq = 0;
function mention(): InboundMessage {
  seq += 1;
  return {
    id: `m_${seq}`,
    channelId: CHAN,
    authorId: USER,
    authorBot: false,
    content: "<@999> set up the deploy",
    mentionedBot: true,
  };
}

function replyTo(messageId: string, content: string): InboundMessage {
  seq += 1;
  return {
    id: `r_${seq}`,
    channelId: CHAN,
    authorId: USER,
    authorBot: false,
    content,
    mentionedBot: false,
    referencedMessageId: messageId,
  };
}

/** A press by the requester; ephemeral replies and opened forms are recorded. */
async function press(
  handlers: GatewayHandlers,
  customId: string,
  seen: Seen,
): Promise<{ eph: Array<Record<string, unknown>>; modals: DiscordModal[] }> {
  seq += 1;
  const eph: Array<Record<string, unknown>> = [];
  const modals: DiscordModal[] = [];
  const ix: ComponentInteraction = {
    id: `ix_${seq}`,
    customId,
    channelId: CHAN,
    userId: USER,
    reply: async (o) => {
      eph.push(o as Record<string, unknown>);
    },
    showModal: async (m) => {
      modals.push(m);
    },
    deleteReply: async () => {},
  };
  await handlers.onComponent!(ix);
  seen.payloads.push(eph, modals);
  return { eph, modals };
}

function buttonLabels(eph: Array<Record<string, unknown>>): string[] {
  const rows = (eph[0]?.components ?? []) as Array<{ components: Array<{ label: string }> }>;
  return rows.flatMap((r) => r.components.map((b) => b.label));
}

function storedRow(db: Database): string {
  const row = db.query("SELECT pending_ask FROM discord_sessions WHERE pending_ask IS NOT NULL").get() as
    | { pending_ask: string }
    | null;
  if (!row) throw new Error("no stored ask");
  return row.pending_ask;
}

describe("SAFE-6.a: chat asks are scrubbed before they are cut or posted", () => {
  test("a choice label whose secret straddles the 80-char cut is [redacted:<kind>] on the Choose buttons, in the stored row and in the pick", async () => {
    const db = openCorvidinhoDb({ memory: true });
    cleanups.push(() => db.close());
    const seen: Seen = { payloads: [] };
    const b = await bridgeOn(db, [BUTTON_ASK, "Using the new key"], seen);
    await b.handlers.onMessage(mention());
    const pending = b.result.store.list()[0]!.pendingAsk!;
    expect(pending.options?.map((o) => o.label)).toEqual([LABEL_SHOWN, "Neither"]);

    const row = storedRow(db);
    expect(row).not.toContain(HEAD);
    expect(JSON.parse(row).options).toEqual([
      { id: "1", label: LABEL_SHOWN },
      { id: "2", label: "Neither" },
    ]);

    const { eph } = await press(b.handlers, openCustomId(pending.askId), seen);
    expect(buttonLabels(eph)).toEqual([LABEL_SHOWN, "Neither"]);
    await press(b.handlers, pickCustomId(pending.askId, "1"), seen);
    expect(b.calls).toHaveLength(2);
    expect(b.calls[1]!.humanText).toBe(LABEL_SHOWN);
    expect(b.calls[1]!.prompt).not.toContain(HEAD);
    expect(posted(seen)).not.toContain(HEAD);
  });

  test("a free-text question whose secret straddles the 1500-char cut is [redacted:<kind>] in the Answer stub, its form and the stored row", async () => {
    const db = openCorvidinhoDb({ memory: true });
    cleanups.push(() => db.close());
    const seen: Seen = { payloads: [] };
    const b = await bridgeOn(db, [FREE_ASK], seen);
    await b.handlers.onMessage(mention());
    const pending = b.result.store.list()[0]!.pendingAsk!;
    expect(pending.options).toBeUndefined();
    expect(pending.question).toBe(QUESTION_SHOWN);

    const row = storedRow(db);
    expect(row).not.toContain(HEAD);
    expect(JSON.parse(row).question).toBe(QUESTION_SHOWN);

    const { modals } = await press(b.handlers, openCustomId(pending.askId), seen);
    expect(modals).toHaveLength(1);
    // A thin reply restates the ask with its Answer button; nothing runs.
    await b.handlers.onMessage(replyTo(pending.stubMessageId!, "ok"));
    expect(b.calls).toHaveLength(1);
    expect(posted(seen)).not.toContain(HEAD);
  });

  test("after a restart the reloaded ask — and a stored label past the cut — still posts [redacted:<kind>]; ids unchanged", async () => {
    const path = join(tempDir("corvidinho-scrub-first-db-"), "corvidinho.db");
    const db1 = openCorvidinhoDb({ path });
    const seen: Seen = { payloads: [] };
    const first = await bridgeOn(db1, [BUTTON_ASK], seen);
    await first.handlers.onMessage(mention());
    const asked = first.result.store.list()[0]!.pendingAsk!;
    await first.result.stop();
    db1.close();

    // Restart: a new bridge on the same data reloads the open ask.
    const db2 = openCorvidinhoDb({ path });
    cleanups.push(() => db2.close());
    const second = await bridgeOn(db2, ["Using the new key"], seen);
    const reloaded = second.result.store.findPendingAsk(asked.askId)!.ask;
    expect(reloaded.options).toEqual([
      { id: "1", label: LABEL_SHOWN },
      { id: "2", label: "Neither" },
    ]);
    const { eph } = await press(second.handlers, openCustomId(asked.askId), seen);
    expect(buttonLabels(eph)).toEqual([LABEL_SHOWN, "Neither"]);

    await second.result.stop();

    // A stored row whose label runs past the cut with the secret across it
    // (written raw, as no build of this one does) is scrubbed before it is
    // cut when it loads, so its restated buttons carry no raw piece either.
    db2.run("UPDATE discord_sessions SET pending_ask = ?", [
      JSON.stringify({ ...JSON.parse(storedRow(db2)), options: [
        { id: "use-new", label: LABEL },
        { id: "2", label: "Neither" },
      ] }),
    ]);
    const third = await bridgeOn(db2, ["Using the new key"], seen);
    const again = await press(third.handlers, openCustomId(asked.askId), seen);
    expect(buttonLabels(again.eph)).toEqual([LABEL_SHOWN, "Neither"]);
    await third.handlers.onMessage(replyTo(asked.stubMessageId!, "ok"));
    await press(third.handlers, pickCustomId(asked.askId, "use-new"), seen);
    expect(third.calls.at(-1)!.humanText).toBe(LABEL_SHOWN);
    expect(posted(seen)).not.toContain(HEAD);
  });
});
