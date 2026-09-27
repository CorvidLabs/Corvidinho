/**
 * SESSION-MULTI-1 / SESSION-MULTI-2 / DISCORD-2.a (REQ-discord-046,
 * REQ-discord-002) — Discord thread sessions are keyed by (thread, user).
 * A second user starting a session in a thread never takes over the first
 * user's plain-message continuation: not while the first user has an open
 * button ask, not after the second session ends, and not after a restart.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyConfig } from "../src/allowlist/types.ts";
import { toPendingAsk } from "../src/discord/ask-buttons.ts";
import { routeMessage } from "../src/discord/message-router.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import type { InboundMessage, RouteAction, SessionStub } from "../src/discord/types.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";

const CHAN = "chan-allowed";
const THREAD = "thread-9";
const A = "user-a";
const B = "user-b";

function allowlist() {
  const cfg = emptyConfig();
  cfg.discord.channels = [CHAN];
  return cfg;
}

let seq = 0;
function inThread(authorId: string, content: string, mentionedBot: boolean): InboundMessage {
  seq += 1;
  return {
    id: `m-${seq}`,
    channelId: CHAN,
    threadId: THREAD,
    authorId,
    authorBot: false,
    content: mentionedBot ? `<@999> ${content}` : content,
    mentionedBot,
  };
}

function sessionOf(action: RouteAction, kind: "start_session" | "continue_session"): SessionStub {
  expect(action.kind).toBe(kind);
  if (action.kind !== kind) throw new Error(`expected ${kind}, got ${action.kind}`);
  return action.session;
}

/** A starts and continues in the thread, then B starts their own there. */
function twoUsersInThread(store: SessionStore) {
  const deps = { store, allowlist: allowlist() };
  const a = sessionOf(routeMessage(inThread(A, "open a thread talk", true), deps), "start_session");
  expect(sessionOf(routeMessage(inThread(A, "more from A", false), deps), "continue_session").id).toBe(a.id);
  const b = sessionOf(routeMessage(inThread(B, "my own question", true), deps), "start_session");
  expect(b.id).not.toBe(a.id);
  expect(b.userId).toBe(B);
  expect(b.threadId).toBe(THREAD);
  return { deps, a, b };
}

describe("thread sessions keyed by (thread, user) (SESSION-MULTI-1 / DISCORD-2.a)", () => {
  test("a second user's session in the thread never takes over the first user's plain-message continuation", () => {
    const store = new SessionStore();
    const { deps, a, b } = twoUsersInThread(store);

    const aNext = routeMessage(inThread(A, "A again after B joined", false), deps);
    expect(sessionOf(aNext, "continue_session").id).toBe(a.id);
    if (aNext.kind === "continue_session") expect(aNext.prompt).toBe("A again after B joined");

    expect(sessionOf(routeMessage(inThread(B, "B follow-up", false), deps), "continue_session").id).toBe(b.id);
    expect(sessionOf(routeMessage(inThread(A, "A once more", false), deps), "continue_session").id).toBe(a.id);

    // Each user's own session in the thread; no user gets another's.
    expect(store.getByThread(THREAD, A)?.id).toBe(a.id);
    expect(store.getByThread(THREAD, B)?.id).toBe(b.id);
    expect(store.getByThread(THREAD, "user-c")).toBeUndefined();
    expect(store.getByThread("thread-other", A)).toBeUndefined();

    // A third user with no session of their own in the thread is not pulled
    // into A's or B's: a plain message is ignored, an @mention starts theirs.
    const cPlain = routeMessage(inThread("user-c", "just chatting", false), deps);
    expect(cPlain).toEqual({ kind: "ignore", reason: "no_mention" });
    const c = sessionOf(routeMessage(inThread("user-c", "me too", true), deps), "start_session");
    expect([a.id, b.id]).not.toContain(c.id);
    expect(store.list()).toHaveLength(3);
  });

  test("ending the second user's thread session leaves the first user's continuation intact", async () => {
    const store = new SessionStore();
    const { deps, a, b } = twoUsersInThread(store);
    await store.endSession(b);

    expect(sessionOf(routeMessage(inThread(A, "still here", false), deps), "continue_session").id).toBe(a.id);
    expect(store.getByThread(THREAD, B)).toBeUndefined();
    expect(routeMessage(inThread(B, "hello?", false), deps)).toEqual({ kind: "ignore", reason: "no_mention" });
  });

  test("without a user, getByThread returns the thread's most recently active session", () => {
    // Every clock read is 1 ms later, so each touch is newer than the last.
    let now = 1_000_000;
    const store = new SessionStore({ now: () => (now += 1) });
    const { deps, a, b } = twoUsersInThread(store);
    expect(store.getByThread(THREAD)?.id).toBe(b.id);
    routeMessage(inThread(A, "A is active again", false), deps);
    expect(store.getByThread(THREAD)?.id).toBe(a.id);
    expect(store.getByThread("thread-other")).toBeUndefined();
  });

  test("both users keep their own thread session across a restart (SQLite reload)", () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-thread-user-"));
    try {
      const path = join(dir, "corvidinho.db");
      const db1 = openCorvidinhoDb({ path });
      const { a, b } = twoUsersInThread(new SessionStore({ db: db1 }));
      db1.close();

      const db2 = openCorvidinhoDb({ path });
      const store2 = new SessionStore({ db: db2 });
      const deps = { store: store2, allowlist: allowlist() };
      expect(sessionOf(routeMessage(inThread(A, "A after restart", false), deps), "continue_session").id).toBe(a.id);
      expect(sessionOf(routeMessage(inThread(B, "B after restart", false), deps), "continue_session").id).toBe(b.id);
      db2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("open button ask in a thread (SESSION-MULTI-2)", () => {
  test("another user talks in the thread while one has an open button ask; both work independently", () => {
    const store = new SessionStore();
    const deps = { store, allowlist: allowlist() };
    const a = sessionOf(routeMessage(inThread(A, "deploy the thing", true), deps), "start_session");
    const ask = toPendingAsk(
      {
        reason: "clarify",
        question: "Which target?",
        options: [
          { id: "stage", label: "Staging" },
          { id: "prod", label: "Production" },
        ],
      },
      { askId: "ask_a" },
    );
    store.setPendingAsk(a, ask);

    const b = sessionOf(routeMessage(inThread(B, "unrelated question", true), deps), "start_session");
    expect(b.id).not.toBe(a.id);
    expect(b.pendingAsk ?? null).toBeNull();
    expect(sessionOf(routeMessage(inThread(B, "B keeps going", false), deps), "continue_session").id).toBe(b.id);

    // A keeps talking in their own session; their buttons stay valid.
    const aNext = sessionOf(routeMessage(inThread(A, "also bump the version", false), deps), "continue_session");
    expect(aNext.id).toBe(a.id);
    expect(aNext.pendingAsk?.askId).toBe("ask_a");
    expect(aNext.pendingAsk?.expiresAt).toBe(ask.expiresAt);
    expect(store.get(b.id)?.pendingAsk ?? null).toBeNull();
  });
});
