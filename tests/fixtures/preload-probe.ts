/**
 * Child-process probe for tests/preload.operator-data-dir.test.ts, run as
 * `bun test ./tests/fixtures/preload-probe.ts` (not a *.test.ts file, so the
 * main suite skips it). Under the bun test preload it writes one audit row the
 * way plugins do (default DB, key from env), runs the CLI and a shell with no
 * explicit `env` (as many tests do), and prints what each resolved.
 */
import { test } from "bun:test";
import { join } from "node:path";
import { loadLlmEnv } from "../../src/agent/execute.ts";
import { appendAudit, argsDigest, auditKeyFromEnv } from "../../src/audit/log.ts";
import { isNonInteractive } from "../../src/plugins/env.ts";
import { openCorvidinhoDb } from "../../src/store/db.ts";
import { defaultDbPath, resolveDataDir } from "../../src/store/paths.ts";
import { defaultSpawnLogPath } from "../../src/watch/spawn-log.ts";

const root = join(import.meta.dir, "..", "..");
/** Bot / run settings that change test outcomes (REQ-cli-262): none may reach the suite. */
const RUN_ENV_KEYS = [
  "CORVIDINHO_NON_INTERACTIVE",
  "FLEDGE_NON_INTERACTIVE",
  "CORVIDINHO_DAILY_SPEND_CAP_USD",
  "CORVIDINHO_PROVIDER_SPEND_CAPS_USD",
  "CORVIDINHO_LLM_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OLLAMA_HOST",
  "CORVIDINHO_LLM_MODEL",
  "CORVIDINHO_LLM_MODEL_READ",
  "CORVIDINHO_LLM_MODEL_TOOL",
  "CORVIDINHO_LLM_MODEL_CODE",
  "CORVIDINHO_LLM_BASE_URL",
  "CORVIDINHO_LLM_TIER",
  "CORVIDINHO_DISCORD_SESSION_ID",
] as const;
const SHOW_ENV =
  'printf "%s|%s|%s|%s" "${CORVIDINHO_DATA_DIR-}" "${CORVIDINHO_AUDIT_HMAC_KEY-}" ' +
  '"${CORVIDINHO_WATCH_SPAWN_LOG-}" "${WORKTREE_BASE_DIR-}"';

function childEnv(text: string) {
  const [dataDir = "", key = "", spawnLog = "", worktreeBase = ""] = text.split("|");
  return { dataDir, keySet: key !== "", spawnLog, worktreeBase };
}

test("preload probe writes audit rows only to the test data dir", async () => {
  const db = openCorvidinhoDb();
  try {
    appendAudit(
      db,
      {
        action: "preload-probe",
        actor: "local",
        surface: "cli",
        argsDigest: argsDigest(["probe"]),
        outcome: "ok",
      },
      { key: auditKeyFromEnv() },
    );
  } finally {
    db.close();
  }

  // No `env` option: the CLI writes a denied audit row wherever it resolves.
  const cli = Bun.spawn(
    [process.execPath, "--no-env-file", "src/cli.ts", "--non-interactive", "plugins", "run", "danger-ping"],
    { cwd: root, stdout: "pipe", stderr: "pipe" },
  );
  const cliExit = await cli.exited;
  const spawned = await new Response(
    Bun.spawn(["sh", "-c", SHOW_ENV], { stdout: "pipe" }).stdout,
  ).text();
  const spawnedObj = await new Response(
    Bun.spawn({ cmd: ["sh", "-c", SHOW_ENV], stdout: "pipe" }).stdout,
  ).text();
  const spawnedSync = Bun.spawnSync(["sh", "-c", SHOW_ENV]).stdout.toString();

  const check = openCorvidinhoDb();
  let row: { n: number; keyed: number };
  try {
    row = check
      .query("SELECT COUNT(*) AS n, MAX(keyed) AS keyed FROM audit_log")
      .get() as { n: number; keyed: number };
  } finally {
    check.close();
  }
  console.log(
    `PRELOAD_PROBE ${JSON.stringify({
      dataDir: resolveDataDir(),
      dbPath: defaultDbPath(),
      spawnLog: defaultSpawnLogPath(),
      worktreeBase: process.env.WORKTREE_BASE_DIR ?? null,
      auditKeySet: auditKeyFromEnv() !== undefined,
      runEnvSet: RUN_ENV_KEYS.filter((k) => process.env[k] !== undefined),
      nonInteractive: isNonInteractive({}),
      llmKeySet: loadLlmEnv().apiKey !== undefined,
      llmProviderSet: loadLlmEnv().notice === null,
      rows: row.n,
      keyed: row.keyed,
      cliExit,
      children: [childEnv(spawned), childEnv(spawnedObj), childEnv(spawnedSync)],
    })}`,
  );
});
