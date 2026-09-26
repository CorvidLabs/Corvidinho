/**
 * Cooperative scheduler ticker (DISCORD-SCHEDULE-3/4).
 * Steal ADR-001: ~60s poll, max concurrent 2, no catch-up, auto-pause @ 5 fails.
 * Tick MUST return without awaiting agent work so HEAR/WATCH ingress is not starved.
 * SESSION-WORKTREE: each tick uses the schedule's project worktree/scope.
 * CLI-8 / AUTONOMOUS-4: the same ticker runs inside the Discord bridge and in
 * `corvidinho daemon`; each tick re-reads SQLite and claims a due run
 * atomically, so two tickers on one data dir fire it once.
 */

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
import {
  ensureTalkWorkspace,
  parkWorktree,
  resolveProjectDir,
} from "../worktree/index.ts";
import type { Schedule, ScheduleRun, ScheduleStore } from "./store.ts";

export const DEFAULT_POLL_INTERVAL_MS = 60_000;
export const DEFAULT_MAX_CONCURRENT = 2;
export const FAILURE_AUTO_PAUSE = 5;

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

type InFlight = {
  schedule: Schedule;
  run: ScheduleRun;
  settled: Promise<void>;
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
      void this.tick();
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
        const entry: InFlight = { schedule, run, settled: Promise.resolve() };
        this.running.set(schedule.id, entry);
        // Fire-and-forget — do not await (ingress must not wait).
        entry.settled = this.runOne(schedule, run);
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
   * the grace period) so history never shows a run stuck at "running".
   * Returns the abandoned schedule ids.
   */
  abandonInFlight(reason: string): string[] {
    const ids: string[] = [];
    for (const [id, entry] of this.running) {
      this.finish(entry.schedule, entry.run, { ok: false, error: reason });
      ids.push(id);
    }
    this.running.clear();
    return ids;
  }

  private async runOne(schedule: Schedule, run: ScheduleRun): Promise<void> {
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
        const resolved = resolveProjectDir(schedule.project, {
          defaultProjectRoot: this.defaultProjectRoot,
        });
        if (!resolved.ok) {
          this.finish(schedule, run, {
            ok: false,
            error: `project resolve failed: ${resolved.error}`,
          });
          return;
        }
        projectDir = resolved.dir;
        const ensured = await ensureTalkWorkspace({
          projectWorkingDir: resolved.dir,
          sessionId: `schedule_${schedule.id}_${run.id}`,
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
            : { owner: null, deduped: alreadyPinged };
        const ask = result.ask
          ? formatAskReply({
              ask: result.ask,
              owner: askOwner.owner,
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
          if (gate.ok && ask) {
            if (!ask.ownerPinged && !askOwner.deduped) {
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
            if (ask.ownerPinged && pingKey) {
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
          if (posted === false) pending?.release();
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.finish(schedule, run, { ok: false, error: msg });
    } finally {
      // Park/remove so another talk never silently reuses this cwd.
      if (workDir && projectDir) {
        await parkWorktree(projectDir, workDir, {
          kind: workspaceKind,
          branchName,
        });
      }
      if (this.running.get(schedule.id)?.run.id === run.id) {
        this.running.delete(schedule.id);
      }
    }
  }

  /**
   * Record a run outcome once, then auto-pause after repeated failures.
   * Returns false when the run was already recorded (e.g. abandoned).
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
    this.finishedRuns.add(run);
    this.store.markRunFinished(schedule, run, {
      ok: result.ok,
      summary: result.summary,
      error: result.error,
    });
    const autoPaused = this.maybeAutoPause(schedule);
    this.onRunFinished?.({
      scheduleId: schedule.id,
      runId: run.id,
      ok: result.ok,
      error: result.error,
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
