/**
 * `corvidinho doctor` reports what the bridge / WATCH / task run / daemon will
 * actually see (CLI-4, ALLOW-3/4, REQ-cli-003):
 * - channel / repo allowlists through the same loader (allowlist file + env,
 *   deny wins), naming the source, never the values;
 * - `[warn] llm` when no key is set (task run uses the demo stub);
 * - `data-dir` exists / can be created and is writable.
 * Runs the real CLI with a clean env (no operator secrets), stub fledge /
 * specsync on PATH, fake tokens; no network.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHANNEL = "123456789012345678";
const OTHER_CHANNEL = "876543210987654321";
const ORG = "doctor-fixture-org";
const REPO = `${ORG}/doctor-fixture-repo`;
const DISCORD_TOKEN = "discord-fixture-token-must-not-print";
const GITHUB_TOKEN = "ghp_doctorFixtureTokenMustNotPrint0000000";
const LLM_KEY = "sk-doctor-fixture-key-must-not-print";

let root = "";
let stubBin = "";
let dataDir = "";

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "corvidinho-doctor-truth-"));
  stubBin = join(root, "bin");
  mkdirSync(stubBin);
  for (const bin of ["fledge", "specsync"]) {
    const p = join(stubBin, bin);
    writeFileSync(p, "#!/bin/sh\nexit 0\n");
    chmodSync(p, 0o755);
  }
  dataDir = join(root, "data");
  mkdirSync(dataDir);
});

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

function writeFile(name: string, text: string): string {
  const p = join(root, name);
  writeFileSync(p, text);
  return p;
}

/** Clean env (like `env -i`): nothing from the operator's shell leaks in. */
function cleanEnv(extra: Record<string, string>): Record<string, string> {
  return {
    PATH: `${stubBin}:${process.env.PATH ?? ""}`,
    HOME: join(root, "home"),
    TMPDIR: tmpdir(),
    CORVIDINHO_DATA_DIR: dataDir,
    CORVIDINHO_ALLOWLIST_FILE: join(root, "no-allowlist.toml"),
    ...extra,
  };
}

/** Everything else doctor checks is set, so only the check under test decides. */
function readyEnv(extra: Record<string, string>): Record<string, string> {
  return cleanEnv({
    DISCORD_TOKEN,
    GITHUB_TOKEN,
    CORVIDINHO_WATCH_USERNAME: "corvid-agent",
    CORVIDINHO_LLM_API_KEY: LLM_KEY,
    ...extra,
  });
}

async function runDoctor(env: Record<string, string>): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn([process.execPath, "--no-env-file", "src/cli.ts", "doctor"], {
    cwd: join(import.meta.dir, ".."),
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, out, err] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { code, out: out + err };
}

function expectNoValues(out: string): void {
  const lower = out.toLowerCase();
  for (const v of [CHANNEL, OTHER_CHANNEL, REPO, ORG, DISCORD_TOKEN, GITHUB_TOKEN, LLM_KEY]) {
    expect(lower).not.toContain(v.toLowerCase());
  }
}

describe("doctor allowlists use the bridge / WATCH loader (defect 7)", () => {
  test("channels and repos only in the allowlist file pass, with source file, exit 0", async () => {
    const file = writeFile(
      "file-only.toml",
      `[discord]\nchannels = ["${CHANNEL}"]\n\n[github]\nrepos = ["${REPO}"]\n`,
    );
    const r = await runDoctor(readyEnv({ CORVIDINHO_ALLOWLIST_FILE: file }));
    expect(r.out).toContain(
      "[ok] discord: token + 1 allowlisted channel(s) from file (values not shown)",
    );
    expect(r.out).toContain(
      "[ok] github-watch: token + username + 1 allowlisted repo/org entry from file (values not shown)",
    );
    expect(r.out).not.toContain("[missing]");
    expect(r.out).toContain("All checks passed.");
    expect(r.code).toBe(0);
    expectNoValues(r.out);
  }, 30_000);

  test("env-only entries say env; file + env entries say file + env", async () => {
    const envOnly = await runDoctor(
      readyEnv({ DISCORD_CHANNEL_IDS: CHANNEL, CORVIDINHO_GITHUB_ALLOW_REPOS: REPO }),
    );
    expect(envOnly.out).toContain("[ok] discord: token + 1 allowlisted channel(s) from env");
    expect(envOnly.out).toContain("[ok] github-watch: token + username + 1 allowlisted repo/org entry from env");
    expect(envOnly.code).toBe(0);

    const file = writeFile(
      "file-and-env.toml",
      `[discord]\nchannels = ["${CHANNEL}"]\n\n[github]\nrepos = ["${REPO}"]\n`,
    );
    const both = await runDoctor(
      readyEnv({
        CORVIDINHO_ALLOWLIST_FILE: file,
        CORVIDINHO_DISCORD_ALLOW_CHANNELS: OTHER_CHANNEL,
        CORVIDINHO_GITHUB_ALLOW_ORGS: "another-fixture-org",
      }),
    );
    expect(both.out).toContain("[ok] discord: token + 2 allowlisted channel(s) from file + env");
    expect(both.out).toContain("[ok] github-watch: token + username + 2 allowlisted repo/org entries from file + env");
    expect(both.code).toBe(0);
    expectNoValues(envOnly.out + both.out);
  }, 30_000);

  test("deny wins: an allowlisted channel / repo that is also deny-listed does not count", async () => {
    // env deny over file allow (discord) and file deny over env allow (github).
    const file = writeFile(
      "deny.toml",
      `[discord]\nchannels = ["${CHANNEL}"]\n\n[github]\ndeny_repos = ["${REPO}"]\n`,
    );
    const r = await runDoctor(
      readyEnv({
        CORVIDINHO_ALLOWLIST_FILE: file,
        CORVIDINHO_DISCORD_DENY_CHANNELS: CHANNEL,
        CORVIDINHO_GITHUB_ALLOW_REPOS: REPO,
      }),
    );
    expect(r.out).toContain(
      "[missing] discord: token present but every allowlisted channel is also deny-listed (deny wins)",
    );
    expect(r.out).toContain(
      "[missing] github-watch: every allowlisted repo/org is also deny-listed (deny wins)",
    );
    expect(r.code).toBe(1);
    expectNoValues(r.out);
  }, 30_000);

  test("a malformed allowlist file fails discord and github-watch even with env allowlists (they refuse to start)", async () => {
    const file = writeFile("broken.toml", `[discord]\nchannels = ["${CHANNEL}"\n`);
    const r = await runDoctor(
      readyEnv({
        CORVIDINHO_ALLOWLIST_FILE: file,
        DISCORD_CHANNEL_IDS: CHANNEL,
        CORVIDINHO_GITHUB_ALLOW_REPOS: REPO,
      }),
    );
    expect(r.out).toContain("[fail] allowlist-file:");
    expect(r.out).toContain(
      "[missing] discord: token present but the allowlist file does not load (see allowlist-file) — the bridge refuses to start",
    );
    expect(r.out).toContain(
      "[missing] github-watch: the allowlist file does not load (see allowlist-file) — watch refuses to start",
    );
    expect(r.code).toBe(1);
    expectNoValues(r.out);
  }, 30_000);

  test("the default allowlist path (~/.config/corvidinho/allowlist.toml, no CORVIDINHO_ALLOWLIST_FILE) is read too", async () => {
    const home = join(root, "home-default");
    mkdirSync(join(home, ".config", "corvidinho"), { recursive: true });
    writeFileSync(
      join(home, ".config", "corvidinho", "allowlist.toml"),
      `[discord]\nchannels = ["${CHANNEL}"]\n\n[github]\norgs = ["${ORG}"]\n`,
    );
    const env = readyEnv({ HOME: home });
    delete env.CORVIDINHO_ALLOWLIST_FILE;
    const r = await runDoctor(env);
    expect(r.out).toContain("[ok] discord: token + 1 allowlisted channel(s) from file");
    expect(r.out).toContain("[ok] github-watch: token + username + 1 allowlisted repo/org entry from file");
    expect(r.code).toBe(0);
    expectNoValues(r.out);
  }, 30_000);

  test("a blank token or watch login is missing, as the bridge / watch trim them", async () => {
    const r = await runDoctor(
      readyEnv({
        DISCORD_TOKEN: "   ",
        GITHUB_TOKEN: " ",
        DISCORD_CHANNEL_IDS: CHANNEL,
        CORVIDINHO_GITHUB_ALLOW_REPOS: REPO,
      }),
    );
    expect(r.out).toContain("[missing] discord: missing DISCORD_TOKEN or DISCORD_BOT_TOKEN");
    expect(r.out).toContain("[missing] github-watch: WATCH needs GITHUB_TOKEN/GH_TOKEN");
    expect(r.code).toBe(1);

    const login = await runDoctor(
      readyEnv({
        CORVIDINHO_WATCH_USERNAME: "  ",
        DISCORD_CHANNEL_IDS: CHANNEL,
        CORVIDINHO_GITHUB_ALLOW_REPOS: REPO,
      }),
    );
    expect(login.out).toContain("[missing] github-watch: set CORVIDINHO_WATCH_USERNAME");
    expect(login.code).toBe(1);
  }, 30_000);

  test("a repo entry WATCH cannot use (not OWNER/REPO) is not reported as deny-listed", async () => {
    const r = await runDoctor(
      readyEnv({ DISCORD_CHANNEL_IDS: CHANNEL, CORVIDINHO_GITHUB_ALLOW_REPOS: "doctor-fixture-bare-name" }),
    );
    expect(r.out).toContain("[missing] github-watch: no allowlisted repo/org entry is usable");
    expect(r.out).not.toContain("every allowlisted repo/org is also deny-listed");
    expect(r.out).not.toContain("doctor-fixture-bare-name");
    expect(r.code).toBe(1);
  }, 30_000);

  test("no allowlist anywhere still reports the empty channel / repo lists", async () => {
    const r = await runDoctor(readyEnv({}));
    expect(r.out).toContain("[missing] discord: token present but channel allowlist empty");
    expect(r.out).toContain("[missing] github-watch: set CORVIDINHO_GITHUB_ALLOW_REPOS / ORGS");
    expect(r.code).toBe(1);
  }, 30_000);
});

describe("doctor checks the LLM key and the data dir (defect 8)", () => {
  const allowEnv = { DISCORD_CHANNEL_IDS: CHANNEL, CORVIDINHO_GITHUB_ALLOW_REPOS: REPO };

  test("no LLM key: [warn] llm names the demo stub and does not change the exit code", async () => {
    const env = readyEnv(allowEnv);
    delete env.CORVIDINHO_LLM_API_KEY;
    const r = await runDoctor(env);
    expect(r.out).toContain(
      "[warn] llm: no CORVIDINHO_LLM_API_KEY or OPENAI_API_KEY — task run uses the demo stub",
    );
    expect(r.code).toBe(0);
  }, 30_000);

  test("an LLM key (either name) shows [ok] llm without the value", async () => {
    const withCorvid = await runDoctor(readyEnv(allowEnv));
    expect(withCorvid.out).toContain("[ok] llm: CORVIDINHO_LLM_API_KEY/OPENAI_API_KEY present (value not shown)");
    const env = readyEnv({ ...allowEnv, OPENAI_API_KEY: LLM_KEY });
    delete env.CORVIDINHO_LLM_API_KEY;
    const withOpenai = await runDoctor(env);
    expect(withOpenai.out).toContain("[ok] llm: CORVIDINHO_LLM_API_KEY/OPENAI_API_KEY present (value not shown)");
    expectNoValues(withCorvid.out + withOpenai.out);
  }, 30_000);

  test("per-tier model keys (AGENT-5): [ok] llm names each tier's model, never the key", async () => {
    const plain = await runDoctor(readyEnv({ ...allowEnv, CORVIDINHO_LLM_MODEL: "big" }));
    expect(plain.out).toContain(
      "[ok] llm: CORVIDINHO_LLM_API_KEY/OPENAI_API_KEY present (value not shown); model big\n",
    );
    const r = await runDoctor(
      readyEnv({
        ...allowEnv,
        CORVIDINHO_LLM_MODEL: "big",
        CORVIDINHO_LLM_MODEL_READ: "cheap",
        CORVIDINHO_LLM_MODEL_CODE: "big2",
      }),
    );
    expect(r.out).toContain(
      "[ok] llm: CORVIDINHO_LLM_API_KEY/OPENAI_API_KEY present (value not shown); model big; per tier: read cheap, tool big, code big2",
    );
    expect(r.code).toBe(0);
    expectNoValues(plain.out + r.out);
  }, 30_000);

  test("a writable data dir is [ok]", async () => {
    const r = await runDoctor(readyEnv(allowEnv));
    expect(r.out).toContain(`[ok] data-dir: ${dataDir} exists and is writable`);
    expect(r.code).toBe(0);
  }, 30_000);

  test("a data dir that does not exist yet under a writable parent is [info] and doctor does not create it", async () => {
    const missing = join(root, "not-yet", "data");
    const r = await runDoctor(readyEnv({ ...allowEnv, CORVIDINHO_DATA_DIR: missing }));
    expect(r.out).toContain(`[info] data-dir: ${missing} does not exist yet — created on first use`);
    expect(r.code).toBe(0);
    expect(existsSync(join(root, "not-yet"))).toBe(false);
  }, 30_000);

  test("a data dir that cannot be created or is a file is [fail] and doctor exits 1", async () => {
    const blocker = writeFile("blocker-file", "x");
    const under = join(blocker, "data");
    const r = await runDoctor(readyEnv({ ...allowEnv, CORVIDINHO_DATA_DIR: under }));
    expect(r.out).toContain(`[fail] data-dir: ${under} cannot be created (${blocker} is not a directory)`);
    expect(r.out).toContain("set CORVIDINHO_DATA_DIR to a writable directory");
    expect(r.code).toBe(1);

    const asFile = await runDoctor(readyEnv({ ...allowEnv, CORVIDINHO_DATA_DIR: blocker }));
    expect(asFile.out).toContain(`[fail] data-dir: ${blocker} is not a directory`);
    expect(asFile.code).toBe(1);
  }, 30_000);

  test("a data dir that is a symlink to nothing is [fail] (mkdir -p fails on it), not creatable", async () => {
    const link = join(root, "dangling-data");
    symlinkSync(join(root, "no-such-target"), link);
    const r = await runDoctor(readyEnv({ ...allowEnv, CORVIDINHO_DATA_DIR: link }));
    expect(r.out).toContain(`[fail] data-dir: ${link} is a symlink to a path that does not exist`);
    expect(r.code).toBe(1);

    const under = join(link, "data");
    const nested = await runDoctor(readyEnv({ ...allowEnv, CORVIDINHO_DATA_DIR: under }));
    expect(nested.out).toContain(
      `[fail] data-dir: ${under} cannot be created (${link} is a symlink to a path that does not exist)`,
    );
    expect(nested.code).toBe(1);
  }, 30_000);

  // Root writes through mode bits, so this only runs as a normal user (CI).
  test.skipIf(process.getuid?.() === 0)(
    "a data dir that exists but is not writable is [fail] and doctor exits 1; the probe leaves nothing",
    async () => {
      const ro = join(root, "read-only-data");
      mkdirSync(ro);
      chmodSync(ro, 0o555);
      try {
        const r = await runDoctor(readyEnv({ ...allowEnv, CORVIDINHO_DATA_DIR: ro }));
        expect(r.out).toContain(`[fail] data-dir: ${ro} is not writable (EACCES)`);
        expect(r.code).toBe(1);
      } finally {
        chmodSync(ro, 0o755);
      }
      expect(readdirSync(ro)).toEqual([]);
    },
    30_000,
  );

  test("the writable probe leaves nothing behind in the data dir", async () => {
    const clean = join(root, "probe-clean");
    mkdirSync(clean);
    const r = await runDoctor(readyEnv({ ...allowEnv, CORVIDINHO_DATA_DIR: clean }));
    expect(r.out).toContain(`[ok] data-dir: ${clean} exists and is writable`);
    expect(readdirSync(clean)).toEqual([]);
  }, 30_000);
});
