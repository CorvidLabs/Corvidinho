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

function flagValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx < 0) return undefined;
  const v = args[idx + 1];
  return v != null && !v.startsWith("--") ? v : undefined;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

/** Collect command string: --command <str> or all non-flag positionals joined. */
function parseCommand(args: string[]): string | undefined {
  const flagged = flagValue(args, "--command");
  if (flagged != null) return flagged;
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--command" || a === "--cwd") {
      i++;
      continue;
    }
    if (a === "--json") continue;
    if (a.startsWith("--")) continue;
    out.push(a);
  }
  if (out.length === 0) return undefined;
  return out.join(" ");
}

export const shellCommands: PluginCommand[] = [
  {
    name: "shell-exec",
    description:
      "Execute a shell command (sh -c) pinned to the project cwd. dangerous + minTier=code. SAFE-3 refuses cd/pushd outside the root. Args: <command|--command ...>",
    dangerous: true,
    minTier: 2,
    async handler(ctx): Promise<PluginHandlerResult> {
      const cmdStr = parseCommand(ctx.args);
      if (!cmdStr || !cmdStr.trim()) {
        return {
          ok: false,
          error: "usage: shell-exec <command>  (or --command <str>)",
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
      if (ctx.json || hasFlag(ctx.args, "--json")) {
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
