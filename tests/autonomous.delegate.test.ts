/**
 * REQ-agent-117 / REQ-plugins-117 — `delegate` worker spawn (AUTONOMOUS-5,
 * SAFE-9, issue #117). Fake bins in mkdtemp dirs; no network, no tokens,
 * no worktrees.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resultFrame, serializeFrame } from "../src/agent/events-ndjson.ts";
import type { TaskResult } from "../src/agent/types.ts";
import {
  DELEGATE_DEPTH_ENV,
  MAX_DELEGATE_DEPTH,
  buildDelegateSpawn,
  buildDelegateTaskText,
  canDelegateAtDepth,
  isWorkerEnvDropped,
  clampChildTier,
  createDelegateLimiter,
  delegateDepthFromEnv,
  parseDelegateArgs,
  resolveDelegateBin,
} from "../src/autonomous/delegate.ts";
import { createDelegateCommand } from "../plugins/autonomous/index.ts";
import type { PluginHandlerArgs } from "../src/plugins/types.ts";

const ENABLED = "[corvidinho.autonomous]\nenabled = true\n";

function project(toml?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "corvidinho-delegate-proj-"));
  if (toml !== undefined) writeFileSync(join(dir, "fledge.toml"), toml);
  return dir;
}

const DONE: TaskResult = {
  summary: "worker summary",
  filesChanged: ["a.txt"],
  verified: false,
  verifySkipped: true,
  cancelled: false,
  state: "done",
  attempts: 1,
};

/**
 * sh fake `corvidinho`: records argv (NUL-separated) and selected env, then
 * runs `body` (defaults to printing a done result frame).
 */
function fakeBin(body?: string): { bin: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "corvidinho-delegate-bin-"));
  const bin = join(dir, "corvidinho");
  const vars = [
    DELEGATE_DEPTH_ENV,
    "CORVIDINHO_LLM_TIER",
    "CORVIDINHO_NON_INTERACTIVE",
    "CORVIDINHO_ALLOWLIST",
    "CORVIDINHO_ACTING_IS_ADMIN",
    "CORVIDINHO_ACTING_CONFIRM_TOKENS",
  ];
  const envDump = vars.map((v) => `printf '%s=%s\\n' ${v} "$${v}" >> "${dir}/env.txt"`).join("\n");
  const def = `cat <<'EOF'\n${serializeFrame(resultFrame(DONE))}\nEOF`;
  writeFileSync(
    bin,
    `#!/bin/sh\nprintf '%s\\0' "$@" > "${dir}/argv.bin"\n${envDump}\n${body ?? def}\n`,
    { mode: 0o755 },
  );
  return { bin, dir };
}

function argvOf(dir: string): string[] {
  return readFileSync(join(dir, "argv.bin"), "utf8").split("\0").slice(0, -1);
}

function envOf(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(join(dir, "env.txt"), "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}

function ctx(over: Partial<PluginHandlerArgs> & { cwd: string }): PluginHandlerArgs {
  return {
    args: ["--task", "do the subtask"],
    json: true,
    nonInteractive: true,
    allowlist: new Set<string>(),
    tier: "code",
    ...over,
  };
}

const BASE_ENV = { PATH: process.env.PATH ?? "" };

/** Worker body with a same-group grandchild and one in its own session. */
const TREE_BODY = [
  'd="$(dirname "$0")"',
  'sleep 30 & echo $! > "$d/bg.pid"',
  'setsid sleep 30 & echo $! > "$d/sess.pid"',
  "sleep 30",
].join("\n");

/** Alive and not a zombie (an unreaped orphan counts as dead). */
function running(pid: number): boolean {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const state = stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3);
    return state !== "Z" && state !== "X";
  } catch {
    return false;
  }
}

async function until(cond: () => boolean, ms = 3000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return true;
    await Bun.sleep(20);
  }
  return cond();
}

describe("delegate core (safety defaults)", () => {
  test("depth from env: unset 0, garbage fails closed to the cap", () => {
    expect(delegateDepthFromEnv({})).toBe(0);
    expect(delegateDepthFromEnv({ [DELEGATE_DEPTH_ENV]: "" })).toBe(0);
    expect(delegateDepthFromEnv({ [DELEGATE_DEPTH_ENV]: "1" })).toBe(1);
    expect(delegateDepthFromEnv({ [DELEGATE_DEPTH_ENV]: "-1" })).toBe(MAX_DELEGATE_DEPTH);
    expect(delegateDepthFromEnv({ [DELEGATE_DEPTH_ENV]: "one" })).toBe(MAX_DELEGATE_DEPTH);
    expect(MAX_DELEGATE_DEPTH).toBe(2);
    expect(canDelegateAtDepth(0)).toBe(true);
    expect(canDelegateAtDepth(1)).toBe(true);
    expect(canDelegateAtDepth(2)).toBe(false);
  });

  test("child tier never exceeds the parent; omitted means the parent's", () => {
    expect(clampChildTier("code")).toEqual({ ok: true, tier: "code", clamped: false });
    expect(clampChildTier("tool", "")).toEqual({ ok: true, tier: "tool", clamped: false });
    expect(clampChildTier("tool", "code")).toEqual({ ok: true, tier: "tool", clamped: true });
    expect(clampChildTier("read", "tool")).toEqual({ ok: true, tier: "read", clamped: true });
    expect(clampChildTier("code", "READ")).toEqual({ ok: true, tier: "read", clamped: false });
    expect(clampChildTier("code", "admin").ok).toBe(false);
  });

  test("argv parse: --task always takes the next item; skill label checked", () => {
    const a = parseDelegateArgs(["--skill", "SpecSync", "--task", "--tier=code"]);
    expect(a).toEqual({ ok: true, value: { task: "--tier=code", skill: "specsync" } });
    expect(parseDelegateArgs(["list", "the", "specs"])).toEqual({
      ok: true,
      value: { task: "list the specs" },
    });
    expect(parseDelegateArgs(["--tier", "read", "x"])).toEqual({
      ok: true,
      value: { task: "x", tier: "read" },
    });
    expect(parseDelegateArgs([]).ok).toBe(false);
    expect(parseDelegateArgs(["--skill", "rm -rf", "x"]).ok).toBe(false);
    expect(parseDelegateArgs(["--depth", "0", "x"]).ok).toBe(false);
    expect(parseDelegateArgs(["--task"]).ok).toBe(false);
    expect(parseDelegateArgs(["--task", "y".repeat(9000)]).ok).toBe(false);
  });

  test("worker task text carries skill and depth provenance", () => {
    const t = buildDelegateTaskText({ task: "count specs", skill: "specsync", childDepth: 1 });
    expect(t).toContain("skill: specsync");
    expect(t).toContain("worker depth 1/2");
    expect(t).toContain("count specs");
  });

  test("spawn: bun --no-env-file for .ts; forced env beats inherited env", () => {
    const { cmd, env } = buildDelegateSpawn({
      bin: "/opt/corvidinho/src/cli.ts",
      taskText: "--no-verify",  // task text, never a flag
      tier: "tool",
      childDepth: 1,
      allowlist: new Set(["files-write"]),
      baseEnv: {
        PATH: "/usr/bin",
        [DELEGATE_DEPTH_ENV]: "0",
        CORVIDINHO_LLM_TIER: "code",
        CORVIDINHO_NON_INTERACTIVE: "0",
        CORVIDINHO_ALLOWLIST: "files-write,shell-exec,git-push",
        CORVIDINHO_ACTING_IS_ADMIN: "1",
        CORVIDINHO_ACTING_CONFIRM_TOKENS: "mc1.x",
      },
    });
    expect(cmd.slice(0, 3)).toEqual(["bun", "--no-env-file", "/opt/corvidinho/src/cli.ts"]);
    expect(cmd.slice(-2)).toEqual(["--task", "--no-verify"]);
    expect(cmd).toContain("--non-interactive");
    // Workers keep prove-before-done (REQ-cli-085): --no-verify only as task text.
    expect(cmd.indexOf("--no-verify")).toBe(cmd.length - 1);
    expect(cmd[cmd.indexOf("--tier") + 1]).toBe("tool");
    expect(cmd[cmd.indexOf("--output") + 1]).toBe("ndjson");
    expect(env).toMatchObject({
      PATH: "/usr/bin",
      [DELEGATE_DEPTH_ENV]: "1",
      CORVIDINHO_LLM_TIER: "tool",
      CORVIDINHO_NON_INTERACTIVE: "1",
      CORVIDINHO_ALLOWLIST: "files-write",
      // Lead in a role session ⇒ non-ADMIN worker; confirm tokens never pass.
      CORVIDINHO_ACTING_IS_ADMIN: "0",
    });
    expect(env.CORVIDINHO_ACTING_CONFIRM_TOKENS).toBeUndefined();
  });

  test("worker env drops Discord / GitHub tokens, the audit key and acting identity; keeps LLM keys", () => {
    const { env } = buildDelegateSpawn({
      bin: "/opt/corvidinho/src/cli.ts",
      taskText: "x",
      tier: "code",
      childDepth: 1,
      allowlist: [],
      baseEnv: {
        PATH: "/usr/bin",
        HOME: "/home/lead",
        DISCORD_TOKEN: "discord-token-value",
        DISCORD_BOT_TOKEN: "discord-bot-token-value",
        DISCORD_CHANNEL_IDS: "1408845298629083220",
        GITHUB_TOKEN: "github-token-value",
        GH_TOKEN: "gh-token-value",
        CORVIDINHO_AUDIT_HMAC_KEY: "audit-hmac-key-value",
        CORVIDINHO_ACTING_IS_ADMIN: "1",
        CORVIDINHO_ACTING_DISCORD_USER_ID: "181969874455756800",
        CORVIDINHO_ACTING_CONFIRM_TOKENS: "mc1.x",
        OPENAI_API_KEY: "openai-key-value",
        CORVIDINHO_LLM_API_KEY: "llm-key-value",
        CORVIDINHO_LLM_BASE_URL: "https://llm.example/v1",
        CORVIDINHO_LLM_MODEL: "m",
      },
    });
    for (const k of [
      "DISCORD_TOKEN",
      "DISCORD_BOT_TOKEN",
      "DISCORD_CHANNEL_IDS",
      "GITHUB_TOKEN",
      "GH_TOKEN",
      "CORVIDINHO_AUDIT_HMAC_KEY",
      "CORVIDINHO_ACTING_DISCORD_USER_ID",
      "CORVIDINHO_ACTING_CONFIRM_TOKENS",
    ]) {
      expect(env[k]).toBeUndefined();
    }
    expect(JSON.stringify(env)).not.toMatch(/discord-|github-token|gh-token|audit-hmac/);
    expect(env).toMatchObject({
      PATH: "/usr/bin",
      HOME: "/home/lead",
      OPENAI_API_KEY: "openai-key-value",
      CORVIDINHO_LLM_API_KEY: "llm-key-value",
      CORVIDINHO_LLM_BASE_URL: "https://llm.example/v1",
      CORVIDINHO_LLM_MODEL: "m",
      CORVIDINHO_ACTING_IS_ADMIN: "0",
    });
    for (const k of ["DISCORD_TOKEN", "GITHUB_TOKEN", "GH_TOKEN", "CORVIDINHO_AUDIT_HMAC_KEY"]) {
      expect(isWorkerEnvDropped(k)).toBe(true);
    }
    expect(isWorkerEnvDropped("CORVIDINHO_ACTING_ANYTHING")).toBe(true);
    expect(isWorkerEnvDropped("OPENAI_API_KEY")).toBe(false);
    expect(isWorkerEnvDropped("CORVIDINHO_LLM_API_KEY")).toBe(false);
  });

  test("a lead outside a role session (local CLI) gets a worker outside one", () => {
    const { env } = buildDelegateSpawn({
      bin: "/opt/corvidinho/src/cli.ts",
      taskText: "x",
      tier: "code",
      childDepth: 1,
      allowlist: [],
      baseEnv: { PATH: "/usr/bin" },
    });
    expect(Object.hasOwn(env, "CORVIDINHO_ACTING_IS_ADMIN")).toBe(false);
  });

  test("bin: CORVIDINHO_BIN, else this checkout's CLI (never the cwd's)", () => {
    expect(resolveDelegateBin({ CORVIDINHO_BIN: "/usr/local/bin/corvidinho" })).toBe(
      "/usr/local/bin/corvidinho",
    );
    expect(resolveDelegateBin({})).toBe(join(import.meta.dir, "..", "src", "cli.ts"));
  });

  test("limiter: concurrency and per-run caps refuse, release frees a slot", () => {
    const l = createDelegateLimiter({ maxConcurrent: 1, maxTotal: 2 });
    const a = l.tryAcquire();
    expect(a.ok).toBe(true);
    const b = l.tryAcquire();
    expect(b.ok).toBe(false);
    if (a.ok) {
      a.slot.release();
      a.slot.release(); // idempotent
    }
    expect(l.active).toBe(0);
    const c = l.tryAcquire();
    expect(c.ok).toBe(true);
    if (c.ok) c.slot.release();
    const d = l.tryAcquire();
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.error).toContain("2 workers per run");
  });
});

describe("delegate plugin handler (fake bin)", () => {
  test("AUTONOMOUS-1: refused when the project has not enabled it; nothing spawned", async () => {
    const { bin, dir } = fakeBin();
    const cmd = createDelegateCommand({ bin, env: BASE_ENV });
    const r = await cmd.handler(ctx({ cwd: project() }));
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(2);
    expect(r.error).toContain("AUTONOMOUS-1");
    expect(existsSync(join(dir, "argv.bin"))).toBe(false);
  });

  test("depth cap: a depth-2 worker cannot delegate again", async () => {
    const { bin, dir } = fakeBin();
    const cmd = createDelegateCommand({ bin, env: { ...BASE_ENV, [DELEGATE_DEPTH_ENV]: "2" } });
    const r = await cmd.handler(ctx({ cwd: project(ENABLED) }));
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(2);
    expect(r.error).toContain("depth cap");
    expect(existsSync(join(dir, "argv.bin"))).toBe(false);
  });

  test("below code tier is refused, including an omitted tier (env default tool)", async () => {
    const { bin, dir } = fakeBin();
    const cmd = createDelegateCommand({ bin, env: BASE_ENV });
    const low = await cmd.handler(ctx({ cwd: project(ENABLED), tier: "tool" }));
    expect(low.ok).toBe(false);
    expect(low.error).toContain("code tier");
    const omitted = await cmd.handler(ctx({ cwd: project(ENABLED), tier: undefined }));
    expect(omitted.ok).toBe(false);
    expect(existsSync(join(dir, "argv.bin"))).toBe(false);
  });

  test("usage errors exit 1 (bad argv even while autonomous is off)", async () => {
    const cmd = createDelegateCommand({ bin: "/nonexistent", env: BASE_ENV });
    const r = await cmd.handler(ctx({ cwd: project(), args: [] }));
    expect(r.exitCode).toBe(1);
    expect(r.error).toContain("usage: delegate");
    const t = await cmd.handler(ctx({ cwd: project(ENABLED), args: ["--tier", "root", "x"] }));
    expect(t.exitCode).toBe(1);
  });

  test("a worker bin that cannot start is a clean failure, slot released", async () => {
    const limiter = createDelegateLimiter({ maxConcurrent: 1, maxTotal: 4 });
    const missing = join(mkdtempSync(join(tmpdir(), "corvidinho-delegate-missing-")), "nope");
    const cmd = createDelegateCommand({ bin: missing, env: BASE_ENV, limiter });
    const r = await cmd.handler(ctx({ cwd: project(ENABLED) }));
    expect(r.ok).toBe(false);
    expect(r.data).toMatchObject({ state: "failed", exitCode: 127 });
    expect(limiter.active).toBe(0);
  });

  test("runs one worker: same-or-lower tier, depth+1, non-interactive, lead allowlist", async () => {
    const { bin, dir } = fakeBin();
    const cmd = createDelegateCommand({
      bin,
      env: { ...BASE_ENV, CORVIDINHO_ALLOWLIST: "shell-exec,git-push", CORVIDINHO_ACTING_IS_ADMIN: "1" },
    });
    const cwd = project(ENABLED);
    const r = await cmd.handler(
      ctx({
        cwd,
        allowlist: new Set(["files-write"]),
        args: ["--skill", "docs", "--tier", "read", "--task", "summarize README"],
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({
      skill: "docs",
      tier: "read",
      tierClamped: false,
      depth: 1,
      exitCode: 0,
      state: "done",
      filesChanged: ["a.txt"],
      verified: false,
      verifySkipped: true,
    });
    expect(r.message).toContain("worker [docs]");
    const argv = argvOf(dir);
    expect(argv.slice(0, 2)).toEqual(["task", "run"]);
    expect(argv).toContain("--non-interactive");
    expect(argv).not.toContain("--no-verify");
    expect(argv[argv.indexOf("--tier") + 1]).toBe("read");
    expect(argv.at(-2)).toBe("--task");
    expect(argv.at(-1)).toContain("summarize README");
    expect(argv.at(-1)).toContain("skill: docs");
    const env = envOf(dir);
    expect(env).toMatchObject({
      [DELEGATE_DEPTH_ENV]: "1",
      CORVIDINHO_LLM_TIER: "read",
      CORVIDINHO_NON_INTERACTIVE: "1",
      CORVIDINHO_ALLOWLIST: "files-write",
      CORVIDINHO_ACTING_IS_ADMIN: "0",
      CORVIDINHO_ACTING_CONFIRM_TOKENS: "",
    });
  });

  test("the spawned worker never sees bridge / GitHub tokens or the audit key (SAFE-6)", async () => {
    const { bin, dir } = fakeBin(
      `env | sed 's/=.*//' > "$(dirname "$0")/keys.txt"\ncat <<'EOF'\n${serializeFrame(resultFrame(DONE))}\nEOF`,
    );
    const cmd = createDelegateCommand({
      bin,
      env: {
        ...BASE_ENV,
        DISCORD_TOKEN: "t1",
        DISCORD_BOT_TOKEN: "t2",
        GITHUB_TOKEN: "t3",
        GH_TOKEN: "t4",
        CORVIDINHO_AUDIT_HMAC_KEY: "k1",
        CORVIDINHO_ACTING_DISCORD_USER_ID: "181969874455756800",
        CORVIDINHO_ACTING_CONFIRM_TOKENS: "mc1.x",
        CORVIDINHO_LLM_API_KEY: "llm",
      },
    });
    const r = await cmd.handler(ctx({ cwd: project(ENABLED) }));
    expect(r.ok).toBe(true);
    const keys = new Set(readFileSync(join(dir, "keys.txt"), "utf8").split("\n"));
    for (const k of [
      "DISCORD_TOKEN",
      "DISCORD_BOT_TOKEN",
      "GITHUB_TOKEN",
      "GH_TOKEN",
      "CORVIDINHO_AUDIT_HMAC_KEY",
      "CORVIDINHO_ACTING_DISCORD_USER_ID",
      "CORVIDINHO_ACTING_CONFIRM_TOKENS",
      // CLI lead (no role session) ⇒ worker outside one too.
      "CORVIDINHO_ACTING_IS_ADMIN",
    ]) {
      expect(keys.has(k)).toBe(false);
    }
    expect(keys.has("CORVIDINHO_LLM_API_KEY")).toBe(true);
    expect(keys.has(DELEGATE_DEPTH_ENV)).toBe(true);
  });

  test("omitted worker tier inherits the lead's tier from env, not a higher default", async () => {
    const { bin, dir } = fakeBin();
    const cmd = createDelegateCommand({
      bin,
      env: { ...BASE_ENV, CORVIDINHO_LLM_TIER: "code", [DELEGATE_DEPTH_ENV]: "1" },
    });
    const r = await cmd.handler(ctx({ cwd: project(ENABLED), tier: undefined }));
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({ tier: "code", depth: 2 });
    expect(envOf(dir)[DELEGATE_DEPTH_ENV]).toBe("2");
  });

  test("worker failure is reported, summary scrubbed (SAFE-6)", async () => {
    const leak = "ghp_" + "A".repeat(36);
    const failed = serializeFrame(
      resultFrame({ ...DONE, state: "failed", summary: `broke with ${leak}`, filesChanged: [] }),
    );
    const { bin } = fakeBin(`cat <<'EOF'\n${failed}\nEOF\nexit 1`);
    const cmd = createDelegateCommand({ bin, env: BASE_ENV });
    const r = await cmd.handler(ctx({ cwd: project(ENABLED) }));
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(1);
    expect(r.data).toMatchObject({ state: "failed", exitCode: 1 });
    expect(JSON.stringify(r)).not.toContain(leak);
    expect(r.error).toContain("[redacted:github-token]");
  });

  test("timeout stops the worker", async () => {
    const { bin } = fakeBin("sleep 5");
    const cmd = createDelegateCommand({ bin, env: BASE_ENV, timeoutMs: 200 });
    const started = Date.now();
    const r = await cmd.handler(ctx({ cwd: project(ENABLED) }));
    expect(Date.now() - started).toBeLessThan(4000);
    expect(r.ok).toBe(false);
    expect(r.data).toMatchObject({ state: "cancelled", timedOut: true });
  });

  test("a grandchild holding the pipe does not hang the lead; result kept", async () => {
    const done = serializeFrame(resultFrame(DONE));
    const { bin } = fakeBin(`cat <<'EOF'\n${done}\nEOF\nsleep 5 &\nexit 0`);
    const cmd = createDelegateCommand({ bin, env: BASE_ENV });
    const started = Date.now();
    const r = await cmd.handler(ctx({ cwd: project(ENABLED) }));
    expect(Date.now() - started).toBeLessThan(4000);
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({ state: "done", filesChanged: ["a.txt"] });
  });

  test("lead abort stops the worker (AGENT-3)", async () => {
    const { bin } = fakeBin("sleep 5");
    const cmd = createDelegateCommand({ bin, env: BASE_ENV });
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 150);
    const started = Date.now();
    const r = await cmd.handler(ctx({ cwd: project(ENABLED), signal: ac.signal }));
    expect(Date.now() - started).toBeLessThan(4000);
    expect(r.ok).toBe(false);
    expect(r.data).toMatchObject({ state: "cancelled", aborted: true });
    const pre = new AbortController();
    pre.abort();
    const { bin: bin2, dir: dir2 } = fakeBin();
    const r2 = await createDelegateCommand({ bin: bin2, env: BASE_ENV }).handler(
      ctx({ cwd: project(ENABLED), signal: pre.signal }),
    );
    expect(r2.ok).toBe(false);
    expect(existsSync(join(dir2, "argv.bin"))).toBe(false);
  });

  test("timeout stops the worker's whole tree, not just the worker (REQ-agent-117)", async () => {
    const { bin, dir } = fakeBin(TREE_BODY);
    const cmd = createDelegateCommand({ bin, env: BASE_ENV, timeoutMs: 1500 });
    const started = Date.now();
    const r = await cmd.handler(ctx({ cwd: project(ENABLED) }));
    expect(Date.now() - started).toBeLessThan(6000);
    expect(r.data).toMatchObject({ state: "cancelled", timedOut: true });
    const bg = Number(readFileSync(join(dir, "bg.pid"), "utf8"));
    const sess = Number(readFileSync(join(dir, "sess.pid"), "utf8"));
    expect(await until(() => !running(bg) && !running(sess))).toBe(true);
  });

  test("lead abort stops the worker's whole tree (AGENT-3, REQ-agent-117)", async () => {
    const { bin, dir } = fakeBin(TREE_BODY);
    const cmd = createDelegateCommand({ bin, env: BASE_ENV });
    const ac = new AbortController();
    const sessFile = join(dir, "sess.pid");
    void until(() => existsSync(sessFile) && readFileSync(sessFile, "utf8").trim() !== "", 10_000).then(() =>
      ac.abort(),
    );
    const r = await cmd.handler(ctx({ cwd: project(ENABLED), signal: ac.signal }));
    expect(r.data).toMatchObject({ state: "cancelled", aborted: true });
    const bg = Number(readFileSync(join(dir, "bg.pid"), "utf8"));
    const sess = Number(readFileSync(join(dir, "sess.pid"), "utf8"));
    expect(await until(() => !running(bg) && !running(sess))).toBe(true);
  });

  test("fan-out cap: a spent per-run budget refuses without spawning", async () => {
    const { bin, dir } = fakeBin();
    const cmd = createDelegateCommand({
      bin,
      env: BASE_ENV,
      limiter: createDelegateLimiter({ maxConcurrent: 2, maxTotal: 1 }),
    });
    expect((await cmd.handler(ctx({ cwd: project(ENABLED) }))).ok).toBe(true);
    const second = await cmd.handler(ctx({ cwd: project(ENABLED) }));
    expect(second.ok).toBe(false);
    expect(second.exitCode).toBe(2);
    expect(second.error).toContain("budget");
    expect(argvOf(dir).length).toBeGreaterThan(0);
  });

  test("worker ignores a .env in the project cwd (bun --no-env-file)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-delegate-ts-"));
    const bin = join(dir, "fake-cli.ts");
    writeFileSync(
      bin,
      [
        `const leaked = process.env.DELEGATE_DOTENV_PROBE ?? "";`,
        `const r = { protocol: 2, type: "result", result: { summary: "probe=" + leaked, filesChanged: [], verified: false, verifySkipped: true, cancelled: false, state: "done", attempts: 1 } };`,
        `console.log(JSON.stringify(r));`,
      ].join("\n"),
    );
    const cwd = project(ENABLED);
    writeFileSync(join(cwd, ".env"), "DELEGATE_DOTENV_PROBE=from-project-env\n");
    const cmd = createDelegateCommand({ bin, env: BASE_ENV });
    const r = await cmd.handler(ctx({ cwd }));
    expect(r.ok).toBe(true);
    expect((r.data as { summary: string }).summary).toContain("probe=");
    expect((r.data as { summary: string }).summary).not.toContain("from-project-env");
  });
});
