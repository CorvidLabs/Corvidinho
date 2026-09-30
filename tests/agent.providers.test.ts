/**
 * AGENT-13 / AGENT-10 (issue #79): the operator configures the models —
 * OpenAI-compatible, Ollama or Anthropic entries — and nothing is built in as
 * a default; with no usable provider it says so at startup (bridge, WATCH,
 * daemon, `task run`), in `/status` and in doctor / init, and a run fails
 * with that notice instead of answering from a stub or a default model.
 * Mock providers only (an injected fetch and a localhost fake server); no
 * network, no real key.
 */
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTaskExecute, loadLlmEnv } from "../src/agent/execute.ts";
import { runTask } from "../src/agent/loop.ts";
import {
  ANTHROPIC_BASE_URL,
  defaultProviderLabel,
  modelChainForTier,
  NO_PROVIDER_NOTICE,
  ollamaHostUrl,
  parseModelChain,
  parseModelEntry,
  providerId,
  providerNotice,
  providerStatus,
  resolveEntry,
} from "../src/agent/providers.ts";
import { readSpendSnapshot } from "../src/agent/spend.ts";
import { formatSpendPublicStatusLine } from "../src/agent/spend-notice.ts";
import { modelForTier, modelKeyForTier, perTierModels } from "../src/agent/tier.ts";
import { createDaemonLogger, startDaemon } from "../src/daemon/index.ts";
import type { AgentClient } from "../src/discord/agent-client.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { formatStatusReport } from "../src/discord/command-handlers/status.ts";
import { createNullGateway } from "../src/discord/gateway.ts";
import { llmDoctorCheck } from "../src/doctor.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { formatErrorLine, redactSecretEnvValues } from "../src/store/scrub.ts";
import { formatLlmStatusLine } from "../src/version.ts";
import { createEchoAckClient } from "../src/watch/ack.ts";
import { startWatchPoller, type StartWatchResult } from "../src/watch/poller.ts";
import { createMemorySpawnOutcomeStore } from "../src/watch/spawn-log.ts";
import { fakeReplyText, startFakeLlm } from "./fixtures/fake-llm.ts";

const ROOT = join(import.meta.dir, "..");
const CLI = join(ROOT, "src", "cli.ts");

const dirs: string[] = [];
const dbs: Database[] = [];
afterEach(() => {
  for (const db of dbs.splice(0)) {
    try {
      db.close();
    } catch {
      // closed by the test
    }
  }
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmp(prefix = "corvidinho-providers-"): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}

function memDb(): Database {
  const db = openCorvidinhoDb({ memory: true });
  dbs.push(db);
  return db;
}

const UNSET_NOTICE =
  "No model provider is configured: CORVIDINHO_LLM_MODEL is not set. Set CORVIDINHO_LLM_MODEL (or CORVIDINHO_LLM_MODEL_READ / _TOOL / _CODE per tier) to openai:<model>, ollama:<model> or anthropic:<model>; there is no built-in default.";

/** Records each chat request's URL, auth header and body; replies "ok". */
function recordingFetch() {
  const calls: { url: string; auth: string | undefined; body: { model: string } }[] = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url: String(input), auth: headers.authorization, body: JSON.parse(String(init?.body)) });
    return Response.json({ choices: [{ message: { content: "ok" } }] });
  };
  return { calls, fetchImpl };
}

async function runOnce(env: NodeJS.ProcessEnv, fetchImpl: ReturnType<typeof recordingFetch>["fetchImpl"]) {
  const exec = createTaskExecute({
    taskText: "hi",
    env,
    tier: "read",
    fetchImpl,
    loadPlugins: false,
    projectInstructions: false,
  });
  return exec({ attempt: 1, signal: new AbortController().signal });
}

describe("model entries (AGENT-13)", () => {
  test("kind:model splits on the first ':' only when the prefix is a kind; anything else is OpenAI-compatible", () => {
    expect(parseModelEntry("openai:gpt-4.1")).toEqual({ kind: "openai", model: "gpt-4.1" });
    expect(parseModelEntry(" ollama:qwen3:30b ")).toEqual({ kind: "ollama", model: "qwen3:30b" });
    expect(parseModelEntry("Anthropic:claude-sonnet-4-5")).toEqual({ kind: "anthropic", model: "claude-sonnet-4-5" });
    // A bare entry, or a prefix that is not a kind (an Ollama tag via a gateway).
    expect(parseModelEntry("gpt-4o")).toEqual({ kind: "openai", model: "gpt-4o" });
    expect(parseModelEntry("qwen3:30b")).toEqual({ kind: "openai", model: "qwen3:30b" });
    expect(parseModelEntry("   ")).toBeNull();
    expect(parseModelEntry("ollama:")).toBeNull();
  });

  test("a key holds an ordered comma list; blanks are skipped; a tier's own key wins, else CORVIDINHO_LLM_MODEL, else none", () => {
    expect(parseModelChain("ollama:a, anthropic:b ,, c")).toEqual([
      { kind: "ollama", model: "a" },
      { kind: "anthropic", model: "b" },
      { kind: "openai", model: "c" },
    ]);
    expect(parseModelChain(undefined)).toEqual([]);
    const env = { CORVIDINHO_LLM_MODEL: "ollama:base", CORVIDINHO_LLM_MODEL_READ: "anthropic:cheap", CORVIDINHO_LLM_MODEL_CODE: " , " };
    expect(modelChainForTier(env, "read")).toEqual([{ kind: "anthropic", model: "cheap" }]);
    expect(modelChainForTier(env, "code")).toEqual([{ kind: "ollama", model: "base" }]);
    expect(modelChainForTier({}, "tool")).toEqual([]);
    // body.model is the id without its kind; the unpriced ask names the key.
    expect(modelForTier(env, "read")).toBe("cheap");
    expect(modelForTier({}, "tool")).toBe("");
    expect(modelKeyForTier(env, "code")).toBe("CORVIDINHO_LLM_MODEL");
    expect(perTierModels({ CORVIDINHO_LLM_MODEL_READ: "ollama:r" })).toEqual({ read: "r", tool: "", code: "" });
  });

  test("each kind's vendor endpoint and key; no key → not usable, except ollama", () => {
    const openai = resolveEntry({ kind: "openai", model: "m" }, { OPENAI_API_KEY: "sk-o" });
    expect(openai).toMatchObject({ baseUrl: "https://api.openai.com/v1", apiKey: "sk-o", usable: true });
    const viaBase = resolveEntry(
      { kind: "openai", model: "m" },
      { CORVIDINHO_LLM_API_KEY: "k1", OPENAI_API_KEY: "k2", CORVIDINHO_LLM_BASE_URL: "https://gw.test/v1/" },
    );
    expect(viaBase).toMatchObject({ baseUrl: "https://gw.test/v1", apiKey: "k1", usable: true });
    expect(resolveEntry({ kind: "openai", model: "m" }, {})).toMatchObject({
      usable: false,
      keyEnv: "CORVIDINHO_LLM_API_KEY or OPENAI_API_KEY",
    });

    const ollama = resolveEntry({ kind: "ollama", model: "q" }, {});
    expect(ollama).toMatchObject({ baseUrl: "http://127.0.0.1:11434/v1", apiKey: undefined, keyEnv: null, usable: true });
    // The OpenAI key never goes to Ollama.
    expect(resolveEntry({ kind: "ollama", model: "q" }, { OPENAI_API_KEY: "sk-o" }).apiKey).toBeUndefined();

    const anthropic = resolveEntry({ kind: "anthropic", model: "c" }, { ANTHROPIC_API_KEY: "sk-ant-x", OPENAI_API_KEY: "sk-o" });
    expect(anthropic).toMatchObject({ baseUrl: ANTHROPIC_BASE_URL, apiKey: "sk-ant-x", usable: true });
    expect(resolveEntry({ kind: "anthropic", model: "c" }, { OPENAI_API_KEY: "sk-o" })).toMatchObject({
      usable: false,
      keyEnv: "ANTHROPIC_API_KEY",
    });
    // The provider id is the host the SAFE-8 ledger records.
    expect(providerId(anthropic)).toBe("api.anthropic.com");
    expect(providerId(ollama)).toBe("127.0.0.1:11434");
  });

  test("OLLAMA_HOST is read the way Ollama reads it", () => {
    expect(ollamaHostUrl({})).toBe("http://127.0.0.1:11434");
    expect(ollamaHostUrl({ OLLAMA_HOST: "gpu-box" })).toBe("http://gpu-box:11434");
    expect(ollamaHostUrl({ OLLAMA_HOST: "gpu-box:9000" })).toBe("http://gpu-box:9000");
    expect(ollamaHostUrl({ OLLAMA_HOST: "0.0.0.0" })).toBe("http://127.0.0.1:11434");
    expect(ollamaHostUrl({ OLLAMA_HOST: "https://ollama.example.com/" })).toBe("https://ollama.example.com");
    expect(ollamaHostUrl({ OLLAMA_HOST: "http://10.0.0.5:11434" })).toBe("http://10.0.0.5:11434");
  });
});

describe("every kind goes through the one OpenAI-compatible transport (AGENT-13)", () => {
  test("ollama: its host's /v1, no authorization header, the model without its kind", async () => {
    const f = recordingFetch();
    const r = await runOnce({ CORVIDINHO_LLM_MODEL: "ollama:qwen3:30b", OLLAMA_HOST: "gpu-box:9000", OPENAI_API_KEY: "sk-o" }, f.fetchImpl);
    expect(r.summary).toBe("ok");
    expect(f.calls).toEqual([
      { url: "http://gpu-box:9000/v1/chat/completions", auth: undefined, body: expect.objectContaining({ model: "qwen3:30b" }) },
    ]);
  });

  test("anthropic: its OpenAI-compatible endpoint with ANTHROPIC_API_KEY, never the OpenAI key", async () => {
    const f = recordingFetch();
    await runOnce(
      { CORVIDINHO_LLM_MODEL: "anthropic:claude-sonnet-4-5", ANTHROPIC_API_KEY: "sk-ant-secret", OPENAI_API_KEY: "sk-o" },
      f.fetchImpl,
    );
    expect(f.calls).toEqual([
      {
        url: "https://api.anthropic.com/v1/chat/completions",
        auth: "Bearer sk-ant-secret",
        body: expect.objectContaining({ model: "claude-sonnet-4-5" }),
      },
    ]);
  });

  test("openai: CORVIDINHO_LLM_BASE_URL and its key; a list calls only its first entry while that one answers (AGENT-11)", async () => {
    const f = recordingFetch();
    await runOnce(
      { CORVIDINHO_LLM_MODEL: "openai:gpt-4.1, ollama:later", CORVIDINHO_LLM_API_KEY: "k1", CORVIDINHO_LLM_BASE_URL: "https://gw.test/v1" },
      f.fetchImpl,
    );
    expect(f.calls.map((c) => [c.url, c.auth, c.body.model])).toEqual([
      ["https://gw.test/v1/chat/completions", "Bearer k1", "gpt-4.1"],
    ]);
  });
});

describe("no built-in default: with no usable provider it says so (AGENT-10)", () => {
  test("the notice names what is missing, per tier, never a key value", () => {
    expect(providerNotice({})).toBe(UNSET_NOTICE);
    expect(providerNotice({ OPENAI_API_KEY: "sk-openai-secret" })).toBe(UNSET_NOTICE);
    expect(providerNotice({ CORVIDINHO_LLM_MODEL: "anthropic:c", OPENAI_API_KEY: "sk-o" })).toBe(
      "No model provider is configured: anthropic:c needs ANTHROPIC_API_KEY, which is not set.",
    );
    // Only the read tier set: the tool and code tiers have none.
    expect(providerNotice({ CORVIDINHO_LLM_MODEL_READ: "ollama:r" })).toBe(
      "No model provider is configured for some runs — tool, code tiers: CORVIDINHO_LLM_MODEL is not set. " +
        UNSET_NOTICE.slice(UNSET_NOTICE.indexOf("Set CORVIDINHO_LLM_MODEL (")),
    );
    // One run's tier alone.
    expect(providerNotice({ CORVIDINHO_LLM_MODEL_READ: "ollama:r" }, ["read"])).toBeNull();
    expect(providerNotice({ CORVIDINHO_LLM_MODEL: "ollama:m" })).toBeNull();
    expect(providerStatus({ CORVIDINHO_LLM_MODEL: "ollama:m" }).tiers.code?.entry).toEqual({ kind: "ollama", model: "m" });
    expect(loadLlmEnv({ OPENAI_API_KEY: "sk-openai-secret" })).toMatchObject({ model: "", kind: null, notice: UNSET_NOTICE });
  });

  test("runTask ends failed with the notice as its summary; no provider call, no files claimed", async () => {
    const f = recordingFetch();
    const exec = createTaskExecute({ taskText: "hi", env: { OPENAI_API_KEY: "sk-openai-secret" }, fetchImpl: f.fetchImpl, loadPlugins: false });
    let verifies = 0;
    const r = await runTask({
      cwd: tmp(),
      task: "hi",
      execute: exec,
      verifyRunner: async () => {
        verifies += 1;
        return { success: true, output: "" };
      },
    });
    expect(r.state).toBe("failed");
    expect(r.summary).toBe(UNSET_NOTICE);
    expect(r.filesChanged).toEqual([]);
    expect(r.attempts).toBe(1);
    expect(verifies).toBe(0);
    expect(f.calls).toEqual([]);
  });

  test("task run: the notice on stderr at start and as the failed result, exit 1, no stub answer", async () => {
    const cwd = tmp();
    const env = { ...process.env, OPENAI_API_KEY: "sk-openai-secret-value", CORVIDINHO_DATA_DIR: tmp() };
    const text = Bun.spawn([process.execPath, CLI, "task", "run", "--here", "--task", "hi"], { cwd, env, stdout: "pipe", stderr: "pipe" });
    const [code, out, err] = await Promise.all([text.exited, new Response(text.stdout).text(), new Response(text.stderr).text()]);
    expect(code).toBe(1);
    expect(err.split("\n")[0]).toBe(UNSET_NOTICE);
    expect(out).toContain("state=failed");
    expect(out).toContain(UNSET_NOTICE);
    expect(out + err).not.toContain("demo task");
    expect(out + err).not.toContain("sk-openai-secret-value");

    const json = Bun.spawn([process.execPath, CLI, "task", "run", "--here", "--task", "hi", "--json"], { cwd, env, stdout: "pipe", stderr: "pipe" });
    const [jcode, jout] = await Promise.all([json.exited, new Response(json.stdout).text()]);
    expect(jcode).toBe(1);
    const parsed = JSON.parse(jout) as { result: { state: string; summary: string; filesChanged: string[] } };
    expect(parsed.result).toMatchObject({ state: "failed", summary: UNSET_NOTICE, filesChanged: [] });
  }, 60_000);

  test("task run with a keyless ollama: model calls it end to end (no key, no auth header)", async () => {
    const llm = startFakeLlm();
    try {
      const proc = Bun.spawn([process.execPath, CLI, "task", "run", "--here", "--task", "hi", "--json"], {
        cwd: tmp(),
        env: { ...process.env, ...llm.env, CORVIDINHO_DATA_DIR: tmp() },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [code, out] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
      expect(code).toBe(0);
      const parsed = JSON.parse(out) as { result: { state: string; summary: string } };
      expect(parsed.result).toMatchObject({ state: "done", summary: fakeReplyText(1) });
      expect(llm.auth).toEqual([null]);
      expect((llm.requests[0] as { model: string }).model).toBe("fake-model");
    } finally {
      llm.stop();
    }
  }, 60_000);

  test("/status: the owner sees what to set; anyone else only that none is configured (SAFE-14.a)", () => {
    const base = {
      version: "0.0.0",
      protocolVersion: 2,
      startedAt: 0,
      now: 60_000,
      channelCount: 1,
      sessions: 0,
      workActive: 0,
      workDone: 0,
      workFailed: 0,
    };
    const owner = formatStatusReport({ ...base, env: {}, ownerView: true });
    expect(owner).toContain(`LLM: none — ${UNSET_NOTICE}\n`);
    const other = formatStatusReport({ ...base, env: {} });
    expect(other).toContain("LLM: none — No model provider is configured.\n");
    expect(other).not.toContain("CORVIDINHO_");
    // Partly configured: the provider plus the notice.
    const partial = { CORVIDINHO_LLM_MODEL_TOOL: "ollama:qwen3", CORVIDINHO_LLM_TIER: "tool" };
    expect(formatLlmStatusLine(partial, { ownerView: true })).toBe(
      `LLM: ollama:qwen3 @ 127.0.0.1:11434 — No model provider is configured for some runs — read, code tiers: CORVIDINHO_LLM_MODEL is not set. ${UNSET_NOTICE.slice(UNSET_NOTICE.indexOf("Set CORVIDINHO_LLM_MODEL ("))}`,
    );
    expect(formatLlmStatusLine(partial, { ownerView: false })).toBe(
      "LLM: ollama:qwen3 @ 127.0.0.1:11434 — No model provider is configured for some runs.",
    );
    // Configured: kind, model and host; never a key.
    const line = formatLlmStatusLine({ CORVIDINHO_LLM_MODEL: "anthropic:claude-x", ANTHROPIC_API_KEY: "sk-ant-secret" }, { ownerView: false });
    expect(line).toBe("LLM: anthropic:claude-x @ api.anthropic.com");
    expect(defaultProviderLabel({})).toBeNull();
  });

  test("doctor / init: [warn] with the notice; a keyless ollama model is [ok] (never a key value)", () => {
    expect(llmDoctorCheck({})).toEqual({ name: "llm", ok: true, mark: "warn", detail: UNSET_NOTICE });
    expect(llmDoctorCheck({ CORVIDINHO_LLM_MODEL: "ollama:qwen3" })).toEqual({
      name: "llm",
      ok: true,
      detail: "no key needed; model ollama:qwen3 @ 127.0.0.1:11434",
    });
    const anthropic = llmDoctorCheck({ CORVIDINHO_LLM_MODEL: "anthropic:claude-x", ANTHROPIC_API_KEY: "sk-ant-secret" });
    expect(anthropic.detail).toBe("ANTHROPIC_API_KEY present (value not shown); model anthropic:claude-x @ api.anthropic.com");
    const partial = llmDoctorCheck({ CORVIDINHO_LLM_MODEL: "ollama:m", CORVIDINHO_LLM_MODEL_CODE: "anthropic:c" });
    expect(partial.mark).toBe("warn");
    expect(partial.detail).toBe(
      "no key needed; model ollama:m @ 127.0.0.1:11434; per tier: read ollama:m, tool ollama:m, code anthropic:c — No model provider is configured for some runs — code tier: anthropic:c needs ANTHROPIC_API_KEY, which is not set.",
    );
  });

  test("an unset model never shows as an unpriced model or 'paused for budget' under a SAFE-8 cap", () => {
    const db = memDb();
    const snap = readSpendSnapshot({ env: { CORVIDINHO_DAILY_SPEND_CAP_USD: "5" }, model: "", db });
    expect(snap).toMatchObject({ kind: "cap", priced: true });
    expect(formatSpendPublicStatusLine(snap)).toBeUndefined();
  });
});

describe("it says so at startup (AGENT-10)", () => {
  const warns: string[] = [];
  const realWarn = console.warn;
  afterAll(() => {
    console.warn = realWarn;
  });

  test("the Discord bridge warns once at start with no provider, and not with one", async () => {
    const start = async (extra: Record<string, string>) => {
      warns.length = 0;
      console.warn = (...a: unknown[]) => {
        warns.push(a.map(String).join(" "));
      };
      try {
        const idle: AgentClient = { async runChat({ sessionId }) { return { ok: true, sessionId, summary: "", exitCode: 0 }; } };
        const result = await startBridge({
          env: {
            DISCORD_BOT_TOKEN: "fake",
            DISCORD_CHANNEL_IDS: "chan-1",
            CORVIDINHO_DISCORD_DRY_RUN: "1",
            CORVIDINHO_ALLOWLIST_FILE: join(tmp(), "none.toml"),
            CORVIDINHO_OWNER_DISCORD_ID: "111122223333444455",
            ...extra,
          },
          db: memDb(),
          projectRoot: tmp(),
          skipProtocolCheck: true,
          disableScheduler: true,
          thinkingOutbound: memoryThinkingOutbound(),
          agent: idle,
          gatewayFactory: async () => createNullGateway(),
        } as Parameters<typeof startBridge>[0]);
        if (!result.ok) throw new Error("bridge did not start");
        await result.stop();
      } finally {
        console.warn = realWarn;
      }
      return [...warns];
    };
    expect(await start({})).toContain(`[discord] ${UNSET_NOTICE}`);
    const ok = await start({ CORVIDINHO_LLM_MODEL: "ollama:qwen3" });
    expect(ok.filter((w) => w.includes(NO_PROVIDER_NOTICE))).toEqual([]);
  });

  test("the daemon logs llm.no_provider and an llm field on daemon.started", async () => {
    const run = async (extra: Record<string, string>) => {
      const lines: Array<Record<string, unknown>> = [];
      const d = await startDaemon({
        env: { ...process.env, CORVIDINHO_DATA_DIR: tmp(), CORVIDINHO_OWNER_DISCORD_ID: "", ...extra },
        projectRoot: tmp(),
        logger: createDaemonLogger({ write: (l) => lines.push(JSON.parse(l)) }),
        agent: { async runChat({ sessionId }) { return { ok: true, sessionId, summary: "", exitCode: 0 }; } },
        useWorktrees: false,
      });
      if (!d.ok) throw new Error("daemon did not start");
      await d.stop();
      return lines;
    };
    const none = await run({});
    expect(none.find((l) => l.event === "daemon.started")).toMatchObject({ llm: "none" });
    expect(none.find((l) => l.event === "llm.no_provider")).toMatchObject({ level: "warn", notice: UNSET_NOTICE });
    const set = await run({ CORVIDINHO_LLM_MODEL: "ollama:qwen3" });
    expect(set.find((l) => l.event === "daemon.started")).toMatchObject({ llm: "ollama:qwen3 @ 127.0.0.1:11434" });
    expect(set.some((l) => l.event === "llm.no_provider")).toBe(false);
  });

  test("the WATCH poller prints the notice at start (not in a dry run, which calls no model)", async () => {
    const start = async (extra: Record<string, string>) => {
      const allow = join(tmp(), "allowlist.toml");
      writeFileSync(allow, '[github]\nrepos = ["CorvidLabs/Corvidinho"]\n');
      const logs: string[] = [];
      const result: StartWatchResult = await startWatchPoller({
        env: { GITHUB_TOKEN: "fake", CORVIDINHO_WATCH_USERNAME: "corvid-agent", HOME: tmp(), ...extra },
        filePath: allow,
        runLoop: false,
        agent: { async runChat({ sessionId }) { return { ok: true, sessionId, summary: "", exitCode: 0 }; } },
        ackClient: createEchoAckClient(),
        spawnOutcomeStore: createMemorySpawnOutcomeStore(),
        db: memDb(),
        log: (m) => logs.push(m),
        logError: (m) => logs.push(m),
        fetchEvents: async () => [],
      });
      if (!result.ok) throw new Error(result.message);
      await result.stop();
      return logs;
    };
    expect(await start({})).toContain(`[watch] ${UNSET_NOTICE}`);
    expect((await start({ CORVIDINHO_LLM_MODEL: "ollama:qwen3" })).some((l) => l.includes(NO_PROVIDER_NOTICE))).toBe(false);
    expect((await start({ CORVIDINHO_WATCH_DRY_RUN: "1" })).some((l) => l.includes(NO_PROVIDER_NOTICE))).toBe(false);
  });
});

describe("ANTHROPIC_API_KEY is a secret like the other LLM keys (SAFE-6)", () => {
  test("its value is redacted from error lines and operator text", () => {
    const env = { ANTHROPIC_API_KEY: "anthropic-key-without-vendor-shape-123" };
    expect(redactSecretEnvValues("boom anthropic-key-without-vendor-shape-123 end", env)).toBe(
      "boom [redacted:env-secret] end",
    );
    expect(formatErrorLine(new Error("auth anthropic-key-without-vendor-shape-123 rejected"), { env })).not.toContain(
      "anthropic-key-without-vendor-shape-123",
    );
  });
});
