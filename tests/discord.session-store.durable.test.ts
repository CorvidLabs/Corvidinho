import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionStore } from "../src/discord/session-store.ts";
import { WorkStore } from "../src/discord/work-store.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { routeMessage } from "../src/discord/message-router.ts";
import { emptyConfig } from "../src/allowlist/types.ts";

describe("durable SessionStore + WorkStore (REQ-discord-019 / SESSION)", () => {
  test("session + bot/thread maps survive reopen from SQLite", () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-sess-"));
    try {
      const path = join(dir, "corvidinho.db");
      const db1 = openCorvidinhoDb({ path });
      const store1 = new SessionStore({ db: db1, ttlMs: 45 * 60 * 1000 });
      const s = store1.create({
        channelId: "chan-1",
        userId: "user-1",
        threadId: "thread-9",
        topic: "hi",
      });
      store1.trackBotMessage("bot-msg-1", s);
      db1.close();

      const db2 = openCorvidinhoDb({ path });
      const store2 = new SessionStore({ db: db2, ttlMs: 45 * 60 * 1000 });
      expect(store2.get(s.id)?.id).toBe(s.id);
      expect(store2.getByThread("thread-9")?.id).toBe(s.id);
      expect(store2.getByBotMessage("bot-msg-1")?.id).toBe(s.id);
      expect(store2.list().map((x) => x.id)).toEqual([s.id]);
      db2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("soft TTL expiry refuses continue; activity keep-alive continues", () => {
    let now = 1_000_000;
    const ttlMs = 45 * 60 * 1000;
    const db = openCorvidinhoDb({ memory: true });
    const store = new SessionStore({
      db,
      ttlMs,
      now: () => now,
    });
    const s = store.create({
      channelId: "chan-allowed",
      userId: "user-1",
      threadId: "thread-ttl",
    });
    store.trackBotMessage("bot-ttl", s);

    // Within TTL — continue via thread
    now += ttlMs - 1000;
    const cfg = emptyConfig();
    cfg.discord.channels = ["chan-allowed"];
    const cont = routeMessage(
      {
        id: "m2",
        channelId: "chan-allowed",
        threadId: "thread-ttl",
        authorId: "user-1",
        authorBot: false,
        content: "still here",
        mentionedBot: false,
      },
      { store, allowlist: cfg, nowMs: now },
    );
    expect(cont.kind).toBe("continue_session");
    if (cont.kind === "continue_session") {
      expect(cont.session.id).toBe(s.id);
    }

    // Past TTL — getByThread undefined; mention starts fresh
    now += ttlMs + 5_000;
    expect(store.getByThread("thread-ttl")).toBeUndefined();
    expect(store.getByBotMessage("bot-ttl")).toBeUndefined();
    expect(store.get(s.id)).toBeUndefined();

    const start = routeMessage(
      {
        id: "m3",
        channelId: "chan-allowed",
        threadId: "thread-ttl",
        authorId: "user-1",
        authorBot: false,
        content: "hello <@bot>",
        mentionedBot: true,
      },
      { store, allowlist: cfg, nowMs: now },
    );
    expect(start.kind).toBe("start_session");
    if (start.kind === "start_session") {
      expect(start.session.id).not.toBe(s.id);
    }
  });

  test("WorkStore persists across reopen", () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-work-"));
    try {
      const path = join(dir, "corvidinho.db");
      const db1 = openCorvidinhoDb({ path });
      const w1 = new WorkStore({ db: db1 });
      const task = w1.create({
        description: "ship it",
        userId: "u1",
        channelId: "c1",
      });
      w1.setStatus(task, "completed", "done");
      db1.close();

      const db2 = openCorvidinhoDb({ path });
      const w2 = new WorkStore({ db: db2 });
      const listed = w2.list();
      expect(listed).toHaveLength(1);
      expect(listed[0]?.id).toBe(task.id);
      expect(listed[0]?.status).toBe("completed");
      expect(listed[0]?.summary).toBe("done");
      db2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
