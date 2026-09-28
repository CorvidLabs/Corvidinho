/**
 * Discord slash registration (DISCORD-4 / REQ-discord-016).
 * Guild PUT overwrite of the current body set (nine incl. /admin) + clear globals.
 * Steal PUT+clear-globals only — do NOT port archive buildCommands() lists.
 */

import { formatErrorLine } from "../store/scrub.ts";
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

/** HTTP status on a thrown discord.js REST error (`status` or `response.status`). */
function httpStatusOf(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as { status?: unknown; response?: { status?: unknown } };
  const s = e.status ?? e.response?.status;
  return typeof s === "number" && s >= 100 && s <= 599 ? s : undefined;
}

/**
 * REQ-cli-419 / REQ-discord-417: one SAFE-6 line for a failed slash-command
 * registration, never the DiscordAPIError dump (stack, `rawError`,
 * `requestBody`). `what` names the caller (`corvidinho discord
 * register-commands` or the bridge's registration on ready); `guildHint`
 * names where the guild id came from (`--guild-id` / `DISCORD_GUILD_ID`).
 */
export function formatRegisterCommandsFailure(
  err: unknown,
  opts: { what?: string; guildHint?: string; env?: NodeJS.ProcessEnv } = {},
): string {
  const what = opts.what ?? "register-commands failed";
  const status = httpStatusOf(err);
  const hint =
    status === 401 || status === 403
      ? ` — check DISCORD_TOKEN / DISCORD_BOT_TOKEN and ${opts.guildHint ?? "--guild-id"}`
      : "";
  return `[discord] ${what}${status ? ` (${status})` : ""}: ${formatErrorLine(err, { env: opts.env })}${hint}`;
}
