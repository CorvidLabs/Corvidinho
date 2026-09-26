/**
 * HEAR bridge orchestrator: gateway → message-router → session stub + agent spawn.
 * DISCORD-3: edit-in-place thinking status while agent runs (no ProcessManager).
 * DISCORD-4: thin slash /session /status /agents /work.
 * DISCORD-6: per-user rate limits + mutes.
 * DISCORD-9: image attachments → local files for agent.
 * DISCORD-10: Merlin-shaped protocol-version lockstep.
 */

import type { AgentClient } from "./agent-client.ts";
import {
  createEchoAgentClient,
  createSpawnAgentClient,
} from "./agent-client.ts";
import {
  goLiveChecklist,
  loadBridgeConfig,
  type ConfigResult,
} from "./config.ts";
import {
  createLiveGateway,
  createNullGateway,
  type DiscordGateway,
  type GatewayHandlers,
} from "./gateway.ts";
import { enrichPromptWithImages } from "./image-attachments.ts";
import { routeMessage } from "./message-router.ts";
import {
  defaultRateLimitConfig,
  muteUser as muteUserImpl,
  unmuteUser as unmuteUserImpl,
  type RateLimitState,
} from "./permissions.ts";
import { CORVIDINHO_PROTOCOL_VERSION } from "./protocol-version.ts";
import { enforceProtocolVersionOrExit } from "./protocol-version.ts";
import { SessionStore } from "./session-store.ts";
import { handleSlashInteraction } from "./slash-dispatch.ts";
import type { SlashContext } from "./slash-types.ts";
import {
  ThinkingStatus,
  type ThinkingOutbound,
} from "./thinking-status.ts";
import type { BridgeConfig, InboundMessage } from "./types.ts";
import { WorkStore } from "./work-store.ts";
import { VERSION as PACKAGE_VERSION, tryGitTipShortSha } from "../version.ts";

export type StartBridgeResult =
  | {
      ok: true;
      config: BridgeConfig;
      store: SessionStore;
      workStore: WorkStore;
      mutedUsers: Set<string>;
      rateLimitState: RateLimitState;
      muteUser: (userId: string) => void;
      unmuteUser: (userId: string) => void;
      stop: () => Promise<void>;
    }
  | { ok: false; exitCode: number; message: string };

export type StartBridgeOptions = {
  env?: NodeJS.ProcessEnv;
  projectRoot?: string;
  /** Inject agent client (tests). */
  agent?: AgentClient;
  /** Inject gateway factory (tests). */
  gatewayFactory?: (
    config: BridgeConfig,
    handlers: GatewayHandlers,
  ) => Promise<DiscordGateway>;
  /** Skip protocol handshake (unit tests). */
  skipProtocolCheck?: boolean;
  /**
   * Override thinking outbound (tests). When omitted, uses gateway
   * sendEmbed/editEmbed; if those are missing, uses a memory outbound.
   */
  thinkingOutbound?: ThinkingOutbound;
  /** ThinkingStatus debounce/tick (tests may shrink). */
  thinkingDebounceMs?: number;
  thinkingTickMs?: number;
  /** Override bridge startedAt (tests). */
  startedAt?: number;
  version?: string;
};

function memoryThinkingOutbound(): ThinkingOutbound & {
  sends: Array<{ channelId: string; embed: unknown; replyToMessageId?: string; messageId: string }>;
  edits: Array<{ channelId: string; messageId: string; embed: unknown }>;
} {
  let n = 0;
  const sends: Array<{
    channelId: string;
    embed: unknown;
    replyToMessageId?: string;
    messageId: string;
  }> = [];
  const edits: Array<{ channelId: string; messageId: string; embed: unknown }> =
    [];
  return {
    sends,
    edits,
    async sendEmbed({ channelId, embed, replyToMessageId }) {
      n += 1;
      const messageId = `progress_${n}`;
      sends.push({ channelId, embed, replyToMessageId, messageId });
      return { messageId };
    },
    async editEmbed({ channelId, messageId, embed }) {
      edits.push({ channelId, messageId, embed });
      return true;
    },
  };
}

/**
 * Start the Discord HEAR bridge. Clean exit semantics when token/channels missing.
 */
export async function startBridge(
  opts: StartBridgeOptions = {},
): Promise<StartBridgeResult> {
  const loaded: ConfigResult = await loadBridgeConfig({
    env: opts.env,
    projectRoot: opts.projectRoot,
  });

  if (!loaded.ok) {
    const extra =
      loaded.code === "missing_token" || loaded.code === "empty_channels"
        ? `\n\n${goLiveChecklist()}`
        : "";
    return {
      ok: false,
      exitCode: 1,
      message: `${loaded.message}${extra}`,
    };
  }

  const config = loaded.config;
  const store = new SessionStore();
  const workStore = new WorkStore();
  const mutedUsers = new Set<string>(config.mutedUserIds);
  const rateLimitState: RateLimitState = { userMessageTimestamps: new Map() };
  const rateLimitConfig = defaultRateLimitConfig({
    windowMs: config.rateLimitWindowMs,
    maxMessages: config.rateLimitMaxMessages,
    rateLimitByLevel: config.rateLimitByLevel,
  });
  const startedAt = opts.startedAt ?? Date.now();
  const version = opts.version ?? PACKAGE_VERSION;
  const agent =
    opts.agent ??
    (config.dryRun
      ? createEchoAgentClient()
      : createSpawnAgentClient({
          bin: config.corvidinhoBin,
          cwd: config.projectRoot,
        }));

  if (!opts.skipProtocolCheck && !config.dryRun) {
    await enforceProtocolVersionOrExit(config.corvidinhoBin);
  }

  const replyRef: {
    fn?: GatewayHandlers["reply"];
  } = {};
  const embedRef: {
    send?: GatewayHandlers["sendEmbed"];
    edit?: GatewayHandlers["editEmbed"];
  } = {};

  const fallbackOutbound = memoryThinkingOutbound();

  function resolveOutbound(): ThinkingOutbound {
    return (
      opts.thinkingOutbound ??
      (embedRef.send && embedRef.edit
        ? {
            sendEmbed: embedRef.send,
            editEmbed: embedRef.edit,
          }
        : fallbackOutbound)
    );
  }

  const gitTipSha = tryGitTipShortSha(config.projectRoot);

  function buildSlashCtx(): SlashContext {
    return {
      store,
      workStore,
      allowlist: config.allowlist,
      agent,
      version,
      protocolVersion: CORVIDINHO_PROTOCOL_VERSION,
      startedAt,
      channelIds: config.channelIds,
      thinkingOutbound: resolveOutbound(),
      thinkingDebounceMs: opts.thinkingDebounceMs,
      thinkingTickMs: opts.thinkingTickMs,
      mutedUsers,
      rateLimitState,
      rateLimitConfig,
      adminUserIds: config.adminUserIds,
      adminRoleIds: config.adminRoleIds,
      env: opts.env,
      gitTipSha,
    };
  }

  const handlers: GatewayHandlers = {
    onMessage: async (msg: InboundMessage) => {
      const action = routeMessage(msg, {
        store,
        allowlist: config.allowlist,
        channelOnlyGate: true,
        mutedUsers,
        rateLimit: { state: rateLimitState, config: rateLimitConfig },
      });

      if (action.kind === "ignore") return;

      if (action.kind === "refuse") {
        if (action.reply && replyRef.fn) {
          await replyRef.fn({
            channelId: msg.threadId ?? msg.channelId,
            content: action.reply,
            replyToMessageId: msg.id,
          });
        }
        return;
      }

      const { session, prompt } = action;
      const channelId = msg.threadId ?? msg.channelId;

      // DISCORD-9 — download attachments to local files the agent can open.
      const enrichedPrompt = await enrichPromptWithImages(
        prompt,
        msg.attachments,
        { messageId: msg.id },
      );

      const outbound = resolveOutbound();

      const thinking = new ThinkingStatus({
        outbound,
        channelId,
        replyToMessageId: msg.id,
        sessionId: session.id,
        debounceMs: opts.thinkingDebounceMs,
        tickMs: opts.thinkingTickMs,
      });

      await thinking.start({ description: "Working on your request..." });

      let result;
      try {
        result = await agent.runChat({
          prompt: enrichedPrompt,
          sessionId: session.id,
          resume: action.kind === "continue_session",
          onStatus: (u) => {
            void thinking.update({
              tool: u.tool,
              tokens: u.tokens,
              description: u.message ? `⏳ ${u.message}` : undefined,
            });
          },
        });
      } catch (err) {
        await thinking.fail(
          `❌ ${err instanceof Error ? err.message : "agent error"}`,
        );
        throw err;
      }

      if (result.ok) {
        await thinking.done("✅ Done");
      } else {
        await thinking.fail(`❌ exit ${result.exitCode}`);
      }

      const body = result.ok
        ? result.summary.slice(0, 1800)
        : `session ${session.id} failed (exit ${result.exitCode})`;

      if (replyRef.fn) {
        const sent = await replyRef.fn({
          channelId,
          content: body,
          replyToMessageId: msg.id,
        });
        if (sent?.messageId) {
          store.trackBotMessage(sent.messageId, session);
        }
      } else {
        // Dry / test: synthesize bot message id so reply continuity can be tested.
        store.trackBotMessage(`bot_reply_for_${msg.id}`, session);
      }
    },
    onSlash: async (interaction) => {
      await handleSlashInteraction(buildSlashCtx(), interaction);
    },
    onReady: (id) => {
      console.log(`[discord] bot user id ${id}; monitoring ${config.channelIds.length} channel(s)`);
    },
  };

  const factory =
    opts.gatewayFactory ??
    (async (cfg, h) => {
      if (cfg.dryRun) return createNullGateway();
      const gw = await createLiveGateway(cfg, h);
      replyRef.fn = h.reply;
      embedRef.send = h.sendEmbed;
      embedRef.edit = h.editEmbed;
      return gw;
    });

  const gateway = await factory(config, handlers);
  // If factory is createLiveGateway-like, reply is set inside; for custom, allow handlers.reply
  if (handlers.reply) replyRef.fn = handlers.reply;
  if (handlers.sendEmbed) embedRef.send = handlers.sendEmbed;
  if (handlers.editEmbed) embedRef.edit = handlers.editEmbed;

  await gateway.start();
  console.log(
    "[discord] HEAR bridge ready (session stub + thinking status + slash + rate/mute; no ProcessManager).",
  );

  return {
    ok: true,
    config,
    store,
    workStore,
    mutedUsers,
    rateLimitState,
    muteUser: (userId: string) => muteUserImpl(mutedUsers, userId),
    unmuteUser: (userId: string) => unmuteUserImpl(mutedUsers, userId),
    stop: async () => {
      await gateway.stop();
    },
  };
}

export { goLiveChecklist, loadBridgeConfig, memoryThinkingOutbound };
