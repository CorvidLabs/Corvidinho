#!/usr/bin/env bun
/**
 * Corvidinho — Bun/TS CLI (Linux).
 * Surfaces: help, version, doctor, plugins list/run, specsync *, task run (prove-before-done).
 * Secrets stay out of the repo and out of logs (SAFE-6).
 */

import { existsSync } from "node:fs";
import {
  createNdjsonWriter,
  createTaskExecute,
  loadAgentConfig,
  parseCapabilityTier,
  runTask,
  TASK_OUTPUT_MODES,
  type AgentEvent,
  type CapabilityTier,
  type SpendWarning,
  type TaskOutputMode,
  type TaskResult,
} from "./agent/index.ts";
import { loadLlmEnv } from "./agent/execute.ts";
import { spendDoctorCheck } from "./agent/spend.ts";
import { attribution } from "./attribution.ts";
import {
  CORVIDINHO_PROTOCOL_VERSION,
  formatRegisterCommandsFailure,
  goLiveChecklist,
  registerSlashCommandsLive,
  startBridge,
} from "./discord/index.ts";
import {
  goLiveChecklist as watchGoLiveChecklist,
  startWatchPoller,
} from "./watch/index.ts";
import { runDaemon } from "./daemon/index.ts";
import {
  dataDirDoctorCheck,
  discordDoctorCheck,
  githubWatchDoctorCheck,
  llmDoctorCheck,
  loadDoctorAllowlist,
  type DoctorCheck,
} from "./doctor.ts";
import { loadAllowlistFile, resolveAllowlistPath } from "./allowlist/load.ts";
import { formatOwnerDoctorDetail, loadOwnerConfig } from "./identity/owner.ts";
import { loadBuiltins } from "./plugins/builtins.ts";
import { allowlistFromEnv, isNonInteractive } from "./plugins/env.ts";
import { forwardedSignals } from "./plugins/proc-group.ts";
import { get, list, size } from "./plugins/registry.ts";
import { PluginNotFoundError, runPlugin } from "./plugins/run.ts";
import {
  formatPluginsListText,
  toolSurfaceReport,
  withToolCost,
} from "./plugins/toolCost.ts";
import { fledgeStatusLines, loadFledgePlugins } from "../plugins/fledge/index.ts";
import { loadRunnerPlugins, runnerStatusLines } from "../plugins/runners/index.ts";
import { DEFAULT_DATA_DIR_REL } from "./store/paths.ts";
import { formatErrorLine } from "./store/scrub.ts";
import { VERSION } from "./version.ts";

export { VERSION };

function printHelp(): void {
  console.log(`corvidinho ${VERSION}

Lean Bun/TS Linux agent CLI.

Usage:
  corvidinho --help                 Show this help
  corvidinho help                   Same as --help
  corvidinho version                Print version
  corvidinho attribution             Print the canonical attribution footer
  corvidinho --protocol-version     Print wire protocol integer (DISCORD-10)
  corvidinho doctor                 Check Discord / GitHub / Fledge / SpecSync / plugins / LLM key / data dir
  corvidinho discord bridge         Start HEAR Discord bridge (DISCORD-1/2/3/4/5)
  corvidinho discord register-commands
                                    Full-overwrite slash set (guild PUT + clear globals)
  corvidinho github watch           Start WATCH GitHub mention poll (ALLOW-1; poll-first)
  corvidinho daemon                 Tick schedules headlessly, no Discord needed (CLI-8 / AUTONOMOUS-4;
                                    one per data dir; JSON-line logs; systemd: docs/DAEMON.md)
  corvidinho plugins list           List loaded plugin commands (PLUGIN-6)
  corvidinho plugins run <name> [--json] [-- ...args]
                                    Run a typed plugin command
  corvidinho specsync <list|read|check|brief|coverage|change-list|ship-status> [...]
                                    SpecSync agent tools (SPECSYNC-1..6; local binary)
  corvidinho task run [--task TEXT] [--tier read|tool|code] [--no-verify] [--max-retries N]
                    [--output text|json|ndjson] [--json]
                                    LLM tool loop (plugins) when key set; prove-before-done verify gate (AGENT-3/4/5)
                                    --json = --output json (one result); ndjson = live event stream
                                    for bridges, one versioned frame per line (AGENT-8 / CLI-7)
  corvidinho --non-interactive ...  Deny dangerous plugins unless allowlisted (SAFE-1 / CLI-3)
  corvidinho --no-verify ...        Skip verify gate (local/operator opt-out only)

Env / allowlists (ALLOW-4; empty = deny-all, never Merlin BASIC):
  CORVIDINHO_NON_INTERACTIVE / FLEDGE_NON_INTERACTIVE  same as --non-interactive
  CORVIDINHO_ALLOWLIST                                  comma-separated dangerous command names
  CORVIDINHO_ALLOWLIST_FILE                             path to allowlist.toml|json on the bot VM
  CORVIDINHO_GITHUB_ALLOW_REPOS / _ORGS / _USERS        default-deny; deny wins (GITHUB-6)
  CORVIDINHO_GITHUB_DENY_REPOS / _ORGS / _USERS         always refuse these
  CORVIDINHO_DISCORD_ALLOW_CHANNELS / _ROLES / _USERS   HEAR allowlists; empty = refuse (deny-all)
  CORVIDINHO_DISCORD_DENY_CHANNELS / _ROLES / _USERS    deny overrides
  DISCORD_TOKEN / DISCORD_BOT_TOKEN                     required for discord bridge (never commit)
  DISCORD_CHANNEL_IDS                                   non-empty channel ids (union with allowlist)
  DISCORD_GUILD_ID                                      preferred; guild slash overwrite + clear globals
  GITHUB_TOKEN / GH_TOKEN                               required for github watch + Octokit reads
  CORVIDINHO_WATCH_USERNAME                             GitHub login to listen for (WATCH)
  CORVIDINHO_WATCH_INTERVAL_MS                          poll interval (default 60000, min 30000)
  CORVIDINHO_WATCH_DRY_RUN=1                            echo agent; no spawn
  CORVIDINHO_LLM_API_KEY / OPENAI_API_KEY               enable OpenAI-compatible execute (never commit)
  CORVIDINHO_LLM_BASE_URL / CORVIDINHO_LLM_MODEL        provider endpoint + model
  CORVIDINHO_LLM_TIER=read|tool|code                    capability tier (AGENT-5; default tool)
  CORVIDINHO_DAILY_SPEND_CAP_USD                        optional USD cap on provider calls per rolling 24h: warn at 80%, stop and ask at 100% (SAFE-8)
  (AlgoChat / wallet ACT deferred until wallet allowlist exists — WALLET-1..3)

Rules (see AGENTS.md + hi/):
  - HI-first; do not invent ACCESS/bounty/MainNet criteria
  - Secrets stay out of the repo and out of chat logs (SAFE-6)
  - Merge only when SpecSync change + verify are green (GITHUB intent)
  - Real code tasks: prove-before-done via fledge verify incl. spec-check (AGENT-4 / SPECSYNC-2)
  - Prefer SpecSync plugins (list/read/check/brief) over raw shell (SPECSYNC-6)
`);
}

function which(bin: string): string | null {
  return Bun.which(bin) ?? null;
}

function envPresent(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.length > 0;
}

/**
 * `--task` always takes the next argv item as the task text, even when it
 * starts with `-`: the bridges pass untrusted Discord / GitHub text there, and
 * a message like `--tier=code` or `--no-verify` must stay task text, never
 * become a flag (AGENT-5 / SAFE-1). `--task=TEXT` may span lines.
 */
export function parseGlobalFlags(args: string[]): {
  rest: string[];
  nonInteractiveFlag: boolean;
  json: boolean;
  noVerify: boolean;
  maxRetries: number | undefined;
  taskText: string | undefined;
  tier: CapabilityTier | undefined;
} {
  const rest: string[] = [];
  let nonInteractiveFlag = false;
  let json = false;
  let noVerify = false;
  let maxRetries: number | undefined;
  let taskText: string | undefined;
  let tier: CapabilityTier | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--non-interactive") {
      nonInteractiveFlag = true;
      continue;
    }
    if (a === "--json") {
      json = true;
      continue;
    }
    if (a === "--no-verify") {
      noVerify = true;
      continue;
    }
    if (a === "--task") {
      if (i + 1 < args.length) {
        taskText = args[i + 1];
        i++;
      }
      continue;
    }
    const tf = a.match(/^--task=(.+)$/s);
    if (tf) {
      taskText = tf[1];
      continue;
    }
    if (a === "--tier") {
      const next = args[i + 1];
      if (next && !next.startsWith("-")) {
        tier = parseCapabilityTier(next, "tool");
        i++;
      }
      continue;
    }
    const tr = a.match(/^--tier=(.+)$/);
    if (tr) {
      tier = parseCapabilityTier(tr[1], "tool");
      continue;
    }
    if (a === "--max-retries") {
      const next = args[i + 1];
      if (next && /^\d+$/.test(next)) {
        maxRetries = Number.parseInt(next, 10);
        i++;
      }
      continue;
    }
    const mr = a.match(/^--max-retries=(\d+)$/);
    if (mr) {
      maxRetries = Number.parseInt(mr[1], 10);
      continue;
    }
    rest.push(a);
  }
  return { rest, nonInteractiveFlag, json, noVerify, maxRetries, taskText, tier };
}

async function doctor(): Promise<number> {
  loadBuiltins();
  const checks: DoctorCheck[] = [];

  // CLI-4 / ALLOW-3/4 — channel / repo allowlists through the bridge / WATCH
  // loader (allowlist file + env overlays, deny wins); source named, values not.
  const allow = await loadDoctorAllowlist(process.env);
  const discordCheck = discordDoctorCheck(allow, process.env);
  checks.push(discordCheck);

  const tokenOk = envPresent("GITHUB_TOKEN") || envPresent("GH_TOKEN");
  checks.push({
    name: "github",
    ok: tokenOk,
    detail: tokenOk
      ? "GITHUB_TOKEN/GH_TOKEN present for Octokit (value not shown)"
      : "missing GITHUB_TOKEN or GH_TOKEN for Octokit plugins",
  });

  const watchCheck = githubWatchDoctorCheck(allow, process.env);
  checks.push(watchCheck);

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

  // ALLOW-4 — an allowlist file that exists but cannot be read or parsed stops
  // the bridge, watch and daemon (fail closed); say so here, with the loader's
  // error (path, line and key — never list values).
  const allowPath = resolveAllowlistPath(process.env);
  if (allowPath && existsSync(allowPath)) {
    const loaded = await loadAllowlistFile(allowPath);
    checks.push({
      name: "allowlist-file",
      ok: loaded.ok,
      mark: loaded.ok ? "ok" : "fail",
      detail: loaded.ok
        ? `${allowPath} loads (values not shown)`
        : `${loaded.error} — bridge, watch and daemon refuse to start and gates refuse until it is fixed`,
    });
  } else {
    checks.push({
      name: "allowlist-file",
      ok: true,
      mark: "info",
      detail: allowPath
        ? `${allowPath} not found — env overlays only`
        : "no allowlist file — env overlays only (CORVIDINHO_ALLOWLIST_FILE or ~/.config/corvidinho/allowlist.toml|json)",
    });
  }

  // IDENTITY-1 — owner yes/no + display only (never ids/logins/tokens).
  // Optional: a missing owner is informational and never fails doctor.
  const ownerLoad = await loadOwnerConfig({ env: process.env });
  checks.push({
    name: "owner",
    ok: true,
    mark: ownerLoad.owner && ownerLoad.issues.length === 0 ? "ok" : "info",
    detail: formatOwnerDoctorDetail(ownerLoad),
  });
  // IDENTITY-2 — ADMIN is owner-only; legacy admin lists are ignored.
  if (
    (process.env.CORVIDINHO_DISCORD_ADMIN_USERS ?? "").trim() ||
    (process.env.CORVIDINHO_DISCORD_ADMIN_ROLES ?? "").trim()
  ) {
    checks.push({
      name: "admin-lists",
      ok: true,
      mark: "warn",
      detail:
        "CORVIDINHO_DISCORD_ADMIN_USERS/_ROLES are ignored — ADMIN is owner-only (IDENTITY-2)",
    });
  }

  // CLI-4 — task run without a key uses the demo stub (warn, never fails doctor);
  // the bridge, watch, daemon and memory tools need a writable data dir.
  checks.push(llmDoctorCheck(process.env));
  checks.push(dataDirDoctorCheck(process.env));

  // SAFE-8 / AUTONOMOUS-8 — rolling 24 h spend vs the cap (info when no cap; never fails doctor).
  checks.push({ name: "spend", ...spendDoctorCheck({ env: process.env, model: loadLlmEnv().model }) });

  console.log("corvidinho doctor\n");
  let allOk = true;
  for (const c of checks) {
    const mark = c.mark ?? (c.ok ? "ok" : "missing");
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
  if (!discordCheck.ok) {
    console.log("");
    console.log(goLiveChecklist());
  }
  if (!watchCheck.ok) {
    console.log("");
    console.log(watchGoLiveChecklist());
  }
  return 1;
}

async function pluginsList(json: boolean): Promise<number> {
  loadBuiltins();
  // PLUGIN-4: which language runners loaded, and why any did not (idempotent).
  const runners = loadRunnerPlugins();
  // FLEDGE-4 / PLUGIN-3: project Fledge plugins; failure degrades to builtins only.
  const fledge = await loadFledgePlugins({ cwd: process.cwd() });
  const entries = withToolCost(list());
  if (json) {
    console.log(JSON.stringify(entries, null, 2));
  } else {
    // PLUGIN-6 / FLEDGE-5: per-command schema cost + tool-surface budget.
    console.log(
      formatPluginsListText(entries, toolSurfaceReport(entries), [
        ...runnerStatusLines(runners),
        ...fledgeStatusLines(fledge),
      ]),
    );
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
  if (name.startsWith("fledge-") && !get(name)) {
    await loadFledgePlugins({ cwd: process.cwd() });
  }
  let result: Awaited<ReturnType<typeof runPlugin>>;
  try {
    result = await runPlugin({
      name,
      args: passArgs,
      json: opts.json,
      nonInteractive: opts.nonInteractive,
      allowlist: allowlistFromEnv(),
      cwd: process.cwd(),
    });
  } catch (err) {
    // REQ-cli-419: an unknown name or a throwing handler is one clean line.
    return reportCliError(err, { json: opts.json });
  }
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

const TASK_RUN_USAGE =
  "usage: corvidinho task run [--task TEXT] [--tier read|tool|code] [--no-verify] [--max-retries N] [--output text|json|ndjson] [--json]";

/**
 * `--output text|json|ndjson` for `task run` (CLI-7). Parsed only here so a
 * plugin's own `--output` after `--` is never taken. `--json` = `--output json`;
 * an explicit `--output` wins. Returns null for a missing or unknown value.
 */
export function parseTaskOutputMode(
  args: string[],
  json: boolean,
): TaskOutputMode | null {
  let value: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--output") {
      const next = args[i + 1];
      value = next && !next.startsWith("-") ? next : "";
      if (value) i++;
      continue;
    }
    const m = a.match(/^--output=(.*)$/);
    if (m) value = m[1];
  }
  if (value === undefined) return json ? "json" : "text";
  const mode = value.trim().toLowerCase();
  return (TASK_OUTPUT_MODES as readonly string[]).includes(mode)
    ? (mode as TaskOutputMode)
    : null;
}

/**
 * Demo task: marks a synthetic file change so the verify gate exercises
 * (unless --no-verify). Bridges MUST NOT pass --no-verify (REQ-cli-085 /
 * REQ-discord-085 / REQ-watch-085 / AGENT-4); the flag is local opt-out only.
 * `ndjson` streams one frame per line (REQ-cli-073 / REQ-agent-073).
 */
async function taskRun(opts: {
  output: TaskOutputMode;
  noVerify: boolean;
  maxRetries: number | undefined;
  taskText: string | undefined;
  tier: CapabilityTier | undefined;
  nonInteractive: boolean;
}): Promise<number> {
  const cwd = process.cwd();
  const config = loadAgentConfig(cwd);
  const events: AgentEvent[] = [];
  const json = opts.output === "json";
  // Machine modes keep stderr quiet; ndjson writes each frame as it happens.
  const quiet = opts.output !== "text";
  const ndjson =
    opts.output === "ndjson"
      ? createNdjsonWriter((line) => console.log(line))
      : null;
  const handleEvent = (e: AgentEvent) => {
    events.push(e);
    ndjson?.event(e);
    if (quiet) return;
    if (e.type === "StateChanged") {
      console.error(`→ ${e.state}`);
    } else if (e.type === "Text") {
      console.error(e.text);
    } else if (e.type === "ToolCall") {
      console.error(`▸ ${e.name} ${e.args.slice(0, 200)}`);
    } else if (e.type === "ToolResult") {
      console.error(
        `${e.name} → ${e.success ? "ok" : "fail"}${e.detail ? `: ${e.detail.slice(0, 120)}` : ""}`,
      );
    } else if (e.type === "VerifyResult") {
      console.error(`verify: ${e.success ? "pass" : "fail"}`);
    }
  };
  const execute = createTaskExecute({
    taskText: opts.taskText,
    cwd,
    tier: opts.tier,
    nonInteractive: opts.nonInteractive,
    allowlist: allowlistFromEnv(),
    onEvent: handleEvent,
    onUsage: ndjson ? (u) => ndjson.usage(u) : undefined,
    // SAFE-8: the 80% warning rides the result (--json / ndjson) for bridges.
    onSpendWarning: (w) => {
      spendWarning = w;
    },
  });
  let spendWarning: SpendWarning | undefined;
  // AGENT-3 (REQ-cli-244): SIGINT / SIGTERM abort the run so the verify lane
  // and tool loop stop and the cancelled result below is still printed (exit
  // 130). `once`: a second signal takes the default action. A signal this
  // process started with ignored (a background job's SIGINT) is not hooked:
  // a listener would replace SIG_IGN and removing it restores SIG_DFL.
  const abort = new AbortController();
  const onSignal = () => abort.abort();
  const hooked = forwardedSignals().filter(
    (sig) => sig === "SIGINT" || sig === "SIGTERM",
  );
  for (const sig of hooked) process.once(sig, onSignal);
  let result: TaskResult;
  try {
    result = await runTask({
      cwd,
      task: opts.taskText,
      config,
      verifyBeforeComplete: opts.noVerify ? false : undefined,
      maxRetries: opts.maxRetries,
      signal: abort.signal,
      onEvent: handleEvent,
      execute: async (ctx) => {
        if (ctx.verifyFeedback && !quiet) {
          console.error(`(attempt ${ctx.attempt}) feedback:\n${ctx.verifyFeedback.slice(0, 500)}`);
        }
        return execute(ctx);
      },
    });
  } finally {
    for (const sig of hooked) process.off(sig, onSignal);
  }
  if (spendWarning) result.spendWarning = spendWarning;

  if (ndjson) {
    ndjson.result(result);
  } else if (json) {
    console.log(JSON.stringify({ result, events }, null, 2));
  } else {
    console.log(
      `state=${result.state} verified=${result.verified} verifySkipped=${result.verifySkipped} cancelled=${result.cancelled} attempts=${result.attempts}`,
    );
    console.log(result.summary);
    // SAFE-8: a spend-cap summary is generic; the operator details are in the ask.
    if (result.ask && !result.summary.includes(result.ask.question)) {
      console.log(result.ask.question);
    }
  }

  if (result.cancelled) return 130;
  if (result.state === "failed" || (result.verified === false && !result.verifySkipped)) {
    return 1;
  }
  return 0;
}


async function specsyncCli(
  sub: string | undefined,
  args: string[],
  opts: { json: boolean; nonInteractive: boolean },
): Promise<number> {
  const map: Record<string, string> = {
    list: "specsync-list",
    read: "specsync-read",
    check: "specsync-check",
    brief: "specsync-brief",
    coverage: "specsync-coverage",
    "change-list": "specsync-change-list",
    "ship-status": "specsync-ship-status",
  };
  if (!sub || !(sub in map)) {
    console.error(
      "usage: corvidinho specsync <list|read|check|brief|coverage|change-list|ship-status> [...]",
    );
    return 1;
  }
  return pluginsRun(map[sub], args, opts);
}



async function discordRegisterCommands(argv: string[]): Promise<number> {
  let guildId = process.env.DISCORD_GUILD_ID?.trim() || undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--guild-id") {
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        guildId = next.trim();
        i++;
      }
      continue;
    }
    const m = a.match(/^--guild-id=(.+)$/);
    if (m) {
      guildId = m[1].trim();
    }
  }

  const token =
    process.env.DISCORD_BOT_TOKEN?.trim() ||
    process.env.DISCORD_TOKEN?.trim() ||
    "";
  if (!token) {
    console.error(
      "missing DISCORD_TOKEN or DISCORD_BOT_TOKEN — set the bot token in the VM env/secret store (never commit).",
    );
    console.error(goLiveChecklist());
    return 1;
  }

  // Application id = base64 of first JWT segment of bot token (no secret echo).
  let applicationId: string;
  try {
    const part = token.split(".")[0] ?? "";
    const pad = "=".repeat((4 - (part.length % 4)) % 4);
    applicationId = Buffer.from(part + pad, "base64").toString("utf8");
    if (!/^\d+$/.test(applicationId)) {
      throw new Error("application id decode failed");
    }
  } catch {
    console.error(
      "could not derive application id from bot token; check DISCORD_TOKEN / DISCORD_BOT_TOKEN",
    );
    return 1;
  }

  try {
    const result = await registerSlashCommandsLive({
      token,
      applicationId,
      guildId,
    });
    if (result.scope === "guild") {
      console.log(
        `[discord] registered ${result.registeredCount} guild slash command(s) on ${result.guildId} (globals cleared)`,
      );
    } else {
      console.log(
        `[discord] registered ${result.registeredCount} global slash command(s)`,
      );
      if (result.warnNoGuildId) {
        console.warn(`[discord] ${result.warnNoGuildId}`);
      }
    }
    return 0;
  } catch (err) {
    // REQ-cli-419: one scrubbed line, never the raw DiscordAPIError dump.
    console.error(formatRegisterCommandsFailure(err));
    return 1;
  }
}

async function discordBridge(): Promise<number> {
  const result = await startBridge({ projectRoot: process.cwd() });
  if (!result.ok) {
    console.error(result.message);
    return result.exitCode;
  }
  // Keep process alive until signal.
  await new Promise<void>((resolve) => {
    const stop = async () => {
      console.log("[discord] shutting down...");
      await result.stop();
      resolve();
    };
    process.once("SIGINT", () => {
      void stop();
    });
    process.once("SIGTERM", () => {
      void stop();
    });
  });
  return 0;
}

async function githubWatch(): Promise<number> {
  const result = await startWatchPoller({ projectRoot: process.cwd() });
  if (!result.ok) {
    console.error(result.message);
    return result.exitCode;
  }
  console.log(
    `[watch] poll-first started for @${result.config.mentionUsername} on ${result.config.repos.join(", ")} every ${result.config.intervalMs}ms` +
      (result.config.dryRun ? " (dry-run)" : ""),
  );
  return new Promise<number>((resolve) => {
    const stop = async () => {
      console.log("[watch] shutting down...");
      await result.stop();
      resolve(0);
    };
    process.once("SIGINT", () => {
      void stop();
    });
    process.once("SIGTERM", () => {
      void stop();
    });
    // REQ-cli-419: a rejected token (401) stops the poller; exit non-zero.
    void result.fatal.then(async (f) => {
      try {
        await result.stop();
      } catch {
        // The poll loop already stopped; a failed DB close must not hang or
        // crash the exit (the fatal line was printed by the poller).
      } finally {
        resolve(f.exitCode);
      }
    });
  });
}

export async function main(argv: string[]): Promise<number> {
  const raw = argv.slice(2);
  const {
    rest,
    nonInteractiveFlag,
    json: globalJson,
    noVerify,
    maxRetries,
    taskText,
    tier,
  } = parseGlobalFlags(raw);
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
  if (cmd === "attribution") {
    console.log(attribution());
    return 0;
  }
  if (cmd === "--protocol-version") {
    console.log(String(CORVIDINHO_PROTOCOL_VERSION));
    return 0;
  }
  if (cmd === "doctor") {
    return doctor();
  }
  if (cmd === "discord") {
    const sub = rest[1];
    if (sub === "bridge") {
      return discordBridge();
    }
    if (sub === "register-commands") {
      return discordRegisterCommands(rest.slice(2));
    }
    console.error(
      "usage: corvidinho discord <bridge|register-commands> [--guild-id ID]\n",
    );
    printHelp();
    return 1;
  }
  if (cmd === "github") {
    const sub = rest[1];
    if (sub === "watch") {
      return githubWatch();
    }
    console.error("usage: corvidinho github watch\n");
    printHelp();
    return 1;
  }
  if (cmd === "daemon") {
    // CLI-8 / AUTONOMOUS-4: headless schedule ticker (src/daemon/).
    return runDaemon({ projectRoot: process.cwd() });
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
  if (cmd === "specsync") {
    return specsyncCli(rest[1], rest.slice(2), {
      json: globalJson || rest.includes("--json"),
      nonInteractive,
    });
  }
  if (cmd === "task") {
    const sub = rest[1];
    if (sub === "run") {
      const output = parseTaskOutputMode(
        rest.slice(2),
        globalJson || rest.includes("--json"),
      );
      if (!output) {
        console.error(`${TASK_RUN_USAGE}\n`);
        return 1;
      }
      return taskRun({
        output,
        noVerify,
        maxRetries,
        taskText,
        tier,
        nonInteractive,
      });
    }
    console.error(`${TASK_RUN_USAGE}\n`);
    printHelp();
    return 1;
  }

  console.error(`Unknown command: ${cmd}\n`);
  printHelp();
  return 1;
}

/** One next step for the operator, matched to the error kind (CLI-4). */
export function cliErrorHint(err: unknown): string {
  if (err instanceof PluginNotFoundError) {
    return "run `corvidinho plugins list` for the available commands";
  }
  const e = err as { code?: unknown; path?: unknown } | null;
  const code = e && typeof e === "object" && typeof e.code === "string" ? e.code : "";
  if (
    (/^E[A-Z]+$/.test(code) && typeof e?.path === "string") ||
    // The data dir exists but the DB in it cannot be opened (bun:sqlite).
    /^SQLITE_(CANTOPEN|READONLY|PERM|NOTADB)$/.test(code)
  ) {
    return `check that the path exists and is writable; the data dir is CORVIDINHO_DATA_DIR (default ~/${DEFAULT_DATA_DIR_REL})`;
  }
  return "run `corvidinho doctor` to check the environment";
}

function cliExitCode(err: unknown): number {
  const c = (err as { exitCode?: unknown } | null)?.exitCode;
  return typeof c === "number" && Number.isInteger(c) && c >= 1 && c <= 255 ? c : 1;
}

/**
 * REQ-cli-419 (CLI-4 / CLI-7 / SAFE-6): report a failed command as one
 * scrubbed line plus a hint, never a stack or a library dump. Text mode:
 * `corvidinho: <line>` then `hint: …` on stderr. `--json`: `{ ok: false,
 * error }` on stdout (the `plugins run --json` error shape), hint on stderr.
 * Returns the error's own `exitCode` (1–255) or 1.
 */
export function reportCliError(err: unknown, opts: { json?: boolean } = {}): number {
  const line = formatErrorLine(err);
  if (opts.json) {
    console.log(JSON.stringify({ ok: false, error: line }, null, 2));
  } else {
    console.error(`corvidinho: ${line}`);
  }
  console.error(`hint: ${cliErrorHint(err)}`);
  return cliExitCode(err);
}

/** True when argv asks for a single JSON result (`--json` / `--output json`). */
function wantsJson(args: string[]): boolean {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--") break;
    if (a === "--json" || a === "--output=json") return true;
    if (a === "--output" && args[i + 1] === "json") return true;
  }
  return false;
}

/**
 * Top-level CLI error boundary (REQ-cli-419): runs `main` and turns anything
 * it throws into {@link reportCliError} output and a non-zero exit code, so
 * no command ends in a stack trace or Bun's crash footer.
 */
export async function runCli(
  argv: string[],
  run: (argv: string[]) => Promise<number> = main,
): Promise<number> {
  try {
    return await run(argv);
  } catch (err) {
    return reportCliError(err, { json: wantsJson(argv.slice(2)) });
  }
}

if (import.meta.main) {
  const code = await runCli(process.argv);
  process.exit(code);
}
