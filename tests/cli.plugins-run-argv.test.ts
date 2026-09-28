/**
 * `plugins run <name> [--json] [-- ...args]` (REQ-cli-186): every argv item
 * after the first `--` that follows the plugin name reaches the plugin
 * verbatim. Global flags, `--json` and `--help` / `-h` there belong to the
 * plugin, never to Corvidinho. Fake fledge on PATH echoes the argv it gets.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseGlobalFlags } from "../src/cli.ts";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");

/** Every global flag, `--json` and help, plus a second `--` and a spaced arg. */
const FLAG_LOOKING = [
  "--no-verify",
  "--json",
  "--non-interactive",
  "--task",
  "t",
  "--task=u",
  "--tier",
  "code",
  "--tier=code",
  "--max-retries",
  "9",
  "--max-retries=9",
  "--project",
  "p",
  "--project=q",
  "--help",
  "-h",
  "--",
  "a b",
];

describe("parseGlobalFlags: plugins run passthrough (REQ-cli-186)", () => {
  test("flags after `plugins run <name> --` stay plugin args", () => {
    const r = parseGlobalFlags(["plugins", "run", "fledge-hello", "--", ...FLAG_LOOKING]);
    expect(r.pluginArgs).toEqual(FLAG_LOOKING);
    expect(r.rest).toEqual(["plugins", "run", "fledge-hello"]);
    expect(r.nonInteractiveFlag).toBe(false);
    expect(r.json).toBe(false);
    expect(r.noVerify).toBe(false);
    expect(r.taskText).toBeUndefined();
    expect(r.tier).toBeUndefined();
    expect(r.maxRetries).toBeUndefined();
    expect(r.project).toBeUndefined();
  });

  test("global flags and --json before the `--` still apply", () => {
    const r = parseGlobalFlags([
      "--non-interactive",
      "plugins",
      "run",
      "search-grep",
      "--json",
      "--",
      "--no-verify",
      "src",
    ]);
    expect(r.nonInteractiveFlag).toBe(true);
    expect(r.json).toBe(true);
    expect(r.noVerify).toBe(false);
    expect(r.rest).toEqual(["plugins", "run", "search-grep"]);
    expect(r.pluginArgs).toEqual(["--no-verify", "src"]);
  });

  test("a trailing `--` gives empty plugin args; no `--` leaves them unset", () => {
    expect(parseGlobalFlags(["plugins", "run", "x", "--"]).pluginArgs).toEqual([]);
    const r = parseGlobalFlags(["plugins", "run", "x", "a", "--json"]);
    expect(r.pluginArgs).toBeUndefined();
    expect(r.rest).toEqual(["plugins", "run", "x", "a"]);
    expect(r.json).toBe(true);
  });

  test("`--` outside `plugins run <name>` is not a passthrough", () => {
    const r = parseGlobalFlags(["task", "run", "--", "--json"]);
    expect(r.pluginArgs).toBeUndefined();
    expect(r.rest).toEqual(["task", "run", "--"]);
    expect(r.json).toBe(true);
  });

  test("--task still takes the next token verbatim, even `--`", () => {
    const r = parseGlobalFlags(["task", "run", "--task", "--", "--json"]);
    expect(r.taskText).toBe("--");
    expect(r.json).toBe(true);
    expect(r.pluginArgs).toBeUndefined();
  });
});

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
    [ "$1" = "--" ] && shift
    for a in "$@"; do printf 'arg=[%s]\\n' "$a"; done
    ;;
  *) exit 2 ;;
esac
`;

const temps: string[] = [];
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});

function setup(): { project: string; path: string } {
  const root = mkdtempSync(join(tmpdir(), "corvidinho-plugins-argv-"));
  temps.push(root);
  const bin = join(root, "bin");
  const project = join(root, "project");
  mkdirSync(bin);
  mkdirSync(project);
  writeFileSync(join(bin, "fledge"), FAKE_FLEDGE);
  chmodSync(join(bin, "fledge"), 0o755);
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

const echoed = (args: string[]) => ["cmd=hello", ...args.map((a) => `arg=[${a}]`)];

describe("corvidinho plugins run <name> -- ...args (REQ-cli-186)", () => {
  test("every arg after `--` reaches the plugin; --json before it still gives JSON", async () => {
    const s = setup();
    const r = await cli(
      ["--non-interactive", "plugins", "run", "fledge-hello", "--json", "--", ...FLAG_LOOKING],
      s.project,
      { PATH: s.path, CORVIDINHO_ALLOWLIST: "fledge-hello" },
    );
    expect(r.code).toBe(0);
    const body = JSON.parse(r.out) as { ok: boolean; data: { output: string } };
    expect(body.ok).toBe(true);
    expect(body.data.output.trimEnd().split("\n")).toEqual(echoed(FLAG_LOOKING));
  });

  test("`-- -h --json` runs the plugin in text mode instead of printing help", async () => {
    const s = setup();
    const r = await cli(
      ["--non-interactive", "plugins", "run", "fledge-hello", "--", "ls", "-h", "--json", "number"],
      s.project,
      { PATH: s.path, CORVIDINHO_ALLOWLIST: "fledge-hello" },
    );
    expect(r.code).toBe(0);
    expect(r.out).not.toContain("Usage:");
    expect(r.out.trimEnd().split("\n")).toEqual(echoed(["ls", "-h", "--json", "number"]));
  });

  test("--help before `--` still prints Corvidinho help", async () => {
    const s = setup();
    const r = await cli(["plugins", "run", "fledge-hello", "--help", "--", "x"], s.project, {
      PATH: s.path,
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain("Usage:");
    expect(r.out).not.toContain("cmd=hello");
  });

  test("`task run --task -h` runs the task instead of printing help (REQ-cli-143)", async () => {
    const s = setup();
    const r = await cli(["task", "run", "--no-verify", "--json", "--task", "-h"], s.project, {
      PATH: s.path,
    });
    expect(r.code).toBe(0);
    expect(r.out).not.toContain("Usage:");
    const body = JSON.parse(r.out) as { result: { state: string } };
    expect(body.result.state).toBe("done");
  });
});
