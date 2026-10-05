/**
 * AGENT-18 hi drafts — the owner's `hi` card (REQ-discord-521): drafted
 * criteria reach Corvidinho's configured owner as a DM Approve/Deny card on
 * the approvals engine (`cvok:hi:…`); only the owner's Approve captures
 * them, by running `hi <ID> "<text>"` for each draft in the session
 * worktree (re-created when it is gone, else nothing is captured); each
 * capture writes a SAFE-5 row and the asker gets one outcome post.
 *
 * Temp git repos and talk worktrees only, a stand-in `hi` on PATH
 * (tests/fixtures/stand-in-hi.ts), a temp DB for the engine tests, and the
 * bridge with a fake gateway for the routing test. No token, no network.
 */
import type { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HiCaptureStore, type HiCaptureRequest, type HiDraft } from "../src/agent/hi-capture-store.ts";
import { hiChangesSince } from "../src/agent/repo-ways.ts";
import { APPROVAL_NOT_OWNER, createApprovalCards, type ApprovalCards } from "../src/discord/approval-cards.ts";
import { approveCardCustomId } from "../src/discord/approve-card.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createNullGateway, type ComponentInteraction, type GatewayHandlers } from "../src/discord/gateway.ts";
import { HI_CARD_KIND, hiCaptureApprovalKind } from "../src/discord/hi-card.ts";
import type { OwnerRecord } from "../src/identity/owner.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { ensureTalkWorkspace } from "../src/worktree/manager.ts";
import { pathWithHi, writeStandInHi } from "./fixtures/stand-in-hi.ts";
import { gitIn } from "./fixtures/talk-worktree.ts";

const OWNER_ID = "181969874455756800";
const TEAM = "200000000000000002";
const STRANGER = "500000000000000005";
const CHAN = "600000000000000006";
const OWNER: OwnerRecord = { discordId: OWNER_ID, display: "Leif" };

const bases: string[] = [];
function tempBase(): string {
  const b = realpathSync(mkdtempSync(join(tmpdir(), "corvidinho-hi-card-")));
  bases.push(b);
  return b;
}

let HI_BIN = "";
beforeAll(() => {
  HI_BIN = writeStandInHi(tempBase());
});
afterAll(() => {
  for (const b of bases) rmSync(b, { recursive: true, force: true });
});

function marker(name: "fail-id" | "check-fail", value: string | null): void {
  const p = join(HI_BIN, name);
  if (value === null) rmSync(p, { force: true });
  else writeFileSync(p, value);
}

const HI_AGENT = [
  "---",
  "hi: 1",
  "families: [AGENT]",
  "---",
  "",
  "# Agent",
  "",
  "## Criteria",
  "",
  "- **AGENT-18**  It works each repo's own way.",
  "- **AGENT-19**  It keeps a second promise.",
  "",
].join("\n");

const DRAFTS: HiDraft[] = [
  { id: "AGENT-20", text: "It drafts criteria and asks before capturing them." },
  { id: "AGENT-18.b", text: "A drafted criterion keeps the requester's words." },
];

type Fixture = { base: string; project: string; work: string; branch: string };

async function fixture(opts: { intent?: boolean } = {}): Promise<Fixture> {
  const base = tempBase();
  const project = join(base, "widget");
  mkdirSync(join(project, "hi"), { recursive: true });
  gitIn(project, "init", "-q", "-b", "main");
  gitIn(project, "config", "user.name", "Fixture Bot");
  gitIn(project, "config", "user.email", "fixture@example.invalid");
  gitIn(project, "config", "commit.gpgsign", "false");
  writeFileSync(join(project, "hi", "agent.md"), HI_AGENT);
  writeFileSync(join(project, "app.ts"), "export const x = 1;\n");
  if (opts.intent !== false) writeFileSync(join(project, "INTENT.md"), "# Intent\n");
  gitIn(project, "add", "-A");
  gitIn(project, "commit", "-q", "-m", "init");
  const made = await ensureTalkWorkspace({ projectWorkingDir: project, sessionId: `sess_hi_card_${bases.length}` });
  if (!made.ok) throw new Error(made.error);
  const work = made.workspace.workDir;
  return { base, project, work, branch: gitIn(work, "symbolic-ref", "--short", "HEAD").trim() };
}

function record(db: Database, f: Fixture, extra: Partial<Parameters<HiCaptureStore["request"]>[0]> = {}): HiCaptureRequest {
  return new HiCaptureStore({ db }).request({
    repo: realpathSync(join(f.project, ".git")),
    project: "widget",
    worktree: realpathSync(f.work),
    branch: f.branch,
    head: gitIn(f.work, "rev-parse", "HEAD").trim(),
    drafts: DRAFTS,
    requester: TEAM,
    role: "team",
    surface: "work",
    sessionId: "sess_x",
    originChannelId: CHAN,
    ...extra,
  });
}

type Sent = { userId: string; content: string; components?: unknown[] };

function engine(db: Database, f: Fixture, opts: { owner?: () => OwnerRecord | null; now?: () => number; mayPost?: boolean } = {}) {
  const dms: Sent[] = [];
  const posts: Array<{ channelId: string; content: string; mentionUserIds?: string[] }> = [];
  const edits: Array<{ content?: string | null }> = [];
  const env = { PATH: pathWithHi(HI_BIN), HOME: f.base };
  const owner = opts.owner ?? (() => OWNER);
  let n = 0;
  const sendDm = async (o: Sent) => {
    dms.push(o);
    n += 1;
    return { channelId: `dm-${o.userId}`, messageId: `dm-${n}` };
  };
  const cards: ApprovalCards = createApprovalCards({
    db,
    env,
    owner,
    sendDm,
    editMessage: async (o) => {
      edits.push(o);
      return true;
    },
    ...(opts.now ? { now: opts.now } : {}),
    kinds: [
      hiCaptureApprovalKind({
        db,
        env,
        owner,
        sendDm,
        post: async (o) => {
          posts.push(o);
          return true;
        },
        mayPost: () => opts.mayPost !== false,
        ...(opts.now ? { now: opts.now } : {}),
      }),
    ],
  });
  return { cards, dms, posts, edits };
}

async function press(cards: ApprovalCards, userId: string, decision: "approve" | "deny", id: string, mayDecide: boolean) {
  const replies: Array<{ content?: string; ephemeral?: boolean; components?: unknown[]; update?: boolean }> = [];
  const ix: ComponentInteraction = {
    id: `ix-${Math.random()}`,
    customId: approveCardCustomId(HI_CARD_KIND, decision, id),
    channelId: `dm-${userId}`,
    userId,
    messageId: "dm-2",
    reply: async (o) => {
      replies.push(o);
    },
  };
  await cards.press(ix, { kind: HI_CARD_KIND, decision, id }, mayDecide);
  return replies;
}

function tempDb(f: Fixture): Database {
  return openCorvidinhoDb({ path: join(f.base, "cards.db") });
}

function audit(db: Database): string[] {
  return (db.query("SELECT action, outcome FROM audit_log ORDER BY seq").all() as { action: string; outcome: string }[]).map(
    (r) => `${r.action}:${r.outcome}`,
  );
}

const agentText = (f: Fixture) => readFileSync(join(f.work, "hi", "agent.md"), "utf8");

describe("the owner's hi card (REQ-discord-521)", () => {
  test("the card goes to the owner: the exact hi commands first, then the action, target and ids; plain Approve / Deny", async () => {
    const f = await fixture();
    const db = tempDb(f);
    const req = record(db, f);
    const { cards, dms } = engine(db, f);
    expect((await cards.deliver()).posted).toBe(1);
    expect(dms.map((d) => d.userId)).toEqual([OWNER_ID, OWNER_ID]);
    expect(dms[0]!.content).toContain(`hi AGENT-20 'It drafts criteria and asks before capturing them.'`);
    expect(dms[0]!.content).toContain(`hi AGENT-18.b 'A drafted criterion keeps the requester'\\''s words.'`);
    const card = dms[1]!;
    expect(card.content).toContain("hi capture request (AGENT-18)");
    expect(card.content).toContain("Capture 2 drafted criteria into hi/");
    expect(card.content).toContain(`widget on branch ${f.branch}`);
    expect(card.content).toContain(`<@${TEAM}>'s (team) /work run`);
    expect(card.content).toContain("2 criteria: AGENT-20, AGENT-18.b");
    const ids = JSON.stringify(card.components);
    expect(ids).toContain(`cvok:hi:approve:${req.id}`);
    expect(ids).toContain(`cvok:hi:deny:${req.id}`);
    expect(ids).not.toContain("cvok:hi:code:");
    expect(agentText(f)).toBe(HI_AGENT);
    db.close();
  });

  test("nobody else's press captures anything; the owner's Approve captures exactly the drafts, audited, and the asker is told", async () => {
    const f = await fixture();
    const db = tempDb(f);
    const req = record(db, f);
    const { cards, posts } = engine(db, f);
    await cards.deliver();
    const refused = await press(cards, STRANGER, "approve", req.id, false);
    expect(refused[0]!.content).toBe(APPROVAL_NOT_OWNER);
    expect(agentText(f)).toBe(HI_AGENT);
    expect(new HiCaptureStore({ db }).get(req.id)!.status).toBe("pending");

    const ok = await press(cards, OWNER_ID, "approve", req.id, true);
    expect(ok[0]!.content).toContain(`Approved by you — captured AGENT-20, AGENT-18.b into hi/ on branch ${f.branch} (AGENT-18).`);
    const text = agentText(f);
    expect(text).toContain("- **AGENT-20**  It drafts criteria and asks before capturing them.");
    expect(text).toContain("  - **AGENT-18.b**  A drafted criterion keeps the requester's words.");
    const done = new HiCaptureStore({ db }).get(req.id)!;
    expect(done).toMatchObject({ status: "approved", decidedBy: OWNER_ID, captured: ["AGENT-20", "AGENT-18.b"] });
    expect(audit(db)).toEqual([
      "hi-capture-card:ok",
      "hi-capture-approve:denied",
      "hi-capture-approve:started",
      "hi-capture-criterion:ok",
      "hi-capture-criterion:ok",
      "hi-capture-approve:ok",
    ]);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ channelId: CHAN, mentionUserIds: [TEAM] });
    expect(posts[0]!.content).toContain(`<@${TEAM}> The owner approved the drafted hi criteria (AGENT-20, AGENT-18.b; request ${req.id}): captured AGENT-20, AGENT-18.b`);
    expect(posts[0]!.content).not.toContain("It drafts criteria");
    // A second press finds it closed.
    const again = await press(cards, OWNER_ID, "approve", req.id, true);
    expect(again[0]!.content).toContain("Already closed (approved).");
    db.close();
  });

  test("Approve re-checks the owner configured now; a press from anyone else fails and nothing is captured", async () => {
    const f = await fixture();
    const db = tempDb(f);
    const req = record(db, f);
    let owner: OwnerRecord | null = OWNER;
    const { cards } = engine(db, f, { owner: () => owner });
    await cards.deliver();
    owner = { discordId: "999999999999999999" };
    const r = await press(cards, OWNER_ID, "approve", req.id, true);
    expect(r[0]!.content).toContain("Capture failed — nothing was captured; the request stays open.");
    expect(r[0]!.content).toContain("only Corvidinho's configured owner can approve a capture");
    expect(agentText(f)).toBe(HI_AGENT);
    expect(new HiCaptureStore({ db }).get(req.id)!.status).toBe("pending");
    db.close();
  });

  test("Deny and no answer are a no: nothing captured, and the asker is told", async () => {
    const f = await fixture();
    const db = tempDb(f);
    const denied = record(db, f);
    const { cards, posts } = engine(db, f);
    await cards.deliver();
    const r = await press(cards, OWNER_ID, "deny", denied.id, true);
    expect(r[0]!.content).toContain("Denied by you — nothing was captured.");
    expect(new HiCaptureStore({ db }).get(denied.id)!.status).toBe("denied");
    expect(posts[0]!.content).toContain("The owner did not approve the drafted hi criteria");
    expect(agentText(f)).toBe(HI_AGENT);

    let t = Date.now();
    const late = engine(db, f, { now: () => t });
    const lapsed = record(db, f);
    t += 25 * 60 * 60 * 1000;
    expect((await late.cards.deliver()).expired).toBe(1);
    expect(new HiCaptureStore({ db }).get(lapsed.id)!.status).toBe("expired");
    expect(late.posts.at(-1)!.content).toContain("Nobody answered the card");
    expect(agentText(f)).toBe(HI_AGENT);
    db.close();
  });

  test("a parked session worktree is re-created on its branch and captured into; with its branch gone nothing is captured", async () => {
    const f = await fixture();
    const db = tempDb(f);
    // The branch has a commit of its own, so parking keeps it.
    writeFileSync(join(f.work, "app.ts"), "export const x = 2;\n");
    gitIn(f.work, "commit", "-q", "-am", "work");
    const req = record(db, f);
    gitIn(f.project, "worktree", "remove", "--force", f.work);
    expect(existsSync(f.work)).toBe(false);
    const { cards } = engine(db, f);
    await cards.deliver();
    const ok = await press(cards, OWNER_ID, "approve", req.id, true);
    expect(ok[0]!.content).toContain("Approved by you — captured AGENT-20, AGENT-18.b");
    expect(existsSync(f.work)).toBe(true);
    expect(gitIn(f.work, "symbolic-ref", "--short", "HEAD").trim()).toBe(f.branch);
    expect(agentText(f)).toContain("- **AGENT-20**  ");

    const g = await fixture();
    const gdb = tempDb(g);
    const gone = record(gdb, g);
    gitIn(g.project, "worktree", "remove", "--force", g.work);
    gitIn(g.project, "branch", "-D", g.branch);
    const e = engine(gdb, g);
    await e.cards.deliver();
    const r = await press(e.cards, OWNER_ID, "approve", gone.id, true);
    expect(r[0]!.content).toContain("Capture failed — nothing was captured; the request stays open.");
    expect(r[0]!.content).toContain(`so is its branch ${g.branch}`);
    expect(existsSync(g.work)).toBe(false);
    expect(new HiCaptureStore({ db: gdb }).get(gone.id)!.status).toBe("pending");
    expect(audit(gdb)).toContain("hi-capture-approve:error");
    db.close();
    gdb.close();
  });

  test("a worktree on another branch, an id captured meanwhile, or a capture that fails part-way: nothing is captured and hi/ is put back", async () => {
    const f = await fixture();
    const db = tempDb(f);
    const moved = record(db, f);
    gitIn(f.work, "checkout", "-q", "-b", "elsewhere");
    const { cards } = engine(db, f);
    await cards.deliver();
    const r1 = await press(cards, OWNER_ID, "approve", moved.id, true);
    expect(r1[0]!.content).toContain(`is not on branch ${f.branch} any more`);
    gitIn(f.work, "checkout", "-q", f.branch);

    // Someone captured AGENT-20 by hand since the draft.
    const raced = record(db, f);
    const handMade = HI_AGENT.replace("- **AGENT-19**", "- **AGENT-20**  Captured by hand.\n- **AGENT-19**");
    writeFileSync(join(f.work, "hi", "agent.md"), handMade);
    await cards.deliver();
    const r2 = await press(cards, OWNER_ID, "approve", raced.id, true);
    expect(r2[0]!.content).toContain("AGENT-20 is already captured");
    expect(agentText(f)).toBe(handMade);
    writeFileSync(join(f.work, "hi", "agent.md"), HI_AGENT);

    // The second capture fails after the first went in: all of it is undone,
    // a first capture's INTENT.md too.
    const g = await fixture({ intent: false });
    const gdb = tempDb(g);
    const partial = record(gdb, g);
    marker("fail-id", "AGENT-18.b");
    try {
      const e = engine(gdb, g);
      await e.cards.deliver();
      const r3 = await press(e.cards, OWNER_ID, "approve", partial.id, true);
      expect(r3[0]!.content).toContain("hi AGENT-18.b failed: error: refusing AGENT-18.b");
    } finally {
      marker("fail-id", null);
    }
    expect(agentText(g)).toBe(HI_AGENT);
    expect(existsSync(join(g.work, "INTENT.md"))).toBe(false);
    expect(new HiCaptureStore({ db: gdb }).get(partial.id)!.status).toBe("pending");
    expect(audit(gdb).filter((a) => a.startsWith("hi-capture-criterion"))).toEqual([]);

    // hi check failing after the capture undoes it too.
    marker("check-fail", "1");
    try {
      const e = engine(gdb, g);
      const r4 = await press(e.cards, OWNER_ID, "approve", partial.id, true);
      expect(r4[0]!.content).toContain("hi check failed after the capture");
    } finally {
      marker("check-fail", null);
    }
    expect(agentText(g)).toBe(HI_AGENT);
    db.close();
    gdb.close();
  });
});

describe("the bridge routes cvok:hi presses to the owner's card and delivers it (REQ-discord-521)", () => {
  test("a stranger's press is refused; the owner's Approve captures, and the hi guard lets that capture through", async () => {
    const f = await fixture();
    const allowlist = join(f.base, "allowlist.toml");
    writeFileSync(allowlist, `[discord]\nchannels = ["${CHAN}"]\n\n[owner]\ndiscord_id = "${OWNER_ID}"\ndisplay = "Leif"\n`);
    const dataDir = process.env.CORVIDINHO_DATA_DIR!;
    const base = gitIn(f.work, "rev-parse", "HEAD").trim();
    const shared = openCorvidinhoDb();
    const req = record(shared, f, { requester: OWNER_ID, role: "owner", surface: "chat" });
    shared.close();
    const box: { handlers?: GatewayHandlers } = {};
    const dms: Sent[] = [];
    const posts: Array<{ channelId: string; content: string }> = [];
    const started = await startBridge({
      env: {
        DISCORD_BOT_TOKEN: "fake",
        CORVIDINHO_DISCORD_DRY_RUN: "1",
        CORVIDINHO_ALLOWLIST_FILE: allowlist,
        CORVIDINHO_DATA_DIR: dataDir,
        HOME: f.base,
        PATH: pathWithHi(HI_BIN),
      },
      projectRoot: f.project,
      skipProtocolCheck: true,
      disableScheduler: true,
      approvalPollMs: 0,
      thinkingOutbound: memoryThinkingOutbound(),
      thinkingDebounceMs: 0,
      thinkingTickMs: 60_000,
      agent: {
        async runChat(o) {
          return { ok: true, sessionId: o.sessionId, summary: "done", exitCode: 0 };
        },
      },
      gatewayFactory: async (_cfg, handlers) => {
        box.handlers = handlers;
        let n = 0;
        handlers.reply = async (o) => {
          posts.push(o);
          n += 1;
          return { messageId: `post-${n}` };
        };
        handlers.sendDm = async (o) => {
          dms.push(o);
          n += 1;
          return { channelId: `dm-${o.userId}`, messageId: `dm-msg-${n}` };
        };
        handlers.editMessage = async () => true;
        return createNullGateway();
      },
    });
    if (started.ok !== true || !box.handlers) throw new Error("bridge did not start");
    try {
      await started.deliverApprovalCards!();
      expect(dms.some((d) => JSON.stringify(d.components ?? []).includes(`cvok:hi:approve:${req.id}`))).toBe(true);
      const tap = async (userId: string) => {
        const replies: Array<{ content?: string }> = [];
        await box.handlers!.onComponent!({
          id: `ix-${Math.random()}`,
          customId: approveCardCustomId(HI_CARD_KIND, "approve", req.id),
          channelId: `dm-${userId}`,
          userId,
          reply: async (o) => {
            replies.push(o);
          },
        });
        return replies;
      };
      expect((await tap(STRANGER))[0]!.content).toBe(APPROVAL_NOT_OWNER);
      expect(agentText(f)).toBe(HI_AGENT);
      expect((await tap(OWNER_ID))[0]!.content).toContain("Approved by you — captured AGENT-20, AGENT-18.b");
      expect(agentText(f)).toContain("- **AGENT-20**  ");
      expect(await hiChangesSince(f.work, base)).toEqual({ criteria: [], retired: [], files: [] });
    } finally {
      await started.stop();
    }
  });
});
