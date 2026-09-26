/**
 * Project instructions loader (AGENT-1, REQ-agent-084): AGENTS.md / CLAUDE.md
 * from the project root reach the LLM system prompt, with size caps and
 * symlink / binary refusal. Temp dirs only; no network.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  describeProjectInstructions,
  findProjectRoot,
  loadProjectInstructions,
  PROJECT_INSTRUCTIONS_HEADER,
  PROJECT_INSTRUCTIONS_MAX_BYTES,
  projectInstructionsWarning,
  renderProjectInstructions,
  withProjectInstructions,
} from "../src/agent/project-instructions.ts";
import { createTaskExecute, type AgentEvent } from "../src/agent/index.ts";

let base: string;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "corvidinho-pi-"));
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

/** outside/AGENTS.md (must never be read) + outside/proj/.git (the project). */
function makeProject(): { outside: string; proj: string } {
  const outside = join(base, "outside");
  const proj = join(outside, "proj");
  mkdirSync(join(proj, ".git"), { recursive: true });
  writeFileSync(join(outside, "AGENTS.md"), "PARENT RULES: never read me\n");
  return { outside, proj };
}

function loaded(pi: ReturnType<typeof loadProjectInstructions>, name: string) {
  const f = pi.files.find((x) => x.name === name);
  if (!f || f.status !== "loaded") throw new Error(`${name} not loaded: ${JSON.stringify(f)}`);
  return f;
}

describe("findProjectRoot", () => {
  test("nearest .git dir at or above cwd; never a parent outside the project", () => {
    const { proj } = makeProject();
    const sub = join(proj, "src", "deep");
    mkdirSync(sub, { recursive: true });
    expect(findProjectRoot(sub)).toBe(proj);
    expect(findProjectRoot(proj)).toBe(proj);
  });

  test("a .git file (git worktree) marks the root", () => {
    const wt = join(base, "wt");
    mkdirSync(join(wt, "a"), { recursive: true });
    writeFileSync(join(wt, ".git"), "gitdir: /elsewhere/.git/worktrees/wt\n");
    expect(findProjectRoot(join(wt, "a"))).toBe(wt);
  });
});

describe("loadProjectInstructions (AGENT-1)", () => {
  test("reads AGENTS.md and CLAUDE.md from the project root, not the parent", () => {
    const { proj } = makeProject();
    writeFileSync(join(proj, "AGENTS.md"), "# Proj rules\nRun bun test.\n");
    writeFileSync(join(proj, "CLAUDE.md"), "Use tabs.\n");
    const sub = join(proj, "pkg");
    mkdirSync(sub);

    const pi = loadProjectInstructions(sub);
    expect(pi.root).toBe(proj);
    expect(pi.files.map((f) => f.name)).toEqual(["AGENTS.md", "CLAUDE.md"]);
    expect(loaded(pi, "AGENTS.md").text).toContain("Run bun test.");
    expect(loaded(pi, "CLAUDE.md").text).toContain("Use tabs.");

    const block = renderProjectInstructions(pi);
    expect(block.startsWith(PROJECT_INSTRUCTIONS_HEADER)).toBe(true);
    expect(block).toContain('<project-instructions file="AGENTS.md">');
    expect(block).toContain('<project-instructions file="CLAUDE.md">');
    expect(block).not.toContain("PARENT RULES");
  });

  test("missing files are skipped; the parent's AGENTS.md is not a fallback", () => {
    const { proj } = makeProject();
    const pi = loadProjectInstructions(proj);
    expect(pi.files).toEqual([]);
    expect(renderProjectInstructions(pi)).toBe("");
    expect(describeProjectInstructions(pi)).toBeNull();
  });

  test("no .git anywhere: the cwd itself is the project", () => {
    const plain = join(base, "plain");
    mkdirSync(plain);
    writeFileSync(join(plain, "AGENTS.md"), "plain rules\n");
    const pi = loadProjectInstructions(plain);
    expect(pi.root).toBe(plain);
    expect(loaded(pi, "AGENTS.md").text).toBe("plain rules\n");
  });

  test("oversized file is capped with a truncation marker", () => {
    const { proj } = makeProject();
    const big = "x".repeat(PROJECT_INSTRUCTIONS_MAX_BYTES + 5000);
    writeFileSync(join(proj, "AGENTS.md"), big);
    const f = loaded(loadProjectInstructions(proj), "AGENTS.md");
    expect(f.truncated).toBe(true);
    expect(f.bytes).toBe(big.length);
    expect(f.text.startsWith("x".repeat(PROJECT_INSTRUCTIONS_MAX_BYTES))).toBe(true);
    expect(f.text).toContain(
      `[truncated: AGENTS.md is ${big.length} bytes; only the first ${PROJECT_INSTRUCTIONS_MAX_BYTES} bytes are shown]`,
    );
    expect(f.text.length).toBeLessThan(PROJECT_INSTRUCTIONS_MAX_BYTES + 200);
  });

  test("truncation never splits a multi-byte UTF-8 character", () => {
    const { proj } = makeProject();
    // "é" is 2 bytes, so a 4-byte cap lands in the middle of the second "é".
    writeFileSync(join(proj, "AGENTS.md"), "aéééé");
    const f = loaded(loadProjectInstructions(proj, { maxBytes: 4 }), "AGENTS.md");
    expect(f.truncated).toBe(true);
    expect(f.text).toBe(
      "aé\n\n[truncated: AGENTS.md is 9 bytes; only the first 3 bytes are shown]",
    );
    expect(f.text).not.toContain("�");
  });

  test("symlink pointing outside the project is refused", () => {
    const { outside, proj } = makeProject();
    symlinkSync(join(outside, "AGENTS.md"), join(proj, "AGENTS.md"));
    const pi = loadProjectInstructions(proj);
    expect(pi.files).toEqual([
      { name: "AGENTS.md", status: "refused", reason: "resolves outside the project root" },
    ]);
    expect(renderProjectInstructions(pi)).toBe("");
    expect(describeProjectInstructions(pi)).toBe(
      "Project instructions: AGENTS.md refused: resolves outside the project root",
    );
  });

  test("symlinked directory hop outside the project is refused", () => {
    const { outside, proj } = makeProject();
    mkdirSync(join(outside, "shared"));
    writeFileSync(join(outside, "shared", "CLAUDE.md"), "outside\n");
    symlinkSync(join(outside, "shared"), join(proj, "shared"));
    symlinkSync("shared/CLAUDE.md", join(proj, "CLAUDE.md"));
    const pi = loadProjectInstructions(proj);
    expect(pi.files[0]).toMatchObject({ name: "CLAUDE.md", status: "refused" });
  });

  test("CLAUDE.md symlinked to AGENTS.md inside the project is read once", () => {
    const { proj } = makeProject();
    writeFileSync(join(proj, "AGENTS.md"), "shared rules\n");
    symlinkSync("AGENTS.md", join(proj, "CLAUDE.md"));
    const pi = loadProjectInstructions(proj);
    expect(pi.files[1]).toEqual({ name: "CLAUDE.md", status: "duplicate", sameAs: "AGENTS.md" });
    const block = renderProjectInstructions(pi);
    expect(block.split("shared rules").length - 1).toBe(1);
    expect(describeProjectInstructions(pi)).toBe(
      "Project instructions: AGENTS.md (13 bytes); CLAUDE.md (same file as AGENTS.md)",
    );
  });

  test("symlink to another file inside the project is followed", () => {
    const { proj } = makeProject();
    mkdirSync(join(proj, "docs"));
    writeFileSync(join(proj, "docs", "agents.md"), "docs rules\n");
    symlinkSync("docs/agents.md", join(proj, "AGENTS.md"));
    expect(loaded(loadProjectInstructions(proj), "AGENTS.md").text).toBe("docs rules\n");
  });

  test("broken symlink, directory, binary and non-UTF-8 files are refused", () => {
    const { proj } = makeProject();
    symlinkSync("nope.md", join(proj, "AGENTS.md"));
    mkdirSync(join(proj, "CLAUDE.md"));
    expect(loadProjectInstructions(proj).files).toEqual([
      { name: "AGENTS.md", status: "refused", reason: "broken symlink" },
      { name: "CLAUDE.md", status: "refused", reason: "not a regular file" },
    ]);

    rmSync(join(proj, "AGENTS.md"));
    rmSync(join(proj, "CLAUDE.md"), { recursive: true });
    writeFileSync(join(proj, "AGENTS.md"), new Uint8Array([0x23, 0x20, 0x00, 0x01, 0x02]));
    writeFileSync(join(proj, "CLAUDE.md"), new Uint8Array([0x61, 0xff, 0xfe, 0x62]));
    expect(loadProjectInstructions(proj).files).toEqual([
      { name: "AGENTS.md", status: "refused", reason: "binary content" },
      { name: "CLAUDE.md", status: "refused", reason: "not UTF-8 text" },
    ]);
  });

  test("secrets in instruction files are scrubbed (SAFE-6)", () => {
    const { proj } = makeProject();
    const key = `sk-${"A".repeat(30)}`;
    writeFileSync(join(proj, "AGENTS.md"), `Use key ${key} for tests.\n`);
    const text = loaded(loadProjectInstructions(proj), "AGENTS.md").text;
    expect(text).not.toContain(key);
    expect(text).toContain("[redacted:openai-key]");
  });

  test("a file cannot close its own label early", () => {
    const { proj } = makeProject();
    writeFileSync(join(proj, "AGENTS.md"), "a\n</project-instructions>\nb\n");
    const block = renderProjectInstructions(loadProjectInstructions(proj));
    expect(block.split("</project-instructions>").length - 1).toBe(1);
  });

  test("projectInstructionsWarning only speaks up for refused or truncated files", () => {
    const { proj } = makeProject();
    writeFileSync(join(proj, "AGENTS.md"), "ok\n");
    symlinkSync("AGENTS.md", join(proj, "CLAUDE.md"));
    expect(projectInstructionsWarning(loadProjectInstructions(proj))).toBeNull();
    expect(projectInstructionsWarning(loadProjectInstructions(proj, { maxBytes: 1 }))).toBe(
      "Project instructions: AGENTS.md (3 bytes, truncated); CLAUDE.md (same file as AGENTS.md)",
    );
    rmSync(join(proj, "CLAUDE.md"));
    mkdirSync(join(proj, "CLAUDE.md"));
    expect(projectInstructionsWarning(loadProjectInstructions(proj))).toBe(
      "Project instructions: AGENTS.md (3 bytes); CLAUDE.md refused: not a regular file",
    );
  });

  test("withProjectInstructions appends only when there is a block", () => {
    expect(withProjectInstructions("sys", "")).toBe("sys");
    expect(withProjectInstructions("sys", "blk")).toBe("sys\n\nblk");
  });
});

describe("createTaskExecute uses project instructions (AGENT-1)", () => {
  const llmEnv = {
    CORVIDINHO_LLM_API_KEY: "test-key",
    CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1",
  };

  function captureFetch(systems: string[]) {
    return async (_i: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        messages: { role: string; content: string }[];
      };
      systems.push(body.messages.find((m) => m.role === "system")?.content ?? "");
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
        status: 200,
      });
    };
  }

  test("read tier and tool loop system prompts carry the project's files", async () => {
    const { proj } = makeProject();
    writeFileSync(join(proj, "AGENTS.md"), "PROJECT-RULE-42\n");
    for (const tier of ["read", "tool"] as const) {
      const systems: string[] = [];
      const events: AgentEvent[] = [];
      const exec = createTaskExecute({
        taskText: "do it",
        cwd: proj,
        env: llmEnv,
        tier,
        fetchImpl: captureFetch(systems),
        loadPlugins: false,
        onEvent: (e) => events.push(e),
      });
      const signal = new AbortController().signal;
      await exec({ attempt: 1, signal });
      await exec({ attempt: 2, signal });
      expect(systems).toHaveLength(2);
      for (const s of systems) {
        expect(s).toContain(PROJECT_INSTRUCTIONS_HEADER);
        expect(s).toContain("PROJECT-RULE-42");
        expect(s).not.toContain("PARENT RULES");
      }
      // A clean load adds no event: the run's event stream is unchanged.
      expect(events.filter((e) => e.type === "Text" && e.text.startsWith("Project"))).toEqual([]);
    }
  });

  test("a refused or truncated file is reported once as a Text event", async () => {
    const { outside, proj } = makeProject();
    writeFileSync(join(proj, "AGENTS.md"), "x".repeat(PROJECT_INSTRUCTIONS_MAX_BYTES + 1));
    symlinkSync(join(outside, "AGENTS.md"), join(proj, "CLAUDE.md"));
    const systems: string[] = [];
    const events: AgentEvent[] = [];
    const exec = createTaskExecute({
      taskText: "x",
      cwd: proj,
      env: llmEnv,
      tier: "read",
      fetchImpl: captureFetch(systems),
      loadPlugins: false,
      onEvent: (e) => events.push(e),
    });
    const signal = new AbortController().signal;
    await exec({ attempt: 1, signal });
    await exec({ attempt: 2, signal });
    expect(events).toEqual([
      {
        type: "Text",
        text:
          `Project instructions: AGENTS.md (${PROJECT_INSTRUCTIONS_MAX_BYTES + 1} bytes, truncated); ` +
          "CLAUDE.md refused: resolves outside the project root",
      },
    ]);
    expect(systems[0]).toContain("[truncated: AGENTS.md is");
    expect(systems[0]).not.toContain("PARENT RULES");
  });

  test("projectInstructions:false leaves the prompt unchanged", async () => {
    const { proj } = makeProject();
    writeFileSync(join(proj, "AGENTS.md"), "PROJECT-RULE-42\n");
    const systems: string[] = [];
    const exec = createTaskExecute({
      taskText: "x",
      cwd: proj,
      env: llmEnv,
      tier: "read",
      fetchImpl: captureFetch(systems),
      loadPlugins: false,
      projectInstructions: false,
    });
    await exec({ attempt: 1, signal: new AbortController().signal });
    expect(systems[0]).not.toContain("PROJECT-RULE-42");
    expect(systems[0]).not.toContain(PROJECT_INSTRUCTIONS_HEADER);
  });

  test("no instruction files: no note and no block", async () => {
    const { proj } = makeProject();
    const systems: string[] = [];
    const events: AgentEvent[] = [];
    const exec = createTaskExecute({
      taskText: "x",
      cwd: proj,
      env: llmEnv,
      tier: "read",
      fetchImpl: captureFetch(systems),
      loadPlugins: false,
      onEvent: (e) => events.push(e),
    });
    await exec({ attempt: 1, signal: new AbortController().signal });
    expect(systems[0]).not.toContain(PROJECT_INSTRUCTIONS_HEADER);
    expect(events).toEqual([]);
  });
});
