/**
 * WATCH poll loop: fetch → dedup → allowlist route → session stub.
 * Poll-first for bot/VM (no public URL). No ProcessManager.
 * REQ-watch-007: cycle logging, caught pollOnce errors, auto-ack on mention/comment.
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
import { routeEvent } from "./router.ts";
import {
  createOctokitSearchClient,
  fetchWatchEvents,
  type SearchClient,
} from "./searcher.ts";
import { SessionStore } from "./session-store.ts";
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
      /** Run one poll cycle (tests / dry). */
      pollOnce: () => Promise<PollCycleResult>;
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
};

export type StartWatchOptions = {
  env?: NodeJS.ProcessEnv;
  projectRoot?: string;
  filePath?: string | null;
  agent?: AgentClient;
  searchClient?: SearchClient;
  ackClient?: AckClient;
  /** Inject events instead of searching (tests). */
  fetchEvents?: () => Promise<DetectedEvent[]>;
  /** Skip starting the interval timer (tests call pollOnce). */
  runLoop?: boolean;
  /** Override log sink (tests). Default console.log / console.error. */
  log?: (msg: string) => void;
  logError?: (msg: string, err?: unknown) => void;
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
  const log = opts.log ?? ((msg: string) => console.log(msg));
  const logError =
    opts.logError ??
    ((msg: string, err?: unknown) => {
      if (err !== undefined) console.error(msg, err);
      else console.error(msg);
    });

  let timer: ReturnType<typeof setInterval> | null = null;
  let running = true;

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

    const events = opts.fetchEvents
      ? await opts.fetchEvents()
      : await fetchWatchEvents({
          client: searchClient,
          repos: config.repos,
          mentionUsername: config.mentionUsername,
        });
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
      await maybePostWatchAck({
        event,
        kind: action.kind,
        mentionUsername: config.mentionUsername,
        ackClient,
        acked,
        log,
      });

      const spawn = await agent.runChat({
        prompt: action.prompt,
        sessionId: action.session.id,
        resume: action.kind === "continue_session",
      });
      opts.onAction?.({
        kind: action.kind,
        event,
        sessionId: action.session.id,
        summary: spawn.summary,
      });
    }

    log(formatCycleLog(result));
    return result;
  };

  const schedulePoll = () => {
    void pollOnce().catch((err) => {
      logError("[watch] pollOnce error", err);
    });
  };

  if (opts.runLoop !== false) {
    // Fire once immediately, then on interval — always catch so errors surface.
    schedulePoll();
    timer = setInterval(() => {
      schedulePoll();
    }, config.intervalMs);
  }

  return {
    ok: true,
    config,
    store,
    processed,
    acked,
    pollOnce,
    stop: async () => {
      running = false;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}

/** Re-export for callers that only need allowlist typing. */
export type { AllowlistConfig };

export { formatCycleLog };
