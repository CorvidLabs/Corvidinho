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
