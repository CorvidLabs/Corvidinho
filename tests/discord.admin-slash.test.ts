/**
 * ADMIN-1..4 — /admin users add | channels add|remove | config show
 * (issue #43). Fixture tests only: temp allowlist files, in-memory SQLite,
 * no live Discord token or network.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAllowlist } from "../src/allowlist/load.ts";
import { emptyConfig, type AllowlistConfig } from "../src/allowlist/types.ts";
import { appendAudit, verifyAudit } from "../src/audit/index.ts";
import { loadOwnerConfig, type OwnerRecord } from "../src/identity/owner.ts";
import {
  planAdminListChange,
  resolveAdminAllowlistPath,
  setJsonDiscordList,
  setTomlDiscordList,
  writeFileAtomic,
} from "../src/discord/admin-allowlist.ts";
import { createEchoAgentClient } from "../src/discord/agent-client.ts";
import {
  ADMIN_AUDIT_SURFACE,
  handleAdminCommand,
} from "../src/discord/command-handlers/admin.ts";
import { flattenSlashOptions } from "../src/discord/gateway.ts";
import { CORVIDINHO_PROTOCOL_VERSION } from "../src/discord/protocol-version.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import {
  buildSlashCommandBodies,
  OPT_CHANNEL,
  OPT_SUB_COMMAND,
  OPT_SUB_COMMAND_GROUP,
  OPT_USER,
  SLASH_COMMAND_NAMES,
} from "../src/discord/slash-commands.ts";
import { handleSlashInteraction } from "../src/discord/slash-dispatch.ts";
import type {
  SlashContext,
  SlashInteraction,
  SlashReplyPayload,
} from "../src/discord/slash-types.ts";
import {
  ALLOWLIST_DENY_TIP,
  EPHEMERAL_SILENT_ACK,
  NOT_AUTHORIZED,
} from "../src/discord/types.ts";
import { WorkStore } from "../src/discord/work-store.ts";
import { migrateCorvidinhoDb } from "../src/store/db.ts";

const OWNER_ID = "100000000000000001";
const OTHER_ID = "200000000000000002";
const CHAN_A = "300000000000000003";
const CHAN_B = "400000000000000004";
const CHAN_ENV = "500000000000000005";
const OWNER: OwnerRecord = { discordId: OWNER_ID, display: "Leif" };

const SAMPLE_TOML = `# Corvidinho allowlist — operator notes stay
[github]
orgs = ["corvidlabs"]
repos = []

[discord]
# channels we listen in
channels = ["${CHAN_A}"]  # dogfood
roles = []
users = []
deny_users = []

# durable owner
[owner]
discord_id = "${OWNER_ID}"
display = "Leif # the owner"
`;

const tmpDirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "corvidinho-admin-"));
  tmpDirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

type Fixture = {
  dir: string;
  path: string;
  ctx: SlashContext;
  db: Database;
};

async function fixture(opts: {
  text?: string | null;
  fileName?: string;
  env?: NodeJS.ProcessEnv;
  owner?: OwnerRecord | null;
  recordAudit?: SlashContext["recordAudit"];
} = {}): Promise<Fixture> {
  const dir = tmp();
  const path = join(dir, opts.fileName ?? "allowlist.toml");
  if (opts.text !== null) writeFileSync(path, opts.text ?? SAMPLE_TOML);
  const env: NodeJS.ProcessEnv = {
    HOME: dir,
    CORVIDINHO_ALLOWLIST_FILE: path,
    ...(opts.env ?? {}),
  };
  // Load exactly as the bridge does: file ∪ env, then DISCORD_CHANNEL_IDS.
  const loaded = await loadAllowlist({ env, home: dir });
  const channelIds = [
    ...new Set([
      ...loaded.discord.channels,
      ...(env.DISCORD_CHANNEL_IDS ?? "").split(/[,\s]+/).filter(Boolean),
    ]),
  ];
  const allowlist: AllowlistConfig = {
    ...loaded,
    discord: { ...loaded.discord, channels: channelIds },
  };
  const db = new Database(":memory:");
  migrateCorvidinhoDb(db);
  const ctx: SlashContext = {
    store: new SessionStore(),
    workStore: new WorkStore(),
    allowlist,
    agent: createEchoAgentClient({ delayMs: 0 }),
    version: "0.0.9",
    protocolVersion: CORVIDINHO_PROTOCOL_VERSION,
    startedAt: Date.now(),
    channelIds,
    owner: opts.owner === undefined ? OWNER : opts.owner,
    mutedUsers: new Set(),
    env,
    recordAudit:
      opts.recordAudit === undefined
        ? (entry) => appendAudit(db, entry)
        : opts.recordAudit,
  };
  return { dir, path, ctx, db };
}

function ix(
  over: Partial<SlashInteraction> & { subcommandGroup: string; subcommand: string },
): SlashInteraction & { replies: SlashReplyPayload[] } {
  const replies: SlashReplyPayload[] = [];
  return {
    id: "ix_admin",
    commandName: "admin",
    channelId: CHAN_A,
    userId: OWNER_ID,
    options: {},
    ...over,
    replies,
    reply: async (opts) => {
      replies.push(opts);
    },
  };
}

function auditRows(db: Database): Array<{ action: string; actor: string; surface: string; outcome: string; args_digest: string }> {
  return db
    .query("SELECT action, actor, surface, outcome, args_digest FROM audit_log ORDER BY seq")
    .all() as Array<{ action: string; actor: string; surface: string; outcome: string; args_digest: string }>;
}

describe("/admin command body (ADMIN-1..3)", () => {
  test("nine commands; admin groups users add, channels add|remove, config show", () => {
    expect(SLASH_COMMAND_NAMES).toContain("admin");
    expect(SLASH_COMMAND_NAMES.length).toBe(9);
    const admin = buildSlashCommandBodies().find((b) => b.name === "admin");
    const groups = admin?.options ?? [];
    expect(groups.map((g) => [g.type, g.name])).toEqual([
      [OPT_SUB_COMMAND_GROUP, "users"],
      [OPT_SUB_COMMAND_GROUP, "channels"],
      [OPT_SUB_COMMAND_GROUP, "config"],
    ]);
    const subs = (name: string) =>
      groups.find((g) => g.name === name)?.options?.map((o) => {
        expect(o.type).toBe(OPT_SUB_COMMAND);
        return o.name;
      });
    expect(subs("users")).toEqual(["add"]);
    expect(subs("channels")).toEqual(["add", "remove"]);
    expect(subs("config")).toEqual(["show"]);
    const userOpt = groups[0]?.options?.[0]?.options?.[0];
    expect(userOpt).toMatchObject({ type: OPT_USER, name: "user", required: true });
    const chanAdd = groups[1]?.options?.[0]?.options?.[0];
    expect(chanAdd).toMatchObject({ type: OPT_CHANNEL, name: "channel", required: true, channel_types: [0] });
  });

  test("flattenSlashOptions handles groups, subcommands and top-level options", () => {
    expect(
      flattenSlashOptions([
        { name: "users", type: 2, options: [{ name: "add", type: 1, options: [{ name: "user", type: 6, value: OTHER_ID }] }] },
      ]),
    ).toEqual({ subcommandGroup: "users", subcommand: "add", options: { user: OTHER_ID } });
    expect(
      flattenSlashOptions([{ name: "config", type: 2, options: [{ name: "show", type: 1 }] }]),
    ).toEqual({ subcommandGroup: "config", subcommand: "show", options: {} });
    expect(
      flattenSlashOptions([{ name: "start", type: 1, options: [{ name: "topic", value: "x" }] }]),
    ).toEqual({ subcommandGroup: undefined, subcommand: "start", options: { topic: "x" } });
    expect(flattenSlashOptions([{ name: "description", type: 3, value: "go" }])).toEqual({
      subcommandGroup: undefined,
      subcommand: undefined,
      options: { description: "go" },
    });
  });
});

describe("/admin permission (ADMIN-4 / IDENTITY-2)", () => {
  test("non-owner refused at dispatch; file untouched", async () => {
    const f = await fixture();
    const i = ix({ subcommandGroup: "users", subcommand: "add", userId: OTHER_ID, options: { user: OTHER_ID } });
    const r = await handleSlashInteraction(f.ctx, i);
    expect(r).toMatchObject({ ok: false, reason: "insufficient_permission" });
    expect(i.replies[0]).toEqual({ content: NOT_AUTHORIZED, ephemeral: true });
    expect(readFileSync(f.path, "utf8")).toBe(SAMPLE_TOML);
  });

  test("no owner ⇒ nobody is ADMIN, not even the would-be owner", async () => {
    const f = await fixture({ owner: null });
    const i = ix({ subcommandGroup: "config", subcommand: "show" });
    const r = await handleSlashInteraction(f.ctx, i);
    expect(r).toMatchObject({ ok: false, reason: "insufficient_permission" });
    expect(i.replies[0]?.content).toBe(NOT_AUTHORIZED);
  });

  test("handler re-checks ADMIN itself (registration/dispatch alone never enough)", async () => {
    const f = await fixture();
    const i = ix({ subcommandGroup: "channels", subcommand: "add", userId: OTHER_ID, options: { channel: CHAN_B } });
    await handleAdminCommand(f.ctx, i);
    expect(i.replies[0]).toEqual({ content: NOT_AUTHORIZED, ephemeral: true });
    expect(readFileSync(f.path, "utf8")).toBe(SAMPLE_TOML);
    expect(auditRows(f.db).map((r) => [r.action, r.actor, r.outcome])).toEqual([
      ["admin-channels-add", OTHER_ID, "denied"],
    ]);
  });

  test("muted or deny-listed owner is refused at handler time", async () => {
    const f = await fixture();
    f.ctx.mutedUsers = new Set([OWNER_ID]);
    const i = ix({ subcommandGroup: "users", subcommand: "add", options: { user: OTHER_ID } });
    await handleAdminCommand(f.ctx, i);
    expect(i.replies[0]?.content).toBe(NOT_AUTHORIZED);

    const g = await fixture();
    g.ctx.allowlist.discord.denyUsers.push(OWNER_ID);
    const j = ix({ subcommandGroup: "config", subcommand: "show" });
    await handleAdminCommand(g.ctx, j);
    expect(j.replies[0]?.content).toBe(NOT_AUTHORIZED);
  });

  test("outside an allowlisted channel the owner gets the tip, which names /admin", async () => {
    const f = await fixture();
    const i = ix({ subcommandGroup: "config", subcommand: "show", channelId: CHAN_B });
    await handleSlashInteraction(f.ctx, i);
    expect(i.replies[0]).toEqual({ content: ALLOWLIST_DENY_TIP, ephemeral: true });
    expect(ALLOWLIST_DENY_TIP).toContain("/admin channels add");
  });
});

describe("/admin users add (ADMIN-1)", () => {
  test("approves a user into the file + live list; keeps other sections/comments; warns on first entry; audits", async () => {
    const f = await fixture();
    const liveUsers = f.ctx.allowlist.discord.users;
    const i = ix({ subcommandGroup: "users", subcommand: "add", options: { user: OTHER_ID } });
    const r = await handleSlashInteraction(f.ctx, i);
    expect(r).toEqual({ ok: true, handled: true });

    const text = readFileSync(f.path, "utf8");
    expect(text).toBe(SAMPLE_TOML.replace("users = []", `users = ["${OTHER_ID}"]`));
    // Live list mutated in place (router/scheduler hold the same array).
    expect(f.ctx.allowlist.discord.users).toBe(liveUsers);
    expect(liveUsers).toEqual([OTHER_ID]);

    const reply = i.replies[0]!;
    expect(reply.ephemeral).toBe(true);
    expect(reply.content).toContain(`approved <@${OTHER_ID}>`);
    expect(reply.content).toContain("users 0 → 1");
    expect(reply.content).toContain("Live users (file ∪ env): 0 → 1");
    expect(reply.content).toContain("First user allowlist entry");
    expect(reply.content).toContain("BLOCKED");
    expect(reply.content).toContain("Audit: #1 started · #2 ok");

    const rows = auditRows(f.db);
    expect(rows.map((x) => [x.action, x.actor, x.surface, x.outcome])).toEqual([
      ["admin-users-add", OWNER_ID, ADMIN_AUDIT_SURFACE, "started"],
      ["admin-users-add", OWNER_ID, ADMIN_AUDIT_SURFACE, "ok"],
    ]);
    // Digest only — never the raw id.
    expect(JSON.stringify(rows)).not.toContain(OTHER_ID);
    expect(verifyAudit(f.db).ok).toBe(true);

    // Restart-equivalent: reload gives the same list; [owner] still loads.
    const reloaded = await loadAllowlist({ env: f.ctx.env, home: f.dir });
    expect(reloaded.discord.users).toEqual([OTHER_ID]);
    expect(reloaded.github.orgs).toEqual(["corvidlabs"]);
    const owner = await loadOwnerConfig({ env: {}, filePath: f.path });
    expect(owner.owner).toEqual({ discordId: OWNER_ID, display: "Leif # the owner" });
  });

  test("second add is a no-op; no first-user warning when roles already gate", async () => {
    const f = await fixture();
    await handleAdminCommand(f.ctx, ix({ subcommandGroup: "users", subcommand: "add", options: { user: OTHER_ID } }));
    const before = readFileSync(f.path, "utf8");
    const again = ix({ subcommandGroup: "users", subcommand: "add", options: { user: OTHER_ID } });
    await handleAdminCommand(f.ctx, again);
    expect(again.replies[0]?.content).toContain("No change");
    expect(readFileSync(f.path, "utf8")).toBe(before);
    expect(auditRows(f.db)).toHaveLength(2);

    const g = await fixture();
    g.ctx.allowlist.discord.roles.push("600000000000000006");
    const k = ix({ subcommandGroup: "users", subcommand: "add", options: { user: OTHER_ID } });
    await handleAdminCommand(g.ctx, k);
    expect(k.replies[0]?.content).not.toContain("First user allowlist entry");
  });

  test("deny-listed user is refused (deny wins); invalid id gets usage", async () => {
    const f = await fixture();
    f.ctx.allowlist.discord.denyUsers.push(OTHER_ID);
    const i = ix({ subcommandGroup: "users", subcommand: "add", options: { user: OTHER_ID } });
    await handleAdminCommand(f.ctx, i);
    expect(i.replies[0]?.content).toContain("deny always wins");
    expect(readFileSync(f.path, "utf8")).toBe(SAMPLE_TOML);
    expect(auditRows(f.db).map((r) => r.outcome)).toEqual(["denied"]);

    const bad = ix({ subcommandGroup: "users", subcommand: "add", options: { user: '1"]\n[owner]' } });
    await handleAdminCommand(f.ctx, bad);
    expect(bad.replies[0]?.content).toBe("usage: /admin users add user:@someone");
    expect(readFileSync(f.path, "utf8")).toBe(SAMPLE_TOML);
  });

  test("user already allowed via env: added to the file, env noted", async () => {
    const f = await fixture({ env: { CORVIDINHO_DISCORD_ALLOW_USERS: OTHER_ID } });
    expect(f.ctx.allowlist.discord.users).toEqual([OTHER_ID]);
    const i = ix({ subcommandGroup: "users", subcommand: "add", options: { user: OTHER_ID } });
    await handleAdminCommand(f.ctx, i);
    expect(readFileSync(f.path, "utf8")).toContain(`users = ["${OTHER_ID}"]`);
    expect(i.replies[0]?.content).toContain("already allowed via env (CORVIDINHO_DISCORD_ALLOW_USERS)");
    expect(f.ctx.allowlist.discord.users).toEqual([OTHER_ID]);
  });

  test("audit trail unavailable ⇒ fail closed, nothing written", async () => {
    const f = await fixture({
      recordAudit: () => {
        throw new Error("disk full");
      },
    });
    const i = ix({ subcommandGroup: "users", subcommand: "add", options: { user: OTHER_ID } });
    await handleAdminCommand(f.ctx, i);
    expect(i.replies[0]?.content).toContain("audit log unavailable (SAFE-5)");
    expect(readFileSync(f.path, "utf8")).toBe(SAMPLE_TOML);
    expect(f.ctx.allowlist.discord.users).toEqual([]);
  });
});

describe("/admin channels add|remove (ADMIN-2)", () => {
  test("add is live without restart: the new channel passes the slash gate", async () => {
    const f = await fixture();
    const liveChannels = f.ctx.allowlist.discord.channels;
    const before = ix({ subcommandGroup: "config", subcommand: "show", channelId: CHAN_B, userId: OTHER_ID });
    await handleSlashInteraction(f.ctx, before);
    expect(before.replies[0]?.content).toBe(EPHEMERAL_SILENT_ACK);

    const i = ix({ subcommandGroup: "channels", subcommand: "add", options: { channel: CHAN_B } });
    await handleSlashInteraction(f.ctx, i);
    expect(i.replies[0]?.content).toContain(`added <#${CHAN_B}> to [discord].channels`);
    expect(i.replies[0]?.content).toContain("channels 1 → 2");
    expect(readFileSync(f.path, "utf8")).toContain(
      `channels = ["${CHAN_A}", "${CHAN_B}"]  # dogfood`,
    );
    expect(f.ctx.allowlist.discord.channels).toBe(liveChannels);
    expect(f.ctx.channelIds).toEqual([CHAN_A, CHAN_B]);

    const status = ix({ subcommandGroup: "config", subcommand: "show", channelId: CHAN_B });
    const r = await handleSlashInteraction(f.ctx, status);
    expect(r).toEqual({ ok: true, handled: true });
  });

  test("deny-listed channel is refused", async () => {
    const f = await fixture();
    f.ctx.allowlist.discord.denyChannels.push(CHAN_B);
    const i = ix({ subcommandGroup: "channels", subcommand: "add", options: { channel: CHAN_B } });
    await handleAdminCommand(f.ctx, i);
    expect(i.replies[0]?.content).toContain("deny_channels");
    expect(readFileSync(f.path, "utf8")).toBe(SAMPLE_TOML);
  });

  test("remove drops the channel live; running it in that channel warns", async () => {
    const f = await fixture();
    await handleAdminCommand(f.ctx, ix({ subcommandGroup: "channels", subcommand: "add", options: { channel: CHAN_B } }));
    const i = ix({ subcommandGroup: "channels", subcommand: "remove", channelId: CHAN_B, options: { channel: CHAN_B } });
    await handleAdminCommand(f.ctx, i);
    expect(i.replies[0]?.content).toContain(`removed <#${CHAN_B}>`);
    expect(i.replies[0]?.content).toContain("You ran this in that channel");
    expect(f.ctx.channelIds).toEqual([CHAN_A]);
    expect(readFileSync(f.path, "utf8")).toBe(SAMPLE_TOML);

    const after = ix({ subcommandGroup: "config", subcommand: "show", channelId: CHAN_B });
    await handleSlashInteraction(f.ctx, after);
    expect(after.replies[0]?.content).toBe(ALLOWLIST_DENY_TIP);
  });

  test("removing the last live channel is refused (empty stays deny-all, bridge must still start)", async () => {
    const f = await fixture();
    const i = ix({ subcommandGroup: "channels", subcommand: "remove", options: { channel: CHAN_A } });
    await handleAdminCommand(f.ctx, i);
    expect(i.replies[0]?.content).toContain("would leave no allowlisted channel");
    expect(readFileSync(f.path, "utf8")).toBe(SAMPLE_TOML);
    expect(f.ctx.channelIds).toEqual([CHAN_A]);
    expect(auditRows(f.db).map((r) => r.outcome)).toEqual(["denied"]);
  });

  test("env-sourced channel cannot be removed at runtime; file+env removes from file only", async () => {
    const f = await fixture({ env: { DISCORD_CHANNEL_IDS: CHAN_ENV } });
    expect(f.ctx.channelIds).toEqual([CHAN_A, CHAN_ENV]);
    const envOnly = ix({ subcommandGroup: "channels", subcommand: "remove", options: { channel: CHAN_ENV } });
    await handleAdminCommand(f.ctx, envOnly);
    expect(envOnly.replies[0]?.content).toContain("env values cannot be changed at runtime");
    expect(f.ctx.channelIds).toEqual([CHAN_A, CHAN_ENV]);

    const g = await fixture({ env: { CORVIDINHO_DISCORD_ALLOW_CHANNELS: CHAN_A } });
    const both = ix({ subcommandGroup: "channels", subcommand: "remove", options: { channel: CHAN_A } });
    await handleAdminCommand(g.ctx, both);
    expect(readFileSync(g.path, "utf8")).toContain("channels = []  # dogfood");
    expect(both.replies[0]?.content).toContain("still allowed via env");
    expect(g.ctx.channelIds).toEqual([CHAN_A]);
  });

  test("remove of an unknown channel is a no-op", async () => {
    const f = await fixture();
    const i = ix({ subcommandGroup: "channels", subcommand: "remove", options: { channel: CHAN_B } });
    await handleAdminCommand(f.ctx, i);
    expect(i.replies[0]?.content).toContain("No change");
    expect(auditRows(f.db)).toHaveLength(0);
  });
});

describe("/admin config show (ADMIN-3)", () => {
  test("ephemeral view: counts by source, owner without id, updatable knobs, no secrets", async () => {
    const token = "Bot.fake-token-value-not-real";
    const f = await fixture({
      env: {
        DISCORD_CHANNEL_IDS: CHAN_ENV,
        DISCORD_TOKEN: token,
        CORVIDINHO_AUDIT_HMAC_KEY: "hmac-secret-value",
      },
    });
    f.ctx.auditLine = () => "Audit: 0 entries";
    const i = ix({ subcommandGroup: "config", subcommand: "show" });
    await handleSlashInteraction(f.ctx, i);
    const out = i.replies[0]!;
    expect(out.ephemeral).toBe(true);
    const c = out.content ?? "";
    expect(c).toContain(`Allowlist file: \`${f.path}\` (toml)`);
    expect(c).toContain("channels: live 2 (file 1 · env 1)");
    expect(c).toContain("users: live 0 (file 0 · env 0)");
    expect(c).toContain("Owner configured: yes (Leif)");
    expect(c).not.toContain(OWNER_ID);
    expect(c).toContain("Updatable here: [discord].users");
    expect(c).toContain("Read-only at runtime: env values");
    expect(c).toContain("Audit: 0 entries");
    expect(c).not.toContain(token);
    expect(c).not.toContain("hmac-secret-value");
  });

  test("unknown /admin route replies ephemerally", async () => {
    const f = await fixture();
    const i = ix({ subcommandGroup: "roles", subcommand: "add" });
    await handleAdminCommand(f.ctx, i);
    expect(i.replies[0]).toEqual({ content: "Unknown /admin subcommand: roles add", ephemeral: true });
  });
});

describe("allowlist file writer", () => {
  test("missing file at CORVIDINHO_ALLOWLIST_FILE is created 0600 with only [discord]", async () => {
    const f = await fixture({ text: null });
    expect(existsSync(f.path)).toBe(false);
    f.ctx.allowlist.discord.channels.push(CHAN_A); // env-style live channel
    const i = ix({ subcommandGroup: "users", subcommand: "add", options: { user: OTHER_ID } });
    await handleAdminCommand(f.ctx, i);
    expect(i.replies[0]?.content).toContain("(created)");
    const text = readFileSync(f.path, "utf8");
    expect(text).toContain(`[discord]\nusers = ["${OTHER_ID}"]\n`);
    expect(statSync(f.path).mode & 0o777).toBe(0o600);
  });

  test("path resolution: loaded file, else env file, else default toml", () => {
    const cfg = emptyConfig();
    expect(resolveAdminAllowlistPath(cfg, {}, "/h")).toBe("/h/.config/corvidinho/allowlist.toml");
    expect(resolveAdminAllowlistPath(cfg, { CORVIDINHO_ALLOWLIST_FILE: "/x/a.json" }, "/h")).toBe("/x/a.json");
    cfg.sourcePath = "/loaded.toml";
    expect(resolveAdminAllowlistPath(cfg, { CORVIDINHO_ALLOWLIST_FILE: "/x/a.json" }, "/h")).toBe("/loaded.toml");
  });

  test("atomic write keeps mode, leaves no temp files, and follows symlinks", () => {
    const dir = tmp();
    const real = join(dir, "real.toml");
    writeFileSync(real, "[discord]\nusers = []\n");
    chmodSync(real, 0o640);
    const link = join(dir, "allowlist.toml");
    symlinkSync(real, link);
    writeFileAtomic(link, "[discord]\nusers = [\"1\"]\n");
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readFileSync(real, "utf8")).toBe("[discord]\nusers = [\"1\"]\n");
    expect(statSync(real).mode & 0o777).toBe(0o640);
    expect(readdirSync(dir).sort()).toEqual(["allowlist.toml", "real.toml"]);
  });

  test("TOML: multi-line array collapses, missing key/section added, CRLF kept", () => {
    const multi = "[discord]\nchannels = [\n  \"1\",\n  \"2\",\n]\nroles = []\n";
    expect(setTomlDiscordList(multi, "channels", ["1", "2", "3"])).toBe(
      '[discord]\nchannels = ["1", "2", "3"]\nroles = []\n',
    );
    expect(setTomlDiscordList("[discord]\nroles = []\n\n[owner]\ndiscord_id = \"9\"\n", "users", ["5"])).toBe(
      '[discord]\nroles = []\nusers = ["5"]\n\n[owner]\ndiscord_id = "9"\n',
    );
    expect(setTomlDiscordList("[github]\norgs = []\n", "users", ["5"])).toBe(
      '[github]\norgs = []\n\n[discord]\nusers = ["5"]\n',
    );
    expect(setTomlDiscordList("[discord]\r\nusers = []\r\n", "users", ["5"])).toBe(
      '[discord]\r\nusers = ["5"]\r\n',
    );
    // A same-named key in another section is left alone.
    expect(setTomlDiscordList("[github]\nusers = [\"octo\"]\n[discord]\nusers = []\n", "users", ["5"])).toBe(
      '[github]\nusers = ["octo"]\n[discord]\nusers = ["5"]\n',
    );
  });

  test("JSON: keeps owner and other keys; refuses lossy numeric ids and bad JSON", async () => {
    const json = JSON.stringify({ owner: { discord_id: OWNER_ID }, discord: { Channels: [CHAN_A], roles: [] } });
    const out = JSON.parse(setJsonDiscordList(json, "channels", [CHAN_A, CHAN_B]));
    expect(out).toEqual({ owner: { discord_id: OWNER_ID }, discord: { Channels: [CHAN_A, CHAN_B], roles: [] } });

    const f = await fixture({ fileName: "allowlist.json", text: json });
    const i = ix({ subcommandGroup: "users", subcommand: "add", options: { user: OTHER_ID } });
    await handleAdminCommand(f.ctx, i);
    expect(JSON.parse(readFileSync(f.path, "utf8"))).toEqual({
      owner: { discord_id: OWNER_ID },
      discord: { Channels: [CHAN_A], roles: [], users: [OTHER_ID] },
    });

    const lossy = '{"owner":{"discord_id":100000000000000001},"discord":{"channels":["1"]}}';
    const g = await fixture({ fileName: "allowlist.json", text: lossy });
    g.ctx.allowlist.discord.channels.push(CHAN_A);
    const j = ix({ subcommandGroup: "users", subcommand: "add", options: { user: OTHER_ID } });
    await handleAdminCommand(g.ctx, j);
    expect(j.replies[0]?.content).toContain("lose precision");
    expect(readFileSync(g.path, "utf8")).toBe(lossy);

    const h = await fixture({ fileName: "allowlist.json", text: "{ not json" });
    h.ctx.allowlist.discord.channels.push(CHAN_A);
    const k = ix({ subcommandGroup: "users", subcommand: "add", options: { user: OTHER_ID } });
    await handleAdminCommand(h.ctx, k);
    expect(k.replies[0]?.content).toContain("could not be parsed");
    expect(readFileSync(h.path, "utf8")).toBe("{ not json");
  });

  test("plan never writes the env overlay into the file", async () => {
    const f = await fixture({ env: { CORVIDINHO_DISCORD_ALLOW_CHANNELS: CHAN_ENV } });
    const p = planAdminListChange({
      allowlist: f.ctx.allowlist,
      env: f.ctx.env,
      key: "channels",
      op: "add",
      id: CHAN_B,
    });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.plan.fileAfter).toEqual([CHAN_A, CHAN_B]);
    expect(p.plan.liveAfter).toEqual([CHAN_A, CHAN_B, CHAN_ENV]);
    expect(p.plan.newText).not.toContain(CHAN_ENV);
  });
});
