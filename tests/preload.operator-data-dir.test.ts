/**
 * The bun test preload keeps tests off the operator's data dir (SAFE-5 audit
 * trail integrity): a child `bun test` started with the operator's
 * CORVIDINHO_DATA_DIR / audit key / write paths (as the prove-before-done
 * verify lane is) writes nothing there and signs nothing with the key.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, isAbsolute } from "node:path";
import { appendAudit, argsDigest } from "../src/audit/log.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";

const root = join(import.meta.dir, "..");
const OPERATOR_KEY = "operator-audit-hmac-key-do-not-use";

type Probe = {
  dataDir: string;
  dbPath: string;
  spawnLog: string;
  worktreeBase: string | null;
  auditKeySet: boolean;
  runEnvSet: string[];
  nonInteractive: boolean;
  llmKeySet: boolean;
  llmProviderSet: boolean;
  rows: number;
  keyed: number;
  cliExit: number;
  children: { dataDir: string; keySet: boolean; spawnLog: string; worktreeBase: string }[];
};

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function operatorDir(): string {
  const d = mkdtempSync(join(tmpdir(), "corvidinho-operator-data-"));
  dirs.push(d);
  return d;
}

function isUnder(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function auditRows(dir: string): { n: number; last: string | null } {
  const path = join(dir, "corvidinho.db");
  if (!existsSync(path)) return { n: 0, last: null };
  const db = openCorvidinhoDb({ path });
  try {
    const r = db
      .query("SELECT COUNT(*) AS n, (SELECT hash FROM audit_log ORDER BY seq DESC LIMIT 1) AS last FROM audit_log")
      .get() as { n: number; last: string | null };
    return r;
  } finally {
    db.close();
  }
}

/** Child `bun test` in this repo (its bunfig preload applies) with the operator's env. */
async function runProbe(
  op: string,
  extraEnv: Record<string, string> = {},
): Promise<{ code: number; probe: Probe | null; out: string }> {
  const proc = Bun.spawn(
    [process.execPath, "test", "./tests/fixtures/preload-probe.ts"],
    {
      cwd: root,
      env: {
        ...process.env,
        CORVIDINHO_DATA_DIR: op,
        CORVIDINHO_AUDIT_HMAC_KEY: OPERATOR_KEY,
        CORVIDINHO_WATCH_SPAWN_LOG: join(op, "watch-spawn.jsonl"),
        WORKTREE_BASE_DIR: join(op, "worktrees"),
        ...extraEnv,
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const out = `${stdout}${stderr}`;
  const line = out.split("\n").find((l) => l.startsWith("PRELOAD_PROBE "));
  const probe = line ? (JSON.parse(line.slice("PRELOAD_PROBE ".length)) as Probe) : null;
  return { code, probe, out };
}

describe("bun test preload never writes the operator data dir (SAFE-5)", () => {
  test("child bun test with an operator CORVIDINHO_DATA_DIR leaves 0 audit rows there", async () => {
    const op = operatorDir();
    const { code, probe, out } = await runProbe(op);
    expect(code, out).toBe(0);
    expect(probe, out).not.toBeNull();
    // The probe's row and the CLI's denied row went to the preload's temp dir…
    expect(probe!.cliExit).toBe(2);
    expect(probe!.rows).toBe(2);
    expect(isUnder(probe!.dataDir, op)).toBe(false);
    expect(isUnder(probe!.dbPath, op)).toBe(false);
    // …and nothing at all landed in the operator dir.
    expect(auditRows(op).n).toBe(0);
    expect(readdirSync(op)).toEqual([]);
  }, 60_000);

  test("an existing operator DB keeps its audit chain; the operator key signs nothing", async () => {
    const op = operatorDir();
    const seed = openCorvidinhoDb({ path: join(op, "corvidinho.db") });
    appendAudit(
      seed,
      { action: "git-push", actor: "local", surface: "cli", argsDigest: argsDigest(["real"]), outcome: "ok" },
      { key: OPERATOR_KEY },
    );
    seed.close();
    const before = auditRows(op);
    expect(before.n).toBe(1);

    const { code, probe, out } = await runProbe(op);
    expect(code, out).toBe(0);
    expect(probe, out).not.toBeNull();
    expect(auditRows(op)).toEqual(before);
    // Test rows are never keyed with the operator's audit key.
    expect(probe!.auditKeySet).toBe(false);
    expect(probe!.keyed).toBe(0);
  }, 60_000);

  test("children spawned without an explicit env get the test data dir, not the operator's", async () => {
    const op = operatorDir();
    const { code, probe, out } = await runProbe(op);
    expect(code, out).toBe(0);
    expect(probe, out).not.toBeNull();
    // Bun.spawn(argv), Bun.spawn({ cmd }) and Bun.spawnSync(argv), no `env`.
    expect(probe!.children).toHaveLength(3);
    for (const child of probe!.children) {
      expect(child).toEqual({ dataDir: probe!.dataDir, keySet: false, spawnLog: "", worktreeBase: "" });
    }
  }, 60_000);

  test("operator WATCH spawn log and worktree base are not inherited", async () => {
    const op = operatorDir();
    const { code, probe, out } = await runProbe(op);
    expect(code, out).toBe(0);
    expect(probe, out).not.toBeNull();
    expect(isUnder(probe!.spawnLog, op)).toBe(false);
    expect(probe!.worktreeBase).toBeNull();
  }, 60_000);

  test("bot run settings (non-interactive, spend cap, LLM keys and model config, a scheduled run's session id) do not reach the suite", async () => {
    // A Discord / WATCH / daemon task run sets CORVIDINHO_NON_INTERACTIVE=1 and
    // its verify lane runs this suite; with it, a SAFE-8 cap or an LLM key in
    // the env, CLI and mock-LLM tests fail (or call a real model) off CI. A
    // scheduled run's `schedule_*` session id narrows the GitHub gate
    // (DISCORD-SCHEDULE-3.a), so the ROLES-CHAT-8 tests would fail under it.
    const op = operatorDir();
    const { code, probe, out } = await runProbe(op, {
      CORVIDINHO_NON_INTERACTIVE: "1",
      FLEDGE_NON_INTERACTIVE: "1",
      CORVIDINHO_DAILY_SPEND_CAP_USD: "5",
      // SAFE-14: a per-provider cap stops mock-LLM runs the same way.
      CORVIDINHO_PROVIDER_SPEND_CAPS_USD: "127.0.0.1:11434=1",
      CORVIDINHO_LLM_API_KEY: "sk-operator-llm-key",
      OPENAI_API_KEY: "sk-operator-openai-key",
      // AGENT-13: the operator's model config (a keyless ollama: model would
      // call a local server) never reaches the suite either.
      ANTHROPIC_API_KEY: "sk-ant-operator-anthropic-key",
      OLLAMA_HOST: "127.0.0.1:11434",
      CORVIDINHO_LLM_MODEL: "ollama:operator-model",
      CORVIDINHO_LLM_MODEL_READ: "anthropic:operator-read",
      CORVIDINHO_LLM_MODEL_TOOL: "ollama:operator-tool",
      CORVIDINHO_LLM_MODEL_CODE: "ollama:operator-code",
      CORVIDINHO_LLM_BASE_URL: "http://127.0.0.1:9/v1",
      CORVIDINHO_LLM_TIER: "read",
      CORVIDINHO_DISCORD_SESSION_ID: "schedule_sched_verifylane",
    });
    expect(code, out).toBe(0);
    expect(probe, out).not.toBeNull();
    expect(probe!.runEnvSet).toEqual([]);
    expect(probe!.nonInteractive).toBe(false);
    expect(probe!.llmKeySet).toBe(false);
    expect(probe!.llmProviderSet).toBe(false);
  }, 60_000);
});
