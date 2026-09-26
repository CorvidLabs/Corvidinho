/**
 * Plugin argv parsing for files / search commands (REQ-plugins-243).
 *
 * A value flag takes the next token verbatim, even one that starts with "--"
 * (YAML front matter, SQL comments, a grep pattern such as "--no-verify"), or
 * an inline `--flag=value`. Tokens that are not a known flag stay positional:
 * they are never dropped. A bare `--` ends option parsing.
 */

export class ArgvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgvError";
  }
}

export type ParsedArgv = {
  values: Map<string, string>;
  flags: Set<string>;
  positional: string[];
};

export function parseArgv(
  args: readonly string[],
  valueFlags: readonly string[],
  boolFlags: readonly string[],
): ParsedArgv {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const positional: string[] = [];
  const setValue = (name: string, v: string) => {
    if (!values.has(name)) values.set(name, v);
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--") {
      positional.push(...args.slice(i + 1));
      break;
    }
    if (valueFlags.includes(a)) {
      if (i + 1 >= args.length) throw new ArgvError(`missing value for ${a}`);
      setValue(a, args[++i]!);
      continue;
    }
    const eq = a.startsWith("--") ? a.indexOf("=") : -1;
    if (eq > 2 && valueFlags.includes(a.slice(0, eq))) {
      setValue(a.slice(0, eq), a.slice(eq + 1));
      continue;
    }
    if (boolFlags.includes(a)) {
      flags.add(a);
      continue;
    }
    positional.push(a);
  }
  return { values, flags, positional };
}
