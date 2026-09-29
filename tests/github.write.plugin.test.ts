import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { list } from "../src/plugins/registry.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { parseJsonStdout } from "../plugins/github/api.ts";
import { ATTRIBUTION_MARKDOWN, ATTRIBUTION_PLAIN } from "../src/attribution.ts";

const fixtures = import.meta.dir + "/fixtures/github";

const WRITE_CMDS = [
  "github-issue-create",
  "github-issue-comment",
  "github-pr-create",
  "github-pr-review",
] as const;

/** Missing allowlist file: the gate never reads an operator's real file (ALLOW-4). */
const NO_ALLOWLIST = join(mkdtempSync(join(tmpdir(), "corvidinho-gh-write-")), "no-allowlist.toml");

const allowEnv = {
  CORVIDINHO_GITHUB_ALLOW_REPOS: "CorvidLabs/Corvidinho",
  CORVIDINHO_ALLOWLIST_FILE: NO_ALLOWLIST,
};

function withEnv(extra: Record<string, string>, fn: () => Promise<void>) {
  const prev: Record<string, string | undefined> = {};
  const keys: Record<string, string> = { ...allowEnv, ...extra };
  for (const k of Object.keys(keys)) {
    prev[k] = process.env[k];
    process.env[k] = keys[k]!;
  }
  return fn().finally(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

describe("github write plugins (GITHUB-2/3/5)", () => {
  test("listed as dangerous minTier 1", () => {
    loadBuiltins();
    for (const name of WRITE_CMDS) {
      const entry = list().find((e) => e.name === name);
      expect(entry).toBeDefined();
      expect(entry!.dangerous).toBe(true);
      expect(entry!.minTier).toBe(1);
    }
  });

  test("non-interactive without CORVIDINHO_ALLOWLIST denies (SAFE-1)", async () => {
    loadBuiltins();
    await withEnv({ CORVIDINHO_GITHUB_DRY_RUN: "1" }, async () => {
      for (const name of WRITE_CMDS) {
        const r = await runPlugin({
          name,
          args: ["--repo", "CorvidLabs/Corvidinho", "--title", "t", "--body", "b", "1"],
          nonInteractive: true,
          allowlist: [],
        });
        expect(r.ok).toBe(false);
        expect(r.exitCode).toBe(2);
        expect(r.error).toContain("SAFE-1");
      }
    });
  });

  test("empty repo allowlist still denies when command allowlisted (ALLOW-1/GITHUB-6)", async () => {
    loadBuiltins();
    const prev = process.env.CORVIDINHO_GITHUB_ALLOW_REPOS;
    const prevOrgs = process.env.CORVIDINHO_GITHUB_ALLOW_ORGS;
    const prevFile = process.env.CORVIDINHO_ALLOWLIST_FILE;
    delete process.env.CORVIDINHO_GITHUB_ALLOW_REPOS;
    delete process.env.CORVIDINHO_GITHUB_ALLOW_ORGS;
    // Empty means empty: no operator allowlist file may admit the repo.
    process.env.CORVIDINHO_ALLOWLIST_FILE = NO_ALLOWLIST;
    process.env.CORVIDINHO_GITHUB_DRY_RUN = "1";
    try {
      const r = await runPlugin({
        name: "github-issue-comment",
        args: ["48", "--repo", "CorvidLabs/Corvidinho", "--body", "hi"],
        nonInteractive: true,
        allowlist: ["github-issue-comment"],
      });
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(3);
      expect(r.error?.toLowerCase()).toMatch(/not authorized|empty|default-deny|github-6/);
    } finally {
      if (prev !== undefined) process.env.CORVIDINHO_GITHUB_ALLOW_REPOS = prev;
      else delete process.env.CORVIDINHO_GITHUB_ALLOW_REPOS;
      if (prevOrgs !== undefined) process.env.CORVIDINHO_GITHUB_ALLOW_ORGS = prevOrgs;
      else delete process.env.CORVIDINHO_GITHUB_ALLOW_ORGS;
      if (prevFile !== undefined) process.env.CORVIDINHO_ALLOWLIST_FILE = prevFile;
      else delete process.env.CORVIDINHO_ALLOWLIST_FILE;
      delete process.env.CORVIDINHO_GITHUB_DRY_RUN;
    }
  });

  test("dry-run issue-create when allowlisted", async () => {
    loadBuiltins();
    await withEnv({ CORVIDINHO_GITHUB_DRY_RUN: "1" }, async () => {
      const r = await runPlugin({
        name: "github-issue-create",
        args: [
          "--repo",
          "CorvidLabs/Corvidinho",
          "--title",
          "Dogfood",
          "--body",
          "body",
        ],
        nonInteractive: true,
        allowlist: ["github-issue-create"],
      });
      expect(r.ok).toBe(true);
      expect((r.data as { dryRun?: boolean })?.dryRun).toBe(true);
      expect((r.data as { title?: string })?.title).toBe("Dogfood");
    });
  });

  test("dry-run issue-comment when allowlisted", async () => {
    loadBuiltins();
    await withEnv({ CORVIDINHO_GITHUB_DRY_RUN: "1" }, async () => {
      const r = await runPlugin({
        name: "github-issue-comment",
        args: ["48", "--repo", "CorvidLabs/Corvidinho", "--body", "progress"],
        nonInteractive: true,
        allowlist: ["github-issue-comment"],
      });
      expect(r.ok).toBe(true);
      expect((r.data as { dryRun?: boolean; issue_number?: number })?.issue_number).toBe(48);
    });
  });

  test("dry-run pr-create appends Made with Corvidinho attribution", async () => {
    loadBuiltins();
    await withEnv({ CORVIDINHO_GITHUB_DRY_RUN: "1" }, async () => {
      const r = await runPlugin({
        name: "github-pr-create",
        args: [
          "--repo",
          "CorvidLabs/Corvidinho",
          "--title",
          "feat: writes",
          "--body",
          "Implements GITHUB-2",
          "--head",
          "corvidinho/github-write-plugins",
          "--base",
          "main",
        ],
        nonInteractive: true,
        allowlist: ["github-pr-create"],
      });
      expect(r.ok).toBe(true);
      const body = (r.data as { body?: string })?.body ?? "";
      expect(body).toContain("Implements GITHUB-2");
      expect(body).toContain("Made with");
      expect(body).toContain("Corvidinho");
      expect(body).not.toContain("@Corvidinho");
      expect(body).not.toContain("@corvid-agent");
    });
  });

  test("dry-run pr-create: a body that only mentions \"Made with\" and \"Corvidinho\" still gets the footer; one that has it does not get a second", async () => {
    loadBuiltins();
    const prCreate = (body: string) =>
      runPlugin({
        name: "github-pr-create",
        args: ["--repo", "CorvidLabs/Corvidinho", "--title", "t", "--body", body, "--head", "h"],
        nonInteractive: true,
        allowlist: ["github-pr-create"],
      });
    const bodyOf = (r: { data?: unknown }) => (r.data as { body?: string })?.body ?? "";
    await withEnv({ CORVIDINHO_GITHUB_DRY_RUN: "1" }, async () => {
      const mention = "Made with Bun; fixes the Corvidinho watch poller.";
      const r = await prCreate(mention);
      expect(r.ok).toBe(true);
      expect(bodyOf(r)).toBe(`${mention}\n\n---\n${ATTRIBUTION_MARKDOWN}`);

      for (const has of [
        `Fixes the watch poller.\n\n${ATTRIBUTION_MARKDOWN}`,
        `Fixes the watch poller.\n\n${ATTRIBUTION_PLAIN}`,
      ]) {
        const again = await prCreate(has);
        expect(again.ok).toBe(true);
        expect(bodyOf(again)).toBe(has);
      }
    });
  });

  test("dry-run pr-review when allowlisted", async () => {
    loadBuiltins();
    await withEnv({ CORVIDINHO_GITHUB_DRY_RUN: "1" }, async () => {
      const r = await runPlugin({
        name: "github-pr-review",
        args: [
          "1",
          "--repo",
          "CorvidLabs/Corvidinho",
          "--body",
          "LGTM shape",
          "--event",
          "COMMENT",
        ],
        nonInteractive: true,
        allowlist: ["github-pr-review"],
      });
      expect(r.ok).toBe(true);
      expect((r.data as { event?: string })?.event).toBe("COMMENT");
    });
  });

  test("write fixture JSON parses", async () => {
    for (const f of [
      "issue-create.json",
      "issue-comment.json",
      "pr-create.json",
      "pr-review.json",
    ]) {
      const raw = await Bun.file(`${fixtures}/${f}`).text();
      const data = parseJsonStdout(raw);
      expect(data).toBeTruthy();
    }
  });
});
