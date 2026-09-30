import type {
  PluginCommand,
  PluginHandlerArgs,
  PluginHandlerResult,
} from "../../src/plugins/types.ts";
import {
  activeChangeIds,
  capturedHiIds,
  citedHiIds,
  noteOpenedChange,
  repoWaysNow,
  SDD_APPROVE_TOOL,
  SDD_FINALIZE_TOOL,
  SELF_LIFECYCLE_ACTOR,
  selfLifecycleRefusal,
} from "../../src/agent/repo-ways.ts";
import {
  listRegisteredModules,
  readCompanions,
  readModuleSpec,
  refuseRootArg,
  runSpecCheck,
  spawnSpecsync,
} from "./api.ts";

function ok(ctx: PluginHandlerArgs, data: unknown, message?: string): PluginHandlerResult {
  return {
    ok: true,
    data,
    message: ctx.json ? undefined : message,
    exitCode: 0,
  };
}

function fail(error: string, exitCode = 1): PluginHandlerResult {
  return { ok: false, error, exitCode };
}

/** Refusal when the project's SpecSync change workflow is off (AGENT-18). */
export const SDD_OFF_REFUSAL =
  "refused: this project's SpecSync change workflow is off (no .specsync/sdd.json with enabled: true), " +
  "so there is no change to open or work; edit as usual (AGENT-18)";

/** A SpecSync change id: the slug `specsync change new` makes (no paths, no flags). */
const CHANGE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function invalidChangeId(id: string | undefined): string | null {
  if (id && CHANGE_ID_RE.test(id) && !id.includes("..")) return null;
  return "missing or invalid change id (a slug such as my-change; see specsync-change-list)";
}

/** Common refusals of the mutating change tools: --root, workflow off. */
async function sddToolRefusal(ctx: PluginHandlerArgs): Promise<PluginHandlerResult | null> {
  const rootRefused = refuseRootArg(ctx.args);
  if (rootRefused) return fail(rootRefused);
  if (!(await repoWaysNow(ctx.cwd)).ways.sdd) return fail(SDD_OFF_REFUSAL, 2);
  return null;
}

/**
 * AGENT-18 (hi clause guard): in a hi repo an acceptance_criteria answer
 * must cite hi ids that `hi export` shows as captured, and only those.
 */
async function hiCitationRefusal(ctx: PluginHandlerArgs, answer: string): Promise<string | null> {
  const captured = await capturedHiIds(ctx.cwd, ctx.signal);
  if (!captured) {
    return "refused: this repo keeps its criteria in hi/, and `hi export` could not be read to check the answer cites captured criteria (AGENT-18)";
  }
  const cited = citedHiIds(answer, captured.families);
  if (cited.length === 0) {
    return "refused: in a hi repo an acceptance_criteria answer cites the captured hi ids it meets (e.g. AGENT-18); this one cites none. Never invent criteria (AGENT-18)";
  }
  const missing = cited.filter((id) => !captured.ids.has(id));
  if (missing.length > 0) {
    return `refused: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not captured in hi/ (hi export); cite only captured criteria and never invent them (AGENT-18)`;
  }
  return null;
}

export const specsyncCommands: PluginCommand[] = [
  {
    name: "specsync-list",
    description:
      "List spec module names: each specs/<name>/<name>.spec.md plus the names in .specsync/registry.toml (SPECSYNC-1). Call first when you don't know the module name.",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      const names = listRegisteredModules(ctx.cwd);
      const message =
        names.length === 0
          ? "0 spec(s) registered\n(no specs registered)\n"
          : `${names.length} spec(s) registered\n${names.join("\n")}\n`;
      return ok(ctx, { count: names.length, modules: names }, message);
    },
  },
  {
    name: "specsync-read",
    description:
      "Read a module spec (specs/<name>/<name>.spec.md) before changing code it covers (SPECSYNC-1).",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      const name = ctx.args[0]?.replace(/^name=/, "");
      if (!name) return fail("missing spec name (usage: specsync-read <module>)");
      const result = readModuleSpec(ctx.cwd, name);
      if (!result.ok) return fail(result.error);
      const body = result.warning
        ? `${result.warning}\n\n${result.content}`
        : result.content;
      return ok(ctx, { path: result.path, content: result.content }, body);
    },
  },
  {
    name: "specsync-check",
    description:
      "Run the project spec check (its Fledge spec-check task if defined, else specsync check). Failures block done (SPECSYNC-2/7).",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      const result = await runSpecCheck(ctx.cwd, ctx.signal);
      if (!result.success) {
        return {
          ok: false,
          error: `spec check failed:\n${result.output}`,
          data: { output: result.output },
          exitCode: result.code || 1,
        };
      }
      return ok(ctx, { output: result.output }, result.output || "spec check passed");
    },
  },
  {
    name: "specsync-brief",
    description:
      "Read companion briefing files (context.md, tasks.md, …) for a module (SPECSYNC-5).",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      const name = ctx.args[0]?.replace(/^name=/, "");
      if (!name) return fail("missing module name (usage: specsync-brief <module>)");
      const spec = readModuleSpec(ctx.cwd, name);
      if (!spec.ok && spec.refused) return fail(spec.error);
      const companions = readCompanions(ctx.cwd, name);
      if (companions.error) return fail(companions.error);
      if (!spec.ok && companions.files.length === 0) {
        return fail(`no spec or companions found for module '${name}'`);
      }
      const parts: string[] = [];
      if (spec.ok) {
        parts.push(`# Spec: ${name}\n\n${spec.content}`);
      }
      for (const f of companions.files) {
        parts.push(`# Companion: ${name}/${f.name}\n\n${f.content}`);
      }
      const message = parts.join("\n\n---\n\n");
      return ok(
        ctx,
        {
          module: name,
          specPath: spec.ok ? spec.path : null,
          companions: companions.files.map((f) => f.name),
          text: message,
        },
        message,
      );
    },
  },
  {
    name: "specsync-coverage",
    description: "Show SpecSync coverage report (SPECSYNC-3). Local binary only.",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      const rootRefused = refuseRootArg(ctx.args);
      if (rootRefused) return fail(rootRefused);
      const result = await spawnSpecsync(ctx.cwd, ["coverage", ...ctx.args]);
      if (!result.success) {
        return fail(result.output || "specsync coverage failed", result.code || 1);
      }
      return ok(ctx, { output: result.output }, result.output);
    },
  },
  {
    name: "specsync-score",
    description:
      "Show SpecSync spec score report, 0-100 per spec (SPECSYNC-3). Optional args: module names, --explain. Local binary only.",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      const rootRefused = refuseRootArg(ctx.args);
      if (rootRefused) return fail(rootRefused);
      const result = await spawnSpecsync(ctx.cwd, ["score", ...ctx.args], ctx.signal);
      if (!result.success) {
        return fail(result.output || "specsync score failed", result.code || 1);
      }
      return ok(ctx, { output: result.output }, result.output);
    },
  },
  {
    name: "specsync-change-list",
    description: "List active SpecSync SDD changes (specsync change list).",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      const rootRefused = refuseRootArg(ctx.args);
      if (rootRefused) return fail(rootRefused);
      const result = await spawnSpecsync(ctx.cwd, ["change", "list", ...ctx.args]);
      if (!result.success) {
        return fail(result.output || "specsync change list failed", result.code || 1);
      }
      return ok(ctx, { output: result.output }, result.output);
    },
  },
  {
    name: "specsync-ship-status",
    description: "SpecSync change ship-status (cheap readiness report).",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      const rootRefused = refuseRootArg(ctx.args);
      if (rootRefused) return fail(rootRefused);
      const result = await spawnSpecsync(ctx.cwd, [
        "change",
        "ship-status",
        ...ctx.args,
      ]);
      if (!result.success) {
        return fail(result.output || "specsync change ship-status failed", result.code || 1);
      }
      return ok(ctx, { output: result.output }, result.output);
    },
  },
  {
    name: "specsync-change-status",
    description:
      "SpecSync change status: what is answered, filled and left (specsync change status [id]; AGENT-18).",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      const rootRefused = refuseRootArg(ctx.args);
      if (rootRefused) return fail(rootRefused);
      const result = await spawnSpecsync(ctx.cwd, ["change", "status", ...ctx.args], ctx.signal);
      if (!result.success) {
        return fail(result.output || "specsync change status failed", result.code || 1);
      }
      return ok(ctx, { output: result.output }, result.output);
    },
  },
  {
    name: "specsync-change-new",
    description:
      'Open a SpecSync change for your edits (AGENT-18): "<summary>" --kind <kind> --spec <module> --path <each file> (or --no-spec-change --rationale "<why>").',
    dangerous: false,
    mutating: true,
    minTier: 2,
    async handler(ctx) {
      const refused = await sddToolRefusal(ctx);
      if (refused) return refused;
      const before = new Set(activeChangeIds(ctx.cwd));
      const result = await spawnSpecsync(ctx.cwd, ["change", "new", ...ctx.args], ctx.signal);
      // AGENT-18.a: the run's own changes come from this listing, never from model text.
      const opened = activeChangeIds(ctx.cwd).filter((id) => !before.has(id));
      for (const id of opened) noteOpenedChange(ctx.cwd, id);
      if (!result.success) {
        return fail(result.output || "specsync change new failed", result.code || 1);
      }
      return ok(ctx, { opened, output: result.output }, result.output);
    },
  },
  {
    name: "specsync-change-answer",
    description:
      "Answer a SpecSync change interview question (AGENT-18): <id> <question> <answer>. In a hi repo acceptance_criteria cites captured hi ids.",
    dangerous: false,
    mutating: true,
    minTier: 2,
    async handler(ctx) {
      const refused = await sddToolRefusal(ctx);
      if (refused) return refused;
      const [id, question, ...rest] = ctx.args;
      const badId = invalidChangeId(id);
      if (badId) return fail(`${badId} (usage: specsync-change-answer <id> <question> <answer>)`);
      const answer = rest.join(" ").trim();
      if (!question || question.startsWith("-") || !answer) {
        return fail("missing question or answer (usage: specsync-change-answer <id> <question> <answer>)");
      }
      if (question === "acceptance_criteria" && (await repoWaysNow(ctx.cwd)).ways.hi) {
        const hiRefused = await hiCitationRefusal(ctx, answer);
        if (hiRefused) return fail(hiRefused, 2);
      }
      const result = await spawnSpecsync(ctx.cwd, ["change", "answer", id!, question, answer], ctx.signal);
      if (!result.success) {
        return fail(result.output || "specsync change answer failed", result.code || 1);
      }
      return ok(ctx, { output: result.output }, result.output);
    },
  },
  {
    name: SDD_APPROVE_TOOL,
    description:
      "Approve this run's own SpecSync change on Corvidinho right after a green verify (AGENT-18.a); run by the agent loop only.",
    dangerous: true,
    minTier: 2,
    agentTool: false,
    async handler(ctx) {
      const refused = await sddToolRefusal(ctx);
      if (refused) return refused;
      const id = ctx.args[0];
      const badId = invalidChangeId(id);
      if (badId || ctx.args.length !== 1) return fail(badId ?? `usage: ${SDD_APPROVE_TOOL} <id>`);
      const gate = await selfLifecycleRefusal(ctx.cwd, id!);
      if (gate) return fail(gate, 2);
      const result = await spawnSpecsync(
        ctx.cwd,
        ["change", "approve", id!, "--actor", SELF_LIFECYCLE_ACTOR],
        ctx.signal,
      );
      if (!result.success) {
        return fail(result.output || "specsync change approve failed", result.code || 1);
      }
      return ok(ctx, { id, output: result.output }, result.output);
    },
  },
  {
    name: SDD_FINALIZE_TOOL,
    description:
      "Check, review and archive this run's own SpecSync change on Corvidinho right after a green verify (AGENT-18.a); run by the agent loop only.",
    dangerous: true,
    minTier: 2,
    agentTool: false,
    async handler(ctx) {
      const refused = await sddToolRefusal(ctx);
      if (refused) return refused;
      const id = ctx.args[0];
      const badId = invalidChangeId(id);
      if (badId || ctx.args.length !== 1) return fail(badId ?? `usage: ${SDD_FINALIZE_TOOL} <id>`);
      const gate = await selfLifecycleRefusal(ctx.cwd, id!);
      if (gate) return fail(gate, 2);
      const steps: [string, string[]][] = [
        ["check", ["change", "check", id!]],
        ["review", ["change", "review", id!, "--reviewer", SELF_LIFECYCLE_ACTOR]],
        ["finalize", ["change", "finalize", id!]],
      ];
      const outputs: string[] = [];
      for (const [step, args] of steps) {
        const result = await spawnSpecsync(ctx.cwd, args, ctx.signal);
        outputs.push(result.output);
        if (!result.success) {
          return {
            ok: false,
            error: `specsync change ${step} failed: ${result.output || `exit ${result.code}`}`,
            data: { id, step, output: outputs.join("\n") },
            exitCode: result.code || 1,
          };
        }
      }
      const output = outputs.join("\n");
      return ok(ctx, { id, output }, output);
    },
  },
];
