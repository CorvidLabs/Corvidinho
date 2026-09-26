/**
 * WATCH poll loop: fetch → dedup → allowlist route → session stub.
 * Poll-first for bot/VM (no public URL). No ProcessManager.
 * REQ-watch-007: cycle logging, caught pollOnce errors, auto-ack on mention/comment.
 * WATCH-RELIABILITY-1..3: post-run summary, spawn outcome log, 403 rate-limit backoff.
 */

import type { AllowlistConfig } from "../allowlist/types.ts";
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
} from "./ack.ts";
import {
  goLiveChecklist,
  loadWatchConfig,
  type ConfigResult,
} from "./config.ts";
import {
  dedupeByIssue,
  filterNewEvents,
  ProcessedIdStore,
} from "./dedup.ts";
import {
  isGithubUserAllowed,
  isRepoAllowed,
} from "../allowlist/github.ts";
import {
  DEFAULT_RATE_LIMIT_BACKOFF_MS,
  formatRateLimitLog,
  parseGithubRateLimit,
} from "./rate-limit.ts";
import { routeEvent } from "./router.ts";
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

/** Prefer allowlisted senders when collapsing per-issue (ALLOW-1 before session). */
function preferAllowlisted(
  events: DetectedEvent[],
  allowlist: WatchConfig["allowlist"],
): { eligible: DetectedEvent[]; denied: DetectedEvent[] } {
  const eligible: DetectedEvent[] = [];
  const denied: DetectedEvent[] = [];
  for (const e of events) {
    const repoOk = isRepoAllowed(e.repo, allowlist.github).ok;
    const userOk = isGithubUserAllowed(e.sender, allowlist.github).ok;
    if (repoOk && userOk) eligible.push(e);
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
      stop: () => Promise<void>;
    }
  | { ok: false; exitCode: number; message: string };

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
  const store = new SessionStore();
  const processed = new ProcessedIdStore();
  const acked = new AckedIdStore();
  const summarized = new SummarizedIdStore();
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
  const logError =
    opts.logError ??
    ((msg: string, err?: unknown) => {
      if (err !== undefined) console.error(msg, err);
      else console.error(msg);
    });
  const now = opts.now ?? (() => Date.now());
  const sleep =
    opts.sleep ??
    ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = true;
  let backoffUntilMs = 0;

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

  const pollOnce = async (): Promise<PollCycleResult> => {
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

    const fresh = filterNewEvents(events, processed.list());
    result.newEvents = fresh.length;
    const { eligible, denied } = preferAllowlisted(fresh, config.allowlist);

    // Mark denied ids processed so we do not re-poll them forever (ALLOW-5 quiet).
    for (const d of denied) {
      processed.add(d.id);
      result.refused += 1;
      opts.onAction?.({ kind: "refuse", event: d });
    }

    const deduped = dedupeByIssue(eligible);

    let triggered = 0;
    for (const event of deduped) {
      if (triggered >= config.maxTriggersPerCycle) {
        result.skipped += 1;
        continue;
      }

      const action = routeEvent(event, {
        store,
        allowlist: config.allowlist,
      });

      // Mark related eligible ids for this issue so other search paths don't re-fire.
      const related = eligible
        .filter(
          (e) =>
            e.repo.toLowerCase() === event.repo.toLowerCase() &&
            e.number === event.number,
        )
        .map((e) => e.id);
      processed.addMany(related.length > 0 ? related : [event.id]);

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
      });
      if (ackResult.posted) {
        successfulAcks.add(event.id);
      }

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
        summaryPreview: spawnSummary.slice(0, 240),
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
      });
    }

    log(formatCycleLog(result));
    return result;
  };

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
    stop: async () => {
      running = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

/** Re-export for callers that only need allowlist typing. */
export type { AllowlistConfig };

export { formatCycleLog };
