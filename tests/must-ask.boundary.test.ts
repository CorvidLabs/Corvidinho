/**
 * AUTONOMY-11 (#97, REQ-plugins-097 / REQ-agent-097) — anything else inside
 * its guardrails it just does and tells me.
 *
 * - Boundary: only the must-ask builtins carry a must-ask class
 *   (discord-post-message, shell-exec, git-push, fledge-run,
 *   fledge-lanes-run and the language runners); every other builtin runs
 *   through runPlugin with no card, and each must-ask builtin's everyday call
 *   (a feature-branch push, `ls`, a dry-run post) runs with no card too.
 * - The model's instructions carry the one AUTONOMY-11 sentence.
 * - In the tool loop a must-ask call waits for the card and a no reaches the
 *   model as a refusal; a files-write in the same run asks nothing.
 *
 * Temp data dir and project, a fake provider, a recording card hook; no
 * token, no network.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ASK_AGENT_SYSTEM_INSTRUCTIONS, createTaskExecute } from "../src/agent/index.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { mustAskGate, mustAskVerdict } from "../src/plugins/must-ask.ts";
import { get, list } from "../src/plugins/registry.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { loadRunnerPlugins } from "../plugins/runners/index.ts";
import { answerMustAsk } from "./fixtures/must-ask.ts";

/** The builtins that carry a must-ask class (the runners only when their toolchain loaded). */
const MUST_ASK_BUILTINS = new Set([
  "discord-post-message",
  "shell-exec",
  "git-push",
  "fledge-run",
  "fledge-lanes-run",
  "node-exec",
  "python-exec",
  "cargo-exec",
]);

const KEYS = ["CORVIDINHO_DATA_DIR", "CORVIDINHO_DISCORD_ALLOW_CHANNELS", "DISCORD_TOKEN", "CORVIDINHO_DISCORD_DRY_RUN"];
const saved: Record<string, string | undefined> = {};
let card: ReturnType<typeof answerMustAsk>;

beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
  process.env.CORVIDINHO_DATA_DIR = mkdtempSync(join(tmpdir(), "must-ask-boundary-"));
  loadBuiltins();
  loadRunnerPlugins();
  card = answerMustAsk("denied");
});

afterEach(() => {
  card.restore();
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("AUTONOMY-11: every non-must-ask builtin runs with no ask", () => {
  test("only the must-ask builtins carry a class; every other builtin's call goes through the gate with no card", async () => {
    const names = list().map((e) => e.name);
    const classed = names.filter((n) => get(n)!.mustAsk !== undefined);
    expect(new Set(classed)).toEqual(new Set(names.filter((n) => MUST_ASK_BUILTINS.has(n))));
    const cwd = mkdtempSync(join(tmpdir(), "must-ask-boundary-cwd-"));
    for (const n of names.filter((x) => !MUST_ASK_BUILTINS.has(x))) {
      for (const args of [[], ["--channel", "1", "--content", "kubectl ssh docker"], ["deploy", "--prod"]]) {
        expect(await mustAskGate({ cmd: get(n)!, args, cwd })).toBeNull();
      }
    }
    expect(card.requests).toEqual([]);
  });

  test("real non-must-ask calls in a git project run with no card (files, git, search, memory, specsync)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "must-ask-boundary-git-"));
    Bun.spawnSync(["git", "init", "-q", "-b", "main"], { cwd: dir });
    const calls: [string, string[]][] = [
      ["files-write", ["notes.md", "kubectl and ssh notes\n"]],
      ["files-read", ["notes.md"]],
      ["files-list", ["."]],
      ["search-grep", ["kubectl", "."]],
      ["git-status", []],
      ["memory-store", ["deploys go through flyctl"]],
      ["plugins-list", []],
    ];
    for (const [name, args] of calls) {
      const r = await runPlugin({ name, args, cwd: dir });
      expect(r.error ?? "").not.toContain("AUTONOMY");
    }
    expect(readFileSync(join(dir, "notes.md"), "utf8")).toContain("kubectl");
    expect(card.requests).toEqual([]);
  });

  test("each must-ask builtin's everyday call runs with no card", async () => {
    const dir = mkdtempSync(join(tmpdir(), "must-ask-boundary-plain-"));
    writeFileSync(join(dir, "fledge.toml"), '[tasks]\ntest = "bun test"\n[lanes.verify]\nsteps = ["test"]\n');
    process.env.CORVIDINHO_DISCORD_ALLOW_CHANNELS = "999";
    process.env.DISCORD_TOKEN = "fake";
    process.env.CORVIDINHO_DISCORD_DRY_RUN = "1";
    const plain: [string, string[]][] = [
      ["shell-exec", ["ls -la && git status || true"]],
      ["fledge-run", ["test"]],
      ["fledge-lanes-run", ["verify"]],
      ["discord-post-message", ["--channel", "999", "--content", "dry run"]],
      ["node-exec", ["-e", "console.log(1)"]],
    ];
    for (const [name, args] of plain) {
      const cmd = get(name);
      if (!cmd) continue; // a runner whose toolchain is not on PATH
      expect(await mustAskVerdict(cmd, args, dir)).toBeNull();
    }
    expect(card.requests).toEqual([]);
  });
});

describe("the model is told: just do it and say so; the tool asks for the must-ask list", () => {
  test("ASK_AGENT_SYSTEM_INSTRUCTIONS carries the AUTONOMY-11 sentence", () => {
    expect(ASK_AGENT_SYSTEM_INSTRUCTIONS).toContain("Must-ask (AUTONOMY-9..11)");
    expect(ASK_AGENT_SYSTEM_INSTRUCTIONS).toContain("anything inside your guardrails you just do and then say what you did");
    expect(ASK_AGENT_SYSTEM_INSTRUCTIONS).toContain("never call ask-human for permission first");
  });

  test("tool loop: a channel post waits for the card and the owner's no reaches the model; a files-write asks nothing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "must-ask-boundary-loop-"));
    process.env.CORVIDINHO_DISCORD_ALLOW_CHANNELS = "999";
    process.env.DISCORD_TOKEN = "fake";
    delete process.env.CORVIDINHO_DISCORD_DRY_RUN;
    const bodies: { messages: { role: string; content: string | null }[] }[] = [];
    let call = 0;
    const fetchImpl = async (_i: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? "{}")));
      call += 1;
      const msg =
        call === 1
          ? {
              role: "assistant",
              content: null,
              tool_calls: [
                { id: "w", type: "function", function: { name: "files-write", arguments: JSON.stringify({ argv: ["a.md", "hi\n"] }) } },
                {
                  id: "p",
                  type: "function",
                  function: {
                    name: "discord-post-message",
                    arguments: JSON.stringify({ argv: ["--channel", "999", "--content", "v1 is out"] }),
                  },
                },
              ],
            }
          : { role: "assistant", content: "Wrote a.md; the owner said no to the post, so I didn't post it." };
      return new Response(JSON.stringify({ choices: [{ message: msg }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const exec = createTaskExecute({
      taskText: "write a.md and announce v1",
      cwd: dir,
      env: {
        CORVIDINHO_LLM_API_KEY: "test-key-not-real",
        CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1",
        CORVIDINHO_LLM_MODEL: "test-model",
        CORVIDINHO_LLM_TIER: "code",
      },
      fetchImpl,
      tier: "code",
      nonInteractive: true,
      allowlist: new Set(["discord-post-message"]),
    });
    const r = await exec({ attempt: 1, signal: new AbortController().signal });
    expect(r.summary).toContain("didn't post");
    expect(bodies[0]!.messages[0]!.content).toContain("Must-ask (AUTONOMY-9..11)");
    expect(readFileSync(join(dir, "a.md"), "utf8")).toBe("hi\n");
    expect(card.requests).toHaveLength(1);
    expect(card.requests[0]!.kind).toBe("mustask-post");
    expect(card.requests[0]!.text).toBe("v1 is out");
    const toolMsgs = bodies[1]!.messages.filter((m) => m.role === "tool").map((m) => String(m.content));
    expect(toolMsgs.some((t) => t.includes("refused (AUTONOMY-10)") && t.includes("the owner denied it"))).toBe(true);
  });
});
