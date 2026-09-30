/**
 * bun test preload (bunfig.toml): isolate the shared SQLite data dir so no
 * test (or CLI it spawns) touches the operator's data dir, never read the
 * operator's allowlist file (ALLOW-4), and keep every temp dir the run makes
 * under one root that is removed when the run ends (REQ-cli-711).
 */
import { afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// One temp root per `bun test` run. Tests make ~450 mkdtemp dirs per run
// (git repos, fake projects, stub bins) and most never remove them, so each
// verify-lane run left them in the OS temp dir until the disk filled. Every
// later tmpdir() reads TMPDIR at call time (Bun's node:os, like Node), and
// preload runs before any test module, so pointing TMPDIR here moves them all,
// including those computed at a test file's top level. Children get it too:
// the Bun.spawn wrapper below and node:child_process pass process.env.
const runRoot = mkdtempSync(join(tmpdir(), "corvidinho-test-run-"));
process.env.TMPDIR = runRoot;
process.env.TMP = runRoot;
process.env.TEMP = runRoot;

/** Best-effort: never throws, so cleanup can never turn a run's result. */
function removeRunRoot(): void {
  // Retry once: a child a test left running may still be adding files.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      rmSync(runRoot, { recursive: true, force: true });
      return;
    } catch {
      // Leave it; the next attempt or the OS temp cleaner gets it.
    }
  }
}
// Bun 1.4 fires no process "exit" event when `bun test` finishes (pass or
// fail), but runs a preload's afterAll once, after the last test file. "exit"
// still fires when a test calls process.exit(), which skips afterAll.
afterAll(removeRunRoot);
process.on("exit", removeRunRoot);

const scratch = mkdtempSync(join(runRoot, "corvidinho-test-data-"));

// Always overwrite: the prove-before-done verify lane runs this suite with the
// operator's env, so an inherited CORVIDINHO_DATA_DIR is the live bot DB. Tests
// write audit rows, sessions and memory through it (SAFE-5); they land here.
process.env.CORVIDINHO_DATA_DIR = scratch;

// Always overwrite: an operator's CORVIDINHO_ALLOWLIST_FILE or
// ~/.config/corvidinho/allowlist.* must never change test outcomes. This path
// does not exist, so the loader adds nothing. Tests that need a file set their
// own; tests that hand a custom env object to a loader pass a missing path too.
process.env.CORVIDINHO_ALLOWLIST_FILE = join(scratch, "no-allowlist.toml");

// Other operator state tests could write through: the audit key would sign
// test rows (SAFE-5); the WATCH spawn log and worktree base are write paths.
// Unset, they fall back to the scratch data dir / a temp project's sibling.
delete process.env.CORVIDINHO_AUDIT_HMAC_KEY;
delete process.env.CORVIDINHO_WATCH_SPAWN_LOG;
delete process.env.WORKTREE_BASE_DIR;
// OPS-1: an operator's backup dir must never receive test snapshots (the
// bridge / daemon tests tick the nightly backup); tests set their own.
delete process.env.CORVIDINHO_BACKUP_DIR;

// Run and operator settings that change test outcomes: every Discord / WATCH /
// daemon task run sets CORVIDINHO_NON_INTERACTIVE=1, and its verify lane runs
// this suite; a SAFE-8 spend cap stops mock-LLM runs to ask; an LLM API key
// would send real (paid) model calls from `bun test`. The suite runs as on CI.
delete process.env.CORVIDINHO_NON_INTERACTIVE;
delete process.env.FLEDGE_NON_INTERACTIVE;
delete process.env.CORVIDINHO_DAILY_SPEND_CAP_USD;
delete process.env.CORVIDINHO_LLM_API_KEY;
delete process.env.OPENAI_API_KEY;

// Bun.spawn / Bun.spawnSync with no `env` pass the environment this process
// started with, not process.env as edited above, so a CLI a test spawns would
// still write the operator's data dir with the operator's key. Default `env`
// to the current process.env (what node:child_process does).
type SpawnFn = (...args: unknown[]) => unknown;
function withCurrentEnv(spawn: SpawnFn): SpawnFn {
  return (...args: unknown[]) => {
    const i = Array.isArray(args[0]) ? 1 : 0;
    const opts = (args[i] ?? {}) as { env?: unknown };
    if (opts.env === undefined) args[i] = { ...opts, env: { ...process.env } };
    return spawn(...args);
  };
}
const bun = Bun as unknown as { spawn: SpawnFn; spawnSync: SpawnFn };
bun.spawn = withCurrentEnv(bun.spawn);
bun.spawnSync = withCurrentEnv(bun.spawnSync);
