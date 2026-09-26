/**
 * Search plugins (PLUGIN-1 / REQ-plugins-081).
 * Steal: Merlin fledge-plugin-search search-grep.
 */

import { spawnSync } from "node:child_process";
import type { PluginCommand } from "../../src/plugins/types.ts";
import {
  PathEscapeError,
  resolveProjectPath,
} from "../files/resolvePath.ts";
import { ArgvError, parseArgv } from "../files/argv.ts";

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

        const grepArgs = [
          "-rn",
          "-I",
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
        const lines = stdout.split("\n").filter((l) => l.length > 0);
        const matches = lines.map((line) => {
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
