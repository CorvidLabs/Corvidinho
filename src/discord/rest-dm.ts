/**
 * AUTONOMOUS-7.a — a direct message to one user over Discord's REST API with
 * the bot token, with no gateway session. `corvidinho daemon` has no Discord
 * bridge, so it reaches the owner this way (src/scheduler/service.ts
 * `ownerDm`, REQ-discord-707).
 *
 * It is a {@link SendPrivateDm}, the contract the gateway's `sendDm` (the
 * MEMORY-ACL-6 forget cards, MEMORY-7.a private replies, SAFE-14.a spend DMs)
 * keeps: open the DM channel (`POST /users/@me/channels`), then post the
 * message (`POST /channels/<id>/messages`). Like the gateway's DM it parses
 * no mentions (`allowed_mentions.parse = []`, REQ-discord-205), defangs
 * `@everyone` / `@here`, and refuses content over `DISCORD_DM_MAX` loudly
 * instead of cutting it (SAFE-18, REQ-discord-096). It sends no components:
 * a button press needs a gateway to be received. Resolves the DM channel and
 * message ids, or null when it did not go out (the error goes to `onError`,
 * never thrown). The token is only handed to the REST client; it is never
 * logged.
 */

import { formatErrorLine } from "../store/scrub.ts";
import { outboundAllowedMentions } from "./allowed-mentions.ts";
import { boundedContent } from "./gateway.ts";
import type { SendPrivateDm } from "./private-reply.ts";
import { DISCORD_DM_MAX } from "./rich-reply.ts";

/**
 * The part of a Discord REST client this needs: `post(route, { body })`
 * resolving the response JSON (discord.js `REST#post`). Tests pass a fake.
 */
export type DiscordRestClient = {
  post(route: `/${string}`, options: { body: unknown }): Promise<unknown>;
};

/** Route that opens (or returns) the bot's DM channel with a user. */
export const DM_CHANNEL_ROUTE = "/users/@me/channels" as const;

/** Route that posts a message to a channel. */
export function channelMessagesRoute(channelId: string): `/${string}` {
  return `/channels/${channelId}/messages`;
}

const SNOWFLAKE_RE = /^\d{1,25}$/;

function idOf(response: unknown): string | null {
  const id = (response as { id?: unknown } | null)?.id;
  return typeof id === "string" && SNOWFLAKE_RE.test(id) ? id : null;
}

/** discord.js REST with the bot token (v10), created on first use. */
async function liveRest(token: string): Promise<DiscordRestClient> {
  const { REST } = await import("discord.js");
  return new REST({ version: "10" }).setToken(token) as unknown as DiscordRestClient;
}

export type RestSendDmOptions = {
  /** The bot token (`DISCORD_BOT_TOKEN` / `DISCORD_TOKEN`). */
  token: string;
  /** Test seam: a fake REST client (default: discord.js REST with `token`). */
  rest?: DiscordRestClient;
  /** A DM that did not go out: its scrubbed one-line reason (SAFE-6). */
  onError?: (reason: string) => void;
};

/** A {@link SendPrivateDm} over Discord's REST API (no gateway). */
export function createRestSendDm(opts: RestSendDmOptions): SendPrivateDm {
  let client: Promise<DiscordRestClient> | null = opts.rest ? Promise.resolve(opts.rest) : null;
  const fail = (reason: string): null => {
    try {
      opts.onError?.(reason);
    } catch {
      // A logger that throws never makes the DM throw.
    }
    return null;
  };
  return async ({ userId, content }) => {
    const recipient = userId.trim();
    if (!SNOWFLAKE_RE.test(recipient)) return fail("the user id is not a Discord id");
    try {
      // Defanged, and refused (not cut) when over the DM cap.
      const text = boundedContent("restDm", content, DISCORD_DM_MAX);
      // A client that could not be made is made again on the next DM.
      client ??= liveRest(opts.token).catch((err: unknown) => {
        client = null;
        throw err;
      });
      const rest = await client;
      const channelId = idOf(await rest.post(DM_CHANNEL_ROUTE, { body: { recipient_id: recipient } }));
      if (!channelId) return fail("Discord returned no DM channel");
      const messageId = idOf(
        await rest.post(channelMessagesRoute(channelId), {
          body: { content: text, allowed_mentions: outboundAllowedMentions() },
        }),
      );
      if (!messageId) return fail("Discord returned no message");
      return { channelId, messageId };
    } catch (err) {
      return fail(formatErrorLine(err));
    }
  };
}
