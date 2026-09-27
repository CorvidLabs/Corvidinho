/**
 * ROLES-CHAT-7 prove-before-done: non-ADMIN cannot mutate; ADMIN still SAFE-gated
 * (files-write, shell-exec, github-pr-create + GITHUB-6); channel allowlist
 * still required. GitHub runs are dry-run only (no network, no token).
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildOpenAiTools } from "../src/agent/tools.ts";
import { checkChannel } from "../src/allowlist/index.ts";
import { emptyConfig } from "../src/allowlist/types.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry, list } from "../src/plugins/registry.ts";
import { runPlugin } from "../src/plugins/run.ts";
import {
  ROLE_REFUSED_MESSAGE,
  resolveActingIsAdmin,
} from "../src/plugins/roles.ts";

const OWNER = "181969874455756800";
const NON_OWNER = "999999999999999999";
const CHANNEL = "1408845298629083220";

const ACTING_KEYS = [
  "CORVIDINHO_ACTING_IS_ADMIN",
  "CORVIDINHO_ACTING_DISCORD_USER_ID",
  "CORVIDINHO_OWNER_DISCORD_ID",
  "CORVIDINHO_ALLOWLIST_FILE",
  "CORVIDINHO_ALLOWLIST",
  "CORVIDINHO_MEMORY_INMEM",
] as const;

/** GITHUB-6 gate + GitHub write keys: cleared per test so no operator env admits a repo or reaches the network. */
const GITHUB_KEYS = [
  "CORVIDINHO_GITHUB_ALLOW_REPOS",
  "CORVIDINHO_GITHUB_ALLOW_ORGS",
  "CORVIDINHO_GITHUB_ALLOW_USERS",
  "CORVIDINHO_GITHUB_DENY_REPOS",
  "CORVIDINHO_GITHUB_DENY_ORGS",
  "CORVIDINHO_GITHUB_DRY_RUN",
  "GITHUB_TOKEN",
  "GH_TOKEN",
] as const;

let prev: Record<string, string | undefined> = {};
let tmpRoot = "";

function snapEnv() {
  prev = {};
  for (const k of ACTING_KEYS) prev[k] = process.env[k];
  for (const k of GITHUB_KEYS) {
    prev[k] = process.env[k];
    delete process.env[k];
  }
}

function restoreEnv() {
  for (const k of [...ACTING_KEYS, ...GITHUB_KEYS]) {
    if (prev[k] === undefined) delete process.env[k];
    else process.env[k] = prev[k];
  }
}

function writeAllowlist(opts: {
  owner?: string;
  channels?: string[];
}): string {
  tmpRoot = mkdtempSync(join(tmpdir(), "roles-chat-"));
  const path = join(tmpRoot, "allowlist.toml");
  const channels = opts.channels ?? [CHANNEL];
  const owner = opts.owner ?? OWNER;
  writeFileSync(
    path,
    `[discord]\nchannels = [${channels.map((c) => `"${c}"`).join(", ")}]\nroles = []\nusers = []\ndeny_users = []\n\n[owner]\ndiscord_id = "${owner}"\n`,
    "utf8",
  );
  process.env.CORVIDINHO_ALLOWLIST_FILE = path;
  process.env.CORVIDINHO_OWNER_DISCORD_ID = owner;
  return path;
}

function asNonAdmin() {
  process.env.CORVIDINHO_ACTING_IS_ADMIN = "0";
  process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = NON_OWNER;
  process.env.CORVIDINHO_MEMORY_INMEM = "1";
  delete process.env.CORVIDINHO_ALLOWLIST;
}

function asAdmin() {
  process.env.CORVIDINHO_ACTING_IS_ADMIN = "1";
  process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = OWNER;
  process.env.CORVIDINHO_MEMORY_INMEM = "1";
  delete process.env.CORVIDINHO_ALLOWLIST;
}

describe("ROLES-CHAT-7 role tool gates", () => {
  beforeEach(() => {
    snapEnv();
    clearRegistry();
    loadBuiltins();
    writeAllowlist({});
  });

  afterEach(() => {
    restoreEnv();
    clearRegistry();
    if (tmpRoot) {
      try {
        rmSync(tmpRoot, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      tmpRoot = "";
    }
  });

  test("(a) non-admin catalog omits mutating tools including files-write/edit", () => {
    asNonAdmin();
    const tools = buildOpenAiTools({ tier: "code", actingIsAdmin: false });
    const names = new Set(tools.map((t) => t.function.name));
    expect(names.has("files-read")).toBe(true);
    expect(names.has("files-list")).toBe(true);
    expect(names.has("memory-recall")).toBe(true);
    expect(names.has("files-write")).toBe(false);
    expect(names.has("files-edit")).toBe(false);
    expect(names.has("files-delete")).toBe(false);
    expect(names.has("shell-exec")).toBe(false);
    expect(names.has("github-pr-create")).toBe(false);
    expect(names.has("memory-forget")).toBe(false);
  });

  test("(a) non-admin runPlugin refuses files-write / shell / github-pr-create / memory-forget", async () => {
    asNonAdmin();
    const cases = [
      "files-write",
      "shell-exec",
      "github-pr-create",
      "memory-forget",
    ] as const;
    for (const name of cases) {
      const result = await runPlugin({
        name,
        args: name === "files-write" ? ["scratch.txt", "nope"] : [],
        nonInteractive: true,
        allowlist: [],
        cwd: tmpRoot,
      });
      expect(result.ok).toBe(false);
      expect(result.exitCode).toBe(2);
      expect(result.error ?? "").toContain(ROLE_REFUSED_MESSAGE);
    }
  });

  test("(b) admin can run files-write (mutating, not dangerous); shell still SAFE-1 without allowlist", async () => {
    asAdmin();
    mkdirSync(tmpRoot, { recursive: true });
    const write = await runPlugin({
      name: "files-write",
      args: ["ok.txt", "hello-admin"],
      nonInteractive: true,
      allowlist: [],
      cwd: tmpRoot,
    });
    expect(write.ok).toBe(true);

    const shellDenied = await runPlugin({
      name: "shell-exec",
      args: ["echo hi"],
      nonInteractive: true,
      allowlist: [],
      cwd: tmpRoot,
    });
    expect(shellDenied.ok).toBe(false);
    expect(shellDenied.error ?? "").toContain("SAFE-1");

    const shellOk = await runPlugin({
      name: "shell-exec",
      args: ["echo hi"],
      nonInteractive: true,
      allowlist: ["shell-exec"],
      cwd: tmpRoot,
    });
    expect(shellOk.ok).toBe(true);
  });

  test("(b) admin github-pr-create: SAFE-1 denies without an allowlist entry; dry-run ok with the allowlist + GITHUB-6 repo allowlist", async () => {
    asAdmin();
    process.env.CORVIDINHO_GITHUB_DRY_RUN = "1";
    expect(await resolveActingIsAdmin()).toBe(true);
    const args = [
      "--repo",
      "CorvidLabs/Corvidinho",
      "--title",
      "admin role session",
      "--head",
      "corvidinho/roles-chat-7",
      "--base",
      "main",
    ];
    const run = (allowlist: string[]) =>
      runPlugin({
        name: "github-pr-create",
        args,
        nonInteractive: true,
        allowlist,
        cwd: tmpRoot,
      });

    // ADMIN passes the role gate but not SAFE-1: no allowlist entry, no PR.
    const denied = await run([]);
    expect(denied.ok).toBe(false);
    expect(denied.exitCode).toBe(2);
    expect(denied.error ?? "").toContain("SAFE-1");
    expect(denied.error ?? "").not.toContain(ROLE_REFUSED_MESSAGE);

    // Allowlisted, but the GITHUB-6 repo allowlist is empty: still refused.
    const noRepo = await run(["github-pr-create"]);
    expect(noRepo.ok).toBe(false);
    expect(noRepo.exitCode).toBe(3);
    expect(noRepo.error ?? "").toContain("GITHUB-6");

    // Allowlist entry + GITHUB-6 repo allowlist: the dry-run PR goes through.
    process.env.CORVIDINHO_GITHUB_ALLOW_REPOS = "CorvidLabs/Corvidinho";
    const ok = await run(["github-pr-create"]);
    expect(ok.ok).toBe(true);
    expect(ok.exitCode).toBe(0);
    expect(ok.data).toMatchObject({
      dryRun: true,
      owner: "CorvidLabs",
      repo: "Corvidinho",
      title: "admin role session",
      head: "corvidinho/roles-chat-7",
      base: "main",
    });
  });

  test("(b) admin catalog includes files-write at code tier (still omits dangerous unless includeDangerous)", () => {
    asAdmin();
    const tools = buildOpenAiTools({ tier: "code", actingIsAdmin: true });
    const names = new Set(tools.map((t) => t.function.name));
    expect(names.has("files-write")).toBe(true);
    expect(names.has("files-edit")).toBe(true);
    expect(names.has("shell-exec")).toBe(false); // dangerous omitted
  });

  test("files-write/edit are listed as mutating", () => {
    const byName = Object.fromEntries(list().map((e) => [e.name, e]));
    expect(byName["files-write"]!.mutating).toBe(true);
    expect(byName["files-write"]!.dangerous).toBe(false);
    expect(byName["files-edit"]!.mutating).toBe(true);
    expect(byName["files-delete"]!.mutating).toBe(true); // via dangerous
    expect(byName["files-read"]!.mutating).toBe(false);
  });

  test("(c) channel allowlist still required — empty channels refuse", () => {
    const cfg = emptyConfig();
    expect(checkChannel(CHANNEL, cfg).ok).toBe(false);
    cfg.discord.channels = [CHANNEL];
    expect(checkChannel(CHANNEL, cfg).ok).toBe(true);
  });
});
