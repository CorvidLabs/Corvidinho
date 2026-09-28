/**
 * Search plugins (PLUGIN-1 / REQ-plugins-081).
 * Steal: Merlin fledge-plugin-search search-grep.
 */

import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { relative } from "node:path";
import type { PluginCommand } from "../../src/plugins/types.ts";
import {
  isSecretPath,
  SECRET_GREP_EXCLUDES,
  secretPathsRefused,
  secretRefuseMessage,
} from "../files/protectedPaths.ts";
import {
  PathEscapeError,
  realRoot,
  resolveProjectPath,
} from "../files/resolvePath.ts";
import { ArgvError, parseArgv } from "../files/argv.ts";

/**
 * Split `grep -Z` output of a recursive search into records: the file, the
 * `N:text` after it, and the `file:N:text` display line. The NUL after the
 * name keeps a name with `:N:` or a newline in it from being misread.
 */
function splitNulRecords(stdout: string): { file: string; rest: string; line: string }[] {
  const out: { file: string; rest: string; line: string }[] = [];
  let pos = 0;
  while (pos < stdout.length) {
    const nul = stdout.indexOf("\0", pos);
    if (nul < 0) break;
    const end = stdout.indexOf("\n", nul + 1);
    const stop = end < 0 ? stdout.length : end;
    const file = stdout.slice(pos, nul);
    const rest = stdout.slice(nul + 1, stop);
    out.push({ file, rest, line: `${file}:${rest}` });
    pos = stop + 1;
  }
  return out;
}

export const searchCommands: PluginCommand[] = [
  {
    name: "search-grep",
    description:
      "Recursive grep under project cwd; skips binaries and build dirs. Args: <pattern> [path] [--include rs,ts] [--json]. A pattern may start with '--'.",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      try {
        const argv = parseArgv(
          ctx.args,
          ["--pattern", "--path", "--include"],
          ["--json"],
        );
        const flaggedPattern = argv.values.get("--pattern");
        const pattern = flaggedPattern ?? argv.positional[0];
        if (!pattern) {
          return { ok: false, error: "missing pattern", exitCode: 1 };
        }
        // Positional path follows the pattern (or comes first when --pattern is used).
        const posPath = argv.positional[flaggedPattern != null ? 0 : 1];
        const pathArg =
          argv.values.get("--path") ??
          (posPath && posPath.length > 0 ? posPath : ".");
        const include = argv.values.get("--include") ?? "";

        const absPath = resolveProjectPath(ctx.cwd, pathArg);
        const root = realRoot(ctx.cwd);
        // ROLES-CHAT-8: non-ADMIN role sessions cannot search a secret path
        // (also through a symlink), same gate as files-read.
        const hideSecrets = await secretPathsRefused();
        if (
          hideSecrets &&
          (isSecretPath(pathArg) || isSecretPath(relative(root, absPath)))
        ) {
          return { ok: false, error: secretRefuseMessage(pathArg), exitCode: 2 };
        }
        const isDir = statSync(absPath, { throwIfNoEntry: false })?.isDirectory() ?? false;

        const grepArgs = [
          "-rn",
          "-I",
          "-Z",
          "--exclude-dir=target",
          "--exclude-dir=node_modules",
          "--exclude-dir=.git",
          "--exclude-dir=dist",
          "--exclude-dir=build",
          "--exclude-dir=.next",
        ];
        for (const ext of include
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)) {
          grepArgs.push(`--include=*.${ext}`);
        }
        // After --include: when both match a file, grep lets the last one win.
        if (hideSecrets) grepArgs.push(...SECRET_GREP_EXCLUDES);
        grepArgs.push("-e", pattern, "--", absPath);

        const result = spawnSync("grep", grepArgs, {
          encoding: "utf8",
          cwd: ctx.cwd,
          maxBuffer: 8 * 1024 * 1024,
        });
        const code = result.status ?? 2;
        if (code !== 0 && code !== 1) {
          const detail = (result.stderr || "").trim() || "grep exited with an error";
          return { ok: false, error: `grep failed: ${detail}`, exitCode: 1 };
        }
        const stdout = result.stdout ?? "";
        // A directory search names each file (NUL-terminated by -Z); a single
        // file operand prints no name, and that file was checked above.
        const records = isDir
          ? splitNulRecords(stdout).filter(
              (r) => !(hideSecrets && isSecretPath(relative(root, r.file))),
            )
          : null;
        const lines = records
          ? records.map((r) => r.line)
          : stdout.split("\n").filter((l) => l.length > 0);
        const matches = records
          ? records.map((r) => {
              const m = r.rest.match(/^(\d+):(.*)$/s);
              return m
                ? { file: r.file, line: Number(m[1]), text: m[2]! }
                : { file: r.file, line: 0, text: r.rest };
            })
          : lines.map((line) => {
              // file:line:text — file may contain colons on some systems; take first two splits
              const m = line.match(/^(.*?):(\d+):(.*)$/);
              if (!m) return { file: line, line: 0, text: "" };
              return { file: m[1]!, line: Number(m[2]), text: m[3]! };
            });
        const data = { count: matches.length, matches };
        if (ctx.json || argv.flags.has("--json")) {
          return {
            ok: true,
            data,
            message: JSON.stringify(data, null, 2),
          };
        }
        const message =
          `${matches.length} match(es)\n` +
          (lines.length ? lines.join("\n") + "\n" : "");
        return { ok: true, data, message };
      } catch (err) {
        if (err instanceof PathEscapeError || err instanceof ArgvError) {
          return { ok: false, error: err.message, exitCode: 1 };
        }
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          exitCode: 1,
        };
      }
    },
  },
];
