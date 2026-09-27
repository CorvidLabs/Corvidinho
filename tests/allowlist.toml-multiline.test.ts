/**
 * Allowlist file TOML subset (REQ-plugins-006 / ALLOW-4, GITHUB-6, ALLOW-1..3,5,6).
 * Multi-line arrays (trailing commas, `#` comments) must load; anything the
 * parser cannot read in an allow/deny section must fail closed — a malformed
 * file never falls back to env-only, where env allow would admit what the
 * file denied.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkChannel,
  checkUser,
  isRepoAllowed,
  loadAllowlist,
  loadAllowlistFile,
  parseSimpleToml,
} from "../src/allowlist/index.ts";
import {
  commitAdminListChange,
  planAdminListChange,
  readFileAdminList,
} from "../src/discord/admin-allowlist.ts";
import { loadBridgeConfig } from "../src/discord/config.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { loadWatchConfig } from "../src/watch/config.ts";

const dirs: string[] = [];
function tmpFile(name: string, text: string): string {
  const d = mkdtempSync(join(tmpdir(), "corvidinho-toml-"));
  dirs.push(d);
  const p = join(d, name);
  writeFileSync(p, text);
  return p;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const MULTI = `# operator file
[github]
orgs = [
  "CorvidLabs",   # the org
  "acme",
]
repos = [
  "other/one",
  "other/two"
]
deny_repos = [
  "corvidlabs/secret",
]
deny_orgs = [ # whole orgs
  "evilorg",
  # "commented/out",
]

[discord]
channels = [
  "111",
  "222",
]
users = ["333",
  "444"]
deny_channels = [
  "222",
]
deny_users = [
  "444", # blocked
]
`;

describe("allowlist TOML: multi-line arrays", () => {
  test("parseSimpleToml reads multi-line orgs/repos/deny_repos/deny_orgs with trailing commas and comments", () => {
    const t = parseSimpleToml(MULTI);
    expect(t.github?.orgs).toEqual(["CorvidLabs", "acme"]);
    expect(t.github?.repos).toEqual(["other/one", "other/two"]);
    expect(t.github?.deny_repos).toEqual(["corvidlabs/secret"]);
    expect(t.github?.deny_orgs).toEqual(["evilorg"]);
    expect(t.discord?.channels).toEqual(["111", "222"]);
    expect(t.discord?.users).toEqual(["333", "444"]);
    expect(t.discord?.deny_channels).toEqual(["222"]);
    expect(t.discord?.deny_users).toEqual(["444"]);
  });

  test("file deny_repos spanning lines wins over an env allow org (GITHUB-6)", async () => {
    const path = tmpFile(
      "allowlist.toml",
      `[github]\norgs = ["corvidlabs"]\ndeny_repos = [\n  "corvidlabs/secret",\n]\n`,
    );
    const cfg = await loadAllowlist({
      filePath: path,
      env: { CORVIDINHO_GITHUB_ALLOW_ORGS: "corvidlabs" },
    });
    expect(cfg.github.denyRepos).toEqual(["corvidlabs/secret"]);
    expect(isRepoAllowed("corvidlabs/secret", cfg.github).ok).toBe(false);
    expect(isRepoAllowed("corvidlabs/public", cfg.github).ok).toBe(true);
  });

  test("multi-line file lists load for github and discord gates", async () => {
    const path = tmpFile("allowlist.toml", MULTI);
    const cfg = await loadAllowlist({ filePath: path, env: {} });
    expect(cfg.github.orgs).toEqual(["corvidlabs", "acme"]);
    expect(cfg.github.repos).toEqual(["other/one", "other/two"]);
    expect(isRepoAllowed("evilorg/x", cfg.github).ok).toBe(false);
    expect(isRepoAllowed("acme/x", cfg.github).ok).toBe(true);
    expect(isRepoAllowed("other/two", cfg.github).ok).toBe(true);
    expect(checkChannel("111", cfg).ok).toBe(true);
    expect(checkChannel("222", cfg).ok).toBe(false);
    expect(checkUser("333", cfg).ok).toBe(true);
    expect(checkUser("444", cfg).ok).toBe(false);
  });

  test("bridge config keeps a multi-line deny_channels", async () => {
    const path = tmpFile("allowlist.toml", MULTI);
    const r = await loadBridgeConfig({ filePath: path, env: {}, requireToken: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.allowlist.discord.denyChannels).toEqual(["222"]);
    expect(checkChannel("222", r.config.allowlist).ok).toBe(false);
  });
});

/** The parser before multi-line support, kept to prove single-line files read the same. */
function legacyParse(text: string): Record<string, Record<string, string[]>> {
  const parseList = (raw: string) => raw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  const out: Record<string, Record<string, string[]>> = {};
  let section = "";
  for (const lineRaw of text.split(/\r?\n/)) {
    const line = lineRaw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const sec = line.match(/^\[([^\]]+)\]$/);
    if (sec) {
      section = sec[1]!.trim().toLowerCase();
      if (!out[section]) out[section] = {};
      continue;
    }
    if (!section) continue;
    const kv = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
    if (!kv) continue;
    const key = kv[1]!.toLowerCase();
    const val = kv[2]!.trim();
    if (val.startsWith("[")) {
      out[section]![key] = val
        .replace(/^\[/, "")
        .replace(/\]$/, "")
        .split(",")
        .map((p) => p.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else {
      out[section]![key] = parseList(val.replace(/^["']|["']$/g, ""));
    }
  }
  return out;
}

describe("allowlist TOML: single-line files read exactly as before", () => {
  const SINGLE = [
    `# top comment\ntop = ["ignored"]\n[github]\norgs = ["CorvidLabs", "other"]\nrepos = ['CorvidLabs/Corvidinho', "acme/*"]\nusers = []\ndeny_repos = ["corvidlabs/secret",]   # trailing comma\ndeny_orgs = [evilorg, badorg]\ndeny_users = "mallory, eve"\nOrganizations = ["Caps"]\n`,
    `[Discord]\nchannels = [111, 222]\nroles = admin mod\nusers = "333"\ndeny_channels = []\nDENY_USERS = ['444']\n\n[owner]\ndiscord_id = "000000000000000000"\ngithub_login = "your-github-login"\ndisplay = "Your Name # not a comment?"\n[ github ]\nrepos = ["late/one"]\n`,
    `[github]\r\norgs = ["a"]\r\n[discord]\r\nchannels = ["1"] # c\r\n`,
    "# Corvidinho allowlist (ALLOW-4). Created by /admin (ADMIN-1/2); see allowlist.example.toml.\n# Default-deny: empty allow lists refuse. Deny overrides always win.\n\n[discord]\nusers = [\"123\"]\n",
    readFileSync(join(import.meta.dir, "..", "allowlist.example.toml"), "utf8"),
  ];
  for (const [i, text] of SINGLE.entries()) {
    test(`corpus #${i} matches the previous parser`, () => {
      expect(parseSimpleToml(text)).toEqual(legacyParse(text));
    });
  }
});

describe("allowlist TOML: anything unparseable in an allow/deny section fails closed", () => {
  const BAD: Array<[string, string]> = [
    ["unterminated array at EOF", `[github]\ndeny_repos = [\n  "corvidlabs/secret",\n`],
    ["unterminated array runs into a header", `[github]\ndeny_repos = [\n  "corvidlabs/secret",\n[discord]\nchannels = ["1"]\n`],
    ["unterminated array runs into a key", `[github]\ndeny_repos = [\n  "corvidlabs/secret",\norgs = ["corvidlabs"]\n`],
    ["missing comma", `[github]\ndeny_repos = ["a/b" "c/d"]\n`],
    ["double comma", `[github]\ndeny_repos = ["a/b",,"c/d"]\n`],
    ["leading comma", `[github]\ndeny_repos = [, "a/b"]\n`],
    ["unterminated string", `[github]\ndeny_repos = ["a/b]\n`],
    ["text after the array", `[github]\ndeny_repos = ["a/b"] x\n`],
    ["empty value", `[github]\ndeny_repos =\n`],
    ["nested array", `[github]\ndeny_repos = [["a/b"]]\n`],
    ["triple-quoted string", `[github]\ndeny_repos = """a/b"""\n`],
    ["unsupported escape", `[github]\ndeny_repos = ["a\\nb"]\n`],
    ["hyphenated key", `[github]\ndeny-repos = ["a/b"]\n`],
    ["quoted key", `[github]\n"deny_repos" = ["a/b"]\n`],
    ["dotted top-level key", `github.deny_repos = ["a/b"]\n`],
    ["stray continuation line", `[github]\ndeny_repos = ["a/b"]\n  "c/d",\n]\n`],
    ["malformed header", `[github\ndeny_repos = ["a/b"]\n`],
    ["array-of-tables header", `[[github]]\ndeny_repos = ["a/b"]\n`],
    ["quoted header", `["github"]\ndeny_repos = ["a/b"]\n`],
    ["discord deny_users unterminated", `[discord]\nchannels = ["1"]\ndeny_users = [\n  "2",\n`],
    ["deny list at the top level", `deny_repos = ["a/b"]\n[github]\norgs = ["a"]\n`],
    ["deny list in another section", `[github]\norgs = ["a"]\n[notes]\ndeny_repos = ["a/b"]\n`],
    ["deny list under a loose header", `[discord]\nchannels = ["1"]\n[my notes]\ndeny_users = ["2"]\n`],
    ["hyphenated deny key in another section", `[meta]\ndeny-repos = ["a/b"]\n`],
    ["loose header naming discord", `[my discord notes]\nx = 1\n`],
    ["array-of-tables discord", `[[discord]]\nchannels = ["1"]\n`],
    ["stray array line as a header", `[github]\norgs = ["a"]\n["b", "c"]\n`],
    ["unbalanced brackets", `[[rules]\nx = 1\n`],
  ];
  for (const [name, text] of BAD) {
    test(`parseSimpleToml throws: ${name}`, () => {
      expect(() => parseSimpleToml(text)).toThrow(/allowlist TOML line \d+/);
    });
  }

  test("errors name the line and key, never the values", () => {
    let msg = "";
    try {
      parseSimpleToml(`[github]\norgs = ["corvidlabs"]\ndeny_repos = [\n  "corvidlabs/secret" "x/y",\n]\n`);
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain("line 4");
    expect(msg).toContain("[github].deny_repos");
    expect(msg).not.toContain("corvidlabs/secret");
  });

  test("unrelated sections stay lenient, loose headers included", () => {
    const t = parseSimpleToml(
      `[my notes]\nanything = goes "here"\n[[rules]]\nx = 1\n['quoted']\ny = [unclosed\n[github]\norgs = ["a"]\n[discord]\nchannels = ["1"]\n`,
    );
    expect(t.github?.orgs).toEqual(["a"]);
    expect(t.discord?.channels).toEqual(["1"]);
    expect(Object.keys(t)).toEqual(["my notes", "rules", "quoted", "github", "discord"]);
  });

  test("a pasted non-breaking space (U+00A0) is whitespace", () => {
    const nb = "\u00a0";
    const t = parseSimpleToml(
      `[github]\norgs =${nb}[${nb}"a",${nb}\n${nb}${nb}"b"${nb}]${nb}\ndeny_repos = [${nb}"a/x"${nb},${nb}"a/y"]\n`,
    );
    expect(t.github?.orgs).toEqual(["a", "b"]);
    expect(t.github?.deny_repos).toEqual(["a/x", "a/y"]);
  });

  test("[owner] (read by identity/owner.ts) stays lenient", () => {
    const t = parseSimpleToml(`[owner]\ndisplay = "Leif "the" boss"\n[github]\norgs = ["a"]\n`);
    expect(t.github?.orgs).toEqual(["a"]);
  });

  test("loadAllowlistFile reports a malformed TOML file as an error", async () => {
    const path = tmpFile("allowlist.toml", `[github]\ndeny_repos = [\n  "corvidlabs/secret"\n`);
    const r = await loadAllowlistFile(path);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("line 2");
  });

  test("loadAllowlist throws instead of falling back to env allow (no deny-to-allow)", async () => {
    const path = tmpFile("allowlist.toml", `[github]\ndeny_repos = [\n  "corvidlabs/secret"\n`);
    const env = { CORVIDINHO_GITHUB_ALLOW_ORGS: "corvidlabs" };
    await expect(loadAllowlist({ filePath: path, env })).rejects.toThrow(/allowlist file/);
  });

  test("a malformed JSON file also fails closed; a missing file is still env-only", async () => {
    const json = tmpFile("allowlist.json", `{"github": {"deny_repos": ["corvidlabs/secret"]`);
    const env = { CORVIDINHO_GITHUB_ALLOW_ORGS: "corvidlabs" };
    await expect(loadAllowlist({ filePath: json, env })).rejects.toThrow(/allowlist file/);
    const missing = join(mkdtempSync(join(tmpdir(), "corvidinho-toml-")), "none.toml");
    dirs.push(join(missing, ".."));
    const cfg = await loadAllowlist({ filePath: missing, env });
    expect(cfg.sourcePath).toBeNull();
    expect(isRepoAllowed("corvidlabs/x", cfg.github).ok).toBe(true);
  });

  test("bridge and watch refuse to start on a malformed file (code allowlist)", async () => {
    const path = tmpFile("allowlist.toml", `[discord]\nchannels = ["1"]\ndeny_channels = [\n  "2",\n`);
    const bridge = await loadBridgeConfig({
      filePath: path,
      env: { DISCORD_CHANNEL_IDS: "2" },
      requireToken: false,
    });
    expect(bridge.ok).toBe(false);
    if (!bridge.ok) expect(bridge.code).toBe("allowlist");

    const gh = tmpFile("allowlist.toml", `[github]\ndeny_repos = [\n  "corvidlabs/secret",\n`);
    const watch = await loadWatchConfig({
      filePath: gh,
      env: {
        GITHUB_TOKEN: "fake",
        CORVIDINHO_WATCH_USERNAME: "corvid-agent",
        CORVIDINHO_GITHUB_ALLOW_ORGS: "corvidlabs",
      },
    });
    expect(watch.ok).toBe(false);
    if (!watch.ok) expect(watch.code).toBe("allowlist");
  });
});

describe("/admin round-trips multi-line files (ADMIN-1/2)", () => {
  test("users add keeps existing multi-line entries and every deny list", async () => {
    const text = `[discord]\nchannels = [\n  "111",\n]\nusers = [\n  "333", # first\n  "555",\n]\ndeny_users = [\n  "444",\n]\n[github]\ndeny_repos = [\n  "corvidlabs/secret",\n]\n`;
    const path = tmpFile("allowlist.toml", text);
    const env = { HOME: join(path, ".."), CORVIDINHO_ALLOWLIST_FILE: path };
    expect(readFileAdminList(text, "toml", "users")).toEqual(["333", "555"]);

    const live = await loadAllowlist({ env, home: join(path, "..") });
    const plan = planAdminListChange({ allowlist: live, env, key: "users", op: "add", id: "666" });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.plan.fileBefore).toEqual(["333", "555"]);
    expect(plan.plan.fileAfter).toEqual(["333", "555", "666"]);
    commitAdminListChange(plan.plan, { allowlist: live });

    const reloaded = await loadAllowlist({ env, home: join(path, "..") });
    expect(reloaded.discord.users).toEqual(["333", "555", "666"]);
    expect(reloaded.discord.channels).toEqual(["111"]);
    expect(reloaded.discord.denyUsers).toEqual(["444"]);
    expect(reloaded.github.denyRepos).toEqual(["corvidlabs/secret"]);
    expect(live.discord.users).toEqual(["333", "555", "666"]);
  });

  test("a malformed file is refused, not clobbered", async () => {
    const text = `[discord]\nchannels = ["111"]\nusers = [\n  "333"\n`;
    const path = tmpFile("allowlist.toml", text);
    const env = { HOME: join(path, ".."), CORVIDINHO_ALLOWLIST_FILE: path };
    const live = await loadAllowlist({ env, home: join(path, ".."), filePath: null });
    const plan = planAdminListChange({ allowlist: live, env, key: "users", op: "add", id: "666" });
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.error).toContain("could not be parsed");
    expect(readFileSync(path, "utf8")).toBe(text);
  });
});

describe("/admin rewrites around other multi-line arrays (ADMIN-1/2)", () => {
  async function admin(text: string, key: "users" | "channels", id: string) {
    const path = tmpFile("allowlist.toml", text);
    const home = join(path, "..");
    const env = { HOME: home, CORVIDINHO_ALLOWLIST_FILE: path };
    const live = await loadAllowlist({ env, home });
    const plan = planAdminListChange({ allowlist: live, env, home, key, op: "add", id });
    if (!plan.ok) return { plan, path, text: readFileSync(path, "utf8"), reloaded: null };
    commitAdminListChange(plan.plan, { allowlist: live });
    return { plan, path, text: readFileSync(path, "utf8"), reloaded: await loadAllowlist({ env, home }) };
  }

  test("users add with only a multi-line channels array goes after its closing ]", async () => {
    const r = await admin(`[discord]\nchannels = [\n  "111",\n  "222",\n]\n[owner]\ndiscord_id = "9"\n`, "users", "999");
    expect(r.text).toBe(`[discord]\nchannels = [\n  "111",\n  "222",\n]\nusers = ["999"]\n[owner]\ndiscord_id = "9"\n`);
    expect(r.reloaded?.discord.channels).toEqual(["111", "222"]);
    expect(r.reloaded?.discord.users).toEqual(["999"]);
  });

  test("CRLF: same, line endings kept", async () => {
    const r = await admin(`[discord]\r\nchannels = [\r\n  "111",\r\n]\r\n`, "users", "999");
    expect(r.text).toBe(`[discord]\r\nchannels = [\r\n  "111",\r\n]\r\nusers = ["999"]\r\n`);
    expect(r.reloaded?.discord.users).toEqual(["999"]);
  });

  test("channels add after a multi-line deny_users keeps the deny list", async () => {
    const r = await admin(`[discord]\nusers = ["1"]\ndeny_users = [\n  "5", # blocked\n]\n\n[github]\norgs = ["a"]\n`, "channels", "999");
    expect(r.text).toBe(`[discord]\nusers = ["1"]\ndeny_users = [\n  "5", # blocked\n]\nchannels = ["999"]\n\n[github]\norgs = ["a"]\n`);
    expect(r.reloaded?.discord.denyUsers).toEqual(["5"]);
    expect(r.reloaded?.discord.channels).toEqual(["999"]);
    expect(r.reloaded?.github.orgs).toEqual(["a"]);
  });

  test('a "]" or "#" inside a quoted item does not end the array or start a comment', async () => {
    const r = await admin(
      `[discord]\nchannels = ["1"]\nusers = [ # team\n  "a]b",\n  "2",\n]\nroles = ["x#y"] # keep\n`,
      "users",
      "3",
    );
    expect(r.text).toBe(`[discord]\nchannels = ["1"]\nusers = ["a]b", "2", "3"] # team\nroles = ["x#y"] # keep\n`);
    expect(r.reloaded?.discord.users).toEqual(["a]b", "2", "3"]);
    expect(r.reloaded?.discord.roles).toEqual(["x#y"]);
  });

  test("safety net: a rewrite that would not reload the same is refused and nothing is written", async () => {
    // An entry holding both quote kinds cannot be written back by the one-line writer.
    const text = `[discord]\nchannels = ["1"]\nusers = ["it's \\"q\\""]\n`;
    const r = await admin(text, "users", "3");
    expect(r.plan.ok).toBe(false);
    if (!r.plan.ok) expect(r.plan.error).toContain("refusing to write the allowlist file");
    expect(r.text).toBe(text);
  });
});

describe("gates refuse a malformed file without throwing", () => {
  test("discord-post-message refuses with exit 3 and the file error", async () => {
    loadBuiltins();
    const path = tmpFile("allowlist.toml", `[discord]\nchannels = ["999"]\ndeny_channels = [\n  "999",\n`);
    const keys = ["CORVIDINHO_ALLOWLIST_FILE", "CORVIDINHO_DISCORD_ALLOW_CHANNELS", "DISCORD_TOKEN", "CORVIDINHO_DISCORD_DRY_RUN"];
    const prev = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    Object.assign(process.env, {
      CORVIDINHO_ALLOWLIST_FILE: path,
      CORVIDINHO_DISCORD_ALLOW_CHANNELS: "999",
      DISCORD_TOKEN: "fake",
      CORVIDINHO_DISCORD_DRY_RUN: "1",
    });
    try {
      const r = await runPlugin({
        name: "discord-post-message",
        args: ["--channel", "999", "--content", "hi"],
        nonInteractive: true,
        allowlist: ["discord-post-message"],
      });
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(3);
      expect(r.error).toContain("not authorized: allowlist file unreadable or malformed");
      expect(r.error).toContain("line 3: [discord].deny_channels");
    } finally {
      for (const k of keys) {
        if (prev[k] === undefined) delete process.env[k];
        else process.env[k] = prev[k];
      }
    }
  });

  test("corvidinho doctor fails the allowlist-file check with the parse error", async () => {
    const path = tmpFile("allowlist.toml", `[github]\ndeny_repos = [\n  "corvidlabs/secret",\n`);
    const doctor = async (file: string) => {
      const proc = Bun.spawn(["bun", "src/cli.ts", "doctor"], {
        cwd: join(import.meta.dir, ".."),
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, CORVIDINHO_ALLOWLIST_FILE: file, HOME: join(path, "..") },
      });
      const [, out] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
      return out;
    };
    const bad = await doctor(path);
    expect(bad).toContain("[fail] allowlist-file: allowlist file unreadable or malformed");
    expect(bad).toContain("line 2: [github].deny_repos");
    expect(bad).not.toContain("corvidlabs/secret");

    writeFileSync(path, `[github]\ndeny_repos = [\n  "corvidlabs/secret",\n]\n`);
    expect(await doctor(path)).toContain("[ok] allowlist-file:");
    expect(await doctor(join(path, "..", "none.toml"))).toContain("[info] allowlist-file:");
  });
});
