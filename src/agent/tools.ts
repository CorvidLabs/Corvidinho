/**
 * Map registered plugins → OpenAI-compatible tool definitions (AGENT-3 flesh).
 * Runtime still enforces SAFE-1 dangerous deny via runPlugin.
 * A dangerous plugin is offered only when the run's allowlist names it
 * (SAFE-1 / CLI-3); the shell, runners and Fledge core runs also need the
 * attempt's SAFE-3.a grant (src/agent/shell-gate.ts).
 */

import { isMutatingPlugin } from "../plugins/mutating.ts";
import { get, list } from "../plugins/registry.ts";
import { roleAllowsPlugin, type ActingRole } from "../plugins/roles.ts";
import type { CapabilityTier } from "./tier.ts";
import { tierAllowsPlugin } from "./tier.ts";

export type OpenAiToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: {
        argv: {
          type: "array";
          items: { type: "string" };
          description: string;
        };
      };
    };
  };
};

/**
 * SAFE-3.a: the shell, the language runners and the Fledge core runs (their
 * cwd is a start dir, not a clamp: a lane or task runs whatever commands the
 * project gives it). The allowlist offers them only to an attempt that
 * `shellToolsGate` (src/agent/shell-gate.ts) granted: the owner's own chat,
 * `/session start`, `/work` or ask answer, inside that talk's own worktree,
 * or a local `task run` at the top of the worktree it made for itself.
 * `includeDangerous` (a test seam) still offers them.
 */
export const SAFE3A_TOOLS: ReadonlySet<string> = new Set([
  "shell-exec",
  "node-exec",
  "python-exec",
  "cargo-exec",
  "fledge-lanes-run",
  "fledge-run",
]);

/**
 * GITHUB-7.a: `github-pr-merge` merges its own Corvidinho PR only when the
 * owner asks, so the allowlist offers it only to an attempt that is the
 * owner's own interactive run — the owner's chat, `/session start`, `/work`
 * or an ask answer of one, or the local CLI nothing spawned
 * (`selfMergeCallerRefusal`, plugins/github/merge.ts) — never team,
 * community, WATCH, a schedule or a worker. `includeDangerous` (a test seam)
 * still offers it.
 */
export const SELF_MERGE_TOOLS: ReadonlySet<string> = new Set(["github-pr-merge"]);

/**
 * True when the allowlist puts dangerous plugin `name` in the catalog
 * (SAFE-1 / CLI-3): named in it, and for a {@link SAFE3A_TOOLS} name only
 * when this attempt holds the SAFE-3.a grant (`safe3a`).
 */
export function allowlistOffers(
  allowlist: ReadonlySet<string> | undefined,
  name: string,
  safe3a = false,
): boolean {
  return Boolean(allowlist?.has(name)) && (safe3a || !SAFE3A_TOOLS.has(name));
}

/**
 * AGENT-4: a tool whose file edits no tool result reports (a Fledge command
 * runs arbitrary project code; the shell, runners and Fledge core runs run
 * commands). Without a
 * git snapshot to diff, a run that called one verifies anyway.
 */
export function editsFilesUnreported(name: string): boolean {
  if (SAFE3A_TOOLS.has(name)) return true;
  return Boolean(get(name)?.origin?.startsWith("fledge:"));
}

export type BuildToolsOpts = {
  tier: CapabilityTier;
  /** When true, offer every dangerous plugin (test seam; no product caller). */
  includeDangerous?: boolean;
  /**
   * SAFE-1 / CLI-3: the run's allowlist. A dangerous plugin named here is
   * offered (tier, role and SAFE-9 filters still apply), except
   * {@link SAFE3A_TOOLS} without `safe3a`; unnamed dangerous plugins stay out.
   */
  allowlist?: ReadonlySet<string>;
  /**
   * SAFE-3.a: this attempt passed `shellToolsGate` (src/agent/shell-gate.ts),
   * so the allowlisted {@link SAFE3A_TOOLS} are offered too. Default false.
   */
  safe3a?: boolean;
  /**
   * GITHUB-7.a: this attempt is the owner's own interactive run
   * (`selfMergeCallerRefusal` found nothing), so an allowlisted
   * {@link SELF_MERGE_TOOLS} tool is offered too. Default false.
   */
  selfMerge?: boolean;
  /**
   * When false (non-ADMIN acting session), omit all mutating tools (ROLES-CHAT-2).
   * Default true when unset (local CLI / no role session). Ignored when
   * `actingRole` is given.
   */
  actingIsAdmin?: boolean;
  /**
   * IDENTITY-9..12: the role this run acts with, resolved in the tool layer
   * (`resolveActingRole`). owner ⇒ every tool; team ⇒ read tools plus its
   * review tools (and work tools when `workTask`); community ⇒ read tools
   * only; null ⇒ no role session (no role filter). Wins over `actingIsAdmin`.
   */
  actingRole?: ActingRole | null;
  /** A `/work` run (team work tools, IDENTITY-10). */
  workTask?: boolean;
  /**
   * SAFE-9: when false (default), omit autonomous extras (e.g. `delegate`)
   * — offered only to sessions allowed autonomous tools (AUTONOMOUS-1).
   */
  autonomous?: boolean;
};

/**
 * Build the tools array for chat/completions.
 * Read tier → []. Dangerous plugins omitted unless allowlisted (the SAFE-3.a
 * ones only with `safe3a`) or includeDangerous; autonomous extras omitted
 * unless `autonomous` (SAFE-9).
 */
export function buildOpenAiTools(opts: BuildToolsOpts): OpenAiToolDef[] {
  const includeDangerous = Boolean(opts.includeDangerous);
  const actingIsAdmin = opts.actingIsAdmin !== false;
  const out: OpenAiToolDef[] = [];
  for (const entry of list()) {
    if (
      entry.dangerous &&
      !includeDangerous &&
      !allowlistOffers(opts.allowlist, entry.name, Boolean(opts.safe3a))
    ) {
      continue;
    }
    if (SELF_MERGE_TOOLS.has(entry.name) && !includeDangerous && !opts.selfMerge) continue;
    if (opts.actingRole !== undefined) {
      if (!roleAllowsPlugin(opts.actingRole, entry, Boolean(opts.workTask))) continue;
    } else if (!actingIsAdmin && isMutatingPlugin(entry)) continue;
    if (!opts.autonomous && get(entry.name)?.autonomous) continue;
    // AGENT-18.a: steps the agent loop runs itself are never offered.
    if (get(entry.name)?.agentTool === false) continue;
    if (!tierAllowsPlugin(opts.tier, entry.minTier)) continue;
    out.push(toolDefForEntry(entry));
  }
  return out;
}

/**
 * The exact tool definition sent for one plugin — also what the schema-cost
 * view measures (FLEDGE-5 / PLUGIN-6).
 */
export function toolDefForEntry(entry: { name: string; description: string }): OpenAiToolDef {
  const argvDesc = entry.name.startsWith("memory-")
    ? 'CLI-style argv after the command. memory-store e.g. ["--category","person","--key","identity","Leif is the owner"]; memory-recall e.g. ["--category","person"] or ["--query","name"]; forget/override need --id and --confirm.'
    : "CLI-style arguments after the command name (e.g. module name, --repo OWNER/REPO).";
  return {
    type: "function",
    function: {
      name: entry.name,
      description: entry.description,
      parameters: {
        type: "object",
        properties: {
          argv: {
            type: "array",
            items: { type: "string" },
            description: argvDesc,
          },
        },
      },
    },
  };
}

/** Parse tool-call arguments JSON into argv for runPlugin. */
export function argvFromToolArguments(raw: string | undefined): string[] {
  if (raw == null || !String(raw).trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Model sometimes sends a bare string — treat as single positional.
    const s = String(raw).trim();
    return s ? [s] : [];
  }
  if (Array.isArray(parsed)) {
    return parsed.map((x) => String(x));
  }
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.argv)) {
      return obj.argv.map((x) => String(x));
    }
    if (typeof obj.argv === "string" && obj.argv.trim()) {
      return splitLoose(obj.argv);
    }
    // Common aliases
    if (Array.isArray(obj.args)) {
      return obj.args.map((x) => String(x));
    }
    if (typeof obj.name === "string" && obj.name.trim()) {
      return [obj.name.trim()];
    }
    if (typeof obj.module === "string" && obj.module.trim()) {
      return [obj.module.trim()];
    }
    if (typeof obj.repo === "string" && obj.repo.trim()) {
      return [`--repo`, obj.repo.trim()];
    }
  }
  if (typeof parsed === "string" && parsed.trim()) {
    return splitLoose(parsed);
  }
  return [];
}

function splitLoose(s: string): string[] {
  // Minimal whitespace split; no shell metachar expansion.
  return s.trim().split(/\s+/).filter(Boolean);
}

/** Collect filesChanged from a plugin result payload when present. */
export function filesChangedFromToolData(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const fc = (data as { filesChanged?: unknown }).filesChanged;
  if (!Array.isArray(fc)) return [];
  return fc.filter((x): x is string => typeof x === "string" && x.length > 0);
}
