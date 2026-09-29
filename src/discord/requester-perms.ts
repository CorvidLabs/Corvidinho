/**
 * DISCORD-8 — confused-deputy guard (Merlin-primary).
 * Verify the requesting Discord user could post to the target channel
 * (ViewChannel + SendMessages, plus AttachFiles for a file post), not only
 * that the bot could.
 * Archive cross-channel-guard.ts is advisory only — not used as ACL.
 */

import { buildVersionPresenceData } from "./presence.ts";

export type RequesterCheckResult =
  | { ok: true }
  | { ok: false; status: 403 | 404; reason: string };

/** Probe shape for fixture tests (no live Discord). */
export type ChannelPermProbe = {
  channelExists: boolean;
  isGuildText: boolean;
  memberInGuild: boolean;
  canView: boolean;
  canSend: boolean;
};

/**
 * Pure evaluate from a probe (Merlin verifyRequesterCanSend semantics).
 */
export function evaluateRequesterCanSend(
  probe: ChannelPermProbe,
): RequesterCheckResult {
  if (!probe.channelExists || !probe.isGuildText) {
    return { ok: false, status: 404, reason: "channel not found" };
  }
  if (!probe.memberInGuild) {
    return { ok: false, status: 403, reason: "requester not in guild" };
  }
  if (!probe.canView || !probe.canSend) {
    return {
      ok: false,
      status: 403,
      reason: "requester cannot send to this channel",
    };
  }
  return { ok: true };
}

/** Refusal reason when the requester may send but not attach files. */
export const REQUESTER_CANNOT_ATTACH = "requester cannot attach files in this channel";

/** What the requester must be able to do besides view + send. */
export type RequesterNeeds = {
  /** Attach files too (`discord-send-file`, DISCORD-17). */
  attachFiles?: boolean;
};

export type RequesterPermChecker = (
  channelId: string,
  requestingUserId: string,
  needs?: RequesterNeeds,
) => Promise<RequesterCheckResult>;

let overrideChecker: RequesterPermChecker | undefined;

/** Test seam — inject verdicts without live Discord. */
export function setRequesterPermCheckerForTests(
  checker?: RequesterPermChecker,
): void {
  overrideChecker = checker;
}

/**
 * Live path via discord.js permissionsFor (ViewChannel + SendMessages, and
 * AttachFiles when `opts.attachFiles`).
 * Uses a short-lived client; fixture tests should inject overrideChecker.
 */
export async function verifyRequesterCanSend(
  channelId: string,
  requestingUserId: string,
  opts: { token: string; dryRun?: boolean } & RequesterNeeds,
): Promise<RequesterCheckResult> {
  if (overrideChecker) {
    return opts.attachFiles
      ? overrideChecker(channelId, requestingUserId, { attachFiles: true })
      : overrideChecker(channelId, requestingUserId);
  }
  // Dry-run / no live Discord: cannot verify channel ACL without a client.
  // Fixture tests inject setRequesterPermCheckerForTests; without injection,
  // dry-run skips the live check (lenient — same spirit as Merlin soft mode).
  if (opts.dryRun) {
    return { ok: true };
  }

  const discord = await import("discord.js");
  const { Client, GatewayIntentBits, PermissionsBitField, ChannelType } =
    discord;
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    // DISCORD-12: this check opens its own gateway session with the bot token.
    // Without a presence its IDENTIFY carries an empty activity list, which can
    // replace the bridge's version Custom Status under the bot name.
    presence: buildVersionPresenceData(),
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("discord login timeout")), 15_000);
      client.once("ready", () => {
        clearTimeout(t);
        resolve();
      });
      client.once("error", (err) => {
        clearTimeout(t);
        reject(err);
      });
      void client.login(opts.token).catch((err) => {
        clearTimeout(t);
        reject(err);
      });
    });

    let channel: Awaited<ReturnType<typeof client.channels.fetch>>;
    try {
      channel = await client.channels.fetch(channelId);
    } catch {
      return { ok: false, status: 404, reason: "channel not found" };
    }
    if (!channel) {
      return { ok: false, status: 404, reason: "channel not found" };
    }

    const guildTextTypes = new Set([
      ChannelType.GuildText,
      ChannelType.GuildAnnouncement,
      ChannelType.PublicThread,
      ChannelType.PrivateThread,
      ChannelType.AnnouncementThread,
    ]);
    if (!("guild" in channel) || !guildTextTypes.has(channel.type)) {
      return {
        ok: false,
        status: 404,
        reason: "channel is not a guild text channel",
      };
    }

    const guildChannel = channel as {
      guild: { members: { fetch: (id: string) => Promise<unknown> } };
      permissionsFor: (member: unknown) => { has: (bits: unknown) => boolean } | null;
    };

    let member: unknown = null;
    try {
      member = await guildChannel.guild.members.fetch(requestingUserId);
    } catch {
      member = null;
    }
    if (!member) {
      return { ok: false, status: 403, reason: "requester not in guild" };
    }

    const perms = guildChannel.permissionsFor(member);
    if (
      !perms?.has([
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
      ])
    ) {
      return {
        ok: false,
        status: 403,
        reason: "requester cannot send to this channel",
      };
    }
    if (
      opts.attachFiles &&
      !perms.has(PermissionsBitField.Flags.AttachFiles)
    ) {
      return {
        ok: false,
        status: 403,
        reason: REQUESTER_CANNOT_ATTACH,
      };
    }
    return { ok: true };
  } finally {
    client.destroy();
  }
}

/** Human fix hint (Merlin status-specific). */
export function requesterCheckFix(
  result: Extract<RequesterCheckResult, { ok: false }>,
  channelId: string,
  requestingUserId: string,
): string {
  if (result.status === 404) {
    return `Either the channel id (${channelId}) is wrong, or the user that triggered the agent (id ${requestingUserId}) is not in the same Discord guild as that channel. Verify the channel id, and confirm the requester is a member of the bot's guild.`;
  }
  if (result.reason === REQUESTER_CANNOT_ATTACH) {
    return `The Discord user that triggered the agent (id ${requestingUserId}) doesn't have permission to attach files in channel ${channelId}. The bot only attaches a file where the requesting user could attach it themselves. Grant the requesting user Attach Files on that channel in Discord.`;
  }
  return `The Discord user that triggered the agent (id ${requestingUserId}) doesn't have permission to send to channel ${channelId}. The bridge requires the requesting user to be able to send to the target channel themselves — otherwise the bot would post on behalf of someone who normally couldn't. Grant the requesting user ViewChannel + SendMessages on that channel in Discord, or ask them to relay through a channel they already have access to.`;
}
