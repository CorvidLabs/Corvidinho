/**
 * `corvidinho daemon` — headless schedule ticker (CLI-8 / AUTONOMOUS-4).
 *
 * Ticks the SQLite schedules table on the 60s poll without Discord, so
 * recurring work keeps moving with no REPL and no bridge. Same gates as the
 * bridge ticker: channel allowlist re-check (DISCORD-SCHEDULE-3), per-run
 * worktree (SESSION-WORKTREE), non-interactive spawns (SAFE-1). One daemon per
 * data dir (lock file); SIGTERM/SIGINT stop ticking, wait a bounded grace for
 * in-flight runs, then kill each straggler's process tree and record it
 * failed (AGENT-3), release the lock, exit 0.
 *
 * Supervision/restart is systemd's job (docs/DAEMON.md); heartbeat, crash DMs
 * and running the bridge/watch inside the daemon are not built here.
 */

import type { Database } from "bun:sqlite";
import { formatSpendWarningLine, SPEND_CAP_SUMMARY } from "../agent/spend-notice.ts";
import { loadAllowlist } from "../allowlist/load.ts";
import type { AllowlistConfig } from "../allowlist/types.ts";
import {
  createSpawnAgentClient,
  type AgentClient,
} from "../discord/agent-client.ts";
import { mergeChannelIds, resolveCorvidinhoBin } from "../discord/config.ts";
import {
  CORVIDINHO_PROTOCOL_VERSION,
  checkProtocolVersion,
} from "../discord/protocol-version.ts";
import {
  DEFAULT_POLL_INTERVAL_MS,
  ScheduleStore,
  SchedulerService,
} from "../scheduler/index.ts";
import { openCorvidinhoDb } from "../store/db.ts";
import { resolveDataDir } from "../store/paths.ts";
import { VERSION } from "../version.ts";
import {
  acquireDaemonLock,
  type AcquireDaemonLockOptions,
} from "./lock.ts";
import { createDaemonLogger, type DaemonLogger } from "./log.ts";

/** How long a stop waits for in-flight runs before recording them failed. */
export const DEFAULT_SHUTDOWN_GRACE_MS = 30_000;

export type StartDaemonOptions = {
  env?: NodeJS.ProcessEnv;
  /** Default project root for relative schedule projects (default: cwd). */
  projectRoot?: string;
  logger?: DaemonLogger;
  /** Test seams. */
  agent?: AgentClient;
  db?: Database;
  pollIntervalMs?: number;
  shutdownGraceMs?: number;
  useWorktrees?: boolean;
  skipProtocolCheck?: boolean;
  lock?: Omit<AcquireDaemonLockOptions, "dataDir">;
};

export type DaemonStopSummary = {
  /** All in-flight runs settled within the grace period. */
  drained: boolean;
  /** Schedule ids whose runs were recorded failed at shutdown. */
  abandoned: string[];
};

export type StartDaemonResult =
  | {
      ok: true;
      dataDir: string;
      lockPath: string;
      scheduleStore: ScheduleStore;
      scheduler: SchedulerService;
      /** Run one tick now (tests; the interval calls the same path). */
      tick: () => Promise<{ started: string[]; skipped: string[] }>;
      /** Graceful stop. Idempotent — later calls return the same promise. */
      stop: (reason?: string) => Promise<DaemonStopSummary>;
      /** Cut a pending stop's grace short (second signal). */
      forceStop: () => void;
    }
  | { ok: false; exitCode: number; message: string };

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Start the headless ticker. Never throws for operator errors: returns
 * `{ ok: false, exitCode, message }` after logging a structured error line.
 */
export async function startDaemon(
  opts: StartDaemonOptions = {},
): Promise<StartDaemonResult> {
  const env = opts.env ?? process.env;
  const projectRoot = opts.projectRoot ?? process.cwd();
  const log = opts.logger ?? createDaemonLogger();
  const dataDir = resolveDataDir({ env });

  const acquired = acquireDaemonLock({ dataDir, ...opts.lock });
  if (!acquired.ok) {
    log("error", acquired.reason === "held" ? "daemon.lock_held" : "daemon.lock_failed", {
      message: acquired.message,
      lockPath: acquired.path,
      holderPid: acquired.holder?.pid ?? null,
    });
    return { ok: false, exitCode: 1, message: acquired.message };
  }
  const lock = acquired.lock;

  let db: Database | undefined;
  const ownsDb = !opts.db;
  const fail = (event: string, message: string): StartDaemonResult => {
    log("error", event, { message });
    if (ownsDb) db?.close();
    lock.release();
    return { ok: false, exitCode: 1, message };
  };

  let store: ScheduleStore;
  let gate: AllowlistConfig;
  let agent: AgentClient;
  let allowlistSource: string;
  try {
    db = opts.db ?? openCorvidinhoDb({ env });
    store = new ScheduleStore({ db });
    const allowlist = await loadAllowlist({ env });
    allowlistSource = allowlist.sourcePath ?? "env";
    // Same channel gate as the bridge (allowlist ∪ DISCORD_CHANNEL_IDS).
    gate = {
      ...allowlist,
      discord: {
        ...allowlist.discord,
        channels: mergeChannelIds(allowlist, env),
      },
    };
    const bin = resolveCorvidinhoBin(env, projectRoot);
    if (!opts.agent && !opts.skipProtocolCheck) {
      const hs = await checkProtocolVersion(bin);
      if (hs.kind === "mismatch") {
        return fail(
          "daemon.protocol_mismatch",
          `protocol version mismatch: daemon expects ${CORVIDINHO_PROTOCOL_VERSION}, ${bin} reports ${hs.version}. Upgrade either binary.`,
        );
      }
      if (hs.kind === "unverifiable") {
        log("warn", "daemon.protocol_unverified", { reason: hs.reason });
      }
    }
    agent = opts.agent ?? createSpawnAgentClient({ bin, cwd: projectRoot });
  } catch (err) {
    return fail("daemon.start_failed", errorText(err));
  }

  const scheduler = new SchedulerService({
    store,
    agent,
    allowlist: gate,
    defaultProjectRoot: projectRoot,
    useWorktrees: opts.useWorktrees,
    // The daemon owns the interval so it can log each tick.
    manual: true,
    onRunFinished: (e) => {
      log(e.ok ? "info" : "warn", "run.finished", {
        scheduleId: e.scheduleId,
        runId: e.runId,
        ok: e.ok,
        ...(e.error ? { error: e.error.slice(0, 500) } : {}),
        ...(e.autoPaused ? { autoPaused: true } : {}),
      });
      // SAFE-8 / AUTONOMY-2: the daemon has no Discord, so the operator hears
      // about the spend cap here; the warning row stays pending for a bridge.
      if (e.spendWarning) {
        log("warn", "spend.warning", {
          scheduleId: e.scheduleId,
          runId: e.runId,
          spentMicroUsd: e.spendWarning.spentMicroUsd,
          capMicroUsd: e.spendWarning.capMicroUsd,
          percent: e.spendWarning.percent,
          message: formatSpendWarningLine(e.spendWarning),
        });
      }
      if (e.askReason) {
        log("warn", "run.needs_human", {
          scheduleId: e.scheduleId,
          runId: e.runId,
          reason: e.askReason,
          ...(e.askReason === "spend-cap" ? { message: SPEND_CAP_SUMMARY } : {}),
        });
      }
    },
  });

  const tick = async () => {
    try {
      const r = await scheduler.tick();
      if (r.started.length > 0 || r.skipped.length > 0) {
        log("info", "tick", {
          started: r.started,
          skipped: r.skipped,
          running: scheduler.runningIds().length,
        });
      }
      return r;
    } catch (err) {
      log("error", "tick.failed", { error: errorText(err) });
      return { started: [], skipped: [] };
    }
  };

  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  // Ref'd on purpose: this interval is what keeps the daemon process alive.
  const timer = setInterval(() => {
    void tick();
  }, pollIntervalMs);

  const all = store.list();
  log("info", "daemon.started", {
    pid: process.pid,
    version: VERSION,
    dataDir,
    lockPath: lock.path,
    projectRoot,
    pollIntervalMs,
    allowlist: allowlistSource,
    discordChannels: gate.discord.channels.length,
    schedulesActive: all.filter((s) => s.status === "active").length,
    schedulesPaused: all.filter((s) => s.status === "paused").length,
  });

  let forceResolve: (() => void) | undefined;
  const forced = new Promise<false>((resolve) => {
    forceResolve = () => resolve(false);
  });
  let stopping: Promise<DaemonStopSummary> | null = null;
  const graceMs = opts.shutdownGraceMs ?? DEFAULT_SHUTDOWN_GRACE_MS;

  const stop = (reason = "stop"): Promise<DaemonStopSummary> => {
    if (stopping) return stopping;
    stopping = (async () => {
      clearInterval(timer);
      scheduler.stop();
      log("info", "daemon.stopping", {
        reason,
        running: scheduler.runningIds(),
        graceMs,
      });
      const drained = await Promise.race([scheduler.drain(graceMs), forced]);
      const abandoned = drained
        ? []
        : scheduler.abandonInFlight(`interrupted: daemon shutdown (${reason})`);
      if (abandoned.length > 0) {
        log("warn", "daemon.abandoned", { scheduleIds: abandoned });
      }
      if (ownsDb) db?.close();
      lock.release();
      log("info", "daemon.stopped", { reason, abandoned: abandoned.length });
      return { drained: abandoned.length === 0, abandoned };
    })();
    return stopping;
  };

  return {
    ok: true,
    dataDir,
    lockPath: lock.path,
    scheduleStore: store,
    scheduler,
    tick,
    stop,
    forceStop: () => forceResolve?.(),
  };
}

/**
 * CLI entry: start, then run until SIGTERM/SIGINT. A second signal cuts the
 * shutdown grace short. Returns the process exit code.
 */
export async function runDaemon(opts: StartDaemonOptions = {}): Promise<number> {
  const started = await startDaemon(opts);
  if (!started.ok) return started.exitCode;
  await new Promise<void>((resolve) => {
    let signals = 0;
    const onSignal = (signal: NodeJS.Signals) => {
      signals += 1;
      if (signals === 1) {
        void started.stop(signal).then(() => {
          process.off("SIGINT", onSignal);
          process.off("SIGTERM", onSignal);
          resolve();
        });
      } else {
        started.forceStop();
      }
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
  });
  return 0;
}
