/**
 * REQ-cli-419 — a failing command prints one scrubbed error line plus a hint
 * and exits non-zero: no stack frames, no Bun crash footer, no library dump
 * and no token value (CLI-4, CLI-7, SAFE-6). Each case is a repro from the
 * CLI end-to-end check; the Discord/GitHub ones preload a fetch that answers
 * 401 like a bad token, so no network or real token is used.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { reportCliError, runCli } from "../src/cli.ts";

const ROOT = join(import.meta.dir, "..");
const CLI = join(ROOT, "src", "cli.ts");
const FAKE_401 = join(ROOT, "tests", "fixtures", "fake-http-401.ts");

// Fake secrets are assembled at runtime — never realistic literals in the repo.
// The bot token's first segment is base64 of an application id, as register-commands needs.
const DISCORD_TOKEN =
  Buffer.from("123456789012345678").toString("base64") + ".fake01." + "fake".repeat(8);
const GARBAGE_DISCORD_TOKEN = "garbage-discord-token-value-7c1e";
const GITHUB_TOKEN = "gh" + "p_" + "fake".repeat(9);

/** Subprocess tests can be slow on a loaded box. */
const T = 60_000;

type Run = { code: number; out: string; err: string; killed: boolean };

function baseEnv(): Record<string, string> {
  const home = mkdtempSync(join(tmpdir(), "corvidinho-clean-err-"));
  return {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    CORVIDINHO_DATA_DIR: join(home, "data"),
    CORVIDINHO_ALLOWLIST_FILE: join(home, "no-allowlist.toml"),
  };
}

async function cli(
  args: string[],
  env: Record<string, string>,
  opts: { preload?: string; timeoutMs?: number } = {},
): Promise<Run> {
  const argv = opts.preload
    ? ["bun", "--preload", opts.preload, CLI, ...args]
    : ["bun", CLI, ...args];
  const proc = Bun.spawn(argv, {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...baseEnv(), ...env },
  });
  let killed = false;
  const timer = setTimeout(() => {
    killed = true;
    proc.kill("SIGKILL");
  }, opts.timeoutMs ?? 20_000);
  const [code, out, err] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  clearTimeout(timer);
  return { code, out, err, killed };
}

/** No stack frame, code frame, crash footer, library dump or token value. */
function expectClean(text: string, secrets: string[] = []): void {
  expect(text).not.toMatch(/^\s+at\s/m);
  expect(text).not.toMatch(/^\s*\d+\s\|\s/m);
  expect(text).not.toMatch(/Bun v\d/);
  expect(text).not.toContain("node_modules");
  expect(text).not.toContain("rawError");
  expect(text).not.toContain("requestBody");
  for (const s of secrets) expect(text).not.toContain(s);
}

describe("CLI error boundary (REQ-cli-419)", () => {
  test("plugins run <unknown>: one line + hint, exit 1", async () => {
    const r = await cli(["plugins", "run", "nosuchplugin"], {});
    expect(r.code).toBe(1);
    expect(r.err).toContain("Unknown plugin command: nosuchplugin");
    expect(r.err).toContain("corvidinho plugins list");
    expectClean(r.err + r.out);
  }, T);

  test("plugins run fledge-<unknown>: one line + hint, exit 1", async () => {
    const r = await cli(["plugins", "run", "fledge-nosuch"], {});
    expect(r.code).toBe(1);
    expect(r.err).toContain("Unknown plugin command: fledge-nosuch");
    expectClean(r.err + r.out);
  }, T);

  test("plugins run <unknown> --json keeps the JSON error shape on stdout", async () => {
    const r = await cli(["plugins", "run", "nosuchplugin", "--json"], {});
    expect(r.code).toBe(1);
    const parsed = JSON.parse(r.out) as { ok: boolean; error: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBe("Unknown plugin command: nosuchplugin");
    expectClean(r.err + r.out);
  }, T);

  test("a throwing plugin handler (unusable data dir) is one line + hint", async () => {
    const r = await cli(["plugins", "run", "memory-recall"], {
      CORVIDINHO_DATA_DIR: "/proc/nope",
      CORVIDINHO_ACTING_DISCORD_USER_ID: "1",
    });
    expect(r.code).toBe(1);
    expect(r.err).toContain("/proc/nope");
    expect(r.err).toContain("CORVIDINHO_DATA_DIR");
    expect(r.err.trim().split("\n")).toHaveLength(2);
    expectClean(r.err + r.out);
  }, T);

  test("a throwing plugin handler with --json prints {ok:false,error}", async () => {
    const r = await cli(["plugins", "run", "memory-recall", "--json"], {
      CORVIDINHO_DATA_DIR: "/proc/nope",
      CORVIDINHO_ACTING_DISCORD_USER_ID: "1",
    });
    expect(r.code).toBe(1);
    const parsed = JSON.parse(r.out) as { ok: boolean; error: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("/proc/nope");
    expectClean(r.err + r.out);
  }, T);

  test("discord bridge with an unusable data dir: one line + hint, exit 1", async () => {
    const r = await cli(["discord", "bridge"], {
      CORVIDINHO_DATA_DIR: "/proc/nope",
      DISCORD_TOKEN: GARBAGE_DISCORD_TOKEN,
      DISCORD_CHANNEL_IDS: "1",
    });
    expect(r.code).toBe(1);
    expect(r.err).toContain("corvidinho: ");
    expect(r.err).toContain("/proc/nope");
    expect(r.err).toContain("CORVIDINHO_DATA_DIR");
    expectClean(r.err + r.out, [GARBAGE_DISCORD_TOKEN]);
  }, T);

  test("discord bridge with a rejected token: clean login failure, exit 1", async () => {
    const r = await cli(
      ["discord", "bridge"],
      { DISCORD_TOKEN: GARBAGE_DISCORD_TOKEN, DISCORD_CHANNEL_IDS: "1" },
      { preload: FAKE_401 },
    );
    expect(r.killed).toBe(false);
    expect(r.code).toBe(1);
    expect(r.err).toContain("discord login failed (401): check DISCORD_TOKEN");
    expectClean(r.err + r.out, [GARBAGE_DISCORD_TOKEN]);
  }, T);

  test("discord register-commands with a rejected token: one line, exit 1", async () => {
    const r = await cli(
      ["discord", "register-commands", "--guild-id", "1"],
      { DISCORD_TOKEN },
      { preload: FAKE_401 },
    );
    expect(r.code).toBe(1);
    expect(r.err).toContain("[discord] register-commands failed (401)");
    expect(r.err).toContain("DISCORD_TOKEN");
    expect(r.err.trim().split("\n")).toHaveLength(1);
    expectClean(r.err + r.out, [DISCORD_TOKEN]);
  }, T);

  test("github watch with a rejected token stops with exit 1 instead of polling forever", async () => {
    const r = await cli(
      ["github", "watch"],
      {
        GITHUB_TOKEN,
        CORVIDINHO_WATCH_USERNAME: "corvid-agent",
        CORVIDINHO_GITHUB_ALLOW_REPOS: "CorvidLabs/Corvidinho",
      },
      { preload: FAKE_401, timeoutMs: 15_000 },
    );
    expect(r.killed).toBe(false);
    expect(r.code).toBe(1);
    expect(r.err).toContain("github auth failed (401)");
    expect(r.err).toContain("GITHUB_TOKEN");
    expect(r.err).not.toContain("HttpError");
    expectClean(r.err + r.out, [GITHUB_TOKEN]);
  }, T);
});

describe("reportCliError / runCli (REQ-cli-419)", () => {
  function capture(fn: () => number): { code: number; out: string[]; err: string[] } {
    const out: string[] = [];
    const err: string[] = [];
    const log = console.log;
    const error = console.error;
    console.log = (...a: unknown[]) => void out.push(a.join(" "));
    console.error = (...a: unknown[]) => void err.push(a.join(" "));
    try {
      return { code: fn(), out, err };
    } finally {
      console.log = log;
      console.error = error;
    }
  }

  test("text mode: one scrubbed line + hint on stderr; exitCode kept", () => {
    const e = Object.assign(
      new Error(`boom token=${GITHUB_TOKEN}\n    at secret (x.ts:1:1)`),
      { exitCode: 2 },
    );
    const r = capture(() => reportCliError(e));
    expect(r.code).toBe(2);
    expect(r.out).toEqual([]);
    expect(r.err).toHaveLength(2);
    expect(r.err[0]).toBe("corvidinho: boom token=[redacted:github-token]");
    expect(r.err[1]).toStartWith("hint: ");
    expectClean(r.err.join("\n"), [GITHUB_TOKEN]);
  });

  test("json mode: {ok:false,error} on stdout; hint on stderr; default exit 1", () => {
    const r = capture(() => reportCliError(new Error("nope"), { json: true }));
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out.join("\n"))).toEqual({ ok: false, error: "nope" });
    expect(r.err.join("\n")).toStartWith("hint: ");
  });

  test("a secret env value is never echoed, even when it has no vendor shape", () => {
    const prev = process.env.DISCORD_TOKEN;
    process.env.DISCORD_TOKEN = GARBAGE_DISCORD_TOKEN;
    try {
      const r = capture(() =>
        reportCliError(new Error(`login with ${GARBAGE_DISCORD_TOKEN} failed`)),
      );
      expect(r.err[0]).toBe("corvidinho: login with [redacted:env-secret] failed");
    } finally {
      if (prev === undefined) delete process.env.DISCORD_TOKEN;
      else process.env.DISCORD_TOKEN = prev;
    }
  });

  test("runCli turns anything main throws into a clean exit code", async () => {
    const log = console.log;
    const error = console.error;
    const out: string[] = [];
    const err: string[] = [];
    console.log = (...a: unknown[]) => void out.push(a.join(" "));
    console.error = (...a: unknown[]) => void err.push(a.join(" "));
    const thrower = async () => {
      throw Object.assign(new Error(`mkdir failed for ${GITHUB_TOKEN}`), {
        code: "EACCES",
        path: "/nope",
        exitCode: 3,
      });
    };
    let text: number;
    let json: number;
    try {
      text = await runCli(["bun", "cli.ts", "discord", "bridge"], thrower);
      json = await runCli(["bun", "cli.ts", "task", "run", "--output", "json"], thrower);
    } finally {
      console.log = log;
      console.error = error;
    }
    expect(text).toBe(3);
    expect(json).toBe(3);
    expect(err[0]).toBe("corvidinho: mkdir failed for [redacted:github-token]");
    expect(err[1]).toContain("CORVIDINHO_DATA_DIR");
    expect(JSON.parse(out.join("\n"))).toEqual({
      ok: false,
      error: "mkdir failed for [redacted:github-token]",
    });
    expectClean(out.join("\n") + err.join("\n"), [GITHUB_TOKEN]);
  });

  test("a clean command's exit code passes through runCli unchanged", async () => {
    expect(await runCli(["bun", "cli.ts"], async () => 0)).toBe(0);
    expect(await runCli(["bun", "cli.ts"], async () => 2)).toBe(2);
  });
});
