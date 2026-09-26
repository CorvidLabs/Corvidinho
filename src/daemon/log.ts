/**
 * Structured daemon logs: one JSON object per line on stdout, so journald /
 * `journalctl -o cat` / jq can read them. Every string value is scrubbed
 * (SAFE-6) — error text can carry provider output.
 */

import { scrubSecrets } from "../store/scrub.ts";

export type DaemonLogLevel = "info" | "warn" | "error";

export type DaemonLogFields = Record<string, unknown>;

export type DaemonLogger = (
  level: DaemonLogLevel,
  event: string,
  fields?: DaemonLogFields,
) => void;

export type DaemonLoggerOptions = {
  /** Line sink (default: stdout). */
  write?: (line: string) => void;
  now?: () => Date;
};

const RESERVED_KEYS = ["ts", "level", "component", "event"] as const;

function scrubValue(v: unknown): unknown {
  if (typeof v === "string") return scrubSecrets(v);
  if (Array.isArray(v)) return v.map(scrubValue);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = scrubValue(val);
    return out;
  }
  return v;
}

/** Format one log line (no trailing newline). */
export function formatDaemonLogLine(
  level: DaemonLogLevel,
  event: string,
  fields: DaemonLogFields = {},
  now: Date = new Date(),
): string {
  const body = scrubValue(fields) as Record<string, unknown>;
  // Reserved keys lead the line and win over caller fields.
  for (const k of RESERVED_KEYS) delete body[k];
  return JSON.stringify({
    ts: now.toISOString(),
    level,
    component: "daemon",
    event,
    ...body,
  });
}

export function createDaemonLogger(opts: DaemonLoggerOptions = {}): DaemonLogger {
  const write =
    opts.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const now = opts.now ?? (() => new Date());
  return (level, event, fields) => {
    write(formatDaemonLogLine(level, event, fields, now()));
  };
}
