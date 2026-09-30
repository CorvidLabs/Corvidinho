/**
 * AUTONOMY-9/9.a for the Fledge commands (#97): `fledge-run <task>` and
 * `fledge-lanes-run <lane>` ask when the commands they run name a prod or
 * deploy tool; a discovered `fledge-<command>` asks when its name or argv
 * does.
 *
 * A task's command text comes from the project's `fledge.toml` (`[tasks]`
 * `name = "cmd"` or `[tasks.<name>] cmd = "…"`, with its `deps`), a lane's
 * steps from `[lanes.<name>] steps` there or in `.fledge/lanes/*.toml`
 * (a task name, `{ run = "…" }`, `{ task = "…" }`, `{ parallel = […] }`). Each command is read
 * like a `shell-exec` command (plugins/shell/must-ask.ts, package scripts and
 * recipes resolved); anything that can't be read — no such task, a step form
 * not known here, a lane source that doesn't parse — asks. With no
 * fledge.toml fledge runs nothing (it refuses), so nothing asks.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { prodTextWhy } from "../../src/plugins/must-ask.ts";
import type { MustAskClassifier, MustAskVerdict } from "../../src/plugins/types.ts";
import { taskCommandProdWhy } from "../shell/must-ask.ts";

const MAX_READ_BYTES = 1 << 20;
const MAX_DEPTH = 8;
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;

type Sources = { tasks: Record<string, unknown>; lanes: Record<string, unknown> };

function readToml(path: string): Record<string, unknown> | null | "missing" {
  let text: string;
  try {
    const st = statSync(path);
    if (!st.isFile() || st.size > MAX_READ_BYTES) return null;
    text = readFileSync(path, "utf8");
  } catch {
    return "missing";
  }
  try {
    return Bun.TOML.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function table(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/**
 * Tasks and lanes of the project at `root`; null when a source doesn't
 * parse; "none" with no fledge.toml (fledge then refuses to run anything).
 */
function laneSources(root: string): Sources | null | "none" {
  const out: Sources = { tasks: {}, lanes: {} };
  if (readToml(join(root, "fledge.toml")) === "missing") return "none";
  const files = [join(root, "fledge.toml")];
  try {
    for (const e of readdirSync(join(root, ".fledge", "lanes")).sort()) {
      if (e.toLowerCase().endsWith(".toml")) files.push(join(root, ".fledge", "lanes", e));
    }
  } catch {
    /* no lanes dir */
  }
  for (const f of files) {
    const doc = readToml(f);
    if (doc === "missing") continue;
    if (doc === null) return null;
    // fledge.toml first; an imported lane file adds only names it lacks.
    out.tasks = { ...table(doc.tasks), ...out.tasks };
    out.lanes = { ...table(doc.lanes), ...out.lanes };
  }
  return out;
}

type Walk = { root: string; env: NodeJS.ProcessEnv; src: Sources; seen: Set<string> };

const cantRead = (what: string) => `can't read what ${what} runs, so it asks`;

function commandWhy(cmd: string, w: Walk): string | null {
  return prodTextWhy(cmd) ?? taskCommandProdWhy(cmd, w.root, { env: w.env });
}

function taskWhy(name: string, w: Walk, depth: number): string | null {
  if (depth > MAX_DEPTH) return cantRead(`fledge task \`${name}\``);
  if (w.seen.has(`task:${name}`)) return null;
  w.seen.add(`task:${name}`);
  const def = w.src.tasks[name];
  if (typeof def === "string") {
    const why = commandWhy(def, w);
    return why ? `fledge task \`${name}\` ${why}` : null;
  }
  if (def && typeof def === "object" && !Array.isArray(def)) {
    const t = def as Record<string, unknown>;
    if (typeof t.cmd !== "string") return cantRead(`fledge task \`${name}\``);
    const why = commandWhy(t.cmd, w);
    if (why) return `fledge task \`${name}\` ${why}`;
    const deps = t.deps ?? t.depends_on;
    if (deps !== undefined) {
      if (!Array.isArray(deps)) return cantRead(`fledge task \`${name}\``);
      for (const d of deps) {
        if (typeof d !== "string") return cantRead(`fledge task \`${name}\``);
        const dw = taskWhy(d, w, depth + 1);
        if (dw) return dw;
      }
    }
    return null;
  }
  return cantRead(`fledge task \`${name}\` (no such task in fledge.toml)`);
}

function stepWhy(step: unknown, lane: string, w: Walk, depth: number): string | null {
  if (typeof step === "string") {
    if (w.src.tasks[step] !== undefined) return taskWhy(step, w, depth + 1);
    return cantRead(`step \`${step}\` of lane \`${lane}\``);
  }
  const s = table(step);
  if (typeof s.run === "string" && Object.keys(s).length === 1) {
    const why = commandWhy(s.run, w);
    return why ? `lane \`${lane}\` step \`${s.run.slice(0, 60)}\` ${why}` : null;
  }
  if (typeof s.task === "string" && Object.keys(s).length === 1) {
    return w.src.tasks[s.task] !== undefined
      ? taskWhy(s.task, w, depth + 1)
      : cantRead(`step \`${s.task}\` of lane \`${lane}\``);
  }
  if (Array.isArray(s.parallel) && Object.keys(s).length === 1) {
    for (const p of s.parallel) {
      const why = stepWhy(p, lane, w, depth + 1);
      if (why) return why;
    }
    return null;
  }
  return cantRead(`a step of lane \`${lane}\``);
}

function laneWhy(name: string, w: Walk): string | null {
  const def = table(w.src.lanes[name]);
  if (!Array.isArray(def.steps)) return cantRead(`fledge lane \`${name}\` (no such lane)`);
  for (const step of def.steps) {
    const why = stepWhy(step, name, w, 0);
    if (why) return why;
  }
  return null;
}

const ask = (why: string, root: string, text: string): MustAskVerdict => ({
  ask: { class: "prod", why, target: `the project's own commands, in ${root}`, text },
});

/** `fledge-run <task> [args…]`: the task's commands and its args. */
export const fledgeRunMustAsk: MustAskClassifier = ({ args, cwd, env }) => {
  const task = args[0];
  if (task === undefined || !NAME_RE.test(task)) return null; // the handler's usage error
  const root = resolve(cwd);
  const text = `fledge run ${args.join(" ")}`;
  const src = laneSources(root);
  if (src === "none") return null;
  if (!src) return ask(cantRead(`fledge task \`${task}\` (a lane source doesn't parse)`), root, text);
  const w: Walk = { root, env, src, seen: new Set() };
  const extra = args.slice(1);
  const why =
    taskWhy(task, w, 0) ??
    (extra.length > 0 ? prodTextWhy(extra.join("\n")) : null);
  return why ? ask(why, root, text) : null;
};

/** `fledge-lanes-run <lane>`: every command its steps run. */
export const fledgeLanesRunMustAsk: MustAskClassifier = ({ args, cwd, env }) => {
  const lane = args[0];
  if (args.length !== 1 || lane === undefined || !NAME_RE.test(lane)) return null;
  const root = resolve(cwd);
  const text = `fledge lanes run ${lane}`;
  const src = laneSources(root);
  if (src === "none") return null;
  if (!src) return ask(cantRead(`fledge lane \`${lane}\` (a lane source doesn't parse)`), root, text);
  const why = laneWhy(lane, { root, env, src, seen: new Set() });
  return why ? ask(why, root, text) : null;
};

/** A discovered `fledge-<command>`: table words in its command name and argv. */
export function fledgePluginMustAsk(command: string): MustAskClassifier {
  return ({ args, cwd }) => {
    const why = prodTextWhy([command, ...args].join("\n"));
    return why
      ? ask(`Fledge plugin command \`${command}\` ${why}`, resolve(cwd), `fledge plugins run ${command} -- ${args.join(" ")}`)
      : null;
  };
}
