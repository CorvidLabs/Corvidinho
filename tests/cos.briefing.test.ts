/**
 * COS-1 / COS-2 / COS-2.a (#102, REQ-discord-102) — every working day the
 * owner and each teammate get one short briefing DM about their own work,
 * at the start of their working hours in their time zone. Fixtures only:
 * in-memory SQLite, a fake clock, a fake LLM (the provider fetch), a fake
 * GitHub and a fake DM send — no network, no Discord token.
 */
import { afterEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyConfig, type AllowlistConfig } from "../src/allowlist/types.ts";
import { SPEND_CAP_ENV } from "../src/agent/spend.ts";
import type { HumanAsk } from "../src/agent/types.ts";
import type { AgentClient } from "../src/discord/agent-client.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createNullGateway } from "../src/discord/gateway.ts";
import type { OwnerRecord } from "../src/identity/owner.ts";
import { buildPeopleDirectory, parsePeopleText, type PeopleDirectory } from "../src/identity/people.ts";
import {
  BRIEFING_DM_RETRY_MS,
  briefingHoursFor,
  briefingRecipients,
  briefingSlot,
  claimBriefingDay,
  createBriefingComposer,
  createBriefingTicker,
  ensureBriefingTable,
  readBriefingRow,
  readGithubBriefingFacts,
  type BriefingCompose,
  type BriefingGithub,
  type BriefingGithubItem,
} from "../src/scheduler/briefing.ts";
import { SchedulerService } from "../src/scheduler/service.ts";
import { ScheduleStore } from "../src/scheduler/store.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { rescrubDatabase, SCRUB_TARGETS } from "../src/store/scrub.ts";

const OWNER_DC = "100000000000000001";
const TOFU_DC = "200000000000000002";
const ADA_DC = "300000000000000003";
const BOB_DC = "500000000000000005";
const OWNER: OwnerRecord = { discordId: OWNER_DC, display: "Leif", githubId: "8268288", githubLogin: "0xleif" };

/** Wednesday 2026-10-07 at hh:mm UTC (Oslo is UTC+2, New York UTC-4 then). */
const wed = (hh: number, mm = 0) => Date.UTC(2026, 9, 7, hh, mm);
const DAY = 24 * 60 * 60 * 1000;

const PEOPLE_TOML = `
[people.leif]
display = "Leif"
discord_ids = ["${OWNER_DC}"]
timezone = "America/New_York"

[people.tofu]
display = "Tofu"
role = "team"
discord_ids = ["${TOFU_DC}"]
github_logins = ["tofu-dev"]
github_ids = ["4242"]
timezone = "Europe/Oslo"
working_hours = "08:30-16:30"

[people.bob]
role = "team"
discord_ids = ["${BOB_DC}"]

[people.ada]
display = "Ada"
role = "community"
discord_ids = ["${ADA_DC}"]
`;

function people(text = PEOPLE_TOML, owner: OwnerRecord | null = OWNER): PeopleDirectory {
  return buildPeopleDirectory(parsePeopleText(text, false), owner);
}

function allowlist(): AllowlistConfig {
  const cfg = emptyConfig();
  cfg.github.repos = ["corvidlabs/corvidinho"];
  cfg.github.denyRepos = ["corvidlabs/secret"];
  return cfg;
}

const tmpDirs: string[] = [];
const dbs: Database[] = [];
afterEach(() => {
  for (const db of dbs.splice(0)) {
    try {
      db.close();
    } catch {
      // already closed
    }
  }
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function memDb(): Database {
  const db = openCorvidinhoDb({ memory: true });
  dbs.push(db);
  return db;
}

function seed(db: Database, now: number): void {
  const q = (sql: string, args: Array<string | number | null>) => db.run(sql, args);
  // Tofu's own work: one blocked, one done since yesterday.
  q(
    `INSERT INTO discord_work_tasks (id, description, user_id, channel_id, status, created_at, updated_at)
     VALUES (?, ?, ?, 'c', ?, ?, ?)`,
    ["w1", "Fix the flaky login test", TOFU_DC, "blocked", now - 3 * DAY, now - 3 * DAY],
  );
  q(
    `INSERT INTO discord_work_tasks (id, description, user_id, channel_id, status, created_at, updated_at)
     VALUES (?, ?, ?, 'c', ?, ?, ?)`,
    ["w2", "Ship the Oslo release notes", TOFU_DC, "completed", now - 5 * 3600_000, now - 4 * 3600_000],
  );
  // Done long ago: not news.
  q(
    `INSERT INTO discord_work_tasks (id, description, user_id, channel_id, status, created_at, updated_at)
     VALUES (?, ?, ?, 'c', ?, ?, ?)`,
    ["w3", "Ancient history task", TOFU_DC, "completed", now - 30 * DAY, now - 30 * DAY],
  );
  // Bob's private work: never in anyone else's briefing.
  q(
    `INSERT INTO discord_work_tasks (id, description, user_id, channel_id, status, created_at, updated_at)
     VALUES (?, ?, ?, 'c', ?, ?, ?)`,
    ["w4", "Bob's secret project plan", BOB_DC, "completed", now - 2 * 3600_000, now - 2 * 3600_000],
  );
  // Tofu's schedule: a finished run and an open question waiting on Tofu.
  q(
    `INSERT INTO schedules (id, name, cron_expression, project, prompt, channel_id, created_by_user_id, created_at, updated_at)
     VALUES ('s1', 'Nightly triage', '0 3 * * *', 'p', 'triage', 'c', ?, ?, ?)`,
    [TOFU_DC, now - 10 * DAY, now - 10 * DAY],
  );
  q(
    `INSERT INTO schedule_runs (id, schedule_id, status, started_at, completed_at) VALUES ('r1', 's1', 'completed', ?, ?)`,
    [now - 6 * 3600_000, now - 6 * 3600_000 + 60_000],
  );
  q(
    `INSERT INTO schedule_runs (id, schedule_id, status, started_at, completed_at, ask_reason, ask_question, ask_blocking)
     VALUES ('r2', 's1', 'completed', ?, ?, 'clarify', 'Which repo should I triage?', 1)`,
    [now - 5 * 3600_000, now - 5 * 3600_000 + 60_000],
  );
  // An Approve card waiting on the owner (the owner's briefing only).
  q(
    `INSERT INTO approval_requests (id, kind, class, title, action, target, amount, action_hash, status, created_at, expires_at)
     VALUES ('a1', 'forget', 'destructive', 'Forget Ada', 'forget', 'person ada', '-', 'h', 'pending', ?, ?)`,
    [now - 60_000, now + DAY],
  );
}

function item(over: Partial<BriefingGithubItem> & { number: number }): BriefingGithubItem {
  return {
    repo: "corvidlabs/corvidinho",
    title: `Item ${over.number}`,
    url: `https://github.com/${over.repo ?? "corvidlabs/corvidinho"}/pull/${over.number}`,
    pullRequest: true,
    state: "open",
    assigneeIds: [],
    ...over,
  };
}

/** Fake GitHub: answers by query; a search for anyone else returns nothing. */
function fakeGithub(): BriefingGithub & { queries: string[] } {
  const queries: string[] = [];
  return {
    queries,
    async search(q) {
      queries.push(q);
      if (q.startsWith("is:pr author:tofu-dev")) {
        return [
          item({ number: 7, title: "Tofu's PR: faster tests", authorId: "4242" }),
          // Not on the allowlist / denied: never read into the briefing.
          item({ number: 70, repo: "someone/else", title: "Off-allowlist PR", authorId: "4242" }),
          item({ number: 71, repo: "corvidlabs/secret", title: "Denied repo PR", authorId: "4242" }),
          // The login was renamed and re-registered: not their numeric id.
          item({ number: 8, title: "Impostor PR", authorId: "9999" }),
        ];
      }
      if (q.startsWith("is:issue assignee:tofu-dev")) {
        return [item({ number: 11, pullRequest: false, title: "Assigned issue", assigneeIds: ["4242"] })];
      }
      if (q.startsWith("is:pr is:open review-requested:tofu-dev")) {
        return [item({ number: 9, title: "Please review me" }), item({ number: 10, title: "Not really yours" })];
      }
      return [];
    },
    async requestedReviewerIds(_repo, n) {
      return n === 9 ? ["4242"] : ["9999"];
    },
  };
}

type LlmCall = { url: string; body: { model: string; messages: Array<{ role: string; content: string }> } };

/** Fake LLM: the provider's chat completions endpoint. */
function fakeLlm(reply: string | ((call: LlmCall) => string) = "Morning! Here is your day.") {
  const calls: LlmCall[] = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const call: LlmCall = { url: String(input), body: JSON.parse(String(init?.body ?? "{}")) };
    calls.push(call);
    const content = typeof reply === "string" ? reply : reply(call);
    return new Response(
      JSON.stringify({
        choices: [{ message: { role: "assistant", content } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  return { calls, fetchImpl };
}

function llmEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const dir = mkdtempSync(join(tmpdir(), "corvidinho-briefing-data-"));
  tmpDirs.push(dir);
  return {
    CORVIDINHO_LLM_API_KEY: "test-key",
    CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1",
    CORVIDINHO_LLM_MODEL: "gpt-4o-mini",
    CORVIDINHO_DATA_DIR: dir,
    ...extra,
  };
}

type Dm = { userId: string; content: string };

function setup(opts: {
  db?: Database;
  peopleText?: string;
  owner?: OwnerRecord | null;
  llm?: ReturnType<typeof fakeLlm>;
  env?: NodeJS.ProcessEnv;
  compose?: BriefingCompose;
  github?: BriefingGithub | null;
  dmOk?: () => boolean;
  muted?: Set<string>;
  cfg?: AllowlistConfig;
  onSpendStop?: (ask: HumanAsk) => void;
} = {}) {
  const db = opts.db ?? memDb();
  const llm = opts.llm ?? fakeLlm();
  const dms: Dm[] = [];
  const logs: string[] = [];
  const ticker = createBriefingTicker({
    db,
    allowlist: opts.cfg ?? allowlist(),
    people: () => people(opts.peopleText, opts.owner === undefined ? OWNER : opts.owner),
    owner: () => (opts.owner === undefined ? OWNER : opts.owner),
    sendDm: () => async (o) => {
      if (opts.dmOk && !opts.dmOk()) return null;
      dms.push(o);
      return { channelId: `dm-${o.userId}`, messageId: `m${dms.length}` };
    },
    compose: opts.compose ?? createBriefingComposer({ env: opts.env ?? llmEnv(), db, fetchImpl: llm.fetchImpl }),
    github: opts.github === undefined ? fakeGithub() : opts.github,
    ...(opts.muted ? { mutedUsers: opts.muted } : {}),
    ...(opts.onSpendStop ? { onSpendStop: opts.onSpendStop } : {}),
    log: (level, event, fields) => logs.push(`${level} ${event} ${JSON.stringify(fields ?? {})}`),
  });
  const tick = async (now: number) => {
    ticker.tick(now);
    await ticker.settle();
  };
  return { db, llm, dms, logs, ticker, tick };
}

describe("when each person's briefing arrives (COS-2 / COS-2.a)", () => {
  test("their declared zone and hours; else the owner's zone and 9am; else UTC and 9am", () => {
    const dir = people();
    const leif = dir.people.find((p) => p.id === "leif")!;
    expect(briefingHoursFor(dir.people.find((p) => p.id === "tofu")!, leif)).toEqual({
      timeZone: "Europe/Oslo",
      startMinute: 8 * 60 + 30,
      endMinute: 16 * 60 + 30,
      timeZoneFrom: "person",
      hoursFrom: "person",
    });
    expect(briefingHoursFor(dir.people.find((p) => p.id === "bob")!, leif)).toEqual({
      timeZone: "America/New_York",
      startMinute: 9 * 60,
      endMinute: 17 * 60,
      timeZoneFrom: "owner",
      hoursFrom: "default",
    });
    expect(briefingHoursFor({}, { timezone: undefined })).toMatchObject({ timeZone: "UTC", startMinute: 540, timeZoneFrom: "fallback" });
  });

  test("Monday to Friday in their zone, from the start of their hours until they end", () => {
    const tofu = briefingHoursFor({ timezone: "Europe/Oslo", workingHours: "08:30-16:30" }, null);
    expect(briefingSlot(wed(6, 25), tofu)).toMatchObject({ day: "2026-10-07", weekday: 3, due: false, over: false });
    expect(briefingSlot(wed(6, 30), tofu)).toMatchObject({ due: true });
    expect(briefingSlot(wed(14, 29), tofu)).toMatchObject({ due: true });
    expect(briefingSlot(wed(14, 30), tofu)).toMatchObject({ due: false, over: true });
    // 23:30 UTC Wednesday is already Thursday 01:30 in Oslo.
    expect(briefingSlot(wed(23, 30), tofu)).toMatchObject({ day: "2026-10-08", weekday: 4, due: false });
    // Saturday and Sunday: never.
    expect(briefingSlot(wed(8) + 3 * DAY, tofu)).toMatchObject({ workingDay: false, due: false });
    expect(briefingSlot(wed(8) + 4 * DAY, tofu)).toMatchObject({ workingDay: false, due: false });
  });

  test("owner and team only: community, deny-listed, muted and clashing ids get none", () => {
    const cfg = allowlist();
    const ids = (r: ReturnType<typeof briefingRecipients>) => r.map((x) => `${x.personId}:${x.role}:${x.discordId}`);
    expect(ids(briefingRecipients({ people: people(), owner: OWNER, allowlist: cfg }))).toEqual([
      `leif:owner:${OWNER_DC}`,
      `tofu:team:${TOFU_DC}`,
      `bob:team:${BOB_DC}`,
    ]);
    cfg.discord.denyUsers = [BOB_DC];
    expect(ids(briefingRecipients({ people: people(), owner: OWNER, allowlist: cfg, mutedUsers: new Set([TOFU_DC]) }))).toEqual([
      `leif:owner:${OWNER_DC}`,
    ]);
    // A Discord id declared for two people matches nobody (IDENTITY-7).
    const clash = `${PEOPLE_TOML}\n[people.tofu2]\nrole = "team"\ndiscord_ids = ["${TOFU_DC}"]\n`;
    expect(ids(briefingRecipients({ people: people(clash), owner: OWNER, allowlist: allowlist() }))).toEqual([
      `leif:owner:${OWNER_DC}`,
      `bob:team:${BOB_DC}`,
    ]);
    // No owner configured: nobody (IDENTITY-3).
    expect(briefingRecipients({ people: people(PEOPLE_TOML, null), owner: null, allowlist: allowlist() })).toEqual([]);
  });
});

describe("the daily briefing DM (COS-1 / COS-2)", () => {
  test("Tofu gets one DM at the start of their hours in Oslo, about Tofu only, written by the model", async () => {
    const now = wed(6, 35); // 08:35 in Oslo; 02:35 in New York.
    const db = memDb();
    seed(db, now);
    const github = fakeGithub();
    const s = setup({ db, github });
    await s.tick(wed(6, 25)); // 08:25 in Oslo: not yet.
    expect(s.dms).toEqual([]);
    expect(s.llm.calls).toHaveLength(0);

    await s.tick(now);
    expect(s.dms).toHaveLength(1);
    expect(s.dms[0]!.userId).toBe(TOFU_DC);
    expect(s.dms[0]!.content).toBe("📋 Your briefing for Wednesday 2026-10-07 (only you get this)\nMorning! Here is your day.");
    expect(s.llm.calls).toHaveLength(1);
    const call = s.llm.calls[0]!;
    expect(call.url).toBe("https://llm.test/v1/chat/completions");
    expect(call.body.model).toBe("gpt-4o-mini");
    expect((call.body as { tools?: unknown }).tools).toBeUndefined();
    const system = call.body.messages[0]!.content;
    expect(system).toContain("Daily briefing (COS-1 / COS-2)");
    expect(system).toContain("Rules over persona (PERSONA-3)");
    const prompt = call.body.messages[1]!.content;
    expect(prompt).toContain("Write Tofu's briefing for Wednesday 2026-10-07 (their time zone Europe/Oslo).");
    expect(prompt).toContain("<<<UNTRUSTED_DATA id=");
    // What changed / blocked / needs them / did for them — theirs.
    expect(prompt).toContain('PR corvidlabs/corvidinho#7 "Tofu\'s PR: faster tests" (open)');
    expect(prompt).toContain('issue corvidlabs/corvidinho#11 "Assigned issue"');
    expect(prompt).toContain("/work task waiting on a question: Fix the flaky login test");
    expect(prompt).toContain("your review is requested on PR corvidlabs/corvidinho#9");
    expect(prompt).toContain('schedule "Nightly triage" waits for your answer: Which repo should I triage?');
    expect(prompt).toContain("/work task completed: Ship the Oslo release notes");
    expect(prompt).toContain('schedule "Nightly triage": 2 runs completed');
    // Never anyone else's, never off the allowlist, never a login that is not their id.
    for (const notTheirs of [
      "Bob's secret project plan",
      "Ancient history task",
      "Off-allowlist PR",
      "Denied repo PR",
      "Impostor PR",
      "Not really yours",
      "Approve card",
    ]) {
      expect(prompt).not.toContain(notTheirs);
    }
    // GitHub was searched with Tofu's login only (their numeric id decides).
    expect(github.queries.every((q) => q.includes("tofu-dev"))).toBe(true);
    expect(github.queries.some((q) => q.startsWith("is:pr author:tofu-dev updated:>=2026-10-06T06:35:00Z"))).toBe(true);

    const row = readBriefingRow(db, "tofu")!;
    expect(row).toMatchObject({ day: "2026-10-07", status: "sent", text: null, sentAt: now, coveredTo: now });
  });

  test("never twice a day: later ticks the same day send nothing; the next working day sends again", async () => {
    const db = memDb();
    seed(db, wed(6, 35));
    const s = setup({ db });
    await s.tick(wed(6, 35));
    await s.tick(wed(6, 36));
    await s.tick(wed(12, 0));
    expect(s.dms.filter((d) => d.userId === TOFU_DC)).toHaveLength(1);
    // Two tickers on one data dir (bridge restart overlap): still one.
    const other = setup({ db, llm: s.llm });
    await other.tick(wed(12, 1));
    expect(other.dms).toEqual([]);

    // Thursday 08:35 Oslo: a new day. Since the last briefing only the open
    // ask and blocked task remain (the finished work was already covered).
    await s.tick(wed(6, 35) + DAY);
    const tofu = s.dms.filter((d) => d.userId === TOFU_DC);
    expect(tofu).toHaveLength(2);
    const thursday = s.llm.calls.at(-1)!.body.messages[1]!.content;
    expect(thursday).toContain("Fix the flaky login test");
    expect(thursday).not.toContain("Ship the Oslo release notes");
    // Saturday and Sunday: nothing.
    await s.tick(wed(6, 35) + 3 * DAY);
    await s.tick(wed(6, 35) + 4 * DAY);
    expect(s.dms.filter((d) => d.userId === TOFU_DC)).toHaveLength(2);
  });

  test("without a zone: the owner's declared zone and 9am; without the owner's zone: UTC and 9am", async () => {
    const db = memDb();
    const now = wed(13, 5); // 09:05 in New York.
    db.run(
      `INSERT INTO discord_work_tasks (id, description, user_id, channel_id, status, created_at, updated_at)
       VALUES ('b1', 'Bob refactor done', ?, 'c', 'completed', ?, ?)`,
      [BOB_DC, now - 3600_000, now - 3600_000],
    );
    seed(db, now);
    const s = setup({ db });
    await s.tick(wed(12, 55)); // 08:55 New York: Bob and the owner not yet.
    expect(s.dms.map((d) => d.userId)).not.toContain(BOB_DC);
    expect(s.dms.map((d) => d.userId)).not.toContain(OWNER_DC);
    await s.tick(now);
    // 15:05 in Oslo: Tofu's comes too, in Tofu's own hours.
    expect(s.dms.map((d) => d.userId).sort()).toEqual([OWNER_DC, TOFU_DC, BOB_DC].sort());
    const prompts = s.llm.calls.map((c) => c.body.messages[1]!.content);
    const bob = prompts.find((p) => p.includes("Bob refactor done"))!;
    expect(bob).toContain("(their time zone America/New_York)");
    expect(bob).not.toContain("Fix the flaky login test");
    expect(bob).not.toContain("Approve card");
    // The owner's own briefing: their waiting Approve cards (counts only).
    const leif = prompts.find((p) => p.includes("Write Leif's briefing"))!;
    expect(leif).toContain("1 forget Approve card waiting in your DMs");
    expect(leif).not.toContain("Forget Ada");
    expect(leif).not.toContain("Bob refactor done");

    // The owner declares no zone: Bob's briefing comes at 09:00 UTC.
    const db2 = memDb();
    db2.run(
      `INSERT INTO discord_work_tasks (id, description, user_id, channel_id, status, created_at, updated_at)
       VALUES ('b1', 'Bob refactor done', ?, 'c', 'completed', ?, ?)`,
      [BOB_DC, wed(8), wed(8)],
    );
    const s2 = setup({ db: db2, github: null, peopleText: PEOPLE_TOML.replace('timezone = "America/New_York"\n', "") });
    await s2.tick(wed(8, 55));
    expect(s2.dms).toEqual([]);
    await s2.tick(wed(9, 5));
    expect(s2.dms.map((d) => d.userId)).toEqual([BOB_DC]);
    expect(s2.llm.calls[0]!.body.messages[1]!.content).toContain("(their time zone UTC)");
  });

  test("nothing to say: the day is skipped — no model call, no DM", async () => {
    const s = setup({ github: null });
    await s.tick(wed(6, 35));
    expect(s.dms).toEqual([]);
    expect(s.llm.calls).toHaveLength(0);
    expect(readBriefingRow(s.db, "tofu")).toMatchObject({ status: "skipped", day: "2026-10-07" });
    await s.tick(wed(7, 0));
    expect(s.llm.calls).toHaveLength(0);
  });

  test("the model's text is scrubbed and mass mentions defanged before it is stored or sent", async () => {
    const db = memDb();
    seed(db, wed(6, 35));
    const token = `ghp_${"A".repeat(36)}`;
    let dmOk = false;
    const s = setup({ db, llm: fakeLlm(`Heads up @everyone, your token ${token} leaked`), dmOk: () => dmOk });
    await s.tick(wed(6, 35));
    // The DM did not go out: the text waits, scrubbed at rest.
    const held = readBriefingRow(db, "tofu")!;
    expect(held.status).toBe("pending");
    expect(held.text).not.toContain(token);
    expect(held.text).not.toContain("@everyone");
    expect(SCRUB_TARGETS).toContainEqual({ table: "cos_briefings", columns: ["text"] });
    expect(rescrubDatabase(db).byTable.cos_briefings).toBe(0);
    dmOk = true;
    await s.tick(wed(6, 35) + BRIEFING_DM_RETRY_MS);
    expect(s.dms).toHaveLength(1);
    expect(s.dms[0]!.content).toContain("[redacted:github-token]");
    expect(s.dms[0]!.content).not.toContain(token);
    expect(s.dms[0]!.content).toContain("@​everyone");
    expect(readBriefingRow(db, "tofu")!.text).toBeNull();
  });

  test("a DM that does not go out is retried while their hours last, then dropped — never sent outside them", async () => {
    const db = memDb();
    seed(db, wed(6, 35));
    const s = setup({ db, dmOk: () => false });
    await s.tick(wed(6, 35));
    await s.tick(wed(6, 40)); // within the retry wait: no new attempt
    expect(s.logs.filter((l) => l.includes("briefing.dm_failed"))).toHaveLength(1);
    await s.tick(wed(14, 31)); // 16:31 Oslo: their hours are over
    expect(readBriefingRow(db, "tofu")).toMatchObject({ status: "expired", text: null });
    expect(s.dms).toEqual([]);
    // Tofu's was written once and never again that day.
    expect(s.llm.calls.filter((c) => c.body.messages[1]!.content.includes("Write Tofu's"))).toHaveLength(1);
    await s.tick(wed(14, 45));
    expect(s.llm.calls.filter((c) => c.body.messages[1]!.content.includes("Write Tofu's"))).toHaveLength(1);
    expect(readBriefingRow(db, "tofu")!.status).toBe("expired");
  });

  test("at a spend cap the briefing is not written, nothing is sent, and the owner's spend DM gets the stop once", async () => {
    const db = memDb();
    seed(db, wed(13, 5));
    const stops: HumanAsk[] = [];
    const s = setup({
      db,
      env: llmEnv({ [SPEND_CAP_ENV]: "0" }),
      onSpendStop: (ask) => stops.push(ask),
    });
    await s.tick(wed(13, 5)); // Leif (owner) and Tofu both due: both stop at the cap.
    expect(s.llm.calls).toHaveLength(0);
    expect(s.dms).toEqual([]);
    expect(stops).toHaveLength(1);
    expect(stops[0]!.reason).toBe("spend-cap");
    expect(readBriefingRow(db, "tofu")!.status).toBe("budget");
    expect(readBriefingRow(db, "leif")!.status).toBe("budget");
    await s.tick(wed(13, 40));
    expect(s.llm.calls).toHaveLength(0);
    expect(stops).toHaveLength(1);
  });

  test("a failed model call is retried later the same day, at most three times", async () => {
    const db = memDb();
    seed(db, wed(6, 35));
    let fail = true;
    const llm = fakeLlm();
    const compose: BriefingCompose = async (input) => {
      if (fail) return { ok: false, kind: "failed", error: "LLM HTTP 503" };
      return createBriefingComposer({ env: llmEnv(), db, fetchImpl: llm.fetchImpl })(input);
    };
    const s = setup({ db, compose, llm });
    await s.tick(wed(6, 35));
    expect(readBriefingRow(db, "tofu")).toMatchObject({ status: "failed", attempts: 1 });
    await s.tick(wed(6, 50)); // too soon
    expect(readBriefingRow(db, "tofu")).toMatchObject({ attempts: 1 });
    fail = false;
    await s.tick(wed(7, 6));
    expect(s.dms.map((d) => d.userId)).toEqual([TOFU_DC]);
    expect(readBriefingRow(db, "tofu")).toMatchObject({ status: "sent", attempts: 2 });
  });

  test("no DM path yet: nothing is claimed or written", async () => {
    const db = memDb();
    seed(db, wed(6, 35));
    const llm = fakeLlm();
    const ticker = createBriefingTicker({
      db,
      allowlist: allowlist(),
      people: () => people(),
      owner: () => OWNER,
      sendDm: () => undefined,
      compose: createBriefingComposer({ env: llmEnv(), db, fetchImpl: llm.fetchImpl }),
      github: null,
      log: () => {},
    });
    ticker.tick(wed(6, 35));
    await ticker.settle();
    expect(llm.calls).toHaveLength(0);
    expect(readBriefingRow(db, "tofu")).toBeNull();
  });

  test("the claim is once per person per local day; only a dead compose is taken again, three times at most", () => {
    const db = memDb();
    ensureBriefingTable(db);
    expect(claimBriefingDay(db, "tofu", "2026-10-07", wed(6))).toEqual({ since: null });
    expect(claimBriefingDay(db, "tofu", "2026-10-07", wed(6, 10))).toBeNull();
    // A compose a dead process left (30 min old): taken again.
    expect(claimBriefingDay(db, "tofu", "2026-10-07", wed(6, 40))).toEqual({ since: null });
    expect(claimBriefingDay(db, "tofu", "2026-10-07", wed(7, 20))).toEqual({ since: null });
    expect(readBriefingRow(db, "tofu")!.attempts).toBe(3);
    expect(claimBriefingDay(db, "tofu", "2026-10-07", wed(9))).toBeNull();
    // Sent: never again that day, whatever the time.
    db.run("UPDATE cos_briefings SET status = 'sent', covered_to = ? WHERE id = 'tofu'", [wed(9)]);
    expect(claimBriefingDay(db, "tofu", "2026-10-07", wed(12))).toBeNull();
    // The next day claims, starting where the last one looked.
    expect(claimBriefingDay(db, "tofu", "2026-10-08", wed(9) + DAY)).toEqual({ since: wed(9) });
  });
});

describe("GitHub part: allowlisted repos, their numeric ids only (COS-2, IDENTITY-7.a)", () => {
  test("no numeric id, no login, or no allowed repo: nothing is read", async () => {
    const gh = fakeGithub();
    const since = wed(0);
    expect(
      await readGithubBriefingFacts({ github: gh, recipient: { githubIds: [], githubLogins: ["tofu-dev"] }, allowlist: allowlist(), since }),
    ).toEqual({ changed: [], needs: [] });
    expect(
      await readGithubBriefingFacts({ github: gh, recipient: { githubIds: ["4242"], githubLogins: [] }, allowlist: allowlist(), since }),
    ).toEqual({ changed: [], needs: [] });
    expect(
      await readGithubBriefingFacts({ github: gh, recipient: { githubIds: ["4242"], githubLogins: ["tofu-dev"] }, allowlist: emptyConfig(), since }),
    ).toEqual({ changed: [], needs: [] });
    expect(gh.queries).toEqual([]);
  });

  test("a failed GitHub read leaves its part out and says why", async () => {
    const gh: BriefingGithub = {
      search: async () => {
        throw new Error("GitHub read failed (HTTP 403)");
      },
      requestedReviewerIds: async () => [],
    };
    const r = await readGithubBriefingFacts({
      github: gh,
      recipient: { githubIds: ["4242"], githubLogins: ["tofu-dev"] },
      allowlist: allowlist(),
      since: wed(0),
    });
    expect(r).toEqual({ changed: [], needs: [], error: "GitHub read failed (HTTP 403)" });
  });
});

describe("rides the scheduler tick (COS-1 on the scheduler, not a new loop)", () => {
  test("every tick hands the briefings its clock, also with schedules turned off (PLUGIN-5.a)", async () => {
    const seen: number[] = [];
    const svc = new SchedulerService({
      store: new ScheduleStore({ db: memDb() }),
      agent: { runChat: async () => ({ ok: true, body: "" }) } as unknown as AgentClient,
      allowlist: emptyConfig(),
      manual: true,
      useWorktrees: false,
      now: () => wed(6, 35),
      schedulesEnabled: () => false,
      briefings: { tick: (now) => seen.push(now) },
    });
    await svc.tick();
    await svc.tick();
    expect(seen).toEqual([wed(6, 35), wed(6, 35)]);
  });

  test("the bridge sends the DM through the gateway's DM path only — never a channel post", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-briefing-bridge-"));
    tmpDirs.push(dir);
    const file = join(dir, "allowlist.toml");
    writeFileSync(
      file,
      `[discord]\nchannels = ["chan-1"]\n\n[owner]\ndiscord_id = "${OWNER_DC}"\n${PEOPLE_TOML}`,
    );
    const db = openCorvidinhoDb({ path: join(dir, "corvidinho.db") });
    dbs.push(db);
    seed(db, wed(6, 35));
    const dms: Dm[] = [];
    const replies: unknown[] = [];
    const prompts: string[] = [];
    const compose: BriefingCompose = async ({ recipient, facts }) => {
      prompts.push(`${recipient.personId}: ${JSON.stringify(facts)}`);
      return { ok: true, text: `Briefing for ${recipient.personId}` };
    };
    const idleAgent = {
      runChat: async () => ({ ok: true, body: "" }),
    } as unknown as AgentClient;
    const result = await startBridge({
      env: {
        DISCORD_BOT_TOKEN: "fake",
        DISCORD_CHANNEL_IDS: "chan-1",
        CORVIDINHO_DISCORD_DRY_RUN: "1",
        CORVIDINHO_ALLOWLIST_FILE: file,
        CORVIDINHO_OWNER_DISCORD_ID: OWNER_DC,
      },
      db,
      projectRoot: dir,
      skipProtocolCheck: true,
      thinkingOutbound: memoryThinkingOutbound(),
      agent: idleAgent,
      schedulerPollIntervalMs: 20,
      schedulerNow: () => wed(6, 35),
      briefings: { compose, github: null },
      gatewayFactory: async (_cfg, handlers) => {
        handlers.reply = async (o) => {
          replies.push(o);
          return { messageId: `bot_${replies.length}` };
        };
        handlers.sendDm = async (o) => {
          dms.push(o);
          return { channelId: "dm", messageId: `dm_${dms.length}` };
        };
        return createNullGateway();
      },
    } as Parameters<typeof startBridge>[0]);
    if (!result.ok) throw new Error("bridge did not start");
    const end = Date.now() + 3000;
    while (dms.length === 0 && Date.now() < end) await Bun.sleep(20);
    await Bun.sleep(100); // several more ticks: still one
    await result.stop();
    expect(dms).toEqual([
      { userId: TOFU_DC, content: "📋 Your briefing for Wednesday 2026-10-07 (only you get this)\nBriefing for tofu" },
    ]);
    expect(replies).toEqual([]);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("Fix the flaky login test");
  });
});
