#!/usr/bin/env bun
/**
 * Corvidinho — Bun/TS CLI stub (Linux).
 * Bootstrap only: --help, doctor, version. No secrets in repo or logs.
 */

export const VERSION = "0.0.1";

type DoctorCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

function printHelp(): void {
  console.log(`corvidinho ${VERSION}

Lean Bun/TS Linux agent CLI (bootstrap stub).

Usage:
  corvidinho --help       Show this help
  corvidinho help         Same as --help
  corvidinho version      Print version
  corvidinho doctor       Check Discord / GitHub / Fledge / SpecSync usability

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

async function doctor(): Promise<number> {
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

export async function main(argv: string[]): Promise<number> {
  const args = argv.slice(2);
  if (
    args.length === 0 ||
    args.includes("--help") ||
    args.includes("-h") ||
    args[0] === "help"
  ) {
    printHelp();
    return 0;
  }
  const cmd = args[0];
  if (cmd === "version" || cmd === "--version" || cmd === "-V") {
    console.log(VERSION);
    return 0;
  }
  if (cmd === "doctor") {
    return doctor();
  }
  console.error(`Unknown command: ${cmd}\n`);
  printHelp();
  return 1;
}

if (import.meta.main) {
  const code = await main(process.argv);
  process.exit(code);
}
