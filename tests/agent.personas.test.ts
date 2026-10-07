/**
 * Named personas (AUTONOMOUS-2 / AUTONOMOUS-2.a, AUTONOMOUS-5 / AUTONOMOUS-5.a;
 * REQ-agent-225, REQ-cli-225, REQ-plugins-225): each named persona is its own
 * file in `personas/` next to `persona.md` (name, model, skill tags, voice);
 * the owner can run a task as one, a lead's `delegate --skill` picks one by
 * skill tag for its worker, and team / community cannot pick one. Temp dirs,
 * local git repos, fake bins and a mock provider (no network, no live keys).
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createTaskExecute, type AgentEvent } from "../src/agent/index.ts";
import { CORVIDINHO_ROOT, PERSONA_FILE, PERSONA_HEADER } from "../src/agent/persona.ts";
import {
  configuredModelEntries,
  findPersona,
  loadPersonas,
  NAMED_PERSONA_HEADER,
  parsePersonaFile,
  PERSONA_OWNER_ONLY_LINE,
  PERSONAS_MAX_FILES,
  personaForSkill,
  personaModelRefusal,
  personaRunEnv,
  renderNamedPersona,
} from "../src/agent/personas.ts";
import { resultFrame, serializeFrame } from "../src/agent/events-ndjson.ts";
import { buildCorvidinhoArgv } from "../src/agent/spawn-argv.ts";
import type { TaskResult } from "../src/agent/types.ts";
import { createDelegateCommand } from "../plugins/autonomous/index.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { clearRegistry } from "../src/plugins/registry.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import type { PluginHandlerArgs } from "../src/plugins/types.ts";

const REPO_ROOT = resolve(import.meta.dir, "..");
const CLI_BIN = join(REPO_ROOT, "src", "cli.ts");
/** Spelled out (not imported) so the file loads against the base sources. */
const PERSONA_ENV = "CORVIDINHO_DELEGATE_PERSONA";
const DEPTH_ENV = "CORVIDINHO_DELEGATE_DEPTH";
const RULES_MARK = "Rules over persona (PERSONA-3)";

let base: string;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "corvidinho-personas-"));
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

/** Test-side git (setup only), without inherited repo-locating env. */
function g(cwd: string, ...args: string[]): void {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined || k.startsWith("GIT_")) continue;
    env[k] = v;
  }
  const r = Bun.spawnSync(
    ["git", "-c", "user.name=Fixture Bot", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args],
    { cwd, env, stdout: "pipe", stderr: "pipe" },
  );
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr.toString()}`);
}

function personaText(o: { name: string; model: string; skills?: string; voice: string }): string {
  return `---\nname: ${o.name}\nmodel: ${o.model}\n${o.skills !== undefined ? `skills: ${o.skills}\n` : ""}---\n${o.voice}\n`;
}

/** A git checkout like Corvidinho's: persona.md plus `personas/<file>` committed. */
function checkout(files: Record<string, string>, name = "checkout"): string {
  const dir = join(base, name);
  mkdirSync(join(dir, "personas"), { recursive: true });
  g(dir, "init", "-q");
  writeFileSync(join(dir, PERSONA_FILE), "DEFAULT-VOICE: persona.md speaking\n");
  for (const [file, text] of Object.entries(files)) writeFileSync(join(dir, "personas", file), text);
  g(dir, "add", "-A");
  g(dir, "commit", "-q", "-m", "personas");
  return dir;
}

const REVIEWER = personaText({
  name: "reviewer",
  model: "openai:persona-model",
  skills: "[review, specsync]",
  voice: "REVIEWER-VOICE: terse and exacting 🔍",
});

const LLM_ENV = {
  CORVIDINHO_LLM_API_KEY: "test-key",
  CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1",
  CORVIDINHO_LLM_MODEL: "base-model,openai:persona-model",
};

type Seen = { model: string; system: string };

/** Mock provider: records each request's model and system message. */
function captureFetch(seen: Seen[], fail: ReadonlySet<string> = new Set()) {
  return async (_i: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      model: string;
      messages: { role: string; content: string }[];
    };
    seen.push({ model: body.model, system: body.messages.find((m) => m.role === "system")?.content ?? "" });
    if (fail.has(body.model)) return new Response("boom", { status: 500 });
    return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
  };
}

describe("persona files (AUTONOMOUS-2.a)", () => {
  test("front matter: name, model, skill tags (inline, comma or list) and the voice", () => {
    const a = parsePersonaFile(REVIEWER);
    expect(a).toEqual({
      ok: true,
      persona: {
        name: "reviewer",
        model: { kind: "openai", model: "persona-model" },
        skills: ["review", "specsync"],
        voice: "REVIEWER-VOICE: terse and exacting 🔍",
      },
    });
    const b = parsePersonaFile(
      `---\nname: "Scribe"\nmodel: 'anthropic:claude-x'\ndescription: ignored\nskills:\n  - Docs\n  - docs\n  - release-notes\n---\n\nScribe voice\n`,
    );
    expect(b.ok && b.persona).toEqual({
      name: "scribe",
      model: { kind: "anthropic", model: "claude-x" },
      skills: ["docs", "release-notes"],
      voice: "Scribe voice",
    });
    const c = parsePersonaFile(personaText({ name: "plain", model: "ollama:qwen3:30b", skills: "a, b", voice: "v" }));
    expect(c.ok && c.persona.skills).toEqual(["a", "b"]);
    expect(c.ok && c.persona.model).toEqual({ kind: "ollama", model: "qwen3:30b" });
    // No skill tags is fine: the owner can still run it by name.
    expect(parsePersonaFile(personaText({ name: "solo", model: "m", voice: "v" })).ok).toBe(true);
  });

  test("bad files are refused with one plain reason", () => {
    const reason = (t: string) => {
      const r = parsePersonaFile(t);
      return r.ok ? "ok" : r.reason;
    };
    expect(reason("just a voice\n")).toContain("no front matter");
    expect(reason("---\nname: x\nmodel: m\nvoice\n")).toContain("not closed");
    expect(reason("---\nmodel: m\n---\nv\n")).toBe("no name in the front matter");
    expect(reason("---\nname: Not A Label\nmodel: m\n---\nv\n")).toContain("name must be a short label");
    expect(reason("---\nname: x\n---\nv\n")).toBe("no model in the front matter");
    expect(reason("---\nname: x\nmodel: a,b\n---\nv\n")).toContain("one kind:model entry");
    expect(reason("---\nname: x\nmodel: m\nskills: [ok, not ok]\n---\nv\n")).toContain('skill tag "not ok"');
    const many = Array.from({ length: 17 }, (_, i) => `s${i}`).join(", ");
    expect(reason(`---\nname: x\nmodel: m\nskills: [${many}]\n---\nv\n`)).toContain("too many skill tags");
    expect(reason("---\nname: x\nmodel: m\n---\n\n  \n")).toContain("no voice");
    expect(reason("---\nname: x\nname: y\nmodel: m\n---\nv\n")).toContain("repeats name");
  });

  test("loaded like persona.md: committed only, untracked refused, edits not loaded, names unique, sorted", () => {
    const dir = checkout({
      "b-reviewer.md": REVIEWER,
      "a-scribe.md": personaText({ name: "scribe", model: "m2", skills: "[docs]", voice: "SCRIBE" }),
      "c-dupe.md": personaText({ name: "reviewer", model: "m3", voice: "DUPE" }),
      "d-bad.md": "no front matter\n",
      ".hidden.md": personaText({ name: "hidden", model: "m", voice: "h" }),
      "notes.txt": "not a persona",
    });
    writeFileSync(join(dir, "personas", "e-untracked.md"), personaText({ name: "ghost", model: "m", voice: "g" }));
    writeFileSync(join(dir, "personas", "a-scribe.md"), personaText({ name: "scribe", model: "m2", voice: "EDITED" }));
    const set = loadPersonas(dir);
    expect(set.personas.map((p) => [p.name, p.file])).toEqual([
      ["reviewer", "personas/b-reviewer.md"],
      ["scribe", "personas/a-scribe.md"],
    ]);
    const scribe = set.personas.find((p) => p.name === "scribe")!;
    expect(scribe.voice).toBe("SCRIBE");
    expect(scribe.uncommitted).toBe(true);
    expect(set.refused).toEqual([
      { file: "personas/c-dupe.md", reason: "name reviewer is already used by personas/b-reviewer.md" },
      { file: "personas/d-bad.md", reason: expect.stringContaining("no front matter") },
      { file: "personas/e-untracked.md", reason: "not committed (only the committed copy is loaded)" },
    ]);
    expect(set.skipped).toBe(0);
  });

  test("a plain (non-git) root reads its working tree; no folder means no personas; at most 32 files", () => {
    const plain = join(base, "plain");
    mkdirSync(join(plain, "personas"), { recursive: true });
    for (let i = 0; i < PERSONAS_MAX_FILES + 2; i++) {
      writeFileSync(
        join(plain, "personas", `p${String(i).padStart(2, "0")}.md`),
        personaText({ name: `p${i}`, model: "m", voice: "v" }),
      );
    }
    const set = loadPersonas(plain);
    expect(set.personas).toHaveLength(PERSONAS_MAX_FILES);
    expect(set.skipped).toBe(2);
    const empty = join(base, "empty");
    mkdirSync(empty);
    expect(loadPersonas(empty)).toEqual({ root: empty, personas: [], refused: [], skipped: 0 });
  });

  test("findPersona: by name, else why (refused file, or the names there are)", () => {
    const dir = checkout({ "reviewer.md": REVIEWER, "broken.md": "nope\n" });
    const set = loadPersonas(dir);
    const ok = findPersona(set, " Reviewer ");
    expect(ok.ok && ok.persona.name).toBe("reviewer");
    const broken = findPersona(set, "broken");
    expect(!broken.ok && broken.error).toContain('Persona "broken": personas/broken.md refused: no front matter');
    const ghost = findPersona(set, "ghost");
    expect(!ghost.ok && ghost.error).toBe(
      'Persona "ghost" not found in personas/ (named personas: reviewer); nothing was run (AUTONOMOUS-2.a).',
    );
    const bad = findPersona(set, "../persona");
    expect(!bad.ok && bad.error).toContain("Persona name must be a short label");
  });

  test("personaForSkill: exact tag match, ties go to the first by name, none is null (AUTONOMOUS-5.a)", () => {
    const dir = checkout({
      "1.md": personaText({ name: "zeta", model: "m", skills: "[review]", voice: "Z" }),
      "2.md": personaText({ name: "alpha", model: "m", skills: "[review, docs]", voice: "A" }),
      "3.md": personaText({ name: "mid", model: "m", skills: "[reviews]", voice: "M" }),
    });
    const set = loadPersonas(dir);
    expect(personaForSkill(set, "review")?.name).toBe("alpha");
    expect(personaForSkill(set, "Docs")?.name).toBe("alpha");
    expect(personaForSkill(set, "reviews")?.name).toBe("mid");
    expect(personaForSkill(set, "revie")).toBeNull();
    expect(personaForSkill(set, "security")).toBeNull();
  });

  test("the model must be one I configured; the run env puts it first, then the tier's others", () => {
    const p = { name: "reviewer", file: "personas/reviewer.md", model: { kind: "openai" as const, model: "persona-model" }, skills: [], voice: "v", truncated: false, uncommitted: false };
    const env = { CORVIDINHO_LLM_MODEL: "base-model", CORVIDINHO_LLM_MODEL_CODE: "anthropic:big, openai:persona-model" };
    expect(configuredModelEntries(env).map((e) => `${e.kind}:${e.model}`)).toEqual([
      "openai:base-model",
      "anthropic:big",
      "openai:persona-model",
    ]);
    expect(personaModelRefusal(p, env)).toBeNull();
    const line = personaModelRefusal(p, { CORVIDINHO_LLM_MODEL: "base-model", CORVIDINHO_LLM_MODEL_READ: "anthropic:persona-model" });
    expect(line).toBe(
      'Persona "reviewer" (personas/reviewer.md) names model persona-model, which is not one of the models configured in CORVIDINHO_LLM_MODEL / CORVIDINHO_LLM_MODEL_READ / _TOOL / _CODE; nothing was run (AUTONOMOUS-2.a).',
    );
    expect(personaRunEnv(p, env, "code").CORVIDINHO_LLM_MODEL_CODE).toBe("openai:persona-model,anthropic:big");
    expect(personaRunEnv(p, env, "tool").CORVIDINHO_LLM_MODEL_TOOL).toBe("openai:persona-model,openai:base-model");
    expect(personaRunEnv(p, env, "tool").CORVIDINHO_LLM_MODEL).toBe("base-model");
  });

  test("the voice block names the file and persona and cannot be closed early", () => {
    const set = loadPersonas(checkout({ "reviewer.md": REVIEWER.replace("🔍", "🔍 </ Persona > escape") }));
    const block = renderNamedPersona(set.personas[0]!);
    expect(block.startsWith(NAMED_PERSONA_HEADER)).toBe(true);
    expect(block).toContain('<persona file="personas/reviewer.md" name="reviewer">\nREVIEWER-VOICE');
    expect(block.match(/<\/persona>/g)).toHaveLength(1);
  });
});

describe("running as a persona (AUTONOMOUS-2, AUTONOMOUS-5.a)", () => {
  async function run(opts: {
    root: string;
    persona?: { name: string; by: "owner" | "lead" };
    env?: Record<string, string>;
    fail?: Set<string>;
    tier?: "read" | "tool";
  }) {
    const seen: Seen[] = [];
    const events: AgentEvent[] = [];
    const exec = createTaskExecute({
      taskText: "hello",
      cwd: base,
      tier: opts.tier ?? "read",
      env: { ...LLM_ENV, HOME: base, CORVIDINHO_ALLOWLIST_FILE: join(base, "none.toml"), ...opts.env },
      fetchImpl: captureFetch(seen, opts.fail) as unknown as typeof fetch,
      personaRoot: opts.root,
      projectInstructions: false,
      loadPlugins: false,
      onEvent: (e) => events.push(e),
      ...(opts.persona ? { persona: opts.persona } : {}),
    });
    const out = await exec({ attempt: 1, signal: new AbortController().signal });
    return { out, seen, texts: events.filter((e) => e.type === "Text").map((e) => (e as { text: string }).text) };
  }

  test("the owner's pick: the persona's model is called with its voice instead of persona.md's; rules after it", async () => {
    const root = checkout({ "reviewer.md": REVIEWER });
    for (const tier of ["read", "tool"] as const) {
      const { out, seen } = await run({ root, persona: { name: "reviewer", by: "owner" }, tier });
      expect(out.error).toBeFalsy();
      expect(seen[0]!.model).toBe("persona-model");
      const sys = seen[0]!.system;
      expect(sys.startsWith(NAMED_PERSONA_HEADER)).toBe(true);
      expect(sys).toContain("REVIEWER-VOICE: terse and exacting");
      expect(sys).not.toContain("DEFAULT-VOICE");
      expect(sys).not.toContain(PERSONA_HEADER);
      expect(sys.indexOf(RULES_MARK)).toBeGreaterThan(sys.indexOf("</persona>"));
    }
    // No persona picked: persona.md and the tier's first model, as before (PERSONA-2).
    const plain = await run({ root });
    expect(plain.seen[0]!.model).toBe("base-model");
    expect(plain.seen[0]!.system).toContain("DEFAULT-VOICE");
  });

  test("its model failing falls back to the tier's next model, with the AGENT-11 notice", async () => {
    const root = checkout({ "reviewer.md": REVIEWER });
    const { out, seen, texts } = await run({ root, persona: { name: "reviewer", by: "owner" }, fail: new Set(["persona-model"]) });
    expect(out.error).toBeFalsy();
    expect(seen.map((s) => s.model)).toEqual(["persona-model", "base-model"]);
    expect(texts.some((t) => t.includes("persona-model") && t.includes("base-model"))).toBe(true);
  });

  test("an unconfigured model, an unknown persona: one plain line, nothing called", async () => {
    const root = checkout({
      "reviewer.md": REVIEWER,
      "rogue.md": personaText({ name: "rogue", model: "anthropic:not-configured", voice: "R" }),
    });
    const rogue = await run({ root, persona: { name: "rogue", by: "owner" } });
    expect(rogue.seen).toEqual([]);
    expect(rogue.out.error).toBe(true);
    expect(rogue.out.summary).toContain('Persona "rogue" (personas/rogue.md) names model anthropic:not-configured');
    expect(rogue.out.failureReason).toBe(rogue.out.summary);
    const ghost = await run({ root, persona: { name: "ghost", by: "owner" } });
    expect(ghost.seen).toEqual([]);
    expect(ghost.out.summary).toBe(
      'Persona "ghost" not found in personas/ (named personas: reviewer, rogue); nothing was run (AUTONOMOUS-2.a).',
    );
  });

  test("team and community can't pick a persona; the owner's role session can", async () => {
    const root = checkout({ "reviewer.md": REVIEWER });
    const allow = join(base, "allow.toml");
    writeFileSync(allow, `[owner]\ndiscord_id = "111"\n\n[people.tofu]\nrole = "team"\ndiscord_ids = ["222"]\n`);
    const stamp = (id: string, admin: string, role: string) => ({
      CORVIDINHO_ALLOWLIST_FILE: allow,
      CORVIDINHO_ACTING_IS_ADMIN: admin,
      CORVIDINHO_ACTING_DISCORD_USER_ID: id,
      CORVIDINHO_ACTING_ROLE: role,
    });
    for (const env of [stamp("222", "0", "team"), stamp("333", "0", "community")]) {
      const r = await run({ root, persona: { name: "reviewer", by: "owner" }, env });
      expect(r.seen).toEqual([]);
      expect(r.out.summary).toBe(PERSONA_OWNER_ONLY_LINE);
    }
    const owner = await run({ root, persona: { name: "reviewer", by: "owner" }, env: stamp("111", "1", "owner") });
    expect(owner.seen[0]!.model).toBe("persona-model");
  });

  test("a lead's pick reaches only a delegate worker (depth > 0)", async () => {
    const root = checkout({ "reviewer.md": REVIEWER });
    const top = await run({ root, persona: { name: "reviewer", by: "lead" } });
    expect(top.seen).toEqual([]);
    expect(top.out.summary).toContain("picked by a lead only for its delegate worker");
    const worker = await run({
      root,
      persona: { name: "reviewer", by: "lead" },
      env: { [DEPTH_ENV]: "1", CORVIDINHO_ACTING_IS_ADMIN: "0" },
    });
    expect(worker.seen[0]!.model).toBe("persona-model");
    expect(worker.seen[0]!.system).toContain("REVIEWER-VOICE");
  });

  test("a committed edit shows on the next run; a working-tree edit is not loaded and gets one note", async () => {
    const root = checkout({ "reviewer.md": REVIEWER });
    writeFileSync(join(root, "personas", "reviewer.md"), REVIEWER.replace("REVIEWER-VOICE", "PLANTED-VOICE"));
    const planted = await run({ root, persona: { name: "reviewer", by: "owner" } });
    expect(planted.seen[0]!.system).not.toContain("PLANTED-VOICE");
    expect(planted.texts).toContain("Persona: personas/reviewer.md (committed copy; working-tree changes not loaded)");
    g(root, "commit", "-qam", "edit");
    const next = await run({ root, persona: { name: "reviewer", by: "owner" } });
    expect(next.seen[0]!.system).toContain("PLANTED-VOICE");
  });
});

/** Run the real CLI (`task run --here`) in a plain temp dir with only `env`. */
async function cli(args: string[], env: Record<string, string>, cwd: string) {
  const proc = Bun.spawn(buildCorvidinhoArgv(CLI_BIN, ["task", "run", "--here", ...args, "--output", "json"]), {
    cwd,
    env: { PATH: process.env.PATH ?? "", HOME: cwd, TMPDIR: process.env.TMPDIR ?? tmpdir(), ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  let summary = "";
  try {
    summary = (JSON.parse(out) as { result: { summary: string } }).result.summary;
  } catch {
    summary = "";
  }
  return { code, summary, err };
}

describe("task run --persona (REQ-cli-225)", () => {
  const MODEL_ENV = {
    CORVIDINHO_LLM_MODEL: "test-model",
    CORVIDINHO_LLM_API_KEY: "k",
    // Nothing listens here: a run that calls the model fails fast.
    CORVIDINHO_LLM_BASE_URL: "http://127.0.0.1:9/v1",
  };

  test("an unknown persona fails with its line and calls no model", async () => {
    const r = await cli(["--persona", "ghost-xyz", "--task", "hi"], MODEL_ENV, base);
    expect(r.code).toBe(1);
    expect(r.summary).toContain('Persona "ghost-xyz" not found in personas/');
  });

  test("--persona with no name is a usage error", async () => {
    const r = await cli(["--task", "hi", "--persona"], MODEL_ENV, base);
    expect(r.code).toBe(1);
    expect(r.err).toContain("--persona needs a name");
  });

  test("a non-owner role session is refused before anything else", async () => {
    const allow = join(base, "allow.toml");
    writeFileSync(allow, "");
    const r = await cli(["--persona", "ghost-xyz", "--task", "hi"], {
      ...MODEL_ENV,
      CORVIDINHO_ALLOWLIST_FILE: allow,
      CORVIDINHO_ACTING_IS_ADMIN: "0",
      CORVIDINHO_ACTING_ROLE: "community",
      CORVIDINHO_ACTING_DISCORD_USER_ID: "333",
    }, base);
    expect(r.code).toBe(1);
    expect(r.summary).toBe(PERSONA_OWNER_ONLY_LINE);
  });

  test("a delegate worker takes its lead's pick from env; a top-level run never does", async () => {
    const worker = await cli(["--task", "hi"], { ...MODEL_ENV, [DEPTH_ENV]: "1", [PERSONA_ENV]: "ghost-xyz" }, base);
    expect(worker.summary).toContain('Persona "ghost-xyz" not found in personas/');
    const top = await cli(["--task", "hi"], { ...MODEL_ENV, [PERSONA_ENV]: "ghost-xyz" }, base);
    expect(top.code).toBe(1);
    expect(top.summary).not.toContain("Persona");
  });
});

describe("delegate --skill routes to a persona (AUTONOMOUS-5.a, REQ-plugins-225)", () => {
  const DONE: TaskResult = {
    summary: "worker summary",
    filesChanged: [],
    verified: false,
    verifySkipped: true,
    cancelled: false,
    state: "done",
    attempts: 1,
  };

  function fakeBin(): { bin: string; dir: string } {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-personas-bin-"));
    const bin = join(dir, "corvidinho");
    writeFileSync(
      bin,
      `#!/bin/sh\nprintf '%s' "\${${PERSONA_ENV}-UNSET}" > "${dir}/persona.txt"\ncat <<'EOF'\n${serializeFrame(resultFrame(DONE))}\nEOF\n`,
      { mode: 0o755 },
    );
    return { bin, dir };
  }

  function project(): string {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-personas-proj-"));
    writeFileSync(join(dir, "fledge.toml"), "[corvidinho.autonomous]\nenabled = true\n");
    return dir;
  }

  function args(skill: string | null, cwd: string): PluginHandlerArgs {
    return {
      args: [...(skill ? ["--skill", skill] : []), "--task", "do the subtask"],
      json: true,
      nonInteractive: true,
      allowlist: new Set<string>(),
      tier: "code",
      cwd,
    };
  }

  const ROOT_FILES = {
    "z.md": personaText({ name: "zeta", model: "openai:persona-model", skills: "[review]", voice: "Z" }),
    "a.md": personaText({ name: "alpha", model: "openai:persona-model", skills: "[review]", voice: "A" }),
    "r.md": personaText({ name: "rogue", model: "anthropic:not-configured", skills: "[security]", voice: "R" }),
  };
  const LEAD_ENV = { PATH: process.env.PATH ?? "", CORVIDINHO_LLM_MODEL: "base-model,openai:persona-model" };

  test("a matching skill tag runs the worker as the first persona by name", async () => {
    const root = checkout(ROOT_FILES);
    const { bin, dir } = fakeBin();
    const cmd = createDelegateCommand({ bin, env: LEAD_ENV, personaRoot: root } as Parameters<typeof createDelegateCommand>[0]);
    const r = await cmd.handler(args("review", project()));
    expect(r.ok).toBe(true);
    expect(readFileSync(join(dir, "persona.txt"), "utf8")).toBe("alpha");
    expect((r.data as { persona?: unknown }).persona).toBe("alpha");
    expect(r.message).toContain("[review → persona alpha]");
  });

  test("no match, or no skill: today's worker, and an inherited persona never reaches it", async () => {
    const root = checkout(ROOT_FILES);
    for (const skill of ["docs", null]) {
      const { bin, dir } = fakeBin();
      const cmd = createDelegateCommand({
        bin,
        env: { ...LEAD_ENV, [PERSONA_ENV]: "zeta" },
        personaRoot: root,
      } as Parameters<typeof createDelegateCommand>[0]);
      const r = await cmd.handler(args(skill, project()));
      expect(r.ok).toBe(true);
      expect(readFileSync(join(dir, "persona.txt"), "utf8")).toBe("UNSET");
      expect((r.data as { persona?: unknown }).persona ?? null).toBeNull();
    }
  });

  test("a matched persona whose model I did not configure is refused; no worker starts", async () => {
    const root = checkout(ROOT_FILES);
    const { bin, dir } = fakeBin();
    const cmd = createDelegateCommand({ bin, env: LEAD_ENV, personaRoot: root } as Parameters<typeof createDelegateCommand>[0]);
    const r = await cmd.handler(args("security", project()));
    expect(r.ok).toBe(false);
    expect(r.error).toContain('refused: Persona "rogue" (personas/r.md) names model anthropic:not-configured');
    expect(existsSync(join(dir, "persona.txt"))).toBe(false);
  });
});

describe("SAFE-2: the file tools never change Corvidinho's personas/ (REQ-plugins-225)", () => {
  test("write, edit and delete under the live personas/ folder are refused; a project's own personas/ is not", async () => {
    clearRegistry();
    loadBuiltins();
    const liveDir = join(CORVIDINHO_ROOT, "personas");
    const hadDir = existsSync(liveDir);
    const probe = `probe-${process.pid}-${Date.now()}.md`;
    try {
      const calls = [
        { name: "files-write", args: [`personas/${probe}`, "HACKED"] },
        { name: "files-write", args: [join(liveDir, probe), "HACKED"] },
        { name: "files-edit", args: [`personas/${probe}`, "--old", "a", "--new", "b"] },
        { name: "files-delete", args: [`personas/${probe}`] },
      ];
      for (const c of calls) {
        const r = await runPlugin({ ...c, cwd: CORVIDINHO_ROOT, nonInteractive: true, allowlist: ["files-delete"] });
        expect(r.ok).toBe(false);
        expect(r.error).toContain("refused (SAFE-2)");
        expect(r.error).toContain("personas/");
      }
      expect(existsSync(join(liveDir, probe))).toBe(false);
      const other = join(base, "proj");
      mkdirSync(join(other, "personas"), { recursive: true });
      const ok = await runPlugin({ name: "files-write", args: ["personas/x.md", "fine"], cwd: other, nonInteractive: true });
      expect(ok.ok).toBe(true);
    } finally {
      rmSync(join(liveDir, probe), { force: true });
      if (!hadDir) rmSync(liveDir, { recursive: true, force: true });
    }
  });
});
