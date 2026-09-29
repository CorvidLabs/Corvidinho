/**
 * WATCH poll loop: fetch → dedup → allowlist route → session stub.
 * Poll-first for bot/VM (no public URL). No ProcessManager.
 * REQ-watch-007: cycle logging, caught pollOnce errors, auto-ack on mention/comment.
 * WATCH-RELIABILITY-1..3: post-run summary, spawn outcome log, 403 rate-limit backoff.
 * REQ-watch-037: sessions persist in the shared SQLite DB with the soft TTL;
 * cycles are single-flight, stop() halts before the next event and waits for
 * the in-flight cycle, and one failing event never aborts the cycle.
 */

import type { Database } from "bun:sqlite";
import type { AllowlistConfig } from "../allowlist/types.ts";
import { loadOwnerConfig } from "../identity/owner.ts";
import { loadDeclaredPeople } from "../identity/people.ts";
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
  DEFAULT_RATE_LIMIT_BACKOFF_MS,
  formatRateLimitLog,
  parseGithubRateLimit,
} from "./rate-limit.ts";
import { gateEvent, routeEvent } from "./router.ts";
import {
  createOctokitSearchClient,
  fetchWatchEvents,
  type SearchClient,
} from "./searcher.ts";
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
  maybePostWatchSummary,
  SuccessfulAckStore,
  SummarizedIdStore,
} from "./summary.ts";
import type { DetectedEvent, WatchConfig } from "./types.ts";

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
  const store =
    opts.sessionStore ??
    new SessionStore({
      db,
      ttlMs: opts.sessionTtlMs ?? resolveSessionTtlMs(env),
    });
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

    const deduped = dedupeByIssue(eligible);

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
        const action = routeEvent(event, {
          store,
          allowlist: config.allowlist,
          people: loadDeclaredPeople({ allowlist: config.allowlist, owner }),
        });
        routed = true;
        processed.addMany(relatedIds);
        marked = true;

        if (action.kind === "refuse" || action.kind === "ignore") {
          result.refused += 1;
          opts.onAction?.({ kind: action.kind, event });
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

        let spawnOk = false;
        let spawnExit = 1;
        let spawnSummary = "";
        let threw = false;
        try {
          const spawn = await agent.runChat({
            prompt: action.prompt,
            sessionId: action.session.id,
            resume: action.kind === "continue_session",
          });
          spawnOk = spawn.ok;
          spawnExit = spawn.exitCode;
          spawnSummary = spawn.summary;
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
          logError("[watch] spawn error", err);
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
          summaryPreview: scrubSecrets(spawnSummary).slice(0, 240),
        };
        spawnOutcomes.append(outcome);
        log(formatSpawnOutcomeLog(outcome));

        // WATCH-RELIABILITY-1 — summary after run, only if auto-ack succeeded.
        await maybePostWatchSummary({
          event,
          spawn: {
            ok: spawnOk,
            sessionId: action.session.id,
            summary: spawnSummary,
            exitCode: spawnExit,
          },
          ackClient,
          successfulAcks,
          summarized,
          log,
          onPostFailed: backoffOnCommentFailure,
        });
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
