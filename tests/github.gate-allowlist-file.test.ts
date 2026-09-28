/**
 * GITHUB-6 / ALLOW-4 — the GitHub plugin repo gate reads the allowlist file
 * plus env overlays, the same loader WATCH ingress uses (REQ-plugins-253).
 * Regression for watch-github-1: deny lists in the file were ignored when the
 * allow list came from env, and a file-only allow list refused every repo.
 * Dry-run only (CORVIDINHO_GITHUB_DRY_RUN); no network, no tokens.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { checkRepoGateAsync } from "../src/plugins/githubDeny.ts";
import { checkRepoGateForActingRole } from "../src/plugins/githubPublic.ts";
import { runPlugin } from "../src/plugins/run.ts";

const KEYS = [
  "CORVIDINHO_ACTING_IS_ADMIN",
  "CORVIDINHO_ACTING_DISCORD_USER_ID",
  "CORVIDINHO_ALLOWLIST_FILE",
  "CORVIDINHO_GITHUB_ALLOW_REPOS",
  "CORVIDINHO_GITHUB_ALLOW_ORGS",
  "CORVIDINHO_GITHUB_ALLOW_USERS",
  "CORVIDINHO_GITHUB_DENY_REPOS",
  "CORVIDINHO_GITHUB_DENY_ORGS",
  "CORVIDINHO_GITHUB_DRY_RUN",
  "GITHUB_TOKEN",
  "GH_TOKEN",
] as const;

const DENY_FILE = `[github]\ndeny_repos = ["corvidlabs/secret"]\ndeny_orgs = ["evilorg"]\n`;
const ALLOW_FILE = `[github]\norgs = ["corvidlabs"]\n`;

let prev: Record<string, string | undefined> = {};
let tmp = "";

function writeAllowlist(text: string): string {
  const path = join(tmp, "allowlist.toml");
  writeFileSync(path, text, "utf8");
  process.env.CORVIDINHO_ALLOWLIST_FILE = path;
  return path;
}

beforeEach(() => {
  prev = {};
  for (const k of KEYS) {
    prev[k] = process.env[k];
    delete process.env[k];
  }
  tmp = mkdtempSync(join(tmpdir(), "gh-gate-file-"));
  // Missing until a test writes one; never the operator's ~/.config file.
  process.env.CORVIDINHO_ALLOWLIST_FILE = join(tmp, "no-allowlist.toml");
  process.env.CORVIDINHO_GITHUB_DRY_RUN = "1";
  loadBuiltins();
});

afterEach(() => {
  for (const k of KEYS) {
    if (prev[k] === undefined) delete process.env[k];
    else process.env[k] = prev[k];
  }
  rmSync(tmp, { recursive: true, force: true });
});

const WRITE_CALLS: Array<{ name: string; args: string[] }> = [
  { name: "github-issue-create", args: ["--title", "pwn"] },
  { name: "github-issue-comment", args: ["1", "--body", "hi"] },
  { name: "github-pr-create", args: ["--title", "t", "--head", "x", "--base", "main"] },
  { name: "github-pr-review", args: ["1", "--event", "COMMENT", "--body", "hi"] },
];

describe("GITHUB-6 gate reads the allowlist file + env (REQ-plugins-253)", () => {
  test("file-only deny wins over env-only allow at the gate", async () => {
    writeAllowlist(DENY_FILE);
    process.env.CORVIDINHO_GITHUB_ALLOW_ORGS = "corvidlabs,evilorg";

    const secret = await checkRepoGateForActingRole("corvidlabs/secret");
    expect(secret.ok).toBe(false);
    if (!secret.ok) expect(secret.error).toContain("is denied");

    const evil = await checkRepoGateForActingRole("evilorg/x");
    expect(evil.ok).toBe(false);
    if (!evil.ok) expect(evil.error).toContain("denied");

    expect((await checkRepoGateForActingRole("corvidlabs/ok")).ok).toBe(true);

    const sync = await checkRepoGateAsync("CorvidLabs/Secret");
    expect(sync.ok).toBe(false);
    expect((await checkRepoGateAsync("corvidlabs/ok")).ok).toBe(true);
  });

  test("github write plugins refuse file-denied repos and orgs (exit 3, nothing posted)", async () => {
    writeAllowlist(DENY_FILE);
    process.env.CORVIDINHO_GITHUB_ALLOW_ORGS = "corvidlabs,evilorg";
    for (const repo of ["corvidlabs/secret", "evilorg/x"]) {
      for (const c of WRITE_CALLS) {
        const r = await runPlugin({
          name: c.name,
          args: [...c.args, "--repo", repo],
          nonInteractive: true,
          allowlist: [c.name],
        });
        expect({ name: c.name, repo, ok: r.ok, exitCode: r.exitCode }).toEqual({
          name: c.name,
          repo,
          ok: false,
          exitCode: 3,
        });
        expect(r.error).toContain("GITHUB-6");
        expect(r.error).toContain("denied");
      }
    }
    // Read-side review plugins share the gate (plugins/github/review.ts).
    const diff = await runPlugin({
      name: "github-pr-diff",
      args: ["1", "--repo", "corvidlabs/secret"],
      nonInteractive: true,
      allowlist: [],
    });
    expect(diff.ok).toBe(false);
    expect(diff.exitCode).toBe(3);
  });

  test("file-denied repo stays denied for a community role session", async () => {
    writeAllowlist(DENY_FILE);
    process.env.CORVIDINHO_ACTING_IS_ADMIN = "0";
    process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = "999";
    const r = await checkRepoGateForActingRole("corvidlabs/secret", {
      visibilityLookup: async () => "public",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("is denied");
  });

  test("file-only allow list lets the plugin through; unlisted repo still refused", async () => {
    writeAllowlist(ALLOW_FILE);
    const ok = await runPlugin({
      name: "github-issue-create",
      args: ["--repo", "corvidlabs/ok", "--title", "fine"],
      nonInteractive: true,
      allowlist: ["github-issue-create"],
    });
    expect(ok.ok).toBe(true);
    expect(ok.data).toMatchObject({ dryRun: true, owner: "corvidlabs", repo: "ok" });

    const other = await runPlugin({
      name: "github-issue-create",
      args: ["--repo", "other/repo", "--title", "nope"],
      nonInteractive: true,
      allowlist: ["github-issue-create"],
    });
    expect(other.ok).toBe(false);
    expect(other.exitCode).toBe(3);
  });

  test("a malformed or unreadable allowlist file makes the gate refuse, even with an env allow list", async () => {
    // Truncated JSON, a multi-line TOML deny list missing its "]", and a
    // directory: the file's deny lists are unknown, so nothing is admitted —
    // not even by env allow (fail closed; never env-only, never a throw).
    const badJson = join(tmp, "allowlist.json");
    writeFileSync(badJson, `{"github": {"orgs": ["corvidlabs"], "deny_repos": ["corvidlabs/secret"]`, "utf8");
    const badToml = join(tmp, "broken.toml");
    writeFileSync(badToml, `[github]\norgs = ["corvidlabs"]\ndeny_repos = [\n  "corvidlabs/secret",\n`, "utf8");
    const unreadable = join(tmp, "is-a-dir");
    mkdirSync(unreadable);

    for (const path of [badJson, badToml, unreadable]) {
      process.env.CORVIDINHO_ALLOWLIST_FILE = path;
      for (const envAllow of [undefined, "corvidlabs"]) {
        if (envAllow) process.env.CORVIDINHO_GITHUB_ALLOW_ORGS = envAllow;
        else delete process.env.CORVIDINHO_GITHUB_ALLOW_ORGS;

        for (const repo of ["corvidlabs/ok", "corvidlabs/secret"]) {
          const gate = await checkRepoGateForActingRole(repo);
          expect({ path, envAllow, repo, ok: gate.ok }).toEqual({ path, envAllow, repo, ok: false });
          if (!gate.ok) {
            expect(gate.error).toStartWith("GITHUB-6: refused — allowlist file unreadable or malformed");
            expect(gate.error).toContain(path);
          }
          expect((await checkRepoGateAsync(repo)).ok).toBe(false);
        }
        const refused = await runPlugin({
          name: "github-issue-create",
          args: ["--repo", "corvidlabs/ok", "--title", "nope"],
          nonInteractive: true,
          allowlist: ["github-issue-create"],
        });
        expect({ path, envAllow, ok: refused.ok, exitCode: refused.exitCode }).toEqual({
          path,
          envAllow,
          ok: false,
          exitCode: 3,
        });
        expect(refused.error).toContain("allowlist file unreadable or malformed");
      }
    }

    // The TOML error names the line and key, never the list values.
    process.env.CORVIDINHO_ALLOWLIST_FILE = badToml;
    const toml = await checkRepoGateAsync("corvidlabs/ok");
    expect(toml.ok).toBe(false);
    if (!toml.ok) {
      expect(toml.error).toContain("line 3: [github].deny_repos");
      expect(toml.error).not.toContain("corvidlabs/secret");
    }
  });

  test("CLI plugins run honors ~/.config/corvidinho/allowlist.toml deny lists", () => {
    const home = join(tmp, "home");
    mkdirSync(join(home, ".config", "corvidinho"), { recursive: true });
    writeFileSync(join(home, ".config", "corvidinho", "allowlist.toml"), DENY_FILE, "utf8");
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v === undefined || (KEYS as readonly string[]).includes(k)) continue;
      env[k] = v;
    }
    env.HOME = home;
    env.CORVIDINHO_GITHUB_ALLOW_ORGS = "corvidlabs,evilorg";
    env.CORVIDINHO_GITHUB_DRY_RUN = "1";
    const cli = join(import.meta.dir, "..", "src", "cli.ts");
    const run = (args: string[]) => {
      const r = Bun.spawnSync([process.execPath, cli, "plugins", "run", ...args], {
        env,
        cwd: tmp,
        stdout: "pipe",
        stderr: "pipe",
      });
      return { code: r.exitCode, out: r.stdout.toString() };
    };
    const secret = run(["github-issue-create", "--json", "--", "--repo", "corvidlabs/secret", "--title", "pwn"]);
    expect(secret.code).toBe(3);
    expect(JSON.parse(secret.out)).toMatchObject({ ok: false });
    const evil = run(["github-issue-comment", "--json", "--", "1", "--repo", "evilorg/x", "--body", "hi"]);
    expect(evil.code).toBe(3);
    const fine = run(["github-issue-create", "--json", "--", "--repo", "corvidlabs/ok", "--title", "fine"]);
    expect(fine.code).toBe(0);
    expect(JSON.parse(fine.out)).toMatchObject({ ok: true, data: { dryRun: true, repo: "ok" } });
  });
});
