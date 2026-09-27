/**
 * SpecSync project helpers — wrap local registry/files + SpecSync binary.
 * Steal shape from Merlin fledge-plugin-specsync (no SpecSync reimplementation).
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { isInsideRoot } from "../files/resolvePath.ts";

const COMPANIONS = [
  "context.md",
  "requirements.md",
  "tasks.md",
  "testing.md",
  "design.md",
] as const;

/**
 * Module names: in a SpecSync project (a `.specsync/` dir), each
 * `specs/<name>/<name>.spec.md` that `readModuleSpec` reads (see
 * `listSpecsDirModules`), plus the `[specs]` names of `.specsync/registry.toml`
 * when that file exists. SpecSync does not keep a registry in step with the
 * specs dir (`specsync init` writes none, and `specsync scaffold` does not add
 * to the one `specsync init-registry` writes), so the registry alone can miss
 * modules (SPECSYNC-1/5).
 */
export function listRegisteredModules(cwd: string): string[] {
  const names = new Set(listSpecsDirModules(cwd));
  const registryPath = join(cwd, ".specsync", "registry.toml");
  if (existsSync(registryPath)) {
    const content = readFileSync(registryPath, "utf8");
    let inSpecs = false;
    for (const raw of content.split(/\r?\n/)) {
      const line = raw.replace(/#.*$/, "").trim();
      if (!line) continue;
      if (line.startsWith("[")) {
        inSpecs = line === "[specs]";
        continue;
      }
      if (!inSpecs) continue;
      const m = line.match(/^([A-Za-z0-9_-]+)\s*=/);
      if (m) names.add(m[1]!);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/**
 * A module name is one registry-form segment (same shape `listRegisteredModules`
 * parses): letters, digits, `_`, `-`. No `.`/`..`, separators, absolute paths or
 * NUL, so a model-chosen name cannot point a read outside `specs/` (tools stay
 * inside the project: SPECSYNC-1/5/6 project specs + companions, PLUGIN-1).
 */
export const MODULE_NAME_RE = /^[A-Za-z0-9_-]+$/;

/** Error text for a name that is not a plain module name, else null. */
export function invalidModuleName(name: string): string | null {
  if (MODULE_NAME_RE.test(name)) return null;
  const shown = JSON.stringify(name.length > 80 ? `${name.slice(0, 80)}…` : name);
  return (
    `invalid spec module name ${shown}: use a registered module name ` +
    `(letters, digits, "_" or "-"; see specsync-list)`
  );
}

type SpecsDir = { ok: true; real: string } | { ok: false; error?: string };

/**
 * Real path of `<cwd>/specs`, which must itself resolve inside the real project
 * root. `{ ok: false }` without an error means there is no specs dir.
 */
function realSpecsDir(cwd: string): SpecsDir {
  let root: string;
  try {
    root = realpathSync(resolve(cwd));
  } catch {
    root = resolve(cwd);
  }
  const specs = join(root, "specs");
  if (!existsSync(specs)) return { ok: false };
  let real: string;
  try {
    real = realpathSync(specs);
  } catch {
    return { ok: false, error: "refused: specs dir cannot be resolved" };
  }
  if (!isInsideRoot(root, real)) {
    return {
      ok: false,
      error: "refused: specs dir resolves outside the project directory",
    };
  }
  return { ok: true, real };
}

/**
 * Specs-dir modules: each `specs/<name>/<name>.spec.md` that `readModuleSpec`
 * reads, i.e. a plain module name whose spec is a file resolving (symlinks
 * followed) inside the real specs dir. Only in a SpecSync project (`.specsync/`
 * is a dir); no specs dir, or one resolving outside the project → [].
 */
function listSpecsDirModules(cwd: string): string[] {
  try {
    if (!statSync(join(cwd, ".specsync")).isDirectory()) return [];
  } catch {
    return [];
  }
  const specs = realSpecsDir(cwd);
  if (!specs.ok) return [];
  let entries: string[];
  try {
    entries = readdirSync(specs.real);
  } catch {
    return [];
  }
  const names = entries.filter(
    (name) =>
      MODULE_NAME_RE.test(name) &&
      containedSpecFile(
        specs.real,
        join(specs.real, name, `${name}.spec.md`),
        `specs/${name}/${name}.spec.md`,
      ).ok,
  );
  names.sort((a, b) => a.localeCompare(b));
  return names;
}

type ContainedFile =
  | { ok: true; real: string }
  | { ok: false; missing: true }
  | { ok: false; missing: false; error: string };

/**
 * Resolve `abs` (symlinks followed) and require the real path to be inside the
 * real specs dir. Missing entries and non-files count as missing. `label` is the
 * project-relative name shown in errors (never the outside target).
 */
function containedSpecFile(specsReal: string, abs: string, label: string): ContainedFile {
  if (!existsSync(abs)) return { ok: false, missing: true };
  let real: string;
  try {
    real = realpathSync(abs);
  } catch {
    return { ok: false, missing: false, error: `refused: ${label} cannot be resolved` };
  }
  if (!isInsideRoot(specsReal, real)) {
    return {
      ok: false,
      missing: false,
      error: `refused: ${label} resolves outside the project specs dir`,
    };
  }
  try {
    // A directory (or other non-file) named like a spec is not a spec: skip it.
    if (!statSync(real).isFile()) return { ok: false, missing: true };
  } catch {
    return { ok: false, missing: false, error: `refused: ${label} cannot be read` };
  }
  return { ok: true, real };
}

/** Canonical module-dir layout, then legacy flat path (Merlin read fallback). */
export function readModuleSpec(cwd: string, name: string): {
  ok: true;
  path: string;
  content: string;
  warning?: string;
} | { ok: false; error: string; refused?: true } {
  const invalid = invalidModuleName(name);
  if (invalid) return { ok: false, error: invalid, refused: true };
  const moduleDirPath = join(cwd, "specs", name, `${name}.spec.md`);
  const flatPath = join(cwd, "specs", `${name}.md`);
  const specs = realSpecsDir(cwd);
  if (!specs.ok && specs.error) return { ok: false, error: specs.error, refused: true };
  if (specs.ok) {
    const inDir = containedSpecFile(
      specs.real,
      join(specs.real, name, `${name}.spec.md`),
      `specs/${name}/${name}.spec.md`,
    );
    if (inDir.ok) {
      return {
        ok: true,
        path: moduleDirPath,
        content: readFileSync(inDir.real, "utf8"),
      };
    }
    if (!inDir.missing) return { ok: false, error: inDir.error, refused: true };
    const flat = containedSpecFile(
      specs.real,
      join(specs.real, `${name}.md`),
      `specs/${name}.md`,
    );
    if (flat.ok) {
      return {
        ok: true,
        path: flatPath,
        content: readFileSync(flat.real, "utf8"),
        warning: `WARNING: spec at flat path ${flatPath}. Move to ${moduleDirPath} for SpecSync compliance.`,
      };
    }
    if (!flat.missing) return { ok: false, error: flat.error, refused: true };
  }
  return {
    ok: false,
    error: `spec '${name}' not found. Looked at ${moduleDirPath} and ${flatPath}.`,
  };
}

/**
 * Companion `.md` files under `specs/<name>/`. An invalid name, or a module dir
 * or companion whose real path leaves the specs dir, returns `error` and no
 * files (fail closed: nothing outside the project is returned).
 */
export function readCompanions(cwd: string, name: string): {
  files: { name: string; content: string }[];
  error?: string;
} {
  const files: { name: string; content: string }[] = [];
  const invalid = invalidModuleName(name);
  if (invalid) return { files, error: invalid };
  const specs = realSpecsDir(cwd);
  if (!specs.ok) return specs.error ? { files, error: specs.error } : { files };
  const linkDir = join(specs.real, name);
  if (!existsSync(linkDir)) return { files };
  let dir: string;
  try {
    dir = realpathSync(linkDir);
  } catch {
    return { files, error: `refused: specs/${name} cannot be resolved` };
  }
  if (!isInsideRoot(specs.real, dir)) {
    return {
      files,
      error: `refused: specs/${name} resolves outside the project specs dir`,
    };
  }
  const read = (filename: string): string | null | { error: string } => {
    const got = containedSpecFile(specs.real, join(dir, filename), `specs/${name}/${filename}`);
    if (got.ok) {
      try {
        return readFileSync(got.real, "utf8");
      } catch {
        return null; // unreadable companion: skip it, as before
      }
    }
    if (got.missing) return null;
    return { error: got.error };
  };
  for (const filename of COMPANIONS) {
    const content = read(filename);
    if (content === null) continue;
    if (typeof content !== "string") return { files: [], error: content.error };
    files.push({ name: filename, content });
  }
  // Also pick up any other .md companions except the main spec
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    /* ignore */
  }
  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    if (entry === `${name}.spec.md`) continue;
    if ((COMPANIONS as readonly string[]).includes(entry)) continue;
    const content = read(entry);
    if (content === null) continue;
    if (typeof content !== "string") return { files: [], error: content.error };
    files.push({ name: entry, content });
  }
  return { files };
}

/**
 * `specsync --root` points the binary at another directory; the SpecSync
 * tools run on this project only. Returns an error when args carry it.
 */
export function refuseRootArg(args: readonly string[]): string | null {
  for (const arg of args) {
    if (arg === "--root" || arg.startsWith("--root=")) {
      return "refused: --root is not allowed; SpecSync tools run on this project only";
    }
  }
  return null;
}

export type SpawnResult = { success: boolean; output: string; code: number };

export async function spawnSpecsync(
  cwd: string,
  args: string[],
  signal?: AbortSignal,
): Promise<SpawnResult> {
  const bin = Bun.which("specsync");
  if (!bin) {
    return {
      success: false,
      output: "specsync not on PATH (SPECSYNC-6: local binary required)",
      code: 127,
    };
  }
  const proc = Bun.spawn([bin, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    signal,
  });
  const code = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { success: code === 0, output: `${stdout}${stderr}`, code: code ?? 1 };
}

/**
 * True when the project's own `fledge.toml` (the one file `fledge run` reads;
 * it does not search parent dirs) defines a `spec-check` task. No fledge.toml,
 * or one without that task → false. A fledge.toml that cannot be read or
 * parsed → true: fail closed onto the Fledge path, which reports the error,
 * instead of quietly running a laxer plain `specsync check`.
 */
export function projectDefinesSpecCheckTask(cwd: string): boolean {
  const path = join(cwd, "fledge.toml");
  if (!existsSync(path)) return false;
  let parsed: unknown;
  try {
    parsed = Bun.TOML.parse(readFileSync(path, "utf8"));
  } catch {
    return true;
  }
  const tasks =
    parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>).tasks
      : undefined;
  if (!tasks || typeof tasks !== "object" || Array.isArray(tasks)) return false;
  return Object.hasOwn(tasks, "spec-check");
}

/**
 * Merlin: `fledge run spec-check` when fledge is on PATH and the project
 * defines that task (Corvidinho's carries the CI Spec Sync strictness,
 * SPECSYNC-2/7); otherwise the local `specsync check` under the project's own
 * `.specsync` config.
 */
export async function runSpecCheck(
  cwd: string,
  signal?: AbortSignal,
): Promise<SpawnResult> {
  const fledge = Bun.which("fledge");
  if (fledge && projectDefinesSpecCheckTask(cwd)) {
    const proc = Bun.spawn([fledge, "run", "spec-check"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      signal,
    });
    const code = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    return { success: code === 0, output: `${stdout}${stderr}`, code: code ?? 1 };
  }
  return spawnSpecsync(cwd, ["check"], signal);
}
