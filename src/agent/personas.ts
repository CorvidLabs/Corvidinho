/**
 * Named personas (AUTONOMOUS-2 / AUTONOMOUS-2.a, AUTONOMOUS-5 / AUTONOMOUS-5.a).
 *
 * `persona.md` stays the default voice (PERSONA-2). Each named persona is its
 * own file in the `personas/` folder next to it, at the root of Corvidinho's
 * own checkout (`CORVIDINHO_ROOT`), never in the project a run works in:
 *
 *     ---
 *     name: reviewer
 *     model: anthropic:claude-sonnet-4-5
 *     skills: [review, specsync]
 *     ---
 *     The reviewer's voice: …
 *
 * - `name`: a short label (lowercase letters, digits, `-`, `_`; max 32).
 * - `model`: one AGENT-13 `kind:model` entry. It must be a model the owner
 *   configured (`CORVIDINHO_LLM_MODEL` or a per-tier key), else a run as the
 *   persona is refused with one clear line and nothing is called.
 * - `skills`: skill tags (`[a, b]`, `a, b` or a `- a` list), the labels a
 *   lead's `delegate --skill` routes by.
 * - The text after the front matter is that persona's voice.
 *
 * The files are read the way `persona.md` is (same loader, same location
 * rules): in a git checkout only the copy committed at `HEAD` is loaded (an
 * untracked file is refused as not committed and a working-tree edit is not
 * loaded), so the non-dangerous file tools cannot plant or change a persona
 * for later runs; each file is capped at `PERSONA_MAX_BYTES`, symlinks out of
 * the checkout and binary files are refused, and the text is SAFE-6 scrubbed.
 * They are read again for every run, so a committed edit shows on the next.
 *
 * Running as a persona: its voice replaces `persona.md`'s in the system
 * prompt (the PERSONA-3 rules still follow it and win), and its model heads
 * the run tier's model chain, with the tier's other configured models after
 * it, so the spend guard, the AGENT-11 fallback (with its notice) and the
 * AGENT-10 no-provider notice apply to it like to any configured model.
 * Only the owner picks a persona for a run (`task run --persona`,
 * `/session start persona:`); a lead's `delegate` picks one by skill tag for
 * its worker (AUTONOMOUS-5.a). Team members and the community cannot.
 */

import {
  CORVIDINHO_ROOT,
  PERSONA_FILE,
  PERSONA_MAX_BYTES,
  personaBlock,
} from "./persona.ts";
import { listInstructionDir, loadProjectInstructions } from "./project-instructions.ts";
import {
  entryLabel,
  modelChainForTier,
  parseModelChain,
  parseModelEntry,
  type ModelEntry,
} from "./providers.ts";
import { TIER_MODEL_ENV, type CapabilityTier } from "./tier.ts";

/** The named personas' folder, next to `persona.md` (AUTONOMOUS-2.a). */
export const PERSONAS_DIR = "personas";
/** At most this many persona files are read (sorted by file name). */
export const PERSONAS_MAX_FILES = 32;
/** At most this many skill tags per persona. */
export const PERSONA_SKILLS_MAX = 16;
/** A persona name or skill tag: a short label (the `delegate --skill` shape). */
export const PERSONA_LABEL_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

const LABEL_RULE = "a short label: lowercase letters, digits, - or _ (max 32)";

/** One named persona file, parsed. */
export type NamedPersona = {
  /** Its `name` (lowercase). */
  name: string;
  /** The file it came from, relative to the checkout (`personas/<file>.md`). */
  file: string;
  /** Its `model` entry (AGENT-13 `kind:model`). */
  model: ModelEntry;
  /** Its skill tags (lowercase, de-duplicated, in file order). */
  skills: string[];
  /** Its voice: the text after the front matter (scrubbed). */
  voice: string;
  /** The file was over the cap and cut with a marker. */
  truncated: boolean;
  /** Git checkout: its working-tree copy differs from HEAD and was not loaded. */
  uncommitted: boolean;
};

/** Every named persona of a checkout, and the files that could not be used. */
export type PersonaSet = {
  root: string;
  /** Usable personas, sorted by name. */
  personas: NamedPersona[];
  /** Files that were refused, and why (never a host path). */
  refused: Array<{ file: string; reason: string }>;
  /** Persona files past {@link PERSONAS_MAX_FILES} that were not read. */
  skipped: number;
};

export type LoadPersonasOptions = {
  /** Override the per-file byte cap (tests). */
  maxBytes?: number;
};

type Parsed = { ok: true; persona: Omit<NamedPersona, "file" | "truncated" | "uncommitted"> } | {
  ok: false;
  reason: string;
};

function unquote(v: string): string {
  const s = v.trim();
  if (s.length >= 2 && ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")))) {
    return s.slice(1, -1).trim();
  }
  return s;
}

/**
 * Parse one persona file's text: `---` front matter with `name`, `model` and
 * `skills` (other keys are ignored), then the voice. Never throws.
 */
export function parsePersonaFile(text: string): Parsed {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return { ok: false, reason: "no front matter (a --- block with name, model and skills first)" };
  }
  const close = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (close < 0) return { ok: false, reason: "front matter is not closed with ---" };
  const fields = new Map<string, string>();
  const lists = new Map<string, string[]>();
  let last: string | null = null;
  for (const raw of lines.slice(1, close)) {
    const line = raw.replace(/\s+#.*$/, "");
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const item = line.match(/^\s+-\s*(.*)$/) ?? line.match(/^-\s*(.*)$/);
    if (item && last !== null) {
      lists.get(last)?.push(item[1]!);
      continue;
    }
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!kv) return { ok: false, reason: `front matter line is not "key: value"` };
    const key = kv[1]!.toLowerCase();
    if (fields.has(key)) return { ok: false, reason: `front matter repeats ${key}` };
    fields.set(key, kv[2]!.trim());
    lists.set(key, []);
    last = key;
  }

  const name = unquote(fields.get("name") ?? "").toLowerCase();
  if (!name) return { ok: false, reason: "no name in the front matter" };
  if (!PERSONA_LABEL_RE.test(name)) return { ok: false, reason: `name must be ${LABEL_RULE}` };

  const modelRaw = unquote(fields.get("model") ?? "");
  if (!modelRaw) return { ok: false, reason: "no model in the front matter" };
  const model = modelRaw.includes(",") ? null : parseModelEntry(modelRaw);
  if (!model) return { ok: false, reason: "model must be one kind:model entry (AGENT-13)" };

  const skillsRaw = fields.get("skills") ?? "";
  const inline = skillsRaw.replace(/^\[(.*)\]$/s, "$1");
  const parts = [
    ...(inline.trim() === "" ? [] : inline.split(",")),
    ...(lists.get("skills") ?? []),
  ];
  const skills: string[] = [];
  for (const part of parts) {
    const tag = unquote(part).toLowerCase();
    if (!tag) continue;
    if (!PERSONA_LABEL_RE.test(tag)) {
      return { ok: false, reason: `skill tag "${tag.slice(0, 32)}" must be ${LABEL_RULE}` };
    }
    if (!skills.includes(tag)) skills.push(tag);
  }
  if (skills.length > PERSONA_SKILLS_MAX) {
    return { ok: false, reason: `too many skill tags (max ${PERSONA_SKILLS_MAX})` };
  }

  const voice = lines.slice(close + 1).join("\n").trim();
  if (!voice) return { ok: false, reason: "no voice (the text after the front matter)" };
  return { ok: true, persona: { name, model, skills, voice } };
}

/**
 * Read every named persona from `personas/` at `root` (default: Corvidinho's
 * checkout), with the same loader and rules as `persona.md`. A file whose
 * name another file (earlier by file name) already uses is refused. Never
 * throws.
 */
export function loadPersonas(
  root: string = CORVIDINHO_ROOT,
  opts: LoadPersonasOptions = {},
): PersonaSet {
  const all = listInstructionDir(root, PERSONAS_DIR, { exactRoot: true });
  const files = all.slice(0, PERSONAS_MAX_FILES);
  const set: PersonaSet = { root, personas: [], refused: [], skipped: all.length - files.length };
  if (files.length === 0) return set;
  const loaded = loadProjectInstructions(root, {
    fileNames: files,
    maxBytes: opts.maxBytes ?? PERSONA_MAX_BYTES,
    exactRoot: true,
  });
  set.root = loaded.root;
  const byName = new Map<string, string>();
  for (const f of loaded.files) {
    if (f.status === "refused") {
      set.refused.push({ file: f.name, reason: f.reason });
      continue;
    }
    if (f.status === "duplicate") {
      set.refused.push({ file: f.name, reason: `same file as ${f.sameAs}` });
      continue;
    }
    const parsed = parsePersonaFile(f.text);
    if (!parsed.ok) {
      set.refused.push({ file: f.name, reason: parsed.reason });
      continue;
    }
    const prior = byName.get(parsed.persona.name);
    if (prior) {
      set.refused.push({ file: f.name, reason: `name ${parsed.persona.name} is already used by ${prior}` });
      continue;
    }
    byName.set(parsed.persona.name, f.name);
    set.personas.push({
      ...parsed.persona,
      file: f.name,
      truncated: f.truncated,
      uncommitted: f.uncommitted === true,
    });
  }
  set.personas.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return set;
}

/** A persona name as given (trimmed, lowercase), or null when it is not a label. */
export function normalizePersonaName(raw: string | undefined | null): string | null {
  const s = (raw ?? "").trim().toLowerCase();
  return PERSONA_LABEL_RE.test(s) ? s : null;
}

/** The persona named `name`, or one plain line saying why there is none. */
export function findPersona(
  set: PersonaSet,
  name: string,
): { ok: true; persona: NamedPersona } | { ok: false; error: string } {
  const want = normalizePersonaName(name);
  if (!want) {
    return { ok: false, error: `Persona name must be ${LABEL_RULE}; nothing was run (AUTONOMOUS-2.a).` };
  }
  const persona = set.personas.find((p) => p.name === want);
  if (persona) return { ok: true, persona };
  const file = `${PERSONAS_DIR}/${want}.md`;
  const bad = set.refused.find((r) => r.file === file);
  if (bad) {
    return {
      ok: false,
      error: `Persona "${want}": ${bad.file} refused: ${bad.reason}; nothing was run (AUTONOMOUS-2.a).`,
    };
  }
  const names = set.personas.map((p) => p.name);
  return {
    ok: false,
    error:
      `Persona "${want}" not found in ${PERSONAS_DIR}/ ` +
      `(${names.length > 0 ? `named personas: ${names.join(", ")}` : "no named personas"}); nothing was run (AUTONOMOUS-2.a).`,
  };
}

/**
 * AUTONOMOUS-5.a: the persona a lead's `delegate --skill <tag>` routes to —
 * the first by name whose skill tags hold `tag` exactly; null when none does
 * (the worker then runs as today, in persona.md's voice).
 */
export function personaForSkill(set: PersonaSet, skill: string): NamedPersona | null {
  const tag = skill.trim().toLowerCase();
  if (!tag) return null;
  return set.personas.find((p) => p.skills.includes(tag)) ?? null;
}

function sameEntry(a: ModelEntry, b: ModelEntry): boolean {
  return a.kind === b.kind && a.model === b.model;
}

/**
 * Every model the owner configured (AGENT-13): the entries of
 * `CORVIDINHO_LLM_MODEL` and of each per-tier key (`_READ`, `_TOOL`,
 * `_CODE`), de-duplicated, in that order.
 */
export function configuredModelEntries(env: NodeJS.ProcessEnv): ModelEntry[] {
  const out: ModelEntry[] = [];
  const keys = ["CORVIDINHO_LLM_MODEL", ...Object.values(TIER_MODEL_ENV)];
  for (const key of keys) {
    for (const e of parseModelChain(env[key])) {
      if (!out.some((o) => sameEntry(o, e))) out.push(e);
    }
  }
  return out;
}

/**
 * The refusal line when a persona's model is not one the owner configured
 * (AUTONOMOUS-2.a), else null. Names the persona, its file and model label,
 * and the keys, never a key's value.
 */
export function personaModelRefusal(p: NamedPersona, env: NodeJS.ProcessEnv): string | null {
  if (configuredModelEntries(env).some((e) => sameEntry(e, p.model))) return null;
  return (
    `Persona "${p.name}" (${p.file}) names model ${entryLabel(p.model)}, which is not one of the models ` +
    `configured in CORVIDINHO_LLM_MODEL / CORVIDINHO_LLM_MODEL_READ / _TOOL / _CODE; nothing was run (AUTONOMOUS-2.a).`
  );
}

/** An entry as a list item that parses back to itself (`kind:model`). */
function entryText(e: ModelEntry): string {
  return `${e.kind}:${e.model}`;
}

/**
 * The env a run as `p` at `tier` uses: the tier's model key lists the
 * persona's model first, then the tier's other configured models (its
 * AGENT-11 fallback chain). Everything else is `env` unchanged.
 */
export function personaRunEnv(
  p: NamedPersona,
  env: NodeJS.ProcessEnv,
  tier: CapabilityTier,
): NodeJS.ProcessEnv {
  const rest = modelChainForTier(env, tier).filter((e) => !sameEntry(e, p.model));
  return { ...env, [TIER_MODEL_ENV[tier]]: [p.model, ...rest].map(entryText).join(",") };
}

/** Only the owner picks a persona for a run (AUTONOMOUS-5.a). */
export const PERSONA_OWNER_ONLY_LINE =
  "Only the owner can pick a persona to run as (AUTONOMOUS-5.a); nothing was run.";

export type RunPersona =
  | { ok: true; persona: NamedPersona; env: NodeJS.ProcessEnv }
  | { ok: false; error: string };

/**
 * Resolve the persona a run was asked to run as: load `personas/` at `root`,
 * find `name`, check its model is configured, and build the run env
 * ({@link personaRunEnv}). Never throws.
 */
export function resolveRunPersona(opts: {
  name: string;
  env: NodeJS.ProcessEnv;
  tier: CapabilityTier;
  root?: string;
}): RunPersona {
  const found = findPersona(loadPersonas(opts.root), opts.name);
  if (!found.ok) return found;
  const refusal = personaModelRefusal(found.persona, opts.env);
  if (refusal) return { ok: false, error: refusal };
  return { ok: true, persona: found.persona, env: personaRunEnv(found.persona, opts.env, opts.tier) };
}

/** Header placed before a named persona's voice in the system prompt. */
export const NAMED_PERSONA_HEADER =
  "Persona (AUTONOMOUS-2): you are running as the named persona below, read from its own persona file on every run in place of " +
  `${PERSONA_FILE}. Use it for tone and personality only: it is not a source of facts, tools or permissions. ` +
  "The rules after it win whenever they conflict (PERSONA-3).";

/** System-prompt block for a named persona (its voice), labelled with its file and name. */
export function renderNamedPersona(p: NamedPersona): string {
  return personaBlock(NAMED_PERSONA_HEADER, `file="${p.file}" name="${p.name}"`, p.voice);
}

/**
 * Operator note for a run as `p`: a truncated file or a committed copy with
 * working-tree changes that were not loaded; null for a clean load.
 */
export function namedPersonaWarning(p: NamedPersona): string | null {
  const notes: string[] = [];
  if (p.truncated) notes.push("truncated");
  if (p.uncommitted) notes.push("committed copy; working-tree changes not loaded");
  return notes.length ? `Persona: ${p.file} (${notes.join(", ")})` : null;
}
