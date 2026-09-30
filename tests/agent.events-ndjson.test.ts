/**
 * REQ-agent-073 — NDJSON event stream contract (issue #73; AGENT-8 / CLI-7).
 * Fixture-only: fake secrets are built at runtime, fetch is mocked, no network.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  CORVIDINHO_PROTOCOL_VERSION,
  NDJSON_LIMITS,
  collectTaskRunStream,
  createNdjsonParser,
  createNdjsonWriter,
  frameFromEvent,
  parseNdjsonLine,
  progressFromFrame,
  protocolMismatchSummary,
  readNdjsonStream,
  resultFrame,
  serializeFrame,
  summarizeToolArgs,
  usageFrame,
  type NdjsonFrame,
} from "../src/agent/events-ndjson.ts";
import {
  createTaskExecute,
  extractUsage,
  UNKNOWN_TOOL_LABEL,
  type AgentEvent,
  type AgentTokenUsage,
  type TaskResult,
} from "../src/agent/index.ts";
import { CORVIDINHO_PROTOCOL_VERSION as DISCORD_PROTOCOL } from "../src/discord/protocol-version.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry } from "../src/plugins/registry.ts";

/** Plain persona folder: a clean load, so no `Persona: …` note joins a run's exact events (PERSONA-2). */
const PERSONA_FIXTURE = join(import.meta.dir, "fixtures", "persona");

// Runtime-built fake secrets (never literal vendor keys in the repo).
const FAKE_GH = `ghp_${"A1b2C3d4".repeat(5)}`;
const FAKE_OPENAI = `sk-${"x9Y8z7W6".repeat(4)}`;

const RESULT: TaskResult = {
  summary: "demo task attempt 1",
  filesChanged: ["src/cli.ts"],
  verified: false,
  verifySkipped: true,
  cancelled: false,
  state: "done",
  attempts: 1,
};

function streamOf(chunks: Array<string | Uint8Array>): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) {
        controller.enqueue(typeof c === "string" ? enc.encode(c) : c);
      }
      controller.close();
    },
  });
}

describe("protocol version", () => {
  test("wire protocol is 2 and discord re-exports the same constant", () => {
    expect(CORVIDINHO_PROTOCOL_VERSION).toBe(2);
    expect(DISCORD_PROTOCOL).toBe(CORVIDINHO_PROTOCOL_VERSION);
  });
});

describe("serializer shape", () => {
  test("each AgentEvent becomes one versioned frame with its AgentEvent type", () => {
    const events: AgentEvent[] = [
      { type: "StateChanged", state: "planning" },
      { type: "Text", text: "hello" },
      { type: "ToolCall", name: "specsync-list", args: '{"argv":["agent"]}' },
      { type: "ToolResult", name: "specsync-list", success: true, detail: "ok" },
      { type: "VerifyResult", success: false, output: "lint failed" },
    ];
    const frames = events.map(frameFromEvent);
    expect(frames).toEqual([
      { protocol: 2, type: "StateChanged", state: "planning" },
      { protocol: 2, type: "Text", text: "hello" },
      {
        protocol: 2,
        type: "ToolCall",
        name: "specsync-list",
        argsSummary: "argv=[agent]",
      },
      {
        protocol: 2,
        type: "ToolResult",
        name: "specsync-list",
        success: true,
        detail: "ok",
      },
      { protocol: 2, type: "VerifyResult", success: false, output: "lint failed" },
    ]);
  });

  test("ToolResult without detail omits the field", () => {
    expect(
      frameFromEvent({ type: "ToolResult", name: "x", success: false }),
    ).toEqual({ protocol: 2, type: "ToolResult", name: "x", success: false });
  });

  test("usage and result frames", () => {
    expect(
      usageFrame({ promptTokens: 10, completionTokens: 5, totalTokens: 15 }),
    ).toEqual({
      protocol: 2,
      type: "usage",
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
    expect(
      usageFrame({ promptTokens: -3, completionTokens: Number.NaN, totalTokens: 2.9 }),
    ).toEqual({
      protocol: 2,
      type: "usage",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 2,
    });
    expect(resultFrame(RESULT)).toEqual({ protocol: 2, type: "result", result: RESULT });
  });

  test("result frame caps an oversized summary with a marker; rest of result intact", () => {
    const max = NDJSON_LIMITS.resultSummary;
    const big: TaskResult = { ...RESULT, summary: "y".repeat(max + 500) };
    const frame = resultFrame(big);
    expect(frame.truncated).toBe(true);
    expect(frame.result.summary.length).toBe(max + 1);
    expect(frame.result.summary.endsWith("…")).toBe(true);
    expect({ ...frame.result, summary: big.summary }).toEqual(big);
    // Input not mutated; round-trips through the parser with the marker.
    expect(big.summary.length).toBe(max + 500);
    const parsed = parseNdjsonLine(serializeFrame(frame));
    expect(parsed).toEqual(frame);
    // At the cap exactly: unchanged, no marker.
    const edge = resultFrame({ ...RESULT, summary: "z".repeat(max) });
    expect(edge.truncated).toBeUndefined();
    expect(edge.result.summary.length).toBe(max);
  });

  test("multi-line text serializes to exactly one line and round-trips", () => {
    const frame = frameFromEvent({ type: "Text", text: "line one\nline two\r\n end" });
    const line = serializeFrame(frame);
    expect(line.includes("\n")).toBe(false);
    expect(line.includes("\r")).toBe(false);
    expect(parseNdjsonLine(line)).toEqual(frame);
  });

  test("writer emits one serialized frame per call", () => {
    const lines: string[] = [];
    const w = createNdjsonWriter((l) => lines.push(l));
    w.event({ type: "StateChanged", state: "executing" });
    w.usage({ promptTokens: 1, completionTokens: 2, totalTokens: 3 });
    w.result(RESULT);
    expect(lines.length).toBe(3);
    const parsed = lines.map((l) => JSON.parse(l) as { protocol: number; type: string });
    expect(parsed.map((p) => p.type)).toEqual(["StateChanged", "usage", "result"]);
    expect(parsed.every((p) => p.protocol === CORVIDINHO_PROTOCOL_VERSION)).toBe(true);
  });
});

describe("redaction / truncation", () => {
  test("ToolCall frame never carries raw args", () => {
    const raw = JSON.stringify({
      argv: ["--repo", "CorvidLabs/Corvidinho", "--body", `use ${FAKE_GH} please`],
    });
    const frame = frameFromEvent({ type: "ToolCall", name: "github-issue-comment", args: raw });
    const line = serializeFrame(frame);
    expect(line).not.toContain(FAKE_GH);
    expect(line).not.toContain(raw);
    expect(line).not.toContain('"args"');
    expect(line).toContain("[redacted:github-token]");
    expect(line).toContain("CorvidLabs/Corvidinho");
  });

  test("sensitive keys and flags print [redacted]", () => {
    const obj = summarizeToolArgs(
      JSON.stringify({ apiKey: "plain-value-1", password: "hunter2", token: "t", module: "cli" }),
    );
    expect(obj).toContain("apiKey=[redacted]");
    expect(obj).toContain("password=[redacted]");
    expect(obj).toContain("token=[redacted]");
    expect(obj).toContain("module=cli");
    expect(obj).not.toContain("plain-value-1");
    expect(obj).not.toContain("hunter2");

    const argv = summarizeToolArgs(
      JSON.stringify(["--token", "abc123", "--auth-header=xyz789", "--key", "identity"]),
    );
    expect(argv).toBe("--token [redacted] --auth-header=[redacted] --key identity");
  });

  test("vendor key shapes are scrubbed inside values", () => {
    const s = summarizeToolArgs(JSON.stringify({ note: FAKE_OPENAI }));
    expect(s).not.toContain(FAKE_OPENAI);
    expect(s).toContain("[redacted:");
  });

  test("values and the whole summary are truncated", () => {
    const long = "v".repeat(500);
    const s = summarizeToolArgs(JSON.stringify({ a: long, b: long, c: long, d: long, e: long }));
    expect(s.length).toBeLessThanOrEqual(NDJSON_LIMITS.argsSummary);
    expect(s).not.toContain("v".repeat(NDJSON_LIMITS.argValue + 1));
    expect(s.endsWith("…")).toBe(true);

    const many = summarizeToolArgs(JSON.stringify(Array.from({ length: 30 }, (_, i) => `a${i}`)));
    expect(many).toContain("…(+18)");
    expect(many).not.toContain("a29");
  });

  test("unparseable args are described by length only", () => {
    const raw = `please run with ${FAKE_GH}`;
    expect(summarizeToolArgs(raw)).toBe(`(${raw.length} chars, unparsed)`);
    expect(summarizeToolArgs("")).toBe("");
    expect(summarizeToolArgs(undefined)).toBe("");
  });

  test("nested objects are elided, not dumped", () => {
    const s = summarizeToolArgs(JSON.stringify({ opts: { secretish: "deep-value" }, n: 3, ok: true }));
    expect(s).toBe("opts={…} n=3 ok=true");
  });

  test("Text / ToolResult detail / VerifyResult output are scrubbed and capped", () => {
    const text = frameFromEvent({ type: "Text", text: `${FAKE_GH} ${"t".repeat(9000)}` });
    expect(text.type).toBe("Text");
    if (text.type === "Text") {
      expect(text.text).not.toContain(FAKE_GH);
      expect(text.text.length).toBeLessThanOrEqual(NDJSON_LIMITS.text + 1);
      expect(text.truncated).toBe(true);
    }

    const tr = frameFromEvent({
      type: "ToolResult",
      name: "files-read",
      success: true,
      detail: `${"d".repeat(5000)}${FAKE_GH}`,
    });
    if (tr.type === "ToolResult") {
      expect(tr.detail?.length).toBeLessThanOrEqual(NDJSON_LIMITS.toolDetail + 1);
      expect(tr.detail).not.toContain("ghp_");
    }

    const vr = frameFromEvent({
      type: "VerifyResult",
      success: false,
      output: `${"noise\n".repeat(2000)}FINAL ERROR: tsc failed`,
    });
    if (vr.type === "VerifyResult") {
      expect(vr.truncated).toBe(true);
      expect(vr.output.startsWith("…")).toBe(true);
      // Tail kept: the failure line survives.
      expect(vr.output.endsWith("FINAL ERROR: tsc failed")).toBe(true);
    }
  });
});

describe("parser robustness", () => {
  test("parseNdjsonLine rejects garbage and malformed frames", () => {
    const bad = [
      "",
      "   ",
      "not json",
      "{not json}",
      "[1,2,3]",
      '"string"',
      JSON.stringify({ type: "StateChanged", state: "planning" }), // no protocol
      JSON.stringify({ protocol: "2", type: "StateChanged", state: "planning" }),
      JSON.stringify({ protocol: 1.5, type: "StateChanged", state: "planning" }),
      JSON.stringify({ protocol: 2, type: "Nope" }),
      JSON.stringify({ protocol: 2, type: "StateChanged", state: "dreaming" }),
      JSON.stringify({ protocol: 2, type: "Text", text: 5 }),
      JSON.stringify({ protocol: 2, type: "ToolCall", name: "x", args: "{}" }),
      JSON.stringify({ protocol: 2, type: "ToolResult", name: "x", success: "yes" }),
      JSON.stringify({ protocol: 2, type: "ToolResult", name: "x", success: true, detail: 3 }),
      JSON.stringify({ protocol: 2, type: "VerifyResult", success: true }),
      JSON.stringify({ protocol: 2, type: "usage", promptTokens: 1, completionTokens: -1, totalTokens: 0 }),
      JSON.stringify({ protocol: 2, type: "result", result: "done" }),
      JSON.stringify({ protocol: 2, type: "result", result: { state: "done" } }),
      // Old `--json` document is not a frame.
      JSON.stringify({ result: RESULT, events: [] }),
    ];
    for (const line of bad) {
      expect(parseNdjsonLine(line)).toBeNull();
    }
  });

  test("protocol option rejects frames from another protocol", () => {
    const line = JSON.stringify({ protocol: 1, type: "StateChanged", state: "done" });
    expect(parseNdjsonLine(line)).not.toBeNull();
    expect(parseNdjsonLine(line, { protocol: 2 })).toBeNull();
  });

  test("chunks split mid-line, CRLF, and multiple lines per chunk", () => {
    const a = serializeFrame(frameFromEvent({ type: "StateChanged", state: "planning" }));
    const b = serializeFrame(frameFromEvent({ type: "ToolCall", name: "plugins-list", args: "{}" }));
    const c = serializeFrame(resultFrame(RESULT));
    const all = `${a}\r\n${b}\ngarbage line\n\n${c}\n`;
    const parser = createNdjsonParser();
    const got: NdjsonFrame[] = [];
    const others: string[] = [];
    for (let i = 0; i < all.length; i += 7) {
      for (const l of parser.push(all.slice(i, i + 7))) {
        if (l.frame) got.push(l.frame);
        else others.push(l.line);
      }
    }
    expect(parser.end()).toEqual([]);
    expect(got.map((f) => f.type)).toEqual(["StateChanged", "ToolCall", "result"]);
    expect(others).toEqual(["garbage line", ""]);
  });

  test("unterminated final line is flushed by end()", () => {
    const parser = createNdjsonParser();
    const line = serializeFrame(resultFrame(RESULT));
    expect(parser.push(line.slice(0, 10))).toEqual([]);
    expect(parser.push(line.slice(10))).toEqual([]);
    const tail = parser.end();
    expect(tail.length).toBe(1);
    expect(tail[0]?.frame?.type).toBe("result");
  });

  test("over-long unterminated line is dropped once, then parsing recovers", () => {
    const parser = createNdjsonParser();
    const huge = "x".repeat(NDJSON_LIMITS.maxLine + 10);
    const first = parser.push(huge);
    expect(first.length).toBe(1);
    expect(first[0]?.frame).toBeNull();
    expect(parser.push("more of the same line")).toEqual([]);
    const ok = serializeFrame(frameFromEvent({ type: "StateChanged", state: "done" }));
    const after = parser.push(`tail\n${ok}\n`);
    expect(after.map((l) => l.frame?.type)).toEqual(["StateChanged"]);
  });

  test("readNdjsonStream: frames + result + otherText; multi-byte split; throwing onFrame", async () => {
    const enc = new TextEncoder();
    const text = serializeFrame(frameFromEvent({ type: "Text", text: "café ☕ done" }));
    const bytes = enc.encode(`${text}\n`);
    // Split inside the multi-byte "☕" sequence.
    const cut = bytes.indexOf(0xe2);
    const stream = streamOf([
      "warning: stray stdout\n",
      serializeFrame(frameFromEvent({ type: "StateChanged", state: "planning" })) + "\n",
      bytes.slice(0, cut + 1),
      bytes.slice(cut + 1),
      serializeFrame(usageFrame({ promptTokens: 3, completionTokens: 4, totalTokens: 7 })) + "\n",
      serializeFrame(resultFrame(RESULT)),
    ]);
    const seen: string[] = [];
    const out = await readNdjsonStream(stream, (f) => {
      seen.push(f.type);
      if (f.type === "StateChanged") throw new Error("status sink broke");
    });
    expect(seen).toEqual(["StateChanged", "Text", "usage", "result"]);
    expect(out.frames).toBe(4);
    expect(out.result).toEqual(RESULT);
    expect(out.otherText).toBe("warning: stray stdout");
  });

  test("readNdjsonStream with no stream returns empty outcome", async () => {
    const out = await readNdjsonStream(undefined, () => {});
    expect(out).toEqual({ result: undefined, otherText: "", frames: 0 });
  });

  test("frames from another protocol are withheld and flagged, never otherText", async () => {
    const secretDetail = "private note: door code 4412";
    const stream = streamOf([
      "warning: stray stdout\n",
      JSON.stringify({ protocol: 3, type: "StateChanged", state: "planning" }) + "\n",
      JSON.stringify({ protocol: 3, type: "ToolResult", name: "memory-recall", success: true, detail: secretDetail }) + "\n",
      // Same protocol but malformed: frame-shaped content is dropped too.
      JSON.stringify({ protocol: 2, type: "ToolResult", name: "x", success: "yes", detail: secretDetail }) + "\n",
      JSON.stringify({ protocol: 3, type: "result", result: { ...RESULT, summary: secretDetail } }) + "\n",
    ]);
    const seen: string[] = [];
    const out = await readNdjsonStream(stream, (f) => seen.push(f.type), { protocol: 2 });
    expect(seen).toEqual([]);
    expect(out.frames).toBe(0);
    expect(out.result).toBeUndefined();
    expect(out.protocolMismatch).toBe(3);
    expect(out.otherText).toBe("warning: stray stdout");
    expect(out.otherText).not.toContain("door code");
  });
});

describe("collectTaskRunStream protocol mismatch (DISCORD-10)", () => {
  test("a protocol-3 ToolResult detail never reaches the summary", async () => {
    const secretDetail = "private note: door code 4412";
    const stdout = streamOf([
      JSON.stringify({ protocol: 3, type: "StateChanged", state: "planning" }) + "\n",
      JSON.stringify({ protocol: 3, type: "Text", text: secretDetail }) + "\n",
      JSON.stringify({ protocol: 3, type: "ToolResult", name: "memory-recall", success: true, detail: secretDetail }) + "\n",
      JSON.stringify({ protocol: 3, type: "result", result: { ...RESULT, summary: secretDetail } }) + "\n",
    ]);
    const progress: unknown[] = [];
    const out = await collectTaskRunStream({
      stdout,
      stderr: streamOf([`stderr mentions ${secretDetail}\n`]),
      exited: Promise.resolve(0),
      onProgress: (p) => progress.push(p),
    });
    expect(out.summary).toBe(protocolMismatchSummary(3, CORVIDINHO_PROTOCOL_VERSION));
    expect(out.summary).toBe("protocol mismatch: binary 3, bridge 2 — restart the bridge");
    expect(out.summary).not.toContain("door code");
    expect(out.protocolMismatch).toBe(3);
    expect(out.result).toBeUndefined();
    expect(out.frames).toBe(0);
    expect(progress).toEqual([]);
  });

  test("matching stream has no mismatch flag; no frames at all still falls back", async () => {
    const ok = await collectTaskRunStream({
      stdout: streamOf([serializeFrame(resultFrame(RESULT)) + "\n"]),
      stderr: undefined,
      exited: Promise.resolve(0),
    });
    expect(ok.protocolMismatch).toBeUndefined();
    // DISCORD-3.a — stream summary is chat body only; plumbing stays on the embed.
    expect(ok.summary).toBe("demo task attempt 1");
    expect(ok.summary).not.toContain("state=");
    expect(ok.result?.state).toBe("done");
    const plain = await collectTaskRunStream({
      stdout: streamOf(["plain text only\n"]),
      stderr: undefined,
      exited: Promise.resolve(0),
    });
    expect(plain.protocolMismatch).toBeUndefined();
    expect(plain.summary).toBe("plain text only");
  });
});

describe("progressFromFrame (AGENT-8 / DISCORD-3)", () => {
  test("states, tools, verify, usage; text/result change nothing", () => {
    const p = (e: AgentEvent) => progressFromFrame(frameFromEvent(e));
    // A state change clears the current tool (tool: "") so no stale tool shows.
    expect(p({ type: "StateChanged", state: "planning" })).toEqual({
      state: "planning",
      tool: "",
      message: "planning",
    });
    expect(p({ type: "StateChanged", state: "verifying" })?.tool).toBe("");
    expect(p({ type: "StateChanged", state: "executing" })?.message).toBe("working");
    expect(p({ type: "StateChanged", state: "verifying" })?.message).toBe("verifying");
    expect(p({ type: "StateChanged", state: "done" })?.message).toBe("done");
    expect(p({ type: "StateChanged", state: "failed" })?.message).toBe("failed");
    expect(p({ type: "ToolCall", name: "specsync-list", args: "{}" })).toEqual({
      tool: "specsync-list",
      message: "calling tool specsync-list",
    });
    expect(p({ type: "ToolResult", name: "specsync-list", success: false })).toEqual({
      tool: "specsync-list",
      message: "tool specsync-list failed",
    });
    expect(p({ type: "VerifyResult", success: true, output: "" })).toEqual({
      message: "verify passed",
    });
    expect(p({ type: "Text", text: "hi" })).toBeNull();
    expect(
      progressFromFrame(usageFrame({ promptTokens: 1, completionTokens: 1, totalTokens: 2 })),
    ).toEqual({ totalTokens: 2 });
    expect(progressFromFrame(resultFrame(RESULT))).toBeNull();
  });
});

describe("usage running totals (mock fetch, no network)", () => {
  beforeEach(() => {
    clearRegistry();
    loadBuiltins();
  });
  afterEach(() => {
    clearRegistry();
    loadBuiltins();
  });

  test("extractUsage reads OpenAI-compatible usage; null when absent", () => {
    expect(
      extractUsage({ usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 } }),
    ).toEqual({ promptTokens: 12, completionTokens: 3, totalTokens: 15 });
    expect(extractUsage({ usage: { prompt_tokens: 4, completion_tokens: 6 } })).toEqual({
      promptTokens: 4,
      completionTokens: 6,
      totalTokens: 10,
    });
    expect(extractUsage({ choices: [] })).toBeNull();
    expect(extractUsage({ usage: { prompt_tokens: "x" } })).toBeNull();
    expect(extractUsage(null)).toBeNull();
  });

  test("tool loop reports running totals across rounds; events unchanged", async () => {
    let call = 0;
    const fetchImpl = async () => {
      call += 1;
      const body =
        call === 1
          ? {
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: null,
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
              usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
            }
          : {
              choices: [{ message: { role: "assistant", content: "Listed." } }],
              usage: { prompt_tokens: 150, completion_tokens: 30, total_tokens: 180 },
            };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const usage: AgentTokenUsage[] = [];
    const events: AgentEvent[] = [];
    const exec = createTaskExecute({
      taskText: "list plugins",
      env: {
        CORVIDINHO_LLM_API_KEY: "test-key-not-real",
        CORVIDINHO_LLM_MODEL: "test-model",
        CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1",
        CORVIDINHO_LLM_TIER: "tool",
      },
      fetchImpl,
      tier: "tool",
      onEvent: (e) => events.push(e),
      onUsage: (u) => usage.push(u),
      maxToolRounds: 4,
      personaRoot: PERSONA_FIXTURE,
    });
    const r = await exec({ attempt: 1, signal: new AbortController().signal });
    expect(r.summary).toBe("Listed.");
    expect(usage).toEqual([
      { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
      { promptTokens: 250, completionTokens: 50, totalTokens: 300 },
    ]);
    // AgentEvent stays frozen: no usage event type leaks into --json events.
    expect(events.map((e) => e.type)).toEqual(["ToolCall", "ToolResult", "Text"]);
  });

  test("tool events name only offered tools; a made-up name shows as (unknown tool)", async () => {
    const madeUp = "[click me](https://example.invalid)";
    let call = 0;
    const fetchImpl = async () => {
      call += 1;
      const message =
        call === 1
          ? {
              role: "assistant",
              content: null,
              tool_calls: [
                { id: "c1", type: "function", function: { name: madeUp, arguments: "{}" } },
                { id: "c2", type: "function", function: { name: "plugins-list", arguments: "{}" } },
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
      taskText: "try tools",
      env: {
        CORVIDINHO_LLM_API_KEY: "test-key-not-real",
        CORVIDINHO_LLM_MODEL: "test-model",
        CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1",
      },
      fetchImpl,
      tier: "tool",
      onEvent: (e) => events.push(e),
      maxToolRounds: 3,
    });
    await exec({ attempt: 1, signal: new AbortController().signal });
    const tools = events.filter(
      (e): e is Extract<AgentEvent, { type: "ToolCall" | "ToolResult" }> =>
        e.type === "ToolCall" || e.type === "ToolResult",
    );
    expect(tools.map((e) => [e.type, e.name])).toEqual([
      ["ToolCall", UNKNOWN_TOOL_LABEL],
      ["ToolResult", UNKNOWN_TOOL_LABEL],
      ["ToolCall", "plugins-list"],
      ["ToolResult", "plugins-list"],
    ]);
    // The refusal detail still names what the model asked for (stdout only).
    const refused = tools[1] as { success: boolean; detail?: string };
    expect(refused.success).toBe(false);
    expect(refused.detail).toContain("not offered");
    // Live status never shows the made-up name.
    for (const e of tools) {
      const p = progressFromFrame(frameFromEvent(e));
      expect(JSON.stringify(p)).not.toContain("example.invalid");
    }
  });

  test("read tier single chat accumulates across attempts; no usage → no callback", async () => {
    let withUsage = true;
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "ok" } }],
          ...(withUsage ? { usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 } } : {}),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    const usage: AgentTokenUsage[] = [];
    const exec = createTaskExecute({
      env: { CORVIDINHO_LLM_API_KEY: "test-key-not-real", CORVIDINHO_LLM_MODEL: "test-model", CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1" },
      fetchImpl,
      tier: "read",
      onUsage: (u) => usage.push(u),
      loadPlugins: false,
    });
    const signal = new AbortController().signal;
    await exec({ attempt: 1, signal });
    await exec({ attempt: 2, signal });
    withUsage = false;
    await exec({ attempt: 3, signal });
    expect(usage.map((u) => u.totalTokens)).toEqual([6, 12]);
  });
});
