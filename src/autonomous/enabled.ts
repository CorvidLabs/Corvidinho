/**
 * AUTONOMOUS-1 gate: autonomous mode is off until the project enables it in
 * project config — the project's `fledge.toml`, the same file whose
 * `[corvidinho]` section `loadAgentConfig` already reads:
 *
 *   [corvidinho.autonomous]
 *   enabled = true
 *
 * (`autonomous.enabled = true` under `[corvidinho]` is the same TOML key.)
 * Only the literal `true` turns it on; a missing file, section or key, any
 * other value, or an inline table is off. `fledge.toml` is SAFE-2 protected
 * infra, so the agent's file tools cannot flip the switch on themselves.
 *
 * SAFE-9: autonomous (cross-agent) tools such as `delegate` are offered to a
 * session only when this gate is on and the delegation depth cap is not
 * reached; their code-tier minTier keeps them from small models.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { isJsonAllowlistPath, resolveAllowlistPath } from "../allowlist/load.ts";
import { canDelegateAtDepth, delegateDepthFromEnv } from "./delegate.ts";

export type AutonomousConfig = {
  enabled: boolean;
};

const OFF: AutonomousConfig = { enabled: false };

/**
 * Minimal TOML scrape (no TOML dep), matching `parseCorvidinhoSection`: every
 * one-line `key = value` as its full dotted key (`[table]` prefix + key), in
 * file order. `[table]` and `[[array-of-tables]]` both start a new key scope,
 * so a key under a later table never counts for an earlier one. `#` to the
 * end of a line is a comment. Shared by the AUTONOMOUS-1 gate and the
 * PLUGIN-5.a extras toggles.
 */
export function scanTomlKeys(toml: string): Array<{ key: string; value: string }> {
  const out: Array<{ key: string; value: string }> = [];
  let section = "";
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    // `[table]` and `[[array-of-tables]]` both start a new key scope.
    const header = line.match(/^\[\[?\s*([^\]]+?)\s*\]\]?$/);
    if (header) {
      section = header[1]!.replace(/\s+/g, "");
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_.\s]+?)\s*=\s*(.+)$/);
    if (!kv) continue;
    const key = kv[1]!.replace(/\s+/g, "");
    out.push({ key: section ? `${section}.${key}` : key, value: kv[2]!.trim() });
  }
  return out;
}

export function parseAutonomousConfig(toml: string): AutonomousConfig {
  let enabled = false;
  for (const { key, value } of scanTomlKeys(toml)) {
    if (key === "corvidinho.autonomous.enabled") enabled = value === "true";
  }
  return { enabled };
}

/** Read `<cwd>/fledge.toml`; unreadable or absent ⇒ off. */
export function loadAutonomousConfig(cwd: string): AutonomousConfig {
  try {
    return parseAutonomousConfig(readFileSync(join(cwd, "fledge.toml"), "utf8"));
  } catch {
    return { ...OFF };
  }
}

export function isAutonomousEnabled(cwd: string): boolean {
  return loadAutonomousConfig(cwd).enabled;
}

/**
 * SAFE-9 session gate: may this run be offered autonomous tools? Requires
 * the project switch (AUTONOMOUS-1) and a delegation depth below the cap.
 * Tier is filtered separately by the plugin's minTier in the tool catalog.
 */
export function autonomousSessionAllowed(opts: {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}): boolean {
  if (!isAutonomousEnabled(opts.cwd)) return false;
  return canDelegateAtDepth(delegateDepthFromEnv(opts.env ?? process.env));
}

/*
 * PLUGIN-5 / PLUGIN-5.a — `/work` and `/schedule` (with the scheduler tick)
 * are extras the owner can turn off, like the autonomous tools above, in a
 * `[corvidinho.plugins]` table:
 *
 *   [corvidinho.plugins]
 *   work = false       # /work, and a reply or button press that resumes a /work talk
 *   schedule = false   # every /schedule subcommand and the scheduler's runs
 *
 * (`plugins.work = false` under `[corvidinho]`, or an inline
 * `plugins = { work = false }` there, is the same key.) Two places are read,
 * fresh on every slash command, resumed /work talk and scheduler tick, so no
 * restart is needed:
 *   - the install root's `fledge.toml` (the bridge's / daemon's working
 *     directory, the Corvidinho checkout), and
 *   - the owner's allowlist file (`resolveAllowlistPath`; a `[corvidinho.plugins]`
 *     table, or a `corvidinho.plugins` object in a `.json` file). It lives
 *     outside the checkout, so the box updater's `git checkout --force` never
 *     resets it: the update-proof place for an off.
 * Off in either is off. A missing file, table or key is on, so an existing
 * install stays on until the owner turns an extra off (PLUGIN-5.a); only the
 * literal `true` is on otherwise, and `false` or any other value is off. A
 * file that exists but cannot be read (or a `.json` allowlist file that does
 * not parse) turns both off as `config-unreadable` (fail closed; callers log
 * it). Target-project `fledge.toml` files are not read, and
 * `[corvidinho.autonomous]` has no say here.
 */

/** The extras PLUGIN-5.a names: `/work` and `/schedule` (with the scheduler). */
export type ExtraName = "work" | "schedule";

export const EXTRA_NAMES: readonly ExtraName[] = ["work", "schedule"];

/** Where an extras setting was read (never a path: these reach the owner). */
export type ExtrasSource = "fledge.toml" | "allowlist file";

export type ExtraState =
  | { on: true }
  /** The owner turned it off: the key is not `true` in `offIn`. */
  | { on: false; reason: "off"; offIn: ExtrasSource[] }
  /** A settings file exists but could not be read: off until it reads again. */
  | { on: false; reason: "config-unreadable"; error: string };

export type ExtrasToggles = Record<ExtraName, ExtraState>;

/** One file's settings: absent key = on (missing), `true` = on, `false` = off. */
export type ExtrasSettings = Partial<Record<ExtraName, boolean>>;

const PLUGINS_TABLE = "corvidinho.plugins";

/** "the install's fledge.toml" / "the allowlist file" (owner replies and logs). */
export function extrasSourcePhrase(source: ExtrasSource): string {
  return source === "fledge.toml" ? "the install's fledge.toml" : "the allowlist file";
}

function isExtraName(name: string): name is ExtraName {
  return (EXTRA_NAMES as readonly string[]).includes(name);
}

function setExtra(out: ExtrasSettings, name: ExtraName, on: boolean): void {
  // Off wins: a key written twice counts as off if any copy is not `true`.
  out[name] = out[name] === false ? false : on;
}

/** `[corvidinho.plugins]` `work` / `schedule` of a TOML file (fledge.toml or the allowlist file). */
export function parseExtrasSettings(toml: string): ExtrasSettings {
  const out: ExtrasSettings = {};
  for (const { key, value } of scanTomlKeys(toml)) {
    if (key === PLUGINS_TABLE) {
      // Inline table under [corvidinho]: `plugins = { work = false }`.
      const inline = value.match(/^\{(.*)\}$/);
      if (!inline) continue;
      for (const part of inline[1]!.split(",")) {
        const kv = part.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (kv && isExtraName(kv[1]!)) setExtra(out, kv[1]!, kv[2] === "true");
      }
      continue;
    }
    for (const name of EXTRA_NAMES) {
      if (key === `${PLUGINS_TABLE}.${name}`) setExtra(out, name, value === "true");
    }
  }
  return out;
}

/** `corvidinho.plugins` of a `.json` allowlist file (`JSON.parse` throws on bad JSON). */
export function parseExtrasSettingsJson(text: string): ExtrasSettings {
  const raw = JSON.parse(text) as unknown;
  const out: ExtrasSettings = {};
  const corvidinho =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>).corvidinho : undefined;
  const plugins =
    corvidinho && typeof corvidinho === "object"
      ? (corvidinho as Record<string, unknown>).plugins
      : undefined;
  if (plugins === undefined) return out;
  if (!plugins || typeof plugins !== "object" || Array.isArray(plugins)) {
    // `"plugins": false` (or any non-object) is not a setting we can read: off.
    for (const name of EXTRA_NAMES) out[name] = false;
    return out;
  }
  for (const name of EXTRA_NAMES) {
    const v = (plugins as Record<string, unknown>)[name];
    if (v !== undefined) out[name] = v === true;
  }
  return out;
}

type SourceRead =
  | { source: ExtrasSource; settings: ExtrasSettings }
  | { source: ExtrasSource; error: string };

function readSource(
  source: ExtrasSource,
  path: string,
  parse: (text: string) => ExtrasSettings,
): SourceRead | null {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    // Only a missing file is "not set" (on); anything else fails closed.
    if (code === "ENOENT") return null;
    return {
      source,
      error: `${extrasSourcePhrase(source)} could not be read (${typeof code === "string" ? code : "read error"})`,
    };
  }
  try {
    return { source, settings: parse(text) };
  } catch {
    return { source, error: `${extrasSourcePhrase(source)} could not be parsed` };
  }
}

/** Combine what each source said: unreadable anywhere ⇒ off; off in either ⇒ off. */
export function combineExtrasReads(reads: ReadonlyArray<SourceRead | null>): ExtrasToggles {
  const present = reads.filter((r): r is SourceRead => r !== null);
  const errors = present.flatMap((r) => ("error" in r ? [r.error] : []));
  const out = {} as ExtrasToggles;
  for (const name of EXTRA_NAMES) {
    if (errors.length > 0) {
      out[name] = { on: false, reason: "config-unreadable", error: errors.join("; ") };
      continue;
    }
    const offIn = present.flatMap((r) =>
      "settings" in r && r.settings[name] === false ? [r.source] : [],
    );
    out[name] = offIn.length > 0 ? { on: false, reason: "off", offIn } : { on: true };
  }
  return out;
}

export type LoadExtrasOptions = {
  /** The install root: the bridge's / daemon's working directory (its `fledge.toml`). */
  installRoot: string;
  /** For `CORVIDINHO_ALLOWLIST_FILE` (default `process.env`). */
  env?: NodeJS.ProcessEnv;
  /** For the default allowlist paths (default the OS home). */
  home?: string;
};

/**
 * PLUGIN-5.a — read `[corvidinho.plugins]` from the install root's
 * `fledge.toml` and the owner's allowlist file, now (see above). Never throws.
 */
export function loadExtrasToggles(opts: LoadExtrasOptions): ExtrasToggles {
  const env = opts.env ?? process.env;
  const reads: Array<SourceRead | null> = [
    readSource("fledge.toml", join(opts.installRoot, "fledge.toml"), parseExtrasSettings),
  ];
  const allowlistPath = resolveAllowlistPath(env, opts.home ?? homedir());
  if (allowlistPath) {
    reads.push(
      readSource(
        "allowlist file",
        allowlistPath,
        isJsonAllowlistPath(allowlistPath) ? parseExtrasSettingsJson : parseExtrasSettings,
      ),
    );
  }
  return combineExtrasReads(reads);
}

/** `on`, `off` or `config-unreadable` (log fields, `daemon.started`). */
export function extraStateLabel(state: ExtraState): "on" | "off" | "config-unreadable" {
  return state.on ? "on" : state.reason;
}

/** One operator log line for an extra's state (no paths, no values). */
export function formatExtraStateLog(name: ExtraName, state: ExtraState): string {
  if (state.on) return `${name}: on`;
  if (state.reason === "off") {
    return `${name}: off ([corvidinho.plugins] ${name} is not true in ${state.offIn.map(extrasSourcePhrase).join(" and ")})`;
  }
  return `${name}: off, config-unreadable (${state.error})`;
}

/**
 * Wrap a state reader so `onChange` hears each change of state (label or
 * reason), including the first read. The daemon logs `schedules.off` /
 * `schedules.on` from it and the bridge one line, instead of every tick.
 */
export function trackExtraState(
  read: () => ExtraState,
  onChange: (state: ExtraState, previous: ExtraState | undefined) => void,
): () => ExtraState {
  let last: ExtraState | undefined;
  let lastKey: string | undefined;
  return () => {
    const state = read();
    const key = state.on
      ? "on"
      : state.reason === "off"
        ? `off:${state.offIn.join(",")}`
        : `config-unreadable:${state.error}`;
    if (key !== lastKey) {
      const previous = last;
      last = state;
      lastKey = key;
      onChange(state, previous);
    }
    return state;
  };
}
