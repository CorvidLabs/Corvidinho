/**
 * SAFE-6 scrub before persist + automatic re-scrub (REQ-discord-066 / #66).
 * Fake secrets are assembled at runtime — never realistic literals in the repo.
 */
import { describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { askFromToolArguments } from "../src/agent/ask.ts";
import { buttonAskFor, toPendingAsk, type PendingAsk } from "../src/discord/ask-buttons.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import { WorkStore } from "../src/discord/work-store.ts";
import { MemoryStore } from "../src/memory/store.ts";
import { ScheduleStore } from "../src/scheduler/store.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import {
  ERROR_LINE_MAX,
  SCRUB_RULES_VERSION,
  SCRUB_TARGETS,
  ensureScrubbed,
  formatErrorLine,
  rescrubDatabase,
  scrubSecrets,
} from "../src/store/scrub.ts";

const a = (n: number) => "a1B2c3D4e5".repeat(Math.ceil(n / 10)).slice(0, n);
const FAKE = {
  github: "gh" + "p_" + a(36),
  githubPat: "github" + "_pat_" + a(40),
  openai: "s" + "k-proj-" + a(40),
  anthropic: "s" + "k-ant-api03-" + a(40),
  slack: "xo" + "xb-" + a(24),
  aws: "AK" + "IA" + "ABCDEFGHIJKLMNOP",
  google: "AI" + "za" + a(35),
  jwt: "ey" + "J" + a(20) + ".ey" + "J" + a(20) + "." + a(24),
  discord: "M" + a(25) + "." + a(6) + "." + a(30),
  pem: "-----BEGIN " + "OPENSSH PRIVATE KEY-----\n" + a(40) + "\n-----END OPENSSH PRIVATE KEY-----",
};

describe("scrubSecrets (SAFE-6)", () => {
  test("redacts each vendor shape and keeps the rest", () => {
    for (const [kind, secret] of Object.entries(FAKE)) {
      const out = scrubSecrets(`before ${secret} after`);
      expect(out).not.toContain(secret);
      expect(out).toContain("[redacted:");
      expect(out.startsWith("before ")).toBe(true);
      expect(out.endsWith(" after")).toBe(true);
      expect(scrubSecrets(out)).toBe(out); // idempotent
      expect(kind.length).toBeGreaterThan(0);
    }
    expect(scrubSecrets("Authorization: Bearer " + a(32))).toBe(
      "Authorization: Bearer [redacted:bearer]",
    );
    expect(scrubSecrets(FAKE.anthropic)).toBe("[redacted:anthropic-key]");
  });

  test("ordinary text is untouched", () => {
    const plain = "task-runner sk- skip ghp dashboard eyJ short Bearer x AKIA-short";
    expect(scrubSecrets(plain)).toBe(plain);
  });

  test("private keys and JWTs in diff-shaped text are still redacted", () => {
    const pemBody = a(64);
    const key = (kind: string) =>
      `+-----BEGIN ${kind} PRIVATE KEY-----\n+${pemBody}\n+${pemBody}\n+-----END ${kind} PRIVATE KEY-----`;
    // Two keys back to back, a lone header before them, and a JWT after a dash.
    const text = `+-----BEGIN NOTE-----\n${key("RSA")}\n${key("EC")}\n x-${FAKE.jwt}\n`;
    const out = scrubSecrets(text);
    expect(out).not.toContain(pemBody);
    expect(out.match(/\[redacted:private-key\]/g)).toHaveLength(2);
    expect(out).toContain("x-[redacted:jwt]");
    expect(out.startsWith("+-----BEGIN NOTE-----\n")).toBe(true);
  });

  test("runs in linear time on hostile input (many openers, no closer)", () => {
    // Before the linear patterns each of these took seconds: every opener
    // rescanned to the end of the text looking for its closer.
    const hostile = [
      "eyJ-".repeat(50_000),
      "eyJ" + "a".repeat(8) + ".eyJ-" + "eyJ-".repeat(50_000),
    ];
    for (const text of hostile) {
      const started = performance.now();
      const out = scrubSecrets(text);
      const ms = performance.now() - started;
      expect(out).toBe(text); // nothing here is a complete secret
      expect(ms).toBeLessThan(1_000);
    }
    // Private-key openers with no closer are redacted (an open block is a key
    // cut before its END line, REQ-discord-066), still in linear time.
    const openKeys = [
      "+-----BEGIN A PRIVATE KEY-----\n".repeat(20_000),
      "-----BEGIN A PRIVATE KEY-----".repeat(20_000),
      "-----BEGIN A PRIVATE KEY-----\n" + "+QUJDREVGR0hJSktMTU5PUA==\n".repeat(20_000),
      "-----BEGIN A PRIVATE KEY-----\n" + "-----END A B C\n".repeat(20_000),
      "-----BEGIN A PRIVATE KEY-----\n-----END " + "A ".repeat(100_000),
    ];
    for (const text of openKeys) {
      const started = performance.now();
      const out = scrubSecrets(text);
      const ms = performance.now() - started;
      expect(out).not.toContain("PRIVATE KEY");
      expect(out).not.toContain("QUJDREVG");
      expect(out).toContain("[redacted:private-key]");
      expect(ms).toBeLessThan(1_000);
    }
  });

  test("a private-key block cut before its END line is redacted (REQ-discord-066)", () => {
    const body = a(64);
    const header = "-----BEGIN " + "RSA PRIVATE KEY-----";
    const full = `${header}\n${body}\n-----END RSA PRIVATE KEY-----`;
    const cert = "-----BEGIN CERTIFICATE-----\nCERTBODY\n-----END CERTIFICATE-----";

    // No END line: redact from the header through the end of the text.
    const open = `keep this\n${header}\n${body}\n${body.slice(0, 20)}`;
    expect(scrubSecrets(open)).toBe("keep this\n[redacted:private-key]");
    expect(scrubSecrets(`${header}${body}`)).toBe("[redacted:private-key]");
    // An open block stops at the next BEGIN line: a following full key is
    // redacted on its own and a certificate after it is kept.
    expect(scrubSecrets(`${header}\n${body}\n${full}\ntail`)).toBe(
      "[redacted:private-key][redacted:private-key]\ntail",
    );
    expect(scrubSecrets(`${header}\n${body}\n${cert}\ntail`)).toBe(
      `[redacted:private-key]${cert}\ntail`,
    );
    // Full blocks are still redacted one by one and the text between is kept.
    expect(scrubSecrets(`a ${full} b ${full} c`)).toBe(
      "a [redacted:private-key] b [redacted:private-key] c",
    );
    const once = scrubSecrets(open);
    expect(scrubSecrets(once)).toBe(once); // idempotent

    // Text with no private key is unchanged, including other PEM headers.
    for (const plain of [
      "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE\n",
      `${cert}\n`,
      "-----BEGIN CERTIFICATE-----\nno end line here",
      "Paste the key file (it starts with a BEGIN line) into the vault.",
    ]) {
      expect(scrubSecrets(plain)).toBe(plain);
    }
  });
});

describe("scrub on every write path", () => {
  test("sessions, work tasks, schedules, runs and memories persist scrubbed", () => {
    const db = openCorvidinhoDb({ memory: true });
    const sessions = new SessionStore({ db });
    sessions.create({ channelId: "c", userId: "u", topic: `deploy with ${FAKE.github}` });
    const work = new WorkStore({ db });
    const task = work.create({ description: `use ${FAKE.openai}`, userId: "u", channelId: "c" });
    work.setStatus(task, "completed", `done, token ${FAKE.slack}`);
    const schedules = new ScheduleStore({ db });
    const s = schedules.create({
      name: `nightly ${FAKE.aws}`,
      cronExpression: "0 * * * *",
      project: "p",
      prompt: `call api with ${FAKE.anthropic}`,
      createdByUserId: "u",
    });
    const run = schedules.claimRun(s)!;
    schedules.markRunFinished(s, run, { ok: false, error: `401 for ${FAKE.jwt}` });
    const memory = new MemoryStore({ db });
    const rec = memory.store({ ownerUserId: "u", category: "person", key: `k ${FAKE.google}`, content: `pw ${FAKE.pem}` });
    expect(rec.content).toContain("[redacted:private-key]");

    const dump = JSON.stringify([
      db.query("SELECT topic FROM discord_sessions").all(),
      db.query("SELECT description, summary FROM discord_work_tasks").all(),
      db.query("SELECT name, prompt FROM schedules").all(),
      db.query("SELECT summary, error FROM schedule_runs").all(),
      db.query("SELECT key, content FROM memories").all(),
    ]);
    for (const secret of Object.values(FAKE)) expect(dump).not.toContain(secret.slice(0, 20));
    expect(dump).toContain("[redacted:github-token]");
    expect(dump).toContain("[redacted:jwt]");
  });
});

describe("automatic re-scrub when rules tighten", () => {
  test("rows written raw are scrubbed on next open; version recorded once", () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-scrub-"));
    try {
      const path = join(dir, "corvidinho.db");
      const db1 = openCorvidinhoDb({ path });
      // Simulate rows saved before these rules existed.
      db1.run(
        "INSERT INTO discord_sessions (id, channel_id, user_id, topic, created_at, last_activity_at) VALUES ('s1','c','u',?,1,1)",
        [`old ${FAKE.discord}`],
      );
      db1.run(
        "INSERT INTO memories (id, owner_user_id, category, key, content, created_at, updated_at) VALUES ('m1','u','person',?,?,1,1)",
        [FAKE.github, "x"],
      );
      db1.run(
        "INSERT INTO memories (id, owner_user_id, category, key, content, created_at, updated_at) VALUES ('m2','u','person',?,?,1,1)",
        ["[redacted:github-token]", "y"],
      );
      db1.run("UPDATE schema_meta SET value = '0' WHERE key = 'scrub_rules_version'");
      db1.close();

      const db2 = openCorvidinhoDb({ path });
      const topic = (db2.query("SELECT topic FROM discord_sessions WHERE id='s1'").get() as { topic: string }).topic;
      expect(topic).toBe("old [redacted:discord-token]");
      const keys = (db2.query("SELECT key FROM memories ORDER BY id").all() as Array<{ key: string }>).map((r) => r.key);
      expect(keys[0]).toBe("[redacted:github-token]#m1");
      expect(keys[1]).toBe("[redacted:github-token]");
      const v = db2.query("SELECT value FROM schema_meta WHERE key = 'scrub_rules_version'").get() as { value: string };
      expect(Number(v.value)).toBe(SCRUB_RULES_VERSION);
      expect(ensureScrubbed(db2)).toEqual({ ran: false, rowsUpdated: 0 });
      expect(rescrubDatabase(db2).rowsUpdated).toBe(0);
      db2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("re-scrub covers every column REQ-discord-066 lists", () => {
  // [table, column, fake secret, stored after the re-scrub] — a different
  // vendor kind per column (all ten kinds once), so a column dropped from
  // SCRUB_TARGETS (or read from the wrong row) shows up.
  const r = (kind: string) => `[redacted:${kind}]`;
  const LISTED: ReadonlyArray<[table: string, column: string, secret: string, stored: string]> = [
    ["discord_sessions", "topic", FAKE.discord, r("discord-token")],
    ["discord_work_tasks", "description", FAKE.github, r("github-token")],
    ["discord_work_tasks", "summary", FAKE.openai, r("openai-key")],
    ["schedules", "name", FAKE.slack, r("slack-token")],
    ["schedules", "description", FAKE.aws, r("aws-key")],
    ["schedules", "prompt", FAKE.google, r("google-key")],
    ["schedule_runs", "summary", FAKE.jwt, r("jwt")],
    ["schedule_runs", "error", FAKE.anthropic, r("anthropic-key")],
    ["memories", "key", "Bearer " + a(32), `Bearer ${r("bearer")}`],
    ["memories", "content", FAKE.pem, r("private-key")],
  ];

  test("SCRUB_TARGETS lists each of them", () => {
    for (const [table, column] of LISTED) {
      const target = SCRUB_TARGETS.find((t) => t.table === table);
      expect({ table, column, listed: target?.columns.includes(column) ?? false }).toEqual({
        table,
        column,
        listed: true,
      });
    }
  });

  test("raw work task, schedule, run summary/error and memory rows are scrubbed on next open", () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-scrub-cols-"));
    const raw = (table: string, column: string) => {
      const hit = LISTED.find(([t, c]) => t === table && c === column)!;
      return `old ${hit[2]}`;
    };
    try {
      const path = join(dir, "corvidinho.db");
      const db1 = openCorvidinhoDb({ path });
      // Rows saved before the current rules, written around the stores.
      db1.run(
        "INSERT INTO discord_sessions (id, channel_id, user_id, topic, created_at, last_activity_at) VALUES ('s1','c','u',?,1,1)",
        [raw("discord_sessions", "topic")],
      );
      db1.run(
        `INSERT INTO discord_work_tasks (id, description, user_id, channel_id, status, created_at, updated_at, summary)
         VALUES ('w1', ?, 'u', 'c', 'done', 1, 1, ?)`,
        [raw("discord_work_tasks", "description"), raw("discord_work_tasks", "summary")],
      );
      db1.run(
        `INSERT INTO schedules (id, name, description, cron_expression, project, prompt, created_by_user_id, created_at, updated_at)
         VALUES ('sc1', ?, ?, '0 * * * *', 'p', ?, 'u', 1, 1)`,
        [raw("schedules", "name"), raw("schedules", "description"), raw("schedules", "prompt")],
      );
      db1.run(
        `INSERT INTO schedule_runs (id, schedule_id, status, summary, error, started_at)
         VALUES ('r1', 'sc1', 'failed', ?, ?, 1)`,
        [raw("schedule_runs", "summary"), raw("schedule_runs", "error")],
      );
      db1.run(
        "INSERT INTO memories (id, owner_user_id, category, key, content, created_at, updated_at) VALUES ('m1','u','person',?,?,1,1)",
        [raw("memories", "key"), raw("memories", "content")],
      );
      db1.run("UPDATE schema_meta SET value = '0' WHERE key = 'scrub_rules_version'");
      db1.close();

      const db2 = openCorvidinhoDb({ path });
      for (const [table, column, secret, stored] of LISTED) {
        const row = db2.query(`SELECT ${column} AS v FROM ${table}`).get() as { v: string };
        expect({ table, column, value: row.v }).toEqual({ table, column, value: `old ${stored}` });
        expect(row.v).not.toContain(secret.slice(0, 20));
      }
      expect(rescrubDatabase(db2).rowsUpdated).toBe(0);
      db2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("open Discord asks persist scrubbed and are re-scrubbed as JSON (SAFE-6)", () => {
  // A private-key block with no END line: a text scrub runs to the end of the text.
  const openKey = "-----BEGIN " + "OPENSSH PRIVATE KEY-----\n" + a(40);
  const pendingRow = (db: ReturnType<typeof openCorvidinhoDb>, id: string) =>
    (db.query("SELECT pending_ask FROM discord_sessions WHERE id = ?").get(id) as {
      pending_ask: string | null;
    }).pending_ask;

  test("question and option labels are scrubbed in the one-object and the array row; ids reload unchanged", () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-scrub-asks-"));
    try {
      const path = join(dir, "corvidinho.db");
      const db1 = openCorvidinhoDb({ path });
      const store1 = new SessionStore({ db: db1 });
      const s = store1.create({ channelId: "c", userId: "u" });
      const button: PendingAsk = {
        ...toPendingAsk(
          {
            reason: "clarify",
            question: `Which token? ${FAKE.github}`,
            options: [
              { id: "keep", label: `keep ${FAKE.anthropic}` },
              { id: "drop", label: "drop it" },
            ],
          },
          { askId: "aska" },
        ),
        stubMessageId: "stub-a",
      };
      store1.setPendingAsk(s, button);
      expect(JSON.parse(pendingRow(db1, s.id)!)).toEqual({
        reason: "clarify",
        question: "Which token? [redacted:github-token]",
        askId: "aska",
        expiresAt: button.expiresAt,
        options: [
          { id: "keep", label: "keep [redacted:anthropic-key]" },
          { id: "drop", label: "drop it" },
        ],
        stubMessageId: "stub-a",
      });

      // A second open ask (free text) turns the row into an array (SESSION-MULTI-3).
      const text = toPendingAsk(
        { reason: "stuck", question: `Retry with ${FAKE.openai}?` },
        { askId: "askb" },
      );
      store1.setPendingAsk(s, text);
      const stored = pendingRow(db1, s.id)!;
      for (const secret of [FAKE.github, FAKE.anthropic, FAKE.openai]) {
        expect(stored).not.toContain(secret.slice(0, 20));
      }
      const many = JSON.parse(stored) as Array<Record<string, unknown>>;
      expect(many.map((x) => x.askId)).toEqual(["aska", "askb"]);
      expect(many[0]!.question).toBe("Which token? [redacted:github-token]");
      expect(many[1]!.question).toBe("Retry with [redacted:openai-key]?");
      db1.close();

      const db2 = openCorvidinhoDb({ path });
      const store2 = new SessionStore({ db: db2 });
      const back = store2.get(s.id)!;
      expect(back.pendingAsk).toMatchObject({
        askId: "askb",
        expiresAt: text.expiresAt,
        question: "Retry with [redacted:openai-key]?",
      });
      expect(back.openAsks).toHaveLength(1);
      expect(back.openAsks![0]).toMatchObject({
        askId: "aska",
        expiresAt: button.expiresAt,
        stubMessageId: "stub-a",
        question: "Which token? [redacted:github-token]",
      });
      expect(back.openAsks![0]!.options).toEqual([
        { id: "keep", label: "keep [redacted:anthropic-key]" },
        { id: "drop", label: "drop it" },
      ]);
      expect(store2.findPendingAsk("aska")?.session.id).toBe(s.id);
      db2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("raw rows from an older build are rewritten as valid JSON on next open, ids byte-identical; second open is a no-op", () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-rescrub-asks-"));
    try {
      const path = join(dir, "corvidinho.db");
      const now = Date.now();
      const single = {
        reason: "clarify",
        question: `Paste it? ${openKey}`,
        askId: "ask1",
        expiresAt: now + 60_000,
        options: [
          { id: "yes", label: `yes ${FAKE.slack}` },
          { id: "no", label: "no" },
        ],
        stubMessageId: "1111",
      };
      const array = [
        {
          reason: "clarify",
          question: "Which DB?",
          askId: "ask2",
          expiresAt: now + 60_000,
          options: [
            { id: "pg", label: "Postgres" },
            { id: "my", label: "MySQL" },
          ],
          stubMessageId: "2222",
        },
        { reason: "stuck", question: `401 with ${FAKE.github}`, askId: "ask3", expiresAt: now + 120_000 },
      ];
      const clean = JSON.stringify({ reason: "clarify", question: "Ship it?", askId: "ask4", expiresAt: now + 60_000 });
      // A text scrub would cut the row: the open key block runs to the end.
      expect(() => JSON.parse(scrubSecrets(JSON.stringify(single)))).toThrow();

      const db1 = openCorvidinhoDb({ path });
      const insert = db1.prepare(
        "INSERT INTO discord_sessions (id, channel_id, user_id, pending_ask, created_at, last_activity_at) VALUES (?, 'c', ?, ?, ?, ?)",
      );
      insert.run("s1", "u1", JSON.stringify(single), now, now);
      insert.run("s2", "u2", JSON.stringify(array), now, now);
      insert.run("s3", "u3", clean, now, now);
      // Saved under the previous rules (version 2 did not re-scrub open asks).
      db1.run("UPDATE schema_meta SET value = '2' WHERE key = 'scrub_rules_version'");
      db1.close();

      const db2 = openCorvidinhoDb({ path });
      const one = pendingRow(db2, "s1")!;
      expect(one).not.toContain(a(40));
      expect(one).not.toContain(FAKE.slack);
      expect(JSON.parse(one)).toEqual({
        ...single,
        question: "Paste it? [redacted:private-key]",
        options: [
          { id: "yes", label: "yes [redacted:slack-token]" },
          { id: "no", label: "no" },
        ],
      });
      expect(one).toContain(`"askId":"ask1","expiresAt":${single.expiresAt}`);
      expect(one).toContain(`"stubMessageId":"1111"`);
      const two = pendingRow(db2, "s2")!;
      expect(two).not.toContain(FAKE.github);
      expect(JSON.parse(two)).toEqual([array[0], { ...array[1], question: "401 with [redacted:github-token]" }]);
      expect(pendingRow(db2, "s3")).toBe(clean);
      const v = db2.query("SELECT value FROM schema_meta WHERE key = 'scrub_rules_version'").get() as { value: string };
      expect(Number(v.value)).toBe(SCRUB_RULES_VERSION);
      expect(ensureScrubbed(db2)).toEqual({ ran: false, rowsUpdated: 0 });
      expect(rescrubDatabase(db2)).toMatchObject({ rowsUpdated: 0, jsonUnparsed: 0 });
      expect(pendingRow(db2, "s1")).toBe(one);

      // The rewritten rows still load as open asks, buttons intact.
      const store = new SessionStore({ db: db2 });
      expect(store.get("s1")!.pendingAsk).toMatchObject({
        askId: "ask1",
        expiresAt: single.expiresAt,
        stubMessageId: "1111",
        question: "Paste it? [redacted:private-key]",
      });
      expect(store.get("s1")!.pendingAsk!.options?.map((o) => o.id)).toEqual(["yes", "no"]);
      expect(store.findPendingAsk("ask2")).toMatchObject({ session: { id: "s2" }, ask: { stubMessageId: "2222" } });
      expect(store.findPendingAsk("ask3")?.ask.question).toBe("401 with [redacted:github-token]");
      db2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a secret-looking option id is swapped for its position when the ask is made, and scrubbed on write and on re-scrub", () => {
    // Model-chosen ids keep 32 chars of [A-Za-z0-9_-]: an AWS key id fits
    // whole and a GitHub token keeps 28 of its 36 characters.
    const made = askFromToolArguments(
      JSON.stringify({
        question: "Which key?",
        options: [
          { id: FAKE.github, label: "first" },
          { id: FAKE.aws, label: "second" },
          { id: "keep", label: "third" },
        ],
      }),
    );
    if (!made.ok) throw new Error("ask-human refused the ask");
    expect(made.ask.options!.map((o) => o.id)).toEqual(["1", "2", "keep"]);

    const dir = mkdtempSync(join(tmpdir(), "corvidinho-scrub-ask-ids-"));
    try {
      const path = join(dir, "corvidinho.db");
      const db1 = openCorvidinhoDb({ path });
      const store = new SessionStore({ db: db1 });
      const s = store.create({ channelId: "c", userId: "u" });
      const button = buttonAskFor({ ask: made.ask })!.pending;
      store.setPendingAsk(s, button);
      const row = pendingRow(db1, s.id)!;
      expect(row).not.toContain("gh" + "p_");
      expect(row).not.toContain(FAKE.aws);
      expect(JSON.parse(row).options.map((o: { id: string }) => o.id)).toEqual(["1", "2", "keep"]);

      // An ask built without normalizeAskOptions is still scrubbed on write.
      const direct = toPendingAsk(
        {
          reason: "clarify",
          question: "Pick",
          options: [
            { id: FAKE.aws, label: "a" },
            { id: "b", label: "b" },
          ],
        },
        { askId: "askd" },
      );
      const s2 = store.create({ channelId: "c", userId: "u2" });
      store.setPendingAsk(s2, direct);
      expect(JSON.parse(pendingRow(db1, s2.id)!).options).toEqual([
        { id: "[redacted:aws-key]", label: "a" },
        { id: "b", label: "b" },
      ]);

      // An older build stored the id raw: the re-scrub redacts it too, and the
      // row's other ids stay byte-identical.
      const now = Date.now();
      const older = {
        reason: "clarify",
        question: "Which?",
        askId: "ask9",
        expiresAt: now + 60_000,
        options: [
          { id: FAKE.aws, label: "x" },
          { id: "y", label: "y" },
        ],
        stubMessageId: "9999",
      };
      db1.run(
        "INSERT INTO discord_sessions (id, channel_id, user_id, pending_ask, created_at, last_activity_at) VALUES ('s9', 'c', 'u9', ?, ?, ?)",
        [JSON.stringify(older), now, now],
      );
      db1.run("UPDATE schema_meta SET value = '2' WHERE key = 'scrub_rules_version'");
      db1.close();

      const db2 = openCorvidinhoDb({ path });
      const rewritten = pendingRow(db2, "s9")!;
      expect(rewritten).not.toContain(FAKE.aws);
      expect(JSON.parse(rewritten)).toEqual({
        ...older,
        options: [
          { id: "[redacted:aws-key]", label: "x" },
          { id: "y", label: "y" },
        ],
      });
      expect(rewritten).toContain(`"askId":"ask9","expiresAt":${older.expiresAt}`);
      expect(rewritten).toContain(`"stubMessageId":"9999"`);
      expect(pendingRow(db2, s.id)).toBe(row);
      db2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a stored ask that is not JSON is scrubbed as text and counted; its content is never logged", () => {
    const db = openCorvidinhoDb({ memory: true });
    const cut = `{"reason":"clarify","question":"cut ${FAKE.github}`;
    db.run(
      "INSERT INTO discord_sessions (id, channel_id, user_id, pending_ask, created_at, last_activity_at) VALUES ('s1', 'c', 'u', ?, 1, 1)",
      [cut],
    );
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const r = rescrubDatabase(db);
      expect(r.jsonUnparsed).toBe(1);
      expect(r.byTable.discord_sessions).toBe(1);
      expect(pendingRow(db, "s1")).toBe(`{"reason":"clarify","question":"cut [redacted:github-token]`);
      const logged = warn.mock.calls.flat().map(String).join("\n");
      expect(logged).toContain("discord_sessions.pending_ask: 1");
      expect(logged).not.toContain("cut ");
      expect(logged).not.toContain(FAKE.github);
      expect(logged).not.toContain("[redacted:");
    } finally {
      warn.mockRestore();
      db.close();
    }
  });
});

describe("formatErrorLine (SAFE-6 / REQ-discord-417)", () => {
  const noEnv = { env: {} };

  test("first line of the message only: no stack, no code frame", () => {
    const err = new Error("boom\n    at x (y.ts:1:1)\n12 | code");
    expect(formatErrorLine(err, noEnv)).toBe("boom");
  });

  test("vendor-key shapes are scrubbed, including a key block spanning lines", () => {
    expect(formatErrorLine(new Error(`token ${FAKE.github} rejected`), noEnv)).toBe(
      "token [redacted:github-token] rejected",
    );
    expect(formatErrorLine(new Error(`key ${FAKE.pem} x`), noEnv)).toBe(
      "key [redacted:private-key] x",
    );
  });

  test("a secret env value is redacted even without a vendor shape; short ones are not", () => {
    const env = { DISCORD_TOKEN: "garbage-token-1234", GH_TOKEN: "abc" };
    expect(formatErrorLine(new Error("bad garbage-token-1234 and abc"), { env })).toBe(
      "bad [redacted:env-secret] and abc",
    );
  });

  test("programming errors keep their class name; library names are dropped", () => {
    expect(formatErrorLine(new TypeError("x is not a function"), noEnv)).toBe(
      "TypeError: x is not a function",
    );
    const lib = Object.assign(new Error("401: Unauthorized"), { name: "DiscordAPIError[0]" });
    expect(formatErrorLine(lib, noEnv)).toBe("401: Unauthorized");
  });

  test("non-Error values and empty messages still give one line", () => {
    expect(formatErrorLine("plain", noEnv)).toBe("plain");
    expect(formatErrorLine({ message: "obj" }, noEnv)).toBe("obj");
    expect(formatErrorLine(42, noEnv)).toBe("42");
    expect(formatErrorLine(new Error(""), noEnv)).toBe("Error");
    expect(formatErrorLine("  \n ", noEnv)).toBe("unknown error");
    expect(formatErrorLine(Object.create(null), noEnv)).toBe("(unprintable error)");
  });

  test("capped at ERROR_LINE_MAX", () => {
    const line = formatErrorLine(new Error("x".repeat(1000)), noEnv);
    expect(line.length).toBe(ERROR_LINE_MAX);
    expect(line.endsWith("…")).toBe(true);
  });
});
