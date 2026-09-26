/**
 * Bounded subprocess helper for the Fledge plugin bridge (FLEDGE-4 / PLUGIN-3).
 *
 * argv arrays only (no shell), stdin closed, hard timeout, capped output, and a
 * child env without Corvidinho's own secrets. Never throws: spawn failures come
 * back as `spawnError` so discovery can degrade cleanly.
 */

export type SpawnCappedOptions = {
  cwd: string;
  env: Record<string, string>;
  timeoutMs: number;
  /** Per-stream byte cap; bytes past it are drained and dropped. */
  maxBytes: number;
};

export type SpawnCappedResult = {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
  spawnError?: string;
};

/**
 * Env keys a Fledge plugin never needs: Corvidinho's own credentials, the
 * audit HMAC key (SAFE-5), acting-identity hints, Discord and LLM keys.
 * GitHub tokens stay so GitHub-backed Fledge plugins keep working.
 */
const DROP_PREFIXES = ["CORVIDINHO_", "DISCORD_"] as const;
const DROP_KEYS = new Set([
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENROUTER_API_KEY",
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
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn(argv, {
      cwd: opts.cwd,
      env: opts.env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (e) {
    return {
      code: 127,
      stdout: "",
      stderr: "",
      timedOut: false,
      truncated: false,
      spawnError: e instanceof Error ? e.message : String(e),
    };
  }

  const readers: Reader[] = [];
  let timedOut = false;
  let grace: ReturnType<typeof setTimeout> | undefined;
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      proc.kill("SIGKILL");
    } catch {
      /* already gone */
    }
    // A grandchild may still hold the pipes open; stop waiting for it.
    grace = setTimeout(() => {
      for (const r of readers) r.cancel().catch(() => {});
    }, PIPE_GRACE_MS);
  }, opts.timeoutMs);

  try {
    const [out, err, code] = await Promise.all([
      readCapped(proc.stdout as ReadableStream<Uint8Array>, opts.maxBytes, readers),
      readCapped(proc.stderr as ReadableStream<Uint8Array>, opts.maxBytes, readers),
      proc.exited,
    ]);
    return {
      code: typeof code === "number" ? code : 1,
      stdout: out.text,
      stderr: err.text,
      timedOut,
      truncated: out.truncated || err.truncated,
    };
  } finally {
    clearTimeout(timer);
    if (grace) clearTimeout(grace);
  }
}
