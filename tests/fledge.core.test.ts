/**
 * Fledge itself as typed builtins (PLUGIN-1 / PLUGIN-2 / SAFE-1, REQ-plugins-461).
 *
 * `fledge-lanes-list` / `fledge-lanes-validate` (read-only) and
 * `fledge-lanes-run` / `fledge-run` (dangerous, code tier) wrap the local
 * fledge CLI in the project root. A fake `fledge` shell script on a temp PATH
 * records its argv, cwd and env; the real-fledge tests run only where fledge
 * is installed (CI has none).
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createTaskExecute } from "../src/agent/index.ts";
import { buildOpenAiTools } from "../src/agent/tools.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry, get, list, register } from "../src/plugins/registry.ts";
import { runPlugin } from "../src/plugins/run.ts";
import {
  FLEDGE_CORE_COMMAND_NAMES,
  fledgeCoreCommands,
  resolveFledgeBin,
  type FledgeCoreOptions,
} from "../plugins/fledge/core.ts";
import {
  fledgeStatusLines,
  loadFledgePlugins,
  resetFledgeDiscovery,
} from "../plugins/fledge/index.ts";
import type { PluginHandlerArgs, PluginHandlerResult } from "../src/plugins/types.ts";

const READS = ["fledge-lanes-list", "fledge-lanes-validate"];
const RUNS = ["fledge-lanes-run", "fledge-run"];

const FAKE_FLEDGE = `#!/bin/sh
dir="$(dirname "$0")"
{
  for a in "$@"; do printf '[%s]' "$a"; done
  echo
} >> "$dir/argv.log"
echo "cwd=$(pwd -P)" > "$dir/last.env"
echo "gh=\${GITHUB_TOKEN:+set} dc=\${DISCORD_TOKEN:+set} ai=\${OPENAI_API_KEY:+set} llm=\${CORVIDINHO_LLM_API_KEY:+set} audit=\${CORVIDINHO_AUDIT_HMAC_KEY:+set} acting=\${CORVIDINHO_ACTING_DISCORD_USER_ID:+set} cdpath=\${CDPATH:+set} oldpwd=\${OLDPWD:+set} fni=\${FLEDGE_NON_INTERACTIVE} root=\${CORVIDINHO_PROJECT_ROOT} keep=\${KEEP_ME}" >> "$dir/last.env"
echo "creds ghtoken=\${GH_TOKEN:+set} askpass=\${GIT_ASKPASS:+set} sshsock=\${SSH_AUTH_SOCK:+set} gcglobal=\${GIT_CONFIG_GLOBAL} gcnosystem=\${GIT_CONFIG_NOSYSTEM} prompt=\${GIT_TERMINAL_PROMPT} gccount=\${GIT_CONFIG_COUNT} helperkey=\${GIT_CONFIG_KEY_0} helperval=[\${GIT_CONFIG_VALUE_0}] ghdir=\${GH_CONFIG_DIR} hosts=$([ -e "\${GH_CONFIG_DIR:-/nonexistent}/hosts.yml" ] && echo yes || echo no) helpers=[$(git config --get-all credential.helper 2>/dev/null | tr '\\n' ',')] sshcmd=\${GIT_SSH_COMMAND}" >> "$dir/last.env"
[ "$1" = "--non-interactive" ] && shift
if [ "$1 $2" = "lanes list" ]; then
  [ -f "$dir/list.exit" ] && { echo "error: No fledge.toml found in current directory." >&2; exit "$(cat "$dir/list.exit")"; }
  cat "$dir/list.json"; exit 0
fi
if [ "$1 $2" = "lanes validate" ]; then
  cat "$dir/validate.json"
  [ -f "$dir/validate.exit" ] && { echo "error: Validation failed" >&2; exit "$(cat "$dir/validate.exit")"; }
  exit 0
fi
if [ "$1 $2" = "lanes run" ] || [ "$1" = "run" ]; then
  echo "ran $*"
  [ -f "$dir/run.secret" ] && cat "$dir/run.secret"
  [ -f "$dir/run.sleep" ] && exec sleep "$(cat "$dir/run.sleep")"
  [ -f "$dir/run.exit" ] && { echo "error: Task failed" >&2; exit "$(cat "$dir/run.exit")"; }
  exit 0
fi
echo "unexpected: $*" >&2
exit 2
`;

const LANES = {
  schema_version: 1,
  lanes: [
    { name: "ci", description: "CI pipeline", fail_fast: true, step_count: 3, trust_tier: "local" },
    { name: "verify", description: "Required gate\u001b[31m", fail_fast: true, step_count: 4, trust_tier: "local" },
  ],
};

const VALID = { schema_version: 1, path: "/somewhere", lane_count: 2, errors: [], warnings: [] };
const INVALID = {
  schema_version: 1,
  path: "/somewhere",
  lane_count: 2,
  errors: ["Lane 'broken' step 1 references undefined task 'nosuch'"],
  warnings: ["Lane 'broken' has no description"],
};

type Fake = { bin: string; project: string; env: NodeJS.ProcessEnv };
const temps: string[] = [];

function makeFake(files: Record<string, string> = {}): Fake {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "corvidinho-fledge-core-")));
  temps.push(root);
  const bin = join(root, "bin");
  const project = join(root, "project");
  mkdirSync(bin);
  mkdirSync(project);
  writeFileSync(join(bin, "fledge"), FAKE_FLEDGE);
  chmodSync(join(bin, "fledge"), 0o755);
  writeFileSync(join(bin, "list.json"), JSON.stringify(LANES));
  writeFileSync(join(bin, "validate.json"), JSON.stringify(VALID));
  for (const [k, v] of Object.entries(files)) writeFileSync(join(bin, k), v);
  return {
    bin,
    project,
    env: {
      PATH: `${bin}:/usr/bin:/bin`,
      GITHUB_TOKEN: "gh-secret-value",
      DISCORD_TOKEN: "discord-secret-value",
      OPENAI_API_KEY: "openai-secret-value",
      CORVIDINHO_LLM_API_KEY: "llm-secret-value",
      CORVIDINHO_AUDIT_HMAC_KEY: "audit-secret-value",
      CORVIDINHO_ACTING_DISCORD_USER_ID: "42",
      CDPATH: "/tmp",
      OLDPWD: "/tmp",
      KEEP_ME: "kept",
    },
  };
}

afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
  clearRegistry();
  resetFledgeDiscovery();
});

const argvLog = (fake: Fake): string[] =>
  existsSync(join(fake.bin, "argv.log"))
    ? readFileSync(join(fake.bin, "argv.log"), "utf8").trim().split("\n").filter(Boolean)
    : [];
const lastEnv = (fake: Fake) => readFileSync(join(fake.bin, "last.env"), "utf8");

function cmd(name: string, opts: FledgeCoreOptions) {
  const c = fledgeCoreCommands(opts).find((x) => x.name === name);
  if (!c) throw new Error(`no ${name}`);
  return c;
}

function call(
  name: string,
  fake: Fake,
  args: string[],
  extra: Partial<PluginHandlerArgs> = {},
  opts: FledgeCoreOptions = {},
): Promise<PluginHandlerResult> {
  return cmd(name, { env: fake.env, ...opts }).handler({
    args,
    cwd: fake.project,
    json: false,
    nonInteractive: false,
    allowlist: new Set(),
    ...extra,
  });
}

/** Registry holds the Fledge core commands bound to the fake's env. */
function registerFake(fake: Fake): void {
  clearRegistry();
  for (const c of fledgeCoreCommands({ env: fake.env })) register(c);
}

beforeEach(() => {
  clearRegistry();
  resetFledgeDiscovery();
});

describe("Fledge itself is a set of typed builtins (PLUGIN-1, REQ-plugins-461)", () => {
  test("loadBuiltins registers the four Fledge core commands with honest danger and tier", () => {
    loadBuiltins();
    const byName = Object.fromEntries(list().map((e) => [e.name, e]));
    for (const n of READS) {
      expect(byName[n]).toMatchObject({ dangerous: false, mutating: false, minTier: 0 });
    }
    for (const n of RUNS) {
      expect(byName[n]).toMatchObject({ dangerous: true, mutating: true, minTier: 2 });
    }
    expect([...FLEDGE_CORE_COMMAND_NAMES].sort() as string[]).toEqual([...READS, ...RUNS].sort());
    for (const n of FLEDGE_CORE_COMMAND_NAMES) {
      expect(get(n)!.origin ?? "builtin").toBe("builtin");
    }
  });

  test("tool catalog: reads at tool tier; runs only at code tier with dangerous tools, ADMIN only", () => {
    loadBuiltins();
    const names = (o: Parameters<typeof buildOpenAiTools>[0]) =>
      buildOpenAiTools(o).map((t) => t.function.name);
    const tool = names({ tier: "tool" });
    for (const n of READS) expect(tool).toContain(n);
    for (const n of RUNS) expect(tool).not.toContain(n);
    const codeSafe = names({ tier: "code" });
    for (const n of RUNS) expect(codeSafe).not.toContain(n);
    const toolDanger = names({ tier: "tool", includeDangerous: true });
    for (const n of RUNS) expect(toolDanger).not.toContain(n);
    const codeDanger = names({ tier: "code", includeDangerous: true });
    for (const n of [...READS, ...RUNS]) expect(codeDanger).toContain(n);
    const nonAdmin = names({ tier: "code", includeDangerous: true, actingIsAdmin: false });
    for (const n of READS) expect(nonAdmin).toContain(n);
    for (const n of RUNS) expect(nonAdmin).not.toContain(n);
    expect(names({ tier: "read" })).toEqual([]);
  });

  test("a Fledge plugin command named run or lanes-list is skipped; the builtin keeps the name", async () => {
    loadBuiltins();
    const builtinRun = get("fledge-run");
    const fake = makeFake({
      "list.json": JSON.stringify(LANES),
    });
    // Plugin discovery reads `plugins list`; give the fake one that has colliding names.
    writeFileSync(
      join(fake.bin, "fledge"),
      FAKE_FLEDGE.replace(
        'if [ "$1 $2" = "lanes list" ]',
        `if [ "$1 $2" = "plugins list" ]; then echo '{"schema_version":1,"plugins":[{"name":"p","version":"1","commands":["run","lanes-list","hello"],"trust_tier":"unverified","runtime":"native"}]}'; exit 0; fi
if [ "$1 $2" = "plugins audit" ]; then exit 1; fi
if [ "$1 $2" = "lanes list" ]`,
      ),
    );
    const report = await loadFledgePlugins({ cwd: fake.project, env: fake.env });
    expect(report.registered).toEqual(["fledge-hello"]);
    expect(report.skipped).toEqual([
      { name: "fledge-run", reason: "name already registered by builtin" },
      { name: "fledge-lanes-list", reason: "name already registered by builtin" },
    ]);
    expect(get("fledge-run")).toBe(builtinRun);
    expect(fledgeStatusLines(report).join("\n")).toContain(
      "skipped fledge-run: name already registered by builtin",
    );
  });
});

describe("default tool catalog (REQ-agent-112)", () => {
  test("a default-catalog run offers the two reads and starts no fledge process", async () => {
    loadBuiltins();
    const fake = makeFake();
    let offered: string[] = [];
    const fetchImpl = async (_i: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { tools?: { function: { name: string } }[] };
      offered = (body.tools ?? []).map((t) => t.function.name);
      return Response.json({ choices: [{ message: { role: "assistant", content: "ok" } }] });
    };
    const exec = createTaskExecute({
      taskText: "x",
      cwd: fake.project,
      env: { ...fake.env, CORVIDINHO_LLM_API_KEY: "k", CORVIDINHO_LLM_MODEL: "test-model", CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1" },
      fetchImpl,
      tier: "code",
      maxToolRounds: 2,
    });
    await exec({ attempt: 1, signal: new AbortController().signal });
    expect(offered.filter((n) => n.startsWith("fledge-")).sort()).toEqual(READS);
    expect(argvLog(fake)).toEqual([]);
  });
});

describe("fledge-lanes-list / fledge-lanes-validate (read-only)", () => {
  test("lanes list: fledge's own command with --json in the project root; typed lanes back", async () => {
    const fake = makeFake();
    const r = await call("fledge-lanes-list", fake, []);
    expect(r.ok).toBe(true);
    expect(argvLog(fake)).toEqual(["[--non-interactive][lanes][list][--json]"]);
    expect(lastEnv(fake)).toContain(`cwd=${fake.project}`);
    expect(r.data).toEqual({
      count: 2,
      lanes: [
        { name: "ci", description: "CI pipeline", steps: 3, failFast: true, trustTier: "local" },
        { name: "verify", description: "Required gate [31m", steps: 4, failFast: true, trustTier: "local" },
      ],
    });
    expect(r.message).toContain("2 lane(s)");
    expect(r.message).toContain("- verify (4 steps): Required gate");
  });

  test("lanes list: args are a usage error and nothing is spawned; a fledge error is reported", async () => {
    const fake = makeFake();
    const bad = await call("fledge-lanes-list", fake, ["--init"]);
    expect(bad.ok).toBe(false);
    expect(bad.exitCode).toBe(1);
    expect(bad.error).toContain("usage: fledge-lanes-list");
    expect(argvLog(fake)).toEqual([]);

    const missing = makeFake({ "list.exit": "1" });
    const r = await call("fledge-lanes-list", missing, []);
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(1);
    expect(r.error).toContain("No fledge.toml found");

    const junk = makeFake({ "list.json": "not json {" });
    const j = await call("fledge-lanes-list", junk, []);
    expect(j.ok).toBe(false);
    expect(j.error).toContain("unexpected output");
  });

  test("lanes validate: valid lanes are ok; --strict passes through; errors and warnings come back typed", async () => {
    const fake = makeFake();
    const ok = await call("fledge-lanes-validate", fake, []);
    expect(ok.ok).toBe(true);
    expect(ok.data).toEqual({ valid: true, strict: false, laneCount: 2, errors: [], warnings: [] });
    const strict = await call("fledge-lanes-validate", fake, ["--strict"]);
    expect(strict.ok).toBe(true);
    expect(argvLog(fake)).toEqual([
      "[--non-interactive][lanes][validate][--json]",
      "[--non-interactive][lanes][validate][--json][--strict]",
    ]);

    const broken = makeFake({ "validate.json": JSON.stringify(INVALID), "validate.exit": "1" });
    const r = await call("fledge-lanes-validate", broken, []);
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(1);
    expect(r.data).toMatchObject({ valid: false, laneCount: 2 });
    expect(r.error).toContain("error: Lane 'broken' step 1 references undefined task 'nosuch'");
    expect(r.error).toContain("warn: Lane 'broken' has no description");
    // The absolute path fledge reports is not passed on.
    expect(JSON.stringify(r.data)).not.toContain("/somewhere");
  });

  test("lanes validate: a path or any other arg is refused and nothing is spawned", async () => {
    const fake = makeFake();
    for (const args of [["/etc"], [".."], ["--strict", "/etc"], ["--json"]]) {
      const r = await call("fledge-lanes-validate", fake, args);
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(1);
      expect(r.error).toContain("no path argument");
    }
    expect(argvLog(fake)).toEqual([]);
  });

  test("reads run non-interactively without an allowlist entry (not dangerous)", async () => {
    const fake = makeFake();
    registerFake(fake);
    for (const name of READS) {
      const r = await runPlugin({ name, args: [], cwd: fake.project, nonInteractive: true, allowlist: [] });
      expect(r.ok).toBe(true);
    }
  });
});

describe("lane sources stay inside the project (ROLES-CHAT-8)", () => {
  // fledge prints the offending line of a lane source it cannot parse, so a
  // read that followed a link out of the project would print that file.
  const SECRET = "TOKEN=outside-secret-value-123";

  function outsideFile(fake: Fake): string {
    const p = join(fake.bin, "..", "outside.txt");
    writeFileSync(p, `${SECRET}\n`);
    return p;
  }

  async function expectRefused(fake: Fake, why: string): Promise<void> {
    for (const name of READS) {
      const r = await call(name, fake, []);
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(2);
      expect(r.error).toBe(`refused: ${name}: ${why} (fledge would print its contents; ROLES-CHAT-8)`);
      // Neither the file's contents nor where the link points come back.
      expect(JSON.stringify(r)).not.toContain("outside-secret-value");
      expect(JSON.stringify(r)).not.toContain(fake.bin.split("/").slice(0, -1).join("/"));
    }
    expect(argvLog(fake)).toEqual([]);
  }

  test("fledge.toml linked outside the project is refused and fledge never starts", async () => {
    const fake = makeFake();
    symlinkSync(outsideFile(fake), join(fake.project, "fledge.toml"));
    await expectRefused(fake, "fledge.toml resolves outside the project directory");
  });

  test("a .fledge/lanes/*.toml file, or the .fledge/lanes dir, linked outside is refused", async () => {
    const fake = makeFake();
    writeFileSync(join(fake.project, "fledge.toml"), "[tasks.a]\ncmd = \"true\"\n");
    mkdirSync(join(fake.project, ".fledge", "lanes"), { recursive: true });
    writeFileSync(join(fake.project, ".fledge", "lanes", "a.toml"), "");
    symlinkSync(outsideFile(fake), join(fake.project, ".fledge", "lanes", "b.toml"));
    await expectRefused(fake, ".fledge/lanes/b.toml resolves outside the project directory");

    const dirFake = makeFake();
    const outsideDir = join(dirFake.bin, "..", "outside-lanes");
    mkdirSync(outsideDir);
    mkdirSync(join(dirFake.project, ".fledge"));
    symlinkSync(outsideDir, join(dirFake.project, ".fledge", "lanes"));
    await expectRefused(dirFake, ".fledge/lanes resolves outside the project directory");
  });

  test("a lane source that is a secret path inside the project, or not a regular file, is refused", async () => {
    const fake = makeFake();
    writeFileSync(join(fake.project, ".env"), `${SECRET}\n`);
    symlinkSync(".env", join(fake.project, "fledge.toml"));
    await expectRefused(fake, "fledge.toml resolves to a secret path");

    const lanes = makeFake();
    writeFileSync(join(lanes.project, "fledge.toml"), "");
    mkdirSync(join(lanes.project, ".fledge", "lanes"), { recursive: true });
    writeFileSync(join(lanes.project, ".fledge", "lanes", ".env.toml"), "");
    await expectRefused(lanes, ".fledge/lanes/.env.toml resolves to a secret path");

    const dir = makeFake();
    mkdirSync(join(dir.project, "fledge.toml"));
    await expectRefused(dir, "fledge.toml is not a regular file");
  });

  test("links that stay inside the project, other files and a missing fledge.toml still reach fledge", async () => {
    const fake = makeFake();
    mkdirSync(join(fake.project, "conf"));
    writeFileSync(join(fake.project, "conf", "fledge.toml"), "");
    symlinkSync("conf/fledge.toml", join(fake.project, "fledge.toml"));
    mkdirSync(join(fake.project, ".fledge", "lanes"), { recursive: true });
    symlinkSync(join(fake.project, "conf", "fledge.toml"), join(fake.project, ".fledge", "lanes", "in.toml"));
    // Not a lane source: fledge only parses *.toml there.
    symlinkSync(outsideFile(fake), join(fake.project, ".fledge", "lanes", "README.md"));
    for (const name of READS) expect((await call(name, fake, [])).ok).toBe(true);
    expect(argvLog(fake)).toHaveLength(2);

    const missing = makeFake();
    expect((await call("fledge-lanes-list", missing, [])).ok).toBe(true);
  });

  test("lane and task runs (code tier, ADMIN only, allowlisted) are not clamped", async () => {
    const fake = makeFake();
    symlinkSync(outsideFile(fake), join(fake.project, "fledge.toml"));
    expect((await call("fledge-lanes-run", fake, ["verify"])).ok).toBe(true);
    expect((await call("fledge-run", fake, ["test"])).ok).toBe(true);
    expect(argvLog(fake)).toHaveLength(2);
  });
});

describe("fledge-lanes-run / fledge-run (dangerous, code tier)", () => {
  test("SAFE-1: non-interactive without an allowlist entry is denied and fledge never starts", async () => {
    const fake = makeFake();
    registerFake(fake);
    for (const [name, args] of [
      ["fledge-lanes-run", ["verify"]],
      ["fledge-run", ["test"]],
    ] as const) {
      const r = await runPlugin({ name, args: [...args], cwd: fake.project, nonInteractive: true, allowlist: [] });
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(2);
      expect(r.error).toContain("SAFE-1");
    }
    expect(argvLog(fake)).toEqual([]);
  });

  test("allowlisted lanes run: `fledge --non-interactive lanes run <lane>` in the project root, scrubbed env", async () => {
    const fake = makeFake();
    registerFake(fake);
    const r = await runPlugin({
      name: "fledge-lanes-run",
      args: ["verify"],
      cwd: fake.project,
      nonInteractive: true,
      allowlist: ["fledge-lanes-run"],
    });
    expect(r.ok).toBe(true);
    expect(argvLog(fake)).toEqual(["[--non-interactive][lanes][run][verify]"]);
    expect(r.message).toContain("ran lanes run verify");
    expect(r.data).toMatchObject({ lane: "verify", cwd: fake.project, exitCode: 0 });
    const env = lastEnv(fake);
    expect(env).toContain(`cwd=${fake.project}`);
    expect(env).toContain(
      `gh= dc= ai= llm= audit= acting= cdpath= oldpwd= fni=1 root=${fake.project} keep=kept`,
    );
  });

  test("lane and task runs start without GitHub or git credentials, like shell-exec and the runners (SAFE-21.a, SAFE-3.a)", async () => {
    const fake = makeFake();
    // The owner's credentials as the bot's env and home hold them: tokens,
    // an askpass helper, the ssh agent, a gh config dir with hosts.yml and a
    // global git config naming a credential helper.
    const home = join(fake.bin, "..", "home");
    const ghDir = join(home, ".config", "gh");
    mkdirSync(ghDir, { recursive: true });
    writeFileSync(join(ghDir, "hosts.yml"), "github.com:\n    oauth_token: gho_notreal\n");
    writeFileSync(join(home, ".gitconfig"), "[credential]\n\thelper = owner-marker-helper\n");
    const creds = {
      ...fake.env,
      HOME: home,
      GH_TOKEN: "gh-token-value",
      GIT_ASKPASS: "/usr/bin/askpass-owner",
      SSH_AUTH_SOCK: join(home, "agent.sock"),
      GH_CONFIG_DIR: ghDir,
    };
    for (const [name, args] of [["fledge-run", ["push"]], ["fledge-lanes-run", ["release"]]] as const) {
      const r = await call(name, { ...fake, env: creds }, [...args]);
      expect(r.ok).toBe(true);
      const line = lastEnv(fake).split("\n").find((l) => l.startsWith("creds ")) ?? "";
      expect(line).toContain("ghtoken= askpass= sshsock= gcglobal=/dev/null gcnosystem=1 prompt=0 gccount=3");
      expect(line).toContain("helperkey=credential.helper helperval=[]");
      expect(line).toContain("hosts=no");
      expect(line).not.toContain(`ghdir=${ghDir}`);
      expect(line).not.toContain("owner-marker-helper");
      expect(line).toContain("sshcmd=ssh -F /dev/null");
      // The verify-lane scrub still holds.
      expect(lastEnv(fake)).toContain(`gh= dc= ai= llm= audit= acting= cdpath= oldpwd= fni=1 root=${fake.project} keep=kept`);
    }
  });

  test("fledge run: task args go after fledge's -- verbatim (no shell); no args, no --", async () => {
    const fake = makeFake();
    const r = await call("fledge-run", fake, ["test", "--bail", "a b", "$(id)", "--", "; rm -rf /"]);
    expect(r.ok).toBe(true);
    const plain = await call("fledge-run", fake, ["lint"]);
    expect(plain.ok).toBe(true);
    expect(argvLog(fake)).toEqual([
      "[--non-interactive][run][test][--][--bail][a b][$(id)][--][; rm -rf /]",
      "[--non-interactive][run][lint]",
    ]);
    expect(r.data).toMatchObject({ task: "test", args: ["--bail", "a b", "$(id)", "--", "; rm -rf /"] });
  });

  test("a lane or task name that is not a plain name is refused before fledge starts", async () => {
    const fake = makeFake();
    for (const args of [[], ["--init"], ["-l"], ["--dry-run", "verify"], ["verify", "--from", "2"], ["a b"], ["../x"], [""]]) {
      const r = await call("fledge-lanes-run", fake, args);
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(1);
      expect(r.error).toContain("usage: fledge-lanes-run <lane>");
    }
    for (const args of [[], ["--init"], ["--list"], ["--lang", "rust"], ["-l"], ["x/y"], [""]]) {
      const r = await call("fledge-run", fake, args);
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(1);
      expect(r.error).toContain("usage: fledge-run <task>");
    }
    expect(argvLog(fake)).toEqual([]);
  });

  test("a failing lane or task returns ok=false with fledge's exit code and output", async () => {
    const fake = makeFake({ "run.exit": "3" });
    const r = await call("fledge-lanes-run", fake, ["verify"]);
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(3);
    expect(r.error).toContain("fledge-lanes-run exited 3");
    expect(r.error).toContain("error: Task failed");
    const t = await call("fledge-run", fake, ["test"]);
    expect(t.ok).toBe(false);
    expect(t.exitCode).toBe(3);
  });

  test("output is secret-scrubbed (SAFE-6)", async () => {
    const key = `sk-ant-${"a".repeat(30)}`;
    const fake = makeFake({ "run.secret": `token ${key}\n` });
    const r = await call("fledge-run", fake, ["test"]);
    expect(r.ok).toBe(true);
    expect(String(r.message)).not.toContain(key);
    expect(JSON.stringify(r.data)).not.toContain(key);
  });

  test("timeout returns 124 and an aborted calling run returns 130", async () => {
    const fake = makeFake({ "run.sleep": "30" });
    const started = Date.now();
    const t = await call("fledge-lanes-run", fake, ["verify"], {}, { runTimeoutMs: 200 });
    expect(t.ok).toBe(false);
    expect(t.exitCode).toBe(124);
    expect(t.error).toContain("timed out after 200ms");
    const ac = new AbortController();
    const p = call("fledge-run", fake, ["test"], { signal: ac.signal });
    setTimeout(() => ac.abort(), 150);
    const a = await p;
    expect(a.ok).toBe(false);
    expect(a.exitCode).toBe(130);
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});

describe("fledge binary resolution", () => {
  test("fledge missing from PATH is exit 127, not a throw; a relative PATH entry is never used", async () => {
    const fake = makeFake();
    const none = { ...fake, env: { ...fake.env, PATH: "/nonexistent-dir" } };
    for (const [name, args] of [
      ["fledge-lanes-list", []],
      ["fledge-lanes-validate", []],
      ["fledge-lanes-run", ["verify"]],
      ["fledge-run", ["test"]],
    ] as const) {
      const r = await call(name, none, [...args]);
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(127);
      expect(r.error).toBe(`${name}: fledge not on PATH`);
    }
    // A relative PATH entry (`.`, or one that does lead to a fledge) is not searched.
    const rel = relative(process.cwd(), fake.bin);
    expect(Bun.which("fledge", { PATH: rel })).toBeTruthy();
    expect(resolveFledgeBin({ PATH: rel })).toBeNull();
    expect(resolveFledgeBin({ PATH: `.:${rel}` })).toBeNull();
    expect(resolveFledgeBin({ PATH: `${rel}:${fake.bin}` })).toBe(join(fake.bin, "fledge"));
    expect(resolveFledgeBin({})).toBeNull();
  });
});

const REAL_FLEDGE = resolveFledgeBin(process.env);

describe.skipIf(!REAL_FLEDGE)("real fledge (where installed)", () => {
  function realProject(toml: string): string {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "corvidinho-fledge-real-")));
    temps.push(dir);
    writeFileSync(join(dir, "fledge.toml"), toml);
    return dir;
  }
  const TOML = `[tasks.hello]
cmd = "echo hello-from-task"
[tasks.pwd]
cmd = "pwd -P"
[lanes.good]
description = "good lane"
steps = ["hello"]
`;
  const real = (name: string, cwd: string, args: string[]) =>
    cmd(name, {}).handler({ args, cwd, json: false, nonInteractive: false, allowlist: new Set() });

  test("lists, validates and runs a real project's lanes and tasks in its root", async () => {
    const dir = realProject(TOML);
    const l = await real("fledge-lanes-list", dir, []);
    expect(l.ok).toBe(true);
    expect((l.data as { lanes: { name: string }[] }).lanes.map((x) => x.name)).toEqual(["good"]);
    const v = await real("fledge-lanes-validate", dir, []);
    expect(v.ok).toBe(true);
    const run = await real("fledge-lanes-run", dir, ["good"]);
    expect(run.ok).toBe(true);
    expect(run.message).toContain("hello-from-task");
    const pwd = await real("fledge-run", dir, ["pwd"]);
    expect(pwd.ok).toBe(true);
    expect(pwd.message).toContain(dir);
    const unknown = await real("fledge-run", dir, ["nosuch"]);
    expect(unknown.ok).toBe(false);
    expect(unknown.error).toContain("Unknown task 'nosuch'");
  });

  test("an invalid lane is reported with fledge's error", async () => {
    const dir = realProject(`${TOML}[lanes.broken]\nsteps = ["nosuch"]\n`);
    const v = await real("fledge-lanes-validate", dir, []);
    expect(v.ok).toBe(false);
    expect(v.error).toContain("references undefined task 'nosuch'");
  });

  test("a lane source linked outside the project is refused; its contents never come back", async () => {
    const dir = realProject(TOML);
    const secret = join(dir, "..", `${dir.split("/").pop()}-outside.txt`);
    temps.push(secret);
    writeFileSync(secret, "TOKEN=real-outside-secret-456\n");
    mkdirSync(join(dir, ".fledge", "lanes"), { recursive: true });
    symlinkSync(secret, join(dir, ".fledge", "lanes", "y.toml"));
    for (const name of ["fledge-lanes-list", "fledge-lanes-validate"]) {
      const r = await real(name, dir, []);
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(2);
      expect(JSON.stringify(r)).not.toContain("real-outside-secret-456");
    }
  });

  test("corvidinho plugins run fledge-lanes-list lists this repo's verify lane", async () => {
    const root = join(import.meta.dir, "..");
    const proc = Bun.spawn(["bun", "src/cli.ts", "plugins", "run", "fledge-lanes-list", "--json"], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, out] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
    expect(code).toBe(0);
    const parsed = JSON.parse(out) as { ok: boolean; data: { lanes: { name: string; steps: number }[] } };
    expect(parsed.ok).toBe(true);
    expect(parsed.data.lanes.find((x) => x.name === "verify")?.steps).toBeGreaterThanOrEqual(4);
  });
});
