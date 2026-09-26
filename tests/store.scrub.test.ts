/**
 * SAFE-6 scrub before persist + automatic re-scrub (REQ-discord-066 / #66).
 * Fake secrets are assembled at runtime — never realistic literals in the repo.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionStore } from "../src/discord/session-store.ts";
import { WorkStore } from "../src/discord/work-store.ts";
import { MemoryStore } from "../src/memory/store.ts";
import { ScheduleStore } from "../src/scheduler/store.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import {
  SCRUB_RULES_VERSION,
  ensureScrubbed,
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
    const run = schedules.markRunStarted(s);
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
