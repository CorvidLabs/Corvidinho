/**
 * Cooperative scheduler ticker (DISCORD-SCHEDULE-3/4).
 * Steal ADR-001: ~60s poll, max concurrent 2, no catch-up, auto-pause @ 5 fails.
 * Tick MUST return without awaiting agent work so HEAR/WATCH ingress is not starved.
 */

import type { AllowlistConfig } from "../allowlist/types.ts";
import { checkChannel } from "../allowlist/discord.ts";
import type { AgentClient } from "../discord/agent-client.ts";
import type { Schedule, ScheduleStore } from "./store.ts";

export const DEFAULT_POLL_INTERVAL_MS = 60_000;
export const DEFAULT_MAX_CONCURRENT = 2;
export const FAILURE_AUTO_PAUSE = 5;

export type SchedulerOutbound = {
  /** Post schedule result to a Discord channel (optional). */
  post?: (opts: {
    channelId: string;
    content: string;
  }) => Promise<void>;
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
};

export class SchedulerService {
  private readonly store: ScheduleStore;
  private readonly agent: AgentClient;
  private readonly allowlist: AllowlistConfig;
  private readonly outbound?: SchedulerOutbound;
  private readonly pollIntervalMs: number;
  private readonly maxConcurrent: number;
  private readonly nowFn: () => number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly running = new Set<string>();
  private tickInFlight = false;

  constructor(opts: SchedulerServiceOpts) {
    this.store = opts.store;
    this.agent = opts.agent;
    this.allowlist = opts.allowlist;
    this.outbound = opts.outbound;
    this.pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.maxConcurrent = opts.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
    this.nowFn = opts.now ?? (() => Date.now());
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
    return [...this.running];
  }

  /**
   * Scan due schedules and fire async work without awaiting agents.
   * Returns immediately after scheduling starts (DISCORD-SCHEDULE-4).
   */
  async tick(): Promise<{ started: string[]; skipped: string[] }> {
    if (this.tickInFlight) return { started: [], skipped: [] };
    this.tickInFlight = true;
    const started: string[] = [];
    const skipped: string[] = [];
    try {
      const now = this.nowFn();
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
        started.push(schedule.id);
        // Fire-and-forget — do not await (ingress must not wait).
        void this.runOne(schedule);
      }
    } finally {
      this.tickInFlight = false;
    }
    return { started, skipped };
  }

  private async runOne(schedule: Schedule): Promise<void> {
    this.running.add(schedule.id);
    const now = this.nowFn();
    const run = this.store.markRunStarted(schedule, now);
    try {
      // Channel allowlist re-check before any outbound (DISCORD-SCHEDULE-3).
      if (schedule.channelId) {
        const gate = checkChannel(schedule.channelId, this.allowlist);
        if (!gate.ok) {
          this.store.markRunFinished(schedule, run, {
            ok: false,
            error: `channel not allowlisted: ${schedule.channelId}`,
          });
          this.maybeAutoPause(schedule);
          return;
        }
      }

      const prompt = [
        `Scheduled work "${schedule.name}" on project: ${schedule.project}`,
        "",
        schedule.prompt,
        "",
        "Stay within existing allowlists and SAFE gates. Linux host only.",
      ].join("\n");

      const result = await this.agent.runChat({
        prompt,
        sessionId: `schedule_${schedule.id}`,
        resume: false,
      });

      const summary = result.ok
        ? result.summary.slice(0, 1500)
        : `failed (exit ${result.exitCode})`;

      this.store.markRunFinished(schedule, run, {
        ok: result.ok,
        summary,
        error: result.ok ? undefined : summary,
      });

      if (schedule.channelId && this.outbound?.post) {
        const gate = checkChannel(schedule.channelId, this.allowlist);
        if (gate.ok) {
          const status = result.ok ? "✅" : "❌";
          await this.outbound.post({
            channelId: schedule.channelId,
            content: `${status} Schedule **${schedule.name}** (\`${schedule.id.slice(0, 12)}\`) on \`${schedule.project}\`:\n${summary.slice(0, 1500)}`,
          });
        }
      }

      this.maybeAutoPause(schedule);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.store.markRunFinished(schedule, run, { ok: false, error: msg });
      this.maybeAutoPause(schedule);
    } finally {
      this.running.delete(schedule.id);
    }
  }

  private maybeAutoPause(schedule: Schedule): void {
    if (schedule.consecutiveFailures >= FAILURE_AUTO_PAUSE) {
      this.store.setStatus(schedule.id, "paused", this.nowFn());
    }
  }
}
