/**
 * Parse `task run --json` stdout into a short caller-friendly summary
 * (Discord HEAR / WATCH poll). Falls back to truncated stdout/stderr.
 */

export function summarizeTaskRunOutput(
  stdout: string,
  stderr: string,
  exitCode: number,
): string {
  const trimmed = stdout.trim();
  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed) as {
        result?: {
          summary?: string;
          state?: string;
          verified?: boolean;
          verifySkipped?: boolean;
          attempts?: number;
          cancelled?: boolean;
        };
      };
      const r = parsed?.result;
      if (r && typeof r === "object") {
        const bits: string[] = [];
        if (r.state) bits.push(`state=${r.state}`);
        if (typeof r.verified === "boolean") bits.push(`verified=${r.verified}`);
        if (r.verifySkipped) bits.push("verifySkipped");
        if (r.cancelled) bits.push("cancelled");
        if (typeof r.attempts === "number") bits.push(`attempts=${r.attempts}`);
        const head = bits.join(" ");
        const body = typeof r.summary === "string" ? r.summary.trim() : "";
        const text = body ? (head ? `${head}\n${body}` : body) : head || trimmed;
        return text.slice(0, 1800);
      }
    } catch {
      /* fall through to raw */
    }
  }
  return (
    trimmed.slice(0, 1800) ||
    stderr.trim().slice(0, 500) ||
    `(exit ${exitCode})`
  );
}
