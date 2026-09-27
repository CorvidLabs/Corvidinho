import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
import { createNdjsonWriter } from "../src/agent/events-ndjson.ts";

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

describe("runTask: a real code-tier shell-exec edit reaches the verify gate (AGENT-4, REQ-agent-085)", () => {
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
  let dir = "";

  function g(cwd: string, ...args: string[]): void {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined && !k.startsWith("GIT_")) clean[k] = v;
    }
    const r = Bun.spawnSync(["git", ...args], { cwd, env: clean, stdout: "pipe", stderr: "pipe" });
    if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString()}`);
  }

  beforeEach(() => {
    clearRegistry();
    loadBuiltins();
    dir = mkdtempSync(join(tmpdir(), "corvidinho-shell-diff-"));
    g(dir, "init", "-q", "-b", "main");
    g(dir, "config", "user.name", "Fixture Bot");
    g(dir, "config", "user.email", "fixture@example.invalid");
    g(dir, "config", "commit.gpgsign", "false");
    writeFileSync(join(dir, "app.ts"), "export const x = 1;\n");
    g(dir, "add", "app.ts");
    g(dir, "commit", "-q", "-m", "init");
  });
  afterEach(() => {
    clearRegistry();
    loadBuiltins();
    rmSync(dir, { recursive: true, force: true });
  });

  test("shell-exec `printf broken > app.ts` reports no filesChanged, yet verify runs and the run is never done", async () => {
    let llmCalls = 0;
    const fetchImpl = async () => {
      llmCalls += 1;
      if (llmCalls === 1) {
        return reply({
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "s1",
              type: "function",
              function: {
                name: "shell-exec",
                arguments: JSON.stringify({ argv: ["--command", "printf broken > app.ts"] }),
              },
            },
          ],
        });
      }
      return reply({ role: "assistant", content: "wrote app.ts" });
    };
    const events: AgentEvent[] = [];
    const execute = createTaskExecute({
      taskText: "write app.ts",
      cwd: dir,
      env,
      fetchImpl,
      tier: "code",
      includeDangerous: true,
      nonInteractive: true,
      allowlist: ["shell-exec"],
      loadPlugins: false,
      projectInstructions: false,
      autonomous: false,
      onEvent: (e) => events.push(e),
    });
    const verifyCwds: string[] = [];
    const result = await runTask({
      cwd: dir,
      verifyBeforeComplete: true,
      maxRetries: 0,
      onEvent: (e) => events.push(e),
      verifyRunner: async (cwd) => {
        verifyCwds.push(cwd);
        return { success: false, output: "app.ts: syntax error" };
      },
      execute,
    });
    const toolResult = events.find(
      (e): e is Extract<AgentEvent, { type: "ToolResult" }> =>
        e.type === "ToolResult" && e.name === "shell-exec",
    );
    expect(toolResult?.success).toBe(true);
    expect(readFileSync(join(dir, "app.ts"), "utf8")).toBe("broken");
    expect(llmCalls).toBe(2);
    expect(verifyCwds).toEqual([dir]);
    expect(result.state).toBe("failed");
    expect(result.verified).toBe(false);
    expect(result.verifySkipped).toBe(false);
    expect(result.filesChanged).toEqual(["app.ts"]);
    expect(result.summary).toContain("app.ts: syntax error");
    expect(events.some((e) => e.type === "StateChanged" && e.state === "done")).toBe(false);
  });
});

describe("files-read images reach the model as image parts (DISCORD-9 / REQ-agent-428)", () => {
  /** A real 1x1 PNG. */
  const PNG_B64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const DATA_URL = `data:image/png;base64,${PNG_B64}`;
  const env = {
    CORVIDINHO_LLM_API_KEY: "secret",
    CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1",
    CORVIDINHO_LLM_MODEL: "test-model",
  };
  type Msg = { role: string; content: unknown; tool_call_id?: string };
  const readCall = (id: string, path: string) => ({
    role: "assistant",
    content: null,
    tool_calls: [
      {
        id,
        type: "function",
        function: { name: "files-read", arguments: JSON.stringify({ argv: [path] }) },
      },
    ],
  });
  const ok = (message: Record<string, unknown>) =>
    new Response(JSON.stringify({ choices: [{ message }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  let dir = "";
  beforeEach(() => {
    clearRegistry();
    loadBuiltins();
    dir = mkdtempSync(join(tmpdir(), "corvidinho-loop-img-"));
    writeFileSync(join(dir, "shot.png"), Buffer.from(PNG_B64, "base64"));
    writeFileSync(join(dir, "second.png"), Buffer.from(PNG_B64, "base64"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** Script the provider: `reply(n, body)` answers request n (1-based). */
  function run(reply: (n: number, body: { messages: Msg[] }) => Response) {
    const bodies: { messages: Msg[] }[] = [];
    const events: AgentEvent[] = [];
    const fetchImpl = async (_i: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      bodies.push(body);
      return reply(bodies.length, body);
    };
    const exec = createTaskExecute({
      taskText: "what is in shot.png?",
      env,
      cwd: dir,
      fetchImpl,
      tier: "tool",
      projectInstructions: false,
      onEvent: (e) => events.push(e),
      maxToolRounds: 4,
    });
    return {
      bodies,
      events,
      result: exec({ attempt: 1, signal: new AbortController().signal }),
    };
  }
  const hasImagePart = (body: { messages: Msg[] }) =>
    body.messages.some(
      (m) => Array.isArray(m.content) && m.content.some((p) => p?.type === "image_url"),
    );

  test("files-read of an image sends an image_url part on the next request", async () => {
    const r = run((n) =>
      n === 1 ? ok(readCall("c1", "shot.png")) : ok({ role: "assistant", content: "a red pixel" }),
    );
    const result = await r.result;
    expect(result.summary).toBe("a red pixel");
    expect(result.error).toBeUndefined();
    expect(r.bodies).toHaveLength(2);
    expect(hasImagePart(r.bodies[0]!)).toBe(false);

    const msgs = r.bodies[1]!.messages;
    const toolIdx = msgs.findIndex((m) => m.role === "tool" && m.tool_call_id === "c1");
    expect(toolIdx).toBeGreaterThan(0);
    expect(msgs[toolIdx - 1]!.role).toBe("assistant");
    // The tool message is small metadata: no base64, no decode garbage.
    const toolText = String(msgs[toolIdx]!.content);
    expect(toolText).not.toContain(PNG_B64);
    expect(toolText).not.toContain("\uFFFD");
    expect(toolText.length).toBeLessThan(1024);
    expect(JSON.parse(toolText).data).toMatchObject({ mediaType: "image/png", image: true });

    // Right after the round's tool messages: one user message with the pixels.
    const user = msgs[toolIdx + 1]!;
    expect(user.role).toBe("user");
    expect(user.content).toEqual([
      { type: "text", text: "Image(s) opened with files-read: shot.png" },
      { type: "image_url", image_url: { url: DATA_URL } },
    ]);
    expect(msgs).toHaveLength(toolIdx + 2);
  });

  test("two images in one round ride one user message after both tool messages", async () => {
    const r = run((n) =>
      n === 1
        ? ok({
            role: "assistant",
            content: null,
            tool_calls: [
              ...readCall("c1", "shot.png").tool_calls,
              ...readCall("c2", "second.png").tool_calls,
            ],
          })
        : ok({ role: "assistant", content: "two pixels" }),
    );
    await r.result;
    const msgs = r.bodies[1]!.messages;
    const roles = msgs.slice(-4).map((m) => m.role);
    expect(roles).toEqual(["assistant", "tool", "tool", "user"]);
    const parts = msgs.at(-1)!.content as { type: string }[];
    expect(parts.map((p) => p.type)).toEqual(["text", "image_url", "image_url"]);
  });

  test("ToolResult event detail and ndjson never carry image base64", async () => {
    const r = run((n) =>
      n === 1 ? ok(readCall("c1", "shot.png")) : ok({ role: "assistant", content: "seen" }),
    );
    await r.result;
    const res = r.events.find((e) => e.type === "ToolResult") as
      | { name: string; success: boolean; detail: string }
      | undefined;
    expect(res).toMatchObject({ name: "files-read", success: true });
    expect(res!.detail).toContain("image/png");
    const lines: string[] = [];
    const nd = createNdjsonWriter((l) => lines.push(l));
    for (const e of r.events) nd.event(e);
    const everything = JSON.stringify(r.events) + lines.join("\n");
    expect(everything).not.toContain(PNG_B64);
    expect(everything).not.toContain(PNG_B64.slice(0, 24));
  });

  /** The retried request's tool message for `id`, parsed. */
  const toolPayload = (body: { messages: Msg[] }, id: string) =>
    JSON.parse(String(body.messages.find((m) => m.role === "tool" && m.tool_call_id === id)!.content));
  /** True when some user message comes right after a tool message. */
  const userAfterTool = (body: { messages: Msg[] }) =>
    body.messages.some((m, i) => m.role === "user" && body.messages[i - 1]?.role === "tool");

  test("HTTP 400 on the image round retries once with a text note and completes", async () => {
    const r = run((n, body) =>
      n === 1
        ? ok(readCall("c1", "shot.png"))
        : hasImagePart(body)
          ? new Response('{"error":"image input is not supported by this model"}', { status: 400 })
          : ok({ role: "assistant", content: "cannot see it, sorry" }),
    );
    const result = await r.result;
    expect(result.error).toBeUndefined();
    expect(result.summary).toBe("cannot see it, sorry");
    expect(r.bodies).toHaveLength(3);
    expect(hasImagePart(r.bodies[1]!)).toBe(true);
    expect(hasImagePart(r.bodies[2]!)).toBe(false);
    // The retry has the shape of a run without images: the note sits in the
    // image's tool message and no user message follows the tool messages.
    const retry = r.bodies[2]!.messages;
    expect(retry.slice(-2).map((m) => m.role)).toEqual(["assistant", "tool"]);
    expect(userAfterTool(r.bodies[2]!)).toBe(false);
    const payload = toolPayload(r.bodies[2]!, "c1");
    expect(payload.message).toBe("[image shot.png could not be shown to this model]");
    expect(payload.data).toMatchObject({ path: "shot.png", mediaType: "image/png", image: true });
    expect(JSON.stringify(r.bodies[2])).not.toContain(PNG_B64);
    const texts = r.events.filter((e) => e.type === "Text").map((e) => (e as { text: string }).text);
    expect(texts).toContain(
      "[operator] the model refused image input (HTTP 400); retried once with a text note",
    );
  });

  test("a provider that rejects a user turn right after tool results still completes", async () => {
    // Some OpenAI-compatible APIs (e.g. Mistral) 400 on role order, not on images.
    const r = run((n, body) =>
      n === 1
        ? ok(readCall("c1", "shot.png"))
        : userAfterTool(body)
          ? new Response("Unexpected role 'user' after role 'tool'", { status: 400 })
          : ok({ role: "assistant", content: "answered without the picture" }),
    );
    const result = await r.result;
    expect(result.error).toBeUndefined();
    expect(result.summary).toBe("answered without the picture");
    expect(r.bodies).toHaveLength(3);
    expect(userAfterTool(r.bodies[2]!)).toBe(false);
  });

  test("404 / 413 / 415 / 422 on the image request also fall back; 401 / 429 / 500 do not", async () => {
    for (const status of [404, 413, 415, 422]) {
      const r = run((n, body) =>
        n === 1
          ? ok(readCall("c1", "shot.png"))
          : hasImagePart(body)
            ? new Response("No endpoints found that support image input", { status })
            : ok({ role: "assistant", content: `fell back after ${status}` }),
      );
      const result = await r.result;
      expect(result.error).toBeUndefined();
      expect(result.summary).toBe(`fell back after ${status}`);
      expect(r.bodies).toHaveLength(3);
      expect(hasImagePart(r.bodies[2]!)).toBe(false);
    }
    for (const status of [401, 429, 500]) {
      const r = run((n) =>
        n === 1 ? ok(readCall("c1", "shot.png")) : new Response("nope", { status }),
      );
      const result = await r.result;
      expect(result.error).toBe(true);
      expect(result.summary).toContain(`LLM HTTP ${status}`);
      expect(r.bodies).toHaveLength(2);
    }
  });

  test("a refusal takes out the images of earlier rounds too", async () => {
    const r = run((n, body) => {
      if (n === 1) return ok(readCall("c1", "shot.png"));
      if (n === 2) return ok(readCall("c2", "second.png"));
      if (hasImagePart(body)) return new Response("too many images", { status: 413 });
      return ok({ role: "assistant", content: "two notes" });
    });
    const result = await r.result;
    expect(result.summary).toBe("two notes");
    // 1: read shot, 2: image ok + read second, 3: 413 with both, 4: retry
    expect(r.bodies).toHaveLength(4);
    const parts = r.bodies[2]!.messages.filter((m) => Array.isArray(m.content));
    expect(parts).toHaveLength(2);
    const retry = r.bodies[3]!;
    expect(hasImagePart(retry)).toBe(false);
    expect(retry.messages.some((m) => m.role === "user" && Array.isArray(m.content))).toBe(false);
    expect(userAfterTool(retry)).toBe(false);
    expect(toolPayload(retry, "c1").message).toBe("[image shot.png could not be shown to this model]");
    expect(toolPayload(retry, "c2").message).toBe("[image second.png could not be shown to this model]");
    expect(JSON.stringify(retry)).not.toContain(PNG_B64);
  });

  test("after one refusal, a later image goes as a text note with no second retry", async () => {
    const r = run((n, body) => {
      if (hasImagePart(body)) {
        return new Response("no images here", { status: 400 });
      }
      if (n === 1) return ok(readCall("c1", "shot.png"));
      if (n === 3) return ok(readCall("c2", "second.png"));
      return ok({ role: "assistant", content: "done without eyes" });
    });
    const result = await r.result;
    expect(result.summary).toBe("done without eyes");
    // 1: read shot, 2: 400 with image, 3: retry with note, 4: note for second.png
    expect(r.bodies).toHaveLength(4);
    expect(hasImagePart(r.bodies[3]!)).toBe(false);
    const last = r.bodies[3]!.messages.at(-1)!;
    expect(last).toMatchObject({ role: "tool", tool_call_id: "c2" });
    expect(toolPayload(r.bodies[3]!, "c2").message).toBe(
      "[image second.png could not be shown to this model]",
    );
    expect(userAfterTool(r.bodies[3]!)).toBe(false);
  });

  test("a 400 on the text retry, or with no image sent, is still an error", async () => {
    const always400 = run((n) =>
      n === 1 ? ok(readCall("c1", "shot.png")) : new Response("bad request", { status: 400 }),
    );
    const a = await always400.result;
    expect(a.error).toBe(true);
    expect(a.summary).toContain("LLM HTTP 400");
    expect(always400.bodies).toHaveLength(3);

    const noImage = run(() => new Response("bad request", { status: 400 }));
    const b = await noImage.result;
    expect(b.error).toBe(true);
    expect(noImage.bodies).toHaveLength(1);
  });
});
