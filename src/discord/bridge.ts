/**
 * HEAR bridge orchestrator: gateway → message-router → session stub + agent spawn.
 * DISCORD-3: edit-in-place thinking status while agent runs (no ProcessManager).
 * DISCORD-4: thin slash /session /status /agents /work.
 * DISCORD-SCHEDULE: /schedule + cooperative ticker (single-project).
 * SESSION-WORKTREE: per-talk/project git worktree isolation.
 * DISCORD-6: per-user rate limits + mutes.
 * DISCORD-9: image attachments → local files for agent.
 * MEMORY: auto-recall inject on spawn (AGENT-7 / MEMORY-2/4).
 * DISCORD-10: Merlin-shaped protocol-version lockstep.
 * DISCORD-12: presence/custom status shows shared package version.
 * DISCORD-ANNOUNCE: /announce + bridge-live note to dedicated channel only.
 * ADMIN-1..4: /admin edits the allowlist file + live allowlist (owner only).
 * AUTONOMY-1/2: a run that needs a human replies with its question and
 * pings the configured owner (ask-ping.ts).
 */

import type { AgentClient } from "./agent-client.ts";
import {
  createEchoAgentClient,
  createSpawnAgentClient,
} from "./agent-client.ts";
import { ASK_NO_OWNER_WARNING, formatAskReply } from "./ask-ping.ts";
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
import { enrichPromptWithMemories } from "./memory-inject.ts";
import { routeMessage } from "./message-router.ts";
import {
  defaultRateLimitConfig,
  muteUser as muteUserImpl,
  unmuteUser as unmuteUserImpl,
  PermissionLevel,
  resolvePermissionLevel,
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
import { openCorvidinhoDb, resolveSessionTtlMs } from "../store/index.ts";
import {
  appendAudit,
  auditKeyFromEnv,
  formatAuditLine,
  verifyAudit,
  type AuditEntryInput,
} from "../audit/index.ts";
import { MemoryStore } from "../memory/index.ts";
import {
  ScheduleStore,
  SchedulerService,
} from "../scheduler/index.ts";
import type { Database } from "bun:sqlite";
import { VERSION as PACKAGE_VERSION, tryGitTipShortSha } from "../version.ts";
import { AnnounceStore } from "./announce-store.ts";
import {
  formatBridgeLiveAnnouncement,
  postAnnouncement,
} from "./announce.ts";

export type StartBridgeResult =
  | {
      ok: true;
      config: BridgeConfig;
      store: SessionStore;
      workStore: WorkStore;
      scheduleStore: ScheduleStore;
      memoryStore?: MemoryStore;
      announceStore?: AnnounceStore;
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
  /**
   * Shared SQLite DB for SessionStore/WorkStore/MemoryStore (REQ-discord-019/021).
   * When omitted, opens the default Corvidinho DB (or :memory: when dryRun
   * and CORVIDINHO_SESSION_MEMORY=1 for tests).
   */
  db?: Database;
  /** Soft TTL override (tests). */
  sessionTtlMs?: number;
  /** Inject stores (tests); when set, skips DB open. */
  sessionStore?: SessionStore;
  workStore?: WorkStore;
  scheduleStore?: ScheduleStore;
  /** MEMORY store (REQ-discord-021); default opens from shared db. */
  memoryStore?: MemoryStore;
  /** DISCORD-ANNOUNCE store; default opens from shared db. */
  announceStore?: AnnounceStore;
  /** Disable cooperative scheduler ticker (tests). */
  disableScheduler?: boolean;
  /** Scheduler poll interval override (tests). */
  schedulerPollIntervalMs?: number;
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
  if (config.adminUserIds.length > 0 || config.adminRoleIds.length > 0) {
    // IDENTITY-2 (Leif decision on #42): ADMIN is owner-only.
    console.warn(
      "[discord] CORVIDINHO_DISCORD_ADMIN_USERS/_ROLES are ignored — ADMIN is owner-only (IDENTITY-2). Set CORVIDINHO_OWNER_DISCORD_ID or [owner] in the allowlist file.",
    );
  }
  if (!config.owner) {
    console.warn("[discord] no owner configured — nobody is ADMIN (IDENTITY-3).");
  }
  const env = opts.env ?? process.env;
  const db =
    opts.db ??
    (opts.sessionStore || opts.workStore
      ? undefined
      : openCorvidinhoDb(
          // dry-run without explicit data dir stays in-memory so tests do not
          // touch ~/.local/share/corvidinho; set CORVIDINHO_DATA_DIR to exercise file DB.
          config.dryRun && !env.CORVIDINHO_DATA_DIR?.trim()
            ? { memory: true }
            : { env },
        ));
  const ttlMs = opts.sessionTtlMs ?? resolveSessionTtlMs(env);
  const store =
    opts.sessionStore ??
    new SessionStore({
      db,
      ttlMs,
      defaultProjectRoot: config.projectRoot,
    });
  const workStore = opts.workStore ?? new WorkStore({ db });
  if (!opts.workStore && db) {
    // SESSION-WORKTREE-3: work left running by a dead process is failed
    // honestly and its abandoned talk ended (worktree parked, session
    // dropped) so no later talk reuses it as cwd.
    const abandoned = workStore.recoverAbandoned();
    for (const task of abandoned) {
      const session = task.sessionId ? store.get(task.sessionId) : undefined;
      if (session) await store.endSession(session);
    }
    if (abandoned.length > 0) {
      console.log(
        `[discord] restart recovery: ${abandoned.length} abandoned work task(s) marked failed`,
      );
    }
  }
  const scheduleStore =
    opts.scheduleStore ?? new ScheduleStore({ db });
  const memoryStore =
    opts.memoryStore ?? (db ? new MemoryStore({ db }) : undefined);
  const announceStore =
    opts.announceStore ?? (db ? new AnnounceStore(db) : undefined);
  // SAFE-5: verify the tamper-evident audit chain at start; /status repeats it.
  const auditLine = db
    ? () => formatAuditLine(verifyAudit(db, auditKeyFromEnv(env)))
    : undefined;
  if (auditLine) console.log(`[discord] ${auditLine()}`);
  // SAFE-5: /admin mutations append to the same chain (fail closed on error).
  const recordAudit = db
    ? (entry: AuditEntryInput) =>
        appendAudit(db, entry, { key: auditKeyFromEnv(env) })
    : undefined;
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
      scheduleStore,
      memoryStore,
      announceStore,
      auditLine,
      recordAudit,
      // Same object/arrays as the router + scheduler: /admin splices in place.
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
      owner: config.owner ?? null,
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
      let enrichedPrompt = await enrichPromptWithImages(
        prompt,
        msg.attachments,
        { messageId: msg.id },
      );

      // AGENT-7 / MEMORY-2/4 — auto-recall inject for acting Discord user.
      const memInject = enrichPromptWithMemories(enrichedPrompt, memoryStore, {
        ownerUserId: msg.authorId,
      });
      if (memInject.injected) {
        console.log(
          `[discord] memory inject: ${memInject.count} recalled for user ${msg.authorId}`,
        );
        enrichedPrompt = memInject.prompt;
      }

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

      // SESSION-WORKTREE: bind isolated cwd on start; reuse on continue (no silent switch).
      if (action.kind === "start_session" || !session.worktreePath) {
        const bound = await store.bindWorktree(session);
        if (!bound.ok) {
          await thinking.fail(`❌ worktree: ${bound.error}`);
          if (replyRef.fn) {
            await replyRef.fn({
              channelId,
              content: `Could not isolate worktree for session \`${session.id}\`: ${bound.error}`,
              replyToMessageId: msg.id,
            });
          }
          await store.endSession(session);
          return;
        }
      }

      let result;
      try {
        const actingIsAdmin =
          resolvePermissionLevel({
            userId: msg.authorId,
            roleIds: msg.authorRoleIds,
            allowlist: config.allowlist,
            adminUserIds: config.adminUserIds,
            adminRoleIds: config.adminRoleIds,
            owner: config.owner ?? null,
            mutedUsers,
          }) >= PermissionLevel.ADMIN;
        result = await agent.runChat({
          prompt: enrichedPrompt,
          // Raw human text (before memory/image enrichment) — the only
          // source of SAFE-4 confirm tokens.
          humanText: prompt,
          sessionId: session.id,
          resume: action.kind === "continue_session",
          actingUserId: msg.authorId,
          actingIsAdmin,
          cwd: store.cwdFor(session),
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

      // AUTONOMY-1/2: needs a human → question to the requester + owner ping.
      const ask = result.ask
        ? formatAskReply({
            ask: result.ask,
            owner: config.owner,
            context: result.summary,
            replyHint: true,
          })
        : null;
      if (ask) {
        await (ask.failed ? thinking.fail(ask.status) : thinking.done(ask.status));
        if (!ask.ownerPinged) console.warn(ASK_NO_OWNER_WARNING);
      } else if (result.ok) {
        await thinking.done("✅ Done");
      } else {
        await thinking.fail(`❌ exit ${result.exitCode}`);
      }

      const body = ask
        ? ask.content
        : result.ok
        ? result.summary.slice(0, 1800)
        : `session ${session.id} failed (exit ${result.exitCode})`;

      if (replyRef.fn) {
        const sent = await replyRef.fn({
          channelId,
          content: body,
          replyToMessageId: msg.id,
          ...(ask ? { mentionUserIds: ask.mentionUserIds } : {}),
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
      // DISCORD-ANNOUNCE-4 — post bridge-live note only to configured announce channel.
      if (announceStore && replyRef.fn) {
        const note = formatBridgeLiveAnnouncement(version);
        void postAnnouncement(announceStore, replyRef.fn, note).then((r) => {
          if (r.ok) {
            console.log(`[discord] announce posted to ${r.channelId}: ${note}`);
          } else if (r.reason === "not_configured") {
            console.log("[discord] announce channel not set — skipping bridge-live note");
          } else {
            console.warn(`[discord] announce post skipped: ${r.reason}`);
          }
        });
      }
    },
  };

  const factory =
    opts.gatewayFactory ??
    (async (cfg, h) => {
      if (cfg.dryRun) return createNullGateway();
      const gw = await createLiveGateway(cfg, h, { version });
      replyRef.fn = h.reply;
      embedRef.send = h.sendEmbed;
      embedRef.edit = h.editEmbed;
      return gw;
    });

  let scheduler: SchedulerService | null = null;
  if (!opts.disableScheduler) {
    scheduler = new SchedulerService({
      store: scheduleStore,
      agent,
      allowlist: config.allowlist,
      pollIntervalMs: opts.schedulerPollIntervalMs,
      defaultProjectRoot: config.projectRoot,
      owner: config.owner ?? null,
      outbound: {
        post: async ({ channelId, content, mentionUserIds }) => {
          if (replyRef.fn) {
            await replyRef.fn({ channelId, content, mentionUserIds });
          }
        },
      },
      // Start after gateway is up; construct with manual then start below.
      manual: true,
    });
  }

  const gateway = await factory(config, handlers);
  // If factory is createLiveGateway-like, reply is set inside; for custom, allow handlers.reply
  if (handlers.reply) replyRef.fn = handlers.reply;
  if (handlers.sendEmbed) embedRef.send = handlers.sendEmbed;
  if (handlers.editEmbed) embedRef.edit = handlers.editEmbed;

  await gateway.start();
  scheduler?.start();
  console.log(
    "[discord] HEAR bridge ready (session stub + thinking status + slash + schedule ticker + announce + rate/mute; no ProcessManager).",
  );

  return {
    ok: true,
    config,
    store,
    workStore,
    scheduleStore,
    memoryStore,
    announceStore,
    mutedUsers,
    rateLimitState,
    muteUser: (userId: string) => muteUserImpl(mutedUsers, userId),
    unmuteUser: (userId: string) => unmuteUserImpl(mutedUsers, userId),
    stop: async () => {
      scheduler?.stop();
      await gateway.stop();
    },
  };
}

export { goLiveChecklist, loadBridgeConfig, memoryThinkingOutbound };
