/**
 * DISCORD-SCHEDULE slash fixtures (no live token).
 */
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { emptyConfig } from "../src/allowlist/types.ts";
import { appendAudit, argsDigest, verifyAudit } from "../src/audit/index.ts";
import { createEchoAgentClient } from "../src/discord/agent-client.ts";
import { CORVIDINHO_PROTOCOL_VERSION } from "../src/discord/protocol-version.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import {
  buildSlashCommandBodies,
  SLASH_COMMAND_NAMES,
} from "../src/discord/slash-commands.ts";
import { handleSlashInteraction } from "../src/discord/slash-dispatch.ts";
import type {
  SlashContext,
  SlashInteraction,
  SlashReplyPayload,
} from "../src/discord/slash-types.ts";
import { NOT_AUTHORIZED } from "../src/discord/types.ts";
import { WorkStore } from "../src/discord/work-store.ts";
import { ScheduleStore } from "../src/scheduler/store.ts";
import { migrateCorvidinhoDb } from "../src/store/db.ts";

function allowCfg(channels: string[] = ["chan-allowed"]) {
  const cfg = emptyConfig();
  cfg.discord.channels = channels.map((c) => c.toLowerCase());
  return cfg;
}

function memoryInteraction(
  over: Partial<SlashInteraction> & { commandName: string },
): SlashInteraction & { replies: SlashReplyPayload[] } {
  const replies: SlashReplyPayload[] = [];
  return {
    id: over.id ?? "ix_1",
    commandName: over.commandName,
    subcommand: over.subcommand,
    channelId: over.channelId ?? "chan-allowed",
    guildId: over.guildId,
    userId: over.userId ?? "user-1",
    options: over.options ?? {},
    roleIds: over.roleIds,
    replies,
    reply: async (opts) => {
      replies.push(opts);
    },
  };
}

function makeCtx(over: Partial<SlashContext> = {}): SlashContext {
  return {
    store: over.store ?? new SessionStore(),
    workStore: over.workStore ?? new WorkStore(),
    scheduleStore: over.scheduleStore ?? new ScheduleStore(),
    allowlist: over.allowlist ?? allowCfg(),
    agent: over.agent ?? createEchoAgentClient({ delayMs: 0 }),
    version: over.version ?? "0.0.3",
    protocolVersion: over.protocolVersion ?? CORVIDINHO_PROTOCOL_VERSION,
    startedAt: over.startedAt ?? Date.now() - 90_000,
    channelIds: over.channelIds ?? ["chan-allowed"],
    adminUserIds: over.adminUserIds,
    adminRoleIds: over.adminRoleIds,
    owner: over.owner,
    mutedUsers: over.mutedUsers,
    recordAudit: over.recordAudit,
  };
}

describe("/schedule bodies", () => {
  test("includes schedule with list/create/pause/resume/delete", () => {
    expect(SLASH_COMMAND_NAMES).toContain("schedule");
    const schedule = buildSlashCommandBodies().find((b) => b.name === "schedule");
    expect(schedule?.options?.map((o) => o.name).sort()).toEqual([
      "create",
      "delete",
      "list",
      "pause",
      "resume",
    ]);
    const create = schedule?.options?.find((o) => o.name === "create");
    expect(create?.options?.map((o) => o.name).sort()).toEqual([
      "cadence",
      "channel",
      "name",
      "project",
      "prompt",
    ]);
  });
});

describe("/schedule dispatch", () => {
  test("list empty", async () => {
    const ctx = makeCtx();
    const ix = memoryInteraction({
      commandName: "schedule",
      subcommand: "list",
    });
    const r = await handleSlashInteraction(ctx, ix);
    expect(r.ok).toBe(true);
    expect(ix.replies[0]?.content).toContain("No schedules");
  });

  test("create requires admin; empty admin = deny-all", async () => {
    const ctx = makeCtx({ owner: null });
    const ix = memoryInteraction({
      commandName: "schedule",
      subcommand: "create",
      userId: "nobody",
      options: {
        name: "Hourly",
        cadence: "every hour",
        project: "Corvidinho",
        prompt: "Check status",
      },
    });
    const r = await handleSlashInteraction(ctx, ix);
    expect(r.ok).toBe(true); // handler replied not-authorized
    expect(ix.replies[0]?.content).toBe(NOT_AUTHORIZED);
    expect(ctx.scheduleStore!.list()).toHaveLength(0);
  });

  test("admin create + list + pause + resume + delete", async () => {
    const auditDb = new Database(":memory:");
    migrateCorvidinhoDb(auditDb);
    const ctx = makeCtx({
      owner: { discordId: "boss" },
      recordAudit: (entry) => appendAudit(auditDb, entry),
    });
    const createIx = memoryInteraction({
      commandName: "schedule",
      subcommand: "create",
      userId: "boss",
      options: {
        name: "Hourly dig",
        cadence: "@hourly",
        // Bridge project root (REQ-discord-202: create checks project scope).
        project: ".",
        prompt: "Summarize open issues",
        channel: "chan-allowed",
      },
    });
    await handleSlashInteraction(ctx, createIx);
    expect(createIx.replies[0]?.content).toContain("Schedule created");
    expect(ctx.scheduleStore!.list()).toHaveLength(1);
    const id = ctx.scheduleStore!.list()[0]!.id;

    const listIx = memoryInteraction({
      commandName: "schedule",
      subcommand: "list",
      userId: "peer",
    });
    await handleSlashInteraction(ctx, listIx);
    expect(listIx.replies[0]?.content).toContain("Hourly dig");

    const pauseIx = memoryInteraction({
      commandName: "schedule",
      subcommand: "pause",
      userId: "boss",
      options: { schedule: id },
    });
    await handleSlashInteraction(ctx, pauseIx);
    expect(ctx.scheduleStore!.get(id)?.status).toBe("paused");

    const resumeIx = memoryInteraction({
      commandName: "schedule",
      subcommand: "resume",
      userId: "boss",
      options: { schedule: id.slice(0, 10) },
    });
    await handleSlashInteraction(ctx, resumeIx);
    expect(ctx.scheduleStore!.get(id)?.status).toBe("active");

    const delIx = memoryInteraction({
      commandName: "schedule",
      subcommand: "delete",
      userId: "boss",
      options: { schedule: id },
    });
    await handleSlashInteraction(ctx, delIx);
    expect(ctx.scheduleStore!.list()).toHaveLength(0);
  });

  test("create rejects non-allowlisted channel and <5m cadence", async () => {
    const ctx = makeCtx({ owner: { discordId: "boss" } });
    const badChan = memoryInteraction({
      commandName: "schedule",
      subcommand: "create",
      userId: "boss",
      options: {
        name: "x",
        cadence: "every hour",
        project: "p",
        prompt: "do",
        channel: "chan-other",
      },
    });
    await handleSlashInteraction(ctx, badChan);
    expect(badChan.replies[0]?.content).toMatch(/not allowlisted/i);

    const fast = memoryInteraction({
      commandName: "schedule",
      subcommand: "create",
      userId: "boss",
      options: {
        name: "fast",
        cadence: "every 1 minute",
        project: "p",
        prompt: "do",
      },
    });
    await handleSlashInteraction(ctx, fast);
    expect(fast.replies[0]?.content).toMatch(/5 minutes/i);
    expect(ctx.scheduleStore!.list()).toHaveLength(0);
  });

  test(
    "create with a zero cron step replies with the CadenceError and the bridge keeps answering (W12)",
    () => {
      // The handler parses the cadence synchronously in the bridge process,
      // so on main `*/0` froze it for good. Run it in a child bun with a
      // hard timeout: a hang gets the child killed and fails this test.
      const src = (p: string) =>
        JSON.stringify(resolve(import.meta.dir, "../src", p));
      const script = `
        import { emptyConfig } from ${src("allowlist/types.ts")};
        import { createEchoAgentClient } from ${src("discord/agent-client.ts")};
        import { CORVIDINHO_PROTOCOL_VERSION } from ${src("discord/protocol-version.ts")};
        import { SessionStore } from ${src("discord/session-store.ts")};
        import { handleSlashInteraction } from ${src("discord/slash-dispatch.ts")};
        import { WorkStore } from ${src("discord/work-store.ts")};
        import { ScheduleStore } from ${src("scheduler/store.ts")};
        const allowlist = emptyConfig();
        allowlist.discord.channels = ["chan-allowed"];
        const ctx = {
          store: new SessionStore(), workStore: new WorkStore(),
          scheduleStore: new ScheduleStore(), allowlist,
          agent: createEchoAgentClient({ delayMs: 0 }), version: "0.0.3",
          protocolVersion: CORVIDINHO_PROTOCOL_VERSION, startedAt: Date.now(),
          channelIds: ["chan-allowed"], owner: { discordId: "boss" },
        };
        const ix = (subcommand, options) => {
          const replies = [];
          return { id: "ix_" + subcommand, commandName: "schedule", subcommand,
            channelId: "chan-allowed", userId: "boss", options, replies,
            reply: async (o) => { replies.push(o); } };
        };
        const out = {};
        for (const cadence of ["*/0 * * * *", "0-59/0 * * * *"]) {
          const create = ix("create", { name: "spin", cadence, project: ".", prompt: "do" });
          await handleSlashInteraction(ctx, create);
          out[cadence] = create.replies;
        }
        const list = ix("list", {});
        await handleSlashInteraction(ctx, list);
        out.list = list.replies;
        out.count = ctx.scheduleStore.list().length;
        console.log(JSON.stringify(out));
      `;
      const p = Bun.spawnSync([process.execPath, "-e", script], {
        stdout: "pipe",
        stderr: "pipe",
        timeout: 10_000,
      });
      expect(p.stderr.toString()).toBe("");
      expect(p.exitCode).toBe(0);
      const out = JSON.parse(p.stdout.toString());
      for (const cadence of ["*/0 * * * *", "0-59/0 * * * *"]) {
        expect(out[cadence]).toHaveLength(1);
        expect(out[cadence][0].content).toMatch(
          /^Invalid cron step in ".*\/0": the step must be 1 or more\.$/,
        );
        expect(out[cadence][0].ephemeral).toBe(true);
      }
      expect(out.list[0].content).toContain("No schedules");
      expect(out.count).toBe(0);
    },
    30_000,
  );

  test("non-admin cannot pause", async () => {
    const store = new ScheduleStore();
    const s = store.create({
      name: "x",
      cronExpression: "0 * * * *",
      project: "p",
      prompt: "do",
      createdByUserId: "boss",
    });
    const ctx = makeCtx({ owner: { discordId: "boss" }, scheduleStore: store });
    const ix = memoryInteraction({
      commandName: "schedule",
      subcommand: "pause",
      userId: "peon",
      options: { schedule: s.id },
    });
    await handleSlashInteraction(ctx, ix);
    expect(ix.replies[0]?.content).toBe(NOT_AUTHORIZED);
    expect(store.get(s.id)?.status).toBe("active");
  });
});

/** SAFE-5 row shape for /schedule delete (src/discord/command-handlers/schedule.ts). */
const SCHEDULE_AUDIT_SURFACE = "discord:schedule";
const SCHEDULE_DELETE_AUDIT_ACTION = "schedule-delete";

type AuditRow = { action: string; actor: string; surface: string; outcome: string; args_digest: string };

function auditRows(db: Database): AuditRow[] {
  return db
    .query("SELECT action, actor, surface, outcome, args_digest FROM audit_log ORDER BY seq")
    .all() as AuditRow[];
}

function runCount(db: Database, scheduleId: string): number {
  return (
    db.query("SELECT COUNT(*) AS n FROM schedule_runs WHERE schedule_id = ?").get(scheduleId) as {
      n: number;
    }
  ).n;
}

/** DB-backed store with one schedule that has one recorded run. */
function auditFixture(over: Partial<SlashContext> = {}) {
  const db = new Database(":memory:");
  migrateCorvidinhoDb(db);
  const store = new ScheduleStore({ db });
  const s = store.create({
    name: "Nightly",
    cronExpression: "0 * * * *",
    project: ".",
    prompt: "do",
    createdByUserId: "boss",
  });
  store.claimRun(store.get(s.id)!);
  expect(runCount(db, s.id)).toBe(1);
  const ctx = makeCtx({
    owner: { discordId: "boss" },
    scheduleStore: store,
    recordAudit: (entry) => appendAudit(db, entry),
    ...over,
  });
  return { db, store, schedule: s, ctx };
}

function deleteIx(userId: string, schedule: string) {
  return memoryInteraction({
    commandName: "schedule",
    subcommand: "delete",
    userId,
    options: { schedule },
  });
}

describe("/schedule delete audit (SAFE-5)", () => {
  test("owner delete appends started then ok before the schedule and its runs are gone; digest only", async () => {
    const f = auditFixture();
    const ix = deleteIx("boss", f.schedule.id.slice(0, 10));
    await handleSlashInteraction(f.ctx, ix);

    expect(ix.replies[0]?.ephemeral).toBe(true);
    expect(ix.replies[0]?.content).toContain("Deleted **Nightly**");
    expect(ix.replies[0]?.content).toContain("Audit: #1 started · #2 ok");
    expect(f.store.list()).toHaveLength(0);
    expect(runCount(f.db, f.schedule.id)).toBe(0);

    const rows = auditRows(f.db);
    expect(rows.map((r) => [r.action, r.actor, r.surface, r.outcome])).toEqual([
      [SCHEDULE_DELETE_AUDIT_ACTION, "boss", SCHEDULE_AUDIT_SURFACE, "started"],
      [SCHEDULE_DELETE_AUDIT_ACTION, "boss", SCHEDULE_AUDIT_SURFACE, "ok"],
    ]);
    // The digest names the resolved schedule id; the row never holds it raw.
    expect(rows[0]!.args_digest).toBe(argsDigest(["delete", f.schedule.id]));
    expect(JSON.stringify(rows)).not.toContain(f.schedule.id);
    expect(verifyAudit(f.db).ok).toBe(true);
  });

  test("audit trail throws ⇒ fail closed: refusal, schedule and run history kept", async () => {
    const f = auditFixture({
      recordAudit: () => {
        throw new Error("disk full");
      },
    });
    const ix = deleteIx("boss", f.schedule.id);
    await handleSlashInteraction(f.ctx, ix);
    expect(ix.replies[0]).toEqual({
      content: "Refused: audit log unavailable (SAFE-5): disk full. Nothing changed.",
      ephemeral: true,
    });
    expect(f.store.get(f.schedule.id)).toBeDefined();
    expect(runCount(f.db, f.schedule.id)).toBe(1);
    expect(new ScheduleStore({ db: f.db }).get(f.schedule.id)).toBeDefined();
  });

  test("no audit trail wired (bridge without a DB) ⇒ same fail-closed refusal", async () => {
    const store = new ScheduleStore();
    const s = store.create({
      name: "x",
      cronExpression: "0 * * * *",
      project: "p",
      prompt: "do",
      createdByUserId: "boss",
    });
    const ctx = makeCtx({ owner: { discordId: "boss" }, scheduleStore: store });
    expect(ctx.recordAudit).toBeUndefined();
    const ix = deleteIx("boss", s.id);
    await handleSlashInteraction(ctx, ix);
    expect(ix.replies[0]?.ephemeral).toBe(true);
    expect(ix.replies[0]?.content).toContain("Refused: audit log unavailable (SAFE-5)");
    expect(ix.replies[0]?.content).toContain("Nothing changed");
    expect(store.get(s.id)).toBeDefined();
  });

  test("keyed chain and a bridge without the key ⇒ refused, nothing deleted, chain still verifies", async () => {
    const f = auditFixture();
    appendAudit(
      f.db,
      { action: "seed", actor: "local", surface: "cli", argsDigest: argsDigest([]), outcome: "ok" },
      { key: "k" },
    );
    const ix = deleteIx("boss", f.schedule.id);
    await handleSlashInteraction(f.ctx, ix);
    expect(ix.replies[0]?.content).toContain("audit log unavailable (SAFE-5)");
    expect(ix.replies[0]?.content).toContain("CORVIDINHO_AUDIT_HMAC_KEY");
    expect(f.store.get(f.schedule.id)).toBeDefined();
    expect(runCount(f.db, f.schedule.id)).toBe(1);
    expect(auditRows(f.db)).toHaveLength(1);
    expect(verifyAudit(f.db, "k").ok).toBe(true);
  });

  test("non-ADMIN delete is refused and appends denied; a refused pause appends nothing", async () => {
    const f = auditFixture();
    const ix = deleteIx("peon", f.schedule.id);
    await handleSlashInteraction(f.ctx, ix);
    expect(ix.replies[0]).toEqual({ content: NOT_AUTHORIZED, ephemeral: true });
    expect(f.store.get(f.schedule.id)).toBeDefined();
    expect(auditRows(f.db).map((r) => [r.action, r.actor, r.surface, r.outcome])).toEqual([
      [SCHEDULE_DELETE_AUDIT_ACTION, "peon", SCHEDULE_AUDIT_SURFACE, "denied"],
    ]);

    const pause = memoryInteraction({
      commandName: "schedule",
      subcommand: "pause",
      userId: "peon",
      options: { schedule: f.schedule.id },
    });
    await handleSlashInteraction(f.ctx, pause);
    expect(pause.replies[0]?.content).toBe(NOT_AUTHORIZED);
    expect(auditRows(f.db)).toHaveLength(1);
  });

  test("a delete that throws after the intent row appends error and says so", async () => {
    const f = auditFixture();
    f.store.delete = () => {
      throw new Error("database is locked");
    };
    const ix = deleteIx("boss", f.schedule.id);
    await handleSlashInteraction(f.ctx, ix);
    expect(ix.replies[0]?.content).toContain("Error: could not delete **Nightly**");
    expect(ix.replies[0]?.content).toContain("database is locked");
    expect(auditRows(f.db).map((r) => r.outcome)).toEqual(["started", "error"]);
    expect(verifyAudit(f.db).ok).toBe(true);
  });

  test("unknown schedule id is not an audited delete", async () => {
    const f = auditFixture();
    const ix = deleteIx("boss", "sched_missing");
    await handleSlashInteraction(f.ctx, ix);
    expect(ix.replies[0]?.content).toBe("Schedule not found: `sched_missing`");
    expect(auditRows(f.db)).toHaveLength(0);
    expect(f.store.get(f.schedule.id)).toBeDefined();
  });

  test("ok row lost after the delete: the delete stands and the reply says the ok row was not recorded", async () => {
    const auditDb = new Database(":memory:");
    migrateCorvidinhoDb(auditDb);
    const f = auditFixture({
      recordAudit: (entry) => {
        if (entry.outcome === "ok") throw new Error("database is locked");
        return appendAudit(auditDb, entry);
      },
    });
    const ix = deleteIx("boss", f.schedule.id);
    await handleSlashInteraction(f.ctx, ix);
    expect(ix.replies).toHaveLength(1);
    expect(ix.replies[0]?.content).toContain("Deleted **Nightly**");
    expect(ix.replies[0]?.content).toContain(
      "Audit: #1 started · ok row not recorded (see bridge log).",
    );
    expect(f.store.get(f.schedule.id)).toBeUndefined();
    expect(runCount(f.db, f.schedule.id)).toBe(0);
    expect(auditRows(auditDb).map((r) => r.outcome)).toEqual(["started"]);
  });

  test("non-ADMIN delete with the trail unavailable still gets not authorized; nothing deleted", async () => {
    const f = auditFixture({
      recordAudit: () => {
        throw new Error("disk full");
      },
    });
    const ix = deleteIx("peon", f.schedule.id);
    await handleSlashInteraction(f.ctx, ix);
    expect(ix.replies).toEqual([{ content: NOT_AUTHORIZED, ephemeral: true }]);
    expect(f.store.get(f.schedule.id)).toBeDefined();
    expect(runCount(f.db, f.schedule.id)).toBe(1);
  });
});
