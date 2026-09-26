import type { PluginCommand, PluginHandlerArgs, PluginHandlerResult } from "../../src/plugins/types.ts";
import { checkRepoGate, extractRepoFromArgs } from "../../src/plugins/githubDeny.ts";
import { createOctokit, splitOwnerRepo, type ApiResult } from "./api.ts";
import { Octokit } from "@octokit/rest";

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

function requireRepo(ctx: PluginHandlerArgs): PluginHandlerResult | { repo: string; owner: string; name: string } {
  const repo = extractRepoFromArgs(ctx.args);
  const gate = checkRepoGate(repo);
  if (!gate.ok) {
    return { ok: false, error: gate.error, exitCode: 3 };
  }
  const parts = splitOwnerRepo(gate.repo);
  if (!parts) {
    return { ok: false, error: `invalid --repo (expected OWNER/REPO): ${gate.repo}`, exitCode: 1 };
  }
  return { repo: gate.repo, owner: parts.owner, name: parts.name };
}

function clientOrErr(): Octokit | PluginHandlerResult {
  const c = createOctokit();
  if (!(c instanceof Octokit) && "ok" in c && c.ok === false) {
    return { ok: false, error: (c as ApiResult).error, exitCode: (c as ApiResult).exitCode };
  }
  return c as Octokit;
}

function summarize(data: unknown): string {
  if (Array.isArray(data)) {
    return `ok (${data.length} item${data.length === 1 ? "" : "s"})`;
  }
  if (data && typeof data === "object") return "ok";
  return String(data);
}

function okResult(ctx: PluginHandlerArgs, data: unknown): PluginHandlerResult {
  return {
    ok: true,
    data,
    message: ctx.json ? undefined : summarize(data),
    exitCode: 0,
  };
}

function fail(e: unknown): PluginHandlerResult {
  const msg = e instanceof Error ? e.message : String(e);
  return { ok: false, error: msg, exitCode: 1 };
}

function argsWithoutRepo(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--repo" || a === "-R") {
      i++;
      continue;
    }
    if (a.startsWith("--repo=")) continue;
    out.push(a);
  }
  return out;
}

/** Read-only GitHub plugins via Octokit (GITHUB-1/4). Write/create omitted. */
export const githubCommands: PluginCommand[] = [
  {
    name: "github-pr-list",
    description: "List pull requests (Octokit pulls.list)",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      const r = requireRepo(ctx);
      if ("ok" in r && r.ok === false) return r;
      const { owner, name } = r as { owner: string; name: string };
      const rest = argsWithoutRepo(ctx.args);
      const { value: limit, rest: rest2 } = takeFlag(rest, "--limit");
      const { value: state, rest: rest3 } = takeFlag(rest2, "--state");
      if (rest3.length) {
        return { ok: false, error: `unexpected args: ${rest3.join(" ")}`, exitCode: 1 };
      }
      const octokit = clientOrErr();
      if (!("rest" in octokit)) return octokit;
      try {
        const per_page = Math.min(Number(limit) || 30, 100);
        const st = (state === "closed" || state === "all" ? state : "open") as "open" | "closed" | "all";
        const res = await octokit.rest.pulls.list({
          owner,
          repo: name,
          state: st,
          per_page,
        });
        const data = res.data.map((p) => ({
          number: p.number,
          title: p.title,
          url: p.html_url,
          state: p.state.toUpperCase(),
          headRefName: p.head.ref,
          updatedAt: p.updated_at,
        }));
        return okResult(ctx, data);
      } catch (e) {
        return fail(e);
      }
    },
  },
  {
    name: "github-pr-status",
    description: "Show PR status (Octokit pulls.get)",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      const r = requireRepo(ctx);
      if ("ok" in r && r.ok === false) return r;
      const { owner, name } = r as { owner: string; name: string };
      const rest = argsWithoutRepo(ctx.args);
      const selector = rest[0];
      if (!selector) {
        return {
          ok: false,
          error: "usage: github-pr-status <number> --repo OWNER/REPO",
          exitCode: 1,
        };
      }
      const pull_number = Number(selector);
      if (!Number.isFinite(pull_number)) {
        return { ok: false, error: "PR selector must be a number when using Octokit", exitCode: 1 };
      }
      const octokit = clientOrErr();
      if (!("rest" in octokit)) return octokit;
      try {
        const res = await octokit.rest.pulls.get({ owner, repo: name, pull_number });
        const p = res.data;
        const data = {
          number: p.number,
          title: p.title,
          url: p.html_url,
          state: p.state.toUpperCase(),
          isDraft: p.draft ?? false,
          mergeable: p.mergeable == null ? "UNKNOWN" : p.mergeable ? "MERGEABLE" : "CONFLICTING",
          headRefName: p.head.ref,
          baseRefName: p.base.ref,
          statusCheckRollup: [] as unknown[],
        };
        return okResult(ctx, data);
      } catch (e) {
        return fail(e);
      }
    },
  },
  {
    name: "github-ci-status",
    description: "Show CI check status for a PR (Octokit checks.listForRef)",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      const r = requireRepo(ctx);
      if ("ok" in r && r.ok === false) return r;
      const { owner, name } = r as { owner: string; name: string };
      const rest = argsWithoutRepo(ctx.args);
      const selector = rest[0];
      if (!selector) {
        return {
          ok: false,
          error: "usage: github-ci-status <number> --repo OWNER/REPO",
          exitCode: 1,
        };
      }
      const pull_number = Number(selector);
      if (!Number.isFinite(pull_number)) {
        return { ok: false, error: "PR selector must be a number when using Octokit", exitCode: 1 };
      }
      const octokit = clientOrErr();
      if (!("rest" in octokit)) return octokit;
      try {
        const pr = await octokit.rest.pulls.get({ owner, repo: name, pull_number });
        const ref = pr.data.head.sha;
        const checks = await octokit.rest.checks.listForRef({
          owner,
          repo: name,
          ref,
          per_page: 100,
        });
        const data = checks.data.check_runs.map((c) => ({
          name: c.name,
          state: (c.conclusion || c.status || "").toUpperCase(),
          bucket: c.conclusion === "success" ? "pass" : c.conclusion ? "fail" : "pending",
          link: c.html_url,
        }));
        return okResult(ctx, data);
      } catch (e) {
        return fail(e);
      }
    },
  },
  {
    name: "github-issue-list",
    description: "List issues (Octokit issues.listForRepo)",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      const r = requireRepo(ctx);
      if ("ok" in r && r.ok === false) return r;
      const { owner, name } = r as { owner: string; name: string };
      const rest = argsWithoutRepo(ctx.args);
      const { value: limit, rest: rest2 } = takeFlag(rest, "--limit");
      const { value: state, rest: rest3 } = takeFlag(rest2, "--state");
      if (rest3.length) {
        return { ok: false, error: `unexpected args: ${rest3.join(" ")}`, exitCode: 1 };
      }
      const octokit = clientOrErr();
      if (!("rest" in octokit)) return octokit;
      try {
        const per_page = Math.min(Number(limit) || 30, 100);
        const st = (state === "closed" || state === "all" ? state : "open") as "open" | "closed" | "all";
        const res = await octokit.rest.issues.listForRepo({
          owner,
          repo: name,
          state: st,
          per_page,
        });
        // Exclude PRs (issues API returns both)
        const data = res.data
          .filter((i) => !i.pull_request)
          .map((i) => ({
            number: i.number,
            title: i.title,
            url: i.html_url,
            state: i.state.toUpperCase(),
            updatedAt: i.updated_at,
            labels: (i.labels || []).map((l) =>
              typeof l === "string"
                ? { name: l }
                : { name: l.name, id: String(l.id ?? ""), description: l.description ?? "", color: l.color ?? "" },
            ),
          }));
        return okResult(ctx, data);
      } catch (e) {
        return fail(e);
      }
    },
  },
];
