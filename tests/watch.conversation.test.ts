/**
 * AGENT-6.a / SESSION-5 / SESSION-5.a (REQ-watch-472) — WATCH follow-ups
 * pick up the issue or PR thread's summary: each run is kept with its
 * thread's condensed conversation (scrubbed, 30 days, also past the
 * session's soft TTL) and a follow-up on the same issue or PR gets it
 * replayed ahead of the new event and handed to the run, which condenses it
 * (tests/agent.condense.test.ts); the thread keeps the summary the run
 * reports. Forgetting the person deletes it. Fixture only: in-memory DB, fake
 * events and agent, no network.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { planningSelectionText } from "../src/agent/specLoader.ts";
import {
  CONVERSATION_RETENTION_MS,
  forgetConversations,
  formatConversationBlock,
  SUMMARY_LABEL,
} from "../src/store/conversation.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { createEchoAckClient } from "../src/watch/ack.ts";
import type { AgentClient } from "../src/watch/agent-client.ts";
import { startWatchPoller } from "../src/watch/poller.ts";
import type { DetectedEvent } from "../src/watch/types.ts";

const envBase = {
  GITHUB_TOKEN: "fake",
  CORVIDINHO_WATCH_USERNAME: "corvid-agent",
  CORVIDINHO_GITHUB_ALLOW_REPOS: "CorvidLabs/Corvidinho",
  CORVIDINHO_GITHUB_ALLOW_USERS: "0xLeif,someone",
  CORVIDINHO_WATCH_DRY_RUN: "1",
};
const TOKEN = `ghp_${"A1b2C3d4E5".repeat(4)}`;
/** Opening of `WATCH_THREAD_HEADER` (spelled out so the file loads on older sources too). */
const WATCH_THREAD_HEADER = "[Corvidinho earlier conversation on this GitHub issue or PR";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
});

function ev(over: Partial<DetectedEvent> = {}): DetectedEvent {
  return {
    id: over.id ?? "comment-1",
    type: over.type ?? "issue_comment",
    body: over.body ?? "@corvid-agent look at this",
    sender: over.sender ?? "0xLeif",
    repo: over.repo ?? "CorvidLabs/Corvidinho",
    number: over.number ?? 7,
    title: over.title ?? "release",
    htmlUrl: over.htmlUrl ?? "https://example.com/7",
    createdAt: over.createdAt ?? "2026-09-26T12:00:00Z",
    isPullRequest: over.isPullRequest ?? false,
  };
}

async function watcher(env: Record<string, string> = {}) {
  const db = openCorvidinhoDb({ memory: true });
  cleanups.push(() => db.close());
  const clock = { now: 1_000_000_000 };
  const prompts: string[] = [];
  const logs: string[] = [];
  /** SESSION-5.a: the conversation each run was handed (undefined when none). */
  const conversations: Array<Replay | undefined> = [];
  let reply = (n: number) => `answer ${n}`;
  let condense: ((n: number, c: Replay) => Report | undefined) | undefined;
  const agent: AgentClient = {
    async runChat(o) {
      const { prompt, sessionId } = o;
      const conversation = (o as { conversation?: Replay }).conversation;
      prompts.push(prompt);
      conversations.push(conversation);
      const report = conversation ? condense?.(prompts.length, conversation) : undefined;
      return {
        ok: true,
        sessionId,
        summary: reply(prompts.length),
        exitCode: 0,
        ...(report ? { conversation: report } : {}),
      };
    },
  };
  let batch: DetectedEvent[] = [];
  const result = await startWatchPoller({
    env: { ...envBase, ...env },
    filePath: null,
    runLoop: false,
    agent,
    ackClient: createEchoAckClient(),
    log: (line: string) => {
      logs.push(line);
    },
    db,
    now: () => clock.now,
    fetchEvents: async () => batch,
  });
  if (!result.ok) throw new Error("start failed");
  cleanups.unshift(() => result.stop());
  const poll = async (...events: DetectedEvent[]) => {
    batch = events;
    return result.pollOnce();
  };
  return {
    db,
    clock,
    prompts,
    conversations,
    logs,
    poll,
    setReply: (f: (n: number) => string) => {
      reply = f;
    },
    setCondense: (f: ((n: number, c: Replay) => Report | undefined) | undefined) => {
      condense = f;
    },
  };
}

type Replay = { header: string; footer: string; summary: string; turns: Array<{ role: "human" | "agent"; content: string }> };

/** What a run's condensing reports back (SESSION-5.a). */
type Report = {
  summary: string;
  folded: number[];
  by: "model" | "extractive";
  model: string;
  windowTokens: number;
  reason?: string;
};

describe("WATCH follow-ups pick up the thread's conversation (REQ-watch-472)", () => {
  test("a follow-up on the same issue replays the earlier event and answer; another issue does not", async () => {
    const w = await watcher();
    await w.poll(ev({ id: "c1", body: "@corvid-agent the codeword is PELICAN" }));
    await w.poll(ev({ id: "c2", body: "@corvid-agent what was the codeword?" }));
    await w.poll(ev({ id: "c3", number: 8, body: "@corvid-agent unrelated" }));
    expect(w.prompts).toHaveLength(3);
    expect(w.prompts[0]).not.toContain(WATCH_THREAD_HEADER);
    const follow = w.prompts[1]!;
    expect(follow.startsWith(WATCH_THREAD_HEADER)).toBe(true);
    expect(follow.startsWith((await import("../src/watch/poller.ts")).WATCH_THREAD_HEADER)).toBe(true);
    expect(follow).toContain("the codeword is PELICAN");
    expect(follow).toContain("You (Corvidinho): answer 1");
    expect(follow.indexOf("answer 1")).toBeLessThan(follow.lastIndexOf("what was the codeword?"));
    // The block never picks a Planning module (REQ-agent-004).
    expect(planningSelectionText(follow)).not.toContain("PELICAN");
    expect(w.prompts[2]).not.toContain("PELICAN");
  });

  test("past the WATCH session's soft TTL it still replays, for 30 days; then it is purged", async () => {
    const w = await watcher();
    await w.poll(ev({ id: "c1", body: "@corvid-agent the codeword is PELICAN" }));
    w.clock.now += 2 * 60 * 60 * 1000;
    await w.poll(ev({ id: "c2", body: "@corvid-agent what was it?" }));
    expect(w.prompts[1]).toContain("PELICAN");
    w.clock.now += CONVERSATION_RETENTION_MS + 1;
    await w.poll(ev({ id: "c3", body: "@corvid-agent and now?" }));
    expect(w.prompts[2]).not.toContain(WATCH_THREAD_HEADER);
    expect(w.prompts[2]).not.toContain("PELICAN");
  });

  test("the run gets the thread's conversation and condenses it; the thread keeps the model's summary, opening and latest request word for word (SESSION-5.a)", async () => {
    const w = await watcher();
    w.setReply((n) => `answer ${n} ${"a".repeat(500)}`);
    await w.poll(ev({ id: "c1", body: "@corvid-agent OPENING keep the release notes short" }));
    for (let i = 2; i <= 6; i += 1) {
      await w.poll(ev({ id: `c${i}`, body: `@corvid-agent step ${i} ${"d".repeat(300)}` }));
    }
    const MODEL_LINE = "- Summary: MODEL steps 2 to 4 trimmed the release notes";
    // The seventh run's model folded the first answers and steps 2-4.
    w.setCondense((n) =>
      n === 7 ? { summary: MODEL_LINE, folded: [1, 2, 3, 4, 5, 6, 7], by: "model", model: "fake-model", windowTokens: 1024 } : undefined,
    );
    await w.poll(ev({ id: "c7", body: "@corvid-agent LATEST only the changelog" }));
    await w.poll(ev({ id: "c8", body: "@corvid-agent go" }));
    // Nothing is folded in the poller: the run got every earlier turn, and
    // its conversation is exactly the block in its prompt.
    const sent = w.conversations[6]!;
    expect(sent.turns).toHaveLength(12);
    expect(w.prompts[6]).toContain(formatConversationBlock(sent, { header: sent.header, footer: sent.footer }));
    expect(w.conversations[0]).toBeUndefined();

    const last = w.prompts.at(-1)!;
    const block = last.slice(0, last.indexOf("[End of earlier conversation]"));
    expect(block).toContain(SUMMARY_LABEL);
    expect(block).toContain(MODEL_LINE);
    expect(block).toContain("OPENING keep the release notes short");
    expect(block).toContain("LATEST only the changelog");
    expect(block).not.toContain("step 2 ");
    expect(block).toContain("step 5 ");
    const kept = w.db.query("SELECT summary FROM conversation_threads").get() as { summary: string };
    expect(kept.summary.split("\n")[0]).toBe(MODEL_LINE);
  });

  test("an extractive summary (the model's call failed) is kept too, and said in the watcher log", async () => {
    const w = await watcher();
    await w.poll(ev({ id: "c1", body: "@corvid-agent OPENING keep the release notes short" }));
    await w.poll(ev({ id: "c2", body: "@corvid-agent step two" }));
    w.setCondense(() => ({
      summary: "- You (Corvidinho): answer 1",
      folded: [1],
      by: "extractive",
      model: "fake-model",
      windowTokens: 1024,
      reason: "timed out",
    }));
    await w.poll(ev({ id: "c3", body: "@corvid-agent step three" }));
    w.setCondense(undefined);
    await w.poll(ev({ id: "c4", body: "@corvid-agent go" }));
    expect(w.prompts.at(-1)).toContain("- You (Corvidinho): answer 1");
    expect(
      w.logs.some(
        (l) =>
          l.includes("[watch] SESSION-5.a: fake-model did not write the summary (timed out)") &&
          l.includes("CorvidLabs/Corvidinho#7"),
      ),
    ).toBe(true);
  });

  test("a long opening issue comment replays whole: the task is pinned word for word (SESSION-5)", async () => {
    const w = await watcher();
    // The WATCH prompt (header, title, URL and body) is capped at 8000 chars.
    const body = `@corvid-agent OPENING ${"spec detail ".repeat(620)}END-OF-TASK`;
    await w.poll(ev({ id: "c1", body }));
    await w.poll(ev({ id: "c2", body: "@corvid-agent did you get all of it?" }));
    const follow = w.prompts[1]!;
    const block = follow.slice(0, follow.indexOf("[End of earlier conversation]"));
    expect(w.prompts[0]!.length).toBeGreaterThan(7000);
    // Word for word (the block's one-paragraph rule only folds blank lines;
    // SAFE-12 marks the old fence header `(quoted)`, its markers and the
    // fenced words are unchanged).
    const opening = w.prompts[0]!.replace(/\n\n/g, "\n").replace(/^\[untrusted /m, "(quoted) [untrusted ");
    expect(opening).toContain("(quoted) [untrusted GitHub text");
    expect(block).toContain(`Human: ${opening}\n`);
    expect(block).toContain("END-OF-TASK");
  });

  test("the kept conversation is scrubbed, and forgetting the person deletes it", async () => {
    const w = await watcher();
    await w.poll(ev({ id: "c1", body: `@corvid-agent use ${TOKEN}` }));
    await w.poll(ev({ id: "c2", sender: "someone", body: "@corvid-agent me too" }));
    const raw = w.db.query("SELECT summary, turns, participants FROM conversation_threads").all() as Array<{
      summary: string;
      turns: string;
      participants: string;
    }>;
    expect(raw).toHaveLength(1);
    expect(raw[0]!.turns).not.toContain(TOKEN);
    expect(raw[0]!.turns).toContain("[redacted:github-token]");
    expect(JSON.parse(raw[0]!.participants)).toEqual(["github:0xleif", "github:someone"]);
    expect(w.prompts[1]).not.toContain(TOKEN);

    // "someone" only commented: their words are in the thread, so it goes.
    expect(forgetConversations(w.db, { githubLogins: ["SOMEONE"] })).toBe(1);
    await w.poll(ev({ id: "c3", body: "@corvid-agent and?" }));
    expect(w.prompts[2]).not.toContain(WATCH_THREAD_HEADER);
  });
});
