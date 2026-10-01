/**
 * REQ-agent-117 / REQ-agent-118 — a failed `delegate` worker or `council`
 * voice hands its lead one plain failure line, never the model provider's
 * raw error body.
 *
 * Found in #343's review: a failed worker's summary — for a model failure
 * `LLM HTTP <status>: <provider body>`, scrubbed of secrets only — was the
 * lead's tool result (`data.summary` and `error`), and a failed council
 * voice's went into the council transcript. A lead that then succeeded could
 * quote it, so the provider's body (org or account names, request ids, the
 * provider's host) could reach a public reply or a GitHub comment. Now the
 * lead gets `workerFailureLine`: the worker's result `error` as one plain
 * line without the provider's host (`withoutProviderHost`, the helper
 * WATCH's public comment uses), else the no-provider notice, else the exit
 * code. A successful worker's result, a worker that stopped on an ask of its
 * own, the `models` / `stopReason` fields and the SAFE-12/13 fence are
 * unchanged.
 *
 * Fake bins and the real `task run` against the localhost fake provider
 * (tests/fixtures/fake-llm.ts) in mkdtemp dirs; no network, no real key.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resultFrame, serializeFrame } from "../src/agent/events-ndjson.ts";
import { createTaskExecute } from "../src/agent/index.ts";
import { modelCallFailedLine, withoutProviderHost } from "../src/agent/providers.ts";
import type { TaskResult } from "../src/agent/types.ts";
import {
  WORKER_INTERRUPTED_LINE,
  WORKER_TIMED_OUT_LINE,
  workerFailureLine,
} from "../src/autonomous/delegate.ts";
import { createCouncilCommand, createDelegateCommand } from "../plugins/autonomous/index.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry, register } from "../src/plugins/registry.ts";
import type { PluginHandlerArgs } from "../src/plugins/types.ts";
import { watchPublicFailureLine } from "../src/watch/summary.ts";
import { FAKE_LLM_ENV, fakeLlmFetch, startFakeLlm, type FakeReply } from "./fixtures/fake-llm.ts";

const ROOT = join(import.meta.dir, "..");
const CLI = join(ROOT, "src", "cli.ts");
const ENABLED = "[corvidinho.autonomous]\nenabled = true\n";
const ORG = "org-acme-widgets-7731";
const REQUEST_ID = "req_7f3c9a1b2d4e5f60";
const AZURE_HOST = "acme-prod.openai.azure.com:8443";
const TOKEN = "ghp_" + "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
/** What a rate-limited provider answers: an org name, a request id, its own host. */
const providerBody = (host: string) =>
  JSON.stringify({
    error: {
      message: `Rate limit reached for gpt-4o-mini in organization ${ORG} on requests per min (RPM): Limit 3, Used 3, Requested 1. See https://${host}/account/limits.`,
      type: "requests",
      code: "rate_limit_exceeded",
    },
    request_id: REQUEST_ID,
  });
const SHOWN = "The model call failed (429 Too Many Requests)";

/** Nothing of the provider's reply, its host or the raw `LLM HTTP` summary. */
function expectNoProviderDetail(text: string, host: string): void {
  for (const leak of [ORG, REQUEST_ID, host, "LLM HTTP", "Rate limit reached", "rate_limit_exceeded"]) {
    expect(text).not.toContain(leak);
  }
}

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), "corvidinho-worker-failure-"));
  writeFileSync(join(dir, "fledge.toml"), ENABLED);
  return dir;
}

function ctx(over: Partial<PluginHandlerArgs> & { cwd: string }): PluginHandlerArgs {
  return {
    args: ["--task", "summarize the README"],
    json: true,
    nonInteractive: true,
    allowlist: new Set<string>(),
    tier: "code",
    ...over,
  };
}

const BASE_ENV = { PATH: process.env.PATH ?? "" };
/** A worker env with a model configured, so the no-provider notice never applies. */
const MODEL_ENV = { ...BASE_ENV, CORVIDINHO_LLM_MODEL: "ollama:fake-model", OLLAMA_HOST: "127.0.0.1:9" };

/** sh fake `corvidinho`: runs `body` (a result frame, stderr, an exit code). */
function fakeBin(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), "corvidinho-worker-failure-bin-"));
  const bin = join(dir, "corvidinho");
  writeFileSync(bin, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return bin;
}

function frame(result: Partial<TaskResult> & Record<string, unknown>): string {
  const full = {
    summary: "",
    filesChanged: [],
    verified: false,
    verifySkipped: true,
    cancelled: false,
    state: "failed",
    attempts: 1,
    ...result,
  } as TaskResult;
  return `cat <<'EOF'\n${serializeFrame(resultFrame(full))}\nEOF`;
}

describe("workerFailureLine (REQ-agent-117)", () => {
  test("a model-call error loses the provider's host; other reasons stay; the stop lines come first", () => {
    const line = (error: unknown, extra: { timedOut?: boolean; aborted?: boolean } = {}) =>
      workerFailureLine({ exitCode: 1, error, ...extra }, MODEL_ENV, "code");
    expect(line(`The model call failed (429 Too Many Requests from ${AZURE_HOST})`)).toBe(SHOWN);
    expect(line("The model call timed out (gw.internal:443)")).toBe("The model call timed out");
    expect(line("The model call failed (network error reaching 10.0.0.7:11434)")).toBe(
      "The model call failed (network error)",
    );
    const idle = "Stopped: no output for 10 minutes (idle timeout).";
    expect(line(idle)).toBe(idle);
    // SAFE-6: a token in the error never reaches the lead; one line, ≤ 200 chars.
    const scrubbed = line(`The verify lane failed:\n  at x (/home/op/secret/x.ts:1:2)\nfatal: auth ${TOKEN}\n${"x".repeat(400)}`);
    expect(scrubbed).not.toContain(TOKEN);
    expect(scrubbed).not.toContain("\n");
    expect(scrubbed.length).toBeLessThanOrEqual(200);
    expect(line(`The model call failed (429 from ${AZURE_HOST})`, { timedOut: true })).toBe(WORKER_TIMED_OUT_LINE);
    expect(line(undefined, { aborted: true })).toBe(WORKER_INTERRUPTED_LINE);
  });

  test("no error: the no-provider notice for the worker's tier, else the exit code", () => {
    expect(workerFailureLine({ exitCode: 1 }, BASE_ENV, "code")).toStartWith("No model provider is configured");
    expect(workerFailureLine({ exitCode: 1, error: "  " }, MODEL_ENV, "code")).toBe("the worker failed (exit 1)");
    expect(workerFailureLine({ exitCode: 137, error: 42 }, MODEL_ENV, "read")).toBe("the worker failed (exit 137)");
  });

  test("one host-free helper: WATCH's public line is withoutProviderHost", () => {
    const provider = { baseUrl: `https://${AZURE_HOST}/v1`, entry: "openai:gpt-4o-mini" } as const;
    for (const failure of [
      { kind: "http", status: 429 },
      { kind: "timeout" },
      { kind: "network" },
      { kind: "malformed" },
      null,
    ] as const) {
      const full = modelCallFailedLine(failure, provider as never);
      expect(full).toContain(AZURE_HOST);
      expect(withoutProviderHost(full)).not.toContain(AZURE_HOST);
      expect(watchPublicFailureLine(full)).toBe(withoutProviderHost(full));
    }
  });
});

describe("a failed delegate worker hands its lead one plain line (REQ-agent-117, fake bins)", () => {
  test("a model failure: the plain line without the host, never the provider body; models kept", async () => {
    const bin = fakeBin(
      [
        `echo 'LLM HTTP 429: ${providerBody(AZURE_HOST)}' >&2`,
        frame({
          summary: `LLM HTTP 429: ${providerBody(AZURE_HOST)}`,
          error: `The model call failed (429 Too Many Requests from ${AZURE_HOST})`,
          model: "gpt-4o-mini",
        }),
        "exit 1",
      ].join("\n"),
    );
    const r = await createDelegateCommand({ bin, env: MODEL_ENV }).handler(ctx({ cwd: project() }));
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(1);
    expect(r.error).toBe(`worker (tier code, depth 1) did not finish (state failed, exit 1):\n${SHOWN}`);
    expect(r.data).toMatchObject({ state: "failed", exitCode: 1, summary: SHOWN });
    // GITHUB-9: the worker's models still come back to the lead.
    expect((r.data as { models?: string[] }).models).toEqual(["gpt-4o-mini"]);
    expectNoProviderDetail(JSON.stringify(r), AZURE_HOST);
  });

  test("an idle-timed-out worker keeps its stopReason and says so in the line (AGENT-12)", async () => {
    const idle = "Stopped: no output for 10 minutes (idle timeout).";
    const bin = fakeBin(
      [frame({ summary: `partial: ${providerBody(AZURE_HOST)}`, error: idle, stopReason: "idle-timeout" }), "exit 1"].join("\n"),
    );
    const r = await createDelegateCommand({ bin, env: MODEL_ENV }).handler(ctx({ cwd: project() }));
    expect(r.ok).toBe(false);
    expect(r.data).toMatchObject({ state: "failed", summary: idle, stopReason: "idle-timeout" });
    expectNoProviderDetail(JSON.stringify(r), AZURE_HOST);
  });

  test("no result frame: never its stdout or stderr — the no-provider notice, else the exit code", async () => {
    const body = [
      `echo 'LLM HTTP 503: ${providerBody(AZURE_HOST)}'`,
      `echo 'LLM HTTP 503: ${providerBody(AZURE_HOST)}' >&2`,
      "exit 1",
    ].join("\n");
    const withModel = await createDelegateCommand({ bin: fakeBin(body), env: MODEL_ENV }).handler(ctx({ cwd: project() }));
    expect(withModel.data).toMatchObject({ state: "failed", exitCode: 1, summary: "the worker failed (exit 1)" });
    expectNoProviderDetail(JSON.stringify(withModel), AZURE_HOST);

    const noModel = await createDelegateCommand({ bin: fakeBin(body), env: BASE_ENV }).handler(ctx({ cwd: project() }));
    expect((noModel.data as { summary: string }).summary).toStartWith("No model provider is configured");
    expectNoProviderDetail(JSON.stringify(noModel), AZURE_HOST);
  });

  test("a successful worker and one that stopped on an ask of its own are unchanged", async () => {
    const done = fakeBin(frame({ summary: "worker summary", state: "done" }));
    const ok = await createDelegateCommand({ bin: done, env: MODEL_ENV }).handler(ctx({ cwd: project() }));
    expect(ok.ok).toBe(true);
    expect(ok.data).toMatchObject({ state: "done", summary: "worker summary" });
    expect(ok.message).toBe("worker (tier code, depth 1) done:\nworker summary");

    const asked = fakeBin(
      frame({
        summary: "Needs your input: which branch should I use?",
        state: "blocked",
        ask: { reason: "clarify", question: "Which branch should I use?" },
      }),
    );
    const r = await createDelegateCommand({ bin: asked, env: MODEL_ENV }).handler(ctx({ cwd: project() }));
    expect(r.ok).toBe(false);
    expect(r.data).toMatchObject({ state: "blocked", summary: "Needs your input: which branch should I use?" });
  });
});

// ─── the lead's tool loop ──────────────────────────────────────────────────

type ChatBody = { messages: { role: string; content: string | null }[] };

/** The lead: calls `name` once with `argv`, then answers in prose. Returns its request bodies. */
function leadFetch(name: string, argv: string[]): { fetchImpl: ReturnType<typeof fakeLlmFetch>; bodies: ChatBody[] } {
  const bodies: ChatBody[] = [];
  const fetchImpl = fakeLlmFetch((body): FakeReply => {
    const b = body as ChatBody;
    bodies.push(b);
    return b.messages.some((m) => m.role === "tool")
      ? "Synthesized."
      : { toolCalls: [{ name, args: JSON.stringify({ argv }) }] };
  });
  return { fetchImpl, bodies };
}

async function runLead(name: string, argv: string[], cwd: string): Promise<{ toolMessage: string }> {
  const lead = leadFetch(name, argv);
  const exec = createTaskExecute({
    taskText: "work on the README",
    cwd,
    env: { ...FAKE_LLM_ENV, CORVIDINHO_LLM_TIER: "code" },
    loadPlugins: false,
    allowlist: [],
    fetchImpl: lead.fetchImpl,
  });
  const r = await exec({ attempt: 1, signal: new AbortController().signal });
  expect(r.summary).toStartWith("Synthesized.");
  const tool = lead.bodies[1]?.messages.find((m) => m.role === "tool");
  return { toolMessage: String(tool?.content ?? "") };
}

describe("the lead model's tool message (REQ-agent-117)", () => {
  beforeEach(() => clearRegistry());
  afterEach(() => {
    clearRegistry();
    loadBuiltins();
  });

  test("SAFE-12/13: a failed worker that reported an injection is still fenced, the plain line inside", async () => {
    const bin = fakeBin(
      [
        frame({
          summary: `LLM HTTP 429: ${providerBody(AZURE_HOST)}`,
          error: `The model call failed (429 Too Many Requests from ${AZURE_HOST})`,
          injection: { source: "web-fetch", reasons: ["ignore-rules"] },
        }),
        "exit 1",
      ].join("\n"),
    );
    register(createDelegateCommand({ bin, env: MODEL_ENV }));
    const { toolMessage } = await runLead("delegate", ["--task", "read the page"], project());
    expect(toolMessage).toStartWith("[Corvidinho SAFE-13: a web-fetch result inside this delegate run");
    expect(toolMessage).toContain("<<<UNTRUSTED_");
    expect(toolMessage).toContain(SHOWN);
    expectNoProviderDetail(toolMessage, AZURE_HOST);
  });
});

// ─── end to end: real workers, a rate-limited fake provider ───────────────

/** A spawned worker's env: the fake provider, a scratch data dir, nothing of the operator's. */
function workerEnv(llm: { env: Record<string, string> }): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined || k.startsWith("CORVIDINHO_") || k.startsWith("GIT_")) continue;
    env[k] = v;
  }
  const data = mkdtempSync(join(tmpdir(), "corvidinho-worker-failure-data-"));
  mkdirSync(data, { recursive: true });
  return { ...env, ...llm.env, CORVIDINHO_DATA_DIR: data };
}

/** A fake provider that answers 429 (org name, request id, its own host) when `fail(body)`. */
function rateLimitedLlm(fail: (body: string) => boolean, ok: (body: string) => string) {
  let host = "";
  const llm = startFakeLlm({
    reply: (body) => {
      const text = JSON.stringify(body);
      return fail(text)
        ? { httpStatus: 429, body: providerBody(host), headers: { "x-request-id": REQUEST_ID } }
        : ok(text);
    },
  });
  host = llm.env.OLLAMA_HOST!;
  return { llm, host };
}

describe("end to end: a real worker whose model answers 429 (REQ-agent-117/118)", () => {
  beforeEach(() => clearRegistry());
  afterEach(() => {
    clearRegistry();
    loadBuiltins();
  });

  test(
    "delegate: the lead's tool message has the plain line, never the org, request id or host; success unchanged",
    async () => {
      const failing = rateLimitedLlm(
        () => true,
        () => "",
      );
      try {
        register(createDelegateCommand({ bin: CLI, env: workerEnv(failing.llm) }));
        const { toolMessage } = await runLead("delegate", ["--task", "summarize the README"], project());
        expect(failing.llm.requests.length).toBeGreaterThan(0);
        expectNoProviderDetail(toolMessage, failing.host);
        const payload = JSON.parse(toolMessage) as { ok: boolean; error: string; data: Record<string, unknown> };
        expect(payload.ok).toBe(false);
        expect(payload.data).toMatchObject({ state: "failed", exitCode: 1, summary: SHOWN });
        expect(payload.error).toBe(`worker (tier code, depth 1) did not finish (state failed, exit 1):\n${SHOWN}`);
      } finally {
        failing.llm.stop();
      }

      clearRegistry();
      const fine = startFakeLlm();
      try {
        register(createDelegateCommand({ bin: CLI, env: workerEnv(fine) }));
        const { toolMessage } = await runLead("delegate", ["--task", "summarize the README"], project());
        const payload = JSON.parse(toolMessage) as { ok: boolean; message: string; data: Record<string, unknown> };
        expect(payload.ok).toBe(true);
        expect(payload.data).toMatchObject({ state: "done", exitCode: 0, summary: "fake model reply (attempt 1)" });
        expect(payload.message).toBe("worker (tier code, depth 1) done:\nfake model reply (attempt 1)");
      } finally {
        fine.stop();
      }
    },
    120_000,
  );

  test(
    "council: a failed voice's transcript entry is the plain line; the others and the decision are unchanged",
    async () => {
      const header = /\[Council (?:voice (\d+)\/\d+|chair) — phase \d\/3 (\w+)/;
      const { llm, host } = rateLimitedLlm(
        (text) => text.includes("[Council voice 3/3 — phase 1/3 propose"),
        (text) => {
          const m = header.exec(text);
          if (!m) return "unrecognized";
          return m[2] === "decide" ? "DECISION: ship behind a flag" : `${m[2]!.toUpperCase()} from voice ${m[1]}`;
        },
      );
      try {
        const r = await createCouncilCommand({ bin: CLI, env: workerEnv(llm) }).handler(
          ctx({ cwd: project(), args: ["--voices", "3", "--question", "SQLite or flat files?"] }),
        );
        expect(r.ok).toBe(true);
        const data = r.data as { decision: string; transcript: { phase: string; speaker: string; ok: boolean; state: string; exitCode: number; text: string }[] };
        expect(data.decision).toBe("DECISION: ship behind a flag");
        expect(data.transcript.map((e) => [e.phase, e.speaker, e.ok])).toEqual([
          ["propose", "voice 1", true],
          ["propose", "voice 2", true],
          ["propose", "voice 3", false],
          ["critique", "voice 1", true],
          ["critique", "voice 2", true],
          ["decide", "chair", true],
        ]);
        expect(data.transcript[2]).toMatchObject({ state: "failed", exitCode: 1, text: SHOWN });
        expect(data.transcript[0]!.text).toBe("PROPOSE from voice 1");
        expect(data.transcript[3]!.text).toBe("CRITIQUE from voice 1");
        expectNoProviderDetail(JSON.stringify(r), host);
        // No later phase's prompt quotes the failed voice's provider body either.
        for (const req of llm.requests) expectNoProviderDetail(JSON.stringify(req), host);
      } finally {
        llm.stop();
      }
    },
    120_000,
  );
});
