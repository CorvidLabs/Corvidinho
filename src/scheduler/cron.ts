/**
 * Lightweight cron + human cadence parser (steal from corvid-agent
 * server/scheduler/cron-parser.ts + ADR-001 min 5m interval).
 * Linux-only; no external croner dependency for this thin slice.
 */

export const MIN_SCHEDULE_INTERVAL_MS = 300_000; // 5 minutes

const PRESETS: Record<string, string> = {
  "@hourly": "0 * * * *",
  "@daily": "0 0 * * *",
  "@weekly": "0 0 * * 0",
  "@monthly": "0 0 1 * *",
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
};

export class CadenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CadenceError";
  }
}

interface CronField {
  values: Set<number>;
}

function parseField(field: string, min: number, max: number): CronField {
  const values = new Set<number>();
  for (const part of field.split(",")) {
    const stepMatch = part.match(/^(.+)\/(\d+)$/);
    const step = stepMatch ? parseInt(stepMatch[2]!, 10) : 1;
    // A zero step never advances the loops below. The bridge parses cadences
    // synchronously (/schedule create), so refuse it before any loop runs.
    if (step < 1) {
      throw new CadenceError(
        `Invalid cron step in "${part}": the step must be 1 or more.`,
      );
    }
    const range = stepMatch ? stepMatch[1]! : part;
    if (range === "*") {
      for (let i = min; i <= max; i += step) values.add(i);
    } else if (range.includes("-")) {
      const [startStr, endStr] = range.split("-");
      const start = parseInt(startStr!, 10);
      const end = parseInt(endStr!, 10);
      // Values past the field's max never match, so stop there: a huge end
      // (`0-99999999999`, or past 2^53 where `i += step` no longer moves)
      // must not spin the bridge.
      const last = Math.min(end, max);
      for (let i = start; i <= last; i += step) values.add(i);
    } else {
      values.add(parseInt(range, 10));
    }
  }
  return { values };
}

export type ParsedCron = {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
};

export function parseCron(expression: string): ParsedCron {
  const resolved = PRESETS[expression.toLowerCase()] ?? expression;
  const parts = resolved.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new CadenceError(
      `Invalid cron expression: expected 5 fields, got ${parts.length}`,
    );
  }
  return {
    minute: parseField(parts[0]!, 0, 59),
    hour: parseField(parts[1]!, 0, 23),
    dayOfMonth: parseField(parts[2]!, 1, 31),
    month: parseField(parts[3]!, 1, 12),
    dayOfWeek: parseField(parts[4]!, 0, 7),
  };
}

/**
 * Resolve human cadence → 5-field cron.
 * Accepts: raw cron, @hourly/@daily/…, "every hour", "every N hours|minutes".
 */
export function resolveCadence(raw: string): string {
  const input = raw.trim();
  if (!input) throw new CadenceError("Cadence is required.");
  const lower = input.toLowerCase();

  if (PRESETS[lower]) return PRESETS[lower]!;

  const every = lower.match(
    /^every\s+(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours)$/,
  );
  if (every) {
    const n = parseInt(every[1]!, 10);
    const unit = every[2]!;
    const isHour = unit.startsWith("h");
    if (isHour) {
      if (n < 1) throw new CadenceError("Hour interval must be >= 1.");
      if (n === 1) return "0 * * * *";
      if (n >= 24) return "0 0 * * *";
      return `0 */${n} * * *`;
    }
    // minutes
    if (n < 5) {
      throw new CadenceError(
        `Interval too short: every ${n} minutes. Minimum is 5 minutes.`,
      );
    }
    if (n >= 60) {
      const hours = Math.floor(n / 60);
      return hours === 1 ? "0 * * * *" : `0 */${hours} * * *`;
    }
    return `*/${n} * * * *`;
  }

  if (lower === "every hour" || lower === "hourly") return "0 * * * *";
  if (lower === "every day" || lower === "daily") return "0 0 * * *";
  if (lower === "every week" || lower === "weekly") return "0 0 * * 0";
  if (lower === "every month" || lower === "monthly") return "0 0 1 * *";

  // Assume 5-field cron (or @preset already handled)
  parseCron(input); // validate
  return PRESETS[input.toLowerCase()] ?? input.trim();
}

export function getNextCronDate(expression: string, from?: Date): Date {
  const cron = parseCron(expression);
  const start = from ? new Date(from) : new Date();
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + 1);

  const maxDate = new Date(start);
  maxDate.setDate(maxDate.getDate() + 366);
  const date = new Date(start);

  while (date < maxDate) {
    if (!cron.month.values.has(date.getMonth() + 1)) {
      date.setMonth(date.getMonth() + 1, 1);
      date.setHours(0, 0, 0, 0);
      continue;
    }
    if (!cron.dayOfMonth.values.has(date.getDate())) {
      date.setDate(date.getDate() + 1);
      date.setHours(0, 0, 0, 0);
      continue;
    }
    const dow = date.getDay();
    if (
      !cron.dayOfWeek.values.has(dow) &&
      !cron.dayOfWeek.values.has(dow === 0 ? 7 : dow)
    ) {
      date.setDate(date.getDate() + 1);
      date.setHours(0, 0, 0, 0);
      continue;
    }
    if (!cron.hour.values.has(date.getHours())) {
      date.setHours(date.getHours() + 1, 0, 0, 0);
      continue;
    }
    if (!cron.minute.values.has(date.getMinutes())) {
      date.setMinutes(date.getMinutes() + 1, 0, 0);
      continue;
    }
    return date;
  }
  throw new CadenceError(
    `No matching cron date found within 366 days for: ${expression}`,
  );
}

/**
 * Validate cadence does not fire more often than every 5 minutes (ADR-001).
 * Returns resolved cron expression.
 */
export function validateAndResolveCadence(raw: string): string {
  const cron = resolveCadence(raw);
  const now = new Date();
  try {
    const first = getNextCronDate(cron, now);
    const second = getNextCronDate(cron, first);
    const gapMs = second.getTime() - first.getTime();
    if (gapMs < MIN_SCHEDULE_INTERVAL_MS) {
      throw new CadenceError(
        `Cadence "${raw}" fires every ${Math.round(gapMs / 1000)}s. Minimum interval is 5 minutes.`,
      );
    }
  } catch (err) {
    if (err instanceof CadenceError) throw err;
    throw new CadenceError(`Invalid cadence: ${raw}`);
  }
  return cron;
}
