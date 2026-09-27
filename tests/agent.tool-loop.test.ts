import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  createTaskExecute,
  loadLlmEnv,
  parseCapabilityTier,
  tierAllowsPlugin,
  buildOpenAiTools,
  argvFromToolArguments,
  filesChangedFromToolData,
  type AgentEvent,
} from "../src/agent/index.ts";
import { clearRegistry } from "../src/plugins/registry.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { register } from "../src/plugins/registry.ts";
import { runTask } from "../src/agent/loop.ts";

describe("capability tier (AGENT-5)", () => {
  test("parseCapabilityTier", () => {
    expect(parseCapabilityTier("READ")).toBe("read");
    expect(parseCapabilityTier("tool")).toBe("tool");
    expect(parseCapabilityTier("code")).toBe("code");
    expect(parseCapabilityTier("nope", "tool")).toBe("tool");
  });

  test("tierAllowsPlugin: read denies all; tool/code honor minTier", () => {
    expect(tierAllowsPlugin("read", 0)).toBe(false);
    expect(tierAllowsPlugin("tool", 0)).toBe(true);
    expect(tierAllowsPlugin("tool", 1)).toBe(true);
    expect(tierAllowsPlugin("tool", 2)).toBe(false);
    expect(tierAllowsPlugin("code", 2)).toBe(true);
  });

  test("loadLlmEnv includes tier from CORVIDINHO_LLM_TIER", () => {
    const e = loadLlmEnv({
      CORVIDINHO_LLM_API_KEY: "k",
      CORVIDINHO_LLM_TIER: "code",
    });
    expect(e.tier).toBe("code");
    expect(e.apiKey).toBe("k");
  });
});

describe("tools mapping", () => {
  beforeEach(() => {
    clearRegistry();
    loadBuiltins();
  });
  afterEach(() => {
    clearRegistry();
    loadBuiltins();
  });

  test("buildOpenAiTools omits dangerous by default and respects tier", () => {
    const read = buildOpenAiTools({ tier: "read" });
    expect(read).toEqual([]);

    const tool = buildOpenAiTools({ tier: "tool" });
    const names = tool.map((t) => t.function.name);
    expect(names).toContain("specsync-list");
    expect(names).toContain("plugins-list");
    expect(names).not.toContain("danger-ping");
    expect(names).not.toContain("discord-post-message");

    const withDanger = buildOpenAiTools({ tier: "tool", includeDangerous: true });
    expect(withDanger.map((t) => t.function.name)).toContain("danger-ping");
  });

  test("argvFromToolArguments parses argv / aliases", () => {
    expect(argvFromToolArguments('{"argv":["agent"]}')).toEqual(["agent"]);
    expect(argvFromToolArguments('{"module":"cli"}')).toEqual(["cli"]);
    expect(argvFromToolArguments('{"repo":"CorvidLabs/Corvidinho"}')).toEqual([
      "--repo",
      "CorvidLabs/Corvidinho",
    ]);
    expect(argvFromToolArguments("just-a-name")).toEqual(["just-a-name"]);
  });

  test("filesChangedFromToolData", () => {
    expect(filesChangedFromToolData({ filesChanged: ["a.ts", 1, "b.ts"] })).toEqual([
      "a.ts",
      "b.ts",
    ]);
    expect(filesChangedFromToolData(null)).toEqual([]);
  });
});

describe("createTaskExecute tool loop (mock HTTP)", () => {
  beforeEach(() => {
    clearRegistry();
    loadBuiltins();
  });
  afterEach(() => {
    clearRegistry();
    loadBuiltins();
  });

  test("demo path when no API key", async () => {
    const exec = createTaskExecute({ taskText: "x", env: {}, loadPlugins: false });
    // re-load for this isolated call after loadPlugins false — registry may be empty
    loadBuiltins();
    const exec2 = createTaskExecute({ taskText: "x", env: {} });
    const r = await exec2({
      attempt: 1,
      signal: new AbortController().signal,
    });
    expect(r.summary).toBe("demo task attempt 1");
    expect(r.filesChanged).toEqual(["src/cli.ts"]);
  });

  test("tool loop: LLM requests plugins-list then finishes", async () => {
    const bodies: unknown[] = [];
    let call = 0;
    const fetchImpl = async (_input: string | URL | Request, init?: RequestInit) => {
      call += 1;
      bodies.push(JSON.parse(String(init?.body ?? "{}")));
      if (call === 1) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "c1",
                      type: "function",
                      function: {
                        name: "plugins-list",
                        arguments: "{}",
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: "Listed plugins successfully.",
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const events: AgentEvent[] = [];
    const exec = createTaskExecute({
      taskText: "list plugins",
      env: {
        CORVIDINHO_LLM_API_KEY: "secret",
        CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1",
        CORVIDINHO_LLM_MODEL: "test-model",
        CORVIDINHO_LLM_TIER: "tool",
      },
      fetchImpl,
      tier: "tool",
      onEvent: (e) => events.push(e),
      maxToolRounds: 4,
    });

    const result = await exec({
      attempt: 1,
      signal: new AbortController().signal,
    });

    expect(result.summary).toBe("Listed plugins successfully.");
    expect(result.filesChanged).toEqual([]);
    expect(call).toBe(2);
    const firstBody = bodies[0] as { tools?: unknown[] };
    expect(Array.isArray(firstBody.tools)).toBe(true);
    expect((firstBody.tools ?? []).length).toBeGreaterThan(0);

    const toolCalls = events.filter((e) => e.type === "ToolCall");
    const toolResults = events.filter((e) => e.type === "ToolResult");
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]).toMatchObject({ type: "ToolCall", name: "plugins-list" });
    expect(toolResults).toHaveLength(1);
    expect(toolResults[0]).toMatchObject({
      type: "ToolResult",
      name: "plugins-list",
      success: true,
    });
  });

  test("read tier sends no tools", async () => {
    let sawTools: unknown = "unset";
    const fetchImpl = async (_i: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      sawTools = body.tools;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "read-only reply" } }],
        }),
        { status: 200 },
      );
    };
    const exec = createTaskExecute({
      taskText: "summarize",
      env: {
        CORVIDINHO_LLM_API_KEY: "secret",
        CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1",
      },
      fetchImpl,
      tier: "read",
    });
    const r = await exec({
      attempt: 1,
      signal: new AbortController().signal,
    });
    expect(r.summary).toBe("read-only reply");
    expect(sawTools).toBeUndefined();
  });

  test("dangerous tool denied under non-interactive (SAFE-1)", async () => {
    let call = 0;
    const fetchImpl = async () => {
      call += 1;
      if (call === 1) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  tool_calls: [
                    {
                      id: "d1",
                      type: "function",
                      function: { name: "danger-ping", arguments: "{}" },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "Dangerous tool was denied as expected.",
              },
            },
          ],
        }),
        { status: 200 },
      );
    };

    // includeDangerous so the model *can* request it; runtime still denies.
    const events: AgentEvent[] = [];
    const exec = createTaskExecute({
      taskText: "ping danger",
      env: { CORVIDINHO_LLM_API_KEY: "secret", CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1" },
      fetchImpl,
      tier: "tool",
      includeDangerous: true,
      nonInteractive: true,
      allowlist: new Set(),
      onEvent: (e) => events.push(e),
    });
    const r = await exec({
      attempt: 1,
      signal: new AbortController().signal,
    });
    expect(r.summary).toContain("denied as expected");
    const tr = events.find((e) => e.type === "ToolResult");
    expect(tr).toMatchObject({ type: "ToolResult", name: "danger-ping", success: false });
    expect(String((tr as { detail?: string })?.detail ?? "")).toMatch(/Denied/i);
  });

  test("AbortSignal stops between tool rounds (AGENT-3)", async () => {
    const ac = new AbortController();
    let call = 0;
    const fetchImpl = async () => {
      call += 1;
      if (call === 1) {
        // After first response, abort before tool dispatch completes loop
        queueMicrotask(() => ac.abort());
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  tool_calls: [
                    {
                      id: "c1",
                      type: "function",
                      function: { name: "plugins-list", arguments: "{}" },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "should not finish" } }],
        }),
        { status: 200 },
      );
    };

    const exec = createTaskExecute({
      taskText: "abort me",
      env: { CORVIDINHO_LLM_API_KEY: "secret", CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1" },
      fetchImpl,
      tier: "tool",
    });
    const r = await exec({ attempt: 1, signal: ac.signal });
    expect(r.summary.toLowerCase()).toMatch(/abort/);
    expect(call).toBeLessThanOrEqual(2);
  });

  test("tool-reported filesChanged collected for verify gate", async () => {
    clearRegistry();
    register({
      name: "touch-marker",
      description: "test helper that reports filesChanged",
      dangerous: false,
      minTier: 0,
      async handler() {
        return {
          ok: true,
          data: { filesChanged: ["src/agent/execute.ts"] },
          message: "touched",
          exitCode: 0,
        };
      },
    });

    let call = 0;
    const fetchImpl = async () => {
      call += 1;
      if (call === 1) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  tool_calls: [
                    {
                      id: "t1",
                      type: "function",
                      function: { name: "touch-marker", arguments: "{}" },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "edited execute.ts" } }],
        }),
        { status: 200 },
      );
    };

    const exec = createTaskExecute({
      taskText: "touch",
      env: { CORVIDINHO_LLM_API_KEY: "secret", CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1" },
      fetchImpl,
      tier: "tool",
      loadPlugins: false,
    });
    const r = await exec({
      attempt: 1,
      signal: new AbortController().signal,
    });
    expect(r.filesChanged).toEqual(["src/agent/execute.ts"]);
    expect(r.summary).toBe("edited execute.ts");
  });
});

describe("tool loop dispatches only offered tools (SAFE-1 / REQ-agent-128)", () => {
  beforeEach(() => {
    clearRegistry();
    loadBuiltins();
  });

  test("a registered but not-offered dangerous tool is refused, not run", async () => {
    let call = 0;
    const fetchImpl = async () => {
      call += 1;
      const message =
        call === 1
          ? {
              role: "assistant",
              content: null,
              tool_calls: [
                { id: "c1", type: "function", function: { name: "danger-ping", arguments: "{}" } },
              ],
            }
          : { role: "assistant", content: "done" };
      return new Response(JSON.stringify({ choices: [{ message }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const events: AgentEvent[] = [];
    const exec = createTaskExecute({
      taskText: "try a hidden tool",
      env: {
        CORVIDINHO_LLM_API_KEY: "secret",
        CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1",
        CORVIDINHO_LLM_MODEL: "test-model",
      },
      fetchImpl,
      tier: "tool",
      // Interactive + allowlisted would have let runPlugin run it before.
      nonInteractive: false,
      allowlist: ["danger-ping"],
      onEvent: (e) => events.push(e),
      maxToolRounds: 3,
    });
    await exec({ attempt: 1, signal: new AbortController().signal });
    const res = events.find((e) => e.type === "ToolResult") as
      | { success: boolean; detail: string }
      | undefined;
    expect(res?.success).toBe(false);
    expect(res?.detail).toContain("not offered");
  });
});

describe("provider failures are errors, not done (AGENT-4/8, REQ-agent-242)", () => {
  const env = {
    CORVIDINHO_LLM_API_KEY: "secret",
    CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1",
    CORVIDINHO_LLM_MODEL: "test-model",
  };
  const reply = (message: Record<string, unknown>) =>
    new Response(JSON.stringify({ choices: [{ message }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  beforeEach(() => {
    clearRegistry();
  });
  afterEach(() => {
    clearRegistry();
    loadBuiltins();
  });

  test("tool loop: HTTP 503 → error flag; a normal reply has none", async () => {
    let status = 200;
    const fetchImpl = async () =>
      status === 200
        ? reply({ role: "assistant", content: "all good" })
        : new Response("upstream overloaded", { status });
    const exec = createTaskExecute({
      taskText: "x",
      env,
      fetchImpl,
      tier: "tool",
      loadPlugins: false,
      projectInstructions: false,
    });
    const ok = await exec({ attempt: 1, signal: new AbortController().signal });
    expect(ok.summary).toBe("all good");
    expect(ok.error).toBeUndefined();

    status = 503;
    const bad = await exec({ attempt: 1, signal: new AbortController().signal });
    expect(bad.error).toBe(true);
    expect(bad.summary).toContain("LLM HTTP 503");
  });

  test("tool loop: network failure → error flag", async () => {
    const fetchImpl = async (): Promise<Response> => {
      throw new Error("connect ECONNREFUSED");
    };
    const exec = createTaskExecute({
      taskText: "x",
      env,
      fetchImpl,
      tier: "code",
      loadPlugins: false,
      projectInstructions: false,
    });
    const r = await exec({ attempt: 1, signal: new AbortController().signal });
    expect(r.error).toBe(true);
    expect(r.summary).toContain("LLM request failed");
  });

  test("read tier: HTTP 401 → error flag", async () => {
    const fetchImpl = async () => new Response("bad key", { status: 401 });
    const exec = createTaskExecute({
      taskText: "x",
      env,
      fetchImpl,
      tier: "read",
      loadPlugins: false,
      projectInstructions: false,
    });
    const r = await exec({ attempt: 1, signal: new AbortController().signal });
    expect(r.error).toBe(true);
    expect(r.summary).toContain("LLM HTTP 401");
  });

  test("runTask: broken write, failed verify, then 503 on retry → failed (bug agent-loop-2)", async () => {
    register({
      name: "touch-marker",
      description: "test helper that reports filesChanged",
      dangerous: false,
      minTier: 0,
      async handler() {
        return {
          ok: true,
          data: { filesChanged: ["app.ts"] },
          message: "touched",
          exitCode: 0,
        };
      },
    });
    let llmCalls = 0;
    const fetchImpl = async () => {
      llmCalls += 1;
      if (llmCalls === 1) {
        return reply({
          role: "assistant",
          content: null,
          tool_calls: [
            { id: "t1", type: "function", function: { name: "touch-marker", arguments: "{}" } },
          ],
        });
      }
      if (llmCalls === 2) return reply({ role: "assistant", content: "wrote app.ts" });
      return new Response("upstream overloaded", { status: 503 });
    };
    const execute = createTaskExecute({
      taskText: "write app.ts",
      env,
      fetchImpl,
      tier: "code",
      loadPlugins: false,
      projectInstructions: false,
    });
    let verifyRuns = 0;
    const result = await runTask({
      cwd: "/tmp",
      verifyBeforeComplete: true,
      maxRetries: 2,
      verifyRunner: async () => {
        verifyRuns += 1;
        return { success: false, output: "app.ts: syntax error" };
      },
      execute,
    });
    expect(llmCalls).toBe(3);
    expect(verifyRuns).toBe(1);
    expect(result.attempts).toBe(2);
    expect(result.state).toBe("failed");
    expect(result.verified).toBe(false);
    expect(result.filesChanged).toEqual(["app.ts"]);
    expect(result.summary).toContain("LLM HTTP 503");
    expect(result.summary).toContain("Verification failed on an earlier attempt");
    expect(result.summary).toContain("app.ts: syntax error");
  });
});
