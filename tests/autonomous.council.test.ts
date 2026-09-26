/**
 * REQ-agent-118 / REQ-plugins-118 — `council` (AUTONOMOUS-6, SAFE-9, issue #118).
 * In-process fake runners and `.ts` fake bins in mkdtemp dirs; no network,
 * no tokens, no worktrees.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CORVIDINHO_PROTOCOL_VERSION } from "../src/agent/events-ndjson.ts";
import { buildOpenAiTools, createTaskExecute } from "../src/agent/index.ts";
import {
  COUNCIL_DECISION_MAX,
  COUNCIL_ENTRY_MAX,
  COUNCIL_LENSES,
  COUNCIL_MAX_VOICES,
  COUNCIL_QUESTION_MAX,
  buildCritiqueText,
  buildDecideText,
  buildProposeText,
  capCouncilText,
  formatCouncilPhases,
  parseCouncilArgs,
  resolveCouncilTier,
  runCouncil,
  type CouncilPhase,
  type CouncilVoiceRunner,
} from "../src/autonomous/council.ts";
import {
  DELEGATE_DEPTH_ENV,
  MAX_CONCURRENT_DELEGATES,
  createDelegateLimiter,
  type DelegateChildOutcome,
} from "../src/autonomous/delegate.ts";
import { createCouncilCommand } from "../plugins/autonomous/index.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry, get, list, register } from "../src/plugins/registry.ts";
import { ROLE_REFUSED_MESSAGE } from "../src/plugins/roles.ts";
import { runPlugin } from "../src/plugins/run.ts";
import type { PluginHandlerArgs } from "../src/plugins/types.ts";

const ENABLED = "[corvidinho.autonomous]\nenabled = true\n";
const SECRET = `ghp_${"a".repeat(36)}`;

function project(toml?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "corvidinho-council-proj-"));
  if (toml !== undefined) writeFileSync(join(dir, "fledge.toml"), toml);
  return dir;
}

// ─── in-process fake runner ────────────────────────────────────────────────

type Call = { phase: CouncilPhase; voice: number; taskText: string; timeoutMs: number };

function fakeRunner(opts: {
  fail?: string[];
  delayMs?: number;
  hang?: boolean;
  throwOn?: string;
  summary?: (phase: CouncilPhase, voice: number) => string;
} = {}) {
  const calls: Call[] = [];
  let active = 0;
  let peak = 0;
  const run: CouncilVoiceRunner = async (req) => {
    calls.push({ phase: req.phase, voice: req.voice, taskText: req.taskText, timeoutMs: req.timeoutMs });
    active += 1;
    peak = Math.max(peak, active);
    try {
      const key = `${req.phase}-${req.voice}`;
      if (opts.throwOn === key) throw new Error("boom");
      if (opts.hang) {
        await new Promise<void>((resolve) => {
          if (req.signal.aborted) return resolve();
          req.signal.addEventListener("abort", () => resolve(), { once: true });
        });
      } else if (opts.delayMs) {
        await Bun.sleep(opts.delayMs);
      }
      if (req.signal.aborted) {
        const stopped: DelegateChildOutcome = {
          exitCode: 130,
          state: "cancelled",
          summary: "worker stopped: lead run was interrupted\npartial",
          filesChanged: [],
          timedOut: false,
          aborted: true,
        };
        return stopped;
      }
      const fail = opts.fail?.includes(key) ?? false;
      return {
        exitCode: fail ? 1 : 0,
        state: fail ? "failed" : "done",
        summary: opts.summary?.(req.phase, req.voice) ?? `${req.phase.toUpperCase()}-${req.voice}`,
        filesChanged: [],
        timedOut: false,
        aborted: false,
        totalTokens: 10,
      };
    } finally {
      active -= 1;
    }
  };
  return {
    run,
    calls,
    get peak() {
      return peak;
    },
  };
}

describe("council core: args, tier, prompts (REQ-agent-118)", () => {
  test("argv parse: default 3 voices, clamp to 2..5, --question takes the next item", () => {
    expect(parseCouncilArgs(["--question", "ship it?"])).toEqual({
      ok: true,
      value: { question: "ship it?", voices: 3 },
    });
    expect(parseCouncilArgs(["should", "we", "ship"])).toEqual({
      ok: true,
      value: { question: "should we ship", voices: 3 },
    });
    expect(parseCouncilArgs(["--voices", "5", "--tier", "tool", "--question", "--voices=2"])).toEqual({
      ok: true,
      value: { question: "--voices=2", voices: 5, tier: "tool" },
    });
    expect(parseCouncilArgs(["--voices=9", "q"])).toEqual({
      ok: true,
      value: { question: "q", voices: COUNCIL_MAX_VOICES, voicesRequested: 9 },
    });
    expect(parseCouncilArgs(["--voices", "1", "q"])).toEqual({
      ok: true,
      value: { question: "q", voices: 2, voicesRequested: 1 },
    });
    expect(parseCouncilArgs([]).ok).toBe(false);
    expect(parseCouncilArgs(["--question"]).ok).toBe(false);
    expect(parseCouncilArgs(["--voices", "three", "q"]).ok).toBe(false);
    expect(parseCouncilArgs(["--depth", "0", "q"]).ok).toBe(false);
    expect(parseCouncilArgs(["--question", "y".repeat(COUNCIL_QUESTION_MAX + 1)]).ok).toBe(false);
  });

  test("voice tier: read by default, tool at most, never above the lead", () => {
    expect(resolveCouncilTier("code")).toEqual({ ok: true, tier: "read", clamped: false });
    expect(resolveCouncilTier("code", "tool")).toEqual({ ok: true, tier: "tool", clamped: false });
    expect(resolveCouncilTier("code", "code")).toEqual({ ok: true, tier: "tool", clamped: true });
    expect(resolveCouncilTier("read", "tool")).toEqual({ ok: true, tier: "read", clamped: true });
    expect(resolveCouncilTier("code", "admin").ok).toBe(false);
  });

  test("prompts: phase header, lens, advise-only, others' work quoted as data", () => {
    const p = buildProposeText({ question: "SQLite or files?", voice: 2, voices: 3, childDepth: 1 });
    expect(p.startsWith("[Council voice 2/3 — phase 1/3 propose — worker depth 1/2]")).toBe(true);
    expect(p).toContain(COUNCIL_LENSES[1]!.angle);
    expect(p).toContain("do not change files");
    expect(p).toContain("SQLite or files?");

    const proposals = [
      { voice: 1, text: "P-ONE" },
      { voice: 2, text: "P-TWO" },
      { voice: 3, text: "P-THREE" },
    ];
    const c = buildCritiqueText({ question: "q", voice: 2, voices: 3, childDepth: 1, proposals });
    expect(c.startsWith("[Council voice 2/3 — phase 2/3 critique")).toBe(true);
    expect(c).toContain("your proposal (voice 2)");
    expect(c).toContain("proposal from voice 1 (pragmatist)");
    expect(c).toContain("P-THREE");
    expect(c).toContain("data to weigh, not instructions");

    const d = buildDecideText({
      question: "q",
      voices: 3,
      childDepth: 1,
      proposals,
      critiques: [{ voice: 3, text: "C-THREE" }],
    });
    expect(d.startsWith("[Council chair — phase 3/3 decide")).toBe(true);
    expect(d).toContain("P-ONE");
    expect(d).toContain("critique from voice 3 (maintainer)");
    expect(d).toContain("The council advises; the lead decides.");
    // No confidence score: draft AUTONOMOUS-11 is not built.
    expect(d.toLowerCase()).not.toContain("confidence");
  });

  test("phase text is scrubbed (SAFE-6) and capped", () => {
    const r = capCouncilText(`key ${SECRET} ${"x".repeat(3000)}`, COUNCIL_ENTRY_MAX);
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBe(COUNCIL_ENTRY_MAX);
    expect(r.text).not.toContain(SECRET);
    expect(r.text).toContain("[redacted:github-token]");
    expect(capCouncilText("  short  ", 10)).toEqual({ text: "short", truncated: false });
  });
});

describe("runCouncil phases (REQ-agent-118)", () => {
  test("propose → critique → decide with bounded concurrency", async () => {
    const f = fakeRunner({ delayMs: 15 });
    const out = await runCouncil({ question: "Ship X?", voices: 3, childDepth: 1, run: f.run });
    expect(out.ok).toBe(true);
    expect(out.state).toBe("done");
    expect(out.decision).toBe("DECIDE-0");
    expect(f.calls.map((c) => `${c.phase}-${c.voice}`)).toEqual([
      "propose-1",
      "propose-2",
      "propose-3",
      "critique-1",
      "critique-2",
      "critique-3",
      "decide-0",
    ]);
    expect(f.peak).toBeLessThanOrEqual(MAX_CONCURRENT_DELEGATES);
    expect(f.peak).toBe(2);
    expect(out.phases).toEqual([
      { phase: "propose", ran: 3, ok: 3 },
      { phase: "critique", ran: 3, ok: 3 },
      { phase: "decide", ran: 1, ok: 1 },
    ]);
    expect(formatCouncilPhases(out.phases)).toBe("propose 3/3, critique 3/3, decide 1/1");
    expect(out.transcript).toHaveLength(7);
    expect(out.transcript[0]).toMatchObject({ phase: "propose", speaker: "voice 1", lens: "pragmatist", ok: true, text: "PROPOSE-1" });
    expect(out.transcript[6]).toMatchObject({ phase: "decide", speaker: "chair", ok: true });
    expect(out.totalTokens).toBe(70);
    // Critique sees every proposal; the chair sees proposals and critiques.
    const critique2 = f.calls.find((c) => c.phase === "critique" && c.voice === 2)!;
    expect(critique2.taskText).toContain("PROPOSE-1");
    expect(critique2.taskText).toContain("PROPOSE-3");
    const decide = f.calls.find((c) => c.phase === "decide")!;
    for (const t of ["PROPOSE-1", "PROPOSE-2", "PROPOSE-3", "CRITIQUE-1", "CRITIQUE-2", "CRITIQUE-3"]) {
      expect(decide.taskText).toContain(t);
    }
  });

  test("five voices get five distinct lenses; 11 runs in all", async () => {
    const f = fakeRunner();
    const out = await runCouncil({ question: "q", voices: 5, childDepth: 1, run: f.run });
    expect(out.ok).toBe(true);
    expect(f.calls).toHaveLength(11);
    const lenses = out.transcript.filter((e) => e.phase === "propose").map((e) => e.lens);
    expect(new Set(lenses).size).toBe(5);
  });

  test("a failed proposal drops that voice from critique; the council still decides", async () => {
    const f = fakeRunner({ fail: ["propose-2"] });
    const out = await runCouncil({ question: "q", voices: 3, childDepth: 1, run: f.run });
    expect(out.ok).toBe(true);
    expect(f.calls.filter((c) => c.phase === "critique").map((c) => c.voice)).toEqual([1, 3]);
    expect(out.transcript[1]).toMatchObject({ speaker: "voice 2", ok: false, state: "failed" });
    const decide = f.calls.find((c) => c.phase === "decide")!;
    expect(decide.taskText).not.toContain("PROPOSE-2");
  });

  test("fewer than two proposals: no critique, no decision", async () => {
    const f = fakeRunner({ fail: ["propose-1", "propose-3"] });
    const out = await runCouncil({ question: "q", voices: 3, childDepth: 1, run: f.run });
    expect(out.ok).toBe(false);
    expect(out.state).toBe("failed");
    expect(out.error).toContain("only 1 of 3 voices proposed");
    expect(f.calls.every((c) => c.phase === "propose")).toBe(true);
    expect(out.decision).toBe("");
  });

  test("failed critiques still reach the chair; a failed chair means no decision", async () => {
    const a = fakeRunner({ fail: ["critique-1", "critique-2", "critique-3"] });
    const okOut = await runCouncil({ question: "q", voices: 3, childDepth: 1, run: a.run });
    expect(okOut.ok).toBe(true);
    expect(okOut.phases[1]).toEqual({ phase: "critique", ran: 3, ok: 0 });

    const b = fakeRunner({ fail: ["decide-0"] });
    const bad = await runCouncil({ question: "q", voices: 2, childDepth: 1, run: b.run });
    expect(bad.ok).toBe(false);
    expect(bad.decision).toBe("");
    expect(bad.error).toContain("chair did not reach a decision");
  });

  test("a runner that throws is a failed entry, not a crash", async () => {
    const f = fakeRunner({ throwOn: "propose-1" });
    const out = await runCouncil({ question: "q", voices: 3, childDepth: 1, run: f.run });
    expect(out.ok).toBe(true);
    expect(out.transcript[0]).toMatchObject({ ok: false, text: "voice failed: boom" });
  });

  test("entries and the decision are scrubbed and capped", async () => {
    const f = fakeRunner({ summary: (phase) => `${phase} ${SECRET} ${"z".repeat(6000)}` });
    const out = await runCouncil({ question: "q", voices: 2, childDepth: 1, run: f.run });
    expect(out.ok).toBe(true);
    for (const e of out.transcript) {
      expect(e.text).not.toContain(SECRET);
      expect(e.truncated).toBe(true);
      expect(e.text.length).toBeLessThanOrEqual(e.phase === "decide" ? COUNCIL_DECISION_MAX : COUNCIL_ENTRY_MAX);
    }
    expect(out.decision.length).toBe(COUNCIL_DECISION_MAX);
    // Later phases only ever see capped text.
    const decide = f.calls.find((c) => c.phase === "decide")!;
    expect(decide.taskText).not.toContain(SECRET);
    expect(decide.taskText.length).toBeLessThan(5 * COUNCIL_ENTRY_MAX + 2000);
  });

  test("per-voice timeout never exceeds the voice cap or the time left", async () => {
    const f = fakeRunner();
    await runCouncil({ question: "q", voices: 2, childDepth: 1, run: f.run, voiceTimeoutMs: 5000, timeoutMs: 60_000 });
    expect(f.calls.every((c) => c.timeoutMs <= 5000 && c.timeoutMs > 0)).toBe(true);
    const g = fakeRunner();
    await runCouncil({ question: "q", voices: 2, childDepth: 1, run: g.run, voiceTimeoutMs: 60_000, timeoutMs: 1000 });
    expect(g.calls.every((c) => c.timeoutMs <= 1000)).toBe(true);
  });

  test("the council time cap stops running voices and later phases", async () => {
    const f = fakeRunner({ hang: true });
    const t0 = Date.now();
    const out = await runCouncil({ question: "q", voices: 3, childDepth: 1, run: f.run, timeoutMs: 60 });
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(out.ok).toBe(false);
    expect(out.timedOut).toBe(true);
    expect(out.aborted).toBe(false);
    expect(out.state).toBe("cancelled");
    expect(out.error).toContain("council time cap reached");
    expect(f.calls.every((c) => c.phase === "propose")).toBe(true);
    // Two voices were running and got stopped; the third never started.
    expect(f.calls).toHaveLength(2);
    expect(out.transcript.map((e) => e.stopped)).toEqual([true, true, true]);
    expect(out.transcript[0]!.text.startsWith("voice stopped: council time cap reached")).toBe(true);
    expect(out.transcript[2]!.text).toBe("not started: council time cap reached");
  });

  test("lead abort stops the council (AGENT-3)", async () => {
    const f = fakeRunner({ hang: true });
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 30);
    const out = await runCouncil({ question: "q", voices: 2, childDepth: 1, run: f.run, signal: ac.signal });
    expect(out.ok).toBe(false);
    expect(out.aborted).toBe(true);
    expect(out.state).toBe("cancelled");
    expect(out.error).toContain("lead run was interrupted");

    const pre = new AbortController();
    pre.abort();
    const g = fakeRunner();
    const none = await runCouncil({ question: "q", voices: 2, childDepth: 1, run: g.run, signal: pre.signal });
    expect(g.calls).toHaveLength(0);
    expect(none.ok).toBe(false);
    expect(none.aborted).toBe(true);
  });
});

// ─── plugin + fake bin ─────────────────────────────────────────────────────

/**
 * `.ts` fake `corvidinho`: records each call (argv, selected env, env keys)
 * as a JSON file and answers with a result frame for the phase named in the
 * council header. `config.json` in its dir can fail a phase-voice key or
 * make every call sleep.
 */
function fakeBin(config: { fail?: string[]; sleepMs?: number; decisionPad?: number } = {}): { bin: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "corvidinho-council-bin-"));
  const bin = join(dir, "corvidinho.ts");
  writeFileSync(join(dir, "config.json"), JSON.stringify(config));
  const src = `
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const dir = ${JSON.stringify(dir)};
const cfg = JSON.parse(readFileSync(join(dir, "config.json"), "utf8"));
const argv = process.argv.slice(2);
const at = argv.lastIndexOf("--task");
const task = at >= 0 ? (argv[at + 1] ?? "") : "";
const m = task.match(/^\\[Council (?:voice (\\d+)\\/\\d+|chair) — phase \\d\\/3 (\\w+)/);
const phase = m?.[2] ?? "unknown";
const voice = m?.[1] ? Number(m[1]) : 0;
const pick = ["${DELEGATE_DEPTH_ENV}", "CORVIDINHO_LLM_TIER", "CORVIDINHO_NON_INTERACTIVE", "CORVIDINHO_ALLOWLIST", "CORVIDINHO_ACTING_IS_ADMIN", "CORVIDINHO_ACTING_CONFIRM_TOKENS", "CORVIDINHO_LLM_API_KEY", "GITHUB_TOKEN", "DISCORD_TOKEN", "CORVIDINHO_AUDIT_HMAC_KEY"];
const env = {};
for (const k of pick) if (process.env[k] !== undefined) env[k] = process.env[k];
writeFileSync(join(dir, "call-" + phase + "-" + voice + ".json"), JSON.stringify({ argv, task, env }));
if (cfg.sleepMs) await Bun.sleep(cfg.sleepMs);
const key = phase + "-" + voice;
const fail = (cfg.fail ?? []).includes(key);
const summary = phase === "decide" ? "DECISION: ship behind a flag" + " because".repeat(cfg.decisionPad ?? 0) : phase.toUpperCase() + "-" + voice;
const result = { summary, filesChanged: [], verified: false, verifySkipped: true, cancelled: false, state: fail ? "failed" : "done", attempts: 1 };
console.log(JSON.stringify({ protocol: ${CORVIDINHO_PROTOCOL_VERSION}, type: "usage", promptTokens: 3, completionTokens: 2, totalTokens: 5 }));
console.log(JSON.stringify({ protocol: ${CORVIDINHO_PROTOCOL_VERSION}, type: "result", result }));
process.exit(fail ? 1 : 0);
`;
  writeFileSync(bin, src);
  return { bin, dir };
}

type Recorded = { argv: string[]; task: string; env: Record<string, string> };

function callsOf(dir: string): Record<string, Recorded> {
  const out: Record<string, Recorded> = {};
  for (const f of readdirSync(dir)) {
    const m = f.match(/^call-(.+)\.json$/);
    if (m) out[m[1]!] = JSON.parse(readFileSync(join(dir, f), "utf8"));
  }
  return out;
}

function ctx(over: Partial<PluginHandlerArgs> & { cwd: string }): PluginHandlerArgs {
  return {
    args: ["--question", "Should we ship X?"],
    json: true,
    nonInteractive: true,
    allowlist: new Set<string>(["shell-exec", "files-delete"]),
    tier: "code",
    ...over,
  };
}

const BASE_ENV = { PATH: process.env.PATH ?? "" };

describe("council plugin (REQ-plugins-118)", () => {
  beforeEach(() => {
    clearRegistry();
    loadBuiltins();
  });
  afterEach(() => {
    clearRegistry();
    loadBuiltins();
  });

  test("registered and declared: safe, mutating, code tier, autonomous (PLUGIN-2/5/6)", () => {
    const cmd = get("council");
    expect(cmd).toBeDefined();
    expect(cmd!.dangerous).toBe(false);
    expect(cmd!.mutating).toBe(true);
    expect(cmd!.minTier).toBe(2);
    expect(cmd!.autonomous).toBe(true);
    expect(list().find((e) => e.name === "council")).toMatchObject({ mutating: true, minTier: 2 });
    // delegate still registered alongside.
    expect(get("delegate")).toBeDefined();
  });

  test("SAFE-9 catalog: hidden by default, code tier + allowed + ADMIN only", () => {
    for (const tier of ["read", "tool", "code"] as const) {
      expect(buildOpenAiTools({ tier }).map((t) => t.function.name)).not.toContain("council");
    }
    expect(buildOpenAiTools({ tier: "code", autonomous: true }).map((t) => t.function.name)).toContain("council");
    expect(buildOpenAiTools({ tier: "tool", autonomous: true }).map((t) => t.function.name)).not.toContain("council");
    expect(
      buildOpenAiTools({ tier: "code", autonomous: true, actingIsAdmin: false }).map((t) => t.function.name),
    ).not.toContain("council");
  });

  test("gates refuse with exit 2 and spawn nothing; bad args exit 1", async () => {
    const { bin, dir } = fakeBin();
    const on = project(ENABLED);
    const cases: [PluginHandlerArgs, NodeJS.ProcessEnv, number, string][] = [
      [ctx({ cwd: project() }), BASE_ENV, 2, "autonomous mode is off"],
      [ctx({ cwd: on }), { ...BASE_ENV, [DELEGATE_DEPTH_ENV]: "2" }, 2, "depth cap"],
      [ctx({ cwd: on, tier: "tool" }), BASE_ENV, 2, "needs the code tier"],
      [ctx({ cwd: on, tier: undefined }), BASE_ENV, 2, "needs the code tier"],
      [ctx({ cwd: on, args: [] }), BASE_ENV, 1, "missing question"],
      [ctx({ cwd: on, args: ["--tier", "admin", "q"] }), BASE_ENV, 1, "unknown tier"],
    ];
    for (const [c, env, code, msg] of cases) {
      const r = await createCouncilCommand({ bin, env }).handler(c);
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(code);
      expect(r.error).toContain(msg);
    }
    const spent = createDelegateLimiter({ maxConcurrent: 1, maxTotal: 0 });
    const r = await createCouncilCommand({ bin, env: BASE_ENV, limiter: spent }).handler(ctx({ cwd: on }));
    expect(r.exitCode).toBe(2);
    expect(r.error).toContain("council limit reached");
    expect(Object.keys(callsOf(dir))).toHaveLength(0);
  });

  test("voices are delegated read-tier, non-ADMIN workers with an empty allowlist and stripped env", async () => {
    const { bin, dir } = fakeBin();
    const env = {
      ...BASE_ENV,
      CORVIDINHO_LLM_API_KEY: "llm-key",
      GITHUB_TOKEN: "gh-token",
      DISCORD_TOKEN: "discord-token",
      CORVIDINHO_AUDIT_HMAC_KEY: "hmac",
      CORVIDINHO_ACTING_CONFIRM_TOKENS: "tok",
    };
    const r = await createCouncilCommand({ bin, env }).handler(ctx({ cwd: project(ENABLED) }));
    expect(r.ok).toBe(true);
    expect(r.exitCode).toBe(0);
    expect(r.message).toContain("council (3 voices, tier read, depth 1; propose 3/3, critique 3/3, decide 1/1) decision:");
    expect(r.message).toContain("DECISION: ship behind a flag");

    const calls = callsOf(dir);
    expect(Object.keys(calls).sort()).toEqual([
      "critique-1",
      "critique-2",
      "critique-3",
      "decide-0",
      "propose-1",
      "propose-2",
      "propose-3",
    ]);
    for (const c of Object.values(calls)) {
      expect(c.argv.slice(0, 2)).toEqual(["task", "run"]);
      expect(c.argv).toContain("--non-interactive");
      expect(c.argv).not.toContain("--no-verify");
      expect(c.argv[c.argv.indexOf("--tier") + 1]).toBe("read");
      expect(c.argv[c.argv.length - 2]).toBe("--task");
      expect(c.env).toEqual({
        [DELEGATE_DEPTH_ENV]: "1",
        CORVIDINHO_LLM_TIER: "read",
        CORVIDINHO_NON_INTERACTIVE: "1",
        // Never the lead's allowlist: a voice never runs a must-ask tool.
        CORVIDINHO_ALLOWLIST: "",
        // A CLI lead still gets non-ADMIN voices (ROLES-CHAT-2/3).
        CORVIDINHO_ACTING_IS_ADMIN: "0",
        CORVIDINHO_LLM_API_KEY: "llm-key",
      });
    }
    expect(calls["critique-2"]!.task).toContain("PROPOSE-1");
    expect(calls["critique-2"]!.task).toContain("PROPOSE-3");
    expect(calls["decide-0"]!.task).toContain("CRITIQUE-3");
    expect(calls["propose-1"]!.task).toContain("Should we ship X?");

    const data = r.data as Record<string, unknown> & { transcript: { phase: string; text: string }[] };
    expect(data).toMatchObject({
      voices: 3,
      tier: "read",
      tierClamped: false,
      depth: 1,
      state: "done",
      decision: "DECISION: ship behind a flag",
      filesChanged: [],
      totalTokens: 35,
    });
    expect(data.transcript).toHaveLength(7);
    // Voices are quoted by their own result summary.
    expect(data.transcript[0]).toMatchObject({ phase: "propose", speaker: "voice 1", text: "PROPOSE-1" });
    expect(data.transcript[6]).toMatchObject({ phase: "decide", text: "(see decision)" });
  });

  test("a long decision is not cut at the 1800-char chat body (resultText)", async () => {
    const { bin } = fakeBin({ decisionPad: 400 });
    const r = await createCouncilCommand({ bin, env: BASE_ENV }).handler(
      ctx({ cwd: project(ENABLED), args: ["--voices", "2", "q"] }),
    );
    expect(r.ok).toBe(true);
    const decision = (r.data as { decision: string }).decision;
    expect(decision.length).toBeGreaterThan(1800);
    expect(decision.length).toBeLessThanOrEqual(COUNCIL_DECISION_MAX);
    expect(decision.startsWith("DECISION: ship behind a flag because")).toBe(true);
  });

  test("--tier code is clamped to tool; --voices 2 runs 5 workers", async () => {
    const { bin, dir } = fakeBin();
    const r = await createCouncilCommand({ bin, env: BASE_ENV }).handler(
      ctx({ cwd: project(ENABLED), args: ["--voices", "2", "--tier", "code", "--question", "q"] }),
    );
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({ voices: 2, tier: "tool", tierClamped: true });
    const calls = callsOf(dir);
    expect(Object.keys(calls)).toHaveLength(5);
    expect(Object.values(calls).every((c) => c.env.CORVIDINHO_LLM_TIER === "tool")).toBe(true);
  });

  test("a council that cannot decide is ok=false with the transcript", async () => {
    const { bin } = fakeBin({ fail: ["decide-0"] });
    const r = await createCouncilCommand({ bin, env: BASE_ENV }).handler(ctx({ cwd: project(ENABLED) }));
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(1);
    expect(r.error).toContain("did not decide: the chair did not reach a decision");
    const transcript = (r.data as { transcript: { phase: string; ok: boolean; text: string }[] }).transcript;
    expect(transcript).toHaveLength(7);
    // A failed run keeps its state and exit code for the lead.
    expect(transcript[6]).toMatchObject({ phase: "decide", ok: false, state: "failed", exitCode: 1 });
  });

  test("the council time cap stops slow voices", async () => {
    const { bin } = fakeBin({ sleepMs: 30_000 });
    const t0 = Date.now();
    const r = await createCouncilCommand({ bin, env: BASE_ENV, timeoutMs: 400 }).handler(
      ctx({ cwd: project(ENABLED) }),
    );
    expect(Date.now() - t0).toBeLessThan(10_000);
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(130);
    expect(r.data).toMatchObject({ state: "cancelled", timedOut: true });
    expect(r.error).toContain("council time cap reached");
  });

  test("one council at a time; the slot is released after each", async () => {
    const { bin } = fakeBin();
    const limiter = createDelegateLimiter({ maxConcurrent: 1, maxTotal: 2 });
    const cmd = createCouncilCommand({ bin, env: BASE_ENV, limiter });
    const cwd = project(ENABLED);
    expect((await cmd.handler(ctx({ cwd, args: ["--voices", "2", "q"] }))).ok).toBe(true);
    expect(limiter.active).toBe(0);
    expect((await cmd.handler(ctx({ cwd, args: ["--voices", "2", "q"] }))).ok).toBe(true);
    const third = await cmd.handler(ctx({ cwd, args: ["--voices", "2", "q"] }));
    expect(third.exitCode).toBe(2);
  });

  test("ROLES-CHAT-3: runPlugin refuses council for a non-ADMIN role session; nothing spawned", async () => {
    const { bin, dir } = fakeBin();
    clearRegistry();
    register(createCouncilCommand({ bin, env: BASE_ENV }));
    const keys = ["CORVIDINHO_ACTING_IS_ADMIN", "CORVIDINHO_ACTING_DISCORD_USER_ID"] as const;
    const prev = keys.map((k) => process.env[k]);
    process.env.CORVIDINHO_ACTING_IS_ADMIN = "0";
    process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = "999999999999999999";
    try {
      const r = await runPlugin({
        name: "council",
        args: ["--question", "q"],
        cwd: project(ENABLED),
        nonInteractive: true,
        tier: "code",
      });
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(2);
      expect(r.error).toContain(ROLE_REFUSED_MESSAGE);
      expect(Object.keys(callsOf(dir))).toHaveLength(0);
    } finally {
      keys.forEach((k, i) => {
        if (prev[i] === undefined) delete process.env[k];
        else process.env[k] = prev[i];
      });
    }
  });
});

// ─── lead tool loop ────────────────────────────────────────────────────────

type Body = { tools?: { function: { name: string } }[]; messages: { role: string; content: string | null }[] };

function finalReply(text: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: text } }] }));
}

function toolCallReply(name: string, argv: string[]): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [{ id: "call_1", type: "function", function: { name, arguments: JSON.stringify({ argv }) } }],
          },
        },
      ],
    }),
  );
}

describe("tool loop offers council per project config (REQ-agent-118)", () => {
  beforeEach(() => {
    clearRegistry();
    loadBuiltins();
  });
  afterEach(() => {
    clearRegistry();
    loadBuiltins();
  });

  async function catalogFor(cwd: string, env: NodeJS.ProcessEnv): Promise<string[]> {
    const bodies: Body[] = [];
    const exec = createTaskExecute({
      taskText: "x",
      cwd,
      env: { CORVIDINHO_LLM_API_KEY: "k", ...env },
      fetchImpl: async (_u, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return finalReply("done");
      },
    });
    await exec({ attempt: 1, signal: new AbortController().signal });
    return (bodies[0]?.tools ?? []).map((t) => t.function.name);
  }

  test("enabled project + code tier → offered; off / tool tier / depth cap → hidden", async () => {
    const on = project(ENABLED);
    expect(await catalogFor(on, { CORVIDINHO_LLM_TIER: "code" })).toContain("council");
    expect(await catalogFor(project(), { CORVIDINHO_LLM_TIER: "code" })).not.toContain("council");
    expect(await catalogFor(on, { CORVIDINHO_LLM_TIER: "tool" })).not.toContain("council");
    expect(
      await catalogFor(on, { CORVIDINHO_LLM_TIER: "code", [DELEGATE_DEPTH_ENV]: "2" }),
    ).not.toContain("council");
  });

  test("lead convenes a council and gets the decision back", async () => {
    const { bin, dir } = fakeBin();
    clearRegistry();
    register(createCouncilCommand({ bin, env: BASE_ENV }));
    const bodies: Body[] = [];
    let call = 0;
    const exec = createTaskExecute({
      taskText: "decide the cache backend",
      cwd: project(ENABLED),
      env: { CORVIDINHO_LLM_API_KEY: "k", CORVIDINHO_LLM_TIER: "code" },
      loadPlugins: false,
      allowlist: [],
      fetchImpl: async (_u, init) => {
        call += 1;
        bodies.push(JSON.parse(String(init?.body)));
        return call === 1
          ? toolCallReply("council", ["--voices", "2", "--question", "SQLite or files?"])
          : finalReply("Going with the council: ship behind a flag.");
      },
    });
    const r = await exec({ attempt: 1, signal: new AbortController().signal });
    expect(r.summary).toBe("Going with the council: ship behind a flag.");
    expect(r.filesChanged).toEqual([]);
    const toolMsg = bodies[1]!.messages.find((m) => m.role === "tool");
    const payload = JSON.parse(String(toolMsg!.content));
    expect(payload.ok).toBe(true);
    expect(payload.data).toMatchObject({ voices: 2, tier: "read", decision: "DECISION: ship behind a flag" });
    expect(Object.keys(callsOf(dir))).toHaveLength(5);
    expect(existsSync(join(dir, "call-decide-0.json"))).toBe(true);
  });
});
