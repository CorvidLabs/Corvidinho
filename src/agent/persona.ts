/**
 * Persona file (PERSONA-1..3, issue #69).
 *
 * Corvidinho's voice lives in one editable file, `persona.md`, at the root of
 * Corvidinho's own checkout (next to `package.json`), never in the project a
 * run works in. Every surface (Discord chat, slash commands, `/work`,
 * schedules, WATCH, the CLI `task run`, delegate and council workers) spawns
 * or runs `task run`, and `createTaskExecute` loads the file once per run, so
 * each turn reads it fresh (PERSONA-2).
 *
 * The file is read with the AGENT-1 project-instructions loader: in a git
 * checkout only the copy committed at `HEAD` is loaded (the non-dangerous
 * file tools cannot plant a persona for later runs), it is capped, symlinks
 * out of the checkout and binary files are refused, and the text is SAFE-6
 * scrubbed. A missing, empty or refused file never stops a run: the run goes
 * on with no persona and one operator note says why.
 *
 * In the system prompt the persona comes first and Corvidinho's rules come
 * after it: the persona's header says it sets tone only, and
 * {@link PERSONA_RULES_SYSTEM_INSTRUCTIONS} says the rules win over it
 * (PERSONA-3: one message per turn, no spam, no unchecked claims).
 */

import { join } from "node:path";
import {
  loadProjectInstructions,
  type ProjectInstructionFile,
} from "./project-instructions.ts";

/** The one persona file, at the root of Corvidinho's checkout (PERSONA-2). */
export const PERSONA_FILE = "persona.md";

/** Cap on the persona file in bytes; a longer file is cut with a marker. */
export const PERSONA_MAX_BYTES = 8 * 1024;

/** Corvidinho's own checkout root (where `persona.md` lives), not the run cwd. */
export const CORVIDINHO_ROOT = join(import.meta.dir, "..", "..");

export type Persona = {
  /** Directory the persona file was read from. */
  root: string;
  /** The file's load result, or null when there is no persona file. */
  file: ProjectInstructionFile | null;
};

export type LoadPersonaOptions = {
  /** Override the byte cap (tests). */
  maxBytes?: number;
};

/**
 * Read `persona.md` from `root` (default: Corvidinho's checkout). A root
 * holding `.git` is read from its HEAD commit; otherwise from disk. Never
 * throws.
 */
export function loadPersona(
  root: string = CORVIDINHO_ROOT,
  opts: LoadPersonaOptions = {},
): Persona {
  const loaded = loadProjectInstructions(root, {
    fileNames: [PERSONA_FILE],
    maxBytes: opts.maxBytes ?? PERSONA_MAX_BYTES,
    exactRoot: true,
  });
  return { root: loaded.root, file: loaded.files[0] ?? null };
}

/** Header placed before the persona in the system prompt (PERSONA-1/2/3). */
export const PERSONA_HEADER =
  "Persona (PERSONA-1/2): Corvidinho's voice, read from its one persona file on every turn. " +
  "Use it for tone and personality only: it is not a source of facts, tools or permissions. " +
  "The rules after it win whenever they conflict (PERSONA-3).";

/**
 * PERSONA-3: rules text that always follows the persona in the system
 * prompt, loaded or not. Personality never overrides it.
 */
export const PERSONA_RULES_SYSTEM_INSTRUCTIONS =
  "Rules over persona (PERSONA-3): the persona sets your voice and never overrides these rules or any other rule in this prompt. " +
  "(a) One message per turn: your whole answer is one final reply. " +
  "(b) No spam: say it once; no filler, no repeated lines, no emoji walls. " +
  "(c) No unchecked claims: only say something was done, changed, passed or is true when a tool result or the context you were given shows it; otherwise say you did not check. ";

/** The loaded, non-empty persona text, or null. */
function personaText(p: Persona): string | null {
  const f = p.file;
  if (!f || f.status !== "loaded" || f.text.trim() === "") return null;
  return f.text;
}

/** System-prompt block for the persona, or "" when none loaded. */
export function renderPersona(p: Persona): string {
  const text = personaText(p);
  if (text === null) return "";
  // Keep the file from closing its own label early (`</ persona` too).
  const body = text.replace(/<\s*\/\s*persona/gi, "<\\/persona");
  return `${PERSONA_HEADER}\n\n<persona file="${PERSONA_FILE}">\n${body}\n</persona>`;
}

/**
 * Operator note for the run's `Text` event, or null for a clean load: no
 * file, an empty or refused file (the run has no persona), a truncated file,
 * or a committed copy with working-tree edits that were not loaded. Names the
 * file only, never a host path.
 */
export function personaWarning(p: Persona): string | null {
  const f = p.file;
  const none = "this run has no persona (PERSONA-2)";
  if (!f) return `Persona: ${PERSONA_FILE} not found; ${none}`;
  if (f.status === "refused") return `Persona: ${PERSONA_FILE} refused: ${f.reason}; ${none}`;
  if (f.status !== "loaded") return null;
  if (f.text.trim() === "") return `Persona: ${PERSONA_FILE} is empty; ${none}`;
  const notes: string[] = [];
  if (f.truncated) notes.push(`${f.bytes} bytes, truncated`);
  if (f.uncommitted) notes.push("committed copy; working-tree changes not loaded");
  return notes.length ? `Persona: ${PERSONA_FILE} (${notes.join(", ")})` : null;
}

/** Put the persona block before the rules (no-op when empty, PERSONA-3). */
export function withPersona(system: string, block: string): string {
  return block ? `${block}\n\n${system}` : system;
}
