/**
 * AUTONOMY-9/9.a — which shell commands touch prod or deploys (#97).
 *
 * Read over the same ground as the SAFE-3 clamp and the SAFE-21 foot-guns
 * (one walker, {@link forEachSimpleCommand}: dash and bash readings, `eval` /
 * `trap` / `-c` strings, command substitutions, and the in-root scripts a
 * command runs in a shell), with every command an exec wrapper runs
 * ({@link commandChain}: `sudo`, `env`, `xargs`, `timeout`, `find -exec` …):
 *
 * - a table command (src/plugins/must-ask.ts `prodCommandWhy`): other hosts
 *   (ssh family, remote rsync), root and the box's services, packages,
 *   containers, firewall and cron, secrets tools, cloud and hosting CLIs,
 *   clusters and infrastructure tools, DNS tools, `gh` on secrets,
 *   variables, workflows and releases, and `git push` from the shell;
 * - `npx` / `bunx` / `pnpm dlx` / `yarn dlx` / `npm exec`: the package command
 *   they run, read the same way;
 * - `npm` / `bun` / `yarn` / `pnpm` `run <script>` (and `npm test|start|stop|
 *   restart`): the script's text (with its pre/post scripts) from the
 *   project's package.json; `make` and `just`: the recipe's text (and its
 *   prerequisites). A script or recipe that can't be read asks;
 * - inline interpreter code (`node -e`, `python -c`, `perl -e`, `ruby -e`,
 *   `php -r`, `bun -e`, `deno eval`) and an in-root script an interpreter is
 *   handed: table words in the text;
 * - a command named by an expansion (`$CMD …`) can't be checked, so it asks.
 *
 * Updating itself to a tagged release is not a deploy (AUTONOMY-9): exactly
 * `CORVIDINHO_REF=v<X.Y.Z> <installed checkout>/scripts/corvidinho-update.sh`
 * (or `bash <that script>`), with no other assignment, argument,
 * redirection or command, and a tag that exists in the installed checkout,
 * runs with no ask. The worktree's own copy of the script is not the
 * installed one.
 *
 * A command the SAFE-21 foot-guns, the SAFE-3 clamp or the AGENT-18.a
 * lifecycle check refuse is not classified: `shell-exec` refuses it before
 * anything runs.
 */

import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { gitSubcommand, prodCommandWhy, prodTextWhy } from "../../src/plugins/must-ask.ts";
import {
  commandChain,
  firstDisallowedCd,
  forEachSimpleCommand,
  type SimpleCommand,
  type Word,
} from "./clamp.ts";
import { scrubSecrets } from "../../src/store/scrub.ts";
import { firstFootgun } from "./footguns.ts";
import { firstLifecycleStep } from "./sdd-lifecycle.ts";

/** Most bytes of a script, package.json, Makefile or justfile read. */
const MAX_READ_BYTES = 1 << 20;
/** How deep scripts and recipes that run other scripts or recipes are followed. */
const MAX_DEPTH = 4;

/** The Corvidinho checkout this process runs from (the installed checkout). */
export const INSTALL_ROOT = resolve(import.meta.dir, "../..");

export const SELF_UPDATE_SCRIPT = "scripts/corvidinho-update.sh";

export type ShellProdOptions = {
  env?: NodeJS.ProcessEnv;
  /** The installed Corvidinho checkout (tests). */
  installRoot?: string;
};

const INTERPRETER_CODE: Record<string, readonly string[]> = {
  node: ["-e", "--eval", "-p", "--print"],
  nodejs: ["-e", "--eval", "-p", "--print"],
  bun: ["-e", "--eval", "-p", "--print"],
  python: ["-c"],
  python2: ["-c"],
  python3: ["-c"],
  pypy: ["-c"],
  pypy3: ["-c"],
  perl: ["-e", "-E"],
  ruby: ["-e"],
  php: ["-r"],
  lua: ["-e"],
};

const SCRIPT_RUNNERS = new Set([
  "node", "nodejs", "python", "python2", "python3", "pypy", "pypy3", "perl", "ruby", "php", "lua",
  "deno", "tsx", "ts-node",
]);

const PACKAGE_MANAGERS = new Set(["npm", "bun", "yarn", "pnpm"]);
const NPM_LIFECYCLE = new Set(["test", "start", "stop", "restart"]);

function baseName(v: string): string {
  return v.slice(v.lastIndexOf("/") + 1);
}

function readSmall(path: string): string | null {
  try {
    const st = statSync(path);
    if (!st.isFile() || st.size > MAX_READ_BYTES) return null;
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** `path` (relative to `root`) when it stays inside `root`, else null. */
function inRoot(root: string, path: string): string | null {
  const abs = resolve(root, path);
  let real: string;
  try {
    real = realpathSync(abs);
  } catch {
    return null;
  }
  let realRoot: string;
  try {
    realRoot = realpathSync(root);
  } catch {
    return null;
  }
  const rel = relative(realRoot, real);
  return rel === "" || rel.startsWith("..") || isAbsolute(rel) ? null : real;
}

type Ctx = { root: string; env: NodeJS.ProcessEnv; depth: number };

/** package.json scripts of the project at `root`, or null when unreadable. */
function packageScripts(root: string): Record<string, string> | null {
  const text = readSmall(join(root, "package.json"));
  if (text == null) return null;
  try {
    const raw = JSON.parse(text) as { scripts?: unknown };
    if (!raw.scripts || typeof raw.scripts !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.scripts as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}

/** Why a package script (and its pre/post scripts) touches prod; `unresolved` when it can't be read. */
function packageScriptWhy(name: string, ctx: Ctx, how: string): string | null {
  const scripts = packageScripts(ctx.root);
  const body = scripts?.[name];
  if (body === undefined) {
    return `can't read what \`${how}\` runs (no \`${name}\` script in package.json), so it asks`;
  }
  for (const s of [`pre${name}`, name, `post${name}`]) {
    const text = scripts![s];
    if (text === undefined) continue;
    const why = shellTextWhy(text, { ...ctx, depth: ctx.depth + 1 });
    if (why) return `\`${how}\` runs the \`${s}\` script, which ${why}`;
  }
  return null;
}

/** The first positional argument after the options of a make/just call. */
function positionals(args: readonly string[]): string[] {
  return args.filter((a) => !a.startsWith("-"));
}

/**
 * Package-manager options that pick another package.json or workspace, or
 * run other code or another shell, so the script that runs can't be read
 * here: a call with one asks.
 */
const PM_OPAQUE_OPTS = new Set([
  "--cwd", "--prefix", "-C", "--dir", "--filter", "-F", "--workspace", "-w", "--workspaces", "-ws",
  "--recursive", "-r", "--preload", "--require", "--import", "--script-shell", "--shell", "--node-options",
]);

/** Package-manager options that take the next word as their value (not the subcommand). */
const PM_VALUE_OPTS = new Set([
  "--loglevel", "--registry", "--userconfig", "--cache", "--tag", "--otp", "--env-file", "--config", "-c",
  "--elide-lines", "--network-concurrency", "--reporter",
]);

/** A package-manager call's positional words (option values skipped) and an opaque option, if any. */
function pmWords(args: readonly string[]): { pos: { word: string; at: number }[]; opaque: string | null } {
  const pos: { word: string; at: number }[] = [];
  let opaque: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--") break;
    if (a.startsWith("-")) {
      const opt = a.split("=")[0]!;
      if (PM_OPAQUE_OPTS.has(opt)) opaque ??= opt;
      else if (PM_VALUE_OPTS.has(opt) && !a.includes("=")) i++;
      continue;
    }
    pos.push({ word: a, at: i });
  }
  return { pos, opaque };
}

/** Install verbs: they run the project's own install lifecycle scripts. */
const PM_INSTALL = new Set(["install", "i", "ci", "add", "a"]);
const INSTALL_LIFECYCLE = ["preinstall", "install", "postinstall", "preprepare", "prepare", "postprepare"];

/** bun's own subcommands; any other first word runs a package.json script or a file. */
const BUN_BUILTINS = new Set([
  "run", "test", "x", "repl", "exec", "install", "i", "add", "a", "remove", "rm", "update", "audit",
  "dedupe", "prune", "outdated", "link", "unlink", "publish", "patch", "patch-commit", "pm", "info",
  "why", "build", "init", "create", "c", "upgrade", "help", "completions", "discord",
]);

function packageManagerWhy(name: string, args: readonly string[], ctx: Ctx): string | null {
  const { pos, opaque } = pmWords(args);
  if (opaque) return `can't read which package.json or code \`${name} ${opaque}\` runs, so it asks`;
  const sub = pos[0]?.word;
  const after = (i: number) => args.slice(pos[i]!.at + 1);
  if (sub === undefined) {
    // A bare `yarn` installs.
    return name === "yarn" ? installScriptsWhy(name, ctx) : null;
  }
  // `npx`-style runs of a package command.
  if ((name === "pnpm" || name === "yarn") && (sub === "dlx" || sub === "exec")) {
    return packageCommandWhy(after(0), ctx);
  }
  if ((name === "npm" && (sub === "exec" || sub === "x")) || (name === "bun" && sub === "x")) {
    return packageCommandWhy(after(0).filter((a) => a !== "--"), ctx);
  }
  if (name === "bun" && sub === "exec") {
    // `bun exec "<script>"` runs shell text.
    const text = pos[1]?.word;
    return text === undefined ? null : shellTextWhy(text, { ...ctx, depth: ctx.depth + 1 });
  }
  if (PM_INSTALL.has(sub)) return installScriptsWhy(name, ctx);
  if (sub === "run" || sub === "run-script") {
    const script = pos[1]?.word;
    if (script === undefined) return null;
    if (name === "bun" && !(packageScripts(ctx.root) ?? {})[script]) {
      // `bun run <file>`: the file, read like an interpreter's script.
      return scriptFileWhy(script, ctx);
    }
    return packageScriptWhy(script, ctx, `${name} ${sub} ${script}`);
  }
  if (name === "npm" && NPM_LIFECYCLE.has(sub)) return packageScriptWhy(sub, ctx, `npm ${sub}`);
  if ((name === "yarn" || name === "pnpm") && (packageScripts(ctx.root) ?? {})[sub] !== undefined) {
    return packageScriptWhy(sub, ctx, `${name} ${sub}`);
  }
  if (name === "bun" && !BUN_BUILTINS.has(sub)) {
    // `bun <script>` runs a package.json script, else `bun <file>` runs the file.
    if ((packageScripts(ctx.root) ?? {})[sub] !== undefined) return packageScriptWhy(sub, ctx, `bun ${sub}`);
    return scriptFileWhy(sub, ctx);
  }
  return null;
}

/** An install runs the project's install lifecycle scripts: read them. */
function installScriptsWhy(name: string, ctx: Ctx): string | null {
  const scripts = packageScripts(ctx.root) ?? {};
  for (const s of INSTALL_LIFECYCLE) {
    const text = scripts[s];
    if (text === undefined) continue;
    const why = shellTextWhy(text, { ...ctx, depth: ctx.depth + 1 });
    if (why) return `\`${name} install\` runs the \`${s}\` script, which ${why}`;
  }
  return null;
}

/** `npx vercel deploy` → the command `vercel deploy`; `npx -c '<shell>'` → that shell text. */
function packageCommandWhy(args: readonly string[], ctx: Ctx): string | null {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    const call =
      a === "-c" || a === "--call" || a === "--shell-mode"
        ? args[i + 1]
        : a.startsWith("--call=")
          ? a.slice("--call=".length)
          : undefined;
    if (call !== undefined) return shellTextWhy(call, { ...ctx, depth: ctx.depth + 1 });
  }
  const at = args.findIndex((a) => !a.startsWith("-"));
  if (at < 0) return null;
  const pkg = args[at]!.replace(/@[^/@]*$/, "");
  const bin = baseName(pkg);
  return commandWhy(bin, args.slice(at + 1), ctx);
}

/** An in-root script an interpreter is handed: table words in its text. */
function scriptFileWhy(path: string, ctx: Ctx): string | null {
  const real = inRoot(ctx.root, path);
  if (!real) return null;
  const text = readSmall(real);
  if (text == null) return null;
  const why = prodTextWhy(text);
  return why ? `runs \`${path}\`, which ${why}` : null;
}

function interpreterWhy(name: string, args: readonly string[], ctx: Ctx): string | null {
  const codeFlags = INTERPRETER_CODE[name] ?? [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    for (const f of codeFlags) {
      const code = a === f ? args[i + 1] : a.startsWith(`${f}=`) ? a.slice(f.length + 1) : undefined;
      if (code !== undefined) {
        const why = prodTextWhy(code);
        if (why) return `\`${name} ${f}\` code ${why}`;
      }
    }
  }
  if (name === "deno") {
    const pos = positionals(args);
    if (pos[0] === "eval" && pos[1] !== undefined) {
      const why = prodTextWhy(pos[1]);
      if (why) return `\`deno eval\` code ${why}`;
    }
    if (pos[0] === "run" && pos[1] !== undefined) return scriptFileWhy(pos[1], ctx);
    return null;
  }
  if (!SCRIPT_RUNNERS.has(name)) return null;
  if (args.some((a) => codeFlags.includes(a) || a === "-m")) return null;
  const file = positionals(args)[0];
  return file === undefined ? null : scriptFileWhy(file, ctx);
}

// ------------------------------------------------------------ make / just

type Recipe = { body: string[]; deps: string[] };

/** Rules of a Makefile: target → recipe lines and prerequisites; plus its variable lines. */
function parseMakefile(text: string): { rules: Map<string, Recipe>; first: string | null; vars: string[] } {
  const rules = new Map<string, Recipe>();
  const vars: string[] = [];
  let first: string | null = null;
  let current: Recipe[] = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("\t")) {
      for (const r of current) r.body.push(line.slice(1));
      continue;
    }
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const rule = /^([^:=#]+?)\s*::?(?!=)\s*([^=;#]*?)(?:;(.*))?\s*$/.exec(line);
    if (rule && !/^\s*(export|override|define|include|-include|ifeq|ifneq|ifdef|ifndef|else|endif)\b/.test(line)) {
      current = [];
      const deps = rule[2]!.split(/\s+/).filter(Boolean);
      for (const t of rule[1]!.split(/\s+/).filter(Boolean)) {
        const r = rules.get(t) ?? { body: [], deps: [] };
        r.deps.push(...deps);
        if (rule[3]) r.body.push(rule[3]);
        rules.set(t, r);
        current.push(r);
        if (first === null && !t.startsWith(".")) first = t;
      }
      continue;
    }
    current = [];
    vars.push(line);
  }
  return { rules, first, vars };
}

/** Recipes of a justfile: name → body lines and dependencies. */
function parseJustfile(text: string): { rules: Map<string, Recipe>; first: string | null; vars: string[] } {
  const rules = new Map<string, Recipe>();
  const vars: string[] = [];
  let first: string | null = null;
  let current: Recipe | null = null;
  for (const line of text.split("\n")) {
    if (/^[ \t]+\S/.test(line)) {
      current?.body.push(line.trim());
      continue;
    }
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const head = /^@?([A-Za-z_][A-Za-z0-9_-]*)([^:]*):(?!=)(.*)$/.exec(trimmed);
    if (head) {
      const deps = head[3]!.split(/\s+/).filter(Boolean).map((d) => d.replace(/^\(|\)$/g, ""));
      current = { body: [], deps };
      rules.set(head[1]!, current);
      if (first === null) first = head[1]!;
      continue;
    }
    current = null;
    vars.push(trimmed);
  }
  return { rules, first, vars };
}

/** Variable assignments of a Makefile or justfile (name → raw value). */
function recipeVars(tool: "make" | "just", lines: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  const re =
    tool === "make"
      ? /^\s*(?:export\s+|override\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*(?:::?=|:::=|\?=|\+=|=)\s*(.*)$/
      : /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_-]*)\s*:=\s*(.*)$/;
  for (const line of lines) {
    const m = re.exec(line);
    if (!m) continue;
    let v = m[2]!.trim();
    if (tool === "just") v = v.replace(/^(['"])(.*)\1$/, "$2");
    out.set(m[1]!, out.has(m[1]!) ? `${out.get(m[1]!)} ${v}` : v);
  }
  return out;
}

/**
 * A recipe's text with its tool's variables put in, so the shell reading
 * sees the commands they hold: make `$(NAME)` / `${NAME}` (`$(MAKE)` is
 * make, automatic variables a plain word, `$$` a shell `$`) and just
 * `{{name}}`. An unknown variable or function is dropped.
 */
function substituteRecipe(tool: "make" | "just", body: string, vars: Map<string, string>): string {
  let text = body;
  if (tool === "make") {
    text = text.replace(/\$\$/g, "\u0000");
    for (let i = 0; i < 4 && /\$[({]/.test(text); i++) {
      text = text.replace(/\$[({]([A-Za-z_][A-Za-z0-9_.-]*)[)}]/g, (_m, n: string) =>
        vars.get(n) ?? (n === "MAKE" ? "make" : ""),
      );
    }
    text = text.replace(/\$[({][^)}]*[)}]/g, "").replace(/\$[@<^?*+|]/g, "target");
    return text.replace(/\u0000/g, "$");
  }
  for (let i = 0; i < 4 && text.includes("{{"); i++) {
    text = text.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_-]*)\s*\}\}/g, (_m, n: string) => vars.get(n) ?? "");
  }
  return text.replace(/\{\{[^}]*\}\}/g, "x");
}

function recipeWhy(
  tool: "make" | "just",
  args: readonly string[],
  ctx: Ctx,
): string | null {
  // Options that change which file or dir is read can't be followed: ask.
  const opaque = args.find((a) =>
    tool === "make"
      ? /^(-[A-Za-z]*[Cf]|--directory|--file|--makefile)/.test(a)
      : /^(--justfile|--working-directory|-f|-d)/.test(a),
  );
  if (opaque) return `can't read which recipe \`${tool} ${opaque}\` runs, so it asks`;
  const files = tool === "make" ? ["GNUmakefile", "makefile", "Makefile"] : ["justfile", "Justfile", ".justfile"];
  let text: string | null = null;
  for (const f of files) {
    text = readSmall(join(ctx.root, f));
    if (text != null) break;
  }
  if (text == null) return `can't read the ${tool === "make" ? "Makefile" : "justfile"} \`${tool}\` runs, so it asks`;
  const parsed = tool === "make" ? parseMakefile(text) : parseJustfile(text);
  const vars = recipeVars(tool, parsed.vars);
  const targets = positionals(args).filter((a) => !a.includes("="));
  const wanted = targets.length > 0 ? targets : parsed.first ? [parsed.first] : [];
  const seen = new Set<string>();
  const queue = wanted.map((t) => ({ t, d: 0 }));
  while (queue.length > 0) {
    const { t, d } = queue.shift()!;
    if (seen.has(t)) continue;
    seen.add(t);
    const r = parsed.rules.get(t);
    if (!r) {
      // A make prerequisite may be a plain file; a named target must exist.
      if (d === 0) return `can't read what \`${tool} ${t}\` runs (no such recipe), so it asks`;
      continue;
    }
    const body = r.body.join("\n");
    const expanded = substituteRecipe(tool, body, vars);
    const why =
      prodTextWhy(body) ??
      prodTextWhy(expanded) ??
      (d < MAX_DEPTH ? shellTextWhy(expanded, { ...ctx, depth: ctx.depth + 1 }) : null);
    if (why) return `\`${tool} ${t}\` ${why}`;
    if (d < MAX_DEPTH) for (const dep of r.deps) queue.push({ t: dep, d: d + 1 });
  }
  return null;
}

// ------------------------------------------------------------ commands

/**
 * A script run by a path outside the project (the walker reads only in-root
 * scripts): the box updater asks unless it is the exempt tagged-release form
 * (checked before the walk); another script's text is read for table words.
 */
function pathScriptWhy(path: string, ctx: Ctx): string | null {
  if (!path.includes("/")) return null;
  if (baseName(path) === baseName(SELF_UPDATE_SCRIPT)) {
    return "runs the box updater (a deploy, unless it is exactly `CORVIDINHO_REF=v<X.Y.Z> <installed checkout>/scripts/corvidinho-update.sh` for an existing tag)";
  }
  if (inRoot(ctx.root, path)) return null;
  const text = readSmall(resolve(ctx.root, path));
  if (text == null || !text.startsWith("#!")) return null;
  const why = prodTextWhy(text);
  return why ? `runs \`${path}\`, which ${why}` : null;
}

/**
 * git's own commands: git never runs an alias with one of these names, so
 * only another word is looked up as an alias.
 */
const GIT_BUILTINS = new Set([
  "add", "am", "apply", "archive", "bisect", "blame", "branch", "bundle", "cat-file", "check-ignore",
  "checkout", "cherry", "cherry-pick", "clean", "clone", "commit", "config", "count-objects", "describe",
  "diff", "diff-files", "diff-index", "diff-tree", "fetch", "for-each-ref", "format-patch", "fsck", "gc",
  "grep", "hash-object", "help", "init", "log", "ls-files", "ls-remote", "ls-tree", "merge", "merge-base",
  "mv", "notes", "pull", "push", "range-diff", "rebase", "reflog", "remote", "reset", "restore", "rev-list",
  "rev-parse", "revert", "rm", "shortlog", "show", "show-ref", "sparse-checkout", "stash", "status",
  "submodule", "switch", "symbolic-ref", "tag", "update-index", "update-ref", "var", "version", "worktree",
]);

/**
 * A git alias the run's git would expand (the repo's own config: shell-exec
 * runs git with no global or system config, SAFE-21.a): its text is read
 * like the command it stands for (`!…` as shell text).
 */
function gitAliasWhy(args: readonly string[], ctx: Ctx): string | null {
  const sub = gitSubcommand(args);
  if (sub === undefined || GIT_BUILTINS.has(sub) || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(sub)) return null;
  let value: string;
  try {
    const r = Bun.spawnSync(["git", "-C", ctx.root, "config", "--get", `alias.${sub}`], {
      stdout: "pipe",
      stderr: "ignore",
      env: {
        PATH: ctx.env.PATH ?? process.env.PATH ?? "/usr/bin:/bin",
        HOME: ctx.env.HOME ?? process.env.HOME ?? "/",
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
      },
    });
    if (r.exitCode !== 0) return null;
    value = r.stdout.toString().trim();
  } catch {
    return null;
  }
  if (!value) return null;
  const deeper = { ...ctx, depth: ctx.depth + 1 };
  const why = value.startsWith("!")
    ? shellTextWhy(value.slice(1), deeper)
    : commandWhy("git", [...value.split(/\s+/).filter(Boolean), ...args.slice(args.indexOf(sub) + 1)], deeper);
  return why ? `\`git ${sub}\` is a git alias for \`${scrubSecrets(value).slice(0, 60)}\`, which ${why}` : null;
}

function commandWhy(name: string, args: readonly string[], ctx: Ctx, path?: string): string | null {
  const byPath = path !== undefined ? pathScriptWhy(path, ctx) : null;
  if (byPath) return byPath;
  const table = prodCommandWhy(name, args);
  if (table) return table;
  if (ctx.depth >= MAX_DEPTH) return null;
  if (name === "git") return gitAliasWhy(args, ctx);
  if (name === "npx" || name === "bunx" || name === "pnpx") return packageCommandWhy(args, ctx);
  if (PACKAGE_MANAGERS.has(name)) {
    const why = packageManagerWhy(name, args, ctx);
    if (why) return why;
  }
  if (name === "make" || name === "gmake") return recipeWhy("make", args, ctx);
  if (name === "just") return recipeWhy("just", args, ctx);
  return interpreterWhy(name, args, ctx);
}

function linkWords(cmd: SimpleCommand, links: readonly { k: number }[], n: number): readonly Word[] {
  const end = links[n + 1]?.k ?? cmd.words.length;
  return cmd.words.slice(links[n]!.k, end);
}

function simpleCommandWhy(cmd: SimpleCommand, ctx: Ctx): string | null {
  if (cmd.start >= cmd.words.length) return null;
  const links = commandChain(cmd.words, cmd.start);
  for (let n = 0; n < links.length; n++) {
    const words = linkWords(cmd, links, n);
    const head = words[0]!;
    if (head.expands) {
      return `runs a command named by an expansion (\`${head.value.slice(0, 40)}\`), which can't be checked, so it asks`;
    }
    const why = commandWhy(baseName(head.value), words.slice(1).map((w) => w.value), ctx, head.value);
    if (why) return why;
  }
  return null;
}

/** Why shell text touches prod or deploys (the first hit), else null. */
function shellTextWhy(text: string, ctx: Ctx): string | null {
  let found: string | null = null;
  forEachSimpleCommand(text, ctx.root, (cmd) => {
    found = simpleCommandWhy(cmd, ctx);
    return found;
  });
  return found;
}

/** A tag the installed checkout has (`refs/tags/<tag>`). */
function installedTag(installRoot: string, tag: string): boolean {
  try {
    const r = Bun.spawnSync(["git", "-C", installRoot, "rev-parse", "-q", "--verify", `refs/tags/${tag}^{commit}`], {
      stdout: "ignore",
      stderr: "ignore",
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "/" },
    });
    return r.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * AUTONOMY-9: updating itself to a tagged release is not a deploy. True only
 * for exactly `CORVIDINHO_REF=v<X.Y.Z> <installed>/scripts/corvidinho-update.sh`
 * (or `bash <that>`), nothing else in the command, and an existing tag.
 */
export function isSelfUpdateToTag(command: string, root: string, opts: ShellProdOptions = {}): boolean {
  const install = opts.installRoot ?? INSTALL_ROOT;
  // The typed command only (the walker also hands over an in-root script's own commands).
  const cmds: SimpleCommand[] = [];
  forEachSimpleCommand(command, root, (c) => {
    if (c.script === null) cmds.push(c);
    return null;
  });
  if (cmds.length !== 1) return false;
  const [c] = cmds as [SimpleCommand];
  if (c.redirs.length > 0 || c.upstream.length > 0) return false;
  const words = c.words;
  if (words.some((w) => w.expands)) return false;
  if (c.start !== 1) return false;
  const ref = /^CORVIDINHO_REF=(v\d+\.\d+\.\d+)$/.exec(words[0]!.value);
  if (!ref) return false;
  const rest = words.slice(1).map((w) => w.value);
  const scriptPath = rest.length === 1 ? rest[0] : rest.length === 2 && rest[0] === "bash" ? rest[1] : undefined;
  if (scriptPath === undefined) return false;
  const want = join(install, SELF_UPDATE_SCRIPT);
  if (!existsSync(want)) return false;
  let real: string;
  let wantReal: string;
  try {
    real = realpathSync(resolve(root, scriptPath));
    wantReal = realpathSync(want);
  } catch {
    return false;
  }
  // Only the installed checkout's script: a talk worktree's own copy (which
  // a run can edit) resolves elsewhere.
  if (real !== wantReal || basename(real) !== basename(SELF_UPDATE_SCRIPT)) return false;
  return installedTag(install, ref[1]!);
}

/**
 * Why `command`, run by `shell-exec` from `root`, touches prod or deploys
 * (AUTONOMY-9/9.a), else null. Null too for a command SAFE-21, the SAFE-3
 * clamp or the AGENT-18.a lifecycle check refuses (the handler refuses it
 * before anything runs) and for the self-update to a tagged release.
 */
export function shellProdWhy(command: string, root: string, opts: ShellProdOptions = {}): string | null {
  const env = opts.env ?? process.env;
  const rootAbs = resolve(root);
  if (firstLifecycleStep(command, rootAbs) != null) return null;
  if (firstFootgun(command, rootAbs, { env }) != null) return null;
  if (firstDisallowedCd(command, rootAbs) != null) return null;
  if (isSelfUpdateToTag(command, rootAbs, opts)) return null;
  return shellTextWhy(command, { root: rootAbs, env, depth: 0 });
}

/**
 * Why a language runner's call (`node-exec`, `python-exec`, `cargo-exec`:
 * `tool` and its argv) touches prod or deploys, else null: table words in
 * its argv (inline code included), then an in-root script it is handed.
 */
export function runnerProdWhy(
  tool: string,
  args: readonly string[],
  root: string,
  opts: ShellProdOptions = {},
): string | null {
  const inArgs = prodTextWhy(args.join("\n"));
  if (inArgs) return `its argv ${inArgs}`;
  return interpreterWhy(tool, args, { root: resolve(root), env: opts.env ?? process.env, depth: 0 });
}

/** Why a command text a Fledge task runs (through a shell) touches prod, else null. */
export function taskCommandProdWhy(command: string, root: string, opts: ShellProdOptions = {}): string | null {
  return shellTextWhy(command, { root: resolve(root), env: opts.env ?? process.env, depth: 0 });
}
