import type { PluginCommand, PluginHandlerArgs, PluginHandlerResult } from "../../src/plugins/types.ts";
import { checkRepoGate, extractRepoFromArgs } from "../../src/plugins/githubDeny.ts";
import { ghJson, parseJsonStdout } from "./gh.ts";

function takeFlag(args: string[], name: string): { value: string | undefined; rest: string[] } {
  const out: string[] = [];
  let value: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === name || a.startsWith(`${name}=`)) {
      if (a.includes("=")) {
        value = a.slice(name.length + 1);
      } else {
        value = args[++i];
      }
      continue;
    }
    out.push(a);
  }
  return { value, rest: out };
}

function repoArgs(args: string[]): { ghArgs: string[]; rest: string[] } {
  const { value, rest } = takeFlag(args, "--repo");
  const ghArgs = value ? ["--repo", value] : [];
  return { ghArgs, rest };
}


async function requireRepoGate(ctx: PluginHandlerArgs): Promise<PluginHandlerResult | null> {
  const repo = extractRepoFromArgs(ctx.args);
  const gate = checkRepoGate(repo);
  if (!gate.ok) {
    return { ok: false, error: gate.error, exitCode: 3 };
  }
  return null;
}

async function wrapGh(
  ctx: PluginHandlerArgs,
  ghArgs: string[],
): Promise<PluginHandlerResult> {
  const result = await ghJson(ghArgs, { cwd: ctx.cwd });
  if (!result.ok) {
    return {
      ok: false,
      error: result.stderr || `gh exited ${result.exitCode}`,
      exitCode: result.exitCode || 1,
      data: { stderr: result.stderr, stdout: result.stdout },
    };
  }
  let data: unknown;
  try {
    data = parseJsonStdout(result.stdout);
  } catch (e) {
    return {
      ok: false,
      error: `failed to parse gh JSON: ${e instanceof Error ? e.message : String(e)}`,
      exitCode: 1,
      data: { raw: result.stdout },
    };
  }
  return {
    ok: true,
    data,
    message: ctx.json ? undefined : summarize(data),
    exitCode: 0,
  };
}

function summarize(data: unknown): string {
  if (Array.isArray(data)) {
    return `ok (${data.length} item${data.length === 1 ? "" : "s"})`;
  }
  if (data && typeof data === "object") {
    return "ok";
  }
  return String(data);
}

/** Read-only GitHub plugins (GITHUB-1/4). Write/create intentionally omitted. */
export const githubCommands: PluginCommand[] = [
  {
    name: "github-pr-list",
    description: "List pull requests (gh pr list --json)",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      const denied = await requireRepoGate(ctx);
      if (denied) return denied;
      const { ghArgs, rest } = repoArgs(ctx.args);
      const { value: limit, rest: rest2 } = takeFlag(rest, "--limit");
      const { value: state, rest: rest3 } = takeFlag(rest2, "--state");
      const args = [
        "pr",
        "list",
        ...ghArgs,
        "--json",
        "number,title,url,state,headRefName,updatedAt",
      ];
      if (limit) args.push("--limit", limit);
      if (state) args.push("--state", state);
      if (rest3.length) {
        return { ok: false, error: `unexpected args: ${rest3.join(" ")}`, exitCode: 1 };
      }
      return wrapGh(ctx, args);
    },
  },
  {
    name: "github-pr-status",
    description: "Show PR status (gh pr view --json)",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      const denied = await requireRepoGate(ctx);
      if (denied) return denied;
      const { ghArgs, rest } = repoArgs(ctx.args);
      const selector = rest[0];
      if (!selector) {
        return {
          ok: false,
          error: "usage: github-pr-status <number|url|branch> [--repo OWNER/REPO]",
          exitCode: 1,
        };
      }
      return wrapGh(ctx, [
        "pr",
        "view",
        selector,
        ...ghArgs,
        "--json",
        "number,title,url,state,isDraft,mergeable,statusCheckRollup,headRefName,baseRefName",
      ]);
    },
  },
  {
    name: "github-ci-status",
    description: "Show CI check status for a PR or ref (gh pr checks --json)",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      const denied = await requireRepoGate(ctx);
      if (denied) return denied;
      const { ghArgs, rest } = repoArgs(ctx.args);
      const selector = rest[0];
      if (!selector) {
        return {
          ok: false,
          error: "usage: github-ci-status <number|url|branch> [--repo OWNER/REPO]",
          exitCode: 1,
        };
      }
      // gh pr checks supports --json on recent gh; fall back message if missing.
      return wrapGh(ctx, ["pr", "checks", selector, ...ghArgs, "--json", "name,state,bucket,link"]);
    },
  },
  {
    name: "github-issue-list",
    description: "List issues (gh issue list --json)",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      const denied = await requireRepoGate(ctx);
      if (denied) return denied;
      const { ghArgs, rest } = repoArgs(ctx.args);
      const { value: limit, rest: rest2 } = takeFlag(rest, "--limit");
      const { value: state, rest: rest3 } = takeFlag(rest2, "--state");
      const args = [
        "issue",
        "list",
        ...ghArgs,
        "--json",
        "number,title,url,state,updatedAt,labels",
      ];
      if (limit) args.push("--limit", limit);
      if (state) args.push("--state", state);
      if (rest3.length) {
        return { ok: false, error: `unexpected args: ${rest3.join(" ")}`, exitCode: 1 };
      }
      return wrapGh(ctx, args);
    },
  },
];
