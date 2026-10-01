/**
 * `corvidinho daemon` — headless schedule ticker (CLI-8 / AUTONOMOUS-4).
 *
 * Ticks the SQLite schedules table on the 60s poll without Discord, so
 * recurring work keeps moving with no REPL and no bridge. Same gates as the
 * bridge ticker: creator + channel allowlist re-check (DISCORD-SCHEDULE-3)
 * against the allowlist re-read before every tick (a tick is skipped while
 * the file cannot be loaded), per-run worktree (SESSION-WORKTREE),
 * non-interactive spawns (SAFE-1). One daemon per
 * data dir (lock file); SIGTERM/SIGINT stop ticking, wait a bounded grace for
 * in-flight runs, then kill each straggler's process tree and record it
 * failed (AGENT-3), let it park its worktree (short bounded grace), release
 * the lock, exit 0. Start first recovers runs and worktrees a dead process
 * left (REQ-discord-346).
 *
 * OPS-1/2 (#68): with CORVIDINHO_BACKUP_DIR set, the same tick takes the
 * nightly SQLite backup and the weekly restore test (src/store/backup.ts)
 * and logs each run; a failure's owner notice stays pending for a bridge.
 *
 * PLUGIN-5.a (REQ-cli-157): `[corvidinho.plugins] schedule` (the install
 * root's — this process's cwd — fledge.toml and the owner's allowlist file,
 * src/autonomous/enabled.ts) is read at every tick. While it is off the tick
 * claims no schedule run; the backup still runs. `daemon.started` carries
 * `schedules` (`on` / `off` / `config-unreadable`), and each change is logged
 * once as `schedules.off` (warn, with why) or `schedules.on`.
 *
 * Supervision/restart is systemd's job (docs/DAEMON.md); heartbeat, crash DMs
 * and running the bridge/watch inside the daemon are not built here.
 */

import type { Database } from "bun:sqlite";
import { defaultProviderLabel, formatModelFallbackLog, providerNotice } from "../agent/providers.ts";
import { formatSpendWarningLine, SPEND_CAP_SUMMARY } from "../agent/spend-notice.ts";
import { loadAllowlist, tryLoadAllowlist } from "../allowlist/load.ts";
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
import { loadOwnerConfig, type OwnerRecord } from "../identity/owner.ts";
import {
  extraStateLabel,
  loadExtrasToggles,
  trackExtraState,
  type ExtraState,
} from "../autonomous/enabled.ts";
import {
  ABANDONED_SETTLE_MS,
  DEFAULT_POLL_INTERVAL_MS,
  ScheduleStore,
  SchedulerService,
} from "../scheduler/index.ts";
import { createBackupTicker, resolveBackupConfig } from "../store/backup.ts";
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
  /** Injectable clock for the scheduler and the nightly backup (tests). */
  now?: () => number;
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

/** `schedules.off` fields: why (`off` and where, or `config-unreadable` and the error). */
function schedulesOffFields(state: ExtraState): Record<string, unknown> {
  if (state.on) return {};
  return state.reason === "off"
    ? { reason: "off", offIn: state.offIn }
    : { reason: "config-unreadable", error: state.error };
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Same channel gate as the bridge (allowlist ∪ DISCORD_CHANNEL_IDS). */
function daemonGate(allowlist: AllowlistConfig, env: NodeJS.ProcessEnv): AllowlistConfig {
  return {
    ...allowlist,
    discord: {
      ...allowlist.discord,
      channels: mergeChannelIds(allowlist, env),
    },
  };
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
  let database: Database;
  let gate: AllowlistConfig;
  let owner: OwnerRecord | null;
  let agent: AgentClient;
  let allowlistSource: string;
  try {
    db = opts.db ?? openCorvidinhoDb({ env });
    database = db;
    store = new ScheduleStore({ db });
    const allowlist = await loadAllowlist({ env });
    allowlistSource = allowlist.sourcePath ?? "env";
    gate = daemonGate(allowlist, env);
    // The owner passes the creator gate like live ingress (REQ-discord-201).
    owner = (await loadOwnerConfig({ env })).owner;
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
    agent =
      opts.agent ??
      createSpawnAgentClient({
        bin,
        cwd: projectRoot,
        // AGENT-11: a scheduled run that failed over is a warn line here (the
        // run's post carries the note too); no owner DM.
        onModelFallback: (hops, sessionId) =>
          log("warn", "llm.fallback", {
            sessionId,
            fallbacks: hops,
            message: formatModelFallbackLog(hops),
          }),
      });
  } catch (err) {
    return fail("daemon.start_failed", errorText(err));
  }

  // OPS-1/2: nightly backup + restore test on this tick, logged here. No
  // Discord: a failure's owner notice waits for a bridge tick to post it.
  const backup = createBackupTicker({ db: database, env, log });
  const nowFn = opts.now ?? Date.now;
  // PLUGIN-5.a: schedules on/off, read now and at every tick; each change is
  // logged once (the first read goes on `daemon.started`).
  let startSchedules: ExtraState | undefined;
  const schedulesState = trackExtraState(
    () => loadExtrasToggles({ installRoot: projectRoot, env }).schedule,
    (state, previous) => {
      if (!previous) {
        startSchedules = state;
        return;
      }
      if (state.on) log("info", "schedules.on", {});
      else log("warn", "schedules.off", schedulesOffFields(state));
    },
  );
  schedulesState();
  const scheduler = new SchedulerService({
    store,
    agent,
    allowlist: gate,
    owner,
    // DISCORD-SCHEDULE-1.a: each run re-reads the owner config, so only the
    // owner as configured now gets the owner stamp for their own schedule.
    loadOwner: async () => (await loadOwnerConfig({ env })).owner,
    defaultProjectRoot: projectRoot,
    useWorktrees: opts.useWorktrees,
    ...(opts.now ? { now: opts.now } : {}),
    backup,
    // PLUGIN-5.a: only the schedules part of the tick is gated.
    schedulesEnabled: () => schedulesState().on,
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
      // SAFE-8 / AUTONOMY-2 / AUTONOMOUS-7: the daemon has no Discord, so the
      // operator hears about the spend cap and a run that needs a human here;
      // the warning row and the ask recorded on the run row (REQ-discord-347)
      // stay pending, and a bridge's next scheduler tick posts them.
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

  // Set when stop begins. A tick still reading the allowlist then claims no
  // run: stop's drain only waits for runs already claimed.
  let stopRequested = false;

  const tick = async () => {
    try {
      // DISCORD-SCHEDULE-3: tick against the allowlist as it is now (the
      // bridge's /admin rewrites the file), updated in place so in-flight
      // runs re-check it too. A file that cannot be loaded skips the tick
      // (fail closed); due schedules stay due.
      const loaded = await tryLoadAllowlist({ env });
      if (stopRequested) return { started: [], skipped: [] };
      if (!loaded.ok) {
        log("error", "tick.allowlist_failed", { error: loaded.error });
        // OPS-1: the backup reads no allowlist; a broken file must not stop
        // it (or its failure notice) night after night.
        backup.tick(nowFn());
        return { started: [], skipped: [] };
      }
      const live = daemonGate(loaded.config, env);
      gate.sourcePath = live.sourcePath;
      gate.github = live.github;
      gate.discord = live.discord;
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

  // REQ-discord-346: before the first tick, fail runs a dead process left
  // "running" and remove leftover schedule-run worktrees.
  const recovered = await scheduler.recoverAbandoned();

  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  // Ref'd on purpose: this interval is what keeps the daemon process alive.
  const timer = setInterval(() => {
    void tick();
  }, pollIntervalMs);

  const all = store.list();
  const backupCfg = resolveBackupConfig(env);
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
    // OPS-1: where the nightly backup goes, or why there is none.
    backup: backupCfg.kind === "on" ? backupCfg.dir : backupCfg.kind === "off" ? "off" : backupCfg.error,
    // AGENT-13: the model scheduled runs call at the default tier, or none.
    llm: defaultProviderLabel(env) ?? "none",
    // PLUGIN-5.a: whether this daemon runs schedules ([corvidinho.plugins]).
    schedules: startSchedules ? extraStateLabel(startSchedules) : "on",
  });
  // PLUGIN-5.a: say why schedules are off (or the config is unreadable).
  if (startSchedules && !startSchedules.on) {
    log("warn", "schedules.off", schedulesOffFields(startSchedules));
  }
  // AGENT-10: with no usable provider scheduled runs fail; say so at startup.
  const llmNotice = providerNotice(env);
  if (llmNotice) log("warn", "llm.no_provider", { notice: llmNotice });
  if (recovered.runs.length > 0 || recovered.worktrees.length > 0) {
    log("warn", "daemon.recovered", {
      runs: recovered.runs.map((r) => r.id),
      worktrees: recovered.worktrees.length,
    });
  }

  let forceResolve: (() => void) | undefined;
  const forced = new Promise<false>((resolve) => {
    forceResolve = () => resolve(false);
  });
  let stopping: Promise<DaemonStopSummary> | null = null;
  const graceMs = opts.shutdownGraceMs ?? DEFAULT_SHUTDOWN_GRACE_MS;

  const stop = (reason = "stop"): Promise<DaemonStopSummary> => {
    if (stopping) return stopping;
    stopRequested = true;
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
        // Let the killed runs park their worktree before we exit.
        await scheduler.settleAbandoned(ABANDONED_SETTLE_MS);
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
