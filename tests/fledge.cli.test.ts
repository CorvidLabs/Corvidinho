/**
 * CLI surface for Fledge plugins (issue #112 / REQ-cli-112, REQ-plugins-112..114):
 * `plugins list` shows Fledge commands + schema cost, `plugins run fledge-*`
 * discovers lazily and stays SAFE-1 gated. Fake fledge on PATH; no network.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");

const FAKE_FLEDGE = `#!/bin/sh
[ "$1" = "--non-interactive" ] && shift
case "$1 $2" in
  "plugins list")
    echo '{"schema_version":1,"plugins":[{"name":"fledge-plugin-hello","version":"0.2.0","source":"x/y","installed":"2026-09-26","commands":["hello"],"trust_tier":"unverified","runtime":"native"}]}'
    ;;
  "plugins audit")
    echo '{"schema_version":1,"audit":[{"name":"fledge-plugin-hello","capabilities":{"exec":false,"store":false,"metadata":false,"filesystem":"none","network":false}}]}'
    ;;
  "plugins run")
    shift 2
    echo "cmd=$1"; shift
    for a in "$@"; do printf 'arg=[%s]\\n' "$a"; done
    echo "pwd=$(pwd)"
    ;;
  *) exit 2 ;;
esac
`;

const temps: string[] = [];
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});

function setup(withFledge: boolean): { project: string; path: string } {
  const root = mkdtempSync(join(tmpdir(), "corvidinho-fledge-cli-"));
  temps.push(root);
  const bin = join(root, "bin");
  const project = join(root, "project");
  mkdirSync(bin);
  mkdirSync(project);
  if (withFledge) {
    writeFileSync(join(bin, "fledge"), FAKE_FLEDGE);
    chmodSync(join(bin, "fledge"), 0o755);
  }
  return { project, path: `${bin}:/usr/bin:/bin` };
}

async function cli(
  args: string[],
  cwd: string,
  env: Record<string, string>,
): Promise<{ code: number; out: string; err: string }> {
  const proc = Bun.spawn([process.execPath, CLI, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, CORVIDINHO_NON_INTERACTIVE: "", CORVIDINHO_ALLOWLIST: "", ...env },
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, out, err };
}

describe("corvidinho plugins list with Fledge plugins (PLUGIN-6 / FLEDGE-5)", () => {
  test("text view lists fledge commands with origin, cost and budget", async () => {
    const s = setup(true);
    const r = await cli(["plugins", "list"], s.project, { PATH: s.path });
    expect(r.code).toBe(0);
    expect(r.out).toContain("fledge-hello  [dangerous, tier>=2, fledge:fledge-plugin-hello@0.2.0]");
    expect(r.out).toMatch(/fledge-hello .* ~\d+ tok /);
    expect(r.out).toContain("Tool schema cost (FLEDGE-5 / PLUGIN-6)");
    expect(r.out).toContain("fledge:fledge-plugin-hello@0.2.0: 1 command(s)");
    expect(r.out).toContain("Fledge plugins: 1 plugin(s), 1 command(s) registered");
    expect(r.out).toContain("shell-exec");
  });

  test("--json stays an array with origin / schemaChars / approxTokens", async () => {
    const s = setup(true);
    const r = await cli(["plugins", "list", "--json"], s.project, { PATH: s.path });
    expect(r.code).toBe(0);
    const data = JSON.parse(r.out) as {
      name: string;
      dangerous: boolean;
      minTier: number;
      origin: string;
      schemaChars: number;
      approxTokens: number;
    }[];
    expect(Array.isArray(data)).toBe(true);
    const hello = data.find((d) => d.name === "fledge-hello")!;
    expect(hello.dangerous).toBe(true);
    expect(hello.minTier).toBe(2);
    expect(hello.origin).toBe("fledge:fledge-plugin-hello@0.2.0");
    expect(hello.schemaChars).toBeGreaterThan(0);
    expect(hello.approxTokens).toBe(Math.ceil(hello.schemaChars / 4));
    expect(data.find((d) => d.name === "github-pr-list")!.origin).toBe("builtin");
  });

  test("no fledge on PATH: builtins still list, reason shown, exit 0", async () => {
    const s = setup(false);
    const r = await cli(["plugins", "list"], s.project, { PATH: s.path });
    expect(r.code).toBe(0);
    expect(r.out).toContain("github-pr-list");
    expect(r.out).toContain("Fledge plugins: none loaded (fledge not on PATH)");
    expect(r.out).not.toContain("fledge-hello");
  });
});

describe("corvidinho plugins run fledge-* (FLEDGE-4 / SAFE-1)", () => {
  test("non-interactive without allowlist is denied (exit 2)", async () => {
    const s = setup(true);
    const r = await cli(
      ["--non-interactive", "plugins", "run", "fledge-hello", "--", "a"],
      s.project,
      { PATH: s.path },
    );
    expect(r.code).toBe(2);
    expect(r.err).toContain("SAFE-1");
  });

  test("allowlisted run goes through fledge plugins run in the project root", async () => {
    const s = setup(true);
    const r = await cli(
      ["--non-interactive", "plugins", "run", "fledge-hello", "--", "a b", "--x"],
      s.project,
      { PATH: s.path, CORVIDINHO_ALLOWLIST: "fledge-hello" },
    );
    expect(r.code).toBe(0);
    expect(r.out).toContain("cmd=hello");
    expect(r.out).toContain("arg=[a b]");
    expect(r.out).toContain("arg=[--x]");
    expect(r.out).toContain(`pwd=${s.project}`);
  });

  test("unknown fledge-* name without fledge on PATH is a clean unknown-command error", async () => {
    const s = setup(false);
    const r = await cli(["plugins", "run", "fledge-hello"], s.project, { PATH: s.path });
    expect(r.code).not.toBe(0);
    expect(r.err + r.out).toContain("Unknown plugin command: fledge-hello");
  });
});
