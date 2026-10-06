/**
 * `corvidinho doctor` reports what the bridge / WATCH / task run / daemon will
 * actually see (CLI-4, ALLOW-3/4, REQ-cli-003):
 * - channel / repo allowlists through the same loader (allowlist file + env,
 *   deny wins), naming the source, never the values;
 * - `[warn] llm` with the no-provider notice when no usable model is set
 *   (AGENT-10; there is no built-in default model or stub);
 * - `data-dir` exists / can be created and is writable;
 * - the project files in the current dir (`fledge.toml`, a verify lane with
 *   spec-check, `.specsync/`, `specs/`), shared with the report-only `init`.
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
import { dirname, join } from "node:path";

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
    CORVIDINHO_LLM_MODEL: "test-model",
    ...extra,
  });
}

const REPO_ROOT = join(import.meta.dir, "..");

/** `corvidinho <cmd>` in `cwd` (default: this checkout, a complete project). */
async function runCmd(
  cmd: "doctor" | "init",
  env: Record<string, string>,
  cwd: string = REPO_ROOT,
): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn([process.execPath, "--no-env-file", join(REPO_ROOT, "src", "cli.ts"), cmd], {
    cwd,
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

async function runDoctor(
  env: Record<string, string>,
  cwd?: string,
): Promise<{ code: number; out: string }> {
  return runCmd("doctor", env, cwd);
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

  test("a blank GITHUB_TOKEN / GH_TOKEN is missing for the Octokit plugins too, not [ok] github", async () => {
    const r = await runDoctor(
      readyEnv({
        GITHUB_TOKEN: "   ",
        GH_TOKEN: "\t",
        DISCORD_CHANNEL_IDS: CHANNEL,
        CORVIDINHO_GITHUB_ALLOW_REPOS: REPO,
      }),
    );
    expect(r.out).toContain("[missing] github: missing GITHUB_TOKEN or GH_TOKEN for Octokit plugins");
    expect(r.out).not.toContain("[ok] github:");
    expect(r.out).toContain("[missing] github-watch: WATCH needs GITHUB_TOKEN/GH_TOKEN");
    expect(r.code).toBe(1);

    // A blank GITHUB_TOKEN beside a real GH_TOKEN: the GH_TOKEN counts.
    const gh = await runDoctor(
      readyEnv({
        GITHUB_TOKEN: "   ",
        GH_TOKEN: GITHUB_TOKEN,
        DISCORD_CHANNEL_IDS: CHANNEL,
        CORVIDINHO_GITHUB_ALLOW_REPOS: REPO,
      }),
    );
    expect(gh.out).toContain("[ok] github: GITHUB_TOKEN/GH_TOKEN present for Octokit (value not shown)");
    expectNoValues(gh.out);
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

  test("no usable model provider: [warn] llm says so (AGENT-10) and does not change the exit code", async () => {
    // A model whose key is missing is not a provider.
    const env = readyEnv(allowEnv);
    delete env.CORVIDINHO_LLM_API_KEY;
    const r = await runDoctor(env);
    expect(r.out).toContain(
      "[warn] llm: No model provider is configured: test-model needs CORVIDINHO_LLM_API_KEY or OPENAI_API_KEY, which is not set.\n",
    );
    expect(r.code).toBe(0);
    // A key with no model is none either: there is no built-in default (AGENT-13).
    const keyOnly = readyEnv(allowEnv);
    delete keyOnly.CORVIDINHO_LLM_MODEL;
    const k = await runDoctor(keyOnly);
    expect(k.out).toContain(
      "[warn] llm: No model provider is configured: CORVIDINHO_LLM_MODEL is not set. Set CORVIDINHO_LLM_MODEL",
    );
    expect(k.out).not.toContain("gpt-4o-mini");
    expect(k.out).not.toContain("demo stub");
    expect(k.code).toBe(0);
    expectNoValues(r.out + k.out);
  }, 30_000);

  test("an LLM key (either name) shows [ok] llm without the value", async () => {
    const withCorvid = await runDoctor(readyEnv(allowEnv));
    expect(withCorvid.out).toContain(
      "[ok] llm: CORVIDINHO_LLM_API_KEY/OPENAI_API_KEY present (value not shown); model test-model @ api.openai.com\n",
    );
    const env = readyEnv({ ...allowEnv, OPENAI_API_KEY: LLM_KEY });
    delete env.CORVIDINHO_LLM_API_KEY;
    const withOpenai = await runDoctor(env);
    expect(withOpenai.out).toContain("[ok] llm: CORVIDINHO_LLM_API_KEY/OPENAI_API_KEY present (value not shown)");
    expectNoValues(withCorvid.out + withOpenai.out);
  }, 30_000);

  test("per-tier model keys (AGENT-5): [ok] llm names each tier's model, never the key", async () => {
    const plain = await runDoctor(readyEnv({ ...allowEnv, CORVIDINHO_LLM_MODEL: "big" }));
    expect(plain.out).toContain(
      "[ok] llm: CORVIDINHO_LLM_API_KEY/OPENAI_API_KEY present (value not shown); model big @ api.openai.com\n",
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
      "[ok] llm: CORVIDINHO_LLM_API_KEY/OPENAI_API_KEY present (value not shown); model big @ api.openai.com; per tier: read cheap, tool big, code big2",
    );
    expect(r.code).toBe(0);
    // CLI-4 / SAFE-8: under a cap, an unpriced read model warns now, not mid-run.
    const capped = await runDoctor(
      readyEnv({
        ...allowEnv,
        CORVIDINHO_DAILY_SPEND_CAP_USD: "5",
        CORVIDINHO_LLM_MODEL: "gpt-4o-mini",
        CORVIDINHO_LLM_MODEL_READ: "local-llama",
      }),
    );
    expect(capped.out).toContain("[warn] spend: $0.00 of $5.00 daily cap");
    expect(capped.out).toContain(
      'model "local-llama" has no known price, so read-tier runs stop and ask before calling the provider',
    );
    expect(capped.code).toBe(0);
    expectNoValues(plain.out + r.out + capped.out);
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

describe("project files: doctor and a report-only init name what is missing (CLI-4)", () => {
  const allowEnv = { DISCORD_CHANNEL_IDS: CHANNEL, CORVIDINHO_GITHUB_ALLOW_REPOS: REPO };
  let seq = 0;

  /** A fresh project dir holding `files` (path → text). */
  function project(files: Record<string, string> = {}): string {
    const dir = join(root, "projects", `p${++seq}`);
    mkdirSync(dir, { recursive: true });
    for (const [f, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, f)), { recursive: true });
      writeFileSync(join(dir, f), text);
    }
    return dir;
  }

  const VERIFY_WITH_SPEC_CHECK = [
    "[tasks.test]",
    'cmd = "bun test"',
    "",
    "[tasks.spec-check]",
    'cmd = "specsync check --require-coverage 100"',
    "",
    "[lanes.verify]",
    'steps = ["test", "spec-check"]',
    "",
  ].join("\n");

  /** fledge.toml (default: a verify lane with spec-check), .specsync/ and specs/. */
  function readyProject(fledgeToml = VERIFY_WITH_SPEC_CHECK, extra: Record<string, string> = {}): string {
    return project({
      "fledge.toml": fledgeToml,
      ".specsync/config.toml": 'specs_dir = "specs"\n',
      "specs/app/app.spec.md": "# App\n",
      ...extra,
    });
  }

  function missingLines(dir: string): string[] {
    return [
      `[missing] fledge.toml: not found in ${dir} — task run's verify gate (\`fledge lanes run verify\`) needs it; \`fledge run --init\` creates one`,
      "[missing] verify-lane: no verify lane — there is no fledge.toml to hold [lanes.verify]",
      `[missing] .specsync: not found in ${dir} — SpecSync has no project config (.specsync/config.toml) for spec-check; \`specsync init\` creates it`,
      `[missing] specs: not found in ${dir} — spec-check has no specs to hold the code to; \`specsync generate\` scaffolds them`,
    ];
  }

  function okLines(dir: string): string[] {
    return [
      `[ok] fledge.toml: found in ${dir}`,
      "[ok] verify-lane: [lanes.verify] runs spec-check",
      `[ok] .specsync: found in ${dir}`,
      `[ok] specs: found in ${dir}`,
    ];
  }

  function count(out: string, needle: string): number {
    return out.split(needle).length - 1;
  }

  test("doctor in a dir without project files names each missing one and exits 1", async () => {
    const dir = project();
    const r = await runDoctor(readyEnv(allowEnv), dir);
    for (const line of missingLines(dir)) expect(r.out).toContain(line);
    // Everything else passes: the four project items are the only failures.
    expect(count(r.out, "[missing]")).toBe(4);
    expect(r.out).toContain("One or more checks failed.");
    expect(r.code).toBe(1);
    // Report only: doctor creates nothing in the project dir.
    expect(readdirSync(dir)).toEqual([]);
    expectNoValues(r.out);
  }, 30_000);

  test("doctor in a complete project prints [ok] for each project item and passes", async () => {
    const dir = readyProject();
    const r = await runDoctor(readyEnv(allowEnv), dir);
    for (const line of okLines(dir)) expect(r.out).toContain(line);
    expect(r.out).not.toContain("[missing]");
    expect(r.out).toContain("All checks passed.");
    expect(r.code).toBe(0);
  }, 30_000);

  test("a fledge.toml that still sets verify_before_complete gets [warn] verify-gate: ignored, never fails (AGENT-14)", async () => {
    const dir = readyProject(`${VERIFY_WITH_SPEC_CHECK}\n[corvidinho]\nverify_before_complete = false\n`);
    const r = await runDoctor(readyEnv(allowEnv), dir);
    expect(r.out).toContain(
      "[warn] verify-gate: fledge.toml [corvidinho] verify_before_complete is ignored — verification can't be turned off (AGENT-14); remove the key",
    );
    expect(r.out).toContain("All checks passed.");
    expect(r.code).toBe(0);
    // Without the key there is no such line.
    const clean = await runDoctor(readyEnv(allowEnv), readyProject());
    expect(clean.out).not.toContain("verify-gate");
  }, 30_000);

  test("doctor in this checkout: its own fledge.toml, verify lane, .specsync/ and specs/ pass", async () => {
    const r = await runDoctor(readyEnv(allowEnv));
    for (const line of okLines(REPO_ROOT)) expect(r.out).toContain(line);
    expect(r.code).toBe(0);
  }, 30_000);

  test("init is report only: in an empty dir it names the missing model provider, Fledge, SpecSync and each missing project file, creates nothing, exits 1", async () => {
    const dir = project();
    const r = await runCmd("init", cleanEnv({}), dir);
    expect(r.out).toContain("corvidinho init (report only — creates nothing)");
    expect(r.out).toContain(
      "[warn] llm: No model provider is configured: CORVIDINHO_LLM_MODEL is not set.",
    );
    expect(r.out).toContain(`[ok] fledge: found at ${join(stubBin, "fledge")}`);
    expect(r.out).toContain(`[ok] specsync: found at ${join(stubBin, "specsync")}`);
    for (const line of missingLines(dir)) expect(r.out).toContain(line);
    expect(count(r.out, "[missing]")).toBe(4);
    expect(r.out).toContain("init created nothing");
    expect(r.out).toContain("Discord / GitHub keys and allowlists: run `corvidinho doctor`.");
    // The bridge / WATCH lines stay in doctor.
    expect(r.out).not.toContain("discord:");
    expect(r.out).not.toContain("Unknown command");
    expect(r.code).toBe(1);
    expect(readdirSync(dir)).toEqual([]);
  }, 30_000);

  test("init in a complete project with a model and its key exits 0 and says nothing is missing", async () => {
    const dir = readyProject();
    const before = readdirSync(dir).sort();
    const r = await runCmd("init", cleanEnv({ CORVIDINHO_LLM_API_KEY: LLM_KEY, CORVIDINHO_LLM_MODEL: "test-model" }), dir);
    expect(r.out).toContain("[ok] llm: CORVIDINHO_LLM_API_KEY/OPENAI_API_KEY present (value not shown)");
    for (const line of okLines(dir)) expect(r.out).toContain(line);
    expect(r.out).not.toContain("[missing]");
    expect(r.out).toContain("Nothing missing for task run in this project.");
    expect(r.code).toBe(0);
    expect(readdirSync(dir).sort()).toEqual(before);
    expectNoValues(r.out);
  }, 30_000);

  test("init names fledge and specsync missing from PATH", async () => {
    const emptyBin = join(root, "empty-bin");
    mkdirSync(emptyBin, { recursive: true });
    const r = await runCmd("init", cleanEnv({ PATH: emptyBin }), readyProject());
    expect(r.out).toContain("[missing] fledge: fledge not on PATH");
    expect(r.out).toContain("[missing] specsync: specsync not on PATH");
    expect(r.code).toBe(1);
  }, 30_000);

  test("the verify lane counts only when it runs spec-check (task, { task }, { run }, parallel, deps, imported lane)", async () => {
    const lane = async (dir: string): Promise<string> => {
      const r = await runCmd("init", cleanEnv({}), dir);
      return r.out.split("\n").find((l) => l.includes("] verify-lane:"))?.trim() ?? "";
    };
    const cases: Array<[string, string]> = [
      [
        readyProject('[tasks.test]\ncmd = "bun test"\n\n[lanes.verify]\nsteps = ["test", { run = "echo specsync checked" }]\n'),
        "[missing] verify-lane: [lanes.verify] has no spec-check step — task run would call work done without checking specs (AGENT-4 / SPECSYNC-2); add a spec-check task that runs `specsync check` to its steps",
      ],
      [
        readyProject('[tasks.test]\ncmd = "bun test"\n\n[lanes.ci]\nsteps = ["test"]\n'),
        "[missing] verify-lane: fledge.toml has no [lanes.verify] — task run's verify gate (`fledge lanes run verify`) fails without it",
      ],
      [
        readyProject('[tasks.test]\ncmd = "bun test"\n\n[lanes.verify]\nsteps = ["test", "spec-check"]\n'),
        "[missing] verify-lane: [lanes.verify] runs the spec-check task but fledge.toml defines no [tasks.spec-check] — the lane fails on it",
      ],
      // fledge refuses a lane that names an undefined task, spec-check or not.
      [
        readyProject(VERIFY_WITH_SPEC_CHECK.replace('steps = ["test", "spec-check"]', 'steps = ["lint", "test", "spec-check"]')),
        "[missing] verify-lane: [lanes.verify] needs task `lint`, which fledge.toml does not define — the lane fails on it every run",
      ],
      [
        readyProject('[tasks.spec-check]\ncmd = "specsync check"\ndeps = ["build"]\n\n[lanes.verify]\nsteps = ["spec-check"]\n'),
        "[missing] verify-lane: [lanes.verify] needs task `build`, which fledge.toml does not define — the lane fails on it every run",
      ],
      [
        readyProject('[lanes.verify]\nsteps = [{ run = "/usr/local/bin/specsync check" }, { run = "sh -c \'specsync check --strict\'" }]\n'),
        "[ok] verify-lane: [lanes.verify] runs spec-check",
      ],
      [
        readyProject('[lanes.verify]\nsteps = [{ run = "specsync check --strict" }]\n'),
        "[ok] verify-lane: [lanes.verify] runs spec-check",
      ],
      [
        readyProject('[tasks]\nlint = "tsc"\nspec-check = "specsync check"\n\n[lanes.verify]\nsteps = [{ parallel = ["lint", "spec-check"] }]\n'),
        "[ok] verify-lane: [lanes.verify] runs spec-check",
      ],
      [
        readyProject('[tasks.spec-check]\ncmd = "specsync check"\n\n[lanes.verify]\nsteps = [{ task = "spec-check", timeout = 600 }]\n'),
        "[ok] verify-lane: [lanes.verify] runs spec-check",
      ],
      [
        readyProject('[tasks.test]\ncmd = "bun test"\ndeps = ["specs"]\n\n[tasks.specs]\ncmd = "specsync check --require-coverage 100"\n\n[lanes.verify]\nsteps = ["test"]\n'),
        "[ok] verify-lane: [lanes.verify] runs spec-check",
      ],
      [
        readyProject('[tasks.test]\ncmd = "bun test"\n', {
          ".fledge/lanes/verify.toml":
            '[tasks.spec-check]\ncmd = "specsync check"\n\n[lanes.verify]\nsteps = ["test", "spec-check"]\n',
        }),
        "[ok] verify-lane: [lanes.verify] runs spec-check",
      ],
    ];
    const got = await Promise.all(cases.map(([dir]) => lane(dir)));
    expect(got).toEqual(cases.map(([, want]) => want));
  }, 60_000);

  test("a fledge.toml that is not TOML fails fledge.toml and verify-lane without printing its text; a .specsync file is not a directory", async () => {
    const dir = project({
      "fledge.toml": `token = "${GITHUB_TOKEN}"\n[lanes.verify\nsteps = ["${REPO}"]\n`,
      ".specsync": "not a dir\n",
      "specs/app/app.spec.md": "# App\n",
    });
    const r = await runDoctor(readyEnv(allowEnv), dir);
    expect(r.out).toContain(
      `[missing] fledge.toml: ${join(dir, "fledge.toml")} cannot be read or is not valid TOML — fledge cannot run its tasks or lanes`,
    );
    expect(r.out).toContain(
      "[missing] verify-lane: fledge.toml cannot be read or is not valid TOML — fledge cannot load the verify lane",
    );
    expect(r.out).toContain(`[missing] .specsync: ${join(dir, ".specsync")} is not a directory`);
    expect(r.out).toContain(`[ok] specs: found in ${dir}`);
    expect(r.code).toBe(1);
    expectNoValues(r.out);

    const imported = readyProject(VERIFY_WITH_SPEC_CHECK, { ".fledge/lanes/broken.toml": "[lanes\n" });
    // A FIFO is never opened (reading one would block doctor).
    const fifoDir = project({ ".specsync/config.toml": "", "specs/a/a.spec.md": "# A\n" });
    expect(Bun.spawnSync(["mkfifo", join(fifoDir, "fledge.toml")]).exitCode).toBe(0);
    const f = await runCmd("init", cleanEnv({}), fifoDir);
    expect(f.out).toContain(
      `[missing] fledge.toml: ${join(fifoDir, "fledge.toml")} cannot be read or is not valid TOML`,
    );
    expect(f.code).toBe(1);

    const i = await runCmd("init", cleanEnv({}), imported);
    expect(i.out).toContain(`[ok] fledge.toml: found in ${imported}`);
    expect(i.out).toContain(
      "[missing] verify-lane: .fledge/lanes/broken.toml cannot be read or is not valid TOML — fledge cannot load the verify lane",
    );
    expect(i.code).toBe(1);
  }, 30_000);

  test("from a subdirectory of a git project, init points at the project root that has the files instead of creating new ones", async () => {
    const top = readyProject(VERIFY_WITH_SPEC_CHECK, { ".git/HEAD": "ref: refs/heads/main\n" });
    const sub = join(top, "src");
    mkdirSync(sub);
    const r = await runCmd("init", cleanEnv({}), sub);
    const hint = `${top} (the project root) has it — run corvidinho there`;
    expect(r.out).toContain(
      `[missing] fledge.toml: not found in ${sub} — task run's verify gate (\`fledge lanes run verify\`) needs it; ${hint}`,
    );
    expect(r.out).toContain(
      `[missing] .specsync: not found in ${sub} — SpecSync has no project config (.specsync/config.toml) for spec-check; ${hint}`,
    );
    expect(r.out).toContain(`[missing] specs: not found in ${sub} — spec-check has no specs to hold the code to; ${hint}`);
    expect(r.out).not.toContain("fledge run --init");
    expect(r.out).not.toContain("specsync init");
    expect(r.code).toBe(1);
    expect(readdirSync(sub)).toEqual([]);

    // A root without the item keeps the creator command.
    const bare = project({ ".git/HEAD": "ref: refs/heads/main\n", "specs/a/a.spec.md": "# A\n" });
    mkdirSync(join(bare, "pkg"));
    const b = await runCmd("init", cleanEnv({}), join(bare, "pkg"));
    expect(b.out).toContain("`fledge run --init` creates one");
    expect(b.out).toContain("`specsync init` creates it");
    expect(b.out).toContain(`[missing] specs: not found in ${join(bare, "pkg")} — spec-check has no specs to hold the code to; ${bare} (the project root) has it`);
  }, 30_000);

  // CLI-4 / AGENT-15 (REQ-cli-430): a passing lane with no recognised test
  // summary fails closed, so a verify lane that visibly runs no recognised
  // runner is warned about now, not after every file-changing run fails.
  const TEST_STEP_WARN =
    "[warn] test-step: no [lanes.verify] step visibly runs a recognised test runner (`bun test`, jest, vitest, `cargo test`, pytest or `go test`) — if the lane prints none of their summaries, a run that changes files is never verified (AGENT-15)";

  const SPEC_CHECK_TASK_TOML = '[tasks.spec-check]\ncmd = "specsync check"\n\n';

  function testStepLines(out: string): string[] {
    return out
      .split("\n")
      .filter((l) => l.includes("test-step"))
      .map((l) => l.trim());
  }

  test("a verify lane that visibly runs no recognised test runner gets one [warn] test-step line in doctor and init; exit code unchanged, nothing created, file never printed", async () => {
    // Decoys: a wrapper (`npm test`), `bun run test`, a dep running
    // `node --test`, `jest-junit`, `bun tests/…`, file and script names
    // (`bun test.ts`, `bun test:unit`, `jest.config.js`, `pytest.ini`) and a
    // secret-looking value.
    const dir = readyProject(
      [
        "[tasks.test]",
        'cmd = "npm test"',
        `description = "${GITHUB_TOKEN}"`,
        'deps = ["unit"]',
        "",
        "[tasks.unit]",
        'cmd = "node --test"',
        "",
        "[tasks.report]",
        'cmd = "jest-junit && bun tests/run.ts"',
        "",
        "[tasks.names]",
        'cmd = "bun test.ts; bun test:unit; cat jest.config.js pytest.ini"',
        "",
        SPEC_CHECK_TASK_TOML,
        "[lanes.verify]",
        `steps = ["test", { run = "bun run test" }, { parallel = ["report", { run = "echo ${REPO}" }] }, "names", { task = "spec-check" }]`,
        "",
      ].join("\n"),
    );
    const before = readdirSync(dir).sort();

    const d = await runDoctor(readyEnv(allowEnv), dir);
    expect(testStepLines(d.out)).toEqual([TEST_STEP_WARN]);
    expect(d.out).toContain("[ok] verify-lane: [lanes.verify] runs spec-check");
    expect(d.out).not.toContain("[missing]");
    expect(d.out).toContain("All checks passed.");
    expect(d.code).toBe(0);
    expectNoValues(d.out);

    const i = await runCmd(
      "init",
      cleanEnv({ CORVIDINHO_LLM_API_KEY: LLM_KEY, CORVIDINHO_LLM_MODEL: "test-model" }),
      dir,
    );
    expect(testStepLines(i.out)).toEqual([TEST_STEP_WARN]);
    expect(i.out).not.toContain("[missing]");
    expect(i.out).toContain("Nothing missing for task run in this project.");
    expect(i.code).toBe(0);
    expectNoValues(i.out);
    for (const word of ["npm test", "node --test", "jest-junit", "bun run test", "test.ts", "jest.config"]) {
      expect(d.out + i.out).not.toContain(word);
    }

    // A lane with no spec-check and no test step: both lines, the warn adds no failure.
    const bare = readyProject('[lanes.verify]\nsteps = [{ run = "echo ok" }]\n');
    const b = await runCmd("init", cleanEnv({}), bare);
    expect(b.out).toContain("[missing] verify-lane: [lanes.verify] has no spec-check step");
    expect(testStepLines(b.out)).toEqual([TEST_STEP_WARN]);
    expect(count(b.out, "[missing]")).toBe(1);
    expect(b.code).toBe(1);

    expect(readdirSync(dir).sort()).toEqual(before);
  }, 60_000);

  test("no test-step line when a verify step runs a recognised runner (this checkout, { run }, deps, { task }, parallel, by path, quoted, imported lane)", async () => {
    const lines = async (dir: string): Promise<string[]> =>
      testStepLines((await runCmd("init", cleanEnv({}), dir)).out);
    const dirs: Array<[string, string]> = [
      ["this checkout (verify → test = bun test)", REPO_ROOT],
      ["the fixture lane (test = bun test)", readyProject()],
      [
        '{ run = "cargo test" }',
        readyProject(`${SPEC_CHECK_TASK_TOML}[lanes.verify]\nsteps = [{ run = "cargo test" }, "spec-check"]\n`),
      ],
      [
        "a step task whose deps run pytest",
        readyProject(
          `${SPEC_CHECK_TASK_TOML}[tasks.check]\ncmd = "echo done"\ndeps = ["py"]\n\n[tasks.py]\ncmd = "python -m pytest -q"\n\n[lanes.verify]\nsteps = ["check", "spec-check"]\n`,
        ),
      ],
      [
        "a lane imported from .fledge/lanes/",
        readyProject('[tasks.unit]\ncmd = "go test ./..."\n', {
          ".fledge/lanes/verify.toml": `${SPEC_CHECK_TASK_TOML}[lanes.verify]\nsteps = ["unit", "spec-check"]\n`,
        }),
      ],
      [
        "{ task } with a string task running vitest",
        readyProject('[tasks]\nunit = "npx vitest run"\nspec-check = "specsync check"\n\n[lanes.verify]\nsteps = [{ task = "unit" }, "spec-check"]\n'),
      ],
      [
        "a parallel { run } item running jest by path",
        readyProject(
          `${SPEC_CHECK_TASK_TOML}[lanes.verify]\nsteps = [{ parallel = ["spec-check", { run = "./node_modules/.bin/jest --ci" }] }]\n`,
        ),
      ],
      [
        "vitest's own bin by path",
        readyProject(`${SPEC_CHECK_TASK_TOML}[lanes.verify]\nsteps = [{ run = "node node_modules/vitest/vitest.mjs run" }, "spec-check"]\n`),
      ],
      [
        "a quoted sh -c 'bun test'",
        readyProject(`${SPEC_CHECK_TASK_TOML}[lanes.verify]\nsteps = [{ run = "sh -c 'bun  test --bail'" }, "spec-check"]\n`),
      ],
    ];
    const got = await Promise.all(dirs.map(async ([label, dir]) => [label, await lines(dir)]));
    expect(got).toEqual(dirs.map(([label]) => [label, []]));
  }, 60_000);

  test("with fledge.toml or [lanes.verify] absent or broken, the verify-lane [missing] line stands alone (no test-step line)", async () => {
    const cases: Array<[string, string]> = [
      [project(), "[missing] verify-lane: no verify lane — there is no fledge.toml to hold [lanes.verify]"],
      [
        readyProject('[tasks.lint]\ncmd = "tsc"\n\n[lanes.ci]\nsteps = ["lint"]\n'),
        "[missing] verify-lane: fledge.toml has no [lanes.verify]",
      ],
      [
        readyProject("[lanes.verify\nsteps = [\n"),
        "[missing] verify-lane: fledge.toml cannot be read or is not valid TOML — fledge cannot load the verify lane",
      ],
      [
        readyProject('[tasks.lint]\ncmd = "tsc"\n\n[lanes.verify]\nsteps = ["lint"]\n', {
          ".fledge/lanes/broken.toml": "[lanes\n",
        }),
        "[missing] verify-lane: .fledge/lanes/broken.toml cannot be read or is not valid TOML — fledge cannot load the verify lane",
      ],
      // A [lanes.verify] whose steps fledge refuses to load: none, empty, not
      // a list, not a table, or a step of no known shape.
      ...[
        '[lanes.verify]\ndescription = "no steps"\n',
        "[lanes.verify]\nsteps = []\n",
        '[lanes.verify]\nsteps = "spec-check"\n',
        '[lanes]\nverify = ["spec-check"]\n',
        "[lanes.verify]\nsteps = [{ foo = 1 }]\n",
      ].map((lane): [string, string] => [
        readyProject(`${SPEC_CHECK_TASK_TOML}${lane}`),
        "[missing] verify-lane: [lanes.verify] has no spec-check step",
      ]),
    ];
    const outs = await Promise.all(cases.map(([dir]) => runCmd("init", cleanEnv({}), dir)));
    outs.forEach((r, n) => {
      expect(r.out).toContain(cases[n]![1]);
      expect(r.out).not.toContain("test-step");
      expect(r.code).toBe(1);
    });
  }, 60_000);
});

describe("doctor warns about GitHub logins with no numeric id (IDENTITY-7.a)", () => {
  const OWNER_DC = "100000000000000001";
  const ADA_DC = "300000000000000003";
  const OWNER_LOGIN = "doctor-owner-login";
  const ADA_LOGIN = "doctor-ada-login";
  const TOFU_ID = "424242";

  test("the owner and a declared person with a GitHub login but no github_id get one [warn] line naming person ids only; exit code unchanged", async () => {
    const file = writeFile(
      "people-no-github-id.toml",
      `[discord]\nchannels = ["${CHANNEL}"]\n\n[github]\nrepos = ["${REPO}"]\n\n` +
        `[owner]\ndiscord_id = "${OWNER_DC}"\ngithub_login = "${OWNER_LOGIN}"\n\n` +
        `[people.ada]\ndiscord_ids = ["${ADA_DC}"]\ngithub_logins = ["${ADA_LOGIN}"]\n\n` +
        `[people.tofu]\ngithub_logins = ["tofu-login"]\ngithub_ids = ["${TOFU_ID}"]\n`,
    );
    const r = await runDoctor(readyEnv({ CORVIDINHO_ALLOWLIST_FILE: file }));
    expect(r.out).toContain(
      "[warn] people-github: ada, the owner: a GitHub login but no GitHub numeric id — on GitHub people match only by that id, so they read as undeclared (community) there until one is linked",
    );
    expect(r.out).toContain("/admin people link person:<id> github:<login> (IDENTITY-7.a)");
    expect(r.out).not.toContain("tofu");
    for (const v of [OWNER_DC, ADA_DC, OWNER_LOGIN, ADA_LOGIN, TOFU_ID]) expect(r.out).not.toContain(v);
    expectNoValues(r.out);
    expect(r.out).toContain("All checks passed.");
    expect(r.code).toBe(0);
  }, 30_000);

  test("[owner] github_id and github_ids on everyone with a login: no people-github line", async () => {
    const file = writeFile(
      "people-with-github-id.toml",
      `[discord]\nchannels = ["${CHANNEL}"]\n\n[github]\nrepos = ["${REPO}"]\n\n` +
        `[owner]\ndiscord_id = "${OWNER_DC}"\ngithub_login = "${OWNER_LOGIN}"\ngithub_id = "8268288"\n\n` +
        `[people.ada]\ndiscord_ids = ["${ADA_DC}"]\ngithub_logins = ["${ADA_LOGIN}"]\ngithub_ids = ["5151"]\n`,
    );
    const r = await runDoctor(readyEnv({ CORVIDINHO_ALLOWLIST_FILE: file }));
    expect(r.out).not.toContain("people-github");
    expect(r.code).toBe(0);
  }, 30_000);
});
