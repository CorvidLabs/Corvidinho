/**
 * REQ-discord-016 — guild PUT overwrite + clear globals (fixture; no live token).
 */
import { describe, expect, test } from "bun:test";
import {
  applicationCommandsRoute,
  applicationGuildCommandsRoute,
  registerSlashCommandSet,
  type PutCommandsFn,
} from "../src/discord/register-commands.ts";
import {
  buildSlashCommandBodies,
  SLASH_COMMAND_NAMES,
} from "../src/discord/slash-commands.ts";

describe("registerSlashCommandSet (DISCORD-4 / REQ-discord-016)", () => {
  test("guild id → PUT guild bodies then clear globals []", async () => {
    const calls: Array<{ route: string; body: unknown[] }> = [];
    const put: PutCommandsFn = async (route, body) => {
      calls.push({ route, body: [...body] });
      return body;
    };
    const bodies = buildSlashCommandBodies();
    const result = await registerSlashCommandSet({
      applicationId: "app-1",
      guildId: "guild-9",
      bodies,
      put,
    });

    expect(result.scope).toBe("guild");
    expect(result.guildId).toBe("guild-9");
    expect(result.registeredCount).toBe(9);
    expect(result.clearedGlobals).toBe(true);
    expect(result.warnNoGuildId).toBeUndefined();
    expect(calls).toHaveLength(2);
    expect(calls[0]?.route).toBe(
      applicationGuildCommandsRoute("app-1", "guild-9"),
    );
    expect(calls[0]?.body.map((b) => (b as { name: string }).name)).toEqual([
      ...SLASH_COMMAND_NAMES,
    ]);
    expect(calls[1]?.route).toBe(applicationCommandsRoute("app-1"));
    expect(calls[1]?.body).toEqual([]);
  });

  test("no guild id → PUT globals only; warn; do not clear guild", async () => {
    const calls: Array<{ route: string; body: unknown[] }> = [];
    const put: PutCommandsFn = async (route, body) => {
      calls.push({ route, body: [...body] });
      return body;
    };
    const result = await registerSlashCommandSet({
      applicationId: "app-1",
      put,
    });

    expect(result.scope).toBe("global");
    expect(result.clearedGlobals).toBe(false);
    expect(result.warnNoGuildId).toContain("DISCORD_GUILD_ID");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.route).toBe(applicationCommandsRoute("app-1"));
    expect(calls[0]?.body).toHaveLength(9);
  });

  test("bodies include DISCORD-4 plus /schedule, /announce and /admin", () => {
    const names = buildSlashCommandBodies().map((b) => b.name);
    expect(names).toEqual([...SLASH_COMMAND_NAMES]);
  });
});
