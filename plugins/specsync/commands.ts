import type {
  PluginCommand,
  PluginHandlerArgs,
  PluginHandlerResult,
} from "../../src/plugins/types.ts";
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

export const specsyncCommands: PluginCommand[] = [
  {
    name: "specsync-list",
    description:
      "List spec module names from .specsync/registry.toml, or from specs/<name>/<name>.spec.md when there is no registry (SPECSYNC-1). Call first when you don't know the module name.",
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
];
