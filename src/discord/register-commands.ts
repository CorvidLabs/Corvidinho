/**
 * Discord slash registration (DISCORD-4 / REQ-discord-016).
 * Guild PUT overwrite of the current body set (nine incl. /admin) + clear globals.
 * Steal PUT+clear-globals only — do NOT port archive buildCommands() lists.
 */

import {
  buildSlashCommandBodies,
  type SlashCommandBody,
} from "./slash-commands.ts";

/** Injectable PUT used by fixture tests (no live Discord token). */
export type PutCommandsFn = (
  route: string,
  body: readonly SlashCommandBody[] | readonly unknown[],
) => Promise<unknown>;

export type RegisterSlashCommandSetOpts = {
  applicationId: string;
  /** Prefer guild scope for dogfood speed (instant). */
  guildId?: string;
  bodies?: SlashCommandBody[];
  put: PutCommandsFn;
};

export type RegisterSlashCommandSetResult = {
  scope: "guild" | "global";
  guildId?: string;
  registeredCount: number;
  /** True when globals were PUT to []. */
  clearedGlobals: boolean;
  /** Set when no guildId — stale guild commands are not cleared. */
  warnNoGuildId?: string;
  /** Routes used (for fixtures / logging). */
  puts: Array<{ route: string; bodyLength: number }>;
};

/** Route builders matching discord.js Routes (string form for injectable put). */
export function applicationGuildCommandsRoute(
  applicationId: string,
  guildId: string,
): string {
  return `/applications/${applicationId}/guilds/${guildId}/commands`;
}

export function applicationCommandsRoute(applicationId: string): string {
  return `/applications/${applicationId}/commands`;
}

/**
 * Full-overwrite registration:
 * - With guildId: PUT guild bodies (current set), then PUT globals [].
 * - Without guildId: PUT globals to bodies; warn that stale guild cmds remain.
 * Never dual-registers the same names global+guild in one path.
 */
export async function registerSlashCommandSet(
  opts: RegisterSlashCommandSetOpts,
): Promise<RegisterSlashCommandSetResult> {
  const bodies = opts.bodies ?? buildSlashCommandBodies();
  const guildId = opts.guildId?.trim() || undefined;
  const puts: Array<{ route: string; bodyLength: number }> = [];

  if (guildId) {
    const guildRoute = applicationGuildCommandsRoute(
      opts.applicationId,
      guildId,
    );
    await opts.put(guildRoute, bodies);
    puts.push({ route: guildRoute, bodyLength: bodies.length });

    const globalRoute = applicationCommandsRoute(opts.applicationId);
    await opts.put(globalRoute, []);
    puts.push({ route: globalRoute, bodyLength: 0 });

    return {
      scope: "guild",
      guildId,
      registeredCount: bodies.length,
      clearedGlobals: true,
      puts,
    };
  }

  const globalRoute = applicationCommandsRoute(opts.applicationId);
  await opts.put(globalRoute, bodies);
  puts.push({ route: globalRoute, bodyLength: bodies.length });

  return {
    scope: "global",
    registeredCount: bodies.length,
    clearedGlobals: false,
    warnNoGuildId:
      "DISCORD_GUILD_ID unset — registered globals only; stale guild commands are not cleared. Set DISCORD_GUILD_ID for dogfood overwrite + clear-globals.",
    puts,
  };
}

export type LiveRegisterOpts = {
  token: string;
  applicationId: string;
  guildId?: string;
  bodies?: SlashCommandBody[];
};

/**
 * Live discord.js REST registration. Never logs the token.
 */
export async function registerSlashCommandsLive(
  opts: LiveRegisterOpts,
): Promise<RegisterSlashCommandSetResult> {
  const discord = await import("discord.js");
  const { REST, Routes } = discord;
  const rest = new REST({ version: "10" }).setToken(opts.token);

  const put: PutCommandsFn = async (route, body) => {
    // Map our path strings to Routes helpers when possible.
    const guildMatch = route.match(
      /^\/applications\/([^/]+)\/guilds\/([^/]+)\/commands$/,
    );
    const globalMatch = route.match(/^\/applications\/([^/]+)\/commands$/);
    if (guildMatch) {
      return rest.put(
        Routes.applicationGuildCommands(guildMatch[1], guildMatch[2]),
        { body },
      );
    }
    if (globalMatch) {
      return rest.put(Routes.applicationCommands(globalMatch[1]), { body });
    }
    // Fallback: treat route as full path for REST
    return rest.put(route as `/applications/${string}/commands`, { body });
  };

  return registerSlashCommandSet({
    applicationId: opts.applicationId,
    guildId: opts.guildId,
    bodies: opts.bodies,
    put,
  });
}
