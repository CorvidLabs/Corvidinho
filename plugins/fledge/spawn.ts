/**
 * Bounded subprocess helper for the Fledge plugin bridge (FLEDGE-4 / PLUGIN-3).
 *
 * argv arrays only (no shell), stdin closed, hard timeout, capped output, and a
 * child env without Corvidinho's own secrets. Never throws: spawn failures come
 * back as `spawnError` so discovery can degrade cleanly.
 *
 * The child runs in its own process group; a timeout or abort kills its whole
 * tree (native plugins and their children included), and so does this
 * process exiting or being interrupted (src/plugins/proc-group.ts, AGENT-3).
 * Each chunk of output it writes counts as the calling run's activity for
 * the idle timeout (AGENT-12, src/agent/limits.ts).
 */

import { noteIdleActivity } from "../../src/agent/limits.ts";
import {
  collectProcessTree,
  killProcessTree,
  trackChildProcess,
  type ProcEntry,
} from "../../src/plugins/proc-group.ts";

export type SpawnCappedOptions = {
  cwd: string;
  env: Record<string, string>;
  timeoutMs: number;
  /** Per-stream byte cap; bytes past it are drained and dropped. */
  maxBytes: number;
  /** Stops the run (and its process tree) like a timeout, reported as `aborted`. */
  signal?: AbortSignal;
};

export type SpawnCappedResult = {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** Stopped because `signal` aborted. */
  aborted: boolean;
  truncated: boolean;
  spawnError?: string;
};

/**
 * Env keys a Fledge plugin never needs: Corvidinho's own credentials, the
 * audit HMAC key (SAFE-5), acting-identity hints, Discord and LLM keys, and
 * the Brave Search and GIPHY keys (PLUGIN-7 / PLUGIN-8, #318).
 * GitHub tokens stay so GitHub-backed Fledge plugins keep working.
 */
const DROP_PREFIXES = ["CORVIDINHO_", "DISCORD_"] as const;
const DROP_KEYS = new Set([
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENROUTER_API_KEY",
  "BRAVE_SEARCH_API_KEY",
  "GIPHY_API_KEY",
]);

/** Child env for fledge: scrubbed copy of `base`, non-interactive, project root hint. */
export function fledgeChildEnv(
  base: NodeJS.ProcessEnv,
  projectRoot: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) {
    if (v == null) continue;
    if (DROP_KEYS.has(k)) continue;
    if (DROP_PREFIXES.some((p) => k.startsWith(p))) continue;
    out[k] = v;
  }
  out.FLEDGE_NON_INTERACTIVE = "1";
  out.CORVIDINHO_PROJECT_ROOT = projectRoot;
  return out;
}

type Reader = ReadableStreamDefaultReader<Uint8Array>;

async function readCapped(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
  readers: Reader[],
): Promise<{ text: string; truncated: boolean }> {
  const reader = stream.getReader();
  readers.push(reader);
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      // AGENT-12: tool output resets the run's idle watchdog, even past the cap.
      noteIdleActivity();
      if (size >= maxBytes) {
        truncated = true;
        continue;
      }
      const room = maxBytes - size;
      if (value.byteLength > room) {
        chunks.push(value.subarray(0, room));
        size = maxBytes;
        truncated = true;
      } else {
        chunks.push(value);
        size += value.byteLength;
      }
    }
  } catch {
    /* reader cancelled after timeout */
  }
  const all = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.byteLength;
  }
  return { text: new TextDecoder().decode(all), truncated };
}

/** Grace period after a timeout kill before open pipes are abandoned. */
const PIPE_GRACE_MS = 250;

export async function spawnCapped(
  argv: string[],
  opts: SpawnCappedOptions,
): Promise<SpawnCappedResult> {
  if (opts.signal?.aborted) {
    return { code: 130, stdout: "", stderr: "", timedOut: false, aborted: true, truncated: false };
  }
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn(argv, {
      cwd: opts.cwd,
      env: opts.env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      // Own process group: a timeout can then stop grandchildren too.
      detached: true,
    });
  } catch (e) {
    return {
      code: 127,
      stdout: "",
      stderr: "",
      timedOut: false,
      aborted: false,
      truncated: false,
      spawnError: e instanceof Error ? e.message : String(e),
    };
  }

  const pid = proc.pid;
  const readers: Reader[] = [];
  let timedOut = false;
  let aborted = false;
  let stopped = false;
  let grace: ReturnType<typeof setTimeout> | undefined;
  // Members of the group left behind when the leader exited (a backgrounded
  // grandchild holding the pipes): a later timeout, abort or this process
  // exiting still reaches them.
  let atExit: ProcEntry[] = [];
  const untrack = trackChildProcess(pid, () => atExit);
  let pipesOpen = 2;
  const exited = proc.exited.then((code) => {
    if (pipesOpen > 0) atExit = collectProcessTree(pid, { rootJustExited: true });
    return code;
  });
  const drained = <T,>(p: Promise<T>) =>
    p.finally(() => {
      pipesOpen -= 1;
    });
  const stop = () => {
    if (stopped) return;
    stopped = true;
    killProcessTree(pid, { known: atExit });
    // A grandchild outside our reach may still hold the pipes; stop waiting.
    grace = setTimeout(() => {
      for (const r of readers) r.cancel().catch(() => {});
    }, PIPE_GRACE_MS);
  };
  const timer = setTimeout(() => {
    timedOut = true;
    stop();
  }, opts.timeoutMs);
  const onAbort = () => {
    aborted = true;
    stop();
  };
  opts.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const [out, err, code] = await Promise.all([
      drained(readCapped(proc.stdout as ReadableStream<Uint8Array>, opts.maxBytes, readers)),
      drained(readCapped(proc.stderr as ReadableStream<Uint8Array>, opts.maxBytes, readers)),
      exited,
    ]);
    return {
      code: typeof code === "number" ? code : 1,
      stdout: out.text,
      stderr: err.text,
      timedOut,
      aborted: aborted && !timedOut,
      truncated: out.truncated || err.truncated,
    };
  } finally {
    clearTimeout(timer);
    if (grace) clearTimeout(grace);
    opts.signal?.removeEventListener("abort", onAbort);
    untrack();
  }
}
