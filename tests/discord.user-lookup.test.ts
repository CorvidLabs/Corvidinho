/**
 * discord-user-lookup (IDENTITY-5 / DISCORD-13) — configured guild only.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  buildDiscordUserLookupCommand,
  extractUserSnowflake,
  resolveLookupGuildId,
  USER_SNOWFLAKE_RE,
  DISCORD_USER_LOOKUP_NAME,
} from "../plugins/discord/user-lookup.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry, list } from "../src/plugins/registry.ts";
import { runPlugin } from "../src/plugins/run.ts";

describe("extractUserSnowflake", () => {
  test("accepts bare snowflake and mention forms", () => {
    expect(extractUserSnowflake("304028152194138114")).toBe("304028152194138114");
    expect(extractUserSnowflake("<@304028152194138114>")).toBe("304028152194138114");
    expect(extractUserSnowflake("<@!304028152194138114>")).toBe("304028152194138114");
    expect(extractUserSnowflake("bug 304028152194138114 / Gaspar")).toBe(
      "304028152194138114",
    );
    expect(USER_SNOWFLAKE_RE.test("123")).toBe(false);
    expect(extractUserSnowflake("Gaspar")).toBeNull();
  });
});

describe("resolveLookupGuildId", () => {
  test("requires configured guild; refuses other guilds", () => {
    expect(resolveLookupGuildId(undefined, {}).ok).toBe(false);
    const ok = resolveLookupGuildId(undefined, { DISCORD_GUILD_ID: "111" });
    expect(ok).toEqual({ ok: true, guildId: "111" });
    const bad = resolveLookupGuildId("222", { DISCORD_GUILD_ID: "111" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain("not the configured");
    const same = resolveLookupGuildId("111", { DISCORD_GUILD_ID: "111" });
    expect(same).toEqual({ ok: true, guildId: "111" });
  });
});

describe("discord-user-lookup plugin", () => {
  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    clearRegistry();
    loadBuiltins();
    for (const k of [
      "DISCORD_GUILD_ID",
      "DISCORD_TOKEN",
      "DISCORD_BOT_TOKEN",
      "CORVIDINHO_DISCORD_DRY_RUN",
    ]) {
      prev[k] = process.env[k];
    }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    clearRegistry();
    loadBuiltins();
  });

  test("listed as non-dangerous read tool", () => {
    const entry = list().find((e) => e.name === DISCORD_USER_LOOKUP_NAME);
    expect(entry).toBeDefined();
    expect(entry!.dangerous).toBe(false);
    expect(entry!.mutating).toBe(false);
  });

  test("refuses when DISCORD_GUILD_ID unset", async () => {
    delete process.env.DISCORD_GUILD_ID;
    process.env.CORVIDINHO_DISCORD_DRY_RUN = "1";
    const r = await runPlugin({
      name: DISCORD_USER_LOOKUP_NAME,
      args: ["--user-id", "304028152194138114"],
      nonInteractive: true,
      allowlist: [],
    });
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(3);
    expect(r.error?.toLowerCase()).toContain("guild");
  });

  test("refuses a non-configured --guild", async () => {
    process.env.DISCORD_GUILD_ID = "111";
    process.env.CORVIDINHO_DISCORD_DRY_RUN = "1";
    const r = await runPlugin({
      name: DISCORD_USER_LOOKUP_NAME,
      args: ["--user-id", "304028152194138114", "--guild", "999"],
      nonInteractive: true,
      allowlist: [],
    });
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(3);
    expect(r.error).toContain("not the configured");
  });

  test("dry-run lookup by user id", async () => {
    process.env.DISCORD_GUILD_ID = "111";
    process.env.DISCORD_TOKEN = "fake";
    process.env.CORVIDINHO_DISCORD_DRY_RUN = "1";
    const r = await runPlugin({
      name: DISCORD_USER_LOOKUP_NAME,
      args: ["--user-id", "304028152194138114"],
      nonInteractive: true,
      allowlist: [],
    });
    expect(r.ok).toBe(true);
    expect((r.data as { dryRun?: boolean })?.dryRun).toBe(true);
    expect((r.data as { userId?: string })?.userId).toBe("304028152194138114");
  });

  test("dry-run lookup by query name", async () => {
    process.env.DISCORD_GUILD_ID = "111";
    process.env.CORVIDINHO_DISCORD_DRY_RUN = "1";
    const r = await runPlugin({
      name: DISCORD_USER_LOOKUP_NAME,
      args: ["--query", "Gaspar"],
      nonInteractive: true,
      allowlist: [],
    });
    expect(r.ok).toBe(true);
    expect((r.data as { dryRun?: boolean })?.dryRun).toBe(true);
  });

  test("mocked REST returns member display name", async () => {
    const cmd = buildDiscordUserLookupCommand({
      env: {
        DISCORD_GUILD_ID: "111",
        DISCORD_TOKEN: "fake",
      },
      fetchImpl: async (url) => {
        expect(String(url)).toContain("/guilds/111/members/304028152194138114");
        return new Response(
          JSON.stringify({
            nick: "Gaspar",
            user: {
              id: "304028152194138114",
              username: "gaspar",
              global_name: "Gaspar CS",
              bot: false,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });
    const r = await cmd.handler({
      args: ["--user-id", "304028152194138114"],
      cwd: process.cwd(),
      json: true,
      nonInteractive: true,
      allowlist: new Set(),
    });
    expect(r.ok).toBe(true);
    expect(r.message).toContain("Gaspar");
    expect((r.data as { id?: string })?.id).toBe("304028152194138114");
    expect((r.data as { displayName?: string })?.displayName).toBe("Gaspar");
  });

  test("mocked 404 is a clean not-a-member error", async () => {
    const cmd = buildDiscordUserLookupCommand({
      env: { DISCORD_GUILD_ID: "111", DISCORD_TOKEN: "fake" },
      fetchImpl: async () => new Response("missing", { status: 404 }),
    });
    const r = await cmd.handler({
      args: ["--user-id", "304028152194138114"],
      cwd: process.cwd(),
      json: true,
      nonInteractive: true,
      allowlist: new Set(),
    });
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(4);
    expect(r.error?.toLowerCase()).toContain("not a member");
  });
});
