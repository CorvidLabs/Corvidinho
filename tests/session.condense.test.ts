/**
 * SESSION-5 / SESSION-6 (REQ-discord-472) — a long conversation is condensed
 * at about 80% of the model's window: the oldest turns fold into a summary,
 * the current task (the opening request) and its latest instruction stay word
 * for word, the summary is stored with the session (scrubbed, SAFE-6), and a
 * restart or a different model picks up from the summary instead of the
 * whole history. Pure functions plus `SessionStore` on a temp / in-memory DB.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { planningSelectionText } from "../src/agent/specLoader.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import {
  SESSION_THREAD_HEADER,
  SESSION_THREAD_MAX_TURNS,
  type SessionTurn,
} from "../src/discord/session-thread.ts";
import type { SessionStub } from "../src/discord/types.ts";
import {
  CONTEXT_WINDOW_DEFAULT_TOKENS,
  CONTEXT_WINDOW_MIN_TOKENS,
  CONVERSATION_PROMPT_MAX_CHARS,
  condenseBudgetChars,
  condenseConversation,
  formatConversationBlock,
  pinnedTurnIndexes,
  resolveContextWindowTokens,
  SUMMARY_LABEL,
  summaryCapChars,
  summaryPoint,
} from "../src/store/conversation.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";

const TTL_MS = 45 * 60 * 1000;
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

function tempDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "corvidinho-condense-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, "corvidinho.db");
}

/** ~`width` chars of distinct words for turn `n` (so points are recognisable). */
function words(tag: string, width: number): string {
  let out = `${tag}:`;
  let i = 0;
  while (out.length < width) out += ` ${tag.toLowerCase()}w${i++}`;
  return out.slice(0, width);
}

function record(store: SessionStore, s: SessionStub, human: string, answer: string): void {
  store.recordTurn(s, "human", human);
  store.recordTurn(s, "agent", answer);
}

function turnRows(db: ReturnType<typeof openCorvidinhoDb>, sessionId: string): string[] {
  return (
    db
      .query("SELECT content FROM discord_session_turns WHERE session_id = ? ORDER BY id")
      .all(sessionId) as Array<{ content: string }>
  ).map((r) => r.content);
}

function storedSummary(db: ReturnType<typeof openCorvidinhoDb>, sessionId: string): string | null {
  const row = db
    .query("SELECT summary FROM conversation_threads WHERE session_id = ?")
    .get(sessionId) as { summary: string } | null;
  return row?.summary ?? null;
}

const HEADER = "[Corvidinho test block]";
const FOOTER = "[End]";
const render = (c: { summary: string; turns: SessionTurn[] }) =>
  formatConversationBlock(c, { header: HEADER, footer: FOOTER });

describe("the model's window (SESSION-5)", () => {
  test("CORVIDINHO_LLM_CONTEXT_TOKENS sets it; unset or invalid falls back to the documented default", () => {
    expect(resolveContextWindowTokens({})).toBe(CONTEXT_WINDOW_DEFAULT_TOKENS);
    expect(CONTEXT_WINDOW_DEFAULT_TOKENS).toBe(8192);
    expect(resolveContextWindowTokens({ CORVIDINHO_LLM_CONTEXT_TOKENS: "32768" })).toBe(32768);
    expect(resolveContextWindowTokens({ CORVIDINHO_LLM_CONTEXT_TOKENS: " 200000 " })).toBe(200000);
    for (const bad of ["", "abc", "0", "-5", "1.5", "12k"]) {
      expect(resolveContextWindowTokens({ CORVIDINHO_LLM_CONTEXT_TOKENS: bad })).toBe(
        CONTEXT_WINDOW_DEFAULT_TOKENS,
      );
    }
    expect(resolveContextWindowTokens({ CORVIDINHO_LLM_CONTEXT_TOKENS: "100" })).toBe(
      CONTEXT_WINDOW_MIN_TOKENS,
    );
  });

  test("the condense budget is 80% of the window (chars/4 tokens), never past the transport ceiling", () => {
    expect(condenseBudgetChars(8192)).toBe(Math.floor(8192 * 0.8) * 4);
    expect(condenseBudgetChars(4096)).toBe(Math.floor(4096 * 0.8) * 4);
    expect(condenseBudgetChars(1_000_000)).toBe(CONVERSATION_PROMPT_MAX_CHARS);
  });
});

describe("condensing a conversation (SESSION-5)", () => {
  const task = words("TASK", 900);
  const latest = words("LATEST", 700);
  function longThread(): SessionTurn[] {
    const turns: SessionTurn[] = [{ role: "human", content: task, createdAt: 0 }];
    turns.push({ role: "agent", content: words("A0", 500), createdAt: 0 });
    for (let n = 1; n <= 12; n += 1) {
      turns.push({ role: "human", content: words(`H${n}`, 500), createdAt: n });
      turns.push({ role: "agent", content: words(`A${n}`, 500), createdAt: n });
    }
    turns.push({ role: "human", content: latest, createdAt: 99 });
    turns.push({ role: "agent", content: words("LASTANSWER", 300), createdAt: 99 });
    return turns;
  }

  test("under 80% nothing is folded; at 80% the oldest turns fold into the summary until it fits", () => {
    const incoming = "and now the next step please";
    const turns = longThread();
    const whole = render({ summary: "", turns }).length + 2 + incoming.length;

    // Budget above the whole prompt: unchanged.
    const roomy = condenseConversation({
      conversation: { summary: "", turns },
      incoming,
      budgetChars: whole + 1,
      render,
    });
    expect(roomy.folded).toEqual([]);
    expect(roomy.summary).toBe("");
    expect(roomy.turns).toEqual(turns);

    // Reaching the budget exactly counts ("at about 80%").
    expect(
      condenseConversation({ conversation: { summary: "", turns }, incoming, budgetChars: whole, render })
        .folded.length,
    ).toBeGreaterThan(0);

    const budget = Math.floor(whole / 2);
    const out = condenseConversation({
      conversation: { summary: "", turns },
      incoming,
      budgetChars: budget,
      render,
    });
    const prompt = `${render(out)}\n\n${incoming}`;
    expect(prompt.length).toBeLessThan(budget);
    expect(out.folded.length).toBeGreaterThan(0);
    // Oldest first: the first folded turn is the answer right after the task.
    expect(out.folded[0]!.content).toStartWith("A0:");
    // Each folded turn is a point of its own opening words in the summary
    // (older points shortened first when the summary is at its cap).
    expect(out.summary).not.toMatch(/left out/);
    for (const f of out.folded) expect(out.summary).toContain(summaryPoint(f).slice(0, 40));
    expect(out.summary).toContain("- You (Corvidinho): A0:");
    expect(out.summary).toContain("- Human: H1:");
    // The task and its latest instruction stay word for word, in order.
    expect(out.turns[0]).toMatchObject({ role: "human", content: task });
    expect(out.turns.some((t) => t.content === latest)).toBe(true);
    expect(prompt).toContain(task);
    expect(prompt).toContain(latest);
    // The newest turns that fit are kept whole; nothing folded remains a turn.
    expect(out.turns.at(-1)!.content).toStartWith("LASTANSWER:");
    for (const f of out.folded) expect(out.turns).not.toContainEqual(f);
    // The task comes first (it predates the condensed turns), then the
    // summary, then the kept turns.
    const block = render(out);
    expect(block.indexOf(task)).toBeLessThan(block.indexOf(SUMMARY_LABEL));
    expect(block.indexOf(SUMMARY_LABEL)).toBeLessThan(block.indexOf(latest));
  });

  test("the task and the latest instruction are never folded, even when nothing else is left", () => {
    const turns = longThread();
    const out = condenseConversation({
      conversation: { summary: "", turns },
      incoming: "x",
      budgetChars: 10,
      render,
    });
    expect(out.turns.map((t) => t.content)).toEqual([task, latest]);
    expect(pinnedTurnIndexes(out.turns)).toEqual(new Set([0, 1]));
    expect(out.folded).toHaveLength(turns.length - 2);
  });

  test("an earlier summary is kept and extended, and stays bounded", () => {
    const turns = longThread();
    const earlier = "- Human: an old point about the release\n- You (Corvidinho): old answer";
    const out = condenseConversation({
      conversation: { summary: earlier, turns },
      incoming: "go",
      budgetChars: 4000,
      render,
    });
    expect(out.summary.startsWith("- Human: an old point about the release") || out.summary.startsWith("(")).toBe(
      true,
    );
    expect(out.summary.length).toBeLessThanOrEqual(summaryCapChars(4000));
    // Bounded: the oldest points go first, counted on the first line.
    const tiny = condenseConversation({
      conversation: { summary: earlier, turns },
      incoming: "go",
      budgetChars: 100,
      render,
    });
    expect(tiny.summary.split("\n")[0]).toMatch(/^\(\d+ earlier points? left out\)$/);
  });

  test("the block stays one paragraph opened by [Corvidinho, so Planning skips it (REQ-agent-004)", () => {
    const out = condenseConversation({
      conversation: {
        summary: "",
        turns: [
          { role: "human", content: "tidy the plugins registry", createdAt: 1 },
          { role: "agent", content: "Plan for the watch poller.\n\n\nStep one: cli.", createdAt: 2 },
          { role: "human", content: "ok and the agent loop?", createdAt: 3 },
          { role: "agent", content: "the discord bridge first", createdAt: 4 },
          { role: "human", content: "fine", createdAt: 5 },
        ],
      },
      incoming: "yes please go ahead",
      budgetChars: 300,
      render: (c) => formatConversationBlock(c, { header: SESSION_THREAD_HEADER, footer: FOOTER }),
    });
    const block = formatConversationBlock(out, { header: SESSION_THREAD_HEADER, footer: FOOTER });
    expect(out.summary).not.toBe("");
    expect(block).not.toMatch(/\r?\n[ \t]*\r?\n/);
    expect(planningSelectionText(`${block}\n\nyes please go ahead`)).toBe("yes please go ahead");
  });
});

describe("SessionStore condenses and keeps the summary with the session (SESSION-5/6)", () => {
  const OPENING = `Task: ${words("OPENING", 1200)}`;
  const LATEST = `Latest: ${words("NEWEST", 900)}`;

  function fill(store: SessionStore, s: SessionStub): void {
    record(store, s, OPENING, words("ANS0", 600));
    for (let n = 1; n <= 10; n += 1) record(store, s, words(`REQ${n}`, 600), words(`ANS${n}`, 600));
    record(store, s, LATEST, words("ANSLAST", 400));
  }

  test("a prompt under 80% of the window replays every turn; at 80% it is condensed, task and latest instruction word for word", () => {
    const db = openCorvidinhoDb({ memory: true });
    cleanups.push(() => db.close());
    const store = new SessionStore({ db, ttlMs: TTL_MS, contextWindowTokens: 1_000_000 });
    const s = store.create({ channelId: "c", userId: "u1" });
    fill(store, s);
    const roomy = store.threadPrompt(s, "the new message");
    expect(roomy).toContain("REQ5:");
    expect(roomy).not.toContain(SUMMARY_LABEL);
    expect(store.summaryFor(s)).toBe("");

    const window = 2048; // budget 1638 tokens ≈ 6552 chars; the thread is ~14k
    const budget = condenseBudgetChars(window);
    const prompt = store.threadPrompt(s, "the new message", { windowTokens: window });
    expect(prompt.length).toBeLessThan(budget);
    expect(prompt).toContain(SUMMARY_LABEL);
    expect(prompt).toContain(OPENING);
    expect(prompt).toContain(LATEST);
    expect(prompt.endsWith("\n\nthe new message")).toBe(true);
    expect(prompt).not.toContain(words("REQ1", 600));
    expect(prompt).toContain("- Human: REQ1:");
    expect(store.summaryFor(s)).toContain("- Human: REQ1:");
  });

  test("the summary is stored with the session, scrubbed, and folded turns leave the live thread (SESSION-6 / SAFE-6)", () => {
    const token = `ghp_${"A1b2C3d4E5".repeat(4)}`;
    const db = openCorvidinhoDb({ memory: true });
    cleanups.push(() => db.close());
    const store = new SessionStore({ db, ttlMs: TTL_MS, contextWindowTokens: 2048 });
    const s = store.create({ channelId: "c", userId: "u1" });
    record(store, s, OPENING, `early answer with ${token}`);
    for (let n = 1; n <= 10; n += 1) record(store, s, words(`REQ${n}`, 600), words(`ANS${n}`, 600));
    record(store, s, LATEST, "ok");
    store.threadPrompt(s, "next");
    const summary = storedSummary(db, s.id)!;
    expect(summary).toContain("- You (Corvidinho): early answer with [redacted:github-token]");
    expect(summary).not.toContain(token);
    const rows = turnRows(db, s.id);
    expect(rows).toEqual(store.threadFor(s).map((t) => t.content));
    expect(rows[0]).toBe(OPENING);
    expect(rows).toContain(LATEST);
    expect(rows.some((r) => r.startsWith("REQ1:"))).toBe(false);
  });

  test("after a restart the prompt picks up from the summary, not the whole history (SESSION-6)", () => {
    const path = tempDbPath();
    const db1 = openCorvidinhoDb({ path });
    const s1 = new SessionStore({ db: db1, ttlMs: TTL_MS, contextWindowTokens: 2048 });
    const s = s1.create({ channelId: "c", userId: "u1" });
    fill(s1, s);
    const before = s1.threadPrompt(s, "next");
    const summary = s1.summaryFor(s);
    expect(summary).not.toBe("");
    db1.close();

    const db2 = openCorvidinhoDb({ path });
    cleanups.push(() => db2.close());
    const s2 = new SessionStore({ db: db2, ttlMs: TTL_MS, contextWindowTokens: 2048 });
    const again = s2.get(s.id)!;
    expect(s2.summaryFor(again)).toBe(summary);
    const after = s2.threadPrompt(again, "next");
    expect(after).toBe(before);
    expect(after).not.toContain(words("REQ1", 600));
    expect(after).toContain(OPENING);
  });

  test("a smaller model picks up from the summary and condenses further to 80% of its own window (SESSION-6)", () => {
    const db = openCorvidinhoDb({ memory: true });
    cleanups.push(() => db.close());
    const store = new SessionStore({ db, ttlMs: TTL_MS, contextWindowTokens: 3072 });
    const s = store.create({ channelId: "c", userId: "u1" });
    fill(store, s);
    store.threadPrompt(s, "next");
    const bigger = store.summaryFor(s);
    const keptBefore = store.threadFor(s).length;

    const small = 1024;
    const prompt = store.threadPrompt(s, "next", { windowTokens: small });
    expect(prompt.length).toBeLessThan(condenseBudgetChars(small));
    expect(store.threadFor(s).length).toBeLessThan(keptBefore);
    expect(prompt).toContain(OPENING);
    expect(prompt).toContain(LATEST);
    // It picks up from the earlier summary: its newest point is still there
    // (shortened), ahead of the points folded for the smaller window.
    const lastPoint = bigger.split("\n").filter((l) => l.startsWith("- ")).at(-1)!;
    const smaller = store.summaryFor(s);
    expect(smaller).toContain(lastPoint.slice(0, 40));
    expect(smaller.length).toBeLessThan(bigger.length + 1);
  });

  test("a turn past the per-session cap is folded into the summary, not lost", () => {
    const db = openCorvidinhoDb({ memory: true });
    cleanups.push(() => db.close());
    const store = new SessionStore({ db, ttlMs: TTL_MS, contextWindowTokens: 1_000_000 });
    const s = store.create({ channelId: "c", userId: "u1" });
    for (let n = 1; n <= SESSION_THREAD_MAX_TURNS / 2 + 3; n += 1) {
      record(store, s, `request number ${n}`, `answer number ${n}`);
    }
    expect(store.threadFor(s)).toHaveLength(SESSION_THREAD_MAX_TURNS);
    expect(store.threadFor(s)[0]!.content).toBe("request number 1");
    expect(store.summaryFor(s)).toContain("- You (Corvidinho): answer number 1");
    expect(store.summaryFor(s)).toContain("- Human: request number 2");
    expect(storedSummary(db, s.id)).toBe(store.summaryFor(s));
  });
});
