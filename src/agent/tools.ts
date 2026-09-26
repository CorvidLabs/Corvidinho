/**
 * Map registered plugins → OpenAI-compatible tool definitions (AGENT-3 flesh).
 * Runtime still enforces SAFE-1 dangerous deny via runPlugin.
 */

import { list } from "../plugins/registry.ts";
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

export type BuildToolsOpts = {
  tier: CapabilityTier;
  /** When false (default), omit dangerous plugins from the catalog entirely. */
  includeDangerous?: boolean;
};

/**
 * Build the tools array for chat/completions.
 * Read tier → []. Dangerous plugins omitted unless includeDangerous.
 */
export function buildOpenAiTools(opts: BuildToolsOpts): OpenAiToolDef[] {
  const includeDangerous = Boolean(opts.includeDangerous);
  const out: OpenAiToolDef[] = [];
  for (const entry of list()) {
    if (entry.dangerous && !includeDangerous) continue;
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
