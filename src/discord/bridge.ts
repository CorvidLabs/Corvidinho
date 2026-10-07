/**
 * HEAR bridge orchestrator: gateway → message-router → session stub + agent spawn.
 * DISCORD-3: edit-in-place thinking status while agent runs (no ProcessManager);
 * a reply a dead process left frozen is marked interrupted on the next start
 * (inflight-replies.ts, REQ-discord-311).
 * DISCORD-4: thin slash /session /status /agents /work.
 * DISCORD-SCHEDULE: /schedule + cooperative ticker (single-project).
 * SESSION-WORKTREE: per-talk/project git worktree isolation.
 * DISCORD-6: per-user rate limits + mutes.
 * DISCORD-9: image attachments → local files for agent.
 * MEMORY: auto-recall inject on spawn (AGENT-7 / MEMORY-2/4).
 * DISCORD-10: Merlin-shaped protocol-version lockstep.
 * DISCORD-12: presence/custom status shows shared package version.
 * DISCORD-ANNOUNCE: /announce + bridge-live note to dedicated channel only
 *   (PERSONA-1.a: a short in-voice note linking the release notes).
 * ADMIN-1..4: /admin edits the allowlist file + live allowlist (owner only).
 * AUTONOMY-1/2/4..6: ask replies ping requester (clarify) or owner (stuck);
 * thin acks restate pending asks; cancel clears (ask-ping.ts / thin-ack.ts).
 * A /work or /session start answer is tracked too, so its ask is answered
 * the same way (command-handlers/work.ts, session.ts).
 * DISCORD-ASK: ephemeral button asks; ASK-6/7 collapse; ASK-8 clear ephemeral after pick;
 * a press passes channel → actor → mute/rate first (REQ-discord-212/201/010);
 * AGENT-3.a: a run's progress message carries a Stop button (`cvstop:<runId>`)
 * that its requester or the owner presses to stop it, past the same gates
 * (REQ-discord-303);
 * ASK-4.a: a free-text ask's Answer button opens a private form whose submit
 * takes the same gates and resumes like a reply (a reply still works);
 * SESSION-MULTI: per-user sessions.
 * MEMORY-7.a: a run's private replies (private notes, a profile, the owner's
 * view of someone's memory) go to the asker by DM only (private-reply.ts).
 * AGENT-6: each run is recorded with its session and a continued run gets the
 * earlier turns replayed ahead of the new message (session-thread.ts),
 * condensed at about 80% of the model's window (SESSION-5/6); an expired
 * session's conversation is kept 30 days so a reply resumes it (SESSION-3.a,
 * AGENT-6.a; src/store/conversation.ts).
 * PLUGIN-5 / PLUGIN-5.a (REQ-discord-157): `[corvidinho.plugins]` `work` /
 * `schedule` (the install root's fledge.toml and the owner's allowlist file,
 * src/autonomous/enabled.ts) are read fresh for every slash command, every
 * reply or button press that would resume a /work talk, and every scheduler
 * tick. While `work` is off such a reply or press gets the fixed turned-off
 * line and runs nothing; a run in flight is not stopped and stays stoppable.
 * While `schedule` is off the ticker claims no run (its other jobs go on).
 */

import type { AgentClient } from "./agent-client.ts";
import {
  createEchoAgentClient,
  createSpawnAgentClient,
} from "./agent-client.ts";
import { ASK_NO_OWNER_WARNING, formatAskReply } from "./ask-ping.ts";
import {
  ASK_ANSWER_ACK,
  ASK_ANSWER_INPUT_ID,
  ASK_CHOICE_EXPIRED,
  answerAskFor,
  buildAnswerModal,
  buildAnswerStubComponents,
  buildChoiceComponents,
  buildOpenStubComponents,
  findOptionLabel,
  formatAskEphemeralContent,
  formatAskStub,
  askExpiresAt,
  isAskExpired,
  normalizeAskAnswer,
  parseAskCustomId,
  toPendingAsk,
  type PendingAsk,
} from "./ask-buttons.ts";
import { resolveAskOptions } from "../agent/ask-options.ts";
import { handleScheduleAskPress, isScheduleAskId } from "./schedule-ask.ts";
import {
  ASK_CANCELLED_ACK,
  isCancelAsk,
  isThinAck,
} from "./thin-ack.ts";
import {
  goLiveChecklist,
  loadBridgeConfig,
  type ConfigResult,
} from "./config.ts";
import {
  createLiveGateway,
  createNullGateway,
  type ComponentInteraction,
  type DiscordGateway,
  type GatewayHandlers,
} from "./gateway.ts";
import {
  appendAttachmentUrls,
  attachmentCacheDir,
  enrichPromptWithImages,
  sessionAttachmentDir,
} from "./image-attachments.ts";
import { enrichPromptWithIdentity } from "./identity-inject.ts";
import {
  INJECTION_NO_OWNER_WARNING,
  auditInboundInjection,
  fenceSpeakerText,
  formatInjectionRefusal,
  inboundInjection,
  refuseInjectedAnswer,
  withInjectionNotice,
} from "./injection-guard.ts";
import { loadDeclaredPeople } from "../identity/people.ts";
import { enrichPromptWithMemories, memoryInjectOptsFor } from "./memory-inject.ts";
import { parseApproveCardCustomId } from "./approve-card.ts";
import {
  APPROVAL_POLL_MS,
  APPROVAL_UNKNOWN_KIND,
  createApprovalCards,
  memoryApprovalKind,
  mustAskApprovalKinds,
  type ApprovalDeliveryResult,
} from "./approval-cards.ts";
import { forgetApprovalKind } from "./forget-card.ts";
import { hiCaptureApprovalKind } from "./hi-card.ts";
import { spendApprovalKind } from "./spend-card.ts";
import {
  createPublicReplyGate,
  publicReplyApprovalKind,
  publicReplyNotPostedText,
  type PublicReplyOutcome,
} from "./public-reply-gate.ts";
import { createWatchAskDelivery } from "./watch-ask.ts";
import { clearBridgeRunning, markBridgeRunning } from "../watch/owner-ask.ts";
import { deliverPrivateReplies, withPrivateNote } from "./private-reply.ts";
import {
  DISCORD_ANSWER_MAX,
  answerModelFor,
  answerSpendFor,
  postAnswerParts,
} from "./rich-reply.ts";
import { isOwnerDiscord, loadOwnerConfig } from "../identity/owner.ts";
import { createFailureOwnerDm, failedRunReply } from "./failure-reason.ts";
import { formatTaskPlumbing } from "../agent/task-summary.ts";
import { loadLlmEnv } from "../agent/execute.ts";
import { providerNotice } from "../agent/providers.ts";
import {
  componentChannelAllowlisted,
  promptBodyForAskGate,
  routeMessage,
  waitedMessageStillAllowed,
  waitedPressStillAllowed,
} from "./message-router.ts";
import {
  defaultRateLimitConfig,
  gateActor,
  gateChannel,
  gateRateOrMute,
  isMonitoredConversation,
  muteUser as muteUserImpl,
  unmuteUser as unmuteUserImpl,
  PermissionLevel,
  resolveDiscordActingRole,
  resolvePermissionLevel,
  type RateLimitState,
} from "./permissions.ts";
import { CORVIDINHO_PROTOCOL_VERSION } from "./protocol-version.ts";
import { enforceProtocolVersionOrExit } from "./protocol-version.ts";
import { SessionStore } from "./session-store.ts";
import {
  RUN_STOP_ACK,
  RUN_STOP_NOTHING_RUNNING,
  RUN_STOP_NOT_YOURS,
  RUN_STOPPED_TEXT,
  SessionRunControl,
  buildStopComponents,
  type RunStopReason,
  isStopRunText,
  parseStopRunCustomId,
} from "./run-control.ts";
import { answerTurnText } from "./session-thread.ts";
import { extraOffReply, extraOffText, handleSlashInteraction } from "./slash-dispatch.ts";
import {
  EXTRA_NAMES,
  formatExtraStateLog,
  loadExtrasToggles,
  trackExtraState,
  type ExtraName,
  type ExtraState,
} from "../autonomous/enabled.ts";
import type { SlashContext } from "./slash-types.ts";
import {
  ThinkingStatus,
  type ThinkingOutbound,
} from "./thinking-status.ts";
import {
  ALLOWLIST_DENY_TIP,
  EPHEMERAL_SILENT_ACK,
  type BridgeConfig,
  type InboundMessage,
  type SessionStub,
} from "./types.ts";
import { WorkStore } from "./work-store.ts";
import {
  InflightReplyStore,
  recoverInterruptedReplies,
  type InflightReply,
} from "./inflight-replies.ts";
import { type BackupTicker, consoleBackupLog, createBackupTicker } from "../store/backup.ts";
import {
  openCorvidinhoDb,
  resolveContextWindowTokens,
  resolveSessionTtlMs,
} from "../store/index.ts";
import { formatErrorLine } from "../store/scrub.ts";
import { createScheduleRunStop } from "./schedule-stop.ts";
import {
  appendAudit,
  auditKeyFromEnv,
  formatAuditLine,
  verifyAudit,
  type AuditEntryInput,
} from "../audit/index.ts";
import { ForgetRequestStore, MemoryStore } from "../memory/index.ts";
import {
  ABANDONED_SETTLE_MS,
  ScheduleStore,
  SchedulerService,
} from "../scheduler/index.ts";
import type { Database } from "bun:sqlite";
import { VERSION as PACKAGE_VERSION, tryGitTipShortSha } from "../version.ts";
import { readSpendSnapshot } from "../agent/spend.ts";
import { formatSpendPublicStatusLine, formatSpendStatusLine } from "../agent/spend-notice.ts";
import { createSpendAlertOutbox } from "../agent/spend-outbox.ts";
import { askPingOwner, postCollapsedPing } from "./spend-post.ts";
import { createSpendDm, spendStopFor } from "./spend-dm.ts";
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
      /**
       * SAFE-18..20 / MEMORY-ACL-6: one Approve/Deny card delivery pass
       * (owner cards, expiries, outcome notices) of every card kind — the
       * engine's own poll runs it, and so does each chat message and
       * scheduler tick. Undefined without a DB.
       */
      deliverApprovalCards?: () => Promise<ApprovalDeliveryResult>;
      /** The same pass (MEMORY-ACL-6's name for it). */
      deliverForgetCards?: () => Promise<ApprovalDeliveryResult>;
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
  /** Scheduler (and nightly backup) clock override (tests). */
  schedulerNow?: () => number;
  /**
   * SAFE-18..20: the Approve/Deny card engine's poll interval (default
   * APPROVAL_POLL_MS; ≤ 0 ⇒ no poll; tests).
   */
  approvalPollMs?: number;
};

function memoryThinkingOutbound(): ThinkingOutbound & {
  /** `components`: the progress message's Stop button (AGENT-3.a), when it had one. */
  sends: Array<{
    channelId: string;
    embed: unknown;
    replyToMessageId?: string;
    messageId: string;
    components?: unknown[];
  }>;
  /** `components`: set only when the edit set or cleared them (`null`). */
  edits: Array<{ channelId: string; messageId: string; embed: unknown; components?: unknown[] | null }>;
  contentEdits: Array<{
    channelId: string;
    messageId: string;
    content?: string | null;
    embed?: unknown;
    components?: unknown[] | null;
  }>;
  deletes: Array<{ channelId: string; messageId: string }>;
  posts: Array<{ channelId: string; content: string; embed?: unknown; messageId: string }>;
} {
  let n = 0;
  const sends: Array<{
    channelId: string;
    embed: unknown;
    replyToMessageId?: string;
    messageId: string;
    components?: unknown[];
  }> = [];
  const edits: Array<{
    channelId: string;
    messageId: string;
    embed: unknown;
    components?: unknown[] | null;
  }> = [];
  const contentEdits: Array<{
    channelId: string;
    messageId: string;
    content?: string | null;
    embed?: unknown;
    components?: unknown[] | null;
  }> = [];
  const deletes: Array<{ channelId: string; messageId: string }> = [];
  const posts: Array<{ channelId: string; content: string; embed?: unknown; messageId: string }> =
    [];
  return {
    sends,
    edits,
    contentEdits,
    deletes,
    posts,
    async sendMessage({ channelId, content, embed }) {
      n += 1;
      const messageId = `part_${n}`;
      posts.push({ channelId, content, ...(embed ? { embed } : {}), messageId });
      return { messageId };
    },
    async sendEmbed({ channelId, embed, replyToMessageId, components }) {
      n += 1;
      const messageId = `progress_${n}`;
      sends.push({ channelId, embed, replyToMessageId, messageId, ...(components ? { components } : {}) });
      return { messageId };
    },
    async editEmbed({ channelId, messageId, embed, components }) {
      edits.push({ channelId, messageId, embed, ...(components !== undefined ? { components } : {}) });
      return true;
    },
    async editMessage(opts) {
      contentEdits.push({
        channelId: opts.channelId,
        messageId: opts.messageId,
        content: opts.content,
        embed: opts.embed,
        components: opts.components,
      });
      // Also mirror embed-only edits into `edits` for older assertions.
      if (opts.embed && opts.embed !== null) {
        edits.push({
          channelId: opts.channelId,
          messageId: opts.messageId,
          embed: opts.embed,
        });
      }
      return true;
    },
    async deleteMessage({ channelId, messageId }) {
      deletes.push({ channelId, messageId });
      return true;
    },
  };
}

/**
 * REQ-discord-417: one scrubbed line for a failed gateway login. discord.js
 * turns a 401 into `TokenInvalid` (no status); REST errors carry `status`.
 */
export function formatDiscordLoginFailure(
  err: unknown,
  opts: { env?: NodeJS.ProcessEnv } = {},
): string {
  const e = (err && typeof err === "object" ? err : {}) as {
    code?: unknown;
    status?: unknown;
  };
  const status =
    e.code === "TokenInvalid" ? 401 : typeof e.status === "number" ? e.status : undefined;
  const detail = formatErrorLine(err, { env: opts.env });
  if (status === 401 || status === 403) {
    return `discord login failed (${status}): check DISCORD_TOKEN (${detail})`;
  }
  return `discord login failed${status ? ` (${status})` : ""}: ${detail} — check DISCORD_TOKEN and that discord.com is reachable`;
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
  // IDENTITY-13/14 — the owner's declared people, re-read from the allowlist
  // file on every use so `/admin people` and VM edits apply without a restart.
  const declaredPeople = () =>
    loadDeclaredPeople({ allowlist: config.allowlist, owner: config.owner ?? null });
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
      allowlist: config.allowlist,
      // SESSION-5: condense at about 80% of the model's window.
      contextWindowTokens: resolveContextWindowTokens(env),
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
  // REQ-discord-311: replies a dead process left mid-flight. Snapshot before
  // any new reply starts; the embeds are fixed once the gateway is up.
  const inflightReplies = db ? new InflightReplyStore(db) : undefined;
  const inflightBestEffort = <T>(
    what: string,
    fn: (s: InflightReplyStore) => T,
  ): T | undefined => {
    if (!inflightReplies) return undefined;
    try {
      return fn(inflightReplies);
    } catch (err) {
      console.warn(`[discord] in-flight reply ${what} failed:`, err);
      return undefined;
    }
  };
  const interruptedReplies: InflightReply[] =
    inflightBestEffort("read", (s) => s.list()) ?? [];
  /**
   * REQ-discord-311: one row per reply while it is in flight. `end()` is
   * idempotent: it runs the moment the reply lands (thinking message collapsed
   * into the answer — DISCORD-ASK-6/7 — fallback reply posted, or thinking
   * disposed on the dry path) and again from `finally` on every other exit, so
   * a row still present at the next start always means an unfinished reply.
   */
  const trackInflight = (input: {
    sessionId: string;
    channelId: string;
    parentChannelId: string | null;
    requestMessageId: string;
  }) => {
    const id = inflightBestEffort("record", (s) => s.begin(input).id);
    let open = id !== undefined;
    return {
      /** Remember the progress message once ThinkingStatus has one. */
      progress(messageId: string | null): void {
        if (!open || !id || !messageId) return;
        inflightBestEffort("update", (s) => s.setProgressMessage(id, messageId));
      },
      end(): void {
        if (!open || !id) return;
        open = false;
        inflightBestEffort("clear", (s) => s.end(id));
      },
      /**
       * AGENT-3: the bridge stopped mid-reply — leave the row for the next
       * start, which marks the reply interrupted; a later `end()` is a no-op.
       */
      keep(): void {
        open = false;
      },
    };
  };
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
  // AGENT-10: with no usable model provider every run fails with the notice;
  // say so at startup (and in /status) instead of quietly picking one.
  const llmNotice = providerNotice(env);
  if (llmNotice) console.warn(`[discord] ${llmNotice}`);
  // SAFE-8: the owner is pinged once per spend-cap episode; pending 80%
  // warnings (recorded by any run on this data dir) are claimed here too.
  const spendAlerts = createSpendAlertOutbox({ db, env });
  // SAFE-5: /admin mutations append to the same chain (fail closed on error).
  const recordAudit = db
    ? (entry: AuditEntryInput) =>
        appendAudit(db, entry, { key: auditKeyFromEnv(env) })
    : undefined;
  const mutedUsers = new Set<string>(config.mutedUserIds);
  // PLUGIN-5 / PLUGIN-5.a: /work and /schedule (with the scheduler) as the
  // owner set them in [corvidinho.plugins] now — read fresh on every use, so
  // turning one off or on needs no restart. An unreadable settings file is
  // off (fail closed) and logged each time it refuses something.
  const extraState = (name: ExtraName): ExtraState => {
    const state = loadExtrasToggles({ installRoot: config.projectRoot, env })[name];
    if (!state.on && state.reason === "config-unreadable") {
      console.warn(`[discord] ${formatExtraStateLog(name, state)}`);
    }
    return state;
  };
  {
    const atStart = loadExtrasToggles({ installRoot: config.projectRoot, env });
    for (const name of EXTRA_NAMES) {
      if (!atStart[name].on) console.warn(`[discord] ${formatExtraStateLog(name, atStart[name])}`);
    }
  }
  // SAFE-18..20: everything that needs the owner's OK reaches them as a DM
  // Approve/Deny card from one engine (src/discord/approval-cards.ts); the
  // MEMORY-ACL-6 forget request is its `forget` kind, and the must-ask gate's
  // prod and channel-post asks its `mustask` / `mustask-post` kinds.
  const sendDmRef: { fn?: GatewayHandlers["sendDm"] } = {};
  // SAFE-14.a: spend amounts and cap settings reach only the owner, by DM —
  // the 80% warning and a cap stop's details, after each run and every tick.
  const spendDm = createSpendDm({
    outbox: spendAlerts,
    owner: () => config.owner ?? null,
    sendDm: () => sendDmRef.fn,
  });
  // AUTONOMOUS-8 / SAFE-14.a: /status shows the owner rolling 24 h spend
  // against the daily cap; anyone else sees only "Work is paused for budget."
  // while runs stop at the cap, and nothing otherwise.
  const spendLine = (ownerView: boolean) => {
    const snap = readSpendSnapshot({ env, db, model: loadLlmEnv(env).model });
    if (!ownerView) return formatSpendPublicStatusLine(snap);
    const line = formatSpendStatusLine(snap);
    return spendDm.waiting() ? `${line} — ⚠️ a spend DM to you has not gone out yet (retried every tick)` : line;
  };
  const sendDm = async (o: Parameters<NonNullable<GatewayHandlers["sendDm"]>>[0]) =>
    sendDmRef.fn ? sendDmRef.fn(o) : null;
  // DISCORD-3.b: someone else's failed run DMs the owner its reason (one DM
  // per reason per hour), so their "the owner has been told" is true.
  const failureDm = createFailureOwnerDm({
    owner: () => config.owner ?? null,
    sendDm: () => sendDmRef.fn,
  });
  const editCardMessage = async (o: Parameters<NonNullable<GatewayHandlers["editMessage"]>>[0]) =>
    embedRef.editMessage ? embedRef.editMessage(o) : false;
  const approvals = db
    ? createApprovalCards({
        db,
        env,
        owner: () => config.owner ?? null,
        sendDm,
        editMessage: editCardMessage,
        kinds: [
          forgetApprovalKind({
            db,
            env,
            owner: () => config.owner ?? null,
            people: () => declaredPeople(),
            sendDm,
            editMessage: editCardMessage,
            post: async ({ channelId, content, mentionUserIds }) =>
              !!replyRef.fn && (await replyRef.fn({ channelId, content, mentionUserIds })) !== null,
            // DISCORD-5: the fallback notice only in a conversation still allowlisted.
            mayPost: (channelId, parentChannelId) =>
              isMonitoredConversation(channelId, parentChannelId, config.allowlist),
            // An approved forget also drops the session threads this process
            // still holds for them, so no later run replays those turns.
            onForgotten: ({ discordIds }) => {
              store.forgetTurnsOfUsers(discordIds);
              // A message of theirs still waiting its turn does not run
              // (AGENT-3.a, REQ-discord-301).
              runControl.noteForgotten(discordIds);
            },
          }),
          // AUTONOMY-9/10: prod / deploy asks (code) and channel-post asks
          // the must-ask gate (src/plugins/must-ask.ts) records.
          ...mustAskApprovalKinds({ db }),
          // SAFE-18.a: the owner's own memory forget / override by id
          // (destructive: code), recorded by the memory plugins' waiting run.
          memoryApprovalKind({ db }),
          // SAFE-8 / SAFE-8.a: one model call past a spend cap (money: code).
          spendApprovalKind({ db }),
          // AUTONOMY-10 / 10.a: one of its first 20 public-thread replies
          // (plain), held by the reply gate below (REQ-discord-099).
          publicReplyApprovalKind({ db }),
          // AGENT-18 hi drafts (REQ-discord-521): criteria a run drafted with
          // hi-draft, captured only on the owner's Approve (`cvok:hi:…`).
          hiCaptureApprovalKind({
            db,
            env,
            owner: () => config.owner ?? null,
            sendDm,
            post: async ({ channelId, content, mentionUserIds }) =>
              !!replyRef.fn && (await replyRef.fn({ channelId, content, mentionUserIds })) !== null,
            // DISCORD-5: the outcome post only in a conversation still allowlisted.
            mayPost: (channelId, parentChannelId) =>
              isMonitoredConversation(channelId, parentChannelId, config.allowlist),
          }),
        ],
      })
    : undefined;
  // AGENT-16.a: a stuck WATCH run (the watch process shares this data dir)
  // reaches the owner as a DM, like other stuck asks ping them.
  const watchAsks = db
    ? createWatchAskDelivery({
        db,
        owner: () => config.owner ?? null,
        sendDm: () => sendDmRef.fn,
      })
    : undefined;
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
    editMessage?: GatewayHandlers["editMessage"];
    deleteMessage?: GatewayHandlers["deleteMessage"];
  } = {};
  const publicThreadRef: { fn?: GatewayHandlers["isPublicThread"] } = {};

  // AUTONOMY-10 / 10.a (REQ-discord-099): its first 20 replies in public
  // threads each wait for the owner's OK on a `reply` card. Every post that
  // carries model text goes through `hold` (chat and ask answers, a restated
  // question, `/session start` and `/work` answers, a schedule's result and
  // ask posts); fixed harness text never does.
  const publicReplies = createPublicReplyGate({
    ...(db ? { db } : {}),
    owner: () => config.owner ?? null,
    lookup: () => publicThreadRef.fn,
    post: () => replyRef.fn,
    edit: () => embedRef.editMessage,
    remove: () => embedRef.deleteMessage,
    deliver: () => {
      void approvals?.deliver();
    },
  });

  /**
   * AUTONOMY-10 / 10.a (REQ-discord-099): a run's answer that carries model
   * text waits on its progress message for the owner's OK while the gate
   * holds it (a public thread, fewer than 20 approved); a stop of the run
   * ends the wait.
   */
  function holdRunReply(input: {
    thinking: ThinkingStatus;
    channelId: string;
    content: string;
    modelText: boolean;
    requester: string;
    surface: "chat" | "ask";
    signal: AbortSignal;
  }): Promise<PublicReplyOutcome> {
    if (!input.modelText) return Promise.resolve({ post: true, held: false, text: input.content });
    return publicReplies.hold({
      channelId: input.channelId,
      text: input.content,
      requester: input.requester,
      surface: input.surface,
      signal: input.signal,
      showHold: (line) => input.thinking.hold(line),
    });
  }

  const fallbackOutbound = memoryThinkingOutbound();

  function resolveOutbound(): ThinkingOutbound {
    if (opts.thinkingOutbound) return opts.thinkingOutbound;
    if (embedRef.send && embedRef.edit) {
      const reply = replyRef.fn;
      return {
        sendEmbed: embedRef.send,
        editEmbed: embedRef.edit,
        editMessage: embedRef.editMessage,
        deleteMessage: embedRef.deleteMessage,
        // DISCORD-16: later parts of a long collapsed answer are fresh posts.
        ...(reply ? { sendMessage: (o) => reply(o) } : {}),
      };
    }
    return fallbackOutbound;
  }

  const gitTipSha = tryGitTipShortSha(config.projectRoot);

  // AGENT-3 / AGENT-3.a / AGENT-3.b (REQ-discord-301/302): one run at a time
  // per session, and 'stop' / 'cancel'. After a stopped run a card pass runs
  // at once, so an Approve card its killed run waited on closes as a no
  // (nobody waits for it any more, SAFE-20).
  const runControl = new SessionRunControl({
    onStopped: () => {
      void approvals?.deliver();
    },
  });

  /**
   * AGENT-3.a (REQ-discord-302/303): the one stop path of the stop words and
   * the Stop button — abort the run `runId` once (idempotent; its process
   * tree is killed). Waiting messages still run (AGENT-3.b).
   */
  function stopRun(runId: string, sessionId: string, byUserId: string) {
    const outcome = runControl.stop(runId, byUserId);
    if (outcome === "stopped") {
      console.log(`[discord] run ${runId} of session ${sessionId} stopped by ${byUserId}`);
    }
    return outcome;
  }

  // AGENT-3.c (REQ-discord-304): the scheduler's stop control — each schedule
  // run takes a turn on this run control and shows the same Stop button (in
  // its channel, or with no channel in the owner's DM), so the owner or the
  // schedule's creator stops it the same way as a chat run.
  const scheduleRunStop = createScheduleRunStop({
    runControl,
    outbound: () => resolveOutbound(),
    sendDm: () => sendDmRef.fn,
    editMessage: () => embedRef.editMessage,
    deleteMessage: () => embedRef.deleteMessage,
    owner: () => config.owner ?? null,
    model: () => loadLlmEnv(process.env).model,
    debounceMs: opts.thinkingDebounceMs,
    tickMs: opts.thinkingTickMs,
  });

  /**
   * AGENT-3.a (REQ-discord-302): stop the run `runId` and answer the stop
   * message with one short ack, tracked on the run's session.
   */
  async function stopRunFor(msg: InboundMessage, runId: string, sessionId: string): Promise<void> {
    const outcome = stopRun(runId, sessionId, msg.authorId);
    // Routing and this call happen in one tick, so the run is still there.
    if (outcome === "none") return;
    const session = store.get(sessionId);
    if (!replyRef.fn) {
      if (session) store.trackBotMessage(`bot_reply_for_${msg.id}`, session);
      return;
    }
    const sent = await replyRef.fn({
      channelId: msg.threadId ?? msg.channelId,
      content: RUN_STOP_ACK,
      replyToMessageId: msg.id,
    });
    if (sent?.messageId && session) store.trackBotMessage(sent.messageId, session);
  }

  /**
   * DISCORD-5 / DISCORD-DENY-2/3 / REQ-discord-212, then REQ-discord-201 /
   * REQ-discord-010 — the gates a channel button press passes before it
   * counts (an ask's buttons and form, a run's Stop button): the press
   * channel (inside `talk`'s thread its allowlisted parent counts,
   * DISCORD-2.a) and `talk`'s own channel must be allowlisted; then the actor
   * and mute/rate gates chat and slash run (ALLOW-5 / DISCORD-6). A press
   * needs an ack, so every refusal is ephemeral: the tip for an admin (else
   * zero-width) off the allowlist, the zero-width ack for an actor deny
   * (DISCORD-DENY-3), MUTED / RATE_LIMITED for mute/rate. True ⇒ go on.
   */
  async function pressPassesGates(
    interaction: ComponentInteraction,
    talk: Pick<SessionStub, "channelId" | "threadId"> | undefined,
    // AGENT-3.c: a Stop press in a DM (a schedule with no channel) skips the channel gate.
    where: { inDm?: boolean } = {},
  ): Promise<boolean> {
    if (
      !where.inDm &&
      !componentChannelAllowlisted(interaction.channelId, talk, config.allowlist)
    ) {
      const admin =
        resolvePermissionLevel({
          userId: interaction.userId,
          allowlist: config.allowlist,
          adminUserIds: config.adminUserIds,
          adminRoleIds: config.adminRoleIds,
          owner: config.owner ?? null,
          mutedUsers,
        }) >= PermissionLevel.ADMIN;
      await interaction.reply({
        content: admin ? ALLOWLIST_DENY_TIP : EPHEMERAL_SILENT_ACK,
        ephemeral: true,
      });
      return false;
    }
    const actorGate = gateActor({
      userId: interaction.userId,
      roleIds: interaction.roleIds,
      allowlist: config.allowlist,
      owner: config.owner ?? null,
    });
    if (!actorGate.ok) {
      await interaction.reply({ content: EPHEMERAL_SILENT_ACK, ephemeral: true });
      return false;
    }
    const rateGate = gateRateOrMute({
      userId: interaction.userId,
      mutedUsers,
      rateLimit: {
        state: rateLimitState,
        config: rateLimitConfig,
        // rateLimitByLevel keys on the presser's level (mute is checked first).
        permLevel: resolvePermissionLevel({
          userId: interaction.userId,
          roleIds: interaction.roleIds,
          allowlist: config.allowlist,
          owner: config.owner ?? null,
        }),
      },
    });
    if (!rateGate.ok) {
      await interaction.reply({ content: rateGate.reply, ephemeral: true });
      return false;
    }
    return true;
  }

  /**
   * AGENT-3.a (REQ-discord-303): a press of the Stop button (`cvstop:<runId>`)
   * on a run's progress message. The run is the one that message shows while
   * it runs (`byProgressMessage`, in the press's channel, with that run id),
   * so a button left from a finished run or an earlier bridge process stops
   * nothing. The channel gate sees the pressed message's talk: the session of
   * the run it shows, else the session its finished answer is tracked on
   * (else the press channel alone). After the channel, actor and mute/rate
   * gates: no such run ⇒ "Nothing is running."; anyone but its requester or
   * the owner ⇒ "This Stop button isn't for you."; else the stop words' stop
   * path and the same short ack, all ephemeral. Waiting messages still run
   * (AGENT-3.b); the progress message becomes `⏹ Stopped`, its button gone.
   * AGENT-3.c (REQ-discord-304): a schedule run's button works the same way,
   * its creator in the requester's place; a schedule with no channel shows
   * it in the owner's DM, and a press there (no guild) on that running
   * run's DM has no channel to allowlist — like a schedule ask's
   * (AUTONOMY-6.a) — so only the actor and mute / rate gates apply. The
   * owner's press with no guild on a Stop button whose run is no longer
   * going (a DM a dead bridge left) skips the channel gate too, so it gets
   * "Nothing is running." rather than the allowlist tip. Every other press
   * keeps the channel gate.
   */
  async function pressStopButton(interaction: ComponentInteraction, runId: string): Promise<void> {
    const messageId = interaction.messageId;
    const shown = messageId ? runControl.byProgressMessage(messageId) : undefined;
    const run =
      shown && shown.runId === runId && shown.channelId === interaction.channelId ? shown : undefined;
    const talk =
      (shown ? store.get(shown.sessionId) : undefined) ??
      (messageId ? store.getByBotMessage(messageId) : undefined);
    const inDm =
      !interaction.guildId &&
      (run !== undefined
        ? scheduleRunStop.inOwnerDm(run.runId)
        : shown === undefined && isOwnerDiscord(config.owner, interaction.userId));
    if (!(await pressPassesGates(interaction, talk, { inDm }))) return;
    if (!run) {
      await interaction.reply({ content: RUN_STOP_NOTHING_RUNNING, ephemeral: true });
      return;
    }
    if (run.requesterId !== interaction.userId && !isOwnerDiscord(config.owner, interaction.userId)) {
      await interaction.reply({ content: RUN_STOP_NOT_YOURS, ephemeral: true });
      return;
    }
    const outcome = stopRun(run.runId, run.sessionId, interaction.userId);
    await interaction.reply({
      content: outcome === "none" ? RUN_STOP_NOTHING_RUNNING : RUN_STOP_ACK,
      ephemeral: true,
    });
  }

  function buildSlashCtx(): SlashContext {
    return {
      store,
      workStore,
      scheduleStore,
      memoryStore,
      announceStore,
      auditLine,
      spendLine,
      spendAlerts,
      spendDm,
      failureDm,
      // AUTONOMY-10 / 10.a: `/session start` and `/work` answers in a public
      // thread wait for the owner's OK (REQ-discord-099).
      publicReplies,
      ...(replyRef.fn ? { post: replyRef.fn } : {}),
      // MEMORY-7.a: /session start and /work send private replies by DM.
      ...(sendDmRef.fn ? { sendDm: sendDmRef.fn } : {}),
      recordAudit,
      // MEMORY-ACL-6.a: `/admin people forget` records the ask in the shared
      // DB and sends the owner's card at once.
      ...(db ? { requestForget: (i) => new ForgetRequestStore({ db }).request(i) } : {}),
      ...(approvals ? { deliverForgetCards: () => approvals.deliver() } : {}),
      // AGENT-18 hi drafts: a card a /work run raised reaches the owner when it ends.
      ...(approvals ? { deliverApprovalCards: () => approvals.deliver() } : {}),
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
      // DISCORD-2 / AUTONOMY-5/6 (REQ-discord-002, REQ-discord-044): a reply
      // to a /work or /session start answer continues that session (and
      // answers its pending ask); the router keeps SESSION-MULTI-1, so only
      // the session's own user continues it.
      trackBotMessage: (messageId, sessionId) => {
        const session = store.get(sessionId);
        if (!session) return;
        try {
          store.trackBotMessage(messageId, session);
        } catch (err) {
          // Best effort: the answer is already out, so a failed bot-message
          // DB write (e.g. "database is locked") must not stop the slash run
          // from resolving its deferred reply. The in-memory map is set first.
          console.warn(`[discord] slash answer tracking for ${sessionId} failed:`, err);
        }
      },
      mutedUsers,
      rateLimitState,
      rateLimitConfig,
      // AGENT-3.a: /session start and /work runs take their session's turn.
      runControl,
      adminUserIds: config.adminUserIds,
      adminRoleIds: config.adminRoleIds,
      owner: config.owner ?? null,
      env: opts.env,
      gitTipSha,
      // PLUGIN-5.a: /work and /schedule are refused while turned off.
      extraState,
    };
  }

  const handlers: GatewayHandlers = {
    onMessage: async (msg: InboundMessage) => {
      const action = routeMessage(msg, {
        store,
        allowlist: config.allowlist,
        channelOnlyGate: true,
        // REQ-discord-201 — owner passes the actor gate even when unlisted.
        owner: config.owner ?? null,
        mutedUsers,
        rateLimit: { state: rateLimitState, config: rateLimitConfig },
        // AGENT-3.a (REQ-discord-302): a reply 'stop' to a run's progress message.
        runs: runControl,
        // PLUGIN-5.a (REQ-discord-157): an expired /work talk's conversation
        // is not resumed as a new session (SESSION-3.a) while /work is off.
        refuseResume: (priorSessionId) =>
          workStore.isWorkSession(priorSessionId) && !extraState("work").on
            ? extraOffText("work")
            : null,
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

      // AGENT-3.a (REQ-discord-302): the requester's or the owner's 'stop' /
      // 'cancel' in reply to a running run's progress message.
      if (action.kind === "stop_run") {
        await stopRunFor(msg, action.runId, action.sessionId);
        return;
      }

      const { session, prompt } = action;
      const channelId = msg.threadId ?? msg.channelId;

      // AGENT-3.a (REQ-discord-302): 'stop' or 'cancel' (the whole message)
      // from the requester in their session stops its run in flight — it
      // never waits behind it. With nothing running the text goes on as
      // before ('cancel' still clears open asks, AUTONOMY-6).
      if (
        action.kind === "continue_session" &&
        isStopRunText(promptBodyForAskGate(prompt))
      ) {
        const running = runControl.current(session.id);
        if (running) {
          await stopRunFor(msg, running.runId, session.id);
          return;
        }
      }

      // AGENT-3.a / AGENT-3.b (REQ-discord-301): one run at a time per
      // session — a message sent while a run of this session is going waits
      // for it (first in, first out; a stop does not drop it) and then goes
      // on as if it had just arrived. Other sessions run in parallel.
      const turn = runControl.enqueue({
        sessionId: session.id,
        requesterId: msg.authorId,
        channelId,
      });
      // REQ-discord-311: a message that waits is in flight from now on, so a
      // restart while it waits still gets the interrupted notice.
      let inflight = turn.waited
        ? trackInflight({
            sessionId: session.id,
            channelId,
            parentChannelId: msg.threadId ? msg.channelId : null,
            requestMessageId: msg.id,
          })
        : undefined;
      try {
        if (!(await turn.ready)) {
          // The bridge is stopping: nothing starts; the row stays so the
          // next start marks this reply interrupted.
          inflight?.keep();
          return;
        }
        // After waiting, the session may have ended, idled out or had its
        // user forgotten (MEMORY-ACL-6), or the channel or its author may no
        // longer pass the channel, actor or mute gate (`/admin` changes and
        // mutes are live): then nothing runs or is posted.
        if (
          turn.waited &&
          (store.get(session.id) !== session ||
            turn.requesterForgotten ||
            !waitedMessageStillAllowed(msg, {
              allowlist: config.allowlist,
              owner: config.owner ?? null,
              mutedUsers,
            }))
        ) {
          return;
        }

        // PLUGIN-5.a (REQ-discord-157): while /work is turned off, a message
        // that would resume a /work talk gets the fixed turned-off line (in
        // the channel, so never the owner's config hint) and runs nothing; its
        // open asks stay as they were. Read when it would run, so a message
        // that waited behind a run sees the setting as it is now. A run in
        // flight was not stopped and 'stop' still reaches it (above).
        if (action.kind === "continue_session" && workStore.isWorkSession(session.id)) {
          const work = extraState("work");
          if (!work.on) {
            const sent = replyRef.fn
              ? await replyRef.fn({
                  channelId,
                  content: extraOffText("work"),
                  replyToMessageId: msg.id,
                })
              : null;
            store.trackBotMessage(sent?.messageId ?? `bot_reply_for_${msg.id}`, session);
            return;
          }
        }

        // DISCORD-ASK-5 / REQ-discord-044: a button ask past its timeout is
        // cleared here, before the thin-ack gate, so its dead Choose button is
        // never restated. The newest open ask that has not timed out takes its
        // place (earlier timed-out ones are dropped), or none is left and the
        // message runs the agent. A cancel keeps its ack below.
        if (
          action.kind === "continue_session" &&
          session.pendingAsk?.options?.length &&
          isAskExpired(session.pendingAsk) &&
          !isCancelAsk(promptBodyForAskGate(prompt))
        ) {
          store.clearPendingAsk(session, session.pendingAsk.askId);
        }

        // AUTONOMY-5/6: while waiting on an ask, thin acks restate the newest
        // one; cancel clears every open ask of the session (SESSION-MULTI-3).
        if (
          action.kind === "continue_session" &&
          session.pendingAsk &&
          (isThinAck(promptBodyForAskGate(prompt)) ||
            isCancelAsk(promptBodyForAskGate(prompt)))
        ) {
          if (isCancelAsk(promptBodyForAskGate(prompt))) {
            store.setPendingAsk(session, null);
            if (replyRef.fn) {
              const sent = await replyRef.fn({
                channelId,
                content: ASK_CANCELLED_ACK,
                replyToMessageId: msg.id,
              });
              if (sent?.messageId) store.trackBotMessage(sent.messageId, session);
            } else {
              store.trackBotMessage(`bot_reply_for_${msg.id}`, session);
            }
            return;
          }
          // Thin ack: restate once; do not spawn agent.
          const hasButtons = Boolean(session.pendingAsk.options?.length);
          // DISCORD-ASK-4.a: a free-text ask restates with its Answer button
          // while that button has not timed out (DISCORD-ASK-5); after that the
          // restatement is the reply-only text it was before.
          const answerButton = !hasButtons && !isAskExpired(session.pendingAsk);
          const restated = hasButtons
            ? formatAskStub({
                ask: session.pendingAsk,
                ownerDiscordId: config.owner?.discordId,
                requesterDiscordId: msg.authorId,
              })
            : formatAskReply({
                ask: session.pendingAsk,
                owner: config.owner,
                requesterDiscordId: msg.authorId,
                replyHint: true,
                answerButton,
              });
          if (replyRef.fn) {
            const askId = session.pendingAsk.askId;
            // AUTONOMY-10 / 10.a (REQ-discord-099): the restated question is
            // model text — in a public thread it waits for the owner's OK
            // (a note holds its place); a no posts none of it.
            const held = await publicReplies.hold({
              channelId,
              text: restated.content,
              requester: msg.authorId,
              surface: "chat",
              signal: turn.signal,
              replyToMessageId: msg.id,
            });
            if (!held.post) {
              store.trackBotMessage(held.noteMessageId ?? `bot_reply_for_${msg.id}`, session);
              return;
            }
            const sent = await replyRef.fn({
              channelId,
              content: held.text,
              replyToMessageId: msg.id,
              mentionUserIds: restated.mentionUserIds,
              ...(hasButtons
                ? { components: buildOpenStubComponents(askId) }
                : answerButton
                ? { components: buildAnswerStubComponents(askId) }
                : {}),
            });
            if (sent?.messageId) store.trackBotMessage(sent.messageId, session);
          } else {
            store.trackBotMessage(`bot_reply_for_${msg.id}`, session);
          }
          return;
        }

        // IDENTITY-8..12: owner (ADMIN, unchanged), else the declared person's
        // team role, else community; the tool layer re-checks it on every call.
        // Resolved before the run: SAFE-12/13 need to know whose words these are.
        const actingRole = resolveDiscordActingRole({
          userId: msg.authorId,
          roleIds: msg.authorRoleIds,
          allowlist: config.allowlist,
          adminUserIds: config.adminUserIds,
          adminRoleIds: config.adminRoleIds,
          owner: config.owner ?? null,
          mutedUsers,
          people: declaredPeople(),
        });
        const actingIsAdmin = actingRole === "owner";

        // SAFE-13: a non-owner's message that looks like an injection attempt
        // never reaches a run. One short reply says so and pings the owner
        // (allowed mentions: the owner only); an audit row records the actor,
        // the surface and the reason ids, never the text. A session this
        // message would have started is dropped; the turn is not recorded.
        const suspected = inboundInjection(prompt, actingRole);
        if (suspected) {
          auditInboundInjection(recordAudit, {
            actor: msg.authorId,
            surface: `discord:${session.id}`,
            source: "chat-message",
            reasons: suspected.reasons,
          });
          const refusal = formatInjectionRefusal(suspected.reasons, config.owner);
          if (refusal.mentionUserIds.length === 0) console.warn(INJECTION_NO_OWNER_WARNING);
          const sent = replyRef.fn
            ? await replyRef.fn({
                channelId,
                content: refusal.content,
                replyToMessageId: msg.id,
                mentionUserIds: refusal.mentionUserIds,
              })
            : null;
          if (action.kind === "start_session") {
            await store.endSession(session);
          } else {
            store.trackBotMessage(sent?.messageId ?? `bot_reply_for_${msg.id}`, session);
          }
          return;
        }

        // SAFE-12: a non-owner's words go to the model fenced as untrusted data
        // (their request, never instructions; only their role decides what runs).
        const spoken = fenceSpeakerText(prompt, actingRole, "chat-message");

        // AUTONOMY-6 / SESSION-MULTI-3 / DISCORD-ASK:
        // - free-text pending (no options): substantive continue answers and clears.
        // - button pending (has options): chat continues; buttons stay until pick/timeout.
        let agentPrompt = spoken;
        if (action.kind === "continue_session" && session.pendingAsk) {
          const pending = session.pendingAsk;
          if (pending.options?.length) {
            agentPrompt = spoken;
          } else {
            const prior = pending.question;
            agentPrompt =
              `[Prior clarifying question you asked (the human is answering it now):\n${prior}]\n\n` +
              `Human answer:\n${spoken}`;
            // Only the answered ask: earlier open button asks stay (SESSION-MULTI-3).
            store.clearPendingAsk(session, pending.askId);
          }
        }
        // AGENT-6 (REQ-discord-072): the session's earlier turns, oldest first,
        // go ahead of the new message and any pending-ask block, so a continued
        // run keeps the thread. A new session has none (one resumed after the
        // TTL begins from its retained conversation, SESSION-3.a). At about 80%
        // of the model's window the oldest turns are condensed into the
        // session's summary, the task and latest instruction kept word for word
        // (SESSION-5/6). The human's own words (before enrichment) join the
        // thread now, so a run that throws or a bridge that dies mid-run still
        // keeps the request.
        agentPrompt = store.threadPrompt(session, agentPrompt);
        store.recordTurn(session, "human", prompt);

        const outbound = resolveOutbound();
        const llmModel = loadLlmEnv(process.env).model;
        // DISCORD-15.a: tokens and cost show on the owner's own runs only.
        const ownerRun = isOwnerDiscord(config.owner, msg.authorId);

        const thinking = new ThinkingStatus({
          outbound,
          channelId,
          replyToMessageId: msg.id,
          sessionId: session.id,
          model: llmModel,
          showUsage: ownerRun,
          // AGENT-3.a (REQ-discord-303): the run's Stop button.
          components: buildStopComponents(turn.runId),
          debounceMs: opts.thinkingDebounceMs,
          tickMs: opts.thinkingTickMs,
        });

        // REQ-discord-311: record the reply while it is in flight so the next
        // bridge start can mark it interrupted if this process dies mid-reply
        // (a message that waited is recorded from when it began waiting).
        // Cleared on every exit path (collapsed, fallback reply, dry, failed,
        // refused, thrown); kept only when the bridge stops mid-reply.
        inflight ??= trackInflight({
          sessionId: session.id,
          channelId,
          parentChannelId: msg.threadId ? msg.channelId : null,
          requestMessageId: msg.id,
        });
        await thinking.start({ description: "Working on your request..." });
        inflight.progress(thinking.progressMessageId);
        // AGENT-3.a: a reply 'stop' / 'cancel' to this progress message, or
        // its Stop button, stops the run.
        turn.setProgressMessage(thinking.progressMessageId);

        // SESSION-WORKTREE: bind isolated cwd on start; on continue reuse the
        // live worktree (no silent switch), or re-create it when its directory
        // is gone (crash mid-park) — never a dead or parked cwd.
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

        const sessionCwd = store.cwdFor(session);

        let result;
        try {
          // DISCORD-9 — download attachments into the session workspace (bound
          // above): the agent's file tools only open paths under its cwd
          // (REQ-discord-013). AGENT-1.a: a non-git project's talk runs in
          // the project folder itself, so the owner's images go to this
          // session's own folder there (removed when the session ends), and
          // anyone else's stay URL-only — their runs only read there.
          const inPlace = bound.workspace.kind === "project_dir";
          let enrichedPrompt =
            inPlace && actingRole !== "owner"
              ? appendAttachmentUrls(agentPrompt, msg.attachments)
              : await enrichPromptWithImages(agentPrompt, msg.attachments, {
                  messageId: msg.id,
                  cacheDir: inPlace
                    ? sessionAttachmentDir(bound.workspace.workDir, session.id)
                    : attachmentCacheDir(sessionCwd ?? config.projectRoot),
                });

          const people = declaredPeople();
          // IDENTITY-4 — inject Discord user id + display / owner map (never invent names).
          const idInject = enrichPromptWithIdentity(enrichedPrompt, {
            userId: msg.authorId,
            displayName: msg.authorDisplayName,
            username: msg.authorUsername,
            owner: config.owner ?? null,
            people,
          });
          if (idInject.injected) {
            console.log(
              `[discord] identity inject: user ${msg.authorId}` +
                (idInject.displayLabel ? ` as ${idInject.displayLabel}` : ""),
            );
            enrichedPrompt = idInject.prompt;
          }

          // AGENT-7 / MEMORY-2/4 — auto-recall inject for acting Discord user:
          // their profile when declared (MEMORY-5), never private notes
          // (MEMORY-7), and the project's memory for owner / team (MEMORY-6).
          // actingRole already resolved above for SAFE-12/13.
          const memInject = enrichPromptWithMemories(
            enrichedPrompt,
            memoryStore,
            {
              ...memoryInjectOptsFor({
                userId: msg.authorId,
                people,
                role: actingRole,
                projectDir: sessionCwd ?? config.projectRoot,
              }),
              // MEMORY-9: search memory for this message.
              query: prompt,
            },
          );
          if (memInject.injected) {
            console.log(
              `[discord] memory inject: ${memInject.count} recalled for user ${msg.authorId}`,
            );
            enrichedPrompt = memInject.prompt;
          }


          // AUTONOMY-10.a (REQ-discord-099): while replies in this public
          // thread wait for the owner's OK, `discord-send-file` asks too.
          const replyPublicThread = await publicReplies.mustHold(channelId);

          // Busy while the agent runs: the soft-TTL purge must not park this
          // worktree mid-run (REQ-discord-204).
          result = await store.runActive(session, () =>
            agent.runChat({
              prompt: enrichedPrompt,
              // Raw human text (before memory/image enrichment).
              humanText: prompt,
              sessionId: session.id,
              resume: action.kind === "continue_session",
              actingUserId: msg.authorId,
              actingIsAdmin,
              actingRole,
              // SAFE-3.a: a chat message (the shell gate re-checks the role
              // and the talk's own worktree in the run).
              surface: "chat",
              cwd: sessionCwd,
              // AGENT-3.a: a stop (or the bridge stopping) kills its process tree.
              signal: turn.signal,
              // DISCORD-17: files attach in this conversation's channel only.
              replyChannelId: channelId,
              ...(msg.threadId ? { replyParentChannelId: msg.channelId } : {}),
              replyPublicThread,
              onStatus: (u) => {
                void thinking.update({
                  tool: u.tool,
                  tokens: u.tokens,
                  description: u.message ? `⏳ ${u.message}` : undefined,
                });
              },
            }),
          );
        } catch (err) {
          // DISCORD-3.b: the owner sees why in one plain line; anyone else
          // that it didn't work (and whether the owner was told).
          const failed = `❌ ${await failedRunReply({
            run: { failureReason: err instanceof Error ? err.message : undefined },
            ownerRun,
            surface: "chat",
            channelId,
            ownerDm: failureDm,
          })}`;
          store.recordTurn(session, "agent", failed);
          await thinking.fail(failed);
          throw err;
        }

        // AGENT-3: the bridge is stopping and the run was killed. Nothing is
        // posted; the row stays, so the next start marks this reply
        // interrupted (REQ-discord-311).
        if (turn.stopReason === "closed") {
          inflight.keep();
          thinking.dispose();
          return;
        }
        // AGENT-3.a (REQ-discord-302): a stopped run's answer is only
        // "⏹ Stopped" with the DISCORD-15/15.a footer — no question, no body.
        let stopped = turn.stopReason === "stopped";

        const plumbing = result.task
          ? formatTaskPlumbing({
              state: result.task.state,
              verified: result.task.verified,
              verifySkipped: result.task.verifySkipped,
              attempts: result.task.attempts,
              cancelled: result.task.cancelled,
              // AGENT-12: `stopped=turn-cap|idle-timeout`, plumbing only (AGENT-9).
              stopReason: result.task.stopReason,
            })
          : undefined;
        // DISCORD-15/15.a: the answer footer adds tokens and cost on owner runs.
        // AGENT-11: the model that answered ("b (fell back from a)"), each
        // model priced at its own price.
        const thinkExtras = {
          plumbing,
          model: answerModelFor(result, llmModel),
          ...(ownerRun ? { spend: answerSpendFor(result.usage, llmModel, result.usageByModel) } : {}),
        };
        // AUTONOMY-1/2/4 / DISCORD-ASK: needs a human → buttons when options, else free-text.
        // SAFE-8: a spend-cap stop is always free text (no choice can lift the
        // cap), pings the owner once per cap episode and is never the pending ask.
        const askRaw = stopped ? undefined : result.ask;
        const spendCap = askRaw?.reason === "spend-cap";
        const askOwner = askRaw ? askPingOwner(askRaw, config.owner, spendAlerts) : null;
        const resolvedOptions =
          askRaw && !spendCap
            ? resolveAskOptions({
                options: askRaw.options,
                question: askRaw.question,
              })
            : undefined;
        const useButtons = Boolean(resolvedOptions?.length);
        let askBody: {
          content: string;
          mentionUserIds: string[];
          status: string;
          failed: boolean;
          ownerPinged?: boolean;
          components?: unknown[];
          /** Answer button, not a Choose stub: keep the footer (DISCORD-ASK-4.a). */
          keepFooter?: boolean;
        } | null = null;
        let pendingToStore: PendingAsk | null = null;

        if (askRaw && useButtons && resolvedOptions) {
          const pending = toPendingAsk({ ...askRaw, options: resolvedOptions });
          const stub = formatAskStub({
            ask: pending,
            ownerDiscordId: config.owner?.discordId,
            requesterDiscordId: msg.authorId,
          });
          askBody = {
            content: stub.content,
            mentionUserIds: stub.mentionUserIds,
            status: stub.status,
            failed: stub.failed,
            ownerPinged: Boolean(
              config.owner?.discordId &&
                stub.mentionUserIds.includes(config.owner.discordId),
            ),
            components: buildOpenStubComponents(pending.askId),
          };
          pendingToStore = pending;
        } else if (askRaw) {
          // DISCORD-ASK-4.a: a free-text clarify or stuck ask keeps its
          // question in the public post and gets the Answer button (private
          // form); a reply still answers it. Never on a spend-cap stop.
          const answer = spendCap ? null : answerAskFor({ ask: askRaw });
          const formatted = formatAskReply({
            ask: askRaw,
            owner: askOwner?.owner,
            requesterDiscordId: msg.authorId,
            context: result.summary,
            replyHint: true,
            answerButton: Boolean(answer),
          });
          askBody = {
            content: formatted.content,
            mentionUserIds: formatted.mentionUserIds,
            status: formatted.status,
            failed: formatted.failed,
            ownerPinged: formatted.ownerPinged,
            ...(answer ? { components: answer.components, keepFooter: true } : {}),
          };
          // AUTONOMY-5/6: a clarify or stuck ask waits for the requester's
          // answer. A spend-cap stop is not answerable by a reply, so a later
          // "ok" runs normally and a substantive reply carries no cap text.
          pendingToStore = answer?.pending ?? null;
        }

        // MEMORY-7.a (REQ-discord-710): the run's private replies (private
        // notes, a profile, the owner's view of someone) go to the asker by
        // DM only; the channel gets the "sent privately" note, never the text.
        const privateOutcome = await deliverPrivateReplies({
          replies: result.privateReplies,
          userId: msg.authorId,
          sendDm: sendDmRef.fn,
        });
        // DISCORD-3.a — final chat reply is human text only (no plumbing lines).
        let body = withPrivateNote(
          stopped
            ? RUN_STOPPED_TEXT
            : askBody
            ? askBody.content
            : result.ok
              ? // DISCORD-16: the whole answer; it is split into messages when long.
                result.summary
              : // DISCORD-3.b: why (the owner's run), else "the owner has been told".
                await failedRunReply({ run: result, ownerRun, surface: "chat", channelId, ownerDm: failureDm }),
          privateOutcome,
        );
        // SAFE-14.a: no spend amounts ride the post; the 80% warning and a
        // cap stop's details go to the owner by DM (after the post, below).
        // SAFE-13: a tool result that looked like an injection pings the owner
        // on the same post.
        let out: { content: string; mentionUserIds?: string[] } = withInjectionNotice(
          {
            content: body,
            ...(askBody ? { mentionUserIds: askBody.mentionUserIds } : {}),
          },
          result.injection,
          config.owner,
          // DISCORD-16: the answer is split into messages, so the SAFE-13
          // line never cuts it down to one message.
          DISCORD_ANSWER_MAX,
        );

        // AUTONOMY-10 / 10.a (REQ-discord-099): an answer or question (model
        // text) in a public thread, while fewer than 20 were approved, waits
        // on the progress message for the owner's OK; Approve posts exactly
        // what the card showed. "⏹ Stopped", a failed run's line and a
        // spend-cap stop are fixed text and never wait.
        const held = await holdRunReply({
          thinking,
          channelId,
          content: out.content,
          modelText: !stopped && (askBody ? !spendCap : result.ok),
          requester: msg.authorId,
          surface: "chat",
          signal: turn.signal,
        });
        // The bridge stopped while it waited: as above, nothing is posted.
        if (!held.post && (turn.stopReason as RunStopReason | undefined) === "closed") {
          inflight.keep();
          thinking.dispose();
          return;
        }
        // A no (SAFE-20), or a stop while it waited: none of the reply goes
        // out — no question, no ping, and its ask is never pending.
        let notPosted: string | null = null;
        if (!held.post) {
          stopped = turn.stopReason === "stopped";
          notPosted = stopped ? RUN_STOPPED_TEXT : publicReplyNotPostedText(held.outcome);
          askBody = null;
          pendingToStore = null;
          body = notPosted;
          out = { content: notPosted };
        } else if (held.held) {
          out = { ...out, content: held.text };
          // DISCORD-ASK-5: a held question's buttons last ~30 minutes from
          // when it goes out, not from before the owner's OK.
          if (pendingToStore) pendingToStore.expiresAt = askExpiresAt();
        }
        const failedLook = stopped || notPosted !== null || (askBody ? askBody.failed : !result.ok);

        // Pending ask (AUTONOMY-5/6, SESSION-MULTI-3): a new ask is stored
        // beside any open button ask, never in its place; a turn that leaves
        // none (a finished turn, or a SAFE-8 spend-cap stop, which a reply
        // cannot answer) clears a free-text pending ask while a button ask
        // survives until it is picked or times out. Set only now: a held
        // question is pending once it is posted (AUTONOMY-10.a).
        if (pendingToStore) {
          store.setPendingAsk(session, pendingToStore);
        } else if (session.pendingAsk && !session.pendingAsk.options?.length) {
          store.clearPendingAsk(session, session.pendingAsk.askId);
        }
        if (
          askRaw &&
          askBody &&
          (askRaw.reason === "stuck" || askRaw.reason === "spend-cap") &&
          !askBody.ownerPinged &&
          !askOwner?.deduped
        ) {
          console.warn(ASK_NO_OWNER_WARNING);
        }
        // AGENT-6: the answer as posted joins the thread (a spend-cap stop
        // records no answer, REQ-discord-098; a reply that was not posted
        // records the line shown instead).
        store.recordTurn(
          session,
          "agent",
          answerTurnText(body, notPosted !== null ? null : (pendingToStore ?? askRaw)),
        );
        let delivered = false;
        try {
          // DISCORD-ASK-6/7 — prefer one public message: edit thinking into stub/answer.
          // DISCORD-3.a — the answer (not a Choose stub) keeps a footer-only
          // embed with the model and plumbing; its outcome matches the fallback.
          const collapsed = await thinking.finalizeContent({
            content: out.content,
            components: askBody?.components,
            keepFooter: askBody?.keepFooter,
            mentionUserIds: out.mentionUserIds,
            extras: thinkExtras,
            failed: failedLook,
          });
          if (collapsed) {
            delivered = true;
            // The thinking message is now the answer: nothing left to recover.
            inflight.end();
            // DISCORD-2 / DISCORD-16: a reply to any part continues the session.
            for (const id of collapsed.messageIds) store.trackBotMessage(id, session);
            if (pendingToStore && askBody?.components) {
              // The Choose button rides the last part (a stub is one part).
              pendingToStore.stubMessageId = collapsed.messageIds.at(-1) ?? collapsed.messageId;
              store.setPendingAsk(session, pendingToStore);
            }
            // AUTONOMY-2/4, SAFE-8: an edit does not notify its mentions, so
            // whoever the answer mentions gets one fresh ping post.
            const ping = await postCollapsedPing({
              post: replyRef.fn,
              channelId,
              replyToMessageId: collapsed.messageId,
              mentionUserIds: out.mentionUserIds,
              questionUserIds: askRaw?.reason === "clarify" ? askBody?.mentionUserIds : undefined,
            });
            if (ping) store.trackBotMessage(ping.messageId, session);
          } else if (replyRef.fn) {
            // Fallback when editMessage unavailable: status embed + separate reply.
            if (stopped) {
              await thinking.fail(RUN_STOPPED_TEXT, thinkExtras);
            } else if (notPosted !== null) {
              await thinking.fail(notPosted, thinkExtras);
            } else if (askBody) {
              await (askBody.failed
                ? thinking.fail(askBody.status, thinkExtras)
                : thinking.done(askBody.status, thinkExtras));
            } else if (result.ok) {
              await thinking.done("✅ Done", thinkExtras);
            } else {
              await thinking.fail(`❌ exit ${result.exitCode}`, thinkExtras);
            }
            // DISCORD-15/16: the reply carries the answer footer on its last
            // part and is split at 2000 characters.
            const sentIds = await postAnswerParts(replyRef.fn, {
              channelId,
              content: out.content,
              // A Choose stub carries no footer; an Answer button keeps it
              // (DISCORD-ASK-4.a).
              footer:
                askBody?.components && !askBody.keepFooter
                  ? null
                  : thinking.answerFooter({
                      extras: thinkExtras,
                      failed: failedLook,
                    }),
              replyToMessageId: msg.id,
              ...(out.mentionUserIds ? { mentionUserIds: out.mentionUserIds } : {}),
              ...(askBody?.components ? { components: askBody.components } : {}),
              ...(askBody?.keepFooter ? { keepFooter: true } : {}),
            });
            inflight.end();
            delivered = sentIds !== null;
            for (const id of sentIds ?? []) store.trackBotMessage(id, session);
            const lastId = sentIds?.at(-1);
            if (lastId && pendingToStore && askBody?.components) {
              pendingToStore.stubMessageId = lastId;
              store.setPendingAsk(session, pendingToStore);
            }
          } else {
            thinking.dispose();
            inflight.end();
            // Dry / test: synthesize bot message id so reply continuity can be tested.
            store.trackBotMessage(`bot_reply_for_${msg.id}`, session);
          }
        } finally {
          // Nothing went out: the next post carries the cap ping.
          if (!delivered) askOwner?.release();
          // SAFE-14.a: the owner's DM — the stop's details when this post
          // claimed the episode's ping, and the pending 80% warning.
          await spendDm.deliver({
            stop: spendStopFor(askRaw, askOwner, channelId),
            warning: result.spendWarning,
          });
        }
      } finally {
        inflight?.end();
        // AGENT-3.a / AGENT-3.b: the next message of this session may start.
        turn.done();
        // SAFE-18 / MEMORY-ACL-6: a card this run raised (a forget request)
        // reaches the owner now.
        void approvals?.deliver();
      }
    },
    onComponent: async (interaction) => {
      // SAFE-18..20 / MEMORY-ACL-6: an Approve/Deny card press or its code
      // form's submit (the owner's DM, so no channel allowlist); the presser
      // must be the owner, re-checked now on every press and submit.
      const card = parseApproveCardCustomId(interaction.customId);
      if (card) {
        // SAFE-19 — typed text only ever comes from the code form's submit,
        // and that form's custom_id only ever comes with typed text; a mix-up
        // (a forged press or submit) is ignored.
        if ((card.decision === "submit") !== (interaction.modalValues !== undefined)) return;
        if (approvals?.has(card.kind)) {
          const mayDecide =
            resolvePermissionLevel({
              userId: interaction.userId,
              roleIds: interaction.roleIds,
              allowlist: config.allowlist,
              adminUserIds: config.adminUserIds,
              adminRoleIds: config.adminRoleIds,
              owner: config.owner ?? null,
              mutedUsers,
            }) >= PermissionLevel.ADMIN;
          await approvals.press(interaction, card, mayDecide);
        } else {
          await interaction.reply({ content: APPROVAL_UNKNOWN_KIND, ephemeral: true });
        }
        return;
      }
      // AGENT-3.a (REQ-discord-303): a run's Stop button — its own branch,
      // apart from the Approve cards and the asks, past the same gates.
      const stopRunId = parseStopRunCustomId(interaction.customId);
      if (stopRunId !== null) {
        // A Stop press carries no typed text; a forged form submit is ignored.
        if (interaction.modalValues !== undefined) return;
        await pressStopButton(interaction, stopRunId);
        return;
      }
      const parsed = parseAskCustomId(interaction.customId);
      if (!parsed) return;
      // DISCORD-ASK-4.a — typed text only ever comes from the Answer form's
      // submit, and that form's custom_id only ever comes with typed text; a
      // mix-up (a forged press or submit) is ignored.
      if ((parsed.kind === "answer") !== (interaction.modalValues !== undefined)) return;

      // AUTONOMY-6.a — a schedule run's ask (its id is the run id): answered
      // or cancelled by the schedule's creator or the owner, never lapsing
      // while open (src/discord/schedule-ask.ts).
      if (isScheduleAskId(parsed.askId)) {
        await handleScheduleAskPress(interaction, parsed, {
          store: scheduleStore,
          allowlist: config.allowlist,
          owner: config.owner ?? null,
          adminUserIds: config.adminUserIds,
          adminRoleIds: config.adminRoleIds,
          mutedUsers,
          rateLimit: { state: rateLimitState, config: rateLimitConfig },
          people: () => declaredPeople(),
          ...(replyRef.fn ? { post: replyRef.fn } : {}),
          ...(recordAudit ? { recordAudit } : {}),
        });
        return;
      }

      // SESSION-MULTI-3: any open ask of the session answers by its askId,
      // not only the newest one.
      const pressed = store.findPendingAsk(parsed.askId);
      const session = pressed?.session;
      // DISCORD-ASK-5 / REQ-discord-045 — an ask that is no longer open (timed
      // out and dropped, or its session TTL-purged) still knows where its talk
      // lived, so a press on it passes the same channel gate as a live one.
      const closed = pressed ? undefined : store.findClosedAsk(parsed.askId);

      // DISCORD-5 / DISCORD-DENY-2/3 / REQ-discord-212 — a press counts only in
      // an allowlisted channel (inside the session's thread, its allowlisted
      // parent counts, DISCORD-2.a), and only while the session's own channel
      // is still allowlisted, since the resumed run posts there. Otherwise the
      // ack is ephemeral only: the tip for an admin, zero-width for anyone else.
      // REQ-discord-201 / REQ-discord-010 — then the actor and mute/rate gates
      // chat and slash run (ALLOW-5 / DISCORD-6), on open and pick alike, so a
      // deny-listed, unlisted or muted user cannot keep a session going by
      // buttons. A press needs an ack, so every refusal is ephemeral: the
      // zero-width ack for an actor deny (DISCORD-DENY-3), MUTED /
      // RATE_LIMITED for mute/rate. The pending ask is left as it was.
      if (!(await pressPassesGates(interaction, session ?? closed))) return;

      // Only a schedule ask has a Cancel button (AUTONOMY-6.a); a cancel
      // press on a session ask is a forged or stale one.
      if (parsed.kind === "cancel") {
        await interaction.reply({
          content: "This choice isn’t for you (or it was already answered).",
          ephemeral: true,
        });
        return;
      }

      const pending = pressed?.ask ?? null;

      // DISCORD-ASK-5 / REQ-discord-045 — the requester's press on an ask that
      // is no longer open because it timed out (dropped, not promoted, when a
      // newer ask was picked) or its session was TTL-purged is a late press:
      // "that choice expired", no agent run. Another user's press on it still
      // gets the not-for-you reply below, as on a live ask.
      if (!pending && closed && closed.userId === interaction.userId) {
        await interaction.reply({ content: ASK_CHOICE_EXPIRED, ephemeral: true });
        return;
      }

      // Wrong user or unknown ask → short ephemeral, do not leak.
      if (!session || !pending || session.userId !== interaction.userId) {
        await interaction.reply({
          content: "This choice isn’t for you (or it was already answered).",
          ephemeral: true,
        });
        return;
      }

      // PLUGIN-5.a (REQ-discord-157): while /work is turned off, the
      // requester's press on a /work talk's ask (open, pick, or the Answer
      // form) gets the turned-off line privately (the owner also sees why)
      // and resumes nothing; the ask stays open.
      if (workStore.isWorkSession(session.id)) {
        const work = extraState("work");
        if (!work.on) {
          await interaction.reply({
            content: extraOffReply("work", work, isOwnerDiscord(config.owner, interaction.userId)),
            ephemeral: true,
          });
          return;
        }
      }

      if (isAskExpired(pending)) {
        // DISCORD-ASK-4.a: a late Answer press or form submit on a free-text
        // ask leaves it pending, so a reply still answers it as before; a
        // button ask is cleared as a late press (DISCORD-ASK-5).
        if (pending.options?.length) store.clearPendingAsk(session, pending.askId);
        await interaction.reply({
          content: ASK_CHOICE_EXPIRED,
          ephemeral: true,
        });
        return;
      }

      if (parsed.kind === "open") {
        const options = pending.options;
        if (!options?.length) {
          // DISCORD-ASK-4.a — the Answer button opens the private form (a
          // modal, interaction response type 9) for the requester only.
          if (interaction.showModal) {
            await interaction.showModal(buildAnswerModal(pending));
            return;
          }
          await interaction.reply({
            content: "No choices available — reply in the channel instead.",
            ephemeral: true,
          });
          return;
        }
        await interaction.reply({
          content: formatAskEphemeralContent(pending),
          ephemeral: true,
          components: buildChoiceComponents(pending.askId, options),
        });
        return;
      }

      const prior = pending.question;
      const people = declaredPeople();
      // IDENTITY-8..12: the presser's role, as on the chat path (their
      // Discord role ids included, so a team member allowlisted by role is
      // team here as in chat). Resolved at press time, before the run:
      // SAFE-12/13 need to know whose words a typed answer or a picked label
      // is (SAFE-12.a).
      const actingRole = resolveDiscordActingRole({
        userId: interaction.userId,
        roleIds: interaction.roleIds,
        allowlist: config.allowlist,
        adminUserIds: config.adminUserIds,
        adminRoleIds: config.adminRoleIds,
        owner: config.owner ?? null,
        mutedUsers,
        people,
      });
      const actingIsAdmin = actingRole === "owner";
      // The human's answer (a chosen label or the privately typed text) and
      // the prior-question block the resumed run gets ahead of it. `spoken`
      // is the answer as the model gets it (SAFE-12 / SAFE-12.a).
      let answer: string;
      let spoken: string;
      let priorBlock: string;
      if (parsed.kind === "answer") {
        // DISCORD-ASK-4.a — the private Answer form's submit. It passed the
        // same channel, actor, mute/rate, not-yours and expiry gates as a
        // press above. A button ask is answered by its buttons, not a form.
        if (pending.options?.length) {
          await interaction.reply({
            content: "This choice isn’t for you (or it was already answered).",
            ephemeral: true,
          });
          return;
        }
        // SAFE-6: scrubbed before it reaches the run or the session thread.
        answer = normalizeAskAnswer(interaction.modalValues?.[ASK_ANSWER_INPUT_ID]);
        // AUTONOMY-6: an explicit cancel typed in the form drops every open
        // ask of the session, as the same word in a reply does; nothing runs
        // and the ack stays private.
        if (isCancelAsk(answer)) {
          store.setPendingAsk(session, null);
          await interaction.reply({ content: ASK_CANCELLED_ACK, ephemeral: true });
          return;
        }
        // AUTONOMY-5: a thin answer (`ok`, emoji-only, blank) is not an
        // answer — as for a thin reply, the question is restated once (here
        // privately, with the Answer button again), the ask stays and nothing
        // runs.
        if (isThinAck(answer)) {
          const restated = formatAskReply({ ask: pending, owner: null, answerButton: true });
          await interaction.reply({
            content: restated.content,
            ephemeral: true,
            components: buildAnswerStubComponents(pending.askId),
          });
          return;
        }
        // SAFE-13: typed text is scanned exactly as the same words in a chat
        // reply in this session are (never the owner's own). A hit runs
        // nothing and leaves the ask open; the submit is refused privately,
        // the owner is pinged once in a fresh post in the session's channel
        // (an interaction reply notifies no mention) and one
        // `injection-suspected` row is audited. As in chat, the session is
        // kept and the refusal post is tracked on it.
        const suspected = inboundInjection(answer, actingRole);
        if (suspected) {
          const sentRefusal = await refuseInjectedAnswer(
            {
              owner: config.owner ?? null,
              ...(replyRef.fn ? { post: replyRef.fn } : {}),
              recordAudit,
            },
            interaction,
            suspected,
            {
              sessionId: session.id,
              channelId: session.threadId ?? session.channelId,
              stubMessageId: pending.stubMessageId ?? interaction.messageId,
            },
          );
          store.trackBotMessage(sentRefusal?.messageId ?? `bot_reply_for_${interaction.id}`, session);
          return;
        }
        // Claim immediately so a reply or a second submit cannot resume twice.
        store.clearPendingAsk(session, pending.askId);
        await interaction.reply({ content: ASK_ANSWER_ACK, ephemeral: true });
        // Exactly the block a reply that answers a free-text ask gets.
        priorBlock = `[Prior clarifying question you asked (the human is answering it now):\n${prior}]`;
        // SAFE-12: a non-owner's typed answer reaches the model fenced as
        // untrusted data, as their chat reply would; the owner's is unchanged.
        spoken = fenceSpeakerText(answer, actingRole, "ask-answer");
      } else {
        // SAFE-12.a: only one of the ask's own options can answer it. A
        // pressed option id that matches none of them (a forged or stale id,
        // or a pick id on a free-text ask) is treated as expired: no run, the
        // ask stays as it was, and the raw id never reaches a prompt.
        const label = findOptionLabel(pending.options, parsed.optionId);
        if (label === undefined) {
          await interaction.reply({ content: ASK_CHOICE_EXPIRED, ephemeral: true });
          return;
        }
        answer = label;
        // pick — claim immediately so a concurrent re-press cannot double-resume.
        // Only the pressed ask: the session's other open asks stay (SESSION-MULTI-3).
        store.clearPendingAsk(session, pending.askId);
        // DISCORD-ASK-8 — strip option buttons on the ephemeral right away.
        await interaction.reply({
          content: `Got it — **${answer}**. Working on it…`,
          ephemeral: true,
          update: true,
          components: [],
        });
        priorBlock = `[Prior clarifying question you asked (the human answered via Discord button):\n${prior}]`;
        // SAFE-12.a: the model wrote the label, but it may have copied it
        // from a non-owner's own (fenced) words, so a team or community
        // presser's pick reaches the model as their words, inside the same
        // fence as their typed answer (role resolved above at press time).
        // The owner's pick is unchanged.
        spoken = fenceSpeakerText(answer, actingRole, "ask-pick");
      }

      const channelId = session.threadId ?? session.channelId;
      const stubId = pending.stubMessageId ?? interaction.messageId;
      // AGENT-3.a / AGENT-3.b (REQ-discord-301): the resumed run takes its
      // session's turn — behind a run of that session still going, it waits
      // (first in, first out) and then goes on as it would have.
      const turn = runControl.enqueue({
        sessionId: session.id,
        requesterId: interaction.userId,
        channelId,
      });
      // REQ-discord-311: a button pick runs the agent like a message reply, so
      // it is recorded while in flight (and while it waits its turn) too and
      // cleared on every exit path; kept only when the bridge stops mid-reply.
      // The Choose stub is reused as the progress surface (DISCORD-ASK-7), so
      // the row's progress message is usually the stub itself.
      const inflight = stubId
        ? trackInflight({
            sessionId: session.id,
            channelId,
            parentChannelId: session.threadId ? session.channelId : null,
            requestMessageId: stubId,
          })
        : undefined;
      try {
        if (!(await turn.ready)) {
          // The bridge is stopping: nothing starts; the row stays so the
          // next start marks this reply interrupted.
          inflight?.keep();
          return;
        }
        // After waiting, the session may have ended, idled out or had its
        // user forgotten (MEMORY-ACL-6), or the press may no longer pass the
        // channel, actor or mute gate (`/admin` changes and mutes are live):
        // then nothing runs or is posted.
        if (
          turn.waited &&
          (store.get(session.id) !== session ||
            turn.requesterForgotten ||
            !waitedPressStillAllowed(interaction, session, {
              allowlist: config.allowlist,
              owner: config.owner ?? null,
              mutedUsers,
            }))
        ) {
          try {
            await interaction.deleteReply?.();
          } catch {
            /* already gone */
          }
          return;
        }

        // AGENT-6 (REQ-discord-072): the earlier turns (the original request
        // included) go ahead of the answered question, as on a chat reply; the
        // answer (a pick or an Answer form submit) joins the thread as the run
        // starts. SESSION-5/6: condensed at about 80% of the window, as in chat.
        const agentPrompt = store.threadPrompt(
          session,
          `${priorBlock}\n\nHuman answer:\n${spoken}`,
        );
        store.recordTurn(session, "human", answer);

        const outbound = resolveOutbound();
        const llmModel = loadLlmEnv(process.env).model;
        // DISCORD-15.a: tokens and cost show on the owner's own runs only.
        const ownerRun = isOwnerDiscord(config.owner, interaction.userId);
        const thinking = new ThinkingStatus({
          outbound,
          channelId,
          replyToMessageId: stubId,
          existingMessageId: stubId,
          sessionId: session.id,
          model: llmModel,
          showUsage: ownerRun,
          // AGENT-3.a (REQ-discord-303): the run's Stop button takes the
          // Choose / Answer button's place on the stub while it runs.
          components: buildStopComponents(turn.runId),
          debounceMs: opts.thinkingDebounceMs,
          tickMs: opts.thinkingTickMs,
        });
        await thinking.start({ description: "Working on your request..." });
        inflight?.progress(thinking.progressMessageId);
        // AGENT-3.a: a reply 'stop' / 'cancel' to this progress message, or
        // its Stop button, stops the run.
        turn.setProgressMessage(thinking.progressMessageId);

        // SESSION-WORKTREE-3 / REQ-discord-357: bind on every turn, as the chat
        // path does, so a parked or missing worktree is re-created, never the
        // repo root or a dead directory.
        const bound = await store.bindWorktree(session);
        if (!bound.ok) {
          await thinking.fail(`❌ worktree: ${bound.error}`);
          try {
            await interaction.deleteReply?.();
          } catch {
            /* ignore */
          }
          return;
        }
        const sessionCwd = store.cwdFor(session);

        let result;
        try {
          let enrichedPrompt = agentPrompt;
          // IDENTITY-4 / REQ-discord-446 — the presser's Discord names, as on
          // the chat path (the presser is the session's user, checked above).
          const idInject = enrichPromptWithIdentity(enrichedPrompt, {
            userId: interaction.userId,
            displayName: interaction.userDisplayName,
            username: interaction.userUsername,
            owner: config.owner ?? null,
            people,
          });
          if (idInject.injected) enrichedPrompt = idInject.prompt;

          // MEMORY-5..7: as on the chat path (role resolved above).
          const memInject = enrichPromptWithMemories(
            enrichedPrompt,
            memoryStore,
            {
              ...memoryInjectOptsFor({
                userId: interaction.userId,
                people,
                role: actingRole,
                projectDir: sessionCwd ?? config.projectRoot,
              }),
              // MEMORY-9: search memory for the picked / typed answer.
              query: answer,
            },
          );
          if (memInject.injected) enrichedPrompt = memInject.prompt;

          // AUTONOMY-10.a (REQ-discord-099): as on a chat run.
          const replyPublicThread = await publicReplies.mustHold(channelId);

          result = await store.runActive(session, () =>
            agent.runChat({
              prompt: enrichedPrompt,
              humanText: answer,
              sessionId: session.id,
              resume: true,
              actingUserId: interaction.userId,
              actingIsAdmin,
              actingRole,
              // SAFE-3.a: an ask answer continuing this talk, in its own
              // worktree; the shell gate re-checks the owner and the worktree.
              surface: "ask",
              cwd: sessionCwd,
              // AGENT-3.a: a stop (or the bridge stopping) kills its process tree.
              signal: turn.signal,
              // DISCORD-17: files attach in this conversation's channel only.
              replyChannelId: channelId,
              ...(session.threadId ? { replyParentChannelId: session.channelId } : {}),
              replyPublicThread,
              onStatus: (u) => {
                void thinking.update({
                  tool: u.tool,
                  tokens: u.tokens,
                  description: u.message ? `⏳ ${u.message}` : undefined,
                });
              },
            }),
          );
        } catch (err) {
          // DISCORD-3.b: as on a chat run.
          const failed = `❌ ${await failedRunReply({
            run: { failureReason: err instanceof Error ? err.message : undefined },
            ownerRun,
            surface: "ask",
            channelId,
            ownerDm: failureDm,
          })}`;
          store.recordTurn(session, "agent", failed);
          await thinking.fail(failed);
          try {
            await interaction.deleteReply?.();
          } catch {
            /* ignore */
          }
          throw err;
        }

        // AGENT-3: the bridge is stopping and the run was killed. Nothing is
        // posted; the row stays, so the next start marks this reply
        // interrupted (REQ-discord-311).
        if (turn.stopReason === "closed") {
          inflight?.keep();
          thinking.dispose();
          return;
        }
        // AGENT-3.a (REQ-discord-302): a stopped run's answer is only
        // "⏹ Stopped" with the DISCORD-15/15.a footer — no question, no body.
        let stopped = turn.stopReason === "stopped";

        const plumbing = result.task
          ? formatTaskPlumbing({
              state: result.task.state,
              verified: result.task.verified,
              verifySkipped: result.task.verifySkipped,
              attempts: result.task.attempts,
              cancelled: result.task.cancelled,
              // AGENT-12: `stopped=turn-cap|idle-timeout`, plumbing only (AGENT-9).
              stopReason: result.task.stopReason,
            })
          : undefined;
        // DISCORD-15/15.a: the answer footer adds tokens and cost on owner runs.
        // AGENT-11: the model that answered ("b (fell back from a)"), each
        // model priced at its own price.
        const thinkExtras = {
          plumbing,
          model: answerModelFor(result, llmModel),
          ...(ownerRun ? { spend: answerSpendFor(result.usage, llmModel, result.usageByModel) } : {}),
        };

        // SAFE-8: as on a chat reply — a spend-cap stop is free text, pings the
        // owner once per cap episode and is never the pending ask.
        const askRaw = stopped ? undefined : result.ask;
        const spendCap = askRaw?.reason === "spend-cap";
        const askOwner = askRaw ? askPingOwner(askRaw, config.owner, spendAlerts) : null;
        const resolvedOptions =
          askRaw && !spendCap
            ? resolveAskOptions({
                options: askRaw.options,
                question: askRaw.question,
              })
            : undefined;
        const useButtons = Boolean(resolvedOptions?.length);
        let askBody: {
          content: string;
          mentionUserIds: string[];
          status: string;
          failed: boolean;
          ownerPinged?: boolean;
          components?: unknown[];
          /** Answer button, not a Choose stub: keep the footer (DISCORD-ASK-4.a). */
          keepFooter?: boolean;
        } | null = null;
        let pendingToStore: PendingAsk | null = null;

        if (askRaw && useButtons && resolvedOptions) {
          const next = toPendingAsk({ ...askRaw, options: resolvedOptions });
          const stub = formatAskStub({
            ask: next,
            ownerDiscordId: config.owner?.discordId,
            requesterDiscordId: interaction.userId,
          });
          askBody = {
            content: stub.content,
            mentionUserIds: stub.mentionUserIds,
            status: stub.status,
            failed: stub.failed,
            ownerPinged: Boolean(
              config.owner?.discordId &&
                stub.mentionUserIds.includes(config.owner.discordId),
            ),
            components: buildOpenStubComponents(next.askId),
          };
          pendingToStore = next;
        } else if (askRaw) {
          // DISCORD-ASK-4.a: as on a chat reply — a free-text follow-up ask
          // gets the Answer button (never a spend-cap stop).
          const answer = spendCap ? null : answerAskFor({ ask: askRaw });
          const formatted = formatAskReply({
            ask: askRaw,
            owner: askOwner?.owner,
            requesterDiscordId: interaction.userId,
            context: result.summary,
            replyHint: true,
            answerButton: Boolean(answer),
          });
          askBody = {
            content: formatted.content,
            mentionUserIds: formatted.mentionUserIds,
            status: formatted.status,
            failed: formatted.failed,
            ownerPinged: formatted.ownerPinged,
            ...(answer ? { components: answer.components, keepFooter: true } : {}),
          };
          pendingToStore = answer?.pending ?? null;
        }

        // MEMORY-7.a (REQ-discord-710): as on a chat reply — private replies
        // go to the presser (the session's own user) by DM only.
        const privateOutcome = await deliverPrivateReplies({
          replies: result.privateReplies,
          userId: interaction.userId,
          sendDm: sendDmRef.fn,
        });
        let body = withPrivateNote(
          stopped
            ? RUN_STOPPED_TEXT
            : askBody
            ? askBody.content
            : result.ok
              ? // DISCORD-16: the whole answer; it is split into messages when long.
                result.summary
              : // DISCORD-3.b: as on a chat run.
                await failedRunReply({ run: result, ownerRun, surface: "ask", channelId, ownerDm: failureDm }),
          privateOutcome,
        );
        // SAFE-14.a: as on a chat reply — no spend amounts ride the post.
        // SAFE-13: a tool result that looked like an injection pings the owner
        // on the same post.
        let out: { content: string; mentionUserIds?: string[] } = withInjectionNotice(
          {
            content: body,
            ...(askBody ? { mentionUserIds: askBody.mentionUserIds } : {}),
          },
          result.injection,
          config.owner,
          // DISCORD-16: the answer is split into messages, so the SAFE-13
          // line never cuts it down to one message.
          DISCORD_ANSWER_MAX,
        );

        // AUTONOMY-10 / 10.a (REQ-discord-099): as on a chat reply — model
        // text in a public thread waits for the owner's OK on the stub.
        const held = await holdRunReply({
          thinking,
          channelId,
          content: out.content,
          modelText: !stopped && (askBody ? !spendCap : result.ok),
          requester: interaction.userId,
          surface: "ask",
          signal: turn.signal,
        });
        if (!held.post && (turn.stopReason as RunStopReason | undefined) === "closed") {
          inflight?.keep();
          thinking.dispose();
          return;
        }
        let notPosted: string | null = null;
        if (!held.post) {
          stopped = turn.stopReason === "stopped";
          notPosted = stopped ? RUN_STOPPED_TEXT : publicReplyNotPostedText(held.outcome);
          askBody = null;
          pendingToStore = null;
          body = notPosted;
          out = { content: notPosted };
        } else if (held.held) {
          out = { ...out, content: held.text };
          // DISCORD-ASK-5: a held question's buttons last ~30 minutes from
          // when it goes out, not from before the owner's OK.
          if (pendingToStore) pendingToStore.expiresAt = askExpiresAt();
        }
        const failedLook = stopped || notPosted !== null || (askBody ? askBody.failed : !result.ok);

        // The pick already cleared the answered ask; store a follow-up ask
        // (never a SAFE-8 spend-cap stop, which a reply cannot answer) once
        // it is going out (a held question, AUTONOMY-10.a).
        if (pendingToStore) {
          store.setPendingAsk(session, pendingToStore);
        }
        // AGENT-6: the answer to the pick joins the session's thread.
        store.recordTurn(
          session,
          "agent",
          answerTurnText(body, notPosted !== null ? null : (pendingToStore ?? askRaw)),
        );
        let delivered = false;
        try {
          // DISCORD-ASK-7 — edit stub/thinking into the final answer (no Done+extra).
          // DISCORD-3.a — footer-only embed (model + plumbing) on the answer.
          const collapsed = await thinking.finalizeContent({
            content: out.content,
            components: askBody?.components,
            keepFooter: askBody?.keepFooter,
            mentionUserIds: out.mentionUserIds,
            extras: thinkExtras,
            failed: failedLook,
          });
          if (collapsed) {
            delivered = true;
            // The stub/thinking message is now the answer: nothing to recover.
            inflight?.end();
            // DISCORD-2 / DISCORD-16: a reply to any part continues the session.
            for (const id of collapsed.messageIds) store.trackBotMessage(id, session);
            if (pendingToStore && askBody?.components) {
              // The Choose button rides the last part (a stub is one part).
              pendingToStore.stubMessageId = collapsed.messageIds.at(-1) ?? collapsed.messageId;
              store.setPendingAsk(session, pendingToStore);
            }
            // As on a chat answer: the edit's mentions get one fresh ping post.
            const ping = await postCollapsedPing({
              post: replyRef.fn,
              channelId,
              replyToMessageId: collapsed.messageId,
              mentionUserIds: out.mentionUserIds,
              questionUserIds: askRaw?.reason === "clarify" ? askBody?.mentionUserIds : undefined,
            });
            if (ping) store.trackBotMessage(ping.messageId, session);
          } else if (replyRef.fn) {
            if (stopped) {
              await thinking.fail(RUN_STOPPED_TEXT, thinkExtras);
            } else if (notPosted !== null) {
              await thinking.fail(notPosted, thinkExtras);
            } else if (askBody) {
              await (askBody.failed
                ? thinking.fail(askBody.status, thinkExtras)
                : thinking.done(askBody.status, thinkExtras));
            } else if (result.ok) {
              await thinking.done("✅ Done", thinkExtras);
            } else {
              await thinking.fail(`❌ exit ${result.exitCode}`, thinkExtras);
            }
            // DISCORD-15/16: footer on the last part, split at 2000 characters.
            const sentIds = await postAnswerParts(replyRef.fn, {
              channelId,
              content: out.content,
              // A Choose stub carries no footer; an Answer button keeps it
              // (DISCORD-ASK-4.a).
              footer:
                askBody?.components && !askBody.keepFooter
                  ? null
                  : thinking.answerFooter({
                      extras: thinkExtras,
                      failed: failedLook,
                    }),
              replyToMessageId: pending.stubMessageId ?? interaction.messageId,
              ...(out.mentionUserIds ? { mentionUserIds: out.mentionUserIds } : {}),
              ...(askBody?.components ? { components: askBody.components } : {}),
              ...(askBody?.keepFooter ? { keepFooter: true } : {}),
            });
            inflight?.end();
            delivered = sentIds !== null;
            for (const id of sentIds ?? []) store.trackBotMessage(id, session);
            const lastId = sentIds?.at(-1);
            if (lastId && pendingToStore && askBody?.components) {
              pendingToStore.stubMessageId = lastId;
              store.setPendingAsk(session, pendingToStore);
            }
          } else {
            thinking.dispose();
            inflight?.end();
          }
        } finally {
          // Nothing went out: the next post carries the cap ping.
          if (!delivered) askOwner?.release();
          // SAFE-14.a: the owner's DM, as on a chat reply.
          await spendDm.deliver({
            stop: spendStopFor(askRaw, askOwner, channelId),
            warning: result.spendWarning,
          });
        }

        // DISCORD-ASK-8 — drop the ephemeral "Got it… Working…" once resume finishes
        // so buttons cannot linger and the dismissible half-done UI goes away.
        try {
          await interaction.deleteReply?.();
        } catch {
          /* already gone or gateway lacks deleteReply */
        }
      } finally {
        inflight?.end();
        // AGENT-3.a / AGENT-3.b: the next run of this session may start.
        turn.done();
        // SAFE-18 / AGENT-18 hi drafts: a card this run raised reaches the owner now.
        void approvals?.deliver();
      }
    },
    onSlash: async (interaction) => {
      await handleSlashInteraction(buildSlashCtx(), interaction);
    },
    getAllowlistedChannelIds: () => config.channelIds,
    // DISCORD-DENY-3 / ADMIN-4 / REQ-discord-431 — channel autocomplete only
    // lists channels for ADMIN in an allowlisted channel, checked in the slash
    // gate order (channel → actor → ADMIN with the live mute set). No rate
    // hit: autocomplete fires per keystroke and never runs anything.
    mayAutocompleteChannels: ({ channelId, userId, roleIds }) =>
      gateChannel(channelId, config.allowlist).ok &&
      gateActor({
        userId,
        roleIds,
        allowlist: config.allowlist,
        owner: config.owner ?? null,
      }).ok &&
      resolvePermissionLevel({
        userId,
        roleIds,
        allowlist: config.allowlist,
        adminUserIds: config.adminUserIds,
        adminRoleIds: config.adminRoleIds,
        owner: config.owner ?? null,
        mutedUsers,
      }) >= PermissionLevel.ADMIN,
    onReady: (id) => {
      console.log(`[discord] bot user id ${id}; monitoring ${config.channelIds.length} channel(s)`);
      // DISCORD-ANNOUNCE-4 — post bridge-live note only to configured announce channel;
      // PERSONA-1.a — one short in-voice line linking the release notes (fixed template).
      // AUTONOMY-10.b — system text, not an announcement: no Approve card, no reply gate.
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
      embedRef.editMessage = h.editMessage;
      embedRef.deleteMessage = h.deleteMessage;
      sendDmRef.fn = h.sendDm;
      publicThreadRef.fn = h.isPublicThread;
      return gw;
    });

  let scheduler: SchedulerService | null = null;
  let backup: BackupTicker | undefined;
  if (!opts.disableScheduler) {
    // OPS-1/2 (#68): nightly backup + restore test on the scheduler tick
    // (CORVIDINHO_BACKUP_DIR; off when unset). A failure tells the owner once
    // per failure streak: fixed text in the announcements channel
    // (DISCORD-ANNOUNCE) with only the owner pinged; with no channel set the
    // notice waits (logged once, shown by doctor) and is retried every tick.
    backup = db
      ? createBackupTicker({
          db,
          env,
          log: consoleBackupLog,
          notify: async ({ content }) => {
            const channelId = announceStore?.getChannelId();
            if (!channelId || !replyRef.fn) return false;
            const ownerId = config.owner?.discordId;
            const sent = await replyRef.fn({
              channelId,
              content: ownerId ? `<@${ownerId}> ${content}` : content,
              ...(ownerId ? { mentionUserIds: [ownerId] } : {}),
            });
            return sent !== null;
          },
        })
      : undefined;
    // PLUGIN-5.a: schedules on/off, read at every tick; one log line per
    // change (the start-up line above covers the first read), so an
    // unreadable file is not logged again on every tick.
    const schedulesState = trackExtraState(
      () => loadExtrasToggles({ installRoot: config.projectRoot, env }).schedule,
      (state, previous) => {
        if (!previous) return;
        const line = `[discord] scheduler ${formatExtraStateLog("schedule", state)}`;
        if (state.on) console.log(line);
        else console.warn(line);
      },
    );
    scheduler = new SchedulerService({
      store: scheduleStore,
      agent,
      allowlist: config.allowlist,
      // PLUGIN-5.a: only the schedules part of the tick is gated; cards,
      // stuck-ask DMs, schedule asks, spend DMs and the backup keep running.
      schedulesEnabled: () => schedulesState().on,
      pollIntervalMs: opts.schedulerPollIntervalMs,
      ...(opts.schedulerNow ? { now: opts.schedulerNow } : {}),
      defaultProjectRoot: config.projectRoot,
      owner: config.owner ?? null,
      // DISCORD-SCHEDULE-1.a: each run re-reads the owner config (the same
      // file and env overlay as at start), so only the owner as configured
      // now gets the owner stamp for their own schedule.
      loadOwner: async () =>
        (await loadOwnerConfig({ env, filePath: config.allowlist.sourcePath })).owner,
      spendAlerts,
      // SAFE-18..20: a tick also runs a card pass (the engine's own poll is
      // the main trigger, so cards still go out with the scheduler off);
      // AGENT-16.a: and DMs the owner each stuck WATCH ask.
      ...(approvals || watchAsks
        ? {
            onTick: () => {
              void approvals?.deliver();
              void watchAsks?.deliver();
            },
          }
        : {}),
      backup,
      // SAFE-12/13 (#71): a tick resolves the creator's role with the live
      // mute set, and its injection refusal lands on the bridge's trail.
      mutedUsers,
      ...(recordAudit ? { recordAudit } : {}),
      // SAFE-14.a: every tick retries the owner's spend DMs; a schedule run's
      // warning and cap stop go there, never into the schedule's post.
      spendDm,
      // DISCORD-3.b: a failed run of someone else's schedule DMs the owner why.
      failureDm,
      // AGENT-3.c (REQ-discord-304): each run takes a turn on the chat runs'
      // run control and shows their Stop button (in its channel, or with no
      // channel in the owner's DM), so the owner or the schedule's creator
      // stops it the same way as a chat run.
      runStop: scheduleRunStop,
      outbound: {
        post: async ({ channelId, content, mentionUserIds, components, modelText }) => {
          if (!replyRef.fn) return false;
          let text = content;
          if (modelText) {
            // AUTONOMY-10 / 10.a (REQ-discord-099): a schedule's result or
            // ask (model text) in a public thread waits for the owner's OK
            // while fewer than 20 replies were approved. A deny or lapse is
            // final (not posted, not retried: true); a stop, no owner or no
            // card hands an ask back for a later pass (false).
            const held = await publicReplies.hold({ channelId, text: content, surface: "schedule" });
            if (!held.post) return held.outcome === "denied" || held.outcome === "expired";
            text = held.text;
          }
          return (
            (await replyRef.fn({
              channelId,
              content: text,
              mentionUserIds,
              ...(components ? { components } : {}),
            })) !== null
          );
        },
        // AUTONOMY-6.a: a schedule with no channel sends its ask, controls
        // and wait note to the owner by DM (the approval engine's sendDm).
        dm: async ({ userId, content, components }) =>
          (await sendDm({ userId, content, ...(components ? { components } : {}) })) !== null,
      },
      // Start after gateway is up; construct with manual then start below.
      manual: true,
    });
  }
  if (scheduler) {
    // REQ-discord-346: schedule runs a dead process left "running" are failed
    // and their worktrees removed before the first tick; runs another live
    // process (e.g. `corvidinho daemon`) owns are left alone.
    const recovered = await scheduler.recoverAbandoned();
    if (recovered.runs.length > 0 || recovered.worktrees.length > 0) {
      console.log(
        `[discord] restart recovery: ${recovered.runs.length} interrupted schedule run(s) marked failed, ${recovered.worktrees.length} leftover schedule worktree(s) removed`,
      );
    }
  }

  const gateway = await factory(config, handlers);
  // If factory is createLiveGateway-like, reply is set inside; for custom, allow handlers.reply
  if (handlers.reply) replyRef.fn = handlers.reply;
  if (handlers.sendEmbed) embedRef.send = handlers.sendEmbed;
  if (handlers.editEmbed) embedRef.edit = handlers.editEmbed;
  if (handlers.editMessage) embedRef.editMessage = handlers.editMessage;
  if (handlers.deleteMessage) embedRef.deleteMessage = handlers.deleteMessage;
  if (handlers.sendDm) sendDmRef.fn = handlers.sendDm;
  if (handlers.isPublicThread) publicThreadRef.fn = handlers.isPublicThread;

  try {
    await gateway.start();
  } catch (err) {
    // REQ-discord-417: a rejected login is a clean non-zero exit, not a
    // DiscordAPIError dump and Bun crash footer. The scheduler is not
    // started yet; tear down the half-started client so the process can end.
    await Promise.resolve()
      .then(() => gateway.stop())
      .catch(() => undefined);
    return { ok: false, exitCode: 1, message: formatDiscordLoginFailure(err, { env }) };
  }
  if (inflightReplies && interruptedReplies.length > 0) {
    // After login: the REST calls need the token. Sequential, never throws.
    // Only rows still present are unfinished: a reply whose thinking message
    // was collapsed into the answer (DISCORD-ASK-6/7) deleted its row then.
    const outbound = resolveOutbound();
    const r = await recoverInterruptedReplies({
      store: inflightReplies,
      rows: interruptedReplies,
      // DISCORD-5: only channels (or a thread's parent) still allowlisted
      // now; a deny on the thread or its parent wins (REQ-plugins-005).
      mayPost: (row) =>
        isMonitoredConversation(row.channelId, row.parentChannelId, config.allowlist),
      editEmbed: (o) => outbound.editEmbed(o),
      reply: replyRef.fn,
    });
    console.log(
      `[discord] restart recovery: ${interruptedReplies.length} interrupted reply(ies) — ${r.edited} embed(s) marked interrupted, ${r.replied} replied, ${r.failed} unreachable, ${r.skipped} skipped (channel not allowlisted)`,
    );
  }
  scheduler?.start();
  // AGENT-16.a: tell the watch process a bridge that can DM the owner runs
  // on this data dir (its ticker delivers stuck WATCH asks).
  const bridgeRunner =
    db && scheduler && watchAsks && sendDmRef.fn ? markBridgeRunning(db) : undefined;
  // SAFE-18..20: the card engine's own poll (DMs undelivered cards, closes
  // expired requests as a no, tells askers), with or without the scheduler.
  approvals?.start(opts.approvalPollMs ?? APPROVAL_POLL_MS);
  // AGENT-6.a: retained conversations go 30 days after their last update,
  // also while the bridge sits idle (reads and writes purge too).
  const conversationPurge = setInterval(
    () => store.purgeExpiredConversations(),
    CONVERSATION_PURGE_INTERVAL_MS,
  );
  conversationPurge.unref?.();
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
    ...(approvals
      ? {
          deliverApprovalCards: () => approvals.deliver(),
          deliverForgetCards: () => approvals.deliver(),
        }
      : {}),
    mutedUsers,
    rateLimitState,
    muteUser: (userId: string) => muteUserImpl(mutedUsers, userId),
    unmuteUser: (userId: string) => unmuteUserImpl(mutedUsers, userId),
    stop: async () => {
      clearInterval(conversationPurge);
      // AGENT-3: every Discord run still going is stopped (its process tree
      // killed) and no waiting message starts; their in-flight rows stay, so
      // the next start marks those replies interrupted (REQ-discord-311).
      runControl.close();
      // AUTONOMY-10.a: a reply still waiting for the owner's OK is not posted.
      publicReplies.close();
      approvals?.stop();
      scheduler?.stop();
      // AGENT-16.a: no further stuck WATCH ask is taken, and the watch
      // process no longer counts on this bridge to DM the owner.
      watchAsks?.stop();
      if (db && bridgeRunner) {
        try {
          clearBridgeRunning(db, bridgeRunner);
        } catch (err) {
          console.error(`[discord] bridge mark not cleared: ${formatErrorLine(err)}`);
        }
      }
      // OPS-1: no further backup notice is taken; one in flight is waited
      // for below, and handed back if it outlasts the grace (never lost).
      backup?.stop();
      if (scheduler) {
        // REQ-discord-346: like the daemon, a schedule run still going is
        // recorded failed and its agent tree killed, then gets a short
        // bounded grace to park its worktree before the process exits.
        const abandoned = scheduler.abandonInFlight(
          "interrupted: bridge shutdown",
        );
        if (abandoned.length > 0) {
          console.log(
            `[discord] shutdown: ${abandoned.length} in-flight schedule run(s) recorded failed`,
          );
          await scheduler.settleAbandoned(ABANDONED_SETTLE_MS);
        }
        // REQ-discord-347: a pending-ask post in flight gets the same short
        // grace while the gateway is still up, so its ask is either posted
        // or handed back for the next start, not left taken and unposted.
        await scheduler.settleAskDelivery(ABANDONED_SETTLE_MS);
      }
      await backup?.settle(ABANDONED_SETTLE_MS);
      // AGENT-16.a: a stuck WATCH ask's DM in flight gets the same grace,
      // then is handed back for the next start.
      await watchAsks?.settle(ABANDONED_SETTLE_MS);
      // A card pass in flight gets the same short grace while the gateway is up.
      await approvals?.settle(ABANDONED_SETTLE_MS);
      // The stopped runs get the same grace to wind down.
      await runControl.settle(ABANDONED_SETTLE_MS);
      await gateway.stop();
    },
  };
}

/** How often a running bridge purges retained conversations past 30 days (AGENT-6.a). */
export const CONVERSATION_PURGE_INTERVAL_MS = 60 * 60 * 1000;

export { goLiveChecklist, loadBridgeConfig, memoryThinkingOutbound };
