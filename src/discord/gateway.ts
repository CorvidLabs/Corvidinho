/**
 * Thin Discord gateway (discord.js). Live connect only when token present.
 * Tests inject InboundMessage / SlashInteraction — no ProcessManager.
 *
 * Every outbound post (channel send, reply, message/embed edit, slash
 * reply/editReply, component reply/update) parses no mentions from its
 * content: the client default and each payload set `allowedMentions.parse =
 * []`, and `@everyone` / `@here` are defanged in the text, so model-written
 * summaries cannot ping a role, `@everyone`, `@here` or a user (DISCORD-8
 * confused deputy, REQ-discord-205).
 */

import type * as DiscordJs from "discord.js";
import {
  defangMassMentions,
  outboundAllowedMentions,
} from "./allowed-mentions.ts";
import {
  buildChannelAutocompleteChoices,
  type ChannelCandidate,
} from "./channel-autocomplete.ts";
import { buildSlashCommandBodies } from "./slash-commands.ts";
import {
  formatRegisterCommandsFailure,
  registerSlashCommandsLive,
} from "./register-commands.ts";
import type {
  SlashInteraction,
  SlashOptionValue,
  SlashReplyPayload,
} from "./slash-types.ts";
import type { DiscordEmbedPayload } from "./thinking-status.ts";
import { buildVersionPresenceData } from "./presence.ts";
import type { BridgeConfig, InboundMessage } from "./types.ts";
import { VERSION as PACKAGE_VERSION } from "../version.ts";

/** Thin MessageComponent interaction (DISCORD-ASK buttons). */
export type ComponentInteraction = {
  id: string;
  customId: string;
  channelId: string;
  guildId?: string;
  userId: string;
  /** Member role snowflakes, for the actor gate (REQ-discord-201). */
  roleIds?: string[];
  messageId?: string;
  /** Reply (or update) — supports ephemeral choice UI. */
  reply: (opts: {
    content?: string;
    ephemeral?: boolean;
    components?: unknown[];
    update?: boolean;
  }) => Promise<void>;
  /**
   * DISCORD-ASK-8 — drop the ephemeral choice / "Got it" message after pick
   * or when resume finishes (discord.js deleteReply after update/reply).
   */
  deleteReply?: () => Promise<void>;
  /** Presser's Discord display name when known (IDENTITY-4). */
  userDisplayName?: string;
  /** Presser's Discord username when known (IDENTITY-4). */
  userUsername?: string;
};

export type GatewayHandlers = {
  onMessage: (msg: InboundMessage) => void | Promise<void>;
  /** Slash commands (DISCORD-4). */
  onSlash?: (interaction: SlashInteraction) => void | Promise<void>;
  /** Button / select component presses (DISCORD-ASK). */
  onComponent?: (interaction: ComponentInteraction) => void | Promise<void>;
  /**
   * Live allowlisted channel ids for `/admin channels remove` autocomplete.
   * Bridge wires `config.channelIds` (mutated in place by /admin).
   */
  getAllowlistedChannelIds?: () => readonly string[];
  /**
   * DISCORD-DENY-3 / ADMIN-4 / REQ-discord-431 — may this invoker see channel
   * autocomplete choices? Asked on every autocomplete request; unset or false
   * ⇒ empty choices (fail closed). The bridge wires the slash gate order:
   * channel allowlist → actor gate → ADMIN (owner, not muted).
   */
  mayAutocompleteChannels?: (actor: AutocompleteActor) => boolean;
  onReady?: (botUserId: string) => void;
  /**
   * Optional outbound helper used by bridge after agent reply. The live
   * gateway parses no mentions from `content` (REQ-discord-205); only the
   * replied-to author and `mentionUserIds` may be pinged.
   */
  reply?: (opts: {
    channelId: string;
    content: string;
    replyToMessageId?: string;
    /**
     * Users (besides the replied-to author) this post may ping — the ask's
     * requester or owner (AUTONOMY-2/4). Omitted ⇒ nobody else.
     */
    mentionUserIds?: string[];
    /** Discord ActionRow components (DISCORD-ASK stub buttons). */
    components?: unknown[];
  }) => Promise<{ messageId: string } | null>;
  /** Progress embeds (DISCORD-3). */
  sendEmbed?: (opts: {
    channelId: string;
    embed: DiscordEmbedPayload;
    replyToMessageId?: string;
  }) => Promise<{ messageId: string } | null>;
  editEmbed?: (opts: {
    channelId: string;
    messageId: string;
    embed: DiscordEmbedPayload;
  }) => Promise<boolean>;
  /** Richer in-place edit (DISCORD-ASK-6/7 collapse). */
  editMessage?: (opts: {
    channelId: string;
    messageId: string;
    content?: string | null;
    embed?: DiscordEmbedPayload | null;
    components?: unknown[] | null;
    mentionUserIds?: string[];
  }) => Promise<boolean>;
  deleteMessage?: (opts: {
    channelId: string;
    messageId: string;
  }) => Promise<boolean>;
  /**
   * Direct message to one user (MEMORY-ACL-6: the owner's Approve/Deny card,
   * the asker's outcome notice). Parses no mentions (REQ-discord-205).
   * Resolves the DM channel and message ids, or null when it did not go out.
   */
  sendDm?: (opts: {
    userId: string;
    content: string;
    components?: unknown[];
  }) => Promise<{ channelId: string; messageId: string } | null>;
};

/** Who asked for channel autocomplete, and where (REQ-discord-431). */
export type AutocompleteActor = {
  commandName: string;
  channelId: string;
  userId: string;
  roleIds: string[];
};

/** Fixture-friendly subset of a discord.js interaction member (roles via `interactionRoleIds`). */
type RawInteractionMember = { roles?: RawMemberRoles } | null;

export type DiscordGateway = {
  start(): Promise<void>;
  stop(): Promise<void>;
  botUserId: string | null;
};

function optionValue(raw: unknown): SlashOptionValue {
  if (raw == null) return null;
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
    return raw;
  }
  return String(raw);
}

/** Raw discord.js `interaction.options.data` entry (fixture-friendly subset). */
export type RawSlashOption = {
  name: string;
  type?: number;
  value?: unknown;
  options?: RawSlashOption[];
};

/**
 * Flatten top-level, SUB_COMMAND (type 1) and SUB_COMMAND_GROUP (type 2)
 * options into one map plus the subcommand / group names
 * (e.g. /admin users add user:@x → group "users", sub "add", {user}).
 */
export function flattenSlashOptions(data: readonly RawSlashOption[]): {
  subcommandGroup?: string;
  subcommand?: string;
  options: Record<string, SlashOptionValue>;
} {
  const options: Record<string, SlashOptionValue> = {};
  let subcommandGroup: string | undefined;
  let subcommand: string | undefined;
  const takeSub = (opt: RawSlashOption) => {
    subcommand = subcommand ?? opt.name;
    for (const nested of opt.options ?? []) {
      options[nested.name] = optionValue(nested.value);
    }
  };
  for (const opt of data) {
    if (opt.type === 2 && Array.isArray(opt.options)) {
      subcommandGroup = subcommandGroup ?? opt.name;
      for (const sub of opt.options) {
        if (sub.type === 1) takeSub(sub);
      }
    } else if (opt.type === 1 && Array.isArray(opt.options)) {
      takeSub(opt);
    } else if (opt.type === 1) {
      subcommand = subcommand ?? opt.name;
    } else if (opt.value !== undefined) {
      options[opt.name] = optionValue(opt.value);
    }
  }
  return { subcommandGroup, subcommand, options };
}

/** discord.js interaction `member.roles`: a cached manager or raw API ids. */
export type RawMemberRoles =
  | { cache?: { keys: () => IterableIterator<string> } }
  | string[];

/**
 * Role snowflakes of an interaction's member (slash and components), for
 * `gateActor` role allow/deny (REQ-discord-201). Empty outside a guild.
 */
export function interactionRoleIds(
  member: { roles?: RawMemberRoles } | null | undefined,
): string[] {
  const roles = member?.roles;
  if (!roles) return [];
  if (Array.isArray(roles)) return [...roles];
  if (roles.cache && typeof roles.cache.keys === "function") {
    return [...roles.cache.keys()];
  }
  return [];
}

/**
 * Discord `MessageReferenceType.Forward` (discord-api-types v10). Kept as a
 * plain number so this module does not load discord.js eagerly.
 */
export const REFERENCE_TYPE_FORWARD = 1;

/** Fixture-friendly subset of discord.js `Message.reference`. */
export type RawMessageReference = {
  messageId?: string | null;
  channelId?: string | null;
  type?: number | null;
};

/**
 * DISCORD-2 / DISCORD-5 / REQ-discord-212 — the message id a MessageCreate
 * *replies* to, or undefined. A forward (MessageReferenceType.Forward) points
 * at a message elsewhere and is never a reply; any reference whose channel is
 * not the message's own channel (the thread, or its parent) is dropped too,
 * so a tracked bot message cannot pull its session into another channel.
 */
export function replyReferenceMessageId(
  reference: RawMessageReference | null | undefined,
  own: { channelId: string; parentId?: string },
): string | undefined {
  if (!reference?.messageId) return undefined;
  if (reference.type === REFERENCE_TYPE_FORWARD) return undefined;
  const refChannel = reference.channelId;
  if (!refChannel) return undefined;
  if (refChannel !== own.channelId && refChannel !== own.parentId) return undefined;
  return reference.messageId;
}

/**
 * Live gateway via discord.js. Dynamic import so unit tests need not load it
 * when using the null/fake gateway.
 */
export type LiveGatewayOptions = {
  /** Shared package version for Discord presence (DISCORD-12). */
  version?: string;
  /** discord.js module override (tests inject a fake; default dynamic import). */
  discord?: typeof DiscordJs;
};

export async function createLiveGateway(
  config: BridgeConfig,
  handlers: GatewayHandlers,
  opts?: LiveGatewayOptions,
): Promise<DiscordGateway> {
  const discord = opts?.discord ?? (await import("discord.js"));
  const {
    Client,
    GatewayIntentBits,
    Events,
    ChannelType,
    MessageFlags,
  } = discord;
  const presenceVersion = opts?.version ?? PACKAGE_VERSION;

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    // DISCORD-12: discord.js copies this into the gateway IDENTIFY payload at
    // login, so the first IDENTIFY and any non-resumable re-identify carry the
    // version. ClientReady does not fire again after a re-identify.
    presence: buildVersionPresenceData(presenceVersion),
    // REQ-discord-205: default for any payload that omits allowedMentions.
    allowedMentions: outboundAllowedMentions({ repliedUser: true }),
  });

  let botUserId: string | null = null;

  async function registerSlashCommands(): Promise<void> {
    try {
      if (!client.application) {
        console.warn("[discord] slash register skipped: application not ready");
        return;
      }
      const applicationId = client.application.id;
      const result = await registerSlashCommandsLive({
        token: config.token,
        applicationId,
        guildId: config.guildId,
        bodies: buildSlashCommandBodies(),
      });
      if (result.scope === "guild") {
        console.log(
          `[discord] registered ${result.registeredCount} guild slash command(s) on ${result.guildId} (globals cleared)`,
        );
      } else {
        console.log(
          `[discord] registered ${result.registeredCount} global slash command(s)`,
        );
        if (result.warnNoGuildId) {
          console.warn(`[discord] ${result.warnNoGuildId}`);
        }
      }
    } catch (err) {
      // REQ-discord-417: one scrubbed line, never the DiscordAPIError dump.
      console.error(
        formatRegisterCommandsFailure(err, {
          what: "slash command registration failed",
          guildHint: "DISCORD_GUILD_ID",
        }),
      );
    }
  }

  function adaptChatInput(interaction: {
    id: string;
    commandName: string;
    channelId: string;
    guildId: string | null;
    user: {
      id: string;
      username?: string | null;
      globalName?: string | null;
      displayName?: string | null;
    };
    member?: {
      displayName?: string | null;
      nickname?: string | null;
      roles?: RawMemberRoles;
    } | null;
    options: {
      getSubcommand: (required?: boolean) => string | null;
      getSubcommandGroup?: (required?: boolean) => string | null;
      data: RawSlashOption[];
    };
    reply: (opts: unknown) => Promise<unknown>;
    deferReply: (opts?: unknown) => Promise<unknown>;
    editReply: (opts: unknown) => Promise<unknown>;
    deleteReply?: () => Promise<unknown>;
    deferred: boolean;
    replied: boolean;
  }): SlashInteraction {
    let subcommand: string | undefined;
    let subcommandGroup: string | undefined;
    try {
      const sub = interaction.options.getSubcommand(false);
      if (sub) subcommand = sub;
    } catch {
      /* no subcommand */
    }
    try {
      const group = interaction.options.getSubcommandGroup?.(false);
      if (group) subcommandGroup = group;
    } catch {
      /* no subcommand group */
    }

    // Flatten top-level, subcommand and subcommand-group options.
    const flat = flattenSlashOptions(interaction.options.data);
    const options = flat.options;
    subcommand = subcommand ?? flat.subcommand;
    subcommandGroup = subcommandGroup ?? flat.subcommandGroup;

    const send = async (opts: SlashReplyPayload, mode: "reply" | "edit") => {
      // REQ-discord-205: /session start and /work carry model-written text.
      const payload: Record<string, unknown> = {
        allowedMentions: outboundAllowedMentions(),
      };
      if (opts.content !== undefined) {
        payload.content = defangMassMentions(opts.content).slice(0, 1900);
      }
      if (opts.embeds?.length) {
        payload.embeds = opts.embeds.map((e) => ({
          description: e.description,
          color: e.color,
          footer: e.footer,
        }));
      }
      // DISCORD-ASK-1: a slash ask's Choose button rides the answer.
      if (opts.components !== undefined) payload.components = opts.components;
      if (mode === "reply") {
        if (opts.ephemeral) payload.flags = MessageFlags.Ephemeral;
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(payload);
        } else {
          await interaction.reply(payload);
        }
      } else {
        // discord.js resolves editReply with the reply Message; its id lets a
        // fallback slash answer continue the session on reply (DISCORD-2).
        const sent = await interaction.editReply(payload);
        const id = (sent as { id?: unknown } | null | undefined)?.id;
        return typeof id === "string" && id ? { messageId: id } : undefined;
      }
      return undefined;
    };

    const roleIds = interactionRoleIds(interaction.member);

    return {
      id: interaction.id,
      commandName: interaction.commandName,
      subcommand,
      subcommandGroup,
      channelId: interaction.channelId,
      guildId: interaction.guildId ?? undefined,
      userId: interaction.user.id,
      userDisplayName:
        (interaction.member?.displayName ??
          interaction.member?.nickname ??
          interaction.user.globalName ??
          interaction.user.displayName ??
          undefined)?.trim() || undefined,
      userUsername: interaction.user.username?.trim() || undefined,
      roleIds,
      options,
      reply: async (opts) => {
        await send(opts, "reply");
      },
      deferReply: async (opts) => {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply(
            opts?.ephemeral
              ? { flags: MessageFlags.Ephemeral }
              : {},
          );
        }
      },
      editReply: (opts) => send(opts, "edit"),
      deleteReply: async () => {
        if (typeof interaction.deleteReply === "function") {
          await interaction.deleteReply();
        }
      },
    };
  }

  const gateway: DiscordGateway = {
    get botUserId() {
      return botUserId;
    },
    async start() {
      client.on(Events.ClientReady, (ready) => {
        botUserId = ready.user.id;
        console.log(`[discord] logged in as ${ready.user.tag}`);
        try {
          const presence = buildVersionPresenceData(presenceVersion);
          ready.user.setPresence(presence);
          console.log(`[discord] presence set: ${presence.activities[0].state}`);
        } catch (err) {
          console.warn("[discord] presence set failed:", err);
        }
        handlers.onReady?.(ready.user.id);
        void registerSlashCommands();
      });

      client.on(Events.MessageCreate, (message) => {
        if (message.author.bot) return;
        const isThread =
          message.channel.type === ChannelType.PublicThread ||
          message.channel.type === ChannelType.PrivateThread;
        const parentId =
          isThread && "parentId" in message.channel
            ? (message.channel.parentId as string | null) ?? message.channelId
            : message.channelId;
        const attachments = [...message.attachments.values()].map((a) => ({
          id: a.id,
          filename: a.name ?? "attachment",
          content_type: a.contentType ?? undefined,
          size: a.size,
          url: a.url,
          proxy_url: a.proxyURL ?? undefined,
          width: a.width ?? undefined,
          height: a.height ?? undefined,
        }));
        const inbound: InboundMessage = {
          id: message.id,
          channelId: parentId,
          threadId: isThread ? message.channelId : undefined,
          guildId: message.guildId ?? undefined,
          authorId: message.author.id,
          authorBot: message.author.bot,
          authorDisplayName:
            (
              message.member?.displayName ??
              message.author.globalName ??
              message.author.displayName ??
              undefined
            )?.trim() || undefined,
          authorUsername: message.author.username?.trim() || undefined,
          content: message.content ?? "",
          mentionedBot: botUserId
            ? message.mentions.users.has(botUserId)
            : false,
          referencedMessageId: replyReferenceMessageId(message.reference, {
            channelId: message.channelId,
            parentId: isThread ? parentId : undefined,
          }),
          authorRoleIds: message.member
            ? [...message.member.roles.cache.keys()]
            : [],
          attachments: attachments.length > 0 ? attachments : undefined,
        };
        Promise.resolve(handlers.onMessage(inbound)).catch((err) => {
          console.error("[discord] message handler error:", err);
        });
      });

      client.on(Events.InteractionCreate, (interaction) => {
        if (interaction.isAutocomplete()) {
          Promise.resolve(
            respondChannelAutocomplete(interaction as never, handlers, ChannelType),
          ).catch((err) => {
            console.error("[discord] autocomplete handler error:", err);
          });
          return;
        }
        if (interaction.isMessageComponent()) {
          if (!handlers.onComponent) return;
          const adapted = adaptComponent(interaction as never);
          Promise.resolve(handlers.onComponent(adapted)).catch((err) => {
            console.error("[discord] component handler error:", err);
          });
          return;
        }
        if (!interaction.isChatInputCommand()) return;
        if (!handlers.onSlash) return;
        const adapted = adaptChatInput(interaction as never);
        Promise.resolve(handlers.onSlash(adapted)).catch((err) => {
          console.error("[discord] slash handler error:", err);
        });
      });

      client.on(Events.Error, (err) => {
        console.error("[discord] gateway error:", err);
      });

      await client.login(config.token);
    },
    async stop() {
      client.destroy();
    },
  };

  // Attach reply helper for bridge
  handlers.reply = async ({
    channelId,
    content,
    replyToMessageId,
    mentionUserIds,
    components,
  }) => {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !("send" in channel) || typeof channel.send !== "function") {
        return null;
      }
      // REQ-discord-205: never parse mentions from (model-written) content;
      // only the replied-to author and mentionUserIds (an ask) may ping.
      const sent = await channel.send({
        content: defangMassMentions(content).slice(0, 1900),
        reply: replyToMessageId
          ? { messageReference: replyToMessageId, failIfNotExists: false }
          : undefined,
        ...(components?.length ? { components: components as never } : {}),
        allowedMentions: outboundAllowedMentions({
          users: mentionUserIds,
          repliedUser: true,
        }),
      });
      return { messageId: sent.id };
    } catch (err) {
      console.error("[discord] reply failed:", err);
      return null;
    }
  };

  handlers.sendEmbed = async ({ channelId, embed, replyToMessageId }) => {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !("send" in channel) || typeof channel.send !== "function") {
        return null;
      }
      const sent = await channel.send({
        embeds: [
          {
            description: embed.description,
            color: embed.color,
            footer: embed.footer,
          },
        ],
        reply: replyToMessageId
          ? { messageReference: replyToMessageId, failIfNotExists: false }
          : undefined,
        allowedMentions: outboundAllowedMentions({ repliedUser: true }),
      });
      return { messageId: sent.id };
    } catch (err) {
      console.error("[discord] sendEmbed failed:", err);
      return null;
    }
  };

  handlers.editEmbed = async ({ channelId, messageId, embed }) => {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !("messages" in channel)) return false;
      const messages = (channel as { messages: { fetch: (id: string) => Promise<{ edit: (p: unknown) => Promise<unknown> }> } }).messages;
      const msg = await messages.fetch(messageId);
      await msg.edit({
        embeds: [
          {
            description: embed.description,
            color: embed.color,
            footer: embed.footer,
          },
        ],
        allowedMentions: outboundAllowedMentions({ repliedUser: true }),
      });
      return true;
    } catch (err) {
      console.error("[discord] editEmbed failed:", err);
      return false;
    }
  };

  handlers.editMessage = async ({
    channelId,
    messageId,
    content,
    embed,
    components,
    mentionUserIds,
  }) => {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !("messages" in channel)) return false;
      const messages = (
        channel as {
          messages: {
            fetch: (id: string) => Promise<{ edit: (p: unknown) => Promise<unknown> }>;
          };
        }
      ).messages;
      const msg = await messages.fetch(messageId);
      // REQ-discord-205: an edit parses no mentions either.
      const payload: Record<string, unknown> = {
        allowedMentions: outboundAllowedMentions({
          users: mentionUserIds,
          repliedUser: true,
        }),
      };
      if (content === null) payload.content = null;
      else if (content !== undefined) {
        payload.content = defangMassMentions(content).slice(0, 1900);
      }
      if (embed === null) payload.embeds = [];
      else if (embed) {
        payload.embeds = [
          {
            description: embed.description,
            color: embed.color,
            footer: embed.footer,
          },
        ];
      }
      if (components === null) payload.components = [];
      else if (components) payload.components = components;
      await msg.edit(payload);
      return true;
    } catch (err) {
      console.error("[discord] editMessage failed:", err);
      return false;
    }
  };

  handlers.sendDm = async ({ userId, content, components }) => {
    try {
      const user = await client.users.fetch(userId);
      // REQ-discord-205: a DM parses no mentions either.
      const sent = await user.send({
        content: defangMassMentions(content).slice(0, 1900),
        ...(components?.length ? { components: components as never } : {}),
        allowedMentions: outboundAllowedMentions(),
      });
      return { channelId: sent.channelId, messageId: sent.id };
    } catch (err) {
      console.error("[discord] direct message failed:", err instanceof Error ? err.message : err);
      return null;
    }
  };

  handlers.deleteMessage = async ({ channelId, messageId }) => {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !("messages" in channel)) return false;
      const messages = (
        channel as {
          messages: {
            fetch: (id: string) => Promise<{ delete: () => Promise<unknown> }>;
          };
        }
      ).messages;
      const msg = await messages.fetch(messageId);
      await msg.delete();
      return true;
    } catch (err) {
      console.error("[discord] deleteMessage failed:", err);
      return false;
    }
  };

  return gateway;
}



/** discord.js MessageComponent interaction → `ComponentInteraction` (DISCORD-ASK). */
export function adaptComponent(interaction: {
  id: string;
  customId: string;
  channelId: string;
  guildId: string | null;
  user: { id: string };
  member?: { roles?: RawMemberRoles } | null;
  message?: { id?: string };
  deferred: boolean;
  replied: boolean;
  reply: (opts: unknown) => Promise<unknown>;
  update: (opts: unknown) => Promise<unknown>;
  deleteReply?: () => Promise<unknown>;
} & ComponentActorSource): ComponentInteraction {
  return {
    id: interaction.id,
    customId: interaction.customId,
    channelId: interaction.channelId,
    guildId: interaction.guildId ?? undefined,
    userId: interaction.user.id,
    roleIds: interactionRoleIds(interaction.member),
    messageId: interaction.message?.id,
    reply: async (opts) => {
      // REQ-discord-205: component replies/updates parse no mentions.
      const payload: Record<string, unknown> = {
        allowedMentions: outboundAllowedMentions(),
      };
      if (opts.content !== undefined) {
        payload.content = defangMassMentions(opts.content).slice(0, 1900);
      }
      // Explicit empty array clears buttons (DISCORD-ASK-8); do not use truthiness.
      if (opts.components !== undefined) {
        payload.components = opts.components as never;
      }
      if (opts.update) {
        await interaction.update(payload);
        return;
      }
      if (opts.ephemeral) {
        // MessageFlags.Ephemeral (64) — avoid deprecated ephemeral: true warning.
        payload.flags = 64;
      }
      if (interaction.deferred || interaction.replied) {
        // Already acknowledged — follow-up style via reply() still works for ephemeral.
        await interaction.reply(payload);
      } else {
        await interaction.reply(payload);
      }
    },
    deleteReply: async () => {
      if (typeof interaction.deleteReply === "function") {
        await interaction.deleteReply();
      }
    },
    // IDENTITY-4 — the presser's names, so a button-pick resume injects them
    // like a chat message (REQ-discord-446).
    ...componentActorNames(interaction),
  };
}

/** Fixture-friendly subset of a discord.js component interaction's presser. */
export type ComponentActorSource = {
  user: {
    id: string;
    username?: string | null;
    globalName?: string | null;
    displayName?: string | null;
  };
  member?: {
    displayName?: string | null;
    nickname?: string | null;
  } | null;
};

/**
 * IDENTITY-4 / REQ-discord-446 — the presser's Discord display name (guild
 * member display, then nickname, then global name, then user display, as for
 * slash) and username, trimmed; a blank or missing name stays undefined.
 */
export function componentActorNames(
  interaction: ComponentActorSource,
): Pick<ComponentInteraction, "userDisplayName" | "userUsername"> {
  const display =
    (interaction.member?.displayName ??
      interaction.member?.nickname ??
      interaction.user.globalName ??
      interaction.user.displayName ??
      undefined)?.trim() || undefined;
  const username = interaction.user.username?.trim() || undefined;
  return { userDisplayName: display, userUsername: username };
}

/** Discord autocomplete deadline is 3s; skip stale replies (corvid-agent pattern). */
const AUTOCOMPLETE_DEADLINE_MS = 2500;

type ChannelTypeEnum = { GuildText: number };

/**
 * Live autocomplete for STRING channel options on /admin channels add|remove
 * and /announce channel. Lists guild text channels from cache (Guilds intent);
 * remove scopes to the live allowlist when provided.
 *
 * DISCORD-DENY-3 / ADMIN-4 / REQ-discord-431: Discord shows these options to
 * every guild member, so each request is re-checked here. Unless
 * `handlers.mayAutocompleteChannels` says this invoker is ADMIN in an
 * allowlisted channel, the answer is an empty choice list: no channel names,
 * ids or allowlist entries leak.
 */
export async function respondChannelAutocomplete(
  interaction: {
    commandName: string;
    createdTimestamp: number;
    channelId: string;
    user: { id: string };
    member?: RawInteractionMember;
    guild: {
      channels: {
        cache: { values: () => IterableIterator<{ id: string; name: string; type: number }> };
      };
    } | null;
    options: {
      getFocused: (full?: boolean) => { name: string; value: string | number } | string;
      getSubcommand: (required?: boolean) => string | null;
      getSubcommandGroup?: (required?: boolean) => string | null;
    };
    respond: (choices: { name: string; value: string }[]) => Promise<unknown>;
  },
  handlers: GatewayHandlers,
  ChannelType: ChannelTypeEnum,
): Promise<void> {
  const started = interaction.createdTimestamp;
  // Fail closed: no gate wired, a refusal or a throwing gate ⇒ no choices.
  let allowed = false;
  try {
    allowed =
      handlers.mayAutocompleteChannels?.({
        commandName: interaction.commandName,
        channelId: interaction.channelId,
        userId: interaction.user.id,
        roleIds: interactionRoleIds(interaction.member),
      }) === true;
  } catch (err) {
    console.error("[discord] autocomplete gate failed:", err);
  }
  if (!allowed) {
    try {
      await interaction.respond([]);
    } catch (err) {
      console.error("[discord] autocomplete respond failed:", err);
    }
    return;
  }
  let choices: { name: string; value: string }[] = [];
  try {
    const focusedRaw = interaction.options.getFocused(true);
    const focused =
      typeof focusedRaw === "string"
        ? { name: "channel", value: focusedRaw }
        : focusedRaw;
    if (!focused || focused.name !== "channel") {
      await interaction.respond([]);
      return;
    }
    const query = String(focused.value ?? "");
    let group: string | null = null;
    let sub: string | null = null;
    try {
      group = interaction.options.getSubcommandGroup?.(false) ?? null;
    } catch {
      /* no group */
    }
    try {
      sub = interaction.options.getSubcommand(false);
    } catch {
      /* no sub */
    }

    const guild = interaction.guild;
    const candidates: ChannelCandidate[] = [];
    if (guild?.channels?.cache) {
      for (const ch of guild.channels.cache.values()) {
        if (ch.type === ChannelType.GuildText) {
          candidates.push({ id: ch.id, name: ch.name ?? "", type: ch.type });
        }
      }
    }

    const isRemove =
      interaction.commandName === "admin" && group === "channels" && sub === "remove";
    const allowlisted = handlers.getAllowlistedChannelIds?.() ?? [];
    const opts = isRemove
      ? { idAllowlist: allowlisted, textOnly: true as const }
      : { textOnly: true as const };

    // If remove allowlist is empty, still offer nothing useful rather than all channels.
    if (isRemove && allowlisted.length === 0) {
      choices = [];
    } else {
      choices = buildChannelAutocompleteChoices(candidates, query, opts);
    }
  } catch (err) {
    console.error("[discord] autocomplete build failed:", err);
    choices = [];
  }

  if (Date.now() - started >= AUTOCOMPLETE_DEADLINE_MS) {
    console.warn("[discord] autocomplete skipped (deadline exceeded)");
    return;
  }
  try {
    await interaction.respond(choices);
  } catch (err) {
    console.error("[discord] autocomplete respond failed:", err);
  }
}

/** No-op gateway for dry-run / missing-token paths that still want orchestration tests. */
export function createNullGateway(): DiscordGateway {
  return {
    botUserId: null,
    async start() {
      /* no-op */
    },
    async stop() {
      /* no-op */
    },
  };
}
