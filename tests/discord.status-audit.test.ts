/**
 * SAFE-5 on Discord (REQ-discord-095): the bridge verifies the audit chain
 * from its own DB with the bot-VM key at start (logged) and `/status` shows
 * the chain line, recomputed on each call. Fixtures only: fake gateway,
 * in-memory DB — no live Discord, no network.
 */
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendAudit, argsDigest } from "../src/audit/index.ts";
import type { AgentClient } from "../src/discord/agent-client.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createNullGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import type { SlashInteraction, SlashReplyPayload } from "../src/discord/slash-types.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";

const KEY = "audit-status-test-key";

const agent: AgentClient = {
  async runChat({ sessionId }) {
    return { ok: true, sessionId, summary: "x", exitCode: 0 };
  },
};

const dirs: string[] = [];
const tmp = (prefix: string) => {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
};

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function keyedDb(rows: number) {
  const db = openCorvidinhoDb({ memory: true });
  for (let i = 0; i < rows; i += 1) {
    appendAudit(
      db,
      { action: `act-${i}`, actor: "u1", surface: "cli", argsDigest: argsDigest([String(i)]), outcome: "ok", exitCode: 0 },
      { key: KEY },
    );
  }
  return db;
}

async function start(db: ReturnType<typeof openCorvidinhoDb>, env: Record<string, string>) {
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const outbound = memoryThinkingOutbound();
  const logs: string[] = [];
  const spy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  let result: Awaited<ReturnType<typeof startBridge>>;
  try {
    result = await startBridge({
      env: {
        DISCORD_BOT_TOKEN: "fake",
        DISCORD_CHANNEL_IDS: "chan-1",
        CORVIDINHO_DISCORD_DRY_RUN: "1",
        CORVIDINHO_OWNER_DISCORD_ID: "111122223333444455",
        CORVIDINHO_ALLOWLIST_FILE: join(tmp("corvidinho-status-audit-"), "none.toml"),
        ...env,
      },
      db,
      projectRoot: tmp("corvidinho-status-audit-proj-"),
      skipProtocolCheck: true,
      disableScheduler: true,
      thinkingOutbound: { sendEmbed: outbound.sendEmbed, editEmbed: outbound.editEmbed },
      thinkingDebounceMs: 0,
      thinkingTickMs: 60_000,
      agent,
      gatewayFactory: async (_cfg, handlers) => {
        box.handlers = handlers;
        return createNullGateway();
      },
    });
  } finally {
    spy.mockRestore();
  }
  if (!result.ok || !box.handlers) throw new Error("bridge did not start");
  const handlers = box.handlers;
  const status = async (): Promise<string> => {
    const replies: SlashReplyPayload[] = [];
    const ix: SlashInteraction = {
      id: `ix_${Math.random()}`,
      commandName: "status",
      channelId: "chan-1",
      userId: "user-1",
      options: {},
      reply: async (p) => void replies.push(p),
    };
    await handlers.onSlash!(ix);
    return replies[0]?.content ?? "";
  };
  return { result, status, auditLogs: logs.filter((l) => l.startsWith("[discord] Audit:")) };
}

describe("bridge audit line (REQ-discord-095 / SAFE-5)", () => {
  test("start log and /status verify the real DB with CORVIDINHO_AUDIT_HMAC_KEY; /status recomputes after tampering", async () => {
    const db = keyedDb(2);
    const { result, status, auditLogs } = await start(db, { CORVIDINHO_AUDIT_HMAC_KEY: KEY });
    try {
      expect(auditLogs).toEqual(["[discord] Audit: 2 entries · chain OK (keyed)"]);
      expect(await status()).toContain("Audit: 2 entries · chain OK (keyed)");

      db.exec("DROP TRIGGER audit_log_no_update");
      db.run("UPDATE audit_log SET actor = 'mallory' WHERE seq = 1");
      const after = await status();
      expect(after).toContain("Audit: 2 entries · chain BROKEN at #1");
      expect(after).not.toContain("chain OK");
    } finally {
      await result.stop();
    }
  });

  test("without the key, keyed rows are reported as unverifiable at start and in /status", async () => {
    const db = keyedDb(2);
    const { result, status, auditLogs } = await start(db, { CORVIDINHO_AUDIT_HMAC_KEY: "" });
    try {
      const line = "Audit: 2 entries · cannot verify keyed rows (CORVIDINHO_AUDIT_HMAC_KEY not set)";
      expect(auditLogs).toEqual([`[discord] ${line}`]);
      expect(await status()).toContain(line);
    } finally {
      await result.stop();
    }
  });
});
