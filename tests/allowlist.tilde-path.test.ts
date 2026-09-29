/**
 * ALLOW-4 / GITHUB-6 — a leading `~` in CORVIDINHO_ALLOWLIST_FILE means HOME
 * (REQ-plugins-006). Bun's .env loader keeps `~` literally, so the documented
 * `.env.example` value `~/.config/corvidinho/allowlist.toml` used to be a
 * cwd-relative path that never exists: the file's deny lists and `[owner]`
 * were dropped with no error while env allow lists still admitted targets.
 * Temp HOME only; never the operator's file. No network, no tokens.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadAllowlist,
  resolveAllowlistPath,
  tryLoadAllowlist,
} from "../src/allowlist/load.ts";
import { resolveAdminAllowlistPath } from "../src/discord/admin-allowlist.ts";
import { loadDoctorAllowlist } from "../src/doctor.ts";
import { loadOwnerConfig } from "../src/identity/owner.ts";
import { emptyConfig } from "../src/allowlist/types.ts";

const REPO = join(import.meta.dir, "..");
const TILDE = "~/.config/corvidinho/allowlist.toml";
const FILE_TEXT =
  `[github]\norgs = ["corvidlabs"]\ndeny_repos = ["corvidlabs/secret"]\n` +
  `[discord]\nchannels = ["c1"]\ndeny_users = ["666"]\n` +
  `[owner]\ndiscord_id = "123456789012345678"\n`;

let tmp = "";
let home = "";
let file = "";

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "allowlist-tilde-"));
  home = join(tmp, "home");
  file = join(home, ".config", "corvidinho", "allowlist.toml");
  mkdirSync(join(home, ".config", "corvidinho"), { recursive: true });
  writeFileSync(file, FILE_TEXT, "utf8");
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("resolveAllowlistPath expands a leading ~ (REQ-plugins-006)", () => {
  test("~/… and a bare ~ resolve against home; surrounding space is trimmed", () => {
    expect(resolveAllowlistPath({ CORVIDINHO_ALLOWLIST_FILE: TILDE }, home)).toBe(file);
    expect(resolveAllowlistPath({ CORVIDINHO_ALLOWLIST_FILE: "~" }, home)).toBe(home);
    expect(resolveAllowlistPath({ CORVIDINHO_ALLOWLIST_FILE: "~/" }, home)).toBe(home);
    expect(resolveAllowlistPath({ CORVIDINHO_ALLOWLIST_FILE: `  ${TILDE}  ` }, home)).toBe(file);
  });

  test("~user, absolute, relative and inner-~ paths are used as written", () => {
    for (const p of [
      "~other/allowlist.toml",
      "~other",
      "/etc/corvidinho/allowlist.toml",
      "config/allowlist.toml",
      "./~/allowlist.toml",
      "a/~/allowlist.toml",
    ]) {
      expect(resolveAllowlistPath({ CORVIDINHO_ALLOWLIST_FILE: p }, home)).toBe(p);
    }
  });

  test("the ~ value reads the same file as the default path", () => {
    expect(resolveAllowlistPath({}, home)).toBe(file);
    expect(resolveAllowlistPath({ CORVIDINHO_ALLOWLIST_FILE: TILDE }, home)).toBe(
      resolveAllowlistPath({}, home),
    );
  });
});

describe("every allowlist file reader follows the expanded path", () => {
  test("loadAllowlist keeps the file's deny lists when the path starts with ~/", async () => {
    const cfg = await loadAllowlist({
      env: { CORVIDINHO_ALLOWLIST_FILE: TILDE, CORVIDINHO_GITHUB_ALLOW_ORGS: "corvidlabs" },
      home,
    });
    expect(cfg.sourcePath).toBe(file);
    expect(cfg.github.denyRepos).toEqual(["corvidlabs/secret"]);
    expect(cfg.discord.denyUsers).toEqual(["666"]);
    expect(cfg.discord.channels).toEqual(["c1"]);
  });

  test("a malformed file behind ~/ fails closed instead of env overlays only", async () => {
    writeFileSync(file, `[github]\ndeny_repos = ["corvidlabs/secret"\n`, "utf8");
    const r = await tryLoadAllowlist({
      env: { CORVIDINHO_ALLOWLIST_FILE: TILDE, CORVIDINHO_GITHUB_ALLOW_ORGS: "corvidlabs" },
      home,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain(file);
      expect(r.error).not.toContain("corvidlabs/secret");
    }
  });

  test("a missing file behind ~/ still means env overlays only", async () => {
    rmSync(file);
    const cfg = await loadAllowlist({
      env: { CORVIDINHO_ALLOWLIST_FILE: TILDE, CORVIDINHO_GITHUB_ALLOW_ORGS: "corvidlabs" },
      home,
    });
    expect(cfg.sourcePath).toBeNull();
    expect(cfg.github.orgs).toEqual(["corvidlabs"]);
    expect(cfg.github.denyRepos).toEqual([]);
  });

  test("the owner loader reads [owner] from the ~/ path", async () => {
    const r = await loadOwnerConfig({ env: { CORVIDINHO_ALLOWLIST_FILE: TILDE }, home });
    expect(r.owner?.discordId).toBe("123456789012345678");
  });

  test("doctor reads the ~/ path as the allowlist file", async () => {
    const r = await loadDoctorAllowlist({ CORVIDINHO_ALLOWLIST_FILE: TILDE }, home);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.file?.sourcePath).toBe(file);
      expect(r.merged.github.denyRepos).toEqual(["corvidlabs/secret"]);
    }
  });

  test("/admin writes to the expanded path, never a literal ./~ dir in cwd", () => {
    const env = { CORVIDINHO_ALLOWLIST_FILE: TILDE, HOME: home };
    expect(resolveAdminAllowlistPath(emptyConfig(), env, home)).toBe(file);
  });
});

describe("the documented .env.example line, uncommented, in a project .env", () => {
  test("keeps the file's deny list at the GITHUB-6 gate (Bun keeps ~ literally)", () => {
    const example = readFileSync(join(REPO, ".env.example"), "utf8");
    const line = example
      .split("\n")
      .find((l) => /^#\s*CORVIDINHO_ALLOWLIST_FILE=~\//.test(l));
    expect(line).toBeDefined();
    const project = join(tmp, "project");
    mkdirSync(project);
    writeFileSync(join(project, ".env"), `${line!.replace(/^#\s*/, "")}\n`, "utf8");

    const script = `
      import { loadAllowlist } from ${JSON.stringify(join(REPO, "src/allowlist/load.ts"))};
      import { checkRepoGateAsync } from ${JSON.stringify(join(REPO, "src/plugins/githubDeny.ts"))};
      const cfg = await loadAllowlist({ env: process.env });
      const denied = await checkRepoGateAsync("corvidlabs/secret");
      const allowed = await checkRepoGateAsync("corvidlabs/open");
      console.log(JSON.stringify({
        raw: process.env.CORVIDINHO_ALLOWLIST_FILE,
        sourcePath: cfg.sourcePath,
        denied,
        allowed,
      }));
    `;
    const r = Bun.spawnSync([process.execPath, "-e", script], {
      cwd: project,
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        HOME: home,
        CORVIDINHO_GITHUB_ALLOW_ORGS: "corvidlabs",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(r.stderr.toString()).toBe("");
    expect(r.exitCode).toBe(0);
    const out = JSON.parse(r.stdout.toString().trim()) as {
      raw: string;
      sourcePath: string | null;
      denied: { ok: boolean; error?: string };
      allowed: { ok: boolean };
    };
    expect(out.raw).toBe(TILDE);
    expect(out.sourcePath).toBe(file);
    expect(out.denied.ok).toBe(false);
    expect(out.denied.error).toContain("GITHUB-6");
    expect(out.allowed.ok).toBe(true);
    expect(existsSync(join(project, "~"))).toBe(false);
  });
});
