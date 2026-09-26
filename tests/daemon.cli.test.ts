/**
 * `corvidinho daemon` end to end (REQ-cli-108): starts without Discord,
 * refuses a second instance, exits 0 on SIGTERM and frees the lock.
 * Temp data dir; no schedules, so no agent is spawned.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = join(import.meta.dir, "..");
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function daemonEnv(dataDir: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    CORVIDINHO_DATA_DIR: dataDir,
    CORVIDINHO_BIN: "",
    DISCORD_TOKEN: "",
    DISCORD_BOT_TOKEN: "",
  };
}

/** Collect a stream in the background; `waitFor` polls the text so far. */
function collect(stream: ReadableStream<Uint8Array>) {
  const out = { text: "", done: Promise.resolve() };
  out.done = (async () => {
    const decoder = new TextDecoder();
    for await (const chunk of stream) out.text += decoder.decode(chunk, { stream: true });
  })();
  return {
    get text() {
      return out.text;
    },
    done: () => out.done,
    async waitFor(needle: string, timeoutMs = 15_000): Promise<string> {
      const deadline = Date.now() + timeoutMs;
      while (!out.text.includes(needle) && Date.now() < deadline) await Bun.sleep(25);
      return out.text;
    },
  };
}

describe("corvidinho daemon CLI", () => {
  test("starts headless, refuses a second instance, stops cleanly on SIGTERM", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "corvidinho-daemon-cli-"));
    dirs.push(dataDir);
    const proc = Bun.spawn(["bun", "src/cli.ts", "daemon"], {
      cwd: repo,
      stdout: "pipe",
      stderr: "pipe",
      env: daemonEnv(dataDir),
    });
    const stdout = collect(proc.stdout);
    const started = await stdout.waitFor('"daemon.started"');
    const startLine = started
      .split("\n")
      .find((l) => l.includes('"daemon.started"'));
    expect(startLine).toBeDefined();
    const start = JSON.parse(startLine!);
    expect(start).toMatchObject({ level: "info", component: "daemon", dataDir });
    expect(existsSync(join(dataDir, "daemon.lock"))).toBe(true);

    const second = Bun.spawn(["bun", "src/cli.ts", "daemon"], {
      cwd: repo,
      stdout: "pipe",
      stderr: "pipe",
      env: daemonEnv(dataDir),
    });
    const [secondCode, secondOut] = await Promise.all([
      second.exited,
      new Response(second.stdout).text(),
    ]);
    expect(secondCode).toBe(1);
    expect(secondOut).toContain('"daemon.lock_held"');
    expect(secondOut).toContain(`"holderPid":${proc.pid}`);

    proc.kill("SIGTERM");
    const code = await proc.exited;
    await stdout.done();
    expect(code).toBe(0);
    expect(stdout.text).toContain('"daemon.stopping"');
    expect(stdout.text).toContain('"daemon.stopped"');
    expect(existsSync(join(dataDir, "daemon.lock"))).toBe(false);
  }, 30_000);

  test("help lists daemon", async () => {
    const proc = Bun.spawn(["bun", "src/cli.ts", "--help"], {
      cwd: repo,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, out] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
    ]);
    expect(code).toBe(0);
    expect(out).toContain("corvidinho daemon");
    expect(out).toContain("CLI-8");
  });
});
