/**
 * Missing-capability soft-land: name the real gap, cite only real HI / PRs,
 * never invent a provider, never ask a vague install question.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTaskExecute } from "../src/agent/index.ts";
import {
  detectCapabilityAsk,
  formatCapabilityReply,
  gapForTool,
  hiIdsInDir,
  hiIdsInMarkdown,
  isVagueInstallQuestion,
  missingCapabilityReply,
  openPrsFromJson,
  unseenToolDetail,
  vagueInstallOutcome,
  assessCapability,
  type CapabilityFacts,
  type ToolFact,
} from "../src/agent/missing-capability.ts";
import { clearRegistry, register } from "../src/plugins/registry.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";

const ENV = {
  CORVIDINHO_LLM_API_KEY: "secret",
  CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1",
  CORVIDINHO_LLM_MODEL: "test-model",
};

function fact(name: string, extra: Partial<ToolFact> = {}): ToolFact {
  return { name, dangerous: true, mutating: true, minTier: 1, ...extra };
}

function facts(over: Partial<CapabilityFacts> = {}): CapabilityFacts {
  const registered = new Map<string, ToolFact>([
    ["gif-search", fact("gif-search")],
    ["web-search", fact("web-search")],
    ["files-read", fact("files-read", { dangerous: false, mutating: false, minTier: 0 })],
  ]);
  return {
    offered: new Set(),
    registered,
    allowlist: new Set(),
    env: {},
    role: null,
    tier: "code",
    fledge: { commands: [] },
    ...over,
  };
}

describe("detectCapabilityAsk", () => {
  test("names an install or use, and a short GIF ask", () => {
    expect(detectCapabilityAsk("Install the gif plugin")).toEqual({ kind: "named", verb: "install", needle: "gif" });
    expect(detectCapabilityAsk("Use fledge gif plugin")).toEqual({ kind: "named", verb: "use", needle: "fledge gif" });
    expect(detectCapabilityAsk("dog GIFs")).toEqual({ kind: "gif" });
    expect(detectCapabilityAsk("hello there")).toBeNull();
    expect(detectCapabilityAsk("refactor the gif plugin in src/agent")).toBeNull();
  });

  test("a vague install question is only the generic one", () => {
    expect(isVagueInstallQuestion("what do you mean by install?")).toBe(true);
    expect(isVagueInstallQuestion("Which database?")).toBe(false);
  });
});

describe("gap reply", () => {
  test("owner without an allowlist hears not-allowlisted and not-installed, with only the cited pointer", async () => {
    const f = facts({ fledge: { commands: [] } });
    const text = await missingCapabilityReply({
      taskText: "Install the gif plugin",
      facts: f,
      lookup: async () => ({ hiIds: ["PLUGIN-8", "PLUGIN-9"], prs: [{ number: 412, title: "gif allowlist note" }], searched: true }),
    });
    expect(text).toContain("fledge-gif is not installed");
    expect(text).toContain("gif-search is not allowlisted");
    expect(text).toContain("HI PLUGIN-8, PLUGIN-9");
    expect(text).toContain("open PR #412");
    expect(text).not.toContain("Tenor");
    expect(text).not.toContain("?");
    expect(text).not.toContain("#999");
  });

  test("an unknown plugin is not installed and no provider is invented", async () => {
    const text = await missingCapabilityReply({
      taskText: "Install the widgets plugin",
      facts: facts(),
      lookup: async () => ({ hiIds: [], prs: [], searched: true }),
    });
    expect(text).toContain("widgets is not installed");
    expect(text).toContain("No captured HI id or open PR matched");
    expect(text).not.toContain("Tenor");
    expect(text).not.toContain("GIPHY");
  });

  test("community hears a role gap, not an allowlist they can edit", () => {
    const f = facts({ role: "community", fledge: { commands: ["gif"] } });
    const ask = detectCapabilityAsk("dog GIFs");
    expect(ask).not.toBeNull();
    const assessment = assessCapability(ask!, f);
    expect(assessment?.offered).toEqual([]);
    const text = formatCapabilityReply(assessment!, { hiIds: ["PLUGIN-9"], prs: [], searched: true }, "code");
    expect(text).toContain("not available for this role");
    expect(text).toContain("community");
    expect(text).not.toContain("CORVIDINHO_ALLOWLIST");
    expect(text).toContain("HI PLUGIN-9");
  });

  test("an offered GIF tool does not replace the run", async () => {
    const f = facts({ offered: new Set(["gif-search"]), allowlist: new Set(["gif-search"]) });
    expect(gapForTool("gif-search", f)).toBe("offered");
    const text = await missingCapabilityReply({
      taskText: "dog GIFs",
      facts: f,
      lookup: async () => {
        throw new Error("lookup should not decide an offered tool");
      },
    });
    expect(text).toBeNull();
  });

  test("a missing key is the gap only when allowlist and tier already pass", () => {
    const f = facts({
      allowlist: new Set(["gif-search"]),
      tier: "tool",
      env: {},
    });
    const gap = gapForTool("gif-search", f);
    expect(gap).not.toBe("offered");
    if (gap === "offered") return;
    expect(gap.kind).toBe("not-configured");
    expect(gap.key).toBe("GIPHY_API_KEY");
  });

  test("a vague install question becomes the gap, or a steer when the tool is offered", () => {
    const missing = vagueInstallOutcome("what do you mean by install?", "Install the gif plugin", facts());
    expect(missing?.kind).toBe("replace");
    expect(missing?.text).toContain("gif-search is not allowlisted");
    expect(missing?.text).not.toContain("?");
    const offered = vagueInstallOutcome(
      "what do you want me to install?",
      "Use the gif plugin",
      facts({ offered: new Set(["fledge-gif", "gif-search"]), allowlist: new Set(["fledge-gif", "gif-search"]), fledge: { commands: ["gif"] } }),
    );
    expect(offered?.kind).toBe("steer");
    expect(offered?.text).toContain("is offered");
    expect(offered?.text).not.toContain("what do you");
  });

  test("an unseen invented name stays not offered and does not become a provider", () => {
    const detail = unseenToolDetail("tenor", facts());
    expect(detail).toContain("not offered");
    expect(detail).toContain("not installed");
    expect(detail).toContain("Do not invent a provider");
  });
});

describe("citations are parsed, never invented", () => {
  test("HI ids come only from lines that contain the needle", () => {
    const md = [
      "- **PLUGIN-8**  It can find a GIF through GIPHY.",
      "- **PLUGIN-1**  Files and shell are plugins.",
      "- **NOPE** not an id",
    ].join("\n");
    expect(hiIdsInMarkdown(md, ["gif"])).toEqual(["PLUGIN-8"]);
    const dir = mkdtempSync(join(tmpdir(), "hi-cap-"));
    writeFileSync(join(dir, "plugin.md"), md);
    expect(hiIdsInDir(dir, ["gif"])).toEqual(["PLUGIN-8"]);
    expect(hiIdsInDir(dir, ["widgets"])).toEqual([]);
  });

  test("PR numbers have to be integers whose title contains the needle", () => {
    const json = JSON.stringify([
      { number: 412, title: "gif allowlist note" },
      { number: 1.5, title: "gif" },
      { number: 7, title: "unrelated widgets" },
      { number: "9", title: "gif" },
    ]);
    expect(openPrsFromJson(json, ["gif"])).toEqual([{ number: 412, title: "gif allowlist note" }]);
    expect(openPrsFromJson("nope", ["gif"])).toEqual([]);
  });
});

describe("execute soft-land", () => {
  afterEach(() => {
    clearRegistry();
    loadBuiltins();
  });

  test("install the gif plugin never calls the model and does not ask what to install", async () => {
    clearRegistry();
    loadBuiltins();
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return new Response("no", { status: 500 });
    };
    const exec = createTaskExecute({
      taskText: "Install the gif plugin",
      env: ENV,
      fetchImpl,
      tier: "code",
      projectInstructions: false,
      nonInteractive: true,
      allowlist: [],
      citeOpenPrs: false,
      discoverFledge: async () => ({ commands: [] }),
      coverageLookup: async () => ({
        hiIds: ["PLUGIN-8"],
        prs: [{ number: 358, title: "prefer fledge-gif" }],
        searched: true,
      }),
    });
    const result = await exec({ attempt: 1, signal: new AbortController().signal });
    expect(calls).toBe(0);
    expect(result.ask).toBeUndefined();
    expect(result.summary).toContain("not allowlisted");
    expect(result.summary).toContain("HI PLUGIN-8");
    expect(result.summary).toContain("open PR #358");
    expect(result.summary).not.toMatch(/\?/);
    expect(result.summary).not.toContain("Tenor");
  });

  test("dog GIFs with gif-search offered still calls the model", async () => {
    clearRegistry();
    loadBuiltins();
    const bodies: string[] = [];
    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(String(init?.body ?? ""));
      return new Response(
        JSON.stringify({ choices: [{ message: { role: "assistant", content: "here is a gif" } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const exec = createTaskExecute({
      taskText: "dog GIFs",
      env: { ...ENV, GIPHY_API_KEY: "abcdefgh" },
      fetchImpl,
      tier: "tool",
      projectInstructions: false,
      nonInteractive: true,
      allowlist: ["gif-search"],
      citeOpenPrs: false,
      discoverFledge: async () => ({ commands: ["gif"] }),
      coverageLookup: async () => ({ hiIds: [], prs: [], searched: true }),
    });
    const result = await exec({ attempt: 1, signal: new AbortController().signal });
    expect(bodies.length).toBe(1);
    expect(result.summary).toContain("here is a gif");
    expect(bodies[0]).toContain("fledge-gif is not allowlisted");
    expect(bodies[0]).toContain("never invent");
  });

  test("a vague ask-human after a named plugin does not become a clarify ask", async () => {
    clearRegistry();
    register({
      name: "gif-search",
      description: "gif",
      dangerous: true,
      minTier: 1,
      async handler() {
        return { ok: true, message: "ok" };
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
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "a1",
                      type: "function",
                      function: {
                        name: "ask-human",
                        arguments: JSON.stringify({ question: "what do you mean by install?" }),
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
        JSON.stringify({ choices: [{ message: { role: "assistant", content: "using gif-search" } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const exec = createTaskExecute({
      taskText: "Use the gif plugin",
      env: { ...ENV, GIPHY_API_KEY: "abcdefgh" },
      fetchImpl,
      tier: "tool",
      loadPlugins: false,
      projectInstructions: false,
      nonInteractive: true,
      allowlist: ["gif-search"],
      citeOpenPrs: false,
      discoverFledge: async () => ({ commands: [] }),
      coverageLookup: async () => ({ hiIds: [], prs: [], searched: false }),
    });
    const result = await exec({ attempt: 1, signal: new AbortController().signal });
    expect(result.ask).toBeUndefined();
    expect(result.summary).toContain("using gif-search");
    expect(call).toBe(2);
  });
});
