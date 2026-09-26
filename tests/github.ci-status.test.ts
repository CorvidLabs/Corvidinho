import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  CI_MAX_PAGES,
  ciStatusMessage,
  ciVerdict,
  checkRunRow,
  commitStatusRow,
  fetchCiStatus,
  isStatusesPermissionDenied,
  parseCiSelector,
  validateCiRef,
  type CiOctokit,
} from "../plugins/github/ciStatus.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { list } from "../src/plugins/registry.ts";
import { runPlugin } from "../src/plugins/run.ts";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const SHA_B = "fedcba9876543210fedcba9876543210fedcba98";

type Run = { name: string; status: string; conclusion: string | null; html_url: string | null; head_sha?: string };
type Status = { state: string; context: string; target_url: string | null };

function run(name: string, conclusion: string | null, status = conclusion ? "completed" : "in_progress"): Run {
  return { name, status, conclusion, html_url: `https://example.test/${name}`, head_sha: SHA };
}

function st(context: string, state: string): Status {
  return { context, state, target_url: `https://ci.example.test/${context}` };
}

type FakeError = { status: number; message: string; response?: { headers: Record<string, string> } };

/**
 * Octokit-shaped fake: records calls, serves pages from arrays. `refs` maps a
 * ref (branch name or SHA) to its own rows so a moving branch can be modelled;
 * refs not listed there serve `runs` / `statuses`.
 */
function fakeOctokit(opts: {
  runs?: Run[];
  statuses?: Status[];
  refs?: Record<string, { runs?: Run[]; statuses?: Status[] }>;
  commitSha?: string;
  statusSha?: string;
  runsTotal?: number;
  statusesTotal?: number;
  statusesError?: FakeError;
  checksError?: FakeError;
  commitError?: FakeError;
}) {
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const runsFor = (ref: string) => opts.refs?.[ref]?.runs ?? opts.runs ?? [];
  const statusesFor = (ref: string) => opts.refs?.[ref]?.statuses ?? opts.statuses ?? [];
  const page = <T>(xs: T[], p: number, per: number) => xs.slice((p - 1) * per, p * per);
  const raise = (e: FakeError): never => {
    throw Object.assign(new Error(e.message), e);
  };
  const octokit: CiOctokit = {
    rest: {
      pulls: {
        async get(params) {
          calls.push({ method: "pulls.get", params });
          return { data: { head: { sha: SHA, ref: "feat/ci" } } };
        },
      },
      checks: {
        async listForRef(params) {
          calls.push({ method: "checks.listForRef", params });
          if (opts.checksError) raise(opts.checksError);
          if (opts.runsTotal !== undefined) {
            // Endless full pages: exercises the paging cap.
            const full = Array.from({ length: params.per_page }, (_, i) => run(`r${params.page}-${i}`, "success"));
            return { data: { total_count: opts.runsTotal, check_runs: full } };
          }
          const runs = runsFor(params.ref);
          return {
            data: { total_count: runs.length, check_runs: page(runs, params.page, params.per_page) },
          };
        },
      },
      repos: {
        async getCommit(params) {
          calls.push({ method: "repos.getCommit", params });
          if (opts.commitError) raise(opts.commitError);
          return { data: { sha: opts.commitSha ?? SHA } };
        },
        async getCombinedStatusForRef(params) {
          calls.push({ method: "repos.getCombinedStatusForRef", params });
          if (opts.statusesError) raise(opts.statusesError);
          if (opts.statusesTotal !== undefined) {
            // Endless full pages: exercises the statuses paging cap.
            const full = Array.from({ length: params.per_page }, (_, i) => st(`s${params.page}-${i}`, "success"));
            return { data: { sha: opts.statusSha ?? SHA, total_count: opts.statusesTotal, statuses: full } };
          }
          const statuses = statusesFor(params.ref);
          return {
            data: {
              sha: opts.statusSha ?? SHA,
              total_count: statuses.length,
              statuses: page(statuses, params.page, params.per_page),
            },
          };
        },
      },
    },
  };
  return { octokit, calls };
}

const listingRefs = (calls: { method: string; params: Record<string, unknown> }[]) =>
  calls
    .filter((c) => c.method === "checks.listForRef" || c.method === "repos.getCombinedStatusForRef")
    .map((c) => c.params.ref);

describe("github-ci-status selector (GITHUB-4: PR or ref)", () => {
  test("digits are a PR number", () => {
    expect(parseCiSelector("12")).toEqual({ ok: true, target: { kind: "pr", number: 12 } });
    expect(parseCiSelector("123456789")).toEqual({ ok: true, target: { kind: "pr", number: 123456789 } });
  });

  test("branch, tag and SHA are refs", () => {
    for (const ref of ["main", "feat/ci-ref", "v1.2.3", "heads/123", "tags/v1", "abc1234", SHA, "1234567890"]) {
      expect(parseCiSelector(ref)).toEqual({ ok: true, target: { kind: "ref", ref } });
    }
  });

  test("PR 0 is refused with a digits-only ref hint", () => {
    const r = parseCiSelector("0");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("heads/<name>");
  });

  test("option-looking values are refused", () => {
    for (const bad of ["--repo", "-R", "--upload-pack=x", "-"]) {
      const r = parseCiSelector(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain("option-looking");
    }
  });

  test("invalid ref syntax is refused (git ref-name rules)", () => {
    for (const bad of [
      "a..b",
      "has space",
      "tab\there",
      "x.lock",
      "feat/x.lock",
      ".hidden",
      "feat/.hidden",
      "a//b",
      "/lead",
      "trail/",
      "dot.",
      "a~1",
      "a^",
      "a:b",
      "a?",
      "a*",
      "a[b",
      "a\\b",
      "@",
      "a@{1}",
      "x".repeat(256),
    ]) {
      expect(validateCiRef(bad)).not.toBeNull();
      expect(parseCiSelector(bad).ok).toBe(false);
    }
    expect(validateCiRef("")).not.toBeNull();
    expect(validateCiRef("release/2026-09")).toBeNull();
  });
});

describe("github-ci-status verdict", () => {
  test("no rows ⇒ none", () => {
    expect(ciVerdict([])).toBe("none");
  });

  test("success / skipped / neutral ⇒ green", () => {
    const rows = [run("a", "success"), run("b", "skipped"), run("c", "neutral")].map(checkRunRow);
    expect(ciVerdict(rows)).toBe("green");
    expect(rows.map((r) => r.bucket)).toEqual(["pass", "skipping", "skipping"]);
  });

  test("any failure / cancelled / timed_out / action_required ⇒ red", () => {
    for (const c of ["failure", "cancelled", "timed_out", "action_required"]) {
      const rows = [run("ok", "success"), run("bad", c)].map(checkRunRow);
      expect(ciVerdict(rows)).toBe("red");
    }
  });

  test("queued / in progress / stale ⇒ pending", () => {
    expect(ciVerdict([checkRunRow(run("q", null, "queued"))])).toBe("pending");
    expect(ciVerdict([checkRunRow(run("p", null, "in_progress"))])).toBe("pending");
    expect(ciVerdict([checkRunRow(run("s", "stale"))])).toBe("pending");
    expect(ciVerdict([checkRunRow(run("ok", "success")), checkRunRow(run("p", null))])).toBe("pending");
  });

  test("red wins over pending", () => {
    const rows = [run("p", null), run("bad", "failure")].map(checkRunRow);
    expect(ciVerdict(rows)).toBe("red");
  });

  test("legacy commit statuses: success green, failure/error red, pending pending", () => {
    expect(ciVerdict([commitStatusRow(st("ci/legacy", "success"))])).toBe("green");
    expect(ciVerdict([commitStatusRow(st("ci/legacy", "failure"))])).toBe("red");
    expect(ciVerdict([commitStatusRow(st("ci/legacy", "error"))])).toBe("red");
    expect(ciVerdict([commitStatusRow(st("ci/legacy", "pending"))])).toBe("pending");
  });

  test("row keeps the original name/state/bucket/link fields", () => {
    const row = checkRunRow(run("smoke", "success"));
    expect(row).toMatchObject({
      name: "smoke",
      state: "SUCCESS",
      bucket: "pass",
      link: "https://example.test/smoke",
      kind: "check",
      status: "completed",
      conclusion: "success",
    });
    const pending = checkRunRow(run("build", null, "queued"));
    expect(pending).toMatchObject({ state: "QUEUED", bucket: "pending", conclusion: null });
    expect(commitStatusRow(st("ci/legacy", "error"))).toMatchObject({
      name: "ci/legacy",
      state: "ERROR",
      bucket: "fail",
      link: "https://ci.example.test/ci/legacy",
      kind: "status",
      status: "completed",
      conclusion: "error",
    });
  });
});

describe("github-ci-status fetch (mocked Octokit)", () => {
  test("PR number resolves head SHA, merges check runs and commit statuses", async () => {
    const { octokit, calls } = fakeOctokit({
      runs: [run("smoke", "success"), run("lint", "failure")],
      statuses: [st("ci/legacy", "success")],
    });
    const d = await fetchCiStatus(octokit, { owner: "o", repo: "r", target: { kind: "pr", number: 7 } });
    expect(calls[0]).toEqual({ method: "pulls.get", params: { owner: "o", repo: "r", pull_number: 7 } });
    const refs = calls.filter((c) => c.method !== "pulls.get").map((c) => c.params.ref);
    expect(refs).toEqual([SHA, SHA]);
    expect(d.target).toBe("pr");
    expect(d.pr).toBe(7);
    expect(d.ref).toBe("feat/ci");
    expect(d.sha).toBe(SHA);
    expect(d.verdict).toBe("red");
    expect(d.counts).toEqual({ total: 3, pass: 2, fail: 1, pending: 0, skipping: 0 });
    expect(d.checks.map((c) => [c.name, c.kind])).toEqual([
      ["smoke", "check"],
      ["lint", "check"],
      ["ci/legacy", "status"],
    ]);
    const msg = ciStatusMessage(d);
    expect(msg).toContain("CI red for PR #7 (feat/ci) @ 0123456");
    expect(msg).toContain("failing: lint");
  });

  test("ref target skips pulls.get and pins the ref to one SHA before listing", async () => {
    const { octokit, calls } = fakeOctokit({ runs: [run("smoke", "success")] });
    const d = await fetchCiStatus(octokit, { owner: "o", repo: "r", target: { kind: "ref", ref: "main" } });
    expect(calls.some((c) => c.method === "pulls.get")).toBe(false);
    expect(calls[0]).toEqual({
      method: "repos.getCommit",
      params: { owner: "o", repo: "r", ref: "main", per_page: 1 },
    });
    expect(listingRefs(calls)).toEqual([SHA, SHA]);
    expect(d).toMatchObject({ target: "ref", pr: null, ref: "main", sha: SHA, verdict: "green" });
    expect(ciStatusMessage(d)).toContain("CI green for main @ 0123456");
  });

  test("a branch that moves mid-query is still read at the resolved commit only", async () => {
    // `main` resolved to SHA (green); by the time the listings run, the branch
    // name would serve SHA_B's red rows. Every listing must use the pinned SHA.
    const { octokit, calls } = fakeOctokit({
      commitSha: SHA,
      statusSha: SHA,
      refs: {
        [SHA]: { runs: [run("smoke", "success")], statuses: [st("jenkins", "success")] },
        main: { runs: [run("smoke", "failure")], statuses: [st("jenkins", "failure")] },
        [SHA_B]: { runs: [run("smoke", "failure")], statuses: [st("jenkins", "failure")] },
      },
    });
    const d = await fetchCiStatus(octokit, { owner: "o", repo: "r", target: { kind: "ref", ref: "main" } });
    expect(listingRefs(calls)).toEqual([SHA, SHA]);
    expect(d.sha).toBe(SHA);
    expect(d.verdict).toBe("green");
    expect(d.counts).toMatchObject({ total: 2, pass: 2, fail: 0 });
  });

  test("result SHA is the resolved commit, not the statuses response", async () => {
    const { octokit } = fakeOctokit({ commitSha: SHA, statusSha: SHA_B, runs: [run("smoke", "success")] });
    const d = await fetchCiStatus(octokit, { owner: "o", repo: "r", target: { kind: "ref", ref: "abc1234" } });
    expect(d.sha).toBe(SHA);
  });

  test("an unknown ref fails at resolution without listing", async () => {
    const { octokit, calls } = fakeOctokit({ commitError: { status: 422, message: "No commit found for SHA: nope" } });
    await expect(
      fetchCiStatus(octokit, { owner: "o", repo: "r", target: { kind: "ref", ref: "nope" } }),
    ).rejects.toThrow("No commit found");
    expect(listingRefs(calls)).toEqual([]);
  });

  test("status-context-only repo is covered by the verdict", async () => {
    const { octokit } = fakeOctokit({ statuses: [st("jenkins", "pending")] });
    const d = await fetchCiStatus(octokit, { owner: "o", repo: "r", target: { kind: "ref", ref: "v1.0.0" } });
    expect(d.verdict).toBe("pending");
    expect(d.checks).toHaveLength(1);
  });

  test("no checks and no statuses ⇒ none", async () => {
    const { octokit } = fakeOctokit({});
    const d = await fetchCiStatus(octokit, { owner: "o", repo: "r", target: { kind: "ref", ref: SHA } });
    expect(d.verdict).toBe("none");
    expect(d.counts.total).toBe(0);
    expect(ciStatusMessage(d)).toContain("CI none for");
  });

  test("pages through more than 100 check runs", async () => {
    const runs = Array.from({ length: 120 }, (_, i) => run(`c${i}`, "success"));
    const { octokit, calls } = fakeOctokit({ runs });
    const d = await fetchCiStatus(octokit, { owner: "o", repo: "r", target: { kind: "ref", ref: "main" } });
    expect(d.checks).toHaveLength(120);
    expect(d.truncated).toBe(false);
    expect(calls.filter((c) => c.method === "checks.listForRef").map((c) => c.params.page)).toEqual([1, 2]);
  });

  test("check-run paging stops at the cap; an all-pass truncated list is pending, not green", async () => {
    const { octokit, calls } = fakeOctokit({ runsTotal: 5000 });
    const d = await fetchCiStatus(octokit, { owner: "o", repo: "r", target: { kind: "ref", ref: "main" } });
    expect(calls.filter((c) => c.method === "checks.listForRef")).toHaveLength(CI_MAX_PAGES);
    expect(d.truncated).toBe(true);
    expect(d.counts).toMatchObject({ total: CI_MAX_PAGES * 100, pass: CI_MAX_PAGES * 100, fail: 0 });
    expect(d.verdict).toBe("pending");
    expect(d.warnings.join(" ")).toContain("truncated");
    expect(d.warnings.join(" ")).toContain("verdict pending");
    expect(ciStatusMessage(d)).toContain("CI pending for main");
  });

  test("commit-status paging stops at the cap; truncation keeps the verdict off green", async () => {
    const { octokit, calls } = fakeOctokit({ runs: [run("smoke", "success")], statusesTotal: 5000 });
    const d = await fetchCiStatus(octokit, { owner: "o", repo: "r", target: { kind: "ref", ref: "main" } });
    expect(calls.filter((c) => c.method === "repos.getCombinedStatusForRef")).toHaveLength(CI_MAX_PAGES);
    expect(d.truncated).toBe(true);
    expect(d.counts.total).toBe(1 + CI_MAX_PAGES * 100);
    expect(d.verdict).toBe("pending");
    expect(d.warnings.join(" ")).toContain("truncated");
  });

  test("a truncated list with a seen failure stays red", async () => {
    const { octokit } = fakeOctokit({ runs: [run("lint", "failure")], statusesTotal: 5000 });
    const d = await fetchCiStatus(octokit, { owner: "o", repo: "r", target: { kind: "ref", ref: "main" } });
    expect(d.truncated).toBe(true);
    expect(d.verdict).toBe("red");
    expect(d.warnings.join(" ")).not.toContain("verdict pending");
  });

  test("commit statuses permission 403 degrades to check runs with a warning", async () => {
    const { octokit } = fakeOctokit({
      runs: [run("smoke", "success")],
      statusesError: { status: 403, message: "Resource not accessible by integration" },
    });
    const d = await fetchCiStatus(octokit, { owner: "o", repo: "r", target: { kind: "ref", ref: "main" } });
    expect(d.verdict).toBe("green");
    expect(d.warnings[0]).toContain("commit statuses not readable");
    expect(ciStatusMessage(d)).toContain("warning:");
  });

  test("verdict none still carries the statuses 403 warning in the message", async () => {
    const { octokit } = fakeOctokit({
      statusesError: { status: 403, message: "Resource not accessible by integration" },
    });
    const d = await fetchCiStatus(octokit, { owner: "o", repo: "r", target: { kind: "ref", ref: "main" } });
    expect(d.verdict).toBe("none");
    expect(d.warnings).toHaveLength(1);
    const msg = ciStatusMessage(d);
    expect(msg).toContain("CI none for main @ 0123456");
    expect(msg).toContain("; warning: commit statuses not readable (403)");
  });

  test("rate-limit and SSO 403s on commit statuses propagate instead of degrading to green", async () => {
    const target = { kind: "ref", ref: "main" } as const;
    const cases: FakeError[] = [
      {
        status: 403,
        message: "API rate limit exceeded for installation ID 1.",
        response: { headers: { "x-ratelimit-remaining": "0" } },
      },
      {
        status: 403,
        message: "You have exceeded a secondary rate limit. Please wait a few minutes before you try again.",
        response: { headers: { "retry-after": "60" } },
      },
      { status: 403, message: "API rate limit exceeded" },
      { status: 403, message: "You have triggered an abuse detection mechanism." },
      {
        status: 403,
        message: "Resource protected by organization SAML enforcement.",
        response: { headers: { "x-github-sso": "required; url=https://github.com/orgs/o/sso" } },
      },
    ];
    for (const statusesError of cases) {
      const err = Object.assign(new Error(statusesError.message), statusesError);
      expect(isStatusesPermissionDenied(err)).toBe(false);
      const { octokit } = fakeOctokit({ runs: [run("smoke", "success")], statusesError });
      await expect(fetchCiStatus(octokit, { owner: "o", repo: "r", target })).rejects.toThrow(
        statusesError.message,
      );
    }
    // Header-only signals, with a message that looks like a plain permission denial.
    const quietLimit = Object.assign(new Error("Forbidden"), {
      status: 403,
      response: { headers: { "x-ratelimit-remaining": "0" } },
    });
    expect(isStatusesPermissionDenied(quietLimit)).toBe(false);
    const denied = Object.assign(new Error("Resource not accessible by personal access token"), {
      status: 403,
      response: { headers: { "x-ratelimit-remaining": "4999" } },
    });
    expect(isStatusesPermissionDenied(denied)).toBe(true);
    expect(isStatusesPermissionDenied(Object.assign(new Error("Not Found"), { status: 404 }))).toBe(false);
    expect(isStatusesPermissionDenied(null)).toBe(false);
  });

  test("other errors propagate", async () => {
    const target = { kind: "ref", ref: "main" } as const;
    const a = fakeOctokit({ checksError: { status: 404, message: "No commit found" } });
    await expect(fetchCiStatus(a.octokit, { owner: "o", repo: "r", target })).rejects.toThrow("No commit found");
    const b = fakeOctokit({ statusesError: { status: 500, message: "boom" } });
    await expect(fetchCiStatus(b.octokit, { owner: "o", repo: "r", target })).rejects.toThrow("boom");
  });
});

describe("github-ci-status plugin handler", () => {
  const keys = ["CORVIDINHO_GITHUB_ALLOW_REPOS", "GITHUB_TOKEN", "GH_TOKEN"] as const;
  const prev: Record<string, string | undefined> = {};
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    for (const k of keys) prev[k] = process.env[k];
    process.env.CORVIDINHO_GITHUB_ALLOW_REPOS = "CorvidLabs/Corvidinho";
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    loadBuiltins();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  const runCi = (args: string[]) =>
    runPlugin({ name: "github-ci-status", args, nonInteractive: true, allowlist: [], json: true });

  test("stays a read: dangerous=false, minTier=0", () => {
    const entry = list().find((e) => e.name === "github-ci-status");
    expect(entry).toMatchObject({ dangerous: false, minTier: 0 });
    expect(entry!.description).toContain("ref");
  });

  test("--repo gate still applies (GITHUB-6)", async () => {
    const missing = await runCi(["main"]);
    expect(missing.ok).toBe(false);
    expect(missing.exitCode).toBe(3);
    const denied = await runCi(["main", "--repo", "someone/else"]);
    expect(denied.ok).toBe(false);
    expect(denied.exitCode).toBe(3);
  });

  test("usage, option-looking, invalid ref and extra args refuse before any token/API use", async () => {
    const repo = ["--repo", "CorvidLabs/Corvidinho"];
    const none = await runCi(repo);
    expect(none.error).toContain("usage: github-ci-status <pr-number|ref>");
    const opt = await runCi(["--upload-pack=x", ...repo]);
    expect(opt.exitCode).toBe(1);
    expect(opt.error).toContain("option-looking");
    const optThenRef = await runCi(["--ref", "main", ...repo]);
    expect(optThenRef.exitCode).toBe(1);
    expect(optThenRef.error).toContain("option-looking");
    const bad = await runCi(["a..b", ...repo]);
    expect(bad.exitCode).toBe(1);
    expect(bad.error).toContain("invalid ref");
    const extra = await runCi(["main", "extra", ...repo]);
    expect(extra.exitCode).toBe(1);
    expect(extra.error).toContain("unexpected args: extra");
  });

  test("valid ref without a token fails with the missing-token error", async () => {
    const r = await runCi(["main", "--repo", "CorvidLabs/Corvidinho"]);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("GITHUB_TOKEN");
  });

  test("ref end-to-end through Octokit with a stubbed transport", async () => {
    process.env.GITHUB_TOKEN = "fixture-token-not-real";
    const commits = "https://api.github.com/repos/CorvidLabs/Corvidinho/commits/";
    const urls: string[] = [];
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      urls.push(url);
      if (url === `${commits}feat%2Fci?per_page=1`) {
        return json({ sha: SHA, files: [] });
      }
      if (url === `${commits}${SHA}/check-runs?per_page=100&page=1`) {
        return json({ total_count: 1, check_runs: [run("smoke", null, "in_progress")] });
      }
      if (url === `${commits}${SHA}/status?per_page=100&page=1`) {
        return json({ sha: SHA, total_count: 1, statuses: [st("ci/legacy", "success")] });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    const r = await runCi(["feat/ci", "--repo", "CorvidLabs/Corvidinho"]);
    expect(r.ok).toBe(true);
    const data = r.data as { verdict: string; sha: string; checks: { name: string; bucket: string }[] };
    expect(data.verdict).toBe("pending");
    expect(data.sha).toBe(SHA);
    expect(data.checks.map((c) => c.bucket)).toEqual(["pending", "pass"]);
    expect(r.message).toContain("CI pending for feat/ci");
    // One ref resolution, then both listings by the pinned SHA (never the moving branch name).
    expect(urls).toHaveLength(3);
    expect(urls[0]).toBe(`${commits}feat%2Fci?per_page=1`);
    expect(urls.slice(1).every((u) => u.startsWith(`${commits}${SHA}/`))).toBe(true);
  });
});
