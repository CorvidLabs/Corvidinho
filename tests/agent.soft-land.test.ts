/**
 * AGENT-9 — soft-land tool-round exhaustion; never dump internal stop to chat.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  createTaskExecute,
  softLandToolRoundExhaustion,
  TOOL_ROUNDS_EXHAUSTED_CLARIFY,
  stripInternalStopReason,
  chatBodyFromTaskResult,
  type AgentEvent,
} from "../src/agent/index.ts";
import { clearRegistry } from "../src/plugins/registry.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { register } from "../src/plugins/registry.ts";
import { stripMentions } from "../src/discord/message-router.ts";

describe("softLandToolRoundExhaustion", () => {
  test("prefers last prose; else clarifying ask; operatorNote keeps stop reason", () => {
    const withText = softLandToolRoundExhaustion({
      lastText: "Gaspar is on CS2 tonight.",
      maxToolRounds: 8,
      toolNamesUsed: ["discord-user-lookup", "discord-user-lookup"],
    });
    expect(withText.summary).toBe("Gaspar is on CS2 tonight.");
    expect(withText.operatorNote).toBe(
      "Stopped after 8 tool rounds (tools: discord-user-lookup)",
    );
    expect(withText.summary).not.toContain("Stopped after");

    const empty = softLandToolRoundExhaustion({
      lastText: "  ",
      maxToolRounds: 8,
      toolNamesUsed: ["specsync-list", "github-issue-list"],
    });
    expect(empty.summary).toBe(TOOL_ROUNDS_EXHAUSTED_CLARIFY);
    expect(empty.operatorNote).toContain("specsync-list");
    expect(empty.summary).not.toContain("Stopped after");
  });
});

describe("stripInternalStopReason + chatBodyFromTaskResult", () => {
  test("drops Stopped after lines from outbound chat body", () => {
    const raw =
      "Still looking.\n\nStopped after 8 tool rounds (tools: specsync-list, files-list)";
    expect(stripInternalStopReason(raw)).toBe("Still looking.");
    expect(chatBodyFromTaskResult({ summary: raw })).toBe("Still looking.");
    expect(
      chatBodyFromTaskResult({
        summary: "Stopped after 3 tool rounds (tools: git-log)",
      }),
    ).toBe("");
  });
});

describe("stripMentions preserves snowflakes (IDENTITY-5)", () => {
  test("rewrites <@id> to Discord user id form", () => {
    expect(stripMentions("hey <@304028152194138114> about CS2")).toBe(
      "hey Discord user id 304028152194138114 about CS2",
    );
    expect(stripMentions("hi <@!181969874455756800>")).toBe(
      "hi Discord user id 181969874455756800",
    );
  });
});

describe("tool loop soft-land (AGENT-9)", () => {
  const env = {
    CORVIDINHO_LLM_API_KEY: "secret",
    CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1",
    CORVIDINHO_LLM_MODEL: "test-model",
  };

  beforeEach(() => {
    clearRegistry();
    register({
      name: "noop-tool",
      description: "always succeeds",
      dangerous: false,
      minTier: 0,
      async handler() {
        return { ok: true, message: "ok", exitCode: 0 };
      },
    });
  });
  afterEach(() => {
    clearRegistry();
    loadBuiltins();
  });

  test("exhausted rounds with no final prose → clarify ask, not Stopped after", async () => {
    const events: AgentEvent[] = [];
    let call = 0;
    const fetchImpl = async () => {
      call += 1;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: `c${call}`,
                    type: "function",
                    function: {
                      name: "noop-tool",
                      arguments: '{"argv":[]}',
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const exec = createTaskExecute({
      taskText: "bug 304028152194138114 / Gaspar about playing CS2",
      env,
      fetchImpl,
      tier: "tool",
      loadPlugins: false,
      projectInstructions: false,
      nonInteractive: false,
      maxToolRounds: 2,
      onEvent: (e) => events.push(e),
    });
    const result = await exec({
      attempt: 1,
      signal: new AbortController().signal,
    });
    expect(result.summary).toBe(TOOL_ROUNDS_EXHAUSTED_CLARIFY);
    expect(result.summary).not.toMatch(/Stopped after/i);
    const opText = events.find(
      (e) => e.type === "Text" && e.text.includes("Stopped after"),
    );
    expect(opText).toBeDefined();
  });

  test("exhausted rounds keeps last assistant prose", async () => {
    let call = 0;
    const fetchImpl = async () => {
      call += 1;
      if (call === 1) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "Gaspar seems to be on CS2.",
                  tool_calls: [
                    {
                      id: "c1",
                      type: "function",
                      function: {
                        name: "noop-tool",
                        arguments: '{"argv":[]}',
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
                content: null,
                tool_calls: [
                  {
                    id: `c${call}`,
                    type: "function",
                    function: {
                      name: "noop-tool",
                      arguments: '{"argv":[]}',
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const exec = createTaskExecute({
      taskText: "about Gaspar",
      env,
      fetchImpl,
      tier: "tool",
      loadPlugins: false,
      projectInstructions: false,
      nonInteractive: false,
      maxToolRounds: 2,
    });
    const result = await exec({
      attempt: 1,
      signal: new AbortController().signal,
    });
    expect(result.summary).toBe("Gaspar seems to be on CS2.");
    expect(result.summary).not.toMatch(/Stopped after/i);
  });
});
