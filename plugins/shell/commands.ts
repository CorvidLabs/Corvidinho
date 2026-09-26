/**
 * Shell plugins (PLUGIN-1 / SAFE-3 / REQ-plugins-086..088).
 * Steal: Merlin fledge-plugin-shell project-root clamp (#570).
 */

import { resolve } from "node:path";
import type { PluginCommand, PluginHandlerResult } from "../../src/plugins/types.ts";
import {
  clampRefuseMessage,
  firstDisallowedCd,
} from "./clamp.ts";

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
      "Execute a shell command (sh -c) pinned to the project cwd. dangerous + minTier=code. SAFE-3 refuses cd/pushd outside the root. Args: <command|--command ...>. Options (--json, --command) go before the command; every later token is part of the command.",
    dangerous: true,
    minTier: 2,
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
      const offending = firstDisallowedCd(cmdStr, root);
      if (offending != null) {
        const msg = clampRefuseMessage(root, offending);
        return {
          ok: false,
          error: msg,
          message: msg,
          exitCode: 2,
          data: { refused: true, target: offending, root },
        };
      }

      // Merlin pattern: eval "$1" 2>&1 so trailing comments/quotes don't break redirect.
      const proc = Bun.spawn(
        ["sh", "-c", 'eval "$1" 2>&1', "corvidinho-shell-exec", cmdStr],
        {
          cwd: root,
          stdout: "pipe",
          stderr: "pipe",
          env: {
            ...process.env,
            // Defence-in-depth hint for nested tools (optional consumers).
            CORVIDINHO_PROJECT_ROOT: root,
          },
        },
      );

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const code = await proc.exited;
      const output = stdout + (stderr ? stderr : "");
      const ok = code === 0;
      const data = {
        command: cmdStr,
        cwd: root,
        exitCode: code,
        output,
      };
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
