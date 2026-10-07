/**
 * MEMORY-ACL-6.a (#101) — someone known only on GitHub can ask there to be
 * forgotten; it forgets only after the owner approves on the card.
 *
 * - A clear "forget me" comment to the watch user from a declared person
 *   (matched by GitHub numeric id, IDENTITY-7) raises the owner's existing
 *   Approve/Deny card (`forget_requests`, src/discord/forget-card.ts) with no
 *   model run; the thread is told the request went to the owner; nothing is
 *   deleted before Approve.
 * - An undeclared sender is told nothing is kept for them (no card); a login
 *   on the people list without a matching account id is not trusted.
 * - Approve deletes the person's memory and their kept GitHub conversations
 *   (by login and by numeric id); the outcome is posted on their thread.
 * - A "forget me" never hides another request on its issue; anything else
 *   (a longer comment, a quoted line) is a normal run.
 *
 * Only APIs that exist on the base are used, so each test fails there on its
 * assertions. Temp allowlist file and data dir, the WATCH poller with
 * injected events, a recording ack client and a fake agent, the bridge with
 * a null gateway; no token, no network.
 */
import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createNullGateway, type ComponentInteraction, type GatewayHandlers } from "../src/discord/gateway.ts";
import { ForgetRequestStore, MemoryStore } from "../src/memory/index.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry } from "../src/plugins/registry.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { ConversationStore, watchThreadKey } from "../src/store/conversation.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { createEchoAckClient, type AckCommentResult } from "../src/watch/ack.ts";
import type { AgentRunChatOpts } from "../src/watch/agent-client.ts";
import { startWatchPoller } from "../src/watch/poller.ts";
import type { DetectedEvent } from "../src/watch/types.ts";
import { approveWithCode } from "./fixtures/approval-code.ts";

const OWNER_ID = "181969874455756800";
const TOFU_DC = "200000000000000002";
const CHAN = "600000000000000006";
const REPO = "CorvidLabs/Corvidinho";
const WATCH_USER = "corvid-agent";

// Tofu: declared with GitHub login and numeric id. Kyn: login only.
const FILE = `[discord]
channels = ["${CHAN}"]
users = []
roles = []
deny_users = []

[github]
repos = ["${REPO}"]
users = ["tofu-dev", "kyn-gh", "stranger-gh"]

[owner]
discord_id = "${OWNER_ID}"
display = "Leif"

[people.tofu]
display = "Tofu"
role = "team"
discord_ids = ["${TOFU_DC}"]
github_logins = ["tofu-dev"]
github_ids = ["4242"]

[people.kyn]
display = "Kyn"
role = "community"
github_logins = ["kyn-gh"]
`;

const KEYS = [
  "CORVIDINHO_DATA_DIR",
  "CORVIDINHO_ALLOWLIST_FILE",
  "CORVIDINHO_ACTING_DISCORD_USER_ID",
  "CORVIDINHO_ACTING_IS_ADMIN",
  "CORVIDINHO_ACTING_ROLE",
  "CORVIDINHO_ACTING_GITHUB_LOGIN",
  "CORVIDINHO_ACTING_GITHUB_ID",
  "CORVIDINHO_ACTING_GITHUB_REPO",
  "CORVIDINHO_DISCORD_REPLY_CHANNEL_ID",
  "CORVIDINHO_DISCORD_REPLY_PARENT_CHANNEL_ID",
  "CORVIDINHO_MEMORY_INMEM",
  "CORVIDINHO_OWNER_DISCORD_ID",
  "CORVIDINHO_AUDIT_HMAC_KEY",
  "DISCORD_MUTED_USER_IDS",
] as const;

let saved: Record<string, string | undefined> = {};
let dir = "";
let path = "";
let dataDir = "";

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  dir = realpathSync(mkdtempSync(join(tmpdir(), "corvidinho-forget-gh-")));
  path = join(dir, "allowlist.toml");
  dataDir = join(dir, "data");
  writeFileSync(path, FILE);
  process.env.CORVIDINHO_ALLOWLIST_FILE = path;
  process.env.CORVIDINHO_DATA_DIR = dataDir;
  clearRegistry();
  loadBuiltins();
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  clearRegistry();
  rmSync(dir, { recursive: true, force: true });
});

function db(): Database {
  return openCorvidinhoDb({ env: process.env });
}

function query<T>(sql: string, ...args: string[]): T[] {
  const d = db();
  try {
    return d.query(sql).all(...args) as T[];
  } finally {
    d.close();
  }
}

function ev(o: Partial<DetectedEvent> & Pick<DetectedEvent, "id" | "body" | "sender" | "number">): DetectedEvent {
  return {
    type: "issue_comment",
    repo: REPO,
    title: `Issue ${o.number}`,
    htmlUrl: `https://github.com/${REPO}/issues/${o.number}`,
    createdAt: "2026-09-29T00:00:00Z",
    isPullRequest: false,
    // Never edited (REQ-watch-1202): the ask is its sender's.
    textEditorIds: [],
    ...o,
  };
}

/**
 * The WATCH poller on the shared data dir, with injected events per poll.
 * `failPost` (read at each post) makes a comment post fail with that result.
 */
async function watcher(
  rounds: DetectedEvent[][],
  failPost?: (o: { issue_number: number; body: string }) => AckCommentResult | null,
) {
  const shared = db();
  const calls: AgentRunChatOpts[] = [];
  const echo = createEchoAckClient();
  const ack = {
    posts: echo.posts,
    async createIssueComment(o: Parameters<typeof echo.createIssueComment>[0]): Promise<AckCommentResult> {
      return failPost?.(o) ?? echo.createIssueComment(o);
    },
  };
  let round = 0;
  const result = await startWatchPoller({
    env: {
      GITHUB_TOKEN: "fake",
      CORVIDINHO_WATCH_USERNAME: WATCH_USER,
      CORVIDINHO_WATCH_DRY_RUN: "1",
      HOME: dir,
    },
    filePath: path,
    runLoop: false,
    db: shared,
    ackClient: ack,
    log: () => {},
    agent: {
      async runChat(o) {
        calls.push(o);
        return { ok: true, sessionId: o.sessionId, summary: "done", exitCode: 0 };
      },
    },
    fetchEvents: async () => rounds[round++] ?? [],
  });
  if (!result.ok) throw new Error("watch did not start");
  return {
    calls,
    posts: ack.posts,
    poll: () => result.pollOnce(),
    stop: async () => {
      await result.stop();
      shared.close();
    },
  };
}

/** The bridge with a fake gateway that records DMs and card edits. */
async function bridge() {
  const dms: Array<{ userId: string; content: string; components?: unknown[] }> = [];
  const edits: Array<{ content?: string | null }> = [];
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const result = await startBridge({
    env: { DISCORD_BOT_TOKEN: "fake", CORVIDINHO_DISCORD_DRY_RUN: "1", CORVIDINHO_ALLOWLIST_FILE: path, CORVIDINHO_DATA_DIR: dataDir, HOME: dir },
    projectRoot: dir,
    skipProtocolCheck: true,
    disableScheduler: true,
    thinkingOutbound: memoryThinkingOutbound(),
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
    agent: { async runChat(o) { return { ok: true, sessionId: o.sessionId, summary: "done", exitCode: 0 }; } },
    gatewayFactory: async (_cfg, handlers) => {
      box.handlers = handlers;
      let n = 0;
      handlers.reply = async () => ({ messageId: `post-${++n}` });
      handlers.sendDm = async (o) => {
        dms.push(o);
        return { channelId: `dm-${o.userId}`, messageId: `dm-msg-${++n}` };
      };
      handlers.editMessage = async (o) => {
        edits.push(o);
        return true;
      };
      return createNullGateway();
    },
  });
  if (result.ok !== true || !box.handlers) throw new Error("bridge did not start");
  const press = async (userId: string, customId: string) => {
    const replies: Array<{ content?: string; ephemeral?: boolean; components?: unknown[]; update?: boolean }> = [];
    const ix: ComponentInteraction = {
      id: `ix-${Math.random()}`,
      customId,
      channelId: `dm-${OWNER_ID}`,
      userId,
      reply: async (o) => {
        replies.push(o);
      },
    };
    await box.handlers!.onComponent!(ix);
    return replies;
  };
  const card = () => {
    const c = dms.find((d) => d.userId === OWNER_ID && d.components);
    if (!c) throw new Error("no card");
    const row = (c.components as Array<{ components: Array<{ custom_id: string }> }>)[0]!;
    return { text: c.content, approve: row.components[0]!.custom_id, deny: row.components[1]!.custom_id };
  };
  return { result, dms, edits, press, card, handlers: box.handlers! };
}

/** Tofu's memory, Kyn's, a project row, and kept WATCH conversations. */
function seed(): void {
  const d = db();
  try {
    const m = new MemoryStore({ db: d });
    m.store({ ownerUserId: "person:tofu", category: "preference", key: "tz", content: "TOFU-TZ" });
    m.store({ ownerUserId: "person:tofu", category: "private", key: "n", content: "TOFU-PRIVATE" });
    m.store({ ownerUserId: "person:kyn", category: "preference", key: "tz", content: "KYN-TZ" });
    m.store({ ownerUserId: "project:corvidlabs/corvidinho", category: "entity", key: "cmd", content: "PROJECT-FACT" });
    const c = new ConversationStore({ db: d });
    const turn = (content: string) => [{ role: "human" as const, content, createdAt: Date.now() }];
    // Tofu's thread under their declared login.
    c.save({ surface: "watch", threadKey: watchThreadKey(REPO, 5), userId: "tofu-dev", summary: "", turns: turn("TOFU-THREAD"), participants: ["github:tofu-dev"] });
    // A thread from before a rename: only the numeric id says it is Tofu's.
    c.save({ surface: "watch", threadKey: watchThreadKey(REPO, 6), userId: "tofu-old", summary: "", turns: turn("TOFU-OLD-THREAD"), participants: ["github:tofu-old", "github-id:4242"] });
    c.save({ surface: "watch", threadKey: watchThreadKey(REPO, 3), userId: "stranger-gh", summary: "", turns: turn("STRANGER-THREAD"), participants: ["github:stranger-gh", "github-id:777"] });
  } finally {
    d.close();
  }
}

function memories(): string[] {
  return query<{ content: string }>("SELECT content FROM memories").map((r) => r.content);
}

function threads(): string[] {
  return query<{ turns: string }>("SELECT turns FROM conversation_threads").map((r) => r.turns);
}

describe("MEMORY-ACL-6.a: someone known only on GitHub asks there to be forgotten", () => {
  test("a declared person's 'forget me' raises the owner's card with no run; nothing goes before Approve; Approve forgets them and the thread is told", async () => {
    seed();
    const w = await watcher([
      [ev({ id: "comment-1", number: 7, sender: "tofu-dev", senderId: 4242, body: `@${WATCH_USER} forget me` })],
    ]);
    const b = await bridge();
    try {
      await w.poll();
      // No model run for it; one reply on the thread.
      expect(w.calls).toHaveLength(0);
      expect(w.posts).toHaveLength(1);
      expect(w.posts[0]).toMatchObject({ owner: "CorvidLabs", repo: "Corvidinho", issue_number: 7 });
      const rows = query<{ id: string; subject_kind: string; subject_id: string; requester_user_id: string; origin_channel_id: string; status: string }>(
        "SELECT id, subject_kind, subject_id, requester_user_id, origin_channel_id, status FROM forget_requests",
      );
      expect(rows).toHaveLength(1);
      const req = rows[0]!;
      expect(req).toMatchObject({ subject_kind: "person", subject_id: "tofu", requester_user_id: "github:4242:tofu-dev", origin_channel_id: `github:${REPO}#7`, status: "pending" });
      expect(w.posts[0]!.body).toContain("@tofu-dev I've asked the owner to approve forgetting what I remember about you");
      expect(w.posts[0]!.body).toContain(req.id);
      expect(w.posts[0]!.body).toContain("Nothing is forgotten unless they approve");
      // SAFE-5: the ask is on the trail, as the GitHub account.
      const audit = query<{ action: string; actor: string; outcome: string }>(
        "SELECT action, actor, outcome FROM audit_log WHERE action = 'memory-forget-request' ORDER BY seq",
      );
      expect(audit).toEqual([
        { action: "memory-forget-request", actor: "github:tofu-dev", outcome: "started" },
        { action: "memory-forget-request", actor: "github:tofu-dev", outcome: "ok" },
      ]);
      // Nothing deleted before the owner approves.
      expect(memories()).toEqual(expect.arrayContaining(["TOFU-TZ", "TOFU-PRIVATE"]));
      expect(threads().join()).toContain("TOFU-THREAD");

      // The owner's existing card, saying where the ask came from.
      expect((await b.result.deliverForgetCards!()).posted).toBe(1);
      const card = b.card();
      expect(card.text).toContain("Tofu (tofu), team");
      expect(card.text).toContain(`asked on GitHub by @tofu-dev (GitHub account id 4242) in ${REPO}#7`);
      expect(card.text).toContain(req.id);
      expect(card.text).not.toMatch(/TOFU-|KYN-/);
      // A second poll before a decision posts nothing more.
      await w.poll();
      expect(w.posts).toHaveLength(1);

      // SAFE-19: the forget card is destructive — Approve, then the code.
      const r = (await approveWithCode(b.handlers, b.dms, OWNER_ID, card.approve)).submit;
      expect(r[0]!.content).toContain("Approved by you — forgot 2 memories");
      expect(r[0]!.content).toContain("2 kept conversations");
      // Only the owner was ever DMed: a GitHub asker is told on GitHub.
      expect(b.dms.every((d) => d.userId === OWNER_ID)).toBe(true);
      expect(b.edits.at(-1)!.content).toContain("They will be told on their GitHub thread.");
      const left = memories();
      expect(left).not.toContain("TOFU-TZ");
      expect(left).not.toContain("TOFU-PRIVATE");
      expect(left).toEqual(expect.arrayContaining(["KYN-TZ", "PROJECT-FACT"]));
      // Kept GitHub conversations: by login and by numeric id; not others'.
      const kept = threads().join();
      expect(kept).not.toContain("TOFU-THREAD");
      expect(kept).not.toContain("TOFU-OLD-THREAD");
      expect(kept).toContain("STRANGER-THREAD");
      // Another bridge pass leaves the GitHub asker to the poller.
      await b.result.deliverForgetCards!();
      expect(b.dms.every((d) => d.userId === OWNER_ID)).toBe(true);

      // The next poll posts the outcome on the thread, once, with no count.
      await w.poll();
      expect(w.posts).toHaveLength(2);
      expect(w.posts[1]).toMatchObject({ issue_number: 7 });
      expect(w.posts[1]!.body).toContain(`@tofu-dev Your forget request (${req.id}) was approved`);
      expect(w.posts[1]!.body).not.toMatch(/\d+ (stored )?memories/);
      await w.poll();
      expect(w.posts).toHaveLength(2);
      expect(query<{ n: number }>("SELECT COUNT(*) AS n FROM forget_requests WHERE notified_at IS NOT NULL")[0]!.n).toBe(1);
    } finally {
      await b.result.stop();
      await w.stop();
    }
  });

  test("undeclared and unconfirmed senders get no card; only a clear 'forget me' skips the run; it never hides another request; Deny is posted as a no", async () => {
    seed();
    const w = await watcher([
      [
        // Not on the people list: nothing kept for them, no card.
        ev({ id: "comment-11", number: 8, sender: "stranger-gh", senderId: 777, body: `Hey @${WATCH_USER}, please forget me.` }),
        // Kyn's login is declared but no account id: not trusted (IDENTITY-7).
        ev({ id: "comment-12", number: 9, sender: "kyn-gh", senderId: 999, body: `@${WATCH_USER} forget everything you know about me` }),
        // Not a forget ask: normal runs.
        ev({ id: "comment-13", number: 10, sender: "tofu-dev", senderId: 4242, body: `@${WATCH_USER} don't forget me in the release notes` }),
        ev({ id: "comment-14", number: 12, sender: "tofu-dev", senderId: 4242, body: `> @${WATCH_USER} forget me\n\n@${WATCH_USER} lol, never mind that quote` }),
        ev({ id: "comment-15", number: 13, type: "assignment", sender: "tofu-dev", senderId: 4242, actor: "tofu-dev", body: `@${WATCH_USER} forget me` }),
        // Two on one issue: the forget ask and Kyn's question both count.
        ev({ id: "comment-16", number: 11, sender: "tofu-dev", senderId: 4242, body: `@${WATCH_USER} Could you please forget me?` }),
        ev({ id: "comment-17", number: 11, sender: "kyn-gh", senderId: 999, body: `@${WATCH_USER} what is the release status?` }),
      ],
    ]);
    const b = await bridge();
    try {
      const cycle = await w.poll();
      expect(cycle.started).toBe(4);
      const runs = w.calls.map((c) => c.prompt);
      expect(runs.some((p) => p.includes("release notes"))).toBe(true);
      expect(runs.some((p) => p.includes("never mind that quote"))).toBe(true);
      expect(runs.some((p) => p.includes("release status"))).toBe(true);
      expect(w.calls.map((c) => c.actingGithubLogin).sort()).toEqual(["kyn-gh", "tofu-dev", "tofu-dev", "tofu-dev"]);
      const reply = (n: number) => w.posts.find((p) => p.issue_number === n && /forget/i.test(p.body))?.body ?? "";
      expect(reply(8)).toContain("@stranger-gh You're not on the owner's people list");
      expect(reply(8)).toContain("no request was made");
      expect(reply(9)).toContain("@kyn-gh I can't confirm this GitHub account");
      expect(reply(11)).toContain("@tofu-dev I've asked the owner");
      const rows = query<{ id: string; subject_id: string; origin_channel_id: string }>("SELECT id, subject_id, origin_channel_id FROM forget_requests");
      expect(rows).toEqual([{ id: expect.any(String), subject_id: "tofu", origin_channel_id: `github:${REPO}#11` }]);
      // A WATCH run keeps the commenter's numeric id with the thread.
      const parts = query<{ participants: string }>(
        "SELECT participants FROM conversation_threads WHERE thread_key = ?",
        watchThreadKey(REPO, 10),
      )[0]!.participants;
      expect(JSON.parse(parts)).toEqual(expect.arrayContaining(["github:tofu-dev", "github-id:4242"]));

      // Deny: nothing deleted; the thread is told it was a no.
      await b.result.deliverForgetCards!();
      const r = await b.press(OWNER_ID, b.card().deny);
      expect(r[0]!.content).toContain("Denied by you");
      expect(b.edits.at(-1)!.content).toContain("They will be told on their GitHub thread.");
      expect(memories()).toEqual(expect.arrayContaining(["TOFU-TZ", "TOFU-PRIVATE"]));
      const before = w.posts.length;
      await w.poll();
      expect(w.posts.length).toBe(before + 1);
      expect(w.posts.at(-1)).toMatchObject({ issue_number: 11 });
      expect(w.posts.at(-1)!.body).toContain(`@tofu-dev The owner did not approve your forget request (${rows[0]!.id})`);
    } finally {
      await b.result.stop();
      await w.stop();
    }
  });

  test("a thread that refuses the outcome (locked or gone) does not hold up the others' outcomes; a rate limit stops the pass", async () => {
    // Mo: a second person declared by GitHub account id, so two asks are open at once.
    writeFileSync(
      path,
      `${FILE.replace('users = ["tofu-dev", "kyn-gh", "stranger-gh"]', 'users = ["tofu-dev", "kyn-gh", "stranger-gh", "mo-gh"]')}
[people.mo]
display = "Mo"
role = "community"
github_logins = ["mo-gh"]
github_ids = ["5151"]
`,
    );
    let fail: { issue: number; result: AckCommentResult } | null = null;
    const failPost = (o: { issue_number: number }) => (fail && o.issue_number === fail.issue ? fail.result : null);
    const w1 = await watcher(
      [
        [
          ev({ id: "comment-21", number: 21, sender: "tofu-dev", senderId: 4242, body: `@${WATCH_USER} forget me` }),
          ev({ id: "comment-22", number: 22, sender: "mo-gh", senderId: 5151, body: `@${WATCH_USER} forget me` }),
        ],
      ],
      failPost,
    );
    const outcomes = (posts: Array<{ issue_number: number; body: string }>, n: number) =>
      posts.filter((p) => p.issue_number === n && p.body.includes("did not approve"));
    try {
      await w1.poll();
      const rows = query<{ id: string; subject_id: string }>("SELECT id, subject_id FROM forget_requests ORDER BY subject_id");
      expect(rows.map((r) => r.subject_id)).toEqual(["mo", "tofu"]);
      const id = (who: string) => rows.find((r) => r.subject_id === who)!.id;
      // The owner denies Tofu's ask first, then Mo's (so Tofu's outcome goes first).
      const d = db();
      try {
        let t = Date.now() - 2_000;
        const store = new ForgetRequestStore({ db: d, now: () => t });
        expect(store.decide(id("tofu"), "denied", { by: OWNER_ID })).toBe(true);
        t += 1_000;
        expect(store.decide(id("mo"), "denied", { by: OWNER_ID })).toBe(true);
      } finally {
        d.close();
      }
      // A rate limit on the first outcome stops the pass: Mo's waits too.
      fail = { issue: 21, result: { ok: false, status: 429, error: "rate limited" } };
      await w1.poll();
      expect(outcomes(w1.posts, 21)).toHaveLength(0);
      expect(outcomes(w1.posts, 22)).toHaveLength(0);
    } finally {
      await w1.stop();
    }
    // Tofu's thread is locked (a bare 403): Mo is still told, Tofu once it opens.
    fail = { issue: 21, result: { ok: false, status: 403, error: "Unable to create comment because issue is locked." } };
    const w2 = await watcher([], failPost);
    try {
      await w2.poll();
      expect(outcomes(w2.posts, 22)).toHaveLength(1);
      expect(outcomes(w2.posts, 21)).toHaveLength(0);
      const told = () =>
        query<{ subject_id: string }>("SELECT subject_id FROM forget_requests WHERE notified_at IS NOT NULL ORDER BY subject_id").map(
          (r) => r.subject_id,
        );
      expect(told()).toEqual(["mo"]);
      fail = null;
      await w2.poll();
      expect(outcomes(w2.posts, 21)).toHaveLength(1);
      expect(outcomes(w2.posts, 22)).toHaveLength(1);
      expect(told()).toEqual(["mo", "tofu"]);
    } finally {
      await w2.stop();
    }
  });

  test("in a WATCH run the model's memory-forget-me points at the comment path and records nothing", async () => {
    process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = "";
    process.env.CORVIDINHO_ACTING_GITHUB_LOGIN = "tofu-dev";
    process.env.CORVIDINHO_ACTING_GITHUB_ID = "4242";
    process.env.CORVIDINHO_ACTING_GITHUB_REPO = REPO;
    process.env.CORVIDINHO_ACTING_ROLE = "community";
    const r = await runPlugin({ name: "memory-forget-me", args: [], nonInteractive: true, allowlist: [], cwd: dir, json: false });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('says just "forget me"');
    expect(r.error).toContain("MEMORY-ACL-6.a");
    expect(query<{ n: number }>("SELECT COUNT(*) AS n FROM forget_requests")[0]!.n).toBe(0);
  });
});
