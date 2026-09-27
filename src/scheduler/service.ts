/**
 * Cooperative scheduler ticker (DISCORD-SCHEDULE-3/4).
 * Steal ADR-001: ~60s poll, max concurrent 2, no catch-up, auto-pause @ 5 fails.
 * Tick MUST return without awaiting agent work so HEAR/WATCH ingress is not starved.
 * SESSION-WORKTREE: each tick uses the schedule's project worktree/scope.
 * CLI-8 / AUTONOMOUS-4: the same ticker runs inside the Discord bridge and in
 * `corvidinho daemon`; each tick re-reads SQLite and claims a due run
 * atomically, so two tickers on one data dir fire it once.
 * REQ-discord-346: a run never stays "running" forever — an outcome write is
 * retried once, stops abandon in-flight runs and let them park their
 * worktree, and a start recovers runs and worktrees a dead process left.
 */

import { basename } from "node:path";
import type { AllowlistConfig } from "../allowlist/types.ts";
import { checkChannel } from "../allowlist/discord.ts";
import type { AgentClient } from "../discord/agent-client.ts";
import {
  ASK_NO_OWNER_WARNING,
  askPingKey,
  formatAskReply,
  withSpendWarningPost,
} from "../discord/ask-ping.ts";
import { askPingOwner, takeSpendWarning } from "../discord/spend-post.ts";
import type { SpendAlertOutbox } from "../agent/spend-outbox.ts";
import type { HumanAskReason, SpendWarning } from "../agent/types.ts";
import type { OwnerRecord } from "../identity/owner.ts";
import { scrubSecrets } from "../store/scrub.ts";
import {
  ensureTalkWorkspace,
  isGitRepo,
  parkWorktree,
  resolveProjectDir,
} from "../worktree/index.ts";
import type { Schedule, ScheduleRun, ScheduleStore } from "./store.ts";

export const DEFAULT_POLL_INTERVAL_MS = 60_000;
export const DEFAULT_MAX_CONCURRENT = 2;
export const FAILURE_AUTO_PAUSE = 5;
/**
 * How long a stop waits, after aborting abandoned runs, for them to park
 * their worktree and branch (REQ-discord-346). Short and bounded: the agent
 * tree is already killed; what is left is `git worktree remove`.
 */
export const ABANDONED_SETTLE_MS = 3_000;

/** Worktree dir of a schedule run: `talk-schedule_<schedule id>_<run id>`. */
const RUN_WORKTREE_RE = /^talk-(schedule_[A-Za-z0-9_-]+_(srun_[A-Za-z0-9]+))$/;

/** Name part of a run's worktree (`talk-<key>`) and branch (`talk/<key>`). */
function runWorktreeKey(scheduleId: string, runId: string): string {
  return `schedule_${scheduleId}_${runId}`.replace(/[^a-zA-Z0-9_-]/g, "");
}

/** One scrubbed line (SAFE-6), capped, never a stack. Never throws. */
function errorLine(err: unknown): string {
  try {
    const msg = String(err instanceof Error ? err.message : err);
    return scrubSecrets(msg).replace(/\s+/g, " ").trim().slice(0, 500);
  } catch {
    return "(unprintable error)";
  }
}

/**
 * Log a tick or run error that nothing else would catch (REQ-discord-331).
 * Only the scrubbed message is logged (SAFE-6), on one line, never a stack.
 * Never throws: it runs in the `.catch` that keeps these promises from
 * rejecting.
 */
function logSchedulerError(where: "tick" | "run" | "recovery", err: unknown): void {
  console.error(`[scheduler] ${where} failed: ${errorLine(err)}`);
}

/** Schedule-run worktrees (and their branch) registered in `projectDir`'s repo. */
async function listScheduleRunWorktrees(
  projectDir: string,
): Promise<Array<{ path: string; key: string; runId: string; branchName: string }>> {
  const proc = Bun.spawn(["git", "worktree", "list", "--porcelain"], {
    cwd: projectDir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  if ((await proc.exited) !== 0) return [];
  const found: Array<{ path: string; key: string; runId: string; branchName: string }> = [];
  for (const block of out.split("\n\n")) {
    const lines = block.split("\n");
    const path = lines.find((l) => l.startsWith("worktree "))?.slice(9);
    const branch = lines
      .find((l) => l.startsWith("branch refs/heads/"))
      ?.slice("branch refs/heads/".length);
    const m = path ? RUN_WORKTREE_RE.exec(basename(path)) : null;
    // Only the exact names runOne gives a run's worktree and branch.
    if (!path || !m || branch !== `talk/${m[1]}`) continue;
    found.push({ path, key: m[1]!, runId: m[2]!, branchName: branch });
  }
  return found;
}

export type SchedulerOutbound = {
  /**
   * Post schedule result to a Discord channel (optional). Resolving `false`
   * means the post did not go out (a claimed spend warning is handed back).
   */
  post?: (opts: {
    channelId: string;
    content: string;
    /** Only these users may be pinged (AUTONOMY-2 owner ping). */
    mentionUserIds?: string[];
  }) => Promise<void | boolean>;
};

/** One finished (or abandoned) schedule run, for operator logs. */
export type ScheduleRunFinished = {
  scheduleId: string;
  runId: string;
  ok: boolean;
  /** Failure reason (already scrubbed when persisted; callers scrub logs). */
  error?: string;
  /** Schedule was auto-paused after this run (FAILURE_AUTO_PAUSE). */
  autoPaused: boolean;
  /** The run stopped to ask a human (AUTONOMY-1/2; `spend-cap` = SAFE-8). */
  askReason?: HumanAskReason;
  /** This run crossed 80% of the daily spend cap (SAFE-8). */
  spendWarning?: SpendWarning;
};

export type SchedulerServiceOpts = {
  store: ScheduleStore;
  agent: AgentClient;
  allowlist: AllowlistConfig;
  outbound?: SchedulerOutbound;
  pollIntervalMs?: number;
  maxConcurrent?: number;
  /** Injectable clock (tests). */
  now?: () => number;
  /** When true, do not start the interval (tests call tick() manually). */
  manual?: boolean;
  /**
   * Default project root used when resolving relative schedule.project
   * (usually bridge projectRoot).
   */
  defaultProjectRoot?: string;
  /**
   * When false, skip worktree isolation (tests that only check tick timing).
   * Default true.
   */
  useWorktrees?: boolean;
  /** Configured owner pinged when a tick needs a human (AUTONOMY-2). */
  owner?: OwnerRecord | null;
  /**
   * SAFE-8 — pending 80% warnings and the once-per-episode spend-cap ping
   * (the bridge wires its shared DB). Without it a post carries the run's
   * own warning and a spend-cap ask pings per the schedule's ping key.
   */
  spendAlerts?: SpendAlertOutbox;
  /** Called once per run when it finishes or is abandoned (daemon logs). */
  onRunFinished?: (event: ScheduleRunFinished) => void;
};

/** What a start-up `recoverAbandoned()` fixed (REQ-discord-346). */
export type ScheduleRecovery = {
  /** Runs a dead process left "running", now failed. */
  runs: ScheduleRun[];
  /** Leftover schedule-run worktrees removed (branch kept when it has commits). */
  worktrees: string[];
};

type InFlight = {
  schedule: Schedule;
  run: ScheduleRun;
  settled: Promise<void>;
  /** Aborted when the run is abandoned: stops the spawned agent's process tree. */
  stop: AbortController;
};

export class SchedulerService {
  private readonly store: ScheduleStore;
  private readonly agent: AgentClient;
  private readonly allowlist: AllowlistConfig;
  private readonly outbound?: SchedulerOutbound;
  private readonly pollIntervalMs: number;
  private readonly maxConcurrent: number;
  private readonly nowFn: () => number;
  private readonly defaultProjectRoot: string;
  private readonly useWorktrees: boolean;
  private readonly owner: OwnerRecord | null;
  private readonly spendAlerts?: SpendAlertOutbox;
  private readonly onRunFinished?: (event: ScheduleRunFinished) => void;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly running = new Map<string, InFlight>();
  /** Runs already finished/abandoned — a run is recorded once. */
  private readonly finishedRuns = new WeakSet<ScheduleRun>();
  /** Abandoned runs still cleaning up (parking their worktree). */
  private readonly abandoned = new Set<Promise<void>>();
  private tickInFlight = false;

  constructor(opts: SchedulerServiceOpts) {
    this.store = opts.store;
    this.agent = opts.agent;
    this.allowlist = opts.allowlist;
    this.outbound = opts.outbound;
    this.pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.maxConcurrent = opts.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
    this.nowFn = opts.now ?? (() => Date.now());
    this.defaultProjectRoot = opts.defaultProjectRoot ?? process.cwd();
    this.useWorktrees = opts.useWorktrees !== false;
    this.owner = opts.owner ?? null;
    this.spendAlerts = opts.spendAlerts;
    this.onRunFinished = opts.onRunFinished;
    if (!opts.manual) {
      this.start();
    }
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      // REQ-discord-331: a tick that throws (e.g. SQLITE_BUSY from another
      // process on the data dir) is logged; the next tick still runs. Left
      // uncaught it is an unhandled rejection, which exits the bridge.
      this.tick().catch((err) => logSchedulerError("tick", err));
    }, this.pollIntervalMs);
    // Unref so the timer alone does not keep the process alive in tests/CLI.
    if (typeof this.timer === "object" && "unref" in this.timer) {
      (this.timer as NodeJS.Timeout).unref?.();
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Running schedule ids (for tests / status). */
  runningIds(): string[] {
    return [...this.running.keys()];
  }

  /**
   * Scan due schedules and fire async work without awaiting agents.
   * Returns immediately after scheduling starts (DISCORD-SCHEDULE-4).
   * `skipped` includes due runs another ticker on the same data dir claimed.
   * Rejects when the store throws (the `start()` interval and the daemon
   * catch it); the tick lock is released either way, so the next tick runs,
   * and runs already claimed by this tick keep going.
   */
  async tick(): Promise<{ started: string[]; skipped: string[] }> {
    if (this.tickInFlight) return { started: [], skipped: [] };
    this.tickInFlight = true;
    const started: string[] = [];
    const skipped: string[] = [];
    try {
      const now = this.nowFn();
      // Another process may have created/paused/run schedules since last tick.
      this.store.refresh();
      const due = this.store.listDue(now);
      for (const schedule of due) {
        if (this.running.size >= this.maxConcurrent) {
          skipped.push(schedule.id);
          continue;
        }
        if (this.running.has(schedule.id)) {
          skipped.push(schedule.id);
          continue;
        }
        const run = this.store.claimRun(schedule, now);
        if (!run) {
          skipped.push(schedule.id);
          continue;
        }
        started.push(schedule.id);
        const entry: InFlight = {
          schedule,
          run,
          settled: Promise.resolve(),
          stop: new AbortController(),
        };
        this.running.set(schedule.id, entry);
        // Fire-and-forget — do not await (ingress must not wait). Only a
        // shutdown drain() ever handles this promise, so it must never reject
        // (REQ-discord-331).
        entry.settled = this.runOne(schedule, run, entry.stop.signal).catch(
          (err) => logSchedulerError("run", err),
        );
      }
    } finally {
      this.tickInFlight = false;
    }
    return { started, skipped };
  }

  /**
   * Wait until in-flight runs settle, up to `timeoutMs`.
   * Resolves true when none are left running.
   */
  async drain(timeoutMs: number): Promise<boolean> {
    if (this.running.size === 0) return true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, Math.max(0, timeoutMs));
    });
    const settled = Promise.allSettled(
      [...this.running.values()].map((e) => e.settled),
    ).then(() => undefined);
    try {
      await Promise.race([settled, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    return this.running.size === 0;
  }

  /**
   * Record every still-running run as failed with `reason` (shutdown after
   * the grace period) so history never shows a run stuck at "running", and
   * stop its spawned agent's whole process tree so nothing keeps working
   * after the shutdown (AGENT-3). Returns the abandoned schedule ids.
   */
  abandonInFlight(reason: string): string[] {
    const ids: string[] = [];
    for (const [id, entry] of this.running) {
      try {
        this.finish(entry.schedule, entry.run, { ok: false, error: reason });
      } catch (err) {
        // Never skip the abort: an unrecorded run is recovered at next start.
        logSchedulerError("run", err);
      }
      entry.stop.abort(new Error(reason));
      // Its runOne still parks the worktree once the agent is gone.
      const settled = entry.settled;
      this.abandoned.add(settled);
      void settled.finally(() => this.abandoned.delete(settled));
      ids.push(id);
    }
    this.running.clear();
    return ids;
  }

  /**
   * After `abandonInFlight`, wait up to `timeoutMs` for the aborted runs to
   * finish cleaning up (park their worktree / empty branch), so a stop that
   * exits right after leaves nothing behind (REQ-discord-346). Resolves true
   * when all are done; what is still pending is recovered at next start.
   */
  async settleAbandoned(timeoutMs: number): Promise<boolean> {
    if (this.abandoned.size === 0) return true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, Math.max(0, timeoutMs));
    });
    try {
      await Promise.race([
        Promise.allSettled([...this.abandoned]).then(() => undefined),
        timeout,
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    return this.abandoned.size === 0;
  }

  /**
   * Restart recovery (REQ-discord-346 / SESSION-WORKTREE-3), run once at
   * start before ticking: fail runs a dead process left "running"
   * (`interrupted: process restarted`), then remove every schedule-run
   * worktree whose run this data dir recorded as ended — a crash, or a stop
   * whose bounded grace ran out — with the usual safe cleanup: the `talk/`
   * branch is deleted only when it has no commits of its own, else kept.
   * Runs a live process owns (another bridge or daemon on this data dir)
   * and their worktrees are left alone, and so is a worktree whose run this
   * data dir does not know: it belongs to another data dir sharing the repo
   * (another bridge or daemon, or a `bun test` / verify lane run inside a
   * live schedule worktree). Never throws: errors are logged.
   */
  async recoverAbandoned(): Promise<ScheduleRecovery> {
    const recovery: ScheduleRecovery = { runs: [], worktrees: [] };
    try {
      recovery.runs = this.store.recoverAbandonedRuns(this.nowFn());
    } catch (err) {
      // Without the run rows we cannot tell leftovers from live runs.
      logSchedulerError("recovery", err);
      return recovery;
    }
    // Memory-only stores (tests) know no other process's runs.
    if (!this.useWorktrees || !this.store.durable) return recovery;
    const projectDirs = new Set<string>([this.defaultProjectRoot]);
    try {
      for (const schedule of this.store.list()) {
        const resolved = resolveProjectDir(schedule.project, {
          defaultProjectRoot: this.defaultProjectRoot,
          github: this.allowlist.github,
        });
        if (resolved.ok) projectDirs.add(resolved.dir);
      }
    } catch (err) {
      logSchedulerError("recovery", err);
    }
    const seen = new Set<string>();
    for (const projectDir of projectDirs) {
      try {
        if (!isGitRepo(projectDir)) continue;
        for (const wt of await listScheduleRunWorktrees(projectDir)) {
          if (seen.has(wt.path)) continue;
          seen.add(wt.path);
          // Only an ended run this data dir recorded, under the schedule its
          // worktree name says. Unknown ⇒ another data dir's: never touch.
          const known = this.store.runRecord(wt.runId);
          if (!known || known.status === "running") continue;
          if (runWorktreeKey(known.scheduleId, wt.runId) !== wt.key) continue;
          await parkWorktree(projectDir, wt.path, {
            kind: "worktree",
            branchName: wt.branchName,
          });
          recovery.worktrees.push(wt.path);
        }
      } catch (err) {
        logSchedulerError("recovery", err);
      }
    }
    return recovery;
  }

  private async runOne(
    schedule: Schedule,
    run: ScheduleRun,
    signal: AbortSignal,
  ): Promise<void> {
    let workDir: string | undefined;
    let projectDir: string | undefined;
    let workspaceKind: "worktree" | "scoped_dir" | undefined;
    let branchName: string | undefined;
    try {
      // Channel allowlist re-check before any outbound (DISCORD-SCHEDULE-3).
      if (schedule.channelId) {
        const gate = checkChannel(schedule.channelId, this.allowlist);
        if (!gate.ok) {
          this.finish(schedule, run, {
            ok: false,
            error: `channel not allowlisted: ${schedule.channelId}`,
          });
          return;
        }
      }

      // SESSION-WORKTREE: resolve schedule.project → isolated cwd.
      if (this.useWorktrees) {
        // REQ-discord-202: same project scope as /work (DISCORD-SCHEDULE-3).
        const resolved = resolveProjectDir(schedule.project, {
          defaultProjectRoot: this.defaultProjectRoot,
          github: this.allowlist.github,
        });
        if (!resolved.ok) {
          this.finish(schedule, run, {
            ok: false,
            error: `project resolve failed: ${resolved.error}`,
          });
          return;
        }
        projectDir = resolved.dir;
        // Name the worktree/branch from the full schedule + run ids. The
        // default 16-char prefix gave every run of a schedule (and schedules
        // sharing a first id char) one dir/branch, so a new run wiped the last.
        const runKey = runWorktreeKey(schedule.id, run.id);
        const ensured = await ensureTalkWorkspace({
          projectWorkingDir: resolved.dir,
          sessionId: runKey,
          worktreeId: `talk-${runKey}`,
          branchName: `talk/${runKey}`,
        });
        if (!ensured.ok) {
          this.finish(schedule, run, {
            ok: false,
            error: `worktree failed: ${ensured.error}`,
          });
          return;
        }
        workDir = ensured.workspace.workDir;
        workspaceKind = ensured.workspace.kind;
        branchName = ensured.workspace.branchName;
      }

      const prompt = [
        `Scheduled work "${schedule.name}" on project: ${schedule.project}`,
        workDir ? `Worktree: ${workDir}` : "",
        "",
        schedule.prompt,
        "",
        "Stay within existing allowlists and SAFE gates. Linux host only.",
      ]
        .filter((l) => l !== undefined)
        .join("\n");

      // MEMORY scope to schedule creator; forget/override stay deny without live ADMIN re-check.
      const result = await this.agent.runChat({
        prompt,
        sessionId: `schedule_${schedule.id}`,
        resume: false,
        actingUserId: schedule.createdByUserId,
        actingIsAdmin: false,
        cwd: workDir,
        signal,
      });

      const summary = result.ok
        ? result.summary.slice(0, 1500)
        : `failed (exit ${result.exitCode})`;

      // Abandoned at shutdown meanwhile: already recorded, post nothing.
      if (!this.finish(schedule, run, {
        ok: result.ok,
        summary,
        error: result.ok ? undefined : summary,
        ...(result.ask ? { askReason: result.ask.reason } : {}),
        ...(result.spendWarning ? { spendWarning: result.spendWarning } : {}),
      })) {
        return;
      }

      // A clean run re-arms the owner ping for the next question (AUTONOMY-2).
      if (result.ok && !result.ask && schedule.askPingKey) {
        this.store.setAskPingKey(schedule.id, null);
      }

      if (schedule.channelId && this.outbound?.post) {
        const gate = checkChannel(schedule.channelId, this.allowlist);
        const title = `Schedule **${schedule.name}** (\`${schedule.id.slice(0, 12)}\`) on \`${schedule.project}\``;
        // AUTONOMY-2: a tick that needs a human posts its question and pings
        // the owner once per question — a repeat still posts, without a ping.
        const pingKey = result.ask ? askPingKey(result.ask) : null;
        const alreadyPinged =
          pingKey !== null && schedule.askPingKey === pingKey;
        // SAFE-8: a spend-cap ask also pings once per cap episode across
        // every bridge surface (only consulted when this post would ping).
        const askOwner =
          result.ask && gate.ok && !alreadyPinged
            ? askPingOwner(result.ask, this.owner, this.spendAlerts)
            : { owner: null, deduped: alreadyPinged, release: () => {} };
        const ask = result.ask
          ? formatAskReply({
              ask: result.ask,
              // Stuck / spend-cap: owner (skip when already pinged). Clarify:
              // schedule creator.
              owner: askOwner.owner,
              requesterDiscordId: alreadyPinged
                ? undefined
                : schedule.createdByUserId,
              context: result.summary,
              prefix: `${title}:`,
            })
          : null;
        // SAFE-8: a pending 80% spend warning (this run's or one recorded by
        // any other run on the data dir) rides the post and pings the owner.
        const pending = gate.ok ? takeSpendWarning(this.spendAlerts, result.spendWarning) : null;
        // `false` until a post resolves (a poster returning void counts as sent).
        let posted: void | boolean = false;
        try {
          if (gate.ok && ask && result.ask) {
            if (
              (result.ask.reason === "stuck" || result.ask.reason === "spend-cap") &&
              !ask.ownerPinged &&
              !askOwner.deduped
            ) {
              console.warn(ASK_NO_OWNER_WARNING);
            }
            posted = await this.outbound.post(
              withSpendWarningPost(
                {
                  channelId: schedule.channelId,
                  content: ask.content,
                  mentionUserIds: ask.mentionUserIds,
                },
                pending?.warning,
                this.owner,
              ),
            );
            // A ping that never went out is not remembered (AUTONOMY-2).
            if (posted !== false && ask.pinged && pingKey) {
              this.store.setAskPingKey(schedule.id, pingKey);
            }
          } else if (gate.ok) {
            const status = result.ok ? "✅" : "❌";
            posted = await this.outbound.post(
              withSpendWarningPost(
                {
                  channelId: schedule.channelId,
                  content: `${status} ${title}:\n${summary.slice(0, 1500)}`,
                },
                pending?.warning,
                this.owner,
              ),
            );
          }
        } finally {
          // Not posted: the next post carries the warning and the cap ping.
          if (posted === false) {
            pending?.release();
            askOwner.release();
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Already recorded (a post failed after the outcome was written, or
      // the run was abandoned): log it instead of swallowing it.
      if (!this.finish(schedule, run, { ok: false, error: msg })) {
        logSchedulerError("run", err);
      }
    } finally {
      try {
        // Park/remove so another talk never silently reuses this cwd.
        if (workDir && projectDir) {
          await parkWorktree(projectDir, workDir, {
            kind: workspaceKind,
            branchName,
          });
        }
      } finally {
        // Always free the slot, or a failed park wedges this schedule.
        if (this.running.get(schedule.id)?.run.id === run.id) {
          this.running.delete(schedule.id);
        }
      }
    }
  }

  /**
   * Record a run outcome once, then auto-pause after repeated failures.
   * Returns false when the run was already recorded (e.g. abandoned).
   * REQ-discord-346: the run counts as recorded only once the store write
   * succeeds. A write that throws (SQLITE_BUSY) is logged and retried once;
   * if that fails too it is logged as `[scheduler] run failed: …` and the
   * run counts as failed here (its row is recovered at the next start).
   */
  private finish(
    schedule: Schedule,
    run: ScheduleRun,
    result: {
      ok: boolean;
      summary?: string;
      error?: string;
      askReason?: HumanAskReason;
      spendWarning?: SpendWarning;
    },
  ): boolean {
    if (this.finishedRuns.has(run)) return false;
    const record = { ok: result.ok, summary: result.summary, error: result.error };
    let outcome: { ok: boolean; error?: string } = record;
    try {
      this.store.markRunFinished(schedule, run, record);
    } catch (first) {
      console.error(
        `[scheduler] run ${run.id} of schedule ${schedule.id}: recording its outcome failed, retrying once: ${errorLine(first)}`,
      );
      try {
        this.store.markRunFinished(schedule, run, record);
      } catch (second) {
        const why = errorLine(second);
        console.error(
          `[scheduler] run failed: could not record run ${run.id} of schedule ${schedule.id} (${result.ok ? "completed" : "failed"}); counted as failed: ${why}`,
        );
        outcome = { ok: false, error: `run outcome not recorded: ${why}` };
        run.status = "failed";
        run.error = outcome.error;
        run.completedAt = this.nowFn();
        schedule.consecutiveFailures += 1;
      }
    }
    this.finishedRuns.add(run);
    const autoPaused = this.maybeAutoPause(schedule);
    this.onRunFinished?.({
      scheduleId: schedule.id,
      runId: run.id,
      ok: outcome.ok,
      error: outcome.error,
      autoPaused,
      ...(result.askReason ? { askReason: result.askReason } : {}),
      ...(result.spendWarning ? { spendWarning: result.spendWarning } : {}),
    });
    return true;
  }

  private maybeAutoPause(schedule: Schedule): boolean {
    if (schedule.consecutiveFailures >= FAILURE_AUTO_PAUSE) {
      this.store.setStatus(schedule.id, "paused", this.nowFn());
      return true;
    }
    return false;
  }
}
