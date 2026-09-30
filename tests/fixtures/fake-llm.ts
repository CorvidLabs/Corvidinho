/**
 * A fake model provider for tests (AGENT-13: there is no built-in default
 * model and no stub, so a test that runs `task run` configures one).
 *
 * - {@link startFakeLlm}: a localhost OpenAI-compatible chat server for a
 *   spawned CLI, configured as a keyless `ollama:` model (`OLLAMA_HOST`), so
 *   no key is needed and nothing leaves the box.
 * - {@link fakeLlmFetch}: the same replies as an injected `fetchImpl` for
 *   in-process `createTaskExecute` tests, with {@link FAKE_LLM_ENV}.
 *
 * Every reply is a plain assistant message with no tool calls, so a run
 * changes nothing (like the removed demo stub, it claims no files), unless a
 * test's `reply` returns {@link FakeToolCalls}.
 */

import { afterAll, beforeAll } from "bun:test";

/** The reply text; `attempt` is read from the run's "Attempt N." prompt line. */
export function fakeReplyText(attempt: number): string {
  return `fake model reply (attempt ${attempt})`;
}

/** A scripted reply that calls tools, with optional text beside them (AGENT-17 tests). */
export type FakeToolCalls = { toolCalls: { name: string; args?: string }[]; text?: string };

/** What a test's `reply` returns: the reply text, or tool calls. */
export type FakeReply = string | FakeToolCalls;

/** The attempt number in a chat request's user message, else 1. */
function attemptOf(body: unknown): number {
  const messages = (body as { messages?: { role?: string; content?: unknown }[] } | null)?.messages;
  for (const m of messages ?? []) {
    if (m?.role !== "user") continue;
    const text =
      typeof m.content === "string"
        ? m.content
        : Array.isArray(m.content)
          ? m.content.map((p) => (p as { text?: string })?.text ?? "").join("")
          : "";
    const hit = /\bAttempt (\d+)\./.exec(text);
    if (hit) return Number(hit[1]);
  }
  return 1;
}

function completion(body: unknown, reply?: (body: unknown) => FakeReply): Response {
  const out = reply ? reply(body) : fakeReplyText(attemptOf(body));
  const message =
    typeof out === "string"
      ? { role: "assistant", content: out }
      : {
          role: "assistant",
          content: out.text ?? null,
          tool_calls: out.toolCalls.map((c, i) => ({
            id: `fake_${i}`,
            type: "function",
            function: { name: c.name, arguments: c.args ?? "{}" },
          })),
        };
  return new Response(
    JSON.stringify({ choices: [{ message }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

/** Env for an in-process run with {@link fakeLlmFetch} (never a real endpoint). */
export const FAKE_LLM_ENV: Readonly<Record<string, string>> = {
  CORVIDINHO_LLM_MODEL: "fake-model",
  CORVIDINHO_LLM_API_KEY: "fake-key-not-real",
  CORVIDINHO_LLM_BASE_URL: "http://fake-llm.invalid/v1",
};

/** An injected fetch that answers every chat request like {@link startFakeLlm}. */
export function fakeLlmFetch(
  reply?: (body: unknown) => FakeReply,
): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async (_input, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    return completion(body, reply);
  };
}

export type FakeLlm = {
  /** Env for a spawned `task run`: a keyless `ollama:` model at this server. */
  env: Record<string, string>;
  /** Parsed request bodies, in order. */
  requests: unknown[];
  /** Each request's `authorization` header (null when none was sent). */
  auth: (string | null)[];
  stop(): void;
};

/**
 * Start the localhost fake provider; call `stop()` when done. `model` is the
 * model id it is configured as (default `fake-model`, which has no known
 * price; pass a priced id for a run under a SAFE-8 cap).
 */
export function startFakeLlm(
  opts: { reply?: (body: unknown) => FakeReply; model?: string } = {},
): FakeLlm {
  const requests: unknown[] = [];
  const auth: (string | null)[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (req.method !== "POST" || url.pathname !== "/v1/chat/completions") {
        return new Response("not found", { status: 404 });
      }
      const body = await req.json().catch(() => null);
      requests.push(body);
      auth.push(req.headers.get("authorization"));
      return completion(body, opts.reply);
    },
  });
  return {
    env: {
      CORVIDINHO_LLM_MODEL: `ollama:${opts.model ?? "fake-model"}`,
      OLLAMA_HOST: `127.0.0.1:${server.port}`,
    },
    requests,
    auth,
    stop: () => server.stop(true),
  };
}

/**
 * For a test file whose bridge runs use a stub agent (no model is called)
 * but whose footer / status assertions read the configured model: set
 * `CORVIDINHO_LLM_MODEL` in `process.env` for the file (default a priced id,
 * so owner-run cost lines stay priced) and restore it after. The preload
 * clears the operator's model config (AGENT-13: no built-in default).
 */
export function useConfiguredModel(model = "gpt-4o-mini"): void {
  let prev: string | undefined;
  beforeAll(() => {
    prev = process.env.CORVIDINHO_LLM_MODEL;
    process.env.CORVIDINHO_LLM_MODEL = model;
  });
  afterAll(() => {
    if (prev === undefined) delete process.env.CORVIDINHO_LLM_MODEL;
    else process.env.CORVIDINHO_LLM_MODEL = prev;
  });
}
