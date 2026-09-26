import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkChannel,
  checkRole,
  checkUser,
  configFromEnvOnly,
  hasGithubRepoAllowEntries,
  isGithubUserAllowed,
  isRepoAllowed,
  loadAllowlist,
  parseSimpleToml,
} from "../src/allowlist/index.ts";
import { emptyConfig, emptyGithub } from "../src/allowlist/types.ts";

describe("default-deny allowlists (ALLOW; forbid Merlin empty→BASIC)", () => {
  test("empty github allowlists have no repo allow entries", () => {
    expect(hasGithubRepoAllowEntries(emptyGithub())).toBe(false);
  });

  test("empty allow ⇒ repo denied (regression vs allow-by-default)", () => {
    const r = isRepoAllowed("CorvidLabs/Corvidinho", emptyGithub());
    expect(r.ok).toBe(false);
  });

  test("allow match ok; deny override wins", () => {
    const g = emptyGithub();
    g.repos = ["corvidlabs/*"];
    expect(isRepoAllowed("CorvidLabs/Corvidinho", g).ok).toBe(true);
    g.denyRepos = ["corvidlabs/corvidinho"];
    expect(isRepoAllowed("CorvidLabs/Corvidinho", g).ok).toBe(false);
  });

  test("empty user allow ⇒ deny (not BASIC)", () => {
    const r = isGithubUserAllowed("0xLeif", emptyGithub());
    expect(r.ok).toBe(false);
  });

  test("discord empty channel/role/user ⇒ deny-all", () => {
    const cfg = emptyConfig();
    expect(checkChannel("111", cfg).ok).toBe(false);
    expect(checkRole("admin", cfg).ok).toBe(false);
    expect(checkUser("222", cfg).ok).toBe(false);
  });

  test("discord allow match + deny override", () => {
    const cfg = emptyConfig();
    cfg.discord.channels = ["111"];
    cfg.discord.roles = ["admin"];
    cfg.discord.users = ["222"];
    expect(checkChannel("111", cfg).ok).toBe(true);
    expect(checkRole("admin", cfg).ok).toBe(true);
    expect(checkUser("222", cfg).ok).toBe(true);
    cfg.discord.denyChannels = ["111"];
    expect(checkChannel("111", cfg).ok).toBe(false);
  });

  test("env-only configFromEnvOnly default-denies without ALLOW_*", () => {
    const cfg = configFromEnvOnly({});
    expect(isRepoAllowed("a/b", cfg.github).ok).toBe(false);
    expect(checkChannel("1", cfg).ok).toBe(false);
  });

  test("file + env overlay loads toml", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-allow-"));
    const path = join(dir, "allowlist.toml");
    writeFileSync(
      path,
      `[github]\nrepos = ["CorvidLabs/Corvidinho"]\n[discord]\nchannels = ["99"]\n`,
    );
    const cfg = await loadAllowlist({
      filePath: path,
      env: { CORVIDINHO_GITHUB_ALLOW_ORGS: "OtherOrg" },
    });
    expect(cfg.sourcePath).toBe(path);
    expect(isRepoAllowed("CorvidLabs/Corvidinho", cfg.github).ok).toBe(true);
    expect(isRepoAllowed("OtherOrg/x", cfg.github).ok).toBe(true);
    expect(checkChannel("99", cfg).ok).toBe(true);
  });

  test("parseSimpleToml sections", () => {
    const t = parseSimpleToml(`[github]\norgs = ["A"]\nrepos = ["A/b"]\n`);
    expect(t.github?.orgs).toEqual(["A"]);
    expect(t.github?.repos).toEqual(["A/b"]);
  });
});
