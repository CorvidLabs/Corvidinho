import { describe, expect, test } from "bun:test";
import { createTaskExecute, loadLlmEnv } from "../src/agent/execute.ts";

describe("loadLlmEnv", () => {
  test("reads CORVIDINHO_LLM_* and falls back to OPENAI_API_KEY", () => {
    const a = loadLlmEnv({
      CORVIDINHO_LLM_API_KEY: "k1",
      CORVIDINHO_LLM_BASE_URL: "https://example.test/v1/",
      CORVIDINHO_LLM_MODEL: "m1",
    });
    expect(a.apiKey).toBe("k1");
    expect(a.baseUrl).toBe("https://example.test/v1");
    expect(a.model).toBe("m1");

    const b = loadLlmEnv({ OPENAI_API_KEY: "oak" });
    expect(b.apiKey).toBe("oak");
    expect(b.model).toBe("gpt-4o-mini");
  });
});

describe("createTaskExecute", () => {
  test("demo path when no API key", async () => {
    const exec = createTaskExecute({
      taskText: "hello",
      env: {},
    });
    const result = await exec({
      attempt: 2,
      signal: new AbortController().signal,
    });
    expect(result.summary).toBe("demo task attempt 2");
    expect(result.filesChanged).toEqual(["src/cli.ts"]);
  });

  test("LLM path uses fetch when key set", async () => {
    const calls: { url: string; auth?: string }[] = [];
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const headers = init?.headers as Record<string, string> | undefined;
      calls.push({ url, auth: headers?.authorization });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "  llm summary here  " } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const exec = createTaskExecute({
      taskText: "do a thing",
      env: {
        CORVIDINHO_LLM_API_KEY: "secret",
        CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1",
        CORVIDINHO_LLM_MODEL: "test-model",
      },
      fetchImpl,
    });
    const result = await exec({
      attempt: 1,
      signal: new AbortController().signal,
    });
    expect(result.summary).toBe("llm summary here");
    expect(result.filesChanged).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://llm.test/v1/chat/completions");
    expect(calls[0].auth).toBe("Bearer secret");
  });
});

describe("stalled LLM provider (AGENT-3, REQ-agent-244)", () => {
  const env = (baseUrl: string) => ({
    CORVIDINHO_LLM_API_KEY: "secret",
    CORVIDINHO_LLM_BASE_URL: baseUrl,
  });

  /** Never answers: rejects only when its request signal aborts. */
  const stalledFetch = (_input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
        once: true,
      });
    });

  test("headers then a trickle: the request times out instead of hanging", async () => {
    // Sends headers, then one byte every 50ms and never finishes the body.
    const timers = new Set<ReturnType<typeof setInterval>>();
    const server = Bun.serve({
      port: 0,
      fetch() {
        let timer: ReturnType<typeof setInterval> | undefined;
        const body = new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode("{"));
            timer = setInterval(() => c.enqueue(new TextEncoder().encode(" ")), 50);
            timers.add(timer);
          },
          cancel() {
            if (timer) clearInterval(timer);
          },
        });
        return new Response(body, { headers: { "content-type": "application/json" } });
      },
    });
    try {
      const exec = createTaskExecute({
        taskText: "stall",
        env: env(`http://127.0.0.1:${server.port}/v1`),
        tier: "read",
        loadPlugins: false,
        projectInstructions: false,
        llmTimeoutMs: 300,
      });
      const t0 = Date.now();
      const result = await exec({ attempt: 1, signal: new AbortController().signal });
      expect(result.summary).toBe("LLM request timed out after 300ms");
      expect(result.filesChanged).toEqual([]);
      expect(Date.now() - t0).toBeLessThan(3_000);
    } finally {
      for (const t of timers) clearInterval(t);
      server.stop(true);
    }
  });

  test("no response at all: the tool loop's request times out too", async () => {
    let calls = 0;
    const exec = createTaskExecute({
      taskText: "stall",
      env: env("https://llm.test/v1"),
      tier: "tool",
      fetchImpl: (input, init) => {
        calls += 1;
        return stalledFetch(input, init);
      },
      loadPlugins: false,
      projectInstructions: false,
      llmTimeoutMs: 200,
    });
    const result = await exec({ attempt: 1, signal: new AbortController().signal });
    expect(result.summary).toBe("LLM request timed out after 200ms");
    expect(calls).toBe(1);
  });

  test("a caller abort still stops the request and is not reported as a timeout", async () => {
    const ac = new AbortController();
    const exec = createTaskExecute({
      taskText: "stall",
      env: env("https://llm.test/v1"),
      tier: "read",
      fetchImpl: stalledFetch,
      loadPlugins: false,
      projectInstructions: false,
      llmTimeoutMs: 60_000,
    });
    setTimeout(() => ac.abort(), 50);
    const t0 = Date.now();
    const result = await exec({ attempt: 1, signal: ac.signal });
    expect(Date.now() - t0).toBeLessThan(3_000);
    expect(result.summary).toStartWith("LLM request failed:");
    expect(result.summary).not.toContain("timed out");
  });
});
