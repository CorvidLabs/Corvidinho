/**
 * Shell plugins (PLUGIN-1 / SAFE-3 / SAFE-21 / REQ-plugins-086..088, 494..495).
 * Steal: Merlin fledge-plugin-shell project-root clamp (#570).
 *
 * Before spawning, `shell-exec` refuses SpecSync's human lifecycle steps
 * (sdd-lifecycle.ts, AGENT-18.a), then SAFE-21 foot-guns (footguns.ts), then
 * SAFE-3 escapes (clamp.ts); each refusal is exit 2 and spawns nothing. A
 * command that touches prod or deploys (must-ask.ts, AUTONOMY-9/9.a) waits
 * in `runPlugin` for the owner's Approve card and one-time code first. The
 * child runs with the runners' env (verify-lane scrub, no GitHub / git
 * credentials: SAFE-21.a), bounded like them (timeout, output cap, process
 * group killed on timeout or the calling run's abort), and its output is
 * secret-scrubbed.
 */

import { resolve } from "node:path";
import { redactSecretEnvValues, scrubSecrets } from "../../src/store/scrub.ts";
import type { PluginCommand, PluginHandlerResult } from "../../src/plugins/types.ts";
import { spawnCapped } from "../fledge/spawn.ts";
import {
  RUNNER_MAX_OUTPUT_BYTES,
  RUNNER_TIMEOUT_MS,
  runnerChildEnv,
} from "../runners/commands.ts";
import {
  clampRefuseMessage,
  firstDisallowedCd,
} from "./clamp.ts";
import { firstFootgun, footgunRefuseMessage } from "./footguns.ts";
import { shellProdWhy } from "./must-ask.ts";
import { lifecycleRefusal } from "./sdd-lifecycle.ts";

/** Same bounds as the language runners: a cold build fits, the run's abort stops it sooner. */
export const SHELL_TIMEOUT_MS = RUNNER_TIMEOUT_MS;
export const SHELL_MAX_OUTPUT_BYTES = RUNNER_MAX_OUTPUT_BYTES;

type ParsedCommand = { command?: string; json: boolean; error?: string };

/**
 * Collect the command string (REQ-plugins-243). Only leading options belong to
 * shell-exec: `--json`, `--command <str>` / `--command=<str>`, `--cwd <dir>`
 * (ignored; the cwd is pinned) and `--`, which ends them. From the first other
 * token on, every token is part of the command verbatim, so the command's own
 * flags (`--dry-run`, `--json`, ...) are never dropped. Words left over after
 * `--command` make the call ambiguous and are refused, not dropped.
 */
function parseCommand(args: string[]): ParsedCommand {
  let json = false;
  let flagged: string | undefined;
  let i = 0;
  for (; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--") {
      i++;
      break;
    }
    if (a === "--json") {
      json = true;
      continue;
    }
    if (a === "--command" || a === "--cwd") {
      const v = args[i + 1];
      if (v === undefined) return { json, error: `missing value for ${a}` };
      i++;
      if (a === "--cwd") continue;
      if (flagged !== undefined) return { json, error: "--command given more than once" };
      flagged = v;
      continue;
    }
    if (a.startsWith("--command=")) {
      if (flagged !== undefined) return { json, error: "--command given more than once" };
      flagged = a.slice("--command=".length);
      continue;
    }
    break;
  }
  const rest = args.slice(i);
  if (flagged !== undefined) {
    if (rest.length > 0) {
      return {
        json,
        error: "unexpected argument(s) after --command (put the whole command in --command)",
      };
    }
    return { command: flagged, json };
  }
  return { command: rest.length > 0 ? rest.join(" ") : undefined, json };
}

export const shellCommands: PluginCommand[] = [
  {
    name: "shell-exec",
    description:
      "Execute a shell command (sh -c) pinned to the project cwd, without GitHub/git credentials. dangerous + minTier=code. Refuses (and says why) cd/env -C outside the root (SAFE-3), sed -i or > edits, downloads piped into a shell, deletes outside the worktree and secret reads (SAFE-21), and specsync change approve/review/finalize/ship (AGENT-18.a). Args: <command|--command ...>. Options (--json, --command) go before the command; every later token is part of the command.",
    dangerous: true,
    minTier: 2,
    // AUTONOMY-9/9.a: a command that touches prod or deploys (any contact,
    // read-only looks included) waits for the owner's Approve card + code.
    mustAsk: ({ args, cwd, env }) => {
      const cmdStr = parseCommand(args).command;
      if (!cmdStr || !cmdStr.trim()) return null;
      const root = resolve(cwd);
      const why = shellProdWhy(cmdStr, root, { env });
      return why ? { ask: { class: "prod", why, target: `the command below, run in ${root}`, text: cmdStr } } : null;
    },
    async handler(ctx): Promise<PluginHandlerResult> {
      const parsed = parseCommand(ctx.args);
      const cmdStr = parsed.command;
      if (parsed.error || !cmdStr || !cmdStr.trim()) {
        const usage = "usage: shell-exec <command>  (or --command <str>)";
        return {
          ok: false,
          error: parsed.error ? `${parsed.error}; ${usage}` : usage,
          exitCode: 1,
        };
      }

      const root = resolve(ctx.cwd);
      // AGENT-18.a: the shell never approves, reviews or finalizes a SpecSync
      // change, in any repo (REQ-plugins-1818).
      const lifecycle = lifecycleRefusal(cmdStr, root);
      if (lifecycle != null) return lifecycle;
      // SAFE-21 next, so a foot-gun names its own reason (`curl … | sh` is a
      // download run as code, not a cd).
      const footgun = firstFootgun(cmdStr, root);
      if (footgun != null) {
        const msg = footgunRefuseMessage(footgun);
        return {
          ok: false,
          error: msg,
          message: msg,
          exitCode: 2,
          data: {
            refused: true,
            rule: "SAFE-21",
            family: footgun.rule,
            script: footgun.script,
            root,
          },
        };
      }
      const offending = firstDisallowedCd(cmdStr, root);
      if (offending != null) {
        const msg = clampRefuseMessage(root, offending);
        return {
          ok: false,
          error: msg,
          message: msg,
          exitCode: 2,
          data: { refused: true, rule: "SAFE-3", target: offending, root },
        };
      }

      // The runners' env: the verify-lane scrub (no LLM / Discord / GitHub
      // keys), no GitHub or git credentials (SAFE-21.a), and — SAFE-3 — no
      // inherited CDPATH (a relative `cd sub` could leave the root) or OLDPWD
      // (where `cd -` lands).
      const env = runnerChildEnv(process.env, root);

      // Merlin pattern: eval "$1" 2>&1 so trailing comments/quotes don't break
      // redirect. `CDPATH=; readonly CDPATH` runs first so a dynamically built
      // `CDPATH=…` inside the command cannot re-point a relative `cd sub`
      // outside the root; both no-ops leave the command's exit code / output
      // untouched. This is the runtime half of SAFE-3 — the lexer no longer
      // second-guesses CDPATH.
      const res = await spawnCapped(
        [
          "sh",
          "-c",
          'CDPATH=; readonly CDPATH 2>/dev/null; eval "$1" 2>&1',
          "corvidinho-shell-exec",
          cmdStr,
        ],
        {
          cwd: root,
          env,
          timeoutMs: SHELL_TIMEOUT_MS,
          maxBytes: SHELL_MAX_OUTPUT_BYTES,
          signal: ctx.signal,
        },
      );
      if (res.spawnError) {
        return {
          ok: false,
          error: `shell-exec: sh could not start: ${scrubSecrets(res.spawnError)}`,
          exitCode: 127,
          data: { command: cmdStr, cwd: root, exitCode: 127, started: false },
        };
      }

      // Shell output is untrusted data headed for chat/logs: scrub secrets (SAFE-6).
      let output = scrubSecrets(redactSecretEnvValues(res.stdout + res.stderr));
      if (res.truncated) {
        output += `\n[output truncated at ${SHELL_MAX_OUTPUT_BYTES} bytes per stream]\n`;
      }
      const code = res.timedOut ? 124 : res.aborted ? 130 : res.code;
      const ok = code === 0;
      const data = {
        command: cmdStr,
        cwd: root,
        exitCode: code,
        timedOut: res.timedOut,
        aborted: res.aborted,
        truncated: res.truncated,
        output,
      };
      if (res.timedOut || res.aborted) {
        const why = res.timedOut
          ? `shell-exec timed out after ${SHELL_TIMEOUT_MS}ms and was killed`
          : "shell-exec stopped: the calling run was interrupted";
        return { ok: false, data, message: output, error: why, exitCode: code };
      }
      if (ctx.json || parsed.json) {
        return {
          ok,
          data,
          message: output,
          exitCode: code,
          error: ok ? undefined : `shell-exec exited ${code}`,
        };
      }
      return {
        ok,
        data,
        message: output || (ok ? "(no output)\n" : `shell-exec exited ${code}\n`),
        exitCode: code,
        error: ok ? undefined : `shell-exec exited ${code}`,
      };
    },
  },
];
