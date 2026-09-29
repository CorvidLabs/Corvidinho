/**
 * ROLES-CHAT-8 — community public GitHub gate.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkRepoGateForActingRole } from "../src/plugins/githubPublic.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry } from "../src/plugins/registry.ts";
import { runPlugin } from "../src/plugins/run.ts";

const OWNER = "181969874455756800";
const KEYS = [
  "CORVIDINHO_ACTING_IS_ADMIN",
  "CORVIDINHO_ACTING_DISCORD_USER_ID",
  "CORVIDINHO_OWNER_DISCORD_ID",
  "CORVIDINHO_ALLOWLIST_FILE",
  "CORVIDINHO_GITHUB_ALLOW_REPOS",
  "CORVIDINHO_GITHUB_ALLOW_ORGS",
  "CORVIDINHO_GITHUB_ALLOW_USERS",
  "CORVIDINHO_GITHUB_DENY_REPOS",
  "CORVIDINHO_GITHUB_DENY_ORGS",
] as const;

let prev: Record<string, string | undefined> = {};
let tmp = "";

function snap() {
  prev = {};
  for (const k of KEYS) prev[k] = process.env[k];
}
function restore() {
  for (const k of KEYS) {
    if (prev[k] === undefined) delete process.env[k];
    else process.env[k] = prev[k];
  }
  if (tmp) {
    rmSync(tmp, { recursive: true, force: true });
    tmp = "";
  }
}

beforeEach(() => {
  snap();
  tmp = mkdtempSync(join(tmpdir(), "gh-public-"));
  const path = join(tmp, "allowlist.toml");
  writeFileSync(
    path,
    `[discord]\nchannels = ["1"]\n\n[owner]\ndiscord_id = "${OWNER}"\ndisplay = "Leif"\n`,
    "utf8",
  );
  process.env.CORVIDINHO_ALLOWLIST_FILE = path;
  process.env.CORVIDINHO_OWNER_DISCORD_ID = OWNER;
  // Empty GitHub allowlist — ADMIN/CLI path would deny; community public must still work.
  delete process.env.CORVIDINHO_GITHUB_ALLOW_REPOS;
  delete process.env.CORVIDINHO_GITHUB_ALLOW_ORGS;
  delete process.env.CORVIDINHO_GITHUB_ALLOW_USERS;
  delete process.env.CORVIDINHO_GITHUB_DENY_REPOS;
  delete process.env.CORVIDINHO_GITHUB_DENY_ORGS;
});

afterEach(restore);

describe("checkRepoGateForActingRole (ROLES-CHAT-8)", () => {
  test("community allows confirmed public repo even when allowlist empty", async () => {
    process.env.CORVIDINHO_ACTING_IS_ADMIN = "0";
    process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = "999";
    const r = await checkRepoGateForActingRole("CorvidLabs/Corvidinho", {
      visibilityLookup: async () => "public",
    });
    expect(r.ok).toBe(true);
  });

  test("community refuses private repo", async () => {
    process.env.CORVIDINHO_ACTING_IS_ADMIN = "0";
    process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = "999";
    const r = await checkRepoGateForActingRole("secret/private", {
      visibilityLookup: async () => "private",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("ROLES-CHAT-8");
  });

  test("deny list still wins for community", async () => {
    process.env.CORVIDINHO_ACTING_IS_ADMIN = "0";
    process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = "999";
    process.env.CORVIDINHO_GITHUB_DENY_REPOS = "evil/*";
    const r = await checkRepoGateForActingRole("evil/corp", {
      visibilityLookup: async () => "public",
    });
    expect(r.ok).toBe(false);
  });

  test("no role session uses allowlist (empty → deny)", async () => {
    delete process.env.CORVIDINHO_ACTING_IS_ADMIN;
    delete process.env.CORVIDINHO_ACTING_DISCORD_USER_ID;
    const r = await checkRepoGateForActingRole("CorvidLabs/Corvidinho", {
      visibilityLookup: async () => "public",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/GITHUB-6|allowlist|not authorized|empty/i);
  });

  test("ADMIN with allowlist permits match", async () => {
    process.env.CORVIDINHO_ACTING_IS_ADMIN = "1";
    process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = OWNER;
    process.env.CORVIDINHO_GITHUB_ALLOW_REPOS = "CorvidLabs/*";
    const r = await checkRepoGateForActingRole("CorvidLabs/Corvidinho", {
      visibilityLookup: async () => "private", // visibility ignored for ADMIN
    });
    expect(r.ok).toBe(true);
  });
});

/**
 * ROLES-CHAT-8 through the product path: no injected `visibilityLookup`, so
 * the gate runs the Octokit lookup (createOctokitVisibilityLookup). GitHub is
 * a stubbed `fetch` transport; no network, no real token.
 */
describe("checkRepoGateForActingRole with the real visibility lookup (ROLES-CHAT-8)", () => {
  const REPO_URL = "https://api.github.com/repos/o/r";
  const realFetch = globalThis.fetch;
  const TOKEN_KEYS = ["GITHUB_TOKEN", "GH_TOKEN"] as const;
  const savedTokens: Record<string, string | undefined> = {};
  let urls: string[] = [];

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  /** Stub GitHub: GET /repos/o/r answers `repo`; pulls list answers []. */
  function stubGithub(repo: Response | (() => Response)) {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      urls.push(url);
      if (url === REPO_URL) return typeof repo === "function" ? repo() : repo;
      if (url.startsWith(`${REPO_URL}/pulls`)) return json([]);
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
  }

  beforeEach(() => {
    for (const k of TOKEN_KEYS) savedTokens[k] = process.env[k];
    delete process.env.GH_TOKEN;
    process.env.GITHUB_TOKEN = "fixture-token-not-real";
    // A community (non-ADMIN) role session.
    process.env.CORVIDINHO_ACTING_IS_ADMIN = "0";
    process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = "999";
    urls = [];
    clearRegistry();
    loadBuiltins();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    for (const k of TOKEN_KEYS) {
      if (savedTokens[k] === undefined) delete process.env[k];
      else process.env[k] = savedTokens[k];
    }
  });

  function prList() {
    return runPlugin({
      name: "github-pr-list",
      args: ["--repo", "o/r"],
      nonInteractive: true,
    });
  }

  test("a private repo is refused and no pulls call is made", async () => {
    stubGithub(() => json({ full_name: "o/r", private: true }));
    const r = await checkRepoGateForActingRole("o/r");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("ROLES-CHAT-8");
      expect(r.error).toContain("private GitHub repos");
    }
    expect(urls).toEqual([REPO_URL]);

    urls = [];
    const listed = await prList();
    expect(listed.ok).toBe(false);
    expect(listed.exitCode).toBe(3);
    expect(listed.error).toContain("private GitHub repos");
    expect(urls).toEqual([REPO_URL]);
  });

  test("a repo whose visibility cannot be confirmed (404, no token) is refused", async () => {
    stubGithub(() => json({ message: "Not Found" }, 404));
    const r = await checkRepoGateForActingRole("o/r");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("could not confirm the repo is public");
    expect(urls).toEqual([REPO_URL]);

    // No token: the lookup cannot run, so the gate fails closed without a call.
    delete process.env.GITHUB_TOKEN;
    urls = [];
    const noToken = await checkRepoGateForActingRole("o/r");
    expect(noToken.ok).toBe(false);
    if (!noToken.ok) expect(noToken.error).toContain("could not confirm the repo is public");
    expect(urls).toEqual([]);
  });

  test("a confirmed public repo passes the gate and the pulls call goes out", async () => {
    stubGithub(() => json({ full_name: "o/r", private: false }));
    const r = await checkRepoGateForActingRole("o/r");
    expect(r.ok).toBe(true);
    expect(urls).toEqual([REPO_URL]);

    urls = [];
    const listed = await prList();
    expect(listed.error).toBeUndefined();
    expect(listed.ok).toBe(true);
    expect(urls[0]).toBe(REPO_URL);
    expect(urls.slice(1).some((u) => u.startsWith(`${REPO_URL}/pulls`))).toBe(true);
  });
});
