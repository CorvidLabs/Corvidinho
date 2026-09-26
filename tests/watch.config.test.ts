import { describe, expect, test } from "bun:test";
import {
  expandWatchRepos,
  loadWatchConfig,
} from "../src/watch/config.ts";
import { emptyConfig } from "../src/allowlist/types.ts";

describe("watch config", () => {
  test("missing token → missing_token", async () => {
    const r = await loadWatchConfig({
      env: {
        CORVIDINHO_WATCH_USERNAME: "corvid-agent",
        CORVIDINHO_GITHUB_ALLOW_REPOS: "CorvidLabs/Corvidinho",
        CORVIDINHO_GITHUB_ALLOW_USERS: "0xLeif",
        GITHUB_TOKEN: "",
        GH_TOKEN: "",
      },
      filePath: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_token");
  });

  test("missing username → missing_username", async () => {
    const r = await loadWatchConfig({
      env: {
        GITHUB_TOKEN: "fake",
        CORVIDINHO_GITHUB_ALLOW_REPOS: "CorvidLabs/Corvidinho",
      },
      filePath: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_username");
  });

  test("empty repos → empty_repos", async () => {
    const r = await loadWatchConfig({
      env: {
        GITHUB_TOKEN: "fake",
        CORVIDINHO_WATCH_USERNAME: "corvid-agent",
      },
      filePath: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("empty_repos");
  });

  test("token + username + repos loads", async () => {
    const r = await loadWatchConfig({
      env: {
        GITHUB_TOKEN: "fake-token",
        CORVIDINHO_WATCH_USERNAME: "corvid-agent",
        CORVIDINHO_GITHUB_ALLOW_REPOS: "CorvidLabs/Corvidinho",
        CORVIDINHO_GITHUB_ALLOW_USERS: "0xLeif",
        CORVIDINHO_WATCH_INTERVAL_MS: "45000",
      },
      filePath: null,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.mentionUsername).toBe("corvid-agent");
      expect(r.config.repos).toContain("corvidlabs/corvidinho");
      expect(r.config.intervalMs).toBe(45000);
    }
  });

  test("interval floors at 30000", async () => {
    const r = await loadWatchConfig({
      env: {
        GH_TOKEN: "fake",
        CORVIDINHO_WATCH_USERNAME: "bot",
        CORVIDINHO_GITHUB_ALLOW_ORGS: "CorvidLabs",
        CORVIDINHO_WATCH_INTERVAL_MS: "1000",
      },
      filePath: null,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config.intervalMs).toBe(30_000);
  });

  test("expandWatchRepos unions orgs as org/*", () => {
    const cfg = emptyConfig();
    cfg.github.orgs = ["CorvidLabs"];
    cfg.github.repos = ["Other/Repo"];
    const repos = expandWatchRepos(cfg);
    expect(repos).toContain("CorvidLabs/*");
    expect(repos).toContain("Other/Repo");
  });
});
