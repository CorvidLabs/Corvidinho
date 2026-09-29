/**
 * File plugins (PLUGIN-1 / REQ-plugins-081..083).
 * Steal: Merlin fledge-plugin-files + corvid-agent coding-tools path clamp.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { Glob } from "bun";
import type {
  PluginCommand,
  PluginHandlerResult,
  PluginImage,
} from "../../src/plugins/types.ts";
import { MAX_IMAGE_SIZE_BYTES, sniffImageFile } from "./image.ts";
import {
  isProtectedPath,
  isSecretPath,
  protectedRefuseMessage,
  secretPathsRefused,
  secretRefuseMessage,
} from "./protectedPaths.ts";
import {
  assertExistingFile,
  PathEscapeError,
  realRoot,
  resolveProjectPath,
} from "./resolvePath.ts";
import { ArgvError, parseArgv } from "./argv.ts";

/** Boolean flags any files-* command understands; everything else is data. */
const BOOL_FLAGS = [
  "--json",
  "--replace-all",
  "--show-hidden",
  "--allow-large",
  "--allow-empty",
] as const;

function refuseProtected(
  userPath: string,
  absPath: string,
  cwd: string,
): PluginHandlerResult | null {
  const root = realRoot(cwd);
  if (isProtectedPath(userPath, root) || isProtectedPath(absPath, root)) {
    return {
      ok: false,
      error: protectedRefuseMessage(userPath),
      exitCode: 2,
    };
  }
  return null;
}

/**
 * ROLES-CHAT-8 / IDENTITY-10: a non-owner role session (a team member's
 * `/work` run is the only one that reaches the edit tools) never writes or
 * edits a secret-looking path — `files-edit` would otherwise answer whether a
 * string is in it. Re-checked at this call, like the read tools.
 */
async function refuseSecretForRole(
  userPath: string,
  absPath: string,
  cwd: string,
): Promise<PluginHandlerResult | null> {
  if (!isSecretPath(userPath) && !isSecretPath(relative(realRoot(cwd), absPath))) {
    return null;
  }
  if (!(await secretPathsRefused())) return null;
  return { ok: false, error: secretRefuseMessage(userPath), exitCode: 2 };
}

function errResult(err: unknown): PluginHandlerResult {
  if (err instanceof PathEscapeError || err instanceof ArgvError) {
    return { ok: false, error: err.message, exitCode: 1 };
  }
  return {
    ok: false,
    error: err instanceof Error ? err.message : String(err),
    exitCode: 1,
  };
}

/**
 * files-read of a PNG / JPEG / GIF / WebP (REQ-plugins-427): metadata in
 * `data` and `message`, the bytes only on `image`. Over the 20MB image cap
 * is refused.
 */
function readImage(
  pathArg: string,
  abs: string,
  mediaType: PluginImage["mediaType"],
  size: number,
): PluginHandlerResult {
  const overCap = (n: number): PluginHandlerResult => ({
    ok: false,
    error:
      `refused: image '${pathArg}' is ${n} bytes, over the ` +
      `${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB image limit`,
    exitCode: 1,
  });
  if (size > MAX_IMAGE_SIZE_BYTES) return overCap(size);
  const buf = readFileSync(abs);
  if (buf.length > MAX_IMAGE_SIZE_BYTES) return overCap(buf.length);
  return {
    ok: true,
    data: { path: pathArg, bytes: buf.length, mediaType, image: true },
    message: `image ${pathArg} (${mediaType}, ${buf.length} bytes) opened for viewing`,
    image: { path: pathArg, mediaType, base64: buf.toString("base64") },
  };
}

const SIZE_GUARD_FLOOR = 64 * 1024;

function checkSizeExplosion(
  path: string,
  originalLen: number,
  newLen: number,
  allowLarge: boolean,
): PluginHandlerResult | null {
  if (allowLarge) return null;
  const limit = Math.max(originalLen * 10, SIZE_GUARD_FLOOR);
  if (newLen > limit) {
    return {
      ok: false,
      error:
        `refused: write to '${path}' would grow from ${originalLen} to ${newLen} bytes ` +
        `(limit ${limit}). Pass --allow-large to override if intentional.`,
      exitCode: 1,
    };
  }
  return null;
}

export const filesCommands: PluginCommand[] = [
  {
    name: "files-read",
    description:
      "Read file contents under the project cwd. A PNG/JPEG/GIF/WebP image (up to 20MB) is shown to you as a picture. Args: <path> [--json]",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      try {
        const argv = parseArgv(ctx.args, ["--path"], BOOL_FLAGS);
        const pathArg = argv.values.get("--path") ?? argv.positional[0];
        if (!pathArg) {
          return { ok: false, error: "missing path", exitCode: 1 };
        }
        const abs = resolveProjectPath(ctx.cwd, pathArg);
        // ROLES-CHAT-8: community sessions cannot read secret-looking paths.
        if (
          (await secretPathsRefused()) &&
          (isSecretPath(pathArg) || isSecretPath(abs))
        ) {
          return { ok: false, error: secretRefuseMessage(pathArg), exitCode: 2 };
        }
        assertExistingFile(abs);
        // DISCORD-9 (REQ-plugins-427): an image goes to the model as pixels
        // (result.image, never serialized), not as a lossy UTF-8 decode.
        const img = sniffImageFile(abs);
        if (img) return readImage(pathArg, abs, img.mediaType, img.size);
        const content = readFileSync(abs, "utf8");
        const data = { path: pathArg, bytes: Buffer.byteLength(content), content };
        if (ctx.json || argv.flags.has("--json")) {
          return { ok: true, data, message: content };
        }
        return { ok: true, data, message: content };
      } catch (err) {
        return errResult(err);
      }
    },
  },
  {
    name: "files-write",
    description:
      "Write content to a file (overwrite). minTier=code. Args: <path> <content|--content ...> [--allow-large] [--allow-empty]. Content may start with '--'. Emptying a non-empty file needs --allow-empty. SAFE-2 protected paths refused. Mutating (ROLES-CHAT-5).",
    dangerous: false,
    mutating: true,
    minTier: 2,
    async handler(ctx) {
      try {
        const argv = parseArgv(ctx.args, ["--content", "--path"], BOOL_FLAGS);
        const flaggedPath = argv.values.get("--path");
        const pathArg = flaggedPath ?? argv.positional[0];
        if (!pathArg) {
          return { ok: false, error: "missing path", exitCode: 1 };
        }
        // Content: --content, else the positionals after the path, joined.
        const content =
          argv.values.get("--content") ??
          argv.positional.slice(flaggedPath != null ? 0 : 1).join(" ");

        const abs = resolveProjectPath(ctx.cwd, pathArg);
        const blocked = refuseProtected(pathArg, abs, ctx.cwd);
        if (blocked) return blocked;
        const secret = await refuseSecretForRole(pathArg, abs, ctx.cwd);
        if (secret) return secret;

        const allowLarge = argv.flags.has("--allow-large");
        if (existsSync(abs)) {
          const originalLen = statSync(abs).size;
          if (
            originalLen > 0 &&
            content.length === 0 &&
            !argv.flags.has("--allow-empty")
          ) {
            return {
              ok: false,
              error:
                `refused: write to '${pathArg}' would empty it (${originalLen} bytes to 0; ` +
                `content is empty or missing). Pass --allow-empty to override if intentional.`,
              exitCode: 1,
            };
          }
          const boom = checkSizeExplosion(
            pathArg,
            originalLen,
            Buffer.byteLength(content),
            allowLarge,
          );
          if (boom) return boom;
        }

        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, content, "utf8");
        return {
          ok: true,
          data: { path: pathArg, bytes: Buffer.byteLength(content), filesChanged: [pathArg] },
          message: `Wrote ${Buffer.byteLength(content)} bytes to ${pathArg}`,
        };
      } catch (err) {
        return errResult(err);
      }
    },
  },
  {
    name: "files-edit",
    description:
      "Exact string replace in a file. minTier=code. Args: <path> --old <str> --new <str> [--replace-all] [--allow-large]. SAFE-2 protected paths refused. Mutating (ROLES-CHAT-5).",
    dangerous: false,
    mutating: true,
    minTier: 2,
    async handler(ctx) {
      try {
        const argv = parseArgv(
          ctx.args,
          ["--old", "--new", "--path", "--content"],
          BOOL_FLAGS,
        );
        const pathArg = argv.values.get("--path") ?? argv.positional[0];
        const oldStr = argv.values.get("--old");
        const newStr = argv.values.get("--new");
        if (!pathArg || oldStr == null || newStr == null) {
          return {
            ok: false,
            error: "usage: files-edit <path> --old <str> --new <str> [--replace-all]",
            exitCode: 1,
          };
        }
        const abs = resolveProjectPath(ctx.cwd, pathArg);
        const blocked = refuseProtected(pathArg, abs, ctx.cwd);
        if (blocked) return blocked;
        const secret = await refuseSecretForRole(pathArg, abs, ctx.cwd);
        if (secret) return secret;
        assertExistingFile(abs);

        const original = readFileSync(abs, "utf8");
        const replaceAll = argv.flags.has("--replace-all");
        if (!original.includes(oldStr)) {
          return {
            ok: false,
            error: `no match for old string in ${pathArg}`,
            exitCode: 1,
          };
        }
        if (!replaceAll) {
          const first = original.indexOf(oldStr);
          const second = original.indexOf(oldStr, first + oldStr.length);
          if (second !== -1) {
            return {
              ok: false,
              error:
                `ambiguous match in ${pathArg}: old string appears more than once; ` +
                `pass --replace-all or use a more specific --old`,
              exitCode: 1,
            };
          }
        }
        // Function replacer: --new is literal data, so `$$`, `$&`, `$'`, `` $` ``
        // are never expanded as String.replace patterns (matches --replace-all).
        const next = replaceAll
          ? original.split(oldStr).join(newStr)
          : original.replace(oldStr, () => newStr);

        const allowLarge = argv.flags.has("--allow-large");
        const boom = checkSizeExplosion(
          pathArg,
          Buffer.byteLength(original),
          Buffer.byteLength(next),
          allowLarge,
        );
        if (boom) return boom;

        writeFileSync(abs, next, "utf8");
        return {
          ok: true,
          data: { path: pathArg, filesChanged: [pathArg] },
          message: `Edited ${pathArg}`,
        };
      } catch (err) {
        return errResult(err);
      }
    },
  },
  {
    name: "files-glob",
    description: "List files matching a glob under the project cwd. Args: <pattern>",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      try {
        const argv = parseArgv(ctx.args, ["--pattern"], BOOL_FLAGS);
        const pattern = argv.values.get("--pattern") ?? argv.positional[0];
        if (!pattern) {
          return { ok: false, error: "missing glob pattern", exitCode: 1 };
        }
        // Refuse patterns that clearly escape
        if (pattern.includes("..")) {
          return {
            ok: false,
            error: `Path traversal denied: glob pattern "${pattern}"`,
            exitCode: 1,
          };
        }
        const glob = new Glob(pattern);
        const matches: string[] = [];
        // ROLES-CHAT-8: non-ADMIN role sessions do not see secret paths.
        const hideSecrets = await secretPathsRefused();
        const root = realRoot(ctx.cwd);
        for await (const m of glob.scan({ cwd: ctx.cwd, onlyFiles: true, dot: true })) {
          if (hideSecrets && isSecretPath(m)) continue;
          try {
            const abs = resolveProjectPath(ctx.cwd, m);
            // A pattern naming a symlinked dir (`notes/*`, notes -> .ssh)
            // walks into it; judge the resolved path too.
            if (hideSecrets && isSecretPath(relative(root, abs))) continue;
            matches.push(m);
          } catch {
            // skip escapes
          }
        }
        matches.sort();
        const message =
          `${matches.length} match(es)\n` +
          (matches.length ? matches.join("\n") + "\n" : "(no matches)\n");
        return {
          ok: true,
          data: { count: matches.length, matches },
          message,
        };
      } catch (err) {
        return errResult(err);
      }
    },
  },
  {
    name: "files-list",
    description:
      "List directory entries under the project cwd. Args: <path> [--show-hidden] [--json]",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      try {
        const argv = parseArgv(ctx.args, ["--path"], BOOL_FLAGS);
        const pathArg = argv.values.get("--path") ?? argv.positional[0] ?? ".";
        const abs = resolveProjectPath(ctx.cwd, pathArg);
        // ROLES-CHAT-8: non-ADMIN role sessions cannot list a secret dir
        // (.ssh, keystores; also through a symlink) nor see secret entries.
        const hideSecrets = await secretPathsRefused();
        if (
          hideSecrets &&
          (isSecretPath(pathArg) || isSecretPath(relative(realRoot(ctx.cwd), abs)))
        ) {
          return { ok: false, error: secretRefuseMessage(pathArg), exitCode: 2 };
        }
        if (!existsSync(abs) || !statSync(abs).isDirectory()) {
          return { ok: false, error: `Not a directory: ${pathArg}`, exitCode: 1 };
        }
        const showHidden = argv.flags.has("--show-hidden");
        const names = readdirSync(abs).filter(
          (n) => (showHidden || !n.startsWith(".")) && !(hideSecrets && isSecretPath(n)),
        );
        const entries = names.map((name) => {
          const full = join(abs, name);
          let type: "file" | "dir" | "symlink" | "other" = "other";
          try {
            const st = statSync(full);
            if (st.isDirectory()) type = "dir";
            else if (st.isSymbolicLink()) type = "symlink";
            else if (st.isFile()) type = "file";
          } catch {
            /* ignore */
          }
          return { name, type };
        });
        entries.sort((a, b) => a.name.localeCompare(b.name));
        const lines = entries.map((e) => {
          const prefix = e.type === "dir" ? "d " : e.type === "symlink" ? "l " : "f ";
          return prefix + e.name;
        });
        const data = { path: pathArg, count: entries.length, entries };
        if (ctx.json || argv.flags.has("--json")) {
          return { ok: true, data, message: JSON.stringify(data, null, 2) };
        }
        return {
          ok: true,
          data,
          message: lines.join("\n") + (lines.length ? "\n" : ""),
        };
      } catch (err) {
        return errResult(err);
      }
    },
  },
  {
    name: "files-delete",
    description:
      "Delete a file (irreversible). dangerous + minTier=code. SAFE-2 protected paths hard-refused. Args: <path>",
    dangerous: true,
    minTier: 2,
    async handler(ctx) {
      try {
        const argv = parseArgv(ctx.args, ["--path"], BOOL_FLAGS);
        const pathArg = argv.values.get("--path") ?? argv.positional[0];
        if (!pathArg) {
          return { ok: false, error: "missing path", exitCode: 1 };
        }
        const abs = resolveProjectPath(ctx.cwd, pathArg);
        const blocked = refuseProtected(pathArg, abs, ctx.cwd);
        if (blocked) return blocked;
        assertExistingFile(abs);
        rmSync(abs);
        return {
          ok: true,
          data: { path: pathArg, filesChanged: [pathArg] },
          message: `Deleted ${pathArg}`,
        };
      } catch (err) {
        return errResult(err);
      }
    },
  },
];

