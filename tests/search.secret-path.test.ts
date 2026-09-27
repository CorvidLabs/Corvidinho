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
import { join, relative } from "node:path";
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
    }
  });
});
