/**
 * REQ-watch-418 — a GitHub 401 (bad or revoked token) stops the WATCH poll
 * loop with one clean line and settles `fatal` (exit 1) instead of dumping an
 * Octokit HttpError and polling forever. Other poll errors print one scrubbed
 * line each; a 403 rate-limit still backs off (WATCH-RELIABILITY-3).
 */
import { describe, expect, test } from "bun:test";
import { createEchoAckClient } from "../src/watch/ack.ts";
import { createEchoAgentClient } from "../src/watch/agent-client.ts";
import { startWatchPoller, type WatchFatal } from "../src/watch/poller.ts";

// Fake secrets are assembled at runtime — never realistic literals in the repo.
const TOKEN = "gh" + "p_" + "a1B2c3D4e5".repeat(4);

const envBase = {
  GITHUB_TOKEN: TOKEN,
  CORVIDINHO_WATCH_USERNAME: "corvid-agent",
  CORVIDINHO_GITHUB_ALLOW_REPOS: "CorvidLabs/Corvidinho",
  CORVIDINHO_GITHUB_ALLOW_USERS: "0xLeif",
  CORVIDINHO_WATCH_DRY_RUN: "1",
};

/** Octokit RequestError shape (name, status, request with auth header). */
function httpError(status: number, message: string, headers: Record<string, string> = {}) {
  return Object.assign(new Error(message), {
    name: "HttpError",
    status,
    request: {
      method: "GET",
      url: "https://api.github.com/search/issues",
      headers: { authorization: `token ${TOKEN}` },
    },
    response: { status, url: "https://api.github.com/search/issues", headers, data: {} },
  });
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function waitFor(cond: () => boolean, ms = 3_000): Promise<void> {
  const until = Date.now() + ms;
  while (!cond() && Date.now() < until) await sleep(5);
}

describe("WATCH stops on GitHub 401 (REQ-watch-418)", () => {
  test("401 from the poll: one clean line, fatal exit 1, loop not re-armed", async () => {
    const errors: Array<{ msg: string; err: unknown }> = [];
    let fetches = 0;
    const result = await startWatchPoller({
      env: envBase,
      filePath: null,
      agent: createEchoAgentClient(),
      ackClient: createEchoAckClient(),
      log: () => {},
      logError: (msg, err) => errors.push({ msg, err }),
      fetchEvents: async () => {
        fetches += 1;
        throw httpError(401, "Bad credentials - https://docs.github.com/rest");
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const fatal = await Promise.race([
      result.fatal,
      sleep(3_000).then(() => null as WatchFatal | null),
    ]);
    expect(fatal).not.toBeNull();
    expect(fatal!.exitCode).toBe(1);
    expect(fatal!.message).toBe(
      "[watch] github auth failed (401): Bad credentials - https://docs.github.com/rest — check GITHUB_TOKEN / GH_TOKEN; watch stopped",
    );
    expect(errors).toEqual([{ msg: fatal!.message, err: undefined }]);
    expect(fatal!.message).not.toContain(TOKEN);

    // Stopped: pollOnce does nothing once the loop halted itself.
    const again = await result.pollOnce();
    expect(again.fetched).toBe(0);
    expect(fetches).toBe(1);
    await result.stop();
  });

  test("default error sink prints one scrubbed line, never the error object", async () => {
    const lines: unknown[][] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => void lines.push(a);
    let fetches = 0;
    try {
      const result = await startWatchPoller({
        env: envBase,
        filePath: null,
        agent: createEchoAgentClient(),
        ackClient: createEchoAckClient(),
        log: () => {},
        fetchEvents: async () => {
          fetches += 1;
          throw httpError(500, `Server Error for ${TOKEN}\nstack line`);
        },
      });
      if (!result.ok) throw new Error("watch did not start");
      await waitFor(() => lines.length > 0);
      await result.stop();
    } finally {
      console.error = orig;
    }
    expect(fetches).toBe(1);
    // GITHUB_TOKEN is in the watch env, so its literal value is redacted first.
    expect(lines).toEqual([["[watch] pollOnce error: Server Error for [redacted:env-secret]"]]);
  });

  test("a 403 rate-limit still backs off and does not stop the loop", async () => {
    const logs: string[] = [];
    const result = await startWatchPoller({
      env: envBase,
      filePath: null,
      agent: createEchoAgentClient(),
      ackClient: createEchoAckClient(),
      log: (m) => logs.push(m),
      logError: () => {},
      fetchEvents: async () => {
        throw httpError(403, "API rate limit exceeded", { "retry-after": "120" });
      },
    });
    if (!result.ok) throw new Error("watch did not start");
    await waitFor(() => logs.some((l) => l.includes("rate-limit backoff")));
    let settled = false;
    void result.fatal.then(() => {
      settled = true;
    });
    await sleep(20);
    expect(settled).toBe(false);
    expect(result.getBackoffUntilMs()).toBeGreaterThan(Date.now() + 100_000);
    await result.stop();
  });
});
