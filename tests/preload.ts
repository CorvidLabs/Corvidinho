/**
 * bun test preload (bunfig.toml): isolate the shared SQLite data dir so no
 * test (or CLI it spawns) touches the operator's data dir, and never read
 * the operator's allowlist file (ALLOW-4).
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scratch = mkdtempSync(join(tmpdir(), "corvidinho-test-data-"));

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
