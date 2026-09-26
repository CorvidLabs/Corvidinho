#!/usr/bin/env bun
/**
 * Corvidinho — Bun/TS CLI (Linux).
 * Surfaces: help, version, doctor, plugins list/run.
 * Secrets stay out of the repo and out of logs (SAFE-6).
 */

import { loadBuiltins } from "./plugins/builtins.ts";
import { allowlistFromEnv, isNonInteractive } from "./plugins/env.ts";
import { list, size } from "./plugins/registry.ts";
import { runPlugin } from "./plugins/run.ts";

export const VERSION = "0.0.1";

type DoctorCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

function printHelp(): void {
  console.log(`corvidinho ${VERSION}

Lean Bun/TS Linux agent CLI.

Usage:
  corvidinho --help                 Show this help
  corvidinho help                   Same as --help
  corvidinho version                Print version
  corvidinho doctor                 Check Discord / GitHub / Fledge / SpecSync / plugins
  corvidinho plugins list           List loaded plugin commands (PLUGIN-6)
  corvidinho plugins run <name> [--json] [-- ...args]
                                    Run a typed plugin command
  corvidinho --non-interactive ...  Deny dangerous plugins unless allowlisted (SAFE-1 / CLI-3)

Env:
  CORVIDINHO_NON_INTERACTIVE / FLEDGE_NON_INTERACTIVE  same as --non-interactive
  CORVIDINHO_ALLOWLIST                                  comma-separated dangerous command names
  CORVIDINHO_GITHUB_DENY_REPOS                          owner/repo or owner/* never touched (GITHUB-6)
  CORVIDINHO_GITHUB_ALLOW_REPOS                         if set, only these repos are allowed

Rules (see AGENTS.md + hi/):
  - HI-first; do not invent ACCESS/bounty/MainNet criteria
  - Secrets stay out of the repo and out of chat logs (SAFE-6)
  - Merge only when SpecSync change + verify are green (GITHUB intent)
`);
}

function which(bin: string): string | null {
  return Bun.which(bin) ?? null;
}

function envPresent(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.length > 0;
}

function parseGlobalFlags(args: string[]): {
  rest: string[];
  nonInteractiveFlag: boolean;
  json: boolean;
} {
  const rest: string[] = [];
  let nonInteractiveFlag = false;
  let json = false;
  for (const a of args) {
    if (a === "--non-interactive") {
      nonInteractiveFlag = true;
      continue;
    }
    if (a === "--json") {
      json = true;
      continue;
    }
    rest.push(a);
  }
  return { rest, nonInteractiveFlag, json };
}

async function doctor(): Promise<number> {
  loadBuiltins();
  const checks: DoctorCheck[] = [];

  const discordTokenSet = envPresent("DISCORD_TOKEN") || envPresent("DISCORD_BOT_TOKEN");
  checks.push({
    name: "discord",
    ok: discordTokenSet,
    detail: discordTokenSet
      ? "token env present (value not shown)"
      : "missing DISCORD_TOKEN or DISCORD_BOT_TOKEN",
  });

  const ghPath = which("gh");
  let ghOk = false;
  let ghDetail = "gh not on PATH";
  if (ghPath) {
    const proc = Bun.spawn(["gh", "auth", "status"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await proc.exited;
    ghOk = code === 0;
    ghDetail = ghOk ? "gh auth status ok" : "gh auth status failed (not logged in?)";
  }
  checks.push({ name: "github", ok: ghOk, detail: ghDetail });

  const fledgePath = which("fledge");
  checks.push({
    name: "fledge",
    ok: Boolean(fledgePath),
    detail: fledgePath ? `found at ${fledgePath}` : "fledge not on PATH",
  });

  const specsyncPath = which("specsync");
  checks.push({
    name: "specsync",
    ok: Boolean(specsyncPath),
    detail: specsyncPath ? `found at ${specsyncPath}` : "specsync not on PATH",
  });

  const pluginCount = size();
  checks.push({
    name: "plugins",
    ok: pluginCount > 0,
    detail: `${pluginCount} command(s) loaded`,
  });

  console.log("corvidinho doctor\n");
  let allOk = true;
  for (const c of checks) {
    const mark = c.ok ? "ok" : "missing";
    console.log(`  [${mark}] ${c.name}: ${c.detail}`);
    if (!c.ok) allOk = false;
  }
  console.log("");
  if (allOk) {
    console.log("All checks passed.");
    return 0;
  }
  console.log(
    "One or more checks failed. Install/configure the missing pieces; secrets stay out of the repo.",
  );
  return 1;
}

async function pluginsList(json: boolean): Promise<number> {
  loadBuiltins();
  const entries = list();
  if (json) {
    console.log(JSON.stringify(entries, null, 2));
  } else {
    console.log(`Loaded plugins (${entries.length}):\n`);
    for (const e of entries) {
      const danger = e.dangerous ? "dangerous" : "safe";
      console.log(`  ${e.name}  [${danger}, tier>=${e.minTier}]  ${e.description}`);
    }
  }
  return 0;
}

async function pluginsRun(
  name: string | undefined,
  passArgs: string[],
  opts: { json: boolean; nonInteractive: boolean },
): Promise<number> {
  loadBuiltins();
  if (!name) {
    console.error("usage: corvidinho plugins run <name> [--json] [-- ...args]");
    return 1;
  }
  const result = await runPlugin({
    name,
    args: passArgs,
    json: opts.json,
    nonInteractive: opts.nonInteractive,
    allowlist: allowlistFromEnv(),
    cwd: process.cwd(),
  });
  if (!result.ok) {
    if (opts.json) {
      console.log(JSON.stringify({ ok: false, error: result.error, data: result.data }, null, 2));
    } else {
      console.error(result.error ?? "plugin failed");
    }
    return result.exitCode ?? 1;
  }
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, data: result.data }, null, 2));
  } else if (result.message) {
    console.log(result.message);
  } else if (result.data !== undefined) {
    console.log(typeof result.data === "string" ? result.data : JSON.stringify(result.data, null, 2));
  }
  return result.exitCode ?? 0;
}

function splitRunArgs(args: string[]): { name: string | undefined; pluginArgs: string[]; json: boolean } {
  let json = false;
  const filtered: string[] = [];
  for (const a of args) {
    if (a === "--json") {
      json = true;
      continue;
    }
    filtered.push(a);
  }
  const dd = filtered.indexOf("--");
  if (dd >= 0) {
    return {
      name: filtered[0],
      pluginArgs: filtered.slice(dd + 1),
      json,
    };
  }
  return {
    name: filtered[0],
    pluginArgs: filtered.slice(1),
    json,
  };
}

export async function main(argv: string[]): Promise<number> {
  const raw = argv.slice(2);
  const { rest, nonInteractiveFlag, json: globalJson } = parseGlobalFlags(raw);
  const nonInteractive = isNonInteractive({ nonInteractiveFlag });

  if (
    rest.length === 0 ||
    raw.includes("--help") ||
    raw.includes("-h") ||
    rest[0] === "help"
  ) {
    printHelp();
    return 0;
  }

  const cmd = rest[0];
  if (cmd === "version" || cmd === "--version" || cmd === "-V") {
    console.log(VERSION);
    return 0;
  }
  if (cmd === "doctor") {
    return doctor();
  }
  if (cmd === "plugins") {
    const sub = rest[1];
    if (sub === "list") {
      return pluginsList(globalJson || rest.includes("--json"));
    }
    if (sub === "run") {
      const { name, pluginArgs, json } = splitRunArgs(rest.slice(2));
      return pluginsRun(name, pluginArgs, {
        json: globalJson || json,
        nonInteractive,
      });
    }
    console.error("usage: corvidinho plugins <list|run> ...\n");
    printHelp();
    return 1;
  }

  console.error(`Unknown command: ${cmd}\n`);
  printHelp();
  return 1;
}

if (import.meta.main) {
  const code = await main(process.argv);
  process.exit(code);
}
