/**
 * Discord outbound plugins — discord-post-message and discord-send-file
 * (DISCORD-17, `send-file.ts`) are dangerous (externally visible writes).
 * DISCORD-8: confused-deputy requester check (Merlin-primary). In a run the
 * bridge started, the check is always for the acting Discord user the bridge
 * set (CORVIDINHO_ACTING_DISCORD_USER_ID), never a model-supplied id. The
 * content is model-written, so the post parses no mentions (REQ-discord-205).
 */

import { checkChannel } from "../../src/allowlist/discord.ts";
import { tryLoadAllowlist } from "../../src/allowlist/load.ts";
import { mergeChannelIds } from "../../src/discord/config.ts";
import { formatErrorLine } from "../../src/store/scrub.ts";
import { get, register } from "../../src/plugins/registry.ts";
import type { PluginCommand, PluginHandlerResult } from "../../src/plugins/types.ts";
import { defangMassMentions } from "../../src/discord/allowed-mentions.ts";
import {
  requesterCheckFix,
  setRequesterPermCheckerForTests,
  verifyRequesterCanSend,
  type RequesterCheckResult,
} from "../../src/discord/requester-perms.ts";

import {
  discordUserLookup,
  DISCORD_USER_LOOKUP_NAME,
} from "./user-lookup.ts";
import { discordSendFile, DISCORD_SEND_FILE_NAME } from "./send-file.ts";

export {
  extractUserSnowflake,
  resolveLookupGuildId,
  USER_SNOWFLAKE_RE,
  DISCORD_USER_LOOKUP_NAME,
  buildDiscordUserLookupCommand,
} from "./user-lookup.ts";

export {
  DISCORD_SEND_FILE_NAME,
  DISCORD_UPLOAD_MAX_BYTES,
  REPLY_CHANNEL_ENV,
  REPLY_PARENT_CHANNEL_ENV,
  SEND_FILE_ALLOWED_EXTENSIONS,
} from "./send-file.ts";

export { setRequesterPermCheckerForTests };

function parseFlag(args: string[], name: string): string | undefined {
  const eq = args.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1] && !args[i + 1]!.startsWith("-")) return args[i + 1];
  return undefined;
}

/** Every value given for `name` (repeated flags and `name=value` forms). */
function flagValues(args: string[], name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith(`${name}=`)) out.push(a.slice(name.length + 1));
    else if (a === name && args[i + 1] && !args[i + 1]!.startsWith("-")) out.push(args[i + 1]!);
  }
  return out;
}

function requireRequesterCheck(env: NodeJS.ProcessEnv): boolean {
  const raw = env.CORVIDINHO_DISCORD_REQUIRE_REQUESTER_CHECK?.trim();
  return raw === "1" || raw?.toLowerCase() === "true";
}

/**
 * The Discord user a bridge-started run acts for (set per spawn by the
 * bridge, REQ-discord-021); empty outside the bridge (operator `plugins run`,
 * local `task run`, WATCH clears it).
 */
function actingDiscordUser(env: NodeJS.ProcessEnv): string {
  return env.CORVIDINHO_ACTING_DISCORD_USER_ID?.trim() ?? "";
}

type PreparedPost =
  | { ok: false; result: PluginHandlerResult }
  | {
      ok: true;
      channelId: string;
      /** Exactly what is posted: mass mentions defanged, at most 1900 characters. */
      body: string;
      /** The DISCORD-8 requester to check, or "" for none. */
      checkUserId: string;
      actingUserId: string;
      token: string;
      dryRun: boolean;
    };

/**
 * Everything discord-post-message checks before it posts, except the
 * DISCORD-8 requester lookup (a network call): args, the bridge's channel
 * gate, a requester id naming someone else, the token and strict mode. The
 * must-ask classifier and the handler share it, so the owner is never asked
 * about a post that would be refused, and a refusal is the same either way.
 */
async function preparePost(args: string[]): Promise<PreparedPost> {
  const refuse = (error: string, exitCode: number): PreparedPost => ({
    ok: false,
    result: { ok: false, error, exitCode },
  });
  const channelId = parseFlag(args, "--channel") ?? parseFlag(args, "-c");
  const content =
    parseFlag(args, "--content") ??
    parseFlag(args, "-m") ??
    args.filter((a) => !a.startsWith("-")).join(" ").trim();
  const requestingUserId =
    parseFlag(args, "--requesting-user-id") ?? parseFlag(args, "--requester");

  if (!channelId) {
    return refuse(
      "usage: discord-post-message --channel <id> --content <text> [--requesting-user-id <id>]",
      1,
    );
  }
  if (!content) return refuse("missing --content", 1);

  // A malformed / unreadable allowlist file refuses (fail closed), never env-only.
  const loaded = await tryLoadAllowlist({ env: process.env });
  if (!loaded.ok) return refuse(`not authorized: ${loaded.error}`, 3);
  // DISCORD-5 / REQ-discord-004: the bridge's and daemon's channel set —
  // allowlist file + CORVIDINHO_DISCORD_ALLOW_CHANNELS ∪ DISCORD_CHANNEL_IDS.
  // checkChannel reads the deny lists first, so a deny still wins.
  const gate = checkChannel(channelId, {
    ...loaded.config.discord,
    channels: mergeChannelIds(loaded.config, process.env),
  });
  if (!gate.ok) return refuse(gate.error, 3);

  // DISCORD-8: in a bridge-started run the check is about the acting user
  // only. A requester id naming someone else is refused, not replaced —
  // any of them, so a repeated flag or the other alias cannot slip one by.
  const actingUserId = actingDiscordUser(process.env);
  const namedRequesters = [
    ...flagValues(args, "--requesting-user-id"),
    ...flagValues(args, "--requester"),
  ]
    .map((id) => id.trim())
    .filter((id) => id !== "");
  if (actingUserId && namedRequesters.some((id) => id !== actingUserId)) {
    return refuse(
      "refused: --requesting-user-id / --requester names a different Discord user than the one this run acts for. The requester check is always for the acting user the bridge set (DISCORD-8); leave the flag out. Nothing was posted.",
      3,
    );
  }

  const token =
    process.env.DISCORD_BOT_TOKEN?.trim() ||
    process.env.DISCORD_TOKEN?.trim() ||
    "";
  if (!token) {
    return refuse("missing DISCORD_TOKEN or DISCORD_BOT_TOKEN (set in env; never commit)", 1);
  }

  const checkUserId = actingUserId || requestingUserId || "";
  if (!checkUserId && requireRequesterCheck(process.env)) {
    return refuse(
      "requesting_user_id is required (strict mode). Pass --requesting-user-id <discord-user-id> or unset CORVIDINHO_DISCORD_REQUIRE_REQUESTER_CHECK.",
      3,
    );
  }

  return {
    ok: true,
    channelId,
    // REQ-discord-205: no @everyone/@here, role or user ping from text.
    body: defangMassMentions(content).slice(0, 1900),
    checkUserId,
    actingUserId,
    token,
    dryRun: process.env.CORVIDINHO_DISCORD_DRY_RUN === "1",
  };
}

/**
 * Dangerous: posts a message to a Discord channel via REST.
 * Requires token + allowlisted channel (the bridge's set: allowlist file / env
 * ∪ DISCORD_CHANNEL_IDS; deny lists win). DISCORD-8 requester check: in a
 * bridge-started run always for the acting user (a --requesting-user-id
 * naming anyone else is refused, and a check that cannot run refuses);
 * otherwise when --requesting-user-id is provided (or strict mode requires it).
 * AUTONOMY-10/10.a: every post it makes waits for the owner's OK on a plain
 * Approve card showing the exact text (dictated text and replies to the
 * owner included); a dry run posts nothing and does not ask.
 */
const discordPostMessage: PluginCommand = {
  name: "discord-post-message",
  description:
    "Post a message to an allowlisted Discord channel; waits for the owner's OK on an Approve card first (dangerous; DISCORD-5/8, AUTONOMY-10)",
  dangerous: true,
  minTier: 1,
  mustAsk: async ({ args }) => {
    const post = await preparePost(args);
    if (!post.ok) return { refuse: post.result };
    if (post.dryRun) return null;
    return {
      ask: {
        class: "public",
        why: "posts this message in a Discord channel",
        target: `Discord channel ${post.channelId}`,
        text: post.body,
      },
    };
  },
  async handler(ctx) {
    const post = await preparePost(ctx.args);
    if (!post.ok) return post.result;
    const { channelId, checkUserId, actingUserId, token, dryRun } = post;

    // DISCORD-8 — confused-deputy: check requester can send, not only the bot.
    if (checkUserId) {
      let check: RequesterCheckResult;
      try {
        check = await verifyRequesterCanSend(channelId, checkUserId, {
          token,
          dryRun,
        });
      } catch (e) {
        if (!actingUserId) throw e;
        // Fail closed: a bridge run posts only after the acting user's check.
        return {
          ok: false,
          error: `refused: could not check that the acting Discord user can post in channel ${channelId} (DISCORD-8), so nothing was posted: ${formatErrorLine(e, { max: 200 })}. The check logs in with the Guild Members intent to look the user up: if Server Members Intent is off for the bot in the Discord Developer Portal, turn it on.`,
          exitCode: 3,
        };
      }
      if (!check.ok) {
        const fix = requesterCheckFix(check, channelId, checkUserId);
        return {
          ok: false,
          error: `${check.reason} — ${fix}`,
          exitCode: check.status === 404 ? 4 : 3,
          data: { status: check.status, reason: check.reason },
        };
      }
    }

    if (dryRun) {
      return {
        ok: true,
        data: {
          dryRun: true,
          channelId,
          content: post.body.slice(0, 100),
          requestingUserId: checkUserId || null,
        },
        message: `dry-run post to ${channelId}`,
        exitCode: 0,
      };
    }

    try {
      const res = await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bot ${token}`,
            "Content-Type": "application/json",
          },
          // REQ-discord-205: no @everyone/@here, role or user ping from text.
          body: JSON.stringify({
            content: post.body,
            allowed_mentions: { parse: [] },
          }),
        },
      );
      if (!res.ok) {
        const body = await res.text();
        return {
          ok: false,
          error: `discord API ${res.status}: ${body.slice(0, 200)}`,
          exitCode: 1,
        };
      }
      const json = (await res.json()) as { id?: string };
      return {
        ok: true,
        data: { messageId: json.id, channelId },
        message: `posted message ${json.id ?? "?"} to ${channelId}`,
        exitCode: 0,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg, exitCode: 1 };
    }
  },
};

export function loadDiscordPlugins(): void {
  // Re-register after clearRegistry() in other tests (module flag would stick).
  if (!get("discord-post-message")) register(discordPostMessage);
  if (!get(DISCORD_USER_LOOKUP_NAME)) register(discordUserLookup);
  // DISCORD-17: attach a file or image in the conversation's own channel.
  if (!get(DISCORD_SEND_FILE_NAME)) register(discordSendFile);
}
