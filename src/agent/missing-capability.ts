/**
 * Soft-land when an ask needs a capability that is not installed, not
 * allowlisted, or not configured (owner Continue 2026-10-03).
 *
 * The reply names only plugins that are registered or that Fledge discovery
 * listed, and cites an HI id or open PR only when a lookup actually returned
 * it. It never invents a provider (Tenor or otherwise) and never asks a
 * generic "what should I install?" when the message already names the plugin.
 * Community sessions stay read/chat: a role gap is not an allowlist hint.
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { roleAllowsPlugin, type ActingRole } from "../plugins/roles.ts";
import type { CapabilityTier } from "./tier.ts";
import { tierAllowsPlugin } from "./tier.ts";

/** Always in the tool-loop prompt. Per-run notes are separate. */
export const MISSING_CAPABILITY_INSTRUCTIONS =
  "Missing capabilities: never invent a tool, plugin, or third-party API (including Tenor) that is not one of the offered tools. " +
  "If the user already named a plugin, do not call ask-human to ask what they want installed. " +
  "Prefer an offered fledge-gif over gif-search for GIFs. ";

export type GapKind =
  | "not-installed"
  | "not-allowlisted"
  | "not-configured"
  | "role"
  | "tier"
  | "not-offered";

export type ToolFact = {
  name: string;
  dangerous: boolean;
  mutating: boolean;
  minTier: number;
};

/** Fledge `plugins list` result. `detail` is set when the list itself failed. */
export type FledgeProbe = {
  commands: readonly string[];
  detail?: string;
};

export type CapabilityFacts = {
  offered: ReadonlySet<string>;
  registered: ReadonlyMap<string, ToolFact>;
  allowlist: ReadonlySet<string>;
  env: NodeJS.ProcessEnv;
  role: ActingRole | null;
  tier: CapabilityTier;
  workTask?: boolean;
  /** Undefined: discovery did not run, so a missing Fledge command is not "not installed". */
  fledge?: FledgeProbe;
};

export type OpenPr = { number: number; title: string };

export type Coverage = {
  hiIds: string[];
  prs: OpenPr[];
  /** True once a lookup ran (including an empty result). */
  searched: boolean;
};

export type CoverageLookup = (needles: string[]) => Promise<Coverage>;

export type CapabilityAsk =
  | { kind: "named"; verb: "install" | "use"; needle: string }
  | { kind: "gif" };

const HI_ID_RE = /\*\*([A-Z][A-Z0-9]*-\d+(?:\.[A-Za-z0-9]+)?)\*\*/;
const NAMED_PLUGIN_RE =
  /\b(install|enable|add|use)\b(?:\s+\w+){0,6}?\s+(?:the\s+)?([a-z0-9][\w .-]{0,40}?)\s+plugins?\b/i;
const NAMED_TOOL_RE =
  /\b(install|enable|add|use)\s+(?:the\s+)?(fledge-[a-z0-9][\w-]*|gif-search|web-search)\b/i;

/** Real tools only. Tenor is not a tool. */
const GIF_TOOLS = ["fledge-gif", "gif-search"] as const;
const KNOWN_KEYS: Readonly<Record<string, readonly string[]>> = {
  "gif-search": ["GIPHY_API_KEY"],
  // fledge-gif reads GIPHY_API_KEY; TENOR_API_KEY is the existing alias the
  // Fledge child already receives. The reply names GIPHY_API_KEY only.
  "fledge-gif": ["GIPHY_API_KEY", "TENOR_API_KEY"],
  "web-search": ["BRAVE_SEARCH_API_KEY"],
};
const KEY_NAMED_IN_REPLY: Readonly<Record<string, string>> = {
  "gif-search": "GIPHY_API_KEY",
  "fledge-gif": "GIPHY_API_KEY",
  "web-search": "BRAVE_SEARCH_API_KEY",
};

const CODE_TALK_RE =
  /\b(refactor|implement|unit test|pull request|specs?\/|src\/|bugfix|commit)\b/i;

export function detectCapabilityAsk(taskText: string): CapabilityAsk | null {
  const text = taskText.replace(/\s+/g, " ").trim();
  if (!text) return null;
  const named = text.match(NAMED_PLUGIN_RE) ?? text.match(NAMED_TOOL_RE);
  if (named?.[1] && named[2]) {
    const verb = named[1].toLowerCase() === "install" || named[1].toLowerCase() === "add" || named[1].toLowerCase() === "enable"
      ? "install"
      : "use";
    const needle = named[2].trim().toLowerCase();
    if (needle && needle !== "the" && needle !== "a") return { kind: "named", verb, needle };
  }
  if (CODE_TALK_RE.test(text)) return null;
  if (text.length > 500) return null;
  if (/\bgifs?\b/i.test(text) || /\bgiphy\b/i.test(text)) return { kind: "gif" };
  return null;
}

export function isVagueInstallQuestion(question: string): boolean {
  const s = question.trim();
  if (!s || s.length > 400) return false;
  if (/\bwhat do you (mean|want)\b/i.test(s) && /\binstall/i.test(s)) return true;
  if (/\bwhat (?:should|do) (?:i|you) (?:want (?:me|you) to )?install\b/i.test(s)) return true;
  if (/\bwhat plugin\b/i.test(s) && /\binstall\b/i.test(s)) return true;
  return false;
}

/** Tool names a detected ask can be about. Only real catalog names. */
export function candidateTools(ask: CapabilityAsk): string[] {
  if (ask.kind === "gif") return [...GIF_TOOLS];
  const n = ask.needle.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  if (/gif|giphy/.test(n)) return [...GIF_TOOLS];
  if (/web[- ]?search|brave/.test(n)) return ["web-search"];
  const compact = n.replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  if (!compact || compact.length > 60) return [];
  const out: string[] = [];
  const push = (s: string) => {
    if (/^[a-z0-9][a-z0-9-]{0,60}$/.test(s) && !out.includes(s)) out.push(s);
  };
  push(compact);
  // `fledge widgets` → fledge-widgets. Never mint fledge-<word> the user did not say.
  if (n.includes("fledge") && !compact.startsWith("fledge-")) {
    const rest = compact.replace(/^fledge-?/, "");
    if (rest) push(`fledge-${rest}`);
  }
  return out;
}

export type Gap = {
  tool: string;
  kind: GapKind;
  detail?: string;
  key?: string;
  minTier?: number;
};

function keyConfigured(name: string, env: NodeJS.ProcessEnv): boolean {
  const keys = KNOWN_KEYS[name];
  if (!keys) return true;
  return keys.some((k) => (env[k]?.trim() ?? "").length > 0);
}

/**
 * Why `name` cannot run, or "offered" when this run's catalog already has it
 * (a missing key does not take an offered tool out: the tool's own result
 * says it is not configured, and the run is not replaced).
 */
export function gapForTool(name: string, facts: CapabilityFacts): Gap | "offered" {
  if (facts.offered.has(name)) return "offered";
  const registered = facts.registered.get(name);
  if (!registered) {
    if (name.startsWith("fledge-")) {
      const command = name.slice("fledge-".length);
      const probe = facts.fledge;
      if (!probe) {
        return { tool: name, kind: "not-installed", detail: "Fledge plugins were not listed on this run" };
      }
      if (!probe.commands.includes(command)) {
        return {
          tool: name,
          kind: "not-installed",
          detail: probe.detail ?? "not in this project's Fledge plugins",
        };
      }
      return classifyFact(name, { name, dangerous: true, mutating: true, minTier: 2 }, facts);
    }
    return {
      tool: name,
      kind: "not-installed",
      detail: "not a registered Corvidinho or Fledge plugin",
    };
  }
  return classifyFact(name, registered, facts);
}

function classifyFact(name: string, fact: ToolFact, facts: CapabilityFacts): Gap {
  if (
    facts.role !== null &&
    !roleAllowsPlugin(facts.role, { name, dangerous: fact.dangerous, mutating: fact.mutating }, Boolean(facts.workTask))
  ) {
    const gif = name === "gif-search" || name === "fledge-gif" || name === "web-search";
    return {
      tool: name,
      kind: "role",
      detail: gif
        ? `${facts.role} sessions do not get this tool (PLUGIN-9 keeps web and GIF search off community; Fledge commands stay owner-only)`
        : `${facts.role} sessions stay read/chat (ROLES-CHAT-2)`,
    };
  }
  if (fact.dangerous && !facts.allowlist.has(name)) {
    return { tool: name, kind: "not-allowlisted", detail: "SAFE-1" };
  }
  if (!tierAllowsPlugin(facts.tier, fact.minTier)) {
    return { tool: name, kind: "tier", minTier: fact.minTier };
  }
  if (!keyConfigured(name, facts.env)) {
    return { tool: name, kind: "not-configured", key: KEY_NAMED_IN_REPLY[name] ?? "its key" };
  }
  return { tool: name, kind: "not-offered" };
}

export type Assessment = {
  ask: CapabilityAsk;
  offered: string[];
  gaps: Gap[];
};

export function assessCapability(ask: CapabilityAsk, facts: CapabilityFacts): Assessment | null {
  const names = candidateTools(ask);
  if (names.length === 0) return null;
  const offered: string[] = [];
  const gaps: Gap[] = [];
  for (const name of names) {
    const gap = gapForTool(name, facts);
    if (gap === "offered") offered.push(name);
    else gaps.push(gap);
  }
  return { ask, offered, gaps };
}

function gapSentence(gap: Gap, tier: CapabilityTier): string {
  switch (gap.kind) {
    case "not-installed":
      return `${gap.tool} is not installed${gap.detail ? ` (${gap.detail})` : ""}.`;
    case "not-allowlisted":
      return `${gap.tool} is not allowlisted (${gap.detail ?? "SAFE-1"}).`;
    case "not-configured":
      return `${gap.tool} is not configured: set ${gap.key}.`;
    case "role":
      return `${gap.tool} is not available for this role (${gap.detail}).`;
    case "tier":
      return `${gap.tool} needs capability tier minTier ${gap.minTier ?? "?"} (this run is ${tier}).`;
    case "not-offered":
      return `${gap.tool} is registered but not offered in this run's catalog.`;
  }
}

export function formatCapabilityReply(assessment: Assessment, coverage: Coverage, tier: CapabilityTier): string {
  const parts = assessment.gaps.map((g) => gapSentence(g, tier));
  if (assessment.offered.length > 0) {
    parts.push(`${assessment.offered.join(" and ")} is already offered; use that, do not install another provider.`);
  }
  if (coverage.searched) {
    const cites: string[] = [];
    if (coverage.hiIds.length > 0) cites.push(`HI ${coverage.hiIds.join(", ")}`);
    for (const pr of coverage.prs) cites.push(`open PR #${pr.number} (${pr.title})`);
    parts.push(cites.length > 0 ? `Pointer: ${cites.join("; ")}.` : "No captured HI id or open PR matched.");
  }
  return parts.join(" ");
}

/** Prompt note when the run still calls the model (something usable is offered). */
export function capabilityPromptNote(assessment: Assessment, tier: CapabilityTier): string {
  if (assessment.gaps.length === 0) return "";
  return `Capability note: ${formatCapabilityReply(assessment, { hiIds: [], prs: [], searched: false }, tier)} Do not invent a provider. `;
}

export function needlesFor(ask: CapabilityAsk, tools: readonly string[]): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    const n = s.trim().toLowerCase();
    if (n && !out.includes(n)) out.push(n);
  };
  if (ask.kind === "gif") {
    push("gif");
    push("gif-search");
    push("fledge-gif");
  } else {
    push(ask.needle);
    for (const t of tools) push(t);
  }
  return out.slice(0, 8);
}

/**
 * The reply that replaces the run, or null when a candidate is already
 * offered (the model may use it) or the message is not a capability ask.
 */
export async function missingCapabilityReply(opts: {
  taskText: string;
  facts: CapabilityFacts;
  lookup?: CoverageLookup;
  /** When discovery has not been stored on `facts` yet. */
  probe?: () => Promise<FledgeProbe>;
}): Promise<string | null> {
  const ask = detectCapabilityAsk(opts.taskText);
  if (!ask) return null;
  const facts = await withProbe(ask, opts.facts, opts.probe);
  const assessment = assessCapability(ask, facts);
  if (!assessment || assessment.offered.length > 0 || assessment.gaps.length === 0) return null;
  const lookup = opts.lookup ?? ((needles) => defaultCoverageLookup(needles));
  let coverage: Coverage = { hiIds: [], prs: [], searched: false };
  try {
    coverage = await lookup(needlesFor(ask, assessment.gaps.map((g) => g.tool)));
  } catch {
    coverage = { hiIds: [], prs: [], searched: false };
  }
  return formatCapabilityReply(assessment, coverage, facts.tier);
}

async function withProbe(
  ask: CapabilityAsk,
  facts: CapabilityFacts,
  probe?: () => Promise<FledgeProbe>,
): Promise<CapabilityFacts> {
  if (facts.fledge || !probe) return facts;
  const names = candidateTools(ask);
  if (!names.some((n) => n.startsWith("fledge-") || n === "gif-search")) return facts;
  try {
    return { ...facts, fledge: await probe() };
  } catch {
    return { ...facts, fledge: { commands: [], detail: "Fledge plugins could not be listed" } };
  }
}

/**
 * A vague install question when the task already named a capability.
 * `replace` ends the run with the gap (nothing was offered). `steer` is a
 * tool error so the model uses what is offered instead of asking.
 */
export function vagueInstallOutcome(
  question: string,
  taskText: string,
  facts: CapabilityFacts,
): { kind: "replace"; text: string } | { kind: "steer"; text: string } | null {
  if (!isVagueInstallQuestion(question)) return null;
  const ask = detectCapabilityAsk(taskText);
  if (!ask) return null;
  const assessment = assessCapability(ask, facts);
  if (!assessment) return null;
  if (assessment.offered.length === 0 && assessment.gaps.length > 0) {
    return {
      kind: "replace",
      text: formatCapabilityReply(assessment, { hiIds: [], prs: [], searched: false }, facts.tier),
    };
  }
  if (assessment.offered.length > 0) {
    const gaps = assessment.gaps.map((g) => gapSentence(g, facts.tier)).join(" ");
    return {
      kind: "steer",
      text:
        `The message already names a capability. ${assessment.offered.join(" and ")} is offered; use it. ` +
        (gaps ? `${gaps} ` : "") +
        "Do not ask what to install and do not invent a provider.",
    };
  }
  return null;
}

/** Extra clause for a tool the model named that this run did not offer. Always includes "not offered". */
export function unseenToolDetail(name: string, facts: CapabilityFacts): string {
  const gap = gapForTool(name, facts);
  if (gap === "offered") return `refused: tool "${name}" is not offered in this run's catalog (SAFE-1 / capability tier).`;
  const sentence = gapSentence(gap, facts.tier);
  return `refused: tool "${name}" is not offered in this run's catalog (SAFE-1 / capability tier). ${sentence} Do not invent a provider.`;
}

/** HI ids whose criterion line actually contains a needle. Never invented. */
export function hiIdsInMarkdown(markdown: string, needles: readonly string[]): string[] {
  const wants = needles.map((n) => n.trim().toLowerCase()).filter((n) => n.length >= 3);
  if (wants.length === 0) return [];
  const ids: string[] = [];
  for (const line of markdown.split(/\n/)) {
    const id = line.match(HI_ID_RE)?.[1];
    if (!id) continue;
    const hay = line.toLowerCase();
    if (wants.some((n) => hay.includes(n)) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function hiIdsInDir(dir: string, needles: readonly string[]): string[] {
  let names: string[] = [];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith(".md"));
  } catch {
    return [];
  }
  const ids: string[] = [];
  for (const name of names) {
    let text = "";
    try {
      text = readFileSync(resolve(dir, name), "utf8");
    } catch {
      continue;
    }
    for (const id of hiIdsInMarkdown(text, needles)) {
      if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids.slice(0, 6);
}

/** Open PRs from `gh pr list --json number,title`, filtered to titles that contain a needle. */
export function openPrsFromJson(json: string, needles: readonly string[]): OpenPr[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const wants = needles.map((n) => n.trim().toLowerCase()).filter((n) => n.length >= 3);
  const out: OpenPr[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const number = (row as { number?: unknown }).number;
    const titleRaw = (row as { title?: unknown }).title;
    if (typeof number !== "number" || !Number.isInteger(number) || number <= 0) continue;
    if (typeof titleRaw !== "string") continue;
    const title = titleRaw.replace(/\s+/g, " ").trim().slice(0, 120);
    if (!title) continue;
    const hay = title.toLowerCase();
    if (wants.length > 0 && !wants.some((n) => hay.includes(n))) continue;
    if (!out.some((p) => p.number === number)) out.push({ number, title });
    if (out.length >= 3) break;
  }
  return out;
}

export function corvidinhoHiRoot(): string {
  return resolve(import.meta.dir, "../../hi");
}

/**
 * Local HI plus, when `citePrs` is true, `gh pr list` for CorvidLabs/Corvidinho.
 * A gh failure is an empty PR list, never a made-up number.
 */
export async function defaultCoverageLookup(
  needles: string[],
  opts: { roots?: readonly string[]; citePrs?: boolean; execGh?: (args: string[]) => Promise<string | null> } = {},
): Promise<Coverage> {
  const roots = opts.roots ?? [corvidinhoHiRoot()];
  const hiIds: string[] = [];
  for (const root of roots) {
    for (const id of hiIdsInDir(root, needles)) {
      if (!hiIds.includes(id)) hiIds.push(id);
    }
  }
  let prs: OpenPr[] = [];
  if (opts.citePrs !== false) {
    const query = needles.map((n) => n.replace(/[^a-z0-9-]/gi, "")).find((n) => n.length >= 3) ?? "";
    if (query) {
      const exec = opts.execGh ?? ghPrList;
      try {
        const json = await exec([
          "pr",
          "list",
          "--repo",
          "CorvidLabs/Corvidinho",
          "--state",
          "open",
          "--limit",
          "20",
          "--search",
          query,
          "--json",
          "number,title",
        ]);
        if (json) prs = openPrsFromJson(json, needles);
      } catch {
        prs = [];
      }
    }
  }
  return { hiIds: hiIds.slice(0, 6), prs, searched: true };
}

async function ghPrList(args: string[]): Promise<string | null> {
  const proc = Bun.spawn(["gh", ...args], { stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => {
    try {
      proc.kill();
    } catch {
      /* already exited */
    }
  }, 4000);
  const [code, text] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
  clearTimeout(timer);
  if (code !== 0) return null;
  return text;
}
