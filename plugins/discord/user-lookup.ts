/**
 * Read-only Discord guild member / user lookup (IDENTITY-5 / DISCORD-13).
 * Scoped to DISCORD_GUILD_ID only — never arbitrary guilds.
 *
 * SAFE-11: member names are third-party text headed for the model, so the
 * username, global name, nickname and display name are cleaned
 * (`cleanDisplayName`: no mention markup, invisible, bidi or tag characters,
 * role-like tags or labels, capped). A lookup names a Discord account; it
 * never makes anyone a declared person or gives a role (declared ids only).
 */

import { cleanDisplayName } from "../../src/agent/untrusted.ts";
import type { PluginCommand, PluginHandlerResult } from "../../src/plugins/types.ts";

/** Discord snowflake: 17–20 digits typical; allow headroom like channel helpers. */
export const USER_SNOWFLAKE_RE = /^\d{17,25}$/;

export const DISCORD_USER_LOOKUP_NAME = "discord-user-lookup";

export type DiscordUserLookupFetch = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

export type DiscordMemberLookup = {
  id: string;
  username: string;
  globalName: string | null;
  nickname: string | null;
  displayName: string;
  bot: boolean;
  guildId: string;
};

function parseFlag(args: string[], name: string): string | undefined {
  const eq = args.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1] && !args[i + 1]!.startsWith("-")) return args[i + 1];
  return undefined;
}

/** Extract a snowflake from raw text, `<@id>`, or `<@!id>`. */
export function extractUserSnowflake(raw: string): string | null {
  const t = raw.trim();
  if (USER_SNOWFLAKE_RE.test(t)) return t;
  const mention = /^<@!?(\d{17,25})>$/.exec(t);
  if (mention?.[1]) return mention[1];
  // "bug 3040…" / leading junk: first long digit run
  const embedded = /\b(\d{17,25})\b/.exec(t);
  return embedded?.[1] ?? null;
}

export function configuredGuildId(env: NodeJS.ProcessEnv = process.env): string {
  return env.DISCORD_GUILD_ID?.trim() || "";
}

export function resolveLookupGuildId(
  requested: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): { ok: true; guildId: string } | { ok: false; error: string } {
  const configured = configuredGuildId(env);
  if (!configured) {
    return {
      ok: false,
      error:
        "DISCORD_GUILD_ID unset — discord-user-lookup only resolves members in the configured guild",
    };
  }
  const want = (requested ?? "").trim();
  if (want && want !== configured) {
    return {
      ok: false,
      error: `refused: guild ${want} is not the configured DISCORD_GUILD_ID (IDENTITY-5 — no arbitrary guild lookup)`,
    };
  }
  return { ok: true, guildId: configured };
}

type DiscordApiUser = {
  id?: string;
  username?: string;
  global_name?: string | null;
  bot?: boolean;
};

type DiscordApiMember = {
  nick?: string | null;
  user?: DiscordApiUser;
};

function memberFromApi(
  guildId: string,
  body: DiscordApiMember,
): DiscordMemberLookup | null {
  const user = body.user;
  if (!user) return null;
  const id = user.id?.trim() ?? "";
  if (!id) return null;
  // SAFE-11: every name cleaned before it reaches the model.
  const username = cleanDisplayName(user.username) ?? id;
  const globalName = cleanDisplayName(user.global_name) ?? null;
  const nickname = cleanDisplayName(body.nick) ?? null;
  const displayName = nickname || globalName || username;
  return {
    id,
    username,
    globalName,
    nickname,
    displayName,
    bot: Boolean(user.bot),
    guildId,
  };
}

export type LookupByIdOpts = {
  guildId: string;
  userId: string;
  token: string;
  dryRun?: boolean;
  fetchImpl?: DiscordUserLookupFetch;
};

export async function lookupGuildMemberById(
  opts: LookupByIdOpts,
): Promise<PluginHandlerResult> {
  if (opts.dryRun) {
    return {
      ok: true,
      data: {
        dryRun: true,
        guildId: opts.guildId,
        userId: opts.userId,
        displayName: `(dry-run member ${opts.userId})`,
        username: "dry-run",
        globalName: null,
        nickname: null,
        bot: false,
      },
      message: `dry-run lookup user ${opts.userId} in guild ${opts.guildId}`,
      exitCode: 0,
    };
  }

  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `https://discord.com/api/v10/guilds/${opts.guildId}/members/${opts.userId}`;
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      headers: { Authorization: `Bot ${opts.token}` },
    });
    if (res.status === 404) {
      return {
        ok: false,
        error: `user ${opts.userId} is not a member of the configured guild (or id is unknown)`,
        exitCode: 4,
      };
    }
    if (!res.ok) {
      const body = await res.text();
      return {
        ok: false,
        error: `discord API ${res.status}: ${body.slice(0, 200)}`,
        exitCode: 1,
      };
    }
    const json = (await res.json()) as DiscordApiMember;
    const member = memberFromApi(opts.guildId, json);
    if (!member) {
      return { ok: false, error: "discord API returned no user payload", exitCode: 1 };
    }
    return {
      ok: true,
      data: member,
      message: `${member.displayName} (@${member.username}, id ${member.id})`,
      exitCode: 0,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, exitCode: 1 };
  }
}

export type LookupByQueryOpts = {
  guildId: string;
  query: string;
  token: string;
  dryRun?: boolean;
  limit?: number;
  fetchImpl?: DiscordUserLookupFetch;
};

export async function lookupGuildMembersByQuery(
  opts: LookupByQueryOpts,
): Promise<PluginHandlerResult> {
  const q = opts.query.trim();
  if (!q) {
    return { ok: false, error: "missing --query", exitCode: 1 };
  }
  const limit = Math.min(Math.max(opts.limit ?? 5, 1), 10);

  if (opts.dryRun) {
    return {
      ok: true,
      data: {
        dryRun: true,
        guildId: opts.guildId,
        query: q,
        matches: [
          {
            id: "0",
            username: "dry-run",
            globalName: null,
            nickname: null,
            displayName: `(dry-run match for ${q})`,
            bot: false,
            guildId: opts.guildId,
          },
        ],
      },
      message: `dry-run search "${q}" in guild ${opts.guildId}`,
      exitCode: 0,
    };
  }

  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = new URL(
    `https://discord.com/api/v10/guilds/${opts.guildId}/members/search`,
  );
  url.searchParams.set("query", q);
  url.searchParams.set("limit", String(limit));

  try {
    const res = await fetchImpl(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bot ${opts.token}` },
    });
    if (!res.ok) {
      const body = await res.text();
      return {
        ok: false,
        error: `discord API ${res.status}: ${body.slice(0, 200)}`,
        exitCode: 1,
      };
    }
    const json = (await res.json()) as DiscordApiMember[];
    const matches = (Array.isArray(json) ? json : [])
      .map((m) => memberFromApi(opts.guildId, m))
      .filter((m): m is DiscordMemberLookup => m != null);
    if (matches.length === 0) {
      return {
        ok: false,
        error: `no guild members matched query "${q}"`,
        exitCode: 4,
      };
    }
    const top = matches[0]!;
    return {
      ok: true,
      data: { guildId: opts.guildId, query: q, matches },
      message:
        matches.length === 1
          ? `${top.displayName} (@${top.username}, id ${top.id})`
          : `${matches.length} matches; top: ${top.displayName} (@${top.username}, id ${top.id})`,
      exitCode: 0,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, exitCode: 1 };
  }
}

export function buildDiscordUserLookupCommand(opts?: {
  fetchImpl?: DiscordUserLookupFetch;
  env?: NodeJS.ProcessEnv;
}): PluginCommand {
  const fetchImpl = opts?.fetchImpl;
  const envFor = () => opts?.env ?? process.env;

  return {
    name: DISCORD_USER_LOOKUP_NAME,
    description:
      "Look up a Discord guild member by snowflake user id or name query " +
      "(IDENTITY-5 / DISCORD-13). Read-only; configured DISCORD_GUILD_ID only. " +
      'Args: ["--user-id","<snowflake>"] or ["--query","Gaspar"]. Prefer this ' +
      "before SpecSync/git/github when chat mentions a Discord person.",
    dangerous: false,
    mutating: false,
    minTier: 0,
    async handler(ctx) {
      const env = envFor();
      const guildFlag =
        parseFlag(ctx.args, "--guild") ?? parseFlag(ctx.args, "--guild-id");
      const guild = resolveLookupGuildId(guildFlag, env);
      if (!guild.ok) {
        return { ok: false, error: guild.error, exitCode: 3 };
      }

      const rawUser =
        parseFlag(ctx.args, "--user-id") ??
        parseFlag(ctx.args, "--user") ??
        parseFlag(ctx.args, "-u");
      const query =
        parseFlag(ctx.args, "--query") ??
        parseFlag(ctx.args, "--name") ??
        parseFlag(ctx.args, "-q");

      const token =
        env.DISCORD_BOT_TOKEN?.trim() || env.DISCORD_TOKEN?.trim() || "";
      const dryRun = env.CORVIDINHO_DISCORD_DRY_RUN === "1";

      if (rawUser) {
        const userId = extractUserSnowflake(rawUser);
        if (!userId) {
          return {
            ok: false,
            error: `not a Discord snowflake user id: ${rawUser.slice(0, 40)}`,
            exitCode: 1,
          };
        }
        if (!token && !dryRun) {
          return {
            ok: false,
            error:
              "missing DISCORD_TOKEN or DISCORD_BOT_TOKEN (set in env; never commit)",
            exitCode: 1,
          };
        }
        return lookupGuildMemberById({
          guildId: guild.guildId,
          userId,
          token,
          dryRun,
          fetchImpl,
        });
      }

      if (query) {
        if (!token && !dryRun) {
          return {
            ok: false,
            error:
              "missing DISCORD_TOKEN or DISCORD_BOT_TOKEN (set in env; never commit)",
            exitCode: 1,
          };
        }
        return lookupGuildMembersByQuery({
          guildId: guild.guildId,
          query,
          token,
          dryRun,
          fetchImpl,
        });
      }

      // Positional: treat as snowflake if it looks like one, else as query.
      const positional = ctx.args.filter((a) => !a.startsWith("-")).join(" ").trim();
      if (positional) {
        const asId = extractUserSnowflake(positional);
        if (asId && USER_SNOWFLAKE_RE.test(positional.trim())) {
          if (!token && !dryRun) {
            return {
              ok: false,
              error:
                "missing DISCORD_TOKEN or DISCORD_BOT_TOKEN (set in env; never commit)",
              exitCode: 1,
            };
          }
          return lookupGuildMemberById({
            guildId: guild.guildId,
            userId: asId,
            token,
            dryRun,
            fetchImpl,
          });
        }
        if (!token && !dryRun) {
          return {
            ok: false,
            error:
              "missing DISCORD_TOKEN or DISCORD_BOT_TOKEN (set in env; never commit)",
            exitCode: 1,
          };
        }
        return lookupGuildMembersByQuery({
          guildId: guild.guildId,
          query: positional,
          token,
          dryRun,
          fetchImpl,
        });
      }

      return {
        ok: false,
        error:
          "usage: discord-user-lookup --user-id <snowflake> | --query <name> [--guild <configured-id>]",
        exitCode: 1,
      };
    },
  };
}

export const discordUserLookup: PluginCommand = buildDiscordUserLookupCommand();
