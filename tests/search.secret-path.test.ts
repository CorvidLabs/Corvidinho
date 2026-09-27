/**
 * ROLES-CHAT-8 — non-ADMIN role sessions never see secret paths through the
 * read-ish file tools: search-grep, files-glob and files-list refuse an
 * explicit secret path and leave secret files out of recursive results, the
 * same gate files-read applies. ADMIN (and the local CLI) keep access, as
 * files-read does.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { isSecretPath } from "../plugins/files/protectedPaths.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry } from "../src/plugins/registry.ts";
import { runPlugin } from "../src/plugins/run.ts";
import type { PluginHandlerResult } from "../src/plugins/types.ts";

const OWNER = "181969874455756800";
const NON_OWNER = "999999999999999999";

const ENV_KEYS = [
  "CORVIDINHO_ACTING_IS_ADMIN",
  "CORVIDINHO_ACTING_DISCORD_USER_ID",
  "CORVIDINHO_OWNER_DISCORD_ID",
  "CORVIDINHO_ALLOWLIST",
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_NOSYSTEM",
] as const;

/** Every secret file body carries one of these; none may reach a non-admin. */
const SECRET_MARKERS = [
  "sk-proj-FAKEFAKE",
  "FAKEFAKE_LOCAL",
  "FAKEFAKE_UPPER",
  "FAKEFAKE_PEM",
  "FAKEFAKE_SSH",
  "FAKEFAKE_KEYSTORE",
  "FAKEFAKE_CREDS",
];

let prev: Record<string, string | undefined> = {};
let dir = "";

function asNonAdmin() {
  process.env.CORVIDINHO_ACTING_IS_ADMIN = "0";
  process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = NON_OWNER;
}

function asAdmin() {
  process.env.CORVIDINHO_ACTING_IS_ADMIN = "1";
  process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = OWNER;
}

/** Local CLI: no role session stamped by a bridge. */
function asCli() {
  delete process.env.CORVIDINHO_ACTING_IS_ADMIN;
  delete process.env.CORVIDINHO_ACTING_DISCORD_USER_ID;
}

function run(name: string, args: string[]): Promise<PluginHandlerResult> {
  return runPlugin({ name, args, cwd: dir, nonInteractive: true });
}

function expectNoSecrets(r: PluginHandlerResult) {
  const text = `${r.message ?? ""}\n${JSON.stringify(r.data ?? null)}`;
  for (const marker of SECRET_MARKERS) expect(text).not.toContain(marker);
}

function expectRefused(r: PluginHandlerResult) {
  expect(r.ok).toBe(false);
  expect(r.exitCode).toBe(2);
  expect(r.error ?? "").toContain("ROLES-CHAT-8");
  expectNoSecrets(r);
}

beforeEach(() => {
  prev = {};
  for (const k of ENV_KEYS) prev[k] = process.env[k];
  process.env.CORVIDINHO_OWNER_DISCORD_ID = OWNER;
  delete process.env.CORVIDINHO_ALLOWLIST;
  clearRegistry();
  loadBuiltins();

  dir = mkdtempSync(join(tmpdir(), "corvidinho-grep-secret-"));
  writeFileSync(join(dir, ".env"), "OPENAI_API_KEY=sk-proj-FAKEFAKE0000\n");
  writeFileSync(join(dir, ".env.local"), "FAKEFAKE_LOCAL=1\n");
  writeFileSync(join(dir, "wallet-keystore.json"), '{"k":"FAKEFAKE_KEYSTORE"}\n');
  writeFileSync(join(dir, "credentials.json"), '{"k":"FAKEFAKE_CREDS"}\n');
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src", "a.ts"), 'const FAKEFAKE_OK = "public";\n');
  mkdirSync(join(dir, "certs"));
  writeFileSync(join(dir, "certs", "server.pem"), "FAKEFAKE_PEM\n");
  mkdirSync(join(dir, ".ssh"));
  writeFileSync(join(dir, ".ssh", "id_rsa"), "FAKEFAKE_SSH\n");
  writeFileSync(join(dir, ".ssh", "config"), "FAKEFAKE_SSH config\n");
  // Case variant: grep's --exclude globs are case-sensitive, isSecretPath is not.
  mkdirSync(join(dir, "sub"));
  writeFileSync(join(dir, "sub", ".ENV"), "FAKEFAKE_UPPER=1\n");
  // Innocent-looking names that point at secrets.
  symlinkSync(".env", join(dir, "innocent.txt"));
  symlinkSync(".ssh", join(dir, "notes"));
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (prev[k] === undefined) delete process.env[k];
    else process.env[k] = prev[k];
  }
  clearRegistry();
  rmSync(dir, { recursive: true, force: true });
});

describe("search-grep secret paths (ROLES-CHAT-8)", () => {
  test("non-admin recursive search leaves every secret file out", async () => {
    asNonAdmin();
    for (const args of [["FAKEFAKE"], ["FAKEFAKE", "."], ["--pattern", "FAKEFAKE"], ["FAKEFAKE", "sub"]]) {
      const r = await run("search-grep", args);
      expect(r.ok).toBe(true);
      expectNoSecrets(r);
      const matches = (r.data as { matches: { file: string }[] }).matches;
      for (const m of matches) expect(isSecretPath(relative(realpathSync(dir), m.file))).toBe(false);
    }
    const all = await run("search-grep", ["FAKEFAKE", "--json"]);
    expect(all.message).toContain("FAKEFAKE_OK");
    expect((all.data as { count: number }).count).toBe(1);
  });

  test("non-admin explicit secret path is refused like files-read", async () => {
    asNonAdmin();
    const read = await run("files-read", [".env"]);
    expectRefused(read);
    const cases: string[][] = [
      ["OPENAI_API_KEY", ".env"],
      ["OPENAI_API_KEY", "./.env"],
      ["OPENAI_API_KEY", "src/../.env"],
      ["OPENAI_API_KEY", join(dir, ".env")],
      ["OPENAI_API_KEY", "--path", ".env"],
      ["OPENAI_API_KEY", "--path=.env"],
      ["--pattern", "OPENAI_API_KEY", ".env"],
      ["FAKEFAKE", ".env.local"],
      ["FAKEFAKE", ".ssh"],
      ["FAKEFAKE", ".ssh/id_rsa"],
      ["FAKEFAKE", "certs/server.pem"],
      ["FAKEFAKE", "sub/.ENV"],
      ["FAKEFAKE", "wallet-keystore.json"],
      ["FAKEFAKE", "credentials.json"],
    ];
    for (const args of cases) expectRefused(await run("search-grep", args));
  });

  test("non-admin --include cannot pull secret files back in", async () => {
    asNonAdmin();
    const cases: string[][] = [
      ["FAKEFAKE", "--include=.env"],
      ["FAKEFAKE", "--include", ".env"],
      ["FAKEFAKE", "--include", "env"],
      ["FAKEFAKE", "--include", "env,local,json"],
      ["FAKEFAKE", "--include=*.pem"],
      ["FAKEFAKE", "--include", "pem"],
      ["FAKEFAKE", "--include", "pem,ts"],
      ["FAKEFAKE", ".", "--include", "*"],
      ["FAKEFAKE", "certs", "--include", "pem"],
    ];
    for (const args of cases) {
      const r = await run("search-grep", args);
      expect(r.ok).toBe(true);
      expectNoSecrets(r);
    }
  });

  test("non-admin symlink to a secret is refused; recursion does not follow it", async () => {
    asNonAdmin();
    expectRefused(await run("search-grep", ["OPENAI_API_KEY", "innocent.txt"]));
    expectRefused(await run("search-grep", ["FAKEFAKE", "notes"]));
    expectRefused(await run("files-read", ["innocent.txt"]));
    const r = await run("search-grep", ["OPENAI_API_KEY"]);
    expect(r.ok).toBe(true);
    expectNoSecrets(r);
    expect((r.data as { count: number }).count).toBe(0);
  });

  test("ADMIN and local CLI still grep secrets, matching files-read", async () => {
    for (const as of [asAdmin, asCli]) {
      as();
      const read = await run("files-read", [".env"]);
      expect(read.ok).toBe(true);
      expect(read.message).toContain("sk-proj-FAKEFAKE");

      const explicit = await run("search-grep", ["OPENAI_API_KEY", ".env"]);
      expect(explicit.ok).toBe(true);
      expect(explicit.message).toContain("sk-proj-FAKEFAKE");

      const recursive = await run("search-grep", ["FAKEFAKE"]);
      expect(recursive.ok).toBe(true);
      for (const marker of ["sk-proj-FAKEFAKE", "FAKEFAKE_PEM", "FAKEFAKE_SSH", "FAKEFAKE_OK"]) {
        expect(recursive.message).toContain(marker);
      }
    }
  });
});

describe("files-glob / files-list secret paths (ROLES-CHAT-8)", () => {
  const SECRET_NAMES = [".env", ".env.local", ".ssh", "id_rsa", "server.pem", ".ENV", "wallet-keystore.json", "credentials.json"];

  test("non-admin files-glob leaves secret paths out", async () => {
    asNonAdmin();
    for (const pattern of ["**/*", ".env*", "**/*.pem", ".ssh/*", "**/.ENV", "*keystore*"]) {
      const r = await run("files-glob", [pattern]);
      expect(r.ok).toBe(true);
      const matches = (r.data as { matches: string[] }).matches;
      for (const m of matches) expect(isSecretPath(m)).toBe(false);
    }
    const all = await run("files-glob", ["**/*"]);
    expect((all.data as { matches: string[] }).matches).toContain("src/a.ts");
    // A pattern naming a symlink to .ssh walks into it; the resolved path is judged.
    const viaLink = await run("files-glob", ["notes/*"]);
    expect(viaLink.ok).toBe(true);
    expect((viaLink.data as { matches: string[] }).matches).toEqual([]);
  });

  test("non-admin files-list refuses a secret dir and hides secret entries", async () => {
    asNonAdmin();
    expectRefused(await run("files-list", [".ssh"]));
    expectRefused(await run("files-list", ["notes"]));
    for (const path of [".", "certs", "sub"]) {
      const r = await run("files-list", [path, "--show-hidden", "--json"]);
      expect(r.ok).toBe(true);
      const names = (r.data as { entries: { name: string }[] }).entries.map((e) => e.name);
      for (const secret of SECRET_NAMES) expect(names).not.toContain(secret);
    }
    const root = await run("files-list", [".", "--show-hidden"]);
    expect(root.message).toContain("src");
  });

  test("ADMIN and local CLI still see secret paths in files-glob / files-list", async () => {
    for (const as of [asAdmin, asCli]) {
      as();
      const glob = await run("files-glob", ["**/*"]);
      const matches = (glob.data as { matches: string[] }).matches;
      expect(matches).toContain(".env");
      expect(matches).toContain(".ssh/id_rsa");
      expect(matches).toContain("certs/server.pem");
      const list = await run("files-list", [".", "--show-hidden", "--json"]);
      const names = (list.data as { entries: { name: string }[] }).entries.map((e) => e.name);
      expect(names).toContain(".env");
      expect(names).toContain(".ssh");
      const ssh = await run("files-list", [".ssh"]);
      expect(ssh.ok).toBe(true);
      const viaLink = await run("files-glob", ["notes/*"]);
      expect((viaLink.data as { matches: string[] }).matches).toContain("notes/id_rsa");
    }
  });
});

describe("search-grep match records", () => {
  test("a file name holding ':N:' keeps its file, line and text", async () => {
    asNonAdmin();
    writeFileSync(join(dir, "src", "odd:7:name.ts"), "x\nFAKEFAKE_ODD here\n");
    const r = await run("search-grep", ["FAKEFAKE_ODD", "src"]);
    expect(r.ok).toBe(true);
    const m = (r.data as { matches: { file: string; line: number; text: string }[] }).matches;
    expect(m).toHaveLength(1);
    expect(m[0]!.file).toBe(join(realpathSync(dir), "src", "odd:7:name.ts"));
    expect(m[0]!.line).toBe(2);
    expect(m[0]!.text).toBe("FAKEFAKE_ODD here");
  });
});

describe("git-diff secret paths (ROLES-CHAT-8)", () => {
  /** Tracked paths whose changes a non-ADMIN session must never see. */
  const SECRET_TRACKED = [
    ".env",
    ".env.local",
    "sub/.ENV",
    "sub/.Env.prod",
    ".ssh/config",
    ".ssh/id_rsa",
    "certs/server.pem",
    "certs/b.PEM",
    "KeyStore/x.txt",
    "wallet-keystore.json",
    "credentials",
    "credentials.json",
    "sub/Credentials.JSON",
    "id_rsa",
    "sub/ID_ED25519",
    "x/.env.d/z.txt",
  ];
  /** Look-alikes isSecretPath does not match; their diffs stay visible. */
  const PLAIN_TRACKED = ["src/a.ts", ".envrc", "a.pem.txt", "y/credentials/ok.txt", "envfile"];

  function git(...args: string[]) {
    const r = Bun.spawnSync(["git", ...args], { cwd: dir, stdout: "pipe", stderr: "pipe" });
    if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString()}`);
  }

  beforeEach(() => {
    const cfg = join(dir, "..", `${relative(tmpdir(), dir)}.gitconfig`);
    writeFileSync(cfg, "");
    process.env.GIT_CONFIG_GLOBAL = cfg;
    process.env.GIT_CONFIG_NOSYSTEM = "1";
    for (const p of [...SECRET_TRACKED, ...PLAIN_TRACKED]) {
      mkdirSync(join(dir, dirname(p)), { recursive: true });
      writeFileSync(join(dir, p), "old\n");
    }
    git("init", "-q", "-b", "main");
    git("-c", "user.name=t", "-c", "user.email=t@example.invalid", "add", "-f", "--", ...SECRET_TRACKED, ...PLAIN_TRACKED);
    git("-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "init");
    SECRET_TRACKED.forEach((p, i) => writeFileSync(join(dir, p), `FAKEFAKE_GIT_${i}\n`));
    for (const p of PLAIN_TRACKED) writeFileSync(join(dir, p), "FAKEFAKE_PLAIN\n");
  });

  afterEach(() => {
    rmSync(join(dir, "..", `${relative(tmpdir(), dir)}.gitconfig`), { force: true });
  });

  function expectNoGitSecrets(r: PluginHandlerResult) {
    const text = `${r.message ?? ""}\n${r.error ?? ""}\n${JSON.stringify(r.data ?? null)}`;
    expect(text).not.toContain("FAKEFAKE_GIT_");
  }

  test("non-admin git-diff leaves every tracked secret file out", async () => {
    asNonAdmin();
    for (const args of [[], ["."], ["--staged"]]) {
      if (args[0] === "--staged") git("add", "-f", "--", ...SECRET_TRACKED, ...PLAIN_TRACKED);
      const r = await run("git-diff", args);
      expect(r.ok).toBe(true);
      expectNoGitSecrets(r);
      const files = (r.data as { files: { path: string }[] }).files.map((f) => f.path).sort();
      expect(files).toEqual([...PLAIN_TRACKED].sort());
      expect(r.message).toContain("FAKEFAKE_PLAIN");
    }
  });

  test("non-admin git-diff of an explicit secret path is refused like files-read", async () => {
    asNonAdmin();
    for (const p of [".env", "./.env", "src/../.env", join(dir, ".env"), ".ssh", "certs/server.pem", "KeyStore", "notes", "innocent.txt"]) {
      const r = await run("git-diff", [p]);
      expectRefused(r);
      expectNoGitSecrets(r);
    }
    const certs = await run("git-diff", ["certs"]);
    expect(certs.ok).toBe(true);
    expectNoGitSecrets(certs);
    // User paths stay literal: no glob or `:(magic)` smuggled in by a path.
    for (const p of ["*", ":(glob)**", ":(top)."]) {
      const r = await run("git-diff", [p]);
      expect(r.ok).toBe(true);
      expect((r.data as { files: unknown[] }).files).toEqual([]);
      expectNoGitSecrets(r);
    }
    const one = await run("git-diff", ["src/a.ts"]);
    expect((one.data as { files: { path: string }[] }).files.map((f) => f.path)).toEqual(["src/a.ts"]);
  });

  test("ADMIN and local CLI git-diff still show tracked secret files", async () => {
    for (const as of [asAdmin, asCli]) {
      as();
      const r = await run("git-diff", []);
      expect(r.ok).toBe(true);
      const files = (r.data as { files: { path: string }[] }).files.map((f) => f.path);
      for (const p of SECRET_TRACKED) expect(files).toContain(p);
      expect(r.message).toContain("FAKEFAKE_GIT_0");
      const env = await run("git-diff", [".env"]);
      expect(env.ok).toBe(true);
      expect(env.message).toContain("FAKEFAKE_GIT_0");
    }
  });
});
