/**
 * WATCH poll loop: fetch → dedup → allowlist route → session stub.
 * Poll-first for bot/VM (no public URL). No ProcessManager.
 * REQ-watch-007: cycle logging, caught pollOnce errors, auto-ack on mention/comment.
 * WATCH-RELIABILITY-1..3: post-run summary, spawn outcome log, 403 rate-limit backoff.
 * REQ-watch-037: sessions persist in the shared SQLite DB with the soft TTL;
 * cycles are single-flight, stop() halts before the next event and waits for
 * the in-flight cycle, and one failing event never aborts the cycle.
 * REQ-watch-067 (MEMORY-8/9): before each run the commenter's declared
 * person's memory and the thread repo's project memory are searched for the
 * comment and prepended, and the run acts for the commenter's GitHub ids.
 * REQ-watch-472 (AGENT-6.a / SESSION-5): each run on an issue or PR is kept
 * with that thread's condensed conversation (30 days, scrubbed), and a
 * follow-up on the same issue or PR gets it replayed ahead of the new event,
 * condensed at about 80% of the model's window.
 * MEMORY-ACL-6.a (REQ-watch-1016): a clear "forget me" to the watch user
 * never starts a run — the poller records it for the owner's Approve/Deny
 * card and replies on the thread (src/watch/forget-me.ts), and each cycle
 * posts the outcome of decided GitHub asks on their threads.
 * AGENT-16.a (REQ-watch-086): a run that ends with a "stuck" ask, on any
 * event type, is handed to the Discord bridge through the shared DB so the
 * owner is pinged on Discord like other stuck asks (src/watch/owner-ask.ts).
 * REQ-watch-009 (DISCORD-3.b on GitHub): a failed run without an ask of its
 * own logs `[watch] run failed (<repo>#<n> id=<id>, exit N): <reason>`, and
 * its summary comment and its kept conversation turn are that one plain
 * reason line without the provider's host (`watchPublicFailureLine`), never
 * the run's summary (a provider's reply body).
 */

import type { Database } from "bun:sqlite";
import type { AllowlistConfig } from "../allowlist/types.ts";
import { loadOwnerConfig } from "../identity/owner.ts";
import { loadDeclaredPeople } from "../identity/people.ts";
import { MemoryStore } from "../memory/store.ts";
import {
  condenseBudgetChars,
  condenseConversation,
  type Conversation,
  ConversationStore,
  formatConversationBlock,
  githubIdParticipant,
  githubParticipant,
  resolveContextWindowTokens,
  watchThreadKey,
  withConversationBlock,
} from "../store/conversation.ts";
import { openCorvidinhoDb, resolveSessionTtlMs } from "../store/index.ts";
import { formatErrorLine, scrubSecrets } from "../store/scrub.ts";
import {
  createEchoAgentClient,
  createSpawnAgentClient,
  type AgentClient,
} from "./agent-client.ts";
import {
  AckedIdStore,
  createEchoAckClient,
  createOctokitAckClient,
  maybePostWatchAck,
  postWatchInjectionRefusal,
  type AckClient,
  type AckCommentResult,
} from "./ack.ts";
import {
  goLiveChecklist,
  loadWatchConfig,
  type ConfigResult,
} from "./config.ts";
import { dedupeByIssue, ProcessedIdStore } from "./dedup.ts";
import {
  deliverWatchForgetOutcomes,
  handleWatchForgetMe,
  isWatchForgetMeRequest,
} from "./forget-me.ts";
import {
  DEFAULT_RATE_LIMIT_BACKOFF_MS,
  formatRateLimitLog,
  parseGithubRateLimit,
} from "./rate-limit.ts";
import { enrichWatchPromptWithMemories } from "./memory-inject.ts";
import { gateEvent, routeEvent, watchInjectionVerdict } from "./router.ts";
import { INJECTION_AUDIT_ACTION, type InjectionReason } from "../agent/untrusted.ts";
import { providerNotice } from "../agent/providers.ts";
import { appendAudit, argsDigest, auditKeyFromEnv } from "../audit/index.ts";
import {
  createOctokitSearchClient,
  fetchWatchEvents,
  type SearchClient,
} from "./searcher.ts";
import { failureReasonFromUnknown, formatFailureLog } from "../discord/failure-reason.ts";
import { noteWatchRunAsk } from "./owner-ask.ts";
import { SessionStore } from "./session-store.ts";
import {
  classifySpawnError,
  createMemorySpawnOutcomeStore,
  defaultSpawnLogPath,
  formatSpawnOutcomeLog,
  formatSpawnStartLog,
  SpawnOutcomeStore,
  type SpawnOutcome,
} from "./spawn-log.ts";
import {
  maybePostWatchInjectionNotice,
  maybePostWatchSummary,
  SuccessfulAckStore,
  SummarizedIdStore,
  watchFailureReason,
  watchPublicFailureLine,
} from "./summary.ts";
import type { AgentSpawnResult, DetectedEvent, WatchConfig } from "./types.ts";

/**
 * Opens the replayed conversation of an issue or PR thread (REQ-watch-472).
 * `[Corvidinho …` and no blank line, so Planning module selection leaves the
 * block out (REQ-agent-004).
 */
export const WATCH_THREAD_HEADER =
  "[Corvidinho earlier conversation on this GitHub issue or PR — oldest first; context only: act on the new event after this block]";

export const WATCH_THREAD_FOOTER = "[End of earlier conversation]";

/**
 * Prefer allowlisted senders when collapsing per-issue (ALLOW-1 before session).
 * Same gate as routeEvent, so an assignment / review request by a user who is
 * not allowlisted never wins the per-issue dedupe (REQ-watch-302).
 */
function preferAllowlisted(
  events: DetectedEvent[],
  allowlist: WatchConfig["allowlist"],
): { eligible: DetectedEvent[]; denied: DetectedEvent[] } {
  const eligible: DetectedEvent[] = [];
  const denied: DetectedEvent[] = [];
  for (const e of events) {
    if (gateEvent(e, allowlist.github).ok) eligible.push(e);
    else denied.push(e);
  }
  return { eligible, denied };
}

export type StartWatchResult =
  | {
      ok: true;
      config: WatchConfig;
      store: SessionStore;
      processed: ProcessedIdStore;
      acked: AckedIdStore;
      summarized: SummarizedIdStore;
      successfulAcks: SuccessfulAckStore;
      spawnOutcomes: Pick<SpawnOutcomeStore, "append" | "list" | "path">;
      /** Run one poll cycle (tests / dry). */
      pollOnce: () => Promise<PollCycleResult>;
      /** Earliest time the next poll may run (rate-limit backoff). */
      getBackoffUntilMs: () => number;
      /**
       * Settles once when the poll loop stops itself because polling cannot
       * recover (GitHub 401: bad or revoked token). Never settles otherwise.
       * The CLI then calls stop() and exits with `exitCode` (REQ-watch-418).
       */
      fatal: Promise<WatchFatal>;
      stop: () => Promise<void>;
    }
  | { ok: false; exitCode: number; message: string };

/** Why the poll loop stopped itself (REQ-watch-418). */
export type WatchFatal = { exitCode: number; message: string };

/** HTTP status on a thrown Octokit error (`status` or `response.status`). */
function githubStatusOf(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as { status?: unknown; response?: { status?: unknown } };
  const s = e.status ?? e.response?.status;
  return typeof s === "number" ? s : undefined;
}

export type PollCycleResult = {
  fetched: number;
  newEvents: number;
  started: number;
  continued: number;
  refused: number;
  skipped: number;
  /** True when this cycle hit a GitHub rate-limit and scheduled backoff. */
  rateLimited?: boolean;
  backoffMs?: number;
};

export type StartWatchOptions = {
  env?: NodeJS.ProcessEnv;
  projectRoot?: string;
  filePath?: string | null;
  agent?: AgentClient;
  searchClient?: SearchClient;
  ackClient?: AckClient;
  spawnOutcomeStore?: Pick<SpawnOutcomeStore, "append" | "list" | "path">;
  /** Inject events instead of searching (tests). */
  fetchEvents?: () => Promise<DetectedEvent[]>;
  /** Skip starting the interval timer (tests call pollOnce). */
  runLoop?: boolean;
  /** Override log sink (tests). Default console.log / console.error. */
  log?: (msg: string) => void;
  logError?: (msg: string, err?: unknown) => void;
  /** Injectable clock (tests). */
  now?: () => number;
  /** Injectable sleep for backoff-aware loop (tests can no-op). */
  sleep?: (ms: number) => Promise<void>;
  /**
   * Shared DB for durable WATCH sessions (REQ-watch-037). Default opens the
   * shared Corvidinho DB (in-memory for dry-run without CORVIDINHO_DATA_DIR).
   * An injected db is not closed on stop.
   */
  db?: Database;
  /** Inject a session store (tests); skips opening the shared DB. */
  sessionStore?: SessionStore;
  /** Soft TTL override (ms); default resolveSessionTtlMs(env). */
  sessionTtlMs?: number;
  onAction?: (info: {
    kind: string;
    event: DetectedEvent;
    sessionId?: string;
    summary?: string;
  }) => void;
};

function formatCycleLog(r: PollCycleResult): string {
  return (
    `[watch] poll cycle fetched=${r.fetched} new=${r.newEvents} ` +
    `started=${r.started} continued=${r.continued} refused=${r.refused} skipped=${r.skipped}`
  );
}

/**
 * Start the GitHub WATCH poller. Clean exit when token/username/repos missing.
 */
export async function startWatchPoller(
  opts: StartWatchOptions = {},
): Promise<StartWatchResult> {
  const loaded: ConfigResult = await loadWatchConfig({
    env: opts.env,
    projectRoot: opts.projectRoot,
    filePath: opts.filePath,
  });

  if (!loaded.ok) {
    return {
      ok: false,
      exitCode: 1,
      message: `${loaded.message}\n\n${goLiveChecklist()}`,
    };
  }

  const config = loaded.config;
  const env = opts.env ?? process.env;
  // IDENTITY-14 — the owner (IDENTITY-1) from the allowlist file the watch
  // loaded + env, as the bridge reads it; declared people are re-read per
  // event (loadDeclaredPeople) so edits apply without a restart.
  const { owner } = await loadOwnerConfig({ env, filePath: config.allowlist.sourcePath });
  // Durable WATCH sessions (REQ-watch-037). Dry-run without an explicit data
  // dir stays in-memory so tests never touch ~/.local/share/corvidinho.
  const ownedDb =
    opts.db || opts.sessionStore
      ? undefined
      : openCorvidinhoDb(
          config.dryRun && !env.CORVIDINHO_DATA_DIR?.trim()
            ? { memory: true }
            : { env },
        );
  const db = opts.db ?? ownedDb;
  let dbClosed = false;
  // MEMORY-8/9 (REQ-watch-067): the same shared DB the spawned run's memory
  // plugins use. No DB (an injected session store alone) ⇒ no inject.
  const memoryStore = db ? new MemoryStore({ db }) : undefined;
  const store =
    opts.sessionStore ??
    new SessionStore({
      db,
      ttlMs: opts.sessionTtlMs ?? resolveSessionTtlMs(env),
    });
  // REQ-watch-472 (AGENT-6.a): each issue/PR thread's condensed conversation,
  // kept 30 days in the same DB; replayed into follow-ups on that thread.
  const conversations = db ? new ConversationStore({ db, now: () => now() }) : undefined;
  const windowTokens = resolveContextWindowTokens(env);
  // REQ-watch-247: handled ids live in the same DB as the sessions, so a
  // restart never re-runs, re-acks or re-summarizes an event id.
  const processed = new ProcessedIdStore({ db });
  const acked = new AckedIdStore({ db });
  const summarized = new SummarizedIdStore({ db });
  // Denied ids stay apart and in-memory: a stranger's flood can only evict
  // other denied ids (refused again, quietly), never a handled trusted id.
  const deniedIds = new ProcessedIdStore();
  const successfulAcks = new SuccessfulAckStore();
  const searchClient =
    opts.searchClient ?? createOctokitSearchClient(config.token);
  const agent: AgentClient =
    opts.agent ??
    (config.dryRun
      ? createEchoAgentClient()
      : createSpawnAgentClient({
          bin: config.corvidinhoBin,
          cwd: config.projectRoot,
        }));
  const ackClient: AckClient =
    opts.ackClient ??
    (config.dryRun
      ? createEchoAckClient()
      : createOctokitAckClient(config.token));
  const spawnOutcomes: Pick<SpawnOutcomeStore, "append" | "list" | "path"> =
    opts.spawnOutcomeStore ??
    (config.dryRun
      ? createMemorySpawnOutcomeStore()
      : new SpawnOutcomeStore({
          path: defaultSpawnLogPath({ env: opts.env }),
        }));
  const log = opts.log ?? ((msg: string) => console.log(msg));
  // REQ-watch-418: the default sink prints one scrubbed line per error,
  // never the thrown object (an Octokit HttpError dump every poll).
  const logError =
    opts.logError ??
    ((msg: string, err?: unknown) => {
      if (err !== undefined) console.error(`${msg}: ${formatErrorLine(err, { env })}`);
      else console.error(msg);
    });
  const now = opts.now ?? (() => Date.now());
  const sleep =
    opts.sleep ??
    ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  // AGENT-10: with no usable model provider every WATCH run fails with the
  // notice; say so at startup instead of quietly picking one (a dry run
  // echoes and calls no model).
  const llmNotice = config.dryRun ? null : providerNotice(env);
  if (llmNotice) log(`[watch] ${llmNotice}`);
  if (!opts.sessionStore) {
    log(
      `[watch] sessions: ${store.list().length} restored (soft TTL ${Math.round(store.ttlMs / 60000)}m)`,
    );
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = true;
  let backoffUntilMs = 0;
  let resolveFatal: (f: WatchFatal) => void = () => {};
  const fatal = new Promise<WatchFatal>((r) => {
    resolveFatal = r;
  });

  // REQ-watch-418: GitHub 401 means the token is bad or revoked; every later
  // poll would fail the same way, so stop the loop instead of polling forever.
  const haltOnAuthFailure = (err: unknown): void => {
    running = false;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const message =
      `[watch] github auth failed (401): ${formatErrorLine(err, { env })} — ` +
      "check GITHUB_TOKEN / GH_TOKEN; watch stopped";
    logError(message);
    resolveFatal({ exitCode: 1, message });
  };

  const applyRateLimitBackoff = (err: unknown): number | null => {
    const parsed = parseGithubRateLimit(
      err,
      now(),
      DEFAULT_RATE_LIMIT_BACKOFF_MS,
    );
    if (!parsed) return null;
    const until = now() + parsed.waitMs;
    backoffUntilMs = Math.max(backoffUntilMs, until);
    log(formatRateLimitLog(parsed, backoffUntilMs));
    return parsed.waitMs;
  };

  /**
   * SAFE-13 / SAFE-5: one `injection-suspected` row (`denied`) for an event
   * WATCH will not run. Best effort: the event is refused either way.
   */
  const auditWatchInjection = (
    event: DetectedEvent,
    sessionId: string,
    reasons: readonly InjectionReason[],
  ): void => {
    if (!db) return;
    try {
      appendAudit(
        db,
        {
          action: INJECTION_AUDIT_ACTION,
          actor: `github:${event.sender}`,
          surface: `watch:${sessionId}`,
          argsDigest: argsDigest(["github-thread", ...reasons]),
          outcome: "denied",
        },
        { key: auditKeyFromEnv(env) },
      );
    } catch (err) {
      logError("[watch] SAFE-13 audit row failed", err);
    }
  };

  const runCycle = async (): Promise<PollCycleResult> => {
    const result: PollCycleResult = {
      fetched: 0,
      newEvents: 0,
      started: 0,
      continued: 0,
      refused: 0,
      skipped: 0,
    };
    if (!running) return result;

    // AGENT-6.a: retained thread conversations go 30 days after their last
    // update, also on a quiet watch.
    try {
      conversations?.purgeExpired();
    } catch (err) {
      logError("[watch] conversation purge failed", err);
    }

    // Honor outstanding rate-limit backoff (WATCH-RELIABILITY-3).
    const waitLeft = backoffUntilMs - now();
    if (waitLeft > 0) {
      result.rateLimited = true;
      result.backoffMs = waitLeft;
      log(
        `[watch] poll skip rate-limit backoff remaining_ms=${Math.ceil(waitLeft)}`,
      );
      return result;
    }

    // WATCH-RELIABILITY-3: a 403/429 rate limit on the auto-ack or run-summary
    // comment sets the same backoff as a rate-limited fetch, so the next poll
    // cycle waits it out. A plain failure stays an `ack failed` /
    // `summary failed` line only.
    const backoffOnCommentFailure = (res: AckCommentResult): void => {
      const waitMs = applyRateLimitBackoff({
        status: res.status,
        message: res.error,
        headers: res.headers,
      });
      if (waitMs === null) return;
      result.rateLimited = true;
      result.backoffMs = Math.max(result.backoffMs ?? 0, waitMs);
    };

    // MEMORY-ACL-6.a: the outcome of each decided GitHub forget ask goes on
    // its thread (the bridge decides it on the owner's card).
    if (db) {
      try {
        await deliverWatchForgetOutcomes({
          db,
          github: config.allowlist.github,
          ackClient,
          now,
          log,
          onPostFailed: backoffOnCommentFailure,
        });
      } catch (err) {
        logError("[watch] forget outcomes failed", err);
      }
    }

    let events: DetectedEvent[];
    try {
      events = opts.fetchEvents
        ? await opts.fetchEvents()
        : await fetchWatchEvents({
            client: searchClient,
            repos: config.repos,
            mentionUsername: config.mentionUsername,
          });
    } catch (err) {
      const waitMs = applyRateLimitBackoff(err);
      if (waitMs !== null) {
        result.rateLimited = true;
        result.backoffMs = waitMs;
        log(formatCycleLog(result));
        return result;
      }
      throw err;
    }

    result.fetched = events.length;

    const fresh = events.filter(
      (e) => !processed.has(e.id) && !deniedIds.has(e.id),
    );
    result.newEvents = fresh.length;
    const { eligible, denied } = preferAllowlisted(fresh, config.allowlist);

    // Mark denied ids seen so we do not re-poll them forever (ALLOW-5 quiet).
    for (const d of denied) {
      deniedIds.add(d.id);
      result.refused += 1;
      opts.onAction?.({ kind: "refuse", event: d });
    }

    // MEMORY-ACL-6.a: a clear "forget me" to the watch user never starts a
    // run and never hides another request on its issue: each is handled on
    // its own — recorded for the owner's card (declared people, matched by
    // GitHub numeric id) and answered once on the thread.
    const forgetAsks = eligible.filter((e) => isWatchForgetMeRequest(e, config.mentionUsername));
    for (const event of forgetAsks) {
      if (!running) break;
      try {
        processed.add(event.id);
      } catch (err) {
        logError(`[watch] forget-me ${event.id}: id write failed; retried next cycle`, err);
        continue;
      }
      try {
        await handleWatchForgetMe({
          event,
          people: loadDeclaredPeople({ allowlist: config.allowlist, owner }),
          db,
          ackClient,
          env,
          now,
          log,
          onPostFailed: backoffOnCommentFailure,
        });
      } catch (err) {
        logError(`[watch] forget-me ${event.repo}#${event.number} (${event.id}) failed`, err);
      }
      opts.onAction?.({ kind: "forget_me", event });
    }
    const forgetIds = new Set(forgetAsks.map((e) => e.id));
    const deduped = dedupeByIssue(eligible.filter((e) => !forgetIds.has(e.id)));

    let triggered = 0;
    for (const event of deduped) {
      // stop() mid-cycle: no further routing, acks, or agent spawns.
      if (!running) break;
      if (triggered >= config.maxTriggersPerCycle) {
        result.skipped += 1;
        continue;
      }

      // Mark related eligible ids for this issue so other search paths don't re-fire.
      const related = eligible
        .filter(
          (e) =>
            e.repo.toLowerCase() === event.repo.toLowerCase() &&
            e.number === event.number,
        )
        .map((e) => e.id);
      const relatedIds = related.length > 0 ? related : [event.id];
      // routed: routeEvent returned, so a throw after it came from the id
      // write or later. marked: the ids are durably recorded.
      let routed = false;
      let marked = false;

      try {
        const people = loadDeclaredPeople({ allowlist: config.allowlist, owner });
        const action = routeEvent(event, {
          store,
          allowlist: config.allowlist,
          people,
        });
        routed = true;
        processed.addMany(relatedIds);
        marked = true;

        if (action.kind === "refuse" || action.kind === "ignore") {
          result.refused += 1;
          opts.onAction?.({ kind: action.kind, event });
          continue;
        }

        // SAFE-13: a title or body (from anyone but the owner) that looks like
        // an injection attempt never reaches a run. One comment says so and
        // @mentions the owner's GitHub login; an audit row records the
        // sender, the session and the reason ids, never the text.
        const suspected = watchInjectionVerdict(event, people);
        if (suspected) {
          result.refused += 1;
          auditWatchInjection(event, action.session.id, suspected.reasons);
          log(
            `[watch] SAFE-13 refused ${event.repo}#${event.number} id=${event.id} (${suspected.reasons.join(", ")})`,
          );
          await postWatchInjectionRefusal({
            event,
            reasons: suspected.reasons,
            ownerLogin: owner?.githubLogin,
            mentionUsername: config.mentionUsername,
            ackClient,
            acked,
            log,
            onPostFailed: backoffOnCommentFailure,
          });
          opts.onAction?.({ kind: "injection_refused", event, sessionId: action.session.id });
          continue;
        }

        triggered += 1;
        if (action.kind === "start_session") result.started += 1;
        if (action.kind === "continue_session") result.continued += 1;

        // Auto-ack BEFORE spawn so the thread sees presence even if spawn is slow.
        const ackResult = await maybePostWatchAck({
          event,
          kind: action.kind,
          mentionUsername: config.mentionUsername,
          ackClient,
          acked,
          log,
          onPostFailed: backoffOnCommentFailure,
        });
        if (ackResult.posted) {
          successfulAcks.add(event.id);
        }

        // stop() may have landed while the ack was in flight.
        if (!running) break;

        const startedAtMs = now();
        const startedAt = new Date(startedAtMs).toISOString();
        log(
          formatSpawnStartLog({
            eventId: event.id,
            sessionId: action.session.id,
            repo: event.repo,
            number: event.number,
          }),
        );

        // REQ-watch-472 (AGENT-6.a / SESSION-5): this issue/PR thread's
        // retained conversation goes ahead of the new event, condensed at
        // about 80% of the model's window (the thread's opening request and
        // latest request word for word). A DB failure only drops the replay.
        const threadKey = watchThreadKey(event.repo, event.number);
        let retained: ReturnType<ConversationStore["latestForThread"]>;
        try {
          retained = conversations?.latestForThread("watch", threadKey);
        } catch (err) {
          logError("[watch] conversation read failed", err);
        }
        let conversation: Conversation = {
          summary: retained?.summary ?? "",
          turns: retained?.turns ?? [],
        };
        const blockOpts = { header: WATCH_THREAD_HEADER, footer: WATCH_THREAD_FOOTER };
        if (retained) {
          const condensed = condenseConversation({
            conversation,
            incoming: action.prompt,
            budgetChars: condenseBudgetChars(windowTokens),
            render: (c) => formatConversationBlock(c, blockOpts),
          });
          conversation = { summary: condensed.summary, turns: condensed.turns };
        }
        let prompt = withConversationBlock(action.prompt, conversation, blockOpts);

        // MEMORY-9: search memory for this comment before the run, so the
        // model has it before it could say it doesn't know (no model call).
        // The memory blocks go ahead of the replayed conversation, as on
        // Discord (the thread block is added before identity and memory).
        try {
          const mem = enrichWatchPromptWithMemories(prompt, memoryStore, { event, people });
          if (mem.injected) {
            prompt = mem.prompt;
            log(`[watch] memory inject: ${mem.count} recalled for @${event.sender}${mem.declared ? "" : " (project only)"}`);
          }
        } catch (err) {
          logError("[watch] memory inject failed", err);
        }

        let spawnOk = false;
        let spawnExit = 1;
        let spawnSummary = "";
        let spawnInjection: AgentSpawnResult["injection"];
        let spawnAsk: AgentSpawnResult["ask"];
        let spawnFailureReason: string | undefined;
        let spawnStderrTail: string | undefined;
        let threw = false;
        try {
          const spawn = await agent.runChat({
            prompt,
            sessionId: action.session.id,
            resume: action.kind === "continue_session",
            // MEMORY-8: the commenter (GitHub API ids) and the thread's repo.
            actingGithubLogin: event.sender,
            ...(event.senderId !== undefined ? { actingGithubId: event.senderId } : {}),
            repo: event.repo,
          });
          spawnOk = spawn.ok;
          spawnExit = spawn.exitCode;
          spawnSummary = spawn.summary;
          spawnInjection = spawn.injection;
          spawnAsk = spawn.ask;
          spawnFailureReason = spawn.failureReason;
          spawnStderrTail = spawn.stderrTail;
          opts.onAction?.({
            kind: action.kind,
            event,
            sessionId: action.session.id,
            summary: spawn.summary,
          });
        } catch (err) {
          threw = true;
          spawnOk = false;
          spawnExit = 1;
          spawnSummary = err instanceof Error ? err.message : String(err);
          // DISCORD-3.b: a run that threw says why from its message (scrubbed, one line).
          spawnFailureReason = failureReasonFromUnknown(spawnSummary);
          logError("[watch] spawn error", err);
        }

        // REQ-watch-009 (DISCORD-3.b on GitHub): what a failed run without an
        // ask of its own shows — one plain reason line, never its summary
        // (for a model failure `LLM HTTP <status>: <provider body>`). The log
        // line names the provider's host; the comment and the kept turn don't.
        const runFacts: Pick<
          AgentSpawnResult,
          "ok" | "exitCode" | "ask" | "failureReason" | "stderrTail"
        > = {
          ok: spawnOk,
          exitCode: spawnExit,
          ...(spawnAsk ? { ask: spawnAsk } : {}),
          ...(spawnFailureReason ? { failureReason: spawnFailureReason } : {}),
          ...(spawnStderrTail ? { stderrTail: spawnStderrTail } : {}),
        };
        const failedReason = watchFailureReason(runFacts, env);
        if (failedReason !== null) {
          log(
            formatFailureLog(
              "[watch]",
              `${event.repo}#${event.number} id=${event.id}`,
              threw ? undefined : spawnExit,
              failedReason,
            ),
          );
        }

        const finishedAtMs = now();
        const outcome: SpawnOutcome = {
          startedAt,
          finishedAt: new Date(finishedAtMs).toISOString(),
          eventId: event.id,
          sessionId: action.session.id,
          repo: event.repo,
          number: event.number,
          ok: spawnOk,
          exitCode: spawnExit,
          errorClass: classifySpawnError(spawnOk, spawnExit, threw),
          durationMs: Math.max(0, finishedAtMs - startedAtMs),
          // SAFE-6 (REQ-watch-231): scrub before clipping and persisting.
          // Operator-only: a failed run keeps its scrubbed summary here
          // (REQ-watch-009), never on the thread.
          summaryPreview: scrubSecrets(spawnSummary).slice(0, 240),
        };
        spawnOutcomes.append(outcome);
        log(formatSpawnOutcomeLog(outcome));

        // REQ-watch-472: the event and the run's answer join the thread's
        // retained conversation (scrubbed, last turns kept, 30 days).
        try {
          conversations?.save({
            id: retained?.id,
            surface: "watch",
            threadKey,
            userId: (retained?.userId ?? action.session.userId).toLowerCase(),
            sessionId: action.session.id,
            summary: conversation.summary,
            turns: [
              ...conversation.turns,
              { role: "human", content: action.prompt, createdAt: startedAtMs },
              // REQ-watch-009: a failed run's turn is the reason its comment
              // shows, so a later run never replays a provider's reply body
              // or host (the model could repeat it on the public thread).
              {
                role: "agent",
                content: failedReason !== null ? watchPublicFailureLine(failedReason) : spawnSummary,
                createdAt: finishedAtMs,
              },
            ],
            participants: [
              ...(retained?.participants ?? []),
              githubParticipant(action.session.userId),
              githubParticipant(event.sender),
              // MEMORY-ACL-6.a: the numeric id too, so a forget reaches a
              // person declared by GitHub id only.
              ...(event.senderId !== undefined ? [githubIdParticipant(event.senderId)] : []),
            ],
          });
        } catch (err) {
          logError("[watch] conversation write failed", err);
        }

        // WATCH-RELIABILITY-1 — summary after run, only if auto-ack succeeded.
        const summaryPosted = await maybePostWatchSummary({
          event,
          spawn: {
            ...runFacts,
            sessionId: action.session.id,
            summary: spawnSummary,
            ...(spawnInjection ? { injection: spawnInjection } : {}),
          },
          ackClient,
          successfulAcks,
          summarized,
          ownerLogin: owner?.githubLogin,
          env,
          log,
          onPostFailed: backoffOnCommentFailure,
        });
        // SAFE-13: no summary carried the in-run hit (an event type WATCH
        // does not ack, or no successful ack): one comment tells the owner.
        if (!summaryPosted && spawnInjection) {
          await maybePostWatchInjectionNotice({
            event,
            injection: spawnInjection,
            ownerLogin: owner?.githubLogin,
            ackClient,
            summarized,
            log,
            onPostFailed: backoffOnCommentFailure,
          });
        }
        // AGENT-16.a (REQ-watch-086): a stuck run pings the owner on Discord
        // like other stuck asks, for every event type — handed to the bridge
        // through the shared DB; any other finished run makes the thread's
        // pending ask moot (a spawn that threw leaves it). Never throws.
        if (!threw) {
          noteWatchRunAsk({
            db,
            owner,
            event,
            ask: spawnAsk,
            summaryPosted,
            now: now(),
            log,
          });
        }
      } catch (err) {
        // One failing event (e.g. SQLITE_BUSY) must not abort the cycle or be
        // retried forever ahead of later events: log, mark processed, move on.
        // Marking is a DB write (REQ-watch-247). Ids are marked before any
        // ack or spawn, so if the id write itself failed nothing ran for this
        // event: leave it for the next cycle, never mark it here (a retry that
        // succeeds would drop a request that never ran). Only a routing
        // failure (before the id write) is marked, as before.
        if (!marked && !routed) {
          try {
            processed.addMany(relatedIds);
            marked = true;
          } catch {
            // DB still failing: leave the event for the next cycle.
          }
        }
        logError(
          `[watch] event ${event.repo}#${event.number} (${event.id}) failed; ` +
            (marked ? "marked processed" : "not marked, retried next cycle"),
          err,
        );
      }
    }

    log(formatCycleLog(result));
    return result;
  };

  // Single-flight: at most one cycle runs at a time, so stop() can await it
  // before closing the DB and an issue is never handled by two cycles at once.
  // A pollOnce while a cycle is in flight joins it instead of starting another.
  let inflight: Promise<PollCycleResult> | null = null;
  const pollOnce = (): Promise<PollCycleResult> => {
    if (inflight) return inflight;
    const p = runCycle();
    inflight = p;
    const clear = () => {
      if (inflight === p) inflight = null;
    };
    p.then(clear, clear);
    return p;
  };

  // The loop re-arms only after a cycle settles, so a long agent run never
  // overlaps the next tick.
  const scheduleNext = (delayMs: number) => {
    if (!running) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void (async () => {
        try {
          // If still in backoff, wait the remainder before polling.
          const left = backoffUntilMs - now();
          if (left > 0) await sleep(left);
          if (!running) return;
          await pollOnce();
        } catch (err) {
          if (githubStatusOf(err) === 401) {
            haltOnAuthFailure(err);
            return;
          }
          const waitMs = applyRateLimitBackoff(err);
          if (waitMs === null) {
            logError("[watch] pollOnce error", err);
          }
        } finally {
          if (running) {
            const nextDelay = Math.max(
              config.intervalMs,
              Math.max(0, backoffUntilMs - now()),
            );
            scheduleNext(nextDelay);
          }
        }
      })();
    }, Math.max(0, delayMs));
  };

  if (opts.runLoop !== false) {
    // Fire once immediately, then reschedule with backoff-aware delay.
    scheduleNext(0);
  }

  return {
    ok: true,
    config,
    store,
    processed,
    acked,
    summarized,
    successfulAcks,
    spawnOutcomes,
    pollOnce,
    getBackoffUntilMs: () => backoffUntilMs,
    fatal,
    stop: async () => {
      running = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      // Let an in-flight cycle finish its session writes before closing.
      if (inflight) await inflight.catch(() => undefined);
      if (ownedDb && !dbClosed) {
        dbClosed = true;
        ownedDb.close();
      }
    },
  };
}

/** Re-export for callers that only need allowlist typing. */
export type { AllowlistConfig };

export { formatCycleLog };
