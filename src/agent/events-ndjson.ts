/**
 * Live NDJSON event stream for bridges (issue #73 — AGENT-8 / CLI-7 /
 * DISCORD-3 / DISCORD-10). Merlin `--output ndjson` steal.
 *
 * `corvidinho task run --output ndjson` writes one frame per stdout line while
 * the run progresses; Discord / WATCH spawn clients read it line by line to
 * show real state, the current tool, and token counts. This is a machine
 * contract for bridges, not a human CLI.
 *
 * Every frame carries `protocol` (= CORVIDINHO_PROTOCOL_VERSION). AgentEvent
 * frames keep their AgentEvent `type` names; `usage` and `result` are
 * stream-only frames. Raw tool arguments are never streamed: ToolCall frames
 * carry a truncated, secret-scrubbed `argsSummary` (SAFE-6). Event-frame free
 * text (Text, ToolResult detail, VerifyResult output) is scrubbed and capped.
 * The `result` frame carries the same TaskResult as `--json` — not scrubbed,
 * same exposure as `--json` — except `summary` is capped at
 * NDJSON_LIMITS.resultSummary (frame then says `truncated: true`) so one line
 * stays well under the parser's NDJSON_LIMITS.maxLine.
 *
 * Consumers never turn frame content into reply text: a frame from another
 * protocol is withheld and reported as a protocol mismatch (DISCORD-10).
 */

import { scrubSecrets } from "../store/scrub.ts";
import {
  chatBodyFromTaskResult,
  chatBodyFromTaskRunOutput,
} from "./task-summary.ts";
import type {
  AgentEvent,
  AgentState,
  AgentTokenUsage,
  TaskResult,
} from "./types.ts";

/**
 * Wire protocol of the corvidinho binary. Bump when a bridge starts depending
 * on new output; the Discord bridge refuses a binary that reports another
 * value (DISCORD-10). 2 = `task run --output ndjson` event stream (#73).
 */
export const CORVIDINHO_PROTOCOL_VERSION = 2;

/** Caps that keep one NDJSON line bounded (chars). */
export const NDJSON_LIMITS = {
  /** Text frame body. */
  text: 4000,
  /** ToolResult detail. */
  toolDetail: 1000,
  /** VerifyResult output (tail kept — failures print last). */
  verifyOutput: 4000,
  /** `result` frame `result.summary` (head kept; bridges show ≤1800). */
  resultSummary: 4000,
  /** Whole ToolCall argsSummary. */
  argsSummary: 160,
  /** One argument value inside argsSummary. */
  argValue: 48,
  /** Argument items listed before eliding the rest. */
  argItems: 12,
  /** Tool / plugin name. */
  toolName: 80,
  /** Parser: longest unterminated line kept before it is dropped. */
  maxLine: 1_048_576,
  /** Non-frame stdout kept for the fallback summary. */
  otherText: 65_536,
} as const;

type Versioned = { protocol: number };

export type NdjsonEventFrame =
  | (Versioned & { type: "StateChanged"; state: AgentState })
  | (Versioned & { type: "Text"; text: string; truncated?: true })
  | (Versioned & { type: "ToolCall"; name: string; argsSummary: string })
  | (Versioned & {
      type: "ToolResult";
      name: string;
      success: boolean;
      detail?: string;
    })
  | (Versioned & {
      type: "VerifyResult";
      success: boolean;
      output: string;
      truncated?: true;
    });

export type NdjsonUsageFrame = Versioned & { type: "usage" } & AgentTokenUsage;

export type NdjsonResultFrame = Versioned & {
  type: "result";
  /**
   * Same object `task run --json` prints under `result`, except `summary` is
   * capped at NDJSON_LIMITS.resultSummary (ending in `…`).
   */
  result: TaskResult;
  /** Set when `result.summary` was capped. */
  truncated?: true;
};

export type NdjsonFrame = NdjsonEventFrame | NdjsonUsageFrame | NdjsonResultFrame;

export type TaskOutputMode = "text" | "json" | "ndjson";

export const TASK_OUTPUT_MODES: readonly TaskOutputMode[] = [
  "text",
  "json",
  "ndjson",
];

// ─── Serializer ────────────────────────────────────────────────────────────

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

/** Scrub first so a secret is never cut into a shape the scrubber misses. */
function capHead(s: string, max: number): { text: string; truncated: boolean } {
  const clean = scrubSecrets(s);
  if (clean.length <= max) return { text: clean, truncated: false };
  return { text: `${clean.slice(0, max)}…`, truncated: true };
}

function capTail(s: string, max: number): { text: string; truncated: boolean } {
  const clean = scrubSecrets(s);
  if (clean.length <= max) return { text: clean, truncated: false };
  return { text: `…${clean.slice(clean.length - max)}`, truncated: true };
}

const SENSITIVE_KEY_RE =
  /token|secret|passw|api[-_]?key|auth|cookie|credential|private|^key$/i;
const SENSITIVE_FLAG_RE =
  /^--?[\w-]*(token|secret|passw|api[-_]?key|auth|cookie|credential|private)[\w-]*$/i;

function summarizeValue(v: unknown): string {
  let s: string;
  if (typeof v === "string") s = v;
  else if (v === null || typeof v === "number" || typeof v === "boolean") {
    s = String(v);
  } else if (Array.isArray(v)) s = `[${v.length} items]`;
  else if (typeof v === "object") s = "{…}";
  else s = typeof v;
  return clip(scrubSecrets(s).replace(/\s+/g, " ").trim(), NDJSON_LIMITS.argValue);
}

function summarizeArgv(items: unknown[]): string[] {
  const out: string[] = [];
  let redactNext = false;
  for (let i = 0; i < items.length; i++) {
    if (i >= NDJSON_LIMITS.argItems) {
      out.push(`…(+${items.length - i})`);
      break;
    }
    const item = items[i];
    if (redactNext) {
      out.push("[redacted]");
      redactNext = false;
      continue;
    }
    if (typeof item === "string") {
      const eq = item.match(/^(--?[\w-]+)=/);
      if (eq && SENSITIVE_FLAG_RE.test(eq[1])) {
        out.push(`${eq[1]}=[redacted]`);
        continue;
      }
      if (SENSITIVE_FLAG_RE.test(item)) {
        out.push(item);
        redactNext = true;
        continue;
      }
    }
    out.push(summarizeValue(item));
  }
  return out;
}

/**
 * Truncated, redacted one-line summary of a tool call's JSON arguments.
 * Never returns the raw argument text: unparseable input is described by
 * length only; sensitive keys / flags print `[redacted]`; every value is
 * SAFE-6 scrubbed and clipped.
 */
export function summarizeToolArgs(raw: string | undefined): string {
  const src = raw ?? "";
  if (!src.trim()) return "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(src);
  } catch {
    return `(${src.length} chars, unparsed)`;
  }
  let parts: string[];
  if (Array.isArray(parsed)) {
    parts = summarizeArgv(parsed);
  } else if (parsed && typeof parsed === "object") {
    parts = [];
    const entries = Object.entries(parsed as Record<string, unknown>);
    for (let i = 0; i < entries.length; i++) {
      if (i >= NDJSON_LIMITS.argItems) {
        parts.push(`…(+${entries.length - i})`);
        break;
      }
      const [k, v] = entries[i];
      const key = clip(scrubSecrets(k).replace(/\s+/g, "_"), 32);
      if (SENSITIVE_KEY_RE.test(k)) {
        parts.push(`${key}=[redacted]`);
      } else if (Array.isArray(v)) {
        parts.push(`${key}=[${summarizeArgv(v).join(" ")}]`);
      } else {
        parts.push(`${key}=${summarizeValue(v)}`);
      }
    }
  } else {
    parts = [summarizeValue(parsed)];
  }
  return clip(parts.join(" "), NDJSON_LIMITS.argsSummary);
}

/** One AgentEvent → one frame (redacted / capped). */
export function frameFromEvent(e: AgentEvent): NdjsonEventFrame {
  const protocol = CORVIDINHO_PROTOCOL_VERSION;
  switch (e.type) {
    case "StateChanged":
      return { protocol, type: "StateChanged", state: e.state };
    case "Text": {
      const c = capHead(e.text, NDJSON_LIMITS.text);
      return c.truncated
        ? { protocol, type: "Text", text: c.text, truncated: true }
        : { protocol, type: "Text", text: c.text };
    }
    case "ToolCall":
      return {
        protocol,
        type: "ToolCall",
        name: clip(scrubSecrets(e.name), NDJSON_LIMITS.toolName),
        argsSummary: summarizeToolArgs(e.args),
      };
    case "ToolResult": {
      const frame: Extract<NdjsonEventFrame, { type: "ToolResult" }> = {
        protocol,
        type: "ToolResult",
        name: clip(scrubSecrets(e.name), NDJSON_LIMITS.toolName),
        success: e.success,
      };
      if (e.detail) {
        frame.detail = capHead(e.detail, NDJSON_LIMITS.toolDetail).text;
      }
      return frame;
    }
    case "VerifyResult": {
      const c = capTail(e.output, NDJSON_LIMITS.verifyOutput);
      return c.truncated
        ? { protocol, type: "VerifyResult", success: e.success, output: c.text, truncated: true }
        : { protocol, type: "VerifyResult", success: e.success, output: c.text };
    }
  }
}

function tokenCount(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function usageFrame(u: AgentTokenUsage): NdjsonUsageFrame {
  return {
    protocol: CORVIDINHO_PROTOCOL_VERSION,
    type: "usage",
    promptTokens: tokenCount(u.promptTokens),
    completionTokens: tokenCount(u.completionTokens),
    totalTokens: tokenCount(u.totalTokens),
  };
}

/**
 * Final frame. `summary` is capped (not scrubbed — same as `--json`) so an
 * oversized reply cannot push the line past the parser cap and blank the
 * bridge reply.
 */
export function resultFrame(result: TaskResult): NdjsonResultFrame {
  const protocol = CORVIDINHO_PROTOCOL_VERSION;
  const max = NDJSON_LIMITS.resultSummary;
  if (typeof result.summary !== "string" || result.summary.length <= max) {
    return { protocol, type: "result", result };
  }
  return {
    protocol,
    type: "result",
    result: { ...result, summary: `${result.summary.slice(0, max)}…` },
    truncated: true,
  };
}

/** One frame → one line (no trailing newline; JSON escapes embedded newlines). */
export function serializeFrame(frame: NdjsonFrame): string {
  return JSON.stringify(frame);
}

export type NdjsonWriter = {
  event(e: AgentEvent): void;
  usage(u: AgentTokenUsage): void;
  result(r: TaskResult): void;
};

/** `writeLine` receives one serialized frame per call (caller adds `\n`). */
export function createNdjsonWriter(writeLine: (line: string) => void): NdjsonWriter {
  return {
    event: (e) => writeLine(serializeFrame(frameFromEvent(e))),
    usage: (u) => writeLine(serializeFrame(usageFrame(u))),
    result: (r) => writeLine(serializeFrame(resultFrame(r))),
  };
}

// ─── Parser ────────────────────────────────────────────────────────────────

const STATES: ReadonlySet<string> = new Set<AgentState>([
  "idle",
  "planning",
  "executing",
  "verifying",
  "done",
  "failed",
  "blocked",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function isCount(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

export type ParseNdjsonOpts = {
  /** When set, frames carrying another protocol are rejected (treated as garbage). */
  protocol?: number;
};

type VersionedObject = { protocol: number; v: Record<string, unknown> };

/** A JSON object line carrying an integer `protocol` ≥ 1, else null. */
function parseVersionedObject(line: string): VersionedObject | null {
  const s = line.trim();
  if (!s.startsWith("{") || !s.endsWith("}")) return null;
  let v: unknown;
  try {
    v = JSON.parse(s);
  } catch {
    return null;
  }
  if (!isRecord(v)) return null;
  const protocol = v.protocol;
  if (typeof protocol !== "number" || !Number.isInteger(protocol) || protocol < 1) {
    return null;
  }
  return { protocol, v };
}

/**
 * Parse one stdout line into a frame. Returns null for blank lines, garbage,
 * JSON without an integer `protocol`, unknown `type`, or wrong field types.
 */
export function parseNdjsonLine(
  line: string,
  opts: ParseNdjsonOpts = {},
): NdjsonFrame | null {
  const o = parseVersionedObject(line);
  if (!o) return null;
  if (opts.protocol !== undefined && o.protocol !== opts.protocol) return null;
  return frameFromVersioned(o);
}

function frameFromVersioned({ protocol, v }: VersionedObject): NdjsonFrame | null {
  switch (v.type) {
    case "StateChanged":
      return typeof v.state === "string" && STATES.has(v.state)
        ? { protocol, type: "StateChanged", state: v.state as AgentState }
        : null;
    case "Text":
      return typeof v.text === "string"
        ? v.truncated === true
          ? { protocol, type: "Text", text: v.text, truncated: true }
          : { protocol, type: "Text", text: v.text }
        : null;
    case "ToolCall":
      return typeof v.name === "string" && typeof v.argsSummary === "string"
        ? { protocol, type: "ToolCall", name: v.name, argsSummary: v.argsSummary }
        : null;
    case "ToolResult": {
      if (typeof v.name !== "string" || typeof v.success !== "boolean") return null;
      if (v.detail !== undefined && typeof v.detail !== "string") return null;
      return v.detail === undefined
        ? { protocol, type: "ToolResult", name: v.name, success: v.success }
        : {
            protocol,
            type: "ToolResult",
            name: v.name,
            success: v.success,
            detail: v.detail as string,
          };
    }
    case "VerifyResult":
      return typeof v.success === "boolean" && typeof v.output === "string"
        ? v.truncated === true
          ? { protocol, type: "VerifyResult", success: v.success, output: v.output, truncated: true }
          : { protocol, type: "VerifyResult", success: v.success, output: v.output }
        : null;
    case "usage":
      return isCount(v.promptTokens) && isCount(v.completionTokens) && isCount(v.totalTokens)
        ? {
            protocol,
            type: "usage",
            promptTokens: v.promptTokens,
            completionTokens: v.completionTokens,
            totalTokens: v.totalTokens,
          }
        : null;
    case "result": {
      const r = v.result;
      if (!isRecord(r)) return null;
      if (typeof r.summary !== "string" || typeof r.state !== "string") return null;
      const result = r as unknown as TaskResult;
      return v.truncated === true
        ? { protocol, type: "result", result, truncated: true }
        : { protocol, type: "result", result };
    }
    default:
      return null;
  }
}

export type NdjsonLine = {
  /** Raw line without the trailing newline. */
  line: string;
  /** Parsed frame, or null when the line is not a (matching) frame. */
  frame: NdjsonFrame | null;
  /**
   * Set when the line is a versioned JSON object (frame-shaped), even when
   * `frame` is null because the protocol differs or a field is malformed.
   * Such lines carry frame content and must never become reply text.
   */
  protocol?: number;
};

export type NdjsonParser = {
  /** Feed a decoded chunk; returns every line it completed. */
  push(chunk: string): NdjsonLine[];
  /** Flush an unterminated final line. */
  end(): NdjsonLine[];
};

/**
 * Incremental line splitter + frame parser. Lines split across chunks are
 * joined; an unterminated line longer than NDJSON_LIMITS.maxLine is dropped
 * (reported once as a non-frame line) so a runaway child cannot grow memory.
 */
export function createNdjsonParser(opts: ParseNdjsonOpts = {}): NdjsonParser {
  let buf = "";
  let dropping = false;
  const toLine = (raw: string): NdjsonLine => {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const o = parseVersionedObject(line);
    if (!o) return { line, frame: null };
    const frame =
      opts.protocol !== undefined && o.protocol !== opts.protocol
        ? null
        : frameFromVersioned(o);
    return { line, frame, protocol: o.protocol };
  };
  return {
    push(chunk) {
      const out: NdjsonLine[] = [];
      let start = 0;
      for (;;) {
        const nl = chunk.indexOf("\n", start);
        if (nl < 0) break;
        const piece = chunk.slice(start, nl);
        start = nl + 1;
        if (dropping) {
          // Tail of an over-long line: discard through its newline.
          dropping = false;
          buf = "";
          continue;
        }
        out.push(toLine(buf + piece));
        buf = "";
      }
      if (dropping) return out;
      buf += chunk.slice(start);
      if (buf.length > NDJSON_LIMITS.maxLine) {
        out.push({
          line: `(dropped stdout line over ${NDJSON_LIMITS.maxLine} chars)`,
          frame: null,
        });
        buf = "";
        dropping = true;
      }
      return out;
    },
    end() {
      if (dropping || buf.length === 0) {
        buf = "";
        dropping = false;
        return [];
      }
      const last = toLine(buf);
      buf = "";
      return [last];
    },
  };
}

export type NdjsonStreamOutcome = {
  /** Last `result` frame seen, if any. */
  result?: TaskResult;
  /** Non-frame stdout lines (capped), for the fallback summary. */
  otherText: string;
  /** Count of frames delivered to onFrame. */
  frames: number;
  /**
   * First `protocol` seen on a frame-shaped line that did not match
   * `opts.protocol`. Its content is withheld (never in otherText).
   */
  protocolMismatch?: number;
};

/**
 * Read a child's stdout line by line, calling `onFrame` as each frame lands.
 * A throwing `onFrame` never stops the read (status updates are best-effort).
 * Frame-shaped lines that are not delivered (another protocol, malformed
 * fields) are dropped rather than kept as fallback text, so frame content
 * (tool output, text) can never become a bridge reply.
 */
export async function readNdjsonStream(
  stream: ReadableStream<Uint8Array> | null | undefined,
  onFrame: (frame: NdjsonFrame) => void,
  opts: ParseNdjsonOpts = {},
): Promise<NdjsonStreamOutcome> {
  const parser = createNdjsonParser(opts);
  const other: string[] = [];
  let otherLen = 0;
  let frames = 0;
  let result: TaskResult | undefined;
  let protocolMismatch: number | undefined;

  const handle = (lines: NdjsonLine[]) => {
    for (const { line, frame, protocol } of lines) {
      if (!frame) {
        if (protocol !== undefined) {
          if (
            opts.protocol !== undefined &&
            protocol !== opts.protocol &&
            protocolMismatch === undefined
          ) {
            protocolMismatch = protocol;
          }
          continue;
        }
        if (line.trim() && otherLen < NDJSON_LIMITS.otherText) {
          other.push(line);
          otherLen += line.length + 1;
        }
        continue;
      }
      frames += 1;
      if (frame.type === "result") result = frame.result;
      try {
        onFrame(frame);
      } catch {
        /* best-effort status; keep reading */
      }
    }
  };

  if (stream) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) handle(parser.push(decoder.decode(value, { stream: true })));
    }
    handle(parser.push(decoder.decode()));
    handle(parser.end());
  }

  const out: NdjsonStreamOutcome = {
    result,
    otherText: other.join("\n").slice(0, NDJSON_LIMITS.otherText),
    frames,
  };
  if (protocolMismatch !== undefined) out.protocolMismatch = protocolMismatch;
  return out;
}

// ─── Progress (consumer side) ──────────────────────────────────────────────

/** What a bridge shows while the run works (AGENT-8 / DISCORD-3). */
export type TaskProgress = {
  state?: AgentState;
  /** Short human line: planning / working / calling tool X / verifying / done. */
  message?: string;
  /**
   * Current tool (plugin command name). `""` on a state change clears the
   * previous tool so the status never shows a stale one.
   */
  tool?: string;
  /** Provider-reported running total tokens. */
  totalTokens?: number;
};

const STATE_LABELS: Record<AgentState, string> = {
  idle: "idle",
  planning: "planning",
  executing: "working",
  verifying: "verifying",
  done: "done",
  failed: "failed",
  blocked: "needs input",
};

/** Map one frame to a status update; null for frames that change nothing shown. */
export function progressFromFrame(frame: NdjsonFrame): TaskProgress | null {
  switch (frame.type) {
    case "StateChanged":
      return { state: frame.state, tool: "", message: STATE_LABELS[frame.state] };
    case "ToolCall": {
      const tool = clip(frame.name, NDJSON_LIMITS.toolName);
      return { tool, message: `calling tool ${tool}` };
    }
    case "ToolResult": {
      const tool = clip(frame.name, NDJSON_LIMITS.toolName);
      return { tool, message: `tool ${tool} ${frame.success ? "ok" : "failed"}` };
    }
    case "VerifyResult":
      return { message: frame.success ? "verify passed" : "verify failed" };
    case "usage":
      return { totalTokens: frame.totalTokens };
    default:
      return null;
  }
}

export type TaskRunStreamOutcome = {
  exitCode: number;
  /**
   * From the result frame; else a protocol-mismatch notice when the binary
   * streamed another protocol; else summarizeTaskRunOutput fallback.
   */
  summary: string;
  result?: TaskResult;
  /** Last provider-reported total, when any usage frame arrived. */
  totalTokens?: number;
  frames: number;
  /** Protocol the binary streamed when it differs from the bridge's. */
  protocolMismatch?: number;
};

/** Reply text for a stream from another protocol — no frame content. */
export function protocolMismatchSummary(binary: number, bridge: number): string {
  return `protocol mismatch: binary ${binary}, bridge ${bridge} — restart the bridge`;
}

/**
 * Consume a spawned `task run --output ndjson` child: stream stdout frames to
 * `onProgress`, drain stderr in parallel, and summarize from the result frame
 * (then protocol-mismatch notice, then summarizeTaskRunOutput over non-frame
 * stdout + stderr + exit).
 */
export async function collectTaskRunStream(opts: {
  stdout: ReadableStream<Uint8Array> | null | undefined;
  stderr: ReadableStream<Uint8Array> | null | undefined;
  exited: Promise<number>;
  onProgress?: (progress: TaskProgress) => void;
  protocol?: number;
}): Promise<TaskRunStreamOutcome> {
  let totalTokens: number | undefined;
  const expected = opts.protocol ?? CORVIDINHO_PROTOCOL_VERSION;
  const [streamed, stderr, exitCode] = await Promise.all([
    readNdjsonStream(
      opts.stdout,
      (frame) => {
        const p = progressFromFrame(frame);
        if (!p) return;
        if (p.totalTokens !== undefined) totalTokens = p.totalTokens;
        opts.onProgress?.(p);
      },
      { protocol: expected },
    ),
    opts.stderr ? new Response(opts.stderr).text() : Promise.resolve(""),
    opts.exited,
  ]);
  // DISCORD-3.a: summary is human chat body only (no state=/verified= plumbing).
  const fromResult = streamed.result ? chatBodyFromTaskResult(streamed.result) : "";
  const summary =
    fromResult ||
    (streamed.protocolMismatch !== undefined
      ? protocolMismatchSummary(streamed.protocolMismatch, expected)
      : chatBodyFromTaskRunOutput(streamed.otherText, stderr, exitCode));
  const out: TaskRunStreamOutcome = {
    exitCode,
    summary,
    result: streamed.result,
    totalTokens,
    frames: streamed.frames,
  };
  if (streamed.protocolMismatch !== undefined) {
    out.protocolMismatch = streamed.protocolMismatch;
  }
  return out;
}
