/**
 * Language runner plugins (PLUGIN-4): node / python / cargo show up as
 * plugins when their toolchain is on PATH and degrade cleanly when it is not.
 *
 * Each toolchain is resolved once per load with `Bun.which` over the absolute
 * PATH entries only (a relative entry such as `.` would let the project pick
 * the binary). A runner whose toolchain is missing is not registered, so the
 * model is never offered a tool that cannot start; `plugins list` names what
 * is missing. `shell-exec` is separate and always registered.
 */

import { isAbsolute } from "node:path";
import { get, register } from "../../src/plugins/registry.ts";
import type { PluginCommand } from "../../src/plugins/types.ts";
import { RUNNERS, runnerCommand, type RunnerSpec } from "./commands.ts";

export type RunnerLoadReport = {
  loaded: { name: string; tool: string; bin: string }[];
  missing: { name: string; tool: string; reason: string }[];
};

/** Runner commands this module registered, with the binary each is bound to. */
const bound = new Map<string, { command: PluginCommand; bin: string }>();

/** First candidate binary found on the absolute entries of `env.PATH`, else null. */
export function resolveRunnerBin(spec: RunnerSpec, env: NodeJS.ProcessEnv): string | null {
  const dirs = (env.PATH ?? "").split(":").filter((d) => d !== "" && isAbsolute(d));
  if (dirs.length === 0) return null;
  const PATH = dirs.join(":");
  for (const candidate of spec.candidates) {
    const found = Bun.which(candidate, { PATH });
    if (found && isAbsolute(found)) return found;
  }
  return null;
}

/**
 * Register a runner for each toolchain found on PATH. Idempotent: a runner
 * this module already registered is kept (and reported) as is.
 */
export function loadRunnerPlugins(env: NodeJS.ProcessEnv = process.env): RunnerLoadReport {
  const report: RunnerLoadReport = { loaded: [], missing: [] };
  for (const spec of RUNNERS) {
    const existing = get(spec.name);
    const prev = bound.get(spec.name);
    if (existing && prev && existing === prev.command) {
      report.loaded.push({ name: spec.name, tool: spec.tool, bin: prev.bin });
      continue;
    }
    bound.delete(spec.name);
    if (existing) {
      report.missing.push({
        name: spec.name,
        tool: spec.tool,
        reason: `name already registered by ${existing.origin ?? "builtin"}`,
      });
      continue;
    }
    const bin = resolveRunnerBin(spec, env);
    if (!bin) {
      report.missing.push({
        name: spec.name,
        tool: spec.tool,
        reason: `${spec.candidates.join(" / ")} not found on PATH`,
      });
      continue;
    }
    const command = runnerCommand(spec, bin);
    register(command);
    bound.set(spec.name, { command, bin });
    report.loaded.push({ name: spec.name, tool: spec.tool, bin });
  }
  return report;
}

/** Human lines for `plugins list` (PLUGIN-4 / PLUGIN-6). */
export function runnerStatusLines(report: RunnerLoadReport): string[] {
  const head = report.loaded.length
    ? `Language runners (PLUGIN-4): ${report.loaded.map((l) => `${l.name} (${l.bin})`).join(", ")} — dangerous; allowlist the name for non-interactive runs`
    : "Language runners (PLUGIN-4): none loaded";
  const lines = [head];
  for (const m of report.missing) lines.push(`  ${m.name} not loaded: ${m.reason}`);
  return lines;
}

export { RUNNERS, runnerCommand, runRunner, runnerChildEnv } from "./commands.ts";
export type { RunnerSpec } from "./commands.ts";
