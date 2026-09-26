/**
 * SpecSync project helpers — wrap local registry/files + SpecSync binary.
 * Steal shape from Merlin fledge-plugin-specsync (no SpecSync reimplementation).
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const COMPANIONS = [
  "context.md",
  "requirements.md",
  "tasks.md",
  "testing.md",
  "design.md",
] as const;

export function listRegisteredModules(cwd: string): string[] {
  const registryPath = join(cwd, ".specsync", "registry.toml");
  if (!existsSync(registryPath)) return [];
  const content = readFileSync(registryPath, "utf8");
  const names: string[] = [];
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
    if (m) names.push(m[1]!);
  }
  names.sort((a, b) => a.localeCompare(b));
  return names;
}

/** Canonical module-dir layout, then legacy flat path (Merlin read fallback). */
export function readModuleSpec(cwd: string, name: string): {
  ok: true;
  path: string;
  content: string;
  warning?: string;
} | { ok: false; error: string } {
  const moduleDirPath = join(cwd, "specs", name, `${name}.spec.md`);
  if (existsSync(moduleDirPath)) {
    return {
      ok: true,
      path: moduleDirPath,
      content: readFileSync(moduleDirPath, "utf8"),
    };
  }
  const flatPath = join(cwd, "specs", `${name}.md`);
  if (existsSync(flatPath)) {
    return {
      ok: true,
      path: flatPath,
      content: readFileSync(flatPath, "utf8"),
      warning: `WARNING: spec at flat path ${flatPath}. Move to ${moduleDirPath} for SpecSync compliance.`,
    };
  }
  return {
    ok: false,
    error: `spec '${name}' not found. Looked at ${moduleDirPath} and ${flatPath}.`,
  };
}

export function readCompanions(cwd: string, name: string): {
  files: { name: string; content: string }[];
} {
  const dir = join(cwd, "specs", name);
  const files: { name: string; content: string }[] = [];
  if (!existsSync(dir)) return { files };
  for (const filename of COMPANIONS) {
    const p = join(dir, filename);
    if (existsSync(p)) {
      files.push({ name: filename, content: readFileSync(p, "utf8") });
    }
  }
  // Also pick up any other .md companions except the main spec
  try {
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith(".md")) continue;
      if (entry === `${name}.spec.md`) continue;
      if ((COMPANIONS as readonly string[]).includes(entry)) continue;
      const p = join(dir, entry);
      files.push({ name: entry, content: readFileSync(p, "utf8") });
    }
  } catch {
    /* ignore */
  }
  return { files };
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

/** Merlin: fledge run spec-check; fallback to local specsync check. */
export async function runSpecCheck(
  cwd: string,
  signal?: AbortSignal,
): Promise<SpawnResult> {
  const fledge = Bun.which("fledge");
  if (fledge) {
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
