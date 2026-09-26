/**
 * WATCH-RELIABILITY-2 — persist spawn outcome (start, exit/error class, duration).
 * Structured log line + durable JSONL under the Corvidinho data dir.
 */

import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveDataDir } from "../store/paths.ts";

export type SpawnOutcome = {
  /** ISO timestamp when spawn started. */
  startedAt: string;
  /** ISO timestamp when spawn finished. */
  finishedAt: string;
  eventId: string;
  sessionId: string;
  repo: string;
  number: number;
  ok: boolean;
  exitCode: number;
  errorClass: string;
  durationMs: number;
  summaryPreview?: string;
};

export type SpawnErrorClass =
  | "ok"
  | "exit_nonzero"
  | "spawn_throw"
  | "unknown";

export function classifySpawnError(
  ok: boolean,
  exitCode: number,
  threw?: boolean,
): SpawnErrorClass {
  if (threw) return "spawn_throw";
  if (ok && exitCode === 0) return "ok";
  if (!ok || exitCode !== 0) return "exit_nonzero";
  return "unknown";
}

export function formatSpawnOutcomeLog(o: SpawnOutcome): string {
  return (
    `[watch] spawn outcome event=${o.eventId} session=${o.sessionId} ` +
    `repo=${o.repo}#${o.number} ok=${o.ok} exit=${o.exitCode} ` +
    `error_class=${o.errorClass} duration_ms=${o.durationMs}`
  );
}

export function formatSpawnStartLog(opts: {
  eventId: string;
  sessionId: string;
  repo: string;
  number: number;
}): string {
  return (
    `[watch] spawn start event=${opts.eventId} session=${opts.sessionId} ` +
    `repo=${opts.repo}#${opts.number}`
  );
}

export function defaultSpawnLogPath(opts?: {
  env?: NodeJS.ProcessEnv;
  home?: string;
}): string {
  const env = opts?.env ?? process.env;
  const override = env.CORVIDINHO_WATCH_SPAWN_LOG?.trim();
  if (override) return override;
  return join(resolveDataDir({ env, home: opts?.home }), "watch-spawn.jsonl");
}

/** Durable JSONL append store for spawn outcomes (ops-readable without Discord). */
export class SpawnOutcomeStore {
  readonly path: string;
  private readonly disabled: boolean;

  constructor(opts: { path?: string | null; disabled?: boolean } = {}) {
    this.disabled = opts.disabled === true || opts.path === null;
    this.path = opts.path ?? defaultSpawnLogPath();
  }

  append(outcome: SpawnOutcome): void {
    if (this.disabled) return;
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      appendFileSync(this.path, `${JSON.stringify(outcome)}\n`, "utf8");
    } catch {
      // Durable store is best-effort; structured log still emitted by caller.
    }
  }

  /** Read recent outcomes (tests / ops). Newest last. */
  list(limit = 100): SpawnOutcome[] {
    if (this.disabled || !existsSync(this.path)) return [];
    try {
      const text = readFileSync(this.path, "utf8");
      const lines = text.split("\n").filter((l) => l.trim());
      const slice = lines.slice(-limit);
      const out: SpawnOutcome[] = [];
      for (const line of slice) {
        try {
          out.push(JSON.parse(line) as SpawnOutcome);
        } catch {
          /* skip bad line */
        }
      }
      return out;
    } catch {
      return [];
    }
  }
}

/** In-memory store for tests (no disk). */
export type MemorySpawnOutcomeStore = {
  path: string;
  records: SpawnOutcome[];
  append(outcome: SpawnOutcome): void;
  list(limit?: number): SpawnOutcome[];
};

export function createMemorySpawnOutcomeStore(): MemorySpawnOutcomeStore {
  const records: SpawnOutcome[] = [];
  return {
    path: ":memory:",
    records,
    append(outcome: SpawnOutcome) {
      records.push(outcome);
    },
    list(limit = 100) {
      return records.slice(-limit);
    },
  };
}
