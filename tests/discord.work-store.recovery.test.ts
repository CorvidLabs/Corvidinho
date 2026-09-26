/**
 * Restart recovery for /work tasks (REQ-discord-087 / SESSION-WORKTREE-3).
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEchoAgentClient } from "../src/discord/agent-client.ts";
import { startBridge } from "../src/discord/bridge.ts";
import { createNullGateway } from "../src/discord/gateway.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import { WorkStore } from "../src/discord/work-store.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";

describe("WorkStore.recoverAbandoned", () => {
  test("queued/running tasks from a dead process are failed honestly and persisted", () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-work-rec-"));
    try {
      const path = join(dir, "corvidinho.db");
      const db1 = openCorvidinhoDb({ path });
      const ws1 = new WorkStore({ db: db1 });
      const running = ws1.create({ description: "build", userId: "u", channelId: "c" });
      ws1.setStatus(running, "running");
      const queued = ws1.create({ description: "later", userId: "u", channelId: "c" });
      const done = ws1.create({ description: "old", userId: "u", channelId: "c" });
      ws1.setStatus(done, "completed", "ok");
      db1.close();

      const db2 = openCorvidinhoDb({ path });
      const ws2 = new WorkStore({ db: db2 });
      const recovered = ws2.recoverAbandoned();
      expect(recovered.map((t) => t.id).sort()).toEqual([queued.id, running.id].sort());
      expect(ws2.byId.get(running.id)?.status).toBe("failed");
      expect(ws2.byId.get(running.id)?.summary).toContain("was running");
      expect(ws2.byId.get(queued.id)?.summary).toContain("was queued");
      expect(ws2.byId.get(done.id)?.status).toBe("completed");
      expect(ws2.countByStatus("running") + ws2.countByStatus("queued")).toBe(0);
      expect(ws2.recoverAbandoned()).toEqual([]);
      db2.close();

      const db3 = openCorvidinhoDb({ path });
      expect(new WorkStore({ db: db3 }).byId.get(running.id)?.status).toBe("failed");
      db3.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("bridge start runs restart recovery", () => {
  test("abandoned work is failed and its talk ended before new work", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const projectRoot = mkdtempSync(join(tmpdir(), "corvidinho-rec-proj-"));
    const sessions = new SessionStore({ db, defaultProjectRoot: projectRoot });
    const session = sessions.create({ channelId: "chan-1", userId: "u", topic: "work" });
    const ws = new WorkStore({ db });
    const task = ws.create({ description: "x", userId: "u", channelId: "chan-1", sessionId: session.id });
    ws.setStatus(task, "running");

    const result = await startBridge({
      env: { DISCORD_BOT_TOKEN: "fake", DISCORD_CHANNEL_IDS: "chan-1", CORVIDINHO_DISCORD_DRY_RUN: "1" },
      projectRoot,
      db,
      skipProtocolCheck: true,
      disableScheduler: true,
      agent: createEchoAgentClient(),
      gatewayFactory: async () => createNullGateway(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workStore.byId.get(task.id)?.status).toBe("failed");
    expect(result.store.get(session.id)).toBeUndefined();
    await result.stop();
    rmSync(projectRoot, { recursive: true, force: true });
  });
});
