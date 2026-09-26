/**
 * ROLES-CHAT-8 — community public GitHub gate.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkRepoGateForActingRole } from "../src/plugins/githubPublic.ts";

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
