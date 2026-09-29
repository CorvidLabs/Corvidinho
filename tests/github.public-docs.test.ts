/**
 * ROLES-CHAT-8.a — community sessions may read the public repo docs
 * (README, docs/, STATUS, CHANGELOG) and the public issues and milestones of
 * allowed public repos, and nothing else as site or roadmap (#65).
 *
 * `github-docs-read` / `github-milestone-list` through a real Octokit with a
 * mocked fetch (no network, no token); the community catalog and prompt.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Octokit } from "@octokit/rest";
import { PUBLIC_QA_AGENT_SYSTEM_INSTRUCTIONS } from "../src/agent/execute.ts";
import { buildOpenAiTools } from "../src/agent/tools.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry, list } from "../src/plugins/registry.ts";
import type { PluginCommand, PluginHandlerResult } from "../src/plugins/types.ts";
import {
  DOCS_MAX_BYTES,
  DOCS_PATH_REFUSAL,
  DOCS_UNTRUSTED_NOTE,
  makeGithubPublicDocsCommands,
  publicDocPath,
} from "../plugins/github/public-docs.ts";

const OWNER_ID = "181969874455756800";
const STRANGER = "500000000000000005";
const REPO = "CorvidLabs/Corvidinho";
const API = "https://api.github.com";

const KEYS = [
  "CORVIDINHO_ACTING_IS_ADMIN",
  "CORVIDINHO_ACTING_DISCORD_USER_ID",
  "CORVIDINHO_ACTING_ROLE",
  "CORVIDINHO_ALLOWLIST_FILE",
  "CORVIDINHO_GITHUB_ALLOW_REPOS",
  "CORVIDINHO_GITHUB_ALLOW_ORGS",
  "CORVIDINHO_GITHUB_ALLOW_USERS",
  "CORVIDINHO_GITHUB_DENY_REPOS",
  "CORVIDINHO_GITHUB_DENY_ORGS",
  "GITHUB_TOKEN",
  "GH_TOKEN",
] as const;

let saved: Record<string, string | undefined> = {};
let dir = "";

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  dir = mkdtempSync(join(tmpdir(), "corvidinho-public-docs-"));
  const path = join(dir, "allowlist.toml");
  // Empty GitHub allowlist: community reads still reach confirmed-public repos.
  writeFileSync(path, `[discord]\nchannels = ["1"]\n\n[github]\ndeny_repos = ["denied/repo"]\n\n[owner]\ndiscord_id = "${OWNER_ID}"\n`);
  process.env.CORVIDINHO_ALLOWLIST_FILE = path;
  // A community Discord session (undeclared chatter).
  process.env.CORVIDINHO_ACTING_IS_ADMIN = "0";
  process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = STRANGER;
  process.env.CORVIDINHO_ACTING_ROLE = "community";
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(dir, { recursive: true, force: true });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64");

type Route = (url: URL) => Response | undefined;

function commands(route: Route, visibility: "public" | "private" | "unknown" = "public") {
  const calls: URL[] = [];
  const fetch = async (input: string | URL | Request) => {
    const raw = new URL(input instanceof Request ? input.url : String(input));
    // Octokit encodes the "/" of a contents path as %2F; route on the decoded path.
    const url = new URL(raw.href);
    url.pathname = decodeURIComponent(raw.pathname);
    calls.push(url);
    return route(url) ?? json({ message: "Not Found" }, 404);
  };
  const quiet = { debug() {}, info() {}, warn() {}, error() {} };
  const [docs, milestones] = makeGithubPublicDocsCommands({
    octokit: () => new Octokit({ request: { fetch }, log: quiet }),
    visibilityLookup: async () => visibility,
  }) as [PluginCommand, PluginCommand];
  return { docs, milestones, calls };
}

function run(cmd: PluginCommand, args: string[]): Promise<PluginHandlerResult> {
  return cmd.handler({ args, cwd: dir, json: true, nonInteractive: true, allowlist: new Set() });
}

describe("publicDocPath: README, docs/, STATUS, CHANGELOG and nothing else", () => {
  test("accepts the doc paths", () => {
    for (const p of ["README", "README.md", "readme.rst", "STATUS.md", "Status", "CHANGELOG.md", "docs", "docs/", "docs/discord.md", "./docs/a/b.md", "/docs/x.md"]) {
      expect(publicDocPath(p)).toBeDefined();
    }
    expect(publicDocPath("./docs/a/b.md")).toBe("docs/a/b.md");
  });
  test("refuses everything else", () => {
    for (const p of ["", " ", "src/cli.ts", ".env", "package.json", "docs/../.env", "../README.md", "a/README.md", "README.md/x", "docs\\x.md", "docs//x", "docsx/y.md", ".specsync/x", "STATUS.md.bak/x", "hi/identity.md"]) {
      expect(publicDocPath(p)).toBeUndefined();
    }
  });
});

describe("github-docs-read (ROLES-CHAT-8.a)", () => {
  test("community reads the README, STATUS and a docs/ file of a public repo; text is scrubbed, labelled as data", async () => {
    const secret = "ghp_" + "Ab3".repeat(12);
    const c = commands((u) => {
      if (u.pathname === "/repos/CorvidLabs/Corvidinho/readme") {
        return json({ type: "file", path: "README.md", encoding: "base64", content: b64(`# Corvidinho\ntoken ${secret}\n`) });
      }
      if (u.pathname === "/repos/CorvidLabs/Corvidinho/contents/STATUS.md") {
        return json({ type: "file", path: "STATUS.md", encoding: "base64", content: b64("## ROADMAP\n- M1 Knows everyone\n") });
      }
      if (u.pathname === "/repos/CorvidLabs/Corvidinho/contents/docs/discord.md") {
        return json({ type: "file", path: "docs/discord.md", encoding: "base64", content: b64("Discord UX\n") });
      }
      return undefined;
    });
    const readme = await run(c.docs, ["--repo", REPO]);
    expect(readme.ok).toBe(true);
    const d = readme.data as { path: string; text: string; untrusted: boolean; note: string; truncated: boolean };
    expect(d.path).toBe("README.md");
    expect(d.text).toContain("# Corvidinho");
    expect(d.text).not.toContain(secret);
    expect(d.untrusted).toBe(true);
    expect(d.note).toBe(DOCS_UNTRUSTED_NOTE);
    expect(d.truncated).toBe(false);
    const status = await run(c.docs, ["STATUS.md", "--repo", REPO]);
    expect((status.data as { text: string }).text).toContain("M1 Knows everyone");
    const doc = await run(c.docs, ["docs/discord.md", "--repo", REPO]);
    expect((doc.data as { text: string }).text).toBe("Discord UX\n");
  });

  test("a docs/ directory lists its entries; big docs are capped; binary docs are refused", async () => {
    const big = "x".repeat(DOCS_MAX_BYTES + 10) + "\n";
    const c = commands((u) => {
      if (u.pathname === "/repos/CorvidLabs/Corvidinho/contents/docs") {
        return json([
          { type: "file", name: "discord.md", path: "docs/discord.md" },
          { type: "dir", name: "hi-drafts", path: "docs/hi-drafts" },
        ]);
      }
      if (u.pathname === "/repos/CorvidLabs/Corvidinho/contents/CHANGELOG.md") {
        return json({ type: "file", path: "CHANGELOG.md", encoding: "base64", content: b64(`line\n${big}`) });
      }
      if (u.pathname === "/repos/CorvidLabs/Corvidinho/contents/docs/logo.png") {
        return json({ type: "file", path: "docs/logo.png", encoding: "base64", content: b64(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1])) });
      }
      return undefined;
    });
    const ls = await run(c.docs, ["docs/", "--repo", REPO]);
    expect(ls.ok).toBe(true);
    expect((ls.data as { entries: unknown[] }).entries).toEqual([
      { name: "discord.md", path: "docs/discord.md", type: "file" },
      { name: "hi-drafts", path: "docs/hi-drafts", type: "dir" },
    ]);
    const cl = await run(c.docs, ["CHANGELOG.md", "--repo", REPO]);
    const cd = cl.data as { truncated: boolean; bytes: number; text: string };
    expect(cd.truncated).toBe(true);
    expect(cd.bytes).toBeLessThanOrEqual(DOCS_MAX_BYTES);
    const png = await run(c.docs, ["docs/logo.png", "--repo", REPO]);
    expect(png.ok).toBe(false);
    expect(png.error).toContain("not a text doc");
  });

  test("any other path is refused before GitHub is called (every role)", async () => {
    const c = commands(() => json({ type: "file", path: "x", encoding: "base64", content: b64("secret") }));
    for (const p of ["src/cli.ts", ".env", "docs/../.env", "package.json"]) {
      const r = await run(c.docs, [p, "--repo", REPO]);
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(2);
      expect(r.error).toContain(DOCS_PATH_REFUSAL);
    }
    // The CLI (no role session) gets the same docs-only reader.
    delete process.env.CORVIDINHO_ACTING_IS_ADMIN;
    process.env.CORVIDINHO_GITHUB_ALLOW_REPOS = REPO;
    const cli = await run(c.docs, ["src/cli.ts", "--repo", REPO]);
    expect(cli.error).toContain(DOCS_PATH_REFUSAL);
    expect(c.calls).toHaveLength(0);
  });

  test("community: a private, unconfirmed or denied repo is refused before any read", async () => {
    for (const vis of ["private", "unknown"] as const) {
      const c = commands(() => json({}), vis);
      const r = await run(c.docs, ["--repo", "secret/private"]);
      expect(r.ok).toBe(false);
      expect(r.error).toContain("ROLES-CHAT-8");
      expect(c.calls).toHaveLength(0);
    }
    const c = commands(() => json({}));
    const denied = await run(c.docs, ["--repo", "denied/repo"]);
    expect(denied.ok).toBe(false);
    expect(denied.error).toContain("denied");
  });
});

describe("github-milestone-list (ROLES-CHAT-8.a)", () => {
  test("community lists a public repo's milestones (state, due date, issue counts)", async () => {
    const seen: string[] = [];
    const c = commands((u) => {
      if (u.pathname === "/repos/CorvidLabs/Corvidinho/milestones") {
        seen.push(u.search);
        return json([
          { number: 1, title: "M1 Knows everyone", state: "open", description: "d".repeat(900), due_on: "2026-10-15T00:00:00Z", open_issues: 6, closed_issues: 2, html_url: "https://github.com/CorvidLabs/Corvidinho/milestone/1" },
          { number: 2, title: "M2 Talk anywhere", state: "open", description: null, due_on: null, open_issues: 4, closed_issues: 0 },
        ]);
      }
      return undefined;
    });
    const r = await run(c.milestones, ["--repo", REPO, "--state", "all", "--limit", "5"]);
    expect(r.ok).toBe(true);
    const d = r.data as { milestones: Array<Record<string, unknown>>; untrusted: boolean };
    expect(d.untrusted).toBe(true);
    expect(d.milestones).toHaveLength(2);
    expect(d.milestones[0]).toMatchObject({ number: 1, title: "M1 Knows everyone", state: "open", dueOn: "2026-10-15T00:00:00Z", openIssues: 6, closedIssues: 2 });
    expect(String(d.milestones[0]!.description).length).toBe(500);
    expect(d.milestones[1]).toMatchObject({ number: 2, dueOn: null });
    expect(d.milestones[1]!.description).toBeUndefined();
    expect(seen[0]).toContain("state=all");
    expect(seen[0]).toContain("per_page=5");
  });

  test("bad flags are refused; a private repo is refused for community", async () => {
    const c = commands(() => json([]));
    for (const args of [["--state", "weird"], ["--limit", "0"], ["--limit", "101"], ["extra"], ["--bogus", "1"]]) {
      const r = await run(c.milestones, ["--repo", REPO, ...args]);
      expect(r.ok).toBe(false);
      expect(r.error).toContain("usage: github-milestone-list");
    }
    const p = commands(() => json([]), "private");
    const r = await run(p.milestones, ["--repo", "secret/private"]);
    expect(r.error).toContain("ROLES-CHAT-8");
    expect(c.calls).toHaveLength(0);
  });
});

describe("community site / roadmap sources (ROLES-CHAT-8.a)", () => {
  test("the community catalog has the docs, issue and milestone readers and never web-fetch, even allowlisted", () => {
    clearRegistry();
    loadBuiltins();
    try {
      const tools = new Set(
        buildOpenAiTools({
          tier: "code",
          allowlist: new Set(list().filter((e) => e.dangerous).map((e) => e.name)),
          actingRole: "community",
        }).map((t) => t.function.name),
      );
      for (const name of ["github-docs-read", "github-milestone-list", "github-issue-list", "files-read"]) {
        expect(tools.has(name)).toBe(true);
      }
      expect(tools.has("web-fetch")).toBe(false);
      expect(list().find((e) => e.name === "github-docs-read")).toMatchObject({ dangerous: false, mutating: false, minTier: 0 });
      expect(list().find((e) => e.name === "github-milestone-list")).toMatchObject({ dangerous: false, mutating: false, minTier: 0 });
    } finally {
      clearRegistry();
    }
  });

  test("the prompt names the sources and says nothing else counts as the site or roadmap", () => {
    const p = PUBLIC_QA_AGENT_SYSTEM_INSTRUCTIONS;
    expect(p).toContain("ROLES-CHAT-8.a");
    expect(p).toContain("README, docs/, STATUS, CHANGELOG");
    expect(p).toContain("public issues and milestones of allowed public repos");
    expect(p).toContain("nothing else counts as the site or roadmap");
    expect(p).not.toContain("the project site, and the roadmap");
  });
});
