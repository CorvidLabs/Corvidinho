/**
 * REQ-agent-044 — AUTONOMY-1/2 (#44): ask-human tool ends the run blocked
 * with a question (never "done"); verify exhaustion stays failed with a
 * stuck ask. Mock HTTP / injected execute only — no network, no real keys.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  ASK_AGENT_SYSTEM_INSTRUCTIONS,
  ASK_QUESTION_MAX,
  ASK_TOOL_NAME,
  askFromToolArguments,
  askFromUnknown,
  buildOpenAiTools,
  createTaskExecute,
  formatAskSummary,
  frameFromEvent,
  parseNdjsonLine,
  progressFromFrame,
  resultFrame,
  runTask,
  serializeFrame,
  stuckAfterVerifyAsk,
  withAskTool,
  type AgentEvent,
  type TaskResult,
} from "../src/agent/index.ts";
import { clearRegistry, register } from "../src/plugins/registry.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";

const LLM_ENV = {
  CORVIDINHO_LLM_API_KEY: "test-key-not-real",
  CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1",
  CORVIDINHO_LLM_MODEL: "test-model",
  CORVIDINHO_LLM_TIER: "tool",
};

type Msg = {
  role: string;
  content: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
};

function reply(message: Msg): Response {
  return new Response(JSON.stringify({ choices: [{ message }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function toolCall(name: string, args: string, id = "c1"): Msg {
  return {
    role: "assistant",
    content: null,
    tool_calls: [{ id, type: "function", function: { name, arguments: args } }],
  };
}

describe("ask-human tool arguments (AUTONOMY-1)", () => {
  test("question field, argv array, bare string", () => {
    expect(askFromToolArguments('{"question":"Which DB?"}')).toEqual({
      ok: true,
      ask: { reason: "clarify", question: "Which DB?" },
    });
    expect(askFromToolArguments('{"argv":["Which","DB?"]}')).toMatchObject({
      ok: true,
      ask: { question: "Which DB?" },
    });
    expect(askFromToolArguments("Which DB?")).toMatchObject({
      ok: true,
      ask: { question: "Which DB?" },
    });
  });

  test("empty question is refused back to the model", () => {
    for (const raw of ['{"question":"   "}', "{}", "", undefined, '{"question":42}']) {
      const r = askFromToolArguments(raw);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.refusal.ok).toBe(false);
        expect(r.refusal.error).toContain("non-empty");
      }
    }
  });

  test("question is trimmed, control chars dropped, and capped", () => {
    const r = askFromToolArguments(JSON.stringify({ question: `  a\u0007b\n\n\n\nc  ` }));
    expect(r).toMatchObject({ ok: true, ask: { question: "ab\n\nc" } });
    const long = askFromToolArguments(JSON.stringify({ question: "x".repeat(5000) }));
    expect(long.ok).toBe(true);
    if (long.ok) {
      expect(long.ask.question.length).toBe(ASK_QUESTION_MAX);
      expect(long.ask.question.endsWith("…")).toBe(true);
    }
  });

  test("askFromUnknown validates result-frame shape", () => {
    expect(askFromUnknown({ reason: "stuck", question: " q " })).toEqual({
      reason: "stuck",
      question: "q",
    });
    expect(askFromUnknown({ reason: "other", question: "q" })).toBeUndefined();
    expect(askFromUnknown({ reason: "clarify", question: "" })).toBeUndefined();
    expect(askFromUnknown("clarify")).toBeUndefined();
    expect(askFromUnknown(null)).toBeUndefined();
  });
});

describe("ask-human in the tool catalog", () => {
  beforeEach(() => {
    clearRegistry();
    loadBuiltins();
  });
  afterEach(() => {
    clearRegistry();
    loadBuiltins();
  });

  test("withAskTool appends ask-human once, dropping a same-named plugin", () => {
    register({
      name: ASK_TOOL_NAME,
      description: "shadow",
      handler: async () => ({ ok: true }),
    });
    const tools = withAskTool(buildOpenAiTools({ tier: "tool" }));
    const asks = tools.filter((t) => t.function.name === ASK_TOOL_NAME);
    expect(asks).toHaveLength(1);
    expect(asks[0]!.function.description).not.toBe("shadow");
    expect(tools[tools.length - 1]!.function.name).toBe(ASK_TOOL_NAME);
  });

  test("tool loop: ask-human ends the run with the question, no plugin runs", async () => {
    const bodies: Array<{ tools?: Array<{ function: { name: string } }>; messages: Msg[] }> = [];
    let calls = 0;
    const fetchImpl = async (_i: string | URL | Request, init?: RequestInit) => {
      calls += 1;
      bodies.push(JSON.parse(String(init?.body ?? "{}")));
      return reply(toolCall(ASK_TOOL_NAME, JSON.stringify({ question: "Postgres or SQLite?" })));
    };
    const events: AgentEvent[] = [];
    const exec = createTaskExecute({
      taskText: "add storage",
      env: LLM_ENV,
      fetchImpl,
      tier: "tool",
      onEvent: (e) => events.push(e),
    });
    const r = await exec({ attempt: 1, signal: new AbortController().signal });

    expect(calls).toBe(1);
    expect(r.ask).toEqual({ reason: "clarify", question: "Postgres or SQLite?" });
    expect(r.summary).toBe("Needs your input: Postgres or SQLite?");
    expect(r.filesChanged).toEqual([]);
    const names = (bodies[0]!.tools ?? []).map((t) => t.function.name);
    expect(names).toContain(ASK_TOOL_NAME);
    expect(bodies[0]!.messages[0]!.content).toContain(ASK_AGENT_SYSTEM_INSTRUCTIONS.trim());
    expect(bodies[0]!.messages[0]!.content).toContain("AUTONOMY-7");
    expect(events.filter((e) => e.type === "ToolCall")).toEqual([
      { type: "ToolCall", name: ASK_TOOL_NAME, args: '{"question":"Postgres or SQLite?"}' },
    ]);
    expect(events.find((e) => e.type === "ToolResult")).toMatchObject({
      name: ASK_TOOL_NAME,
      success: true,
    });
  });

  test("tool loop: empty ask is refused to the model and the loop continues", async () => {
    let calls = 0;
    const toolMsgs: string[] = [];
    const fetchImpl = async (_i: string | URL | Request, init?: RequestInit) => {
      calls += 1;
      const body = JSON.parse(String(init?.body ?? "{}")) as { messages: Msg[] };
      for (const m of body.messages) if (m.role === "tool") toolMsgs.push(String(m.content));
      if (calls === 1) return reply(toolCall(ASK_TOOL_NAME, '{"question":""}'));
      return reply({ role: "assistant", content: "Picked SQLite per spec." });
    };
    const exec = createTaskExecute({ taskText: "t", env: LLM_ENV, fetchImpl, tier: "tool" });
    const r = await exec({ attempt: 1, signal: new AbortController().signal });
    expect(calls).toBe(2);
    expect(r.ask).toBeUndefined();
    expect(r.summary).toBe("Picked SQLite per spec.");
    expect(toolMsgs.some((c) => c.includes("non-empty"))).toBe(true);
  });

  test("read tier sends no tools (no ask-human either)", async () => {
    let sawTools: unknown = "unset";
    const fetchImpl = async (_i: string | URL | Request, init?: RequestInit) => {
      sawTools = JSON.parse(String(init?.body ?? "{}")).tools;
      return reply({ role: "assistant", content: "ok" });
    };
    const exec = createTaskExecute({ taskText: "t", env: LLM_ENV, fetchImpl, tier: "read" });
    await exec({ attempt: 1, signal: new AbortController().signal });
    expect(sawTools).toBeUndefined();
  });
});

describe("runTask with an ask (AUTONOMY-1 / AUTONOMY-2 / AGENT-4)", () => {
  test("clarify ask → state blocked, verify skipped, never done", async () => {
    const events: AgentEvent[] = [];
    let verifyCalls = 0;
    const ask = { reason: "clarify" as const, question: "Which repo?" };
    const result = await runTask({
      cwd: process.cwd(),
      verifyBeforeComplete: true,
      maxRetries: 2,
      onEvent: (e) => events.push(e),
      verifyRunner: async () => {
        verifyCalls += 1;
        return { success: true, output: "" };
      },
      execute: async () => ({
        summary: formatAskSummary(ask),
        filesChanged: ["src/x.ts"],
        ask,
      }),
    });
    expect(result.state).toBe("blocked");
    expect(result.ask).toEqual(ask);
    expect(result.verified).toBe(false);
    expect(result.verifySkipped).toBe(true);
    expect(result.cancelled).toBe(false);
    expect(result.summary).toBe("Needs your input: Which repo?");
    expect(verifyCalls).toBe(0);
    const states = events
      .filter((e): e is Extract<AgentEvent, { type: "StateChanged" }> => e.type === "StateChanged")
      .map((e) => e.state);
    expect(states).toContain("blocked");
    expect(states).not.toContain("done");
  });

  test("verify retries exhausted → failed (AGENT-4) plus a stuck ask", async () => {
    const result = await runTask({
      cwd: process.cwd(),
      verifyBeforeComplete: true,
      maxRetries: 1,
      verifyRunner: async () => ({ success: false, output: "lint broke" }),
      execute: async ({ attempt }) => ({ summary: `try ${attempt}`, filesChanged: ["a.ts"] }),
    });
    expect(result.state).toBe("failed");
    expect(result.summary).toContain("Verification failed after 1 retries");
    expect(result.ask).toEqual(stuckAfterVerifyAsk(1));
    expect(result.ask?.reason).toBe("stuck");
    expect(result.summary.endsWith(formatAskSummary(stuckAfterVerifyAsk(1)))).toBe(true);
  });

  test("a done run carries no ask", async () => {
    const result = await runTask({
      cwd: process.cwd(),
      verifyBeforeComplete: false,
      execute: async () => ({ summary: "fine", filesChanged: [] }),
    });
    expect(result.state).toBe("done");
    expect("ask" in result).toBe(false);
  });
});

describe("NDJSON carries blocked + ask (additive, protocol unchanged)", () => {
  test("StateChanged blocked round-trips and maps to a status line", () => {
    const line = serializeFrame(frameFromEvent({ type: "StateChanged", state: "blocked" }));
    const frame = parseNdjsonLine(line);
    expect(frame).toMatchObject({ type: "StateChanged", state: "blocked" });
    expect(progressFromFrame(frame!)).toMatchObject({ state: "blocked", message: "needs input" });
  });

  test("result frame keeps the ask", () => {
    const r: TaskResult = {
      summary: "Needs your input: Which repo?",
      filesChanged: [],
      verified: false,
      verifySkipped: true,
      cancelled: false,
      state: "blocked",
      attempts: 1,
      ask: { reason: "clarify", question: "Which repo?" },
    };
    const frame = parseNdjsonLine(serializeFrame(resultFrame(r)));
    expect(frame?.type).toBe("result");
    if (frame?.type === "result") {
      expect(askFromUnknown(frame.result.ask)).toEqual(r.ask);
    }
  });
});

describe("task run CLI surfaces the question (localhost mock LLM)", () => {
  const root = import.meta.dir + "/..";

  async function runCli(output: "json" | "text") {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () =>
        reply(toolCall(ASK_TOOL_NAME, JSON.stringify({ question: "Which repo should I touch?" }))),
    });
    try {
      const proc = Bun.spawn(
        ["bun", "src/cli.ts", "task", "run", "--no-verify", "--task", "fix it", "--output", output],
        {
          cwd: root,
          stdout: "pipe",
          stderr: "pipe",
          env: {
            ...process.env,
            CORVIDINHO_LLM_API_KEY: "test-key-not-real",
            OPENAI_API_KEY: "",
            CORVIDINHO_LLM_BASE_URL: `http://127.0.0.1:${server.port}/v1`,
            CORVIDINHO_LLM_MODEL: "test-model",
            CORVIDINHO_LLM_TIER: "tool",
          },
        },
      );
      const [code, out] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
      return { code, out };
    } finally {
      server.stop(true);
    }
  }

  test("--json: state blocked, ask present, exit 0", async () => {
    const { code, out } = await runCli("json");
    expect(code).toBe(0);
    const parsed = JSON.parse(out) as { result: TaskResult; events: AgentEvent[] };
    expect(parsed.result.state).toBe("blocked");
    expect(parsed.result.ask).toEqual({
      reason: "clarify",
      question: "Which repo should I touch?",
    });
    expect(parsed.events).toContainEqual({ type: "StateChanged", state: "blocked" });
  }, 30_000);

  test("text: prints the question", async () => {
    const { code, out } = await runCli("text");
    expect(code).toBe(0);
    expect(out).toContain("state=blocked");
    expect(out).toContain("Needs your input: Which repo should I touch?");
  }, 30_000);
});
