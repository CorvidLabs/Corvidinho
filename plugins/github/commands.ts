import { spawnSync } from "node:child_process";
import { attribution } from "../../src/attribution.ts";
import type { PluginCommand, PluginHandlerArgs, PluginHandlerResult } from "../../src/plugins/types.ts";
import { extractRepoFromArgs } from "../../src/plugins/githubDeny.ts";
import { checkRepoGateForActingRole } from "../../src/plugins/githubPublic.ts";
import { ROLE_REFUSED_MESSAGE, resolveActingRole } from "../../src/plugins/roles.ts";
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

/**
 * `--repo` through the acting role's repo gate (GITHUB-6 / ROLES-CHAT-8);
 * `write` marks a write command: team reviews and comments need an
 * allowlisted repo (IDENTITY-10).
 */
async function requireRepo(
  ctx: PluginHandlerArgs,
  write = false,
): Promise<PluginHandlerResult | { repo: string; owner: string; name: string }> {
  const repo = extractRepoFromArgs(ctx.args);
  const gate = await checkRepoGateForActingRole(repo, { write });
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


function githubDryRun(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CORVIDINHO_GITHUB_DRY_RUN === "1";
}

function takeBody(args: string[]): { value: string | undefined; rest: string[] } {
  const fromFlag = takeFlag(args, "--body");
  if (fromFlag.value !== undefined) return fromFlag;
  const fromM = takeFlag(args, "-m");
  if (fromM.value !== undefined) return fromM;
  return { value: undefined, rest: args };
}

function withAttribution(body: string | undefined): string {
  const base = (body ?? "").trimEnd();
  const foot = attribution("markdown");
  if (!base) return foot;
  if (base.includes("Made with") && base.includes("Corvidinho")) return base;
  return `${base}\n\n---\n${foot}`;
}

function currentGitBranch(cwd: string): string | undefined {
  const r = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd,
    encoding: "utf8",
  });
  if (r.status !== 0) return undefined;
  const b = (r.stdout || "").trim();
  return b && b !== "HEAD" ? b : undefined;
}

/** GitHub plugins via Octokit — reads (GITHUB-1/4) + dangerous writes (GITHUB-2/3/5). */
export const githubCommands: PluginCommand[] = [
  {
    name: "github-pr-list",
    description: "List pull requests (Octokit pulls.list)",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      const r = await requireRepo(ctx);
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
      const r = await requireRepo(ctx);
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
    description:
      "Show CI verdict (green/red/pending/none) plus per-check rows for a PR number or a ref " +
      "(branch, tag or commit SHA), e.g. `12 --repo OWNER/REPO` or `main --repo OWNER/REPO` " +
      "(Octokit checks.listForRef + repos.getCombinedStatusForRef)",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      const r = await requireRepo(ctx);
      if ("ok" in r && r.ok === false) return r;
      const { owner, name } = r as { owner: string; name: string };
      const rest = argsWithoutRepo(ctx.args);
      const usage = "usage: github-ci-status <pr-number|ref> --repo OWNER/REPO";
      const selector = rest[0];
      if (!selector) {
        return { ok: false, error: usage, exitCode: 1 };
      }
      const ci = await import("./ciStatus.ts");
      const parsed = ci.parseCiSelector(selector);
      if (!parsed.ok) {
        return { ok: false, error: `${parsed.error} (${usage})`, exitCode: 1 };
      }
      if (rest.length > 1) {
        return { ok: false, error: `unexpected args: ${rest.slice(1).join(" ")} (${usage})`, exitCode: 1 };
      }
      const octokit = clientOrErr();
      if (!("rest" in octokit)) return octokit;
      try {
        const data = await ci.fetchCiStatus(octokit, { owner, repo: name, target: parsed.target });
        return { ok: true, data, message: ci.ciStatusMessage(data), exitCode: 0 };
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
      const r = await requireRepo(ctx);
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
  {
    name: "github-issue-create",
    description: "Create an issue (Octokit issues.create; dangerous GITHUB-5)",
    dangerous: true,
    minTier: 1,
    async handler(ctx) {
      const r = await requireRepo(ctx, true);
      if ("ok" in r && r.ok === false) return r;
      const { owner, name } = r as { owner: string; name: string };
      const rest = argsWithoutRepo(ctx.args);
      const { value: title, rest: rest2 } = takeFlag(rest, "--title");
      const { value: body, rest: rest3 } = takeBody(rest2);
      if (rest3.length) {
        return { ok: false, error: `unexpected args: ${rest3.join(" ")}`, exitCode: 1 };
      }
      if (!title?.trim()) {
        return {
          ok: false,
          error: "usage: github-issue-create --repo OWNER/REPO --title <text> [--body <text>]",
          exitCode: 1,
        };
      }
      if (githubDryRun()) {
        const data = {
          dryRun: true,
          owner,
          repo: name,
          title: title.trim(),
          body: body ?? "",
        };
        return okResult(ctx, data);
      }
      const octokit = clientOrErr();
      if (!("rest" in octokit)) return octokit;
      try {
        const res = await octokit.rest.issues.create({
          owner,
          repo: name,
          title: title.trim(),
          body: body ?? undefined,
        });
        const data = {
          number: res.data.number,
          title: res.data.title,
          url: res.data.html_url,
          state: res.data.state.toUpperCase(),
        };
        return okResult(ctx, data);
      } catch (e) {
        return fail(e);
      }
    },
  },
  {
    name: "github-issue-comment",
    description: "Comment on an issue or PR (Octokit issues.createComment; dangerous GITHUB-3/5)",
    dangerous: true,
    minTier: 1,
    async handler(ctx) {
      const r = await requireRepo(ctx, true);
      if ("ok" in r && r.ok === false) return r;
      const { owner, name } = r as { owner: string; name: string };
      const rest = argsWithoutRepo(ctx.args);
      const { value: body, rest: rest2 } = takeBody(rest);
      const selector = rest2[0];
      const leftover = rest2.slice(1);
      if (leftover.length) {
        return { ok: false, error: `unexpected args: ${leftover.join(" ")}`, exitCode: 1 };
      }
      const issue_number = Number(selector);
      if (!selector || !Number.isFinite(issue_number) || !body?.trim()) {
        return {
          ok: false,
          error:
            "usage: github-issue-comment <number> --repo OWNER/REPO --body <text>",
          exitCode: 1,
        };
      }
      if (githubDryRun()) {
        return okResult(ctx, {
          dryRun: true,
          owner,
          repo: name,
          issue_number,
          body: body.trim(),
        });
      }
      const octokit = clientOrErr();
      if (!("rest" in octokit)) return octokit;
      try {
        const res = await octokit.rest.issues.createComment({
          owner,
          repo: name,
          issue_number,
          body: body.trim(),
        });
        const data = {
          id: res.data.id,
          url: res.data.html_url,
          issue_number,
        };
        return okResult(ctx, data);
      } catch (e) {
        return fail(e);
      }
    },
  },
  {
    name: "github-pr-create",
    description: "Open a PR from a branch/worktree (Octokit pulls.create; dangerous GITHUB-2/5)",
    dangerous: true,
    minTier: 1,
    async handler(ctx) {
      const r = await requireRepo(ctx, true);
      if ("ok" in r && r.ok === false) return r;
      const { owner, name } = r as { owner: string; name: string };
      const rest = argsWithoutRepo(ctx.args);
      const { value: title, rest: rest2 } = takeFlag(rest, "--title");
      const { value: body, rest: rest3 } = takeBody(rest2);
      const { value: headFlag, rest: rest4 } = takeFlag(rest3, "--head");
      const { value: baseFlag, rest: rest5 } = takeFlag(rest4, "--base");
      const draft = rest5.includes("--draft");
      const rest6 = rest5.filter((a) => a !== "--draft");
      if (rest6.length) {
        return { ok: false, error: `unexpected args: ${rest6.join(" ")}`, exitCode: 1 };
      }
      if (!title?.trim()) {
        return {
          ok: false,
          error:
            "usage: github-pr-create --repo OWNER/REPO --title <text> [--body <text>] [--head <branch>] [--base <branch>] [--draft]",
          exitCode: 1,
        };
      }
      const head = headFlag?.trim() || currentGitBranch(ctx.cwd);
      if (!head) {
        return {
          ok: false,
          error: "missing --head and could not detect current git branch",
          exitCode: 1,
        };
      }
      const base = baseFlag?.trim() || "main";
      const bodyWithAttr = withAttribution(body);
      if (githubDryRun()) {
        return okResult(ctx, {
          dryRun: true,
          owner,
          repo: name,
          title: title.trim(),
          body: bodyWithAttr,
          head,
          base,
          draft,
        });
      }
      const octokit = clientOrErr();
      if (!("rest" in octokit)) return octokit;
      try {
        const res = await octokit.rest.pulls.create({
          owner,
          repo: name,
          title: title.trim(),
          body: bodyWithAttr,
          head,
          base,
          draft,
        });
        const data = {
          number: res.data.number,
          title: res.data.title,
          url: res.data.html_url,
          state: res.data.state.toUpperCase(),
          isDraft: res.data.draft ?? false,
          headRefName: res.data.head.ref,
          baseRefName: res.data.base.ref,
        };
        return okResult(ctx, data);
      } catch (e) {
        return fail(e);
      }
    },
  },
  {
    name: "github-pr-review",
    description: "Submit a PR review comment (Octokit pulls.createReview; dangerous GITHUB-3/5)",
    dangerous: true,
    minTier: 1,
    async handler(ctx) {
      const r = await requireRepo(ctx, true);
      if ("ok" in r && r.ok === false) return r;
      const { owner, name } = r as { owner: string; name: string };
      const rest = argsWithoutRepo(ctx.args);
      const { value: body, rest: rest2 } = takeBody(rest);
      const { value: eventFlag, rest: rest3 } = takeFlag(rest2, "--event");
      const selector = rest3[0];
      const leftover = rest3.slice(1);
      if (leftover.length) {
        return { ok: false, error: `unexpected args: ${leftover.join(" ")}`, exitCode: 1 };
      }
      const pull_number = Number(selector);
      if (!selector || !Number.isFinite(pull_number) || !body?.trim()) {
        return {
          ok: false,
          error:
            "usage: github-pr-review <number> --repo OWNER/REPO --body <text> [--event COMMENT|APPROVE|REQUEST_CHANGES]",
          exitCode: 1,
        };
      }
      const evRaw = (eventFlag || "COMMENT").toUpperCase();
      const event =
        evRaw === "APPROVE" || evRaw === "REQUEST_CHANGES" || evRaw === "COMMENT"
          ? evRaw
          : null;
      if (!event) {
        return {
          ok: false,
          error: `--event must be COMMENT, APPROVE, or REQUEST_CHANGES (got ${eventFlag})`,
          exitCode: 1,
        };
      }
      // IDENTITY-10 (#65): a team member's review is feedback, posted as
      // COMMENT; APPROVE and REQUEST_CHANGES count toward (or block) a merge,
      // so they stay the owner's. The role is re-resolved at this call.
      if (event !== "COMMENT") {
        const role = await resolveActingRole();
        if (role !== null && role !== "owner") {
          return {
            ok: false,
            error: `Denied: github-pr-review --event ${event} is ${ROLE_REFUSED_MESSAGE} (IDENTITY-10: team reviews post as COMMENT).`,
            exitCode: 2,
          };
        }
      }
      if (githubDryRun()) {
        return okResult(ctx, {
          dryRun: true,
          owner,
          repo: name,
          pull_number,
          body: body.trim(),
          event,
        });
      }
      const octokit = clientOrErr();
      if (!("rest" in octokit)) return octokit;
      try {
        const res = await octokit.rest.pulls.createReview({
          owner,
          repo: name,
          pull_number,
          body: body.trim(),
          event,
        });
        const data = {
          id: res.data.id,
          state: res.data.state,
          html_url: res.data.html_url,
          pull_number,
        };
        return okResult(ctx, data);
      } catch (e) {
        return fail(e);
      }
    },
  },
];
