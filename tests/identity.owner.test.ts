/**
 * IDENTITY-1 / IDENTITY-3 owner record (REQ-discord-042) + doctor owner line
 * (REQ-cli-042). Fixture-only: temp files, no live tokens, no network.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  OWNER_DISPLAY_MAX,
  formatOwnerDoctorDetail,
  formatOwnerStatus,
  getOwner,
  isOwnerDiscord,
  isOwnerGithub,
  loadOwnerConfig,
  ownerFieldsFromEnv,
  ownerFieldsFromJson,
  parseOwnerToml,
  resolveOwner,
  type OwnerRecord,
} from "../src/identity/index.ts";

// Fake snowflakes (shape only; not real accounts).
const OWNER_ID = "100000000000000001";
const FILE_ID = "100000000000000002";
const OTHER_ID = "100000000000000009";

const root = mkdtempSync(join(tmpdir(), "corvidinho-owner-"));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeTmp(name: string, text: string): string {
  const p = join(root, name);
  writeFileSync(p, text);
  return p;
}

const OWNER_TOML = `
[discord]
channels = ["111"]

[owner]
# owner of this bot VM
discord_id = "${FILE_ID}"
github_login = "0xLeif"   # trailing comment
display = "Leif #1, owner"

[github]
users = ["someone"]
`;

describe("parseOwnerToml", () => {
  test("reads quoted/bare scalars, keeps # inside quotes, ignores other sections", () => {
    const f = parseOwnerToml(OWNER_TOML);
    expect(f).toEqual({
      discordId: FILE_ID,
      githubLogin: "0xLeif",
      display: "Leif #1, owner",
    });
    expect(parseOwnerToml(`[owner]\ndiscord_id = ${OWNER_ID} # bare\n`).discordId).toBe(
      OWNER_ID,
    );
  });

  test("discord_id outside [owner] is not an owner", () => {
    expect(parseOwnerToml(`[discord]\ndiscord_id = "${OWNER_ID}"\n`)).toEqual({});
    expect(parseOwnerToml("")).toEqual({});
  });
});

describe("resolveOwner precedence + validation", () => {
  test("env overrides file per field", () => {
    const r = resolveOwner(
      { discordId: FILE_ID, githubLogin: "file-login", display: "File Name" },
      { discordId: OWNER_ID, display: "Env Name" },
    );
    expect(r.owner).toEqual({
      discordId: OWNER_ID,
      githubLogin: "file-login",
      display: "Env Name",
    });
    expect(r.issues).toEqual([]);
  });

  test("blank env fields do not wipe file fields", () => {
    const env = ownerFieldsFromEnv({
      CORVIDINHO_OWNER_DISCORD_ID: "   ",
      CORVIDINHO_OWNER_DISPLAY: "",
    });
    const r = resolveOwner({ discordId: FILE_ID, display: "File Name" }, env);
    expect(r.owner).toEqual({ discordId: FILE_ID, display: "File Name" });
  });

  test("env-only owner", () => {
    const r = resolveOwner(
      null,
      ownerFieldsFromEnv({
        CORVIDINHO_OWNER_DISCORD_ID: ` ${OWNER_ID} `,
        CORVIDINHO_OWNER_GITHUB_LOGIN: "@0xLeif",
        CORVIDINHO_OWNER_DISPLAY: "  Leif \n Owner ",
      }),
    );
    expect(r.owner).toEqual({
      discordId: OWNER_ID,
      githubLogin: "0xleif",
      display: "Leif Owner",
    });
  });

  test("empty config ⇒ no owner, no issues (IDENTITY-3)", () => {
    expect(resolveOwner({}, {})).toEqual({ owner: null, issues: [] });
    expect(resolveOwner(null, ownerFieldsFromEnv({}))).toEqual({
      owner: null,
      issues: [],
    });
  });

  test("login or display without a Discord id ⇒ no owner + hint", () => {
    const r = resolveOwner({ githubLogin: "0xLeif", display: "Leif" }, {});
    expect(r.owner).toBeNull();
    expect(r.issues.join(" ")).toContain("no Discord id");
    expect(r.issues.join(" ")).not.toContain("0xleif");
  });

  test("non-snowflake Discord id ⇒ no owner; issue never echoes the value", () => {
    const r = resolveOwner({}, { discordId: "leif-handle" });
    expect(r.owner).toBeNull();
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toContain("snowflake");
    expect(r.issues[0]).not.toContain("leif-handle");
  });

  test("invalid GitHub login is ignored with a value-free issue", () => {
    const r = resolveOwner({ discordId: OWNER_ID, githubLogin: "bad login!" }, {});
    expect(r.owner).toEqual({ discordId: OWNER_ID });
    expect(r.issues[0]).toContain("github_login");
    expect(r.issues[0]).not.toContain("bad login");
  });

  test("display is single-line and capped", () => {
    const r = resolveOwner({ discordId: OWNER_ID, display: "x".repeat(200) }, {});
    expect(r.owner?.display).toHaveLength(OWNER_DISPLAY_MAX);
  });
});

describe("JSON allowlist owner", () => {
  test("string fields load", () => {
    const r = ownerFieldsFromJson({
      owner: { discord_id: OWNER_ID, github_login: "0xLeif", display: "Leif" },
    });
    expect(r.issues).toEqual([]);
    expect(r.fields).toEqual({
      discordId: OWNER_ID,
      githubLogin: "0xLeif",
      display: "Leif",
    });
  });

  test("numeric discord_id is rejected (precision loss)", () => {
    const r = ownerFieldsFromJson({ owner: { discord_id: 123456789 } });
    expect(r.fields.discordId).toBeUndefined();
    expect(r.issues[0]).toContain("quoted string");
    expect(r.issues[0]).not.toContain("123456789");
  });

  test("missing owner object ⇒ empty", () => {
    expect(ownerFieldsFromJson({ discord: {} })).toEqual({ fields: {}, issues: [] });
    expect(ownerFieldsFromJson(null)).toEqual({ fields: {}, issues: [] });
  });
});

describe("loadOwnerConfig / getOwner (bot-VM file + env; ALLOW-4)", () => {
  test("file-only owner from an explicit allowlist path", async () => {
    const path = writeTmp("allow-file.toml", OWNER_TOML);
    const owner = await getOwner({ env: {}, filePath: path });
    expect(owner).toEqual({
      discordId: FILE_ID,
      githubLogin: "0xleif",
      display: "Leif #1, owner",
    });
  });

  test("env overrides the file; filePath null ⇒ env only", async () => {
    const path = writeTmp("allow-env.toml", OWNER_TOML);
    const env = {
      CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID,
      CORVIDINHO_OWNER_DISPLAY: "Env Leif",
    };
    expect(await getOwner({ env, filePath: path })).toEqual({
      discordId: OWNER_ID,
      githubLogin: "0xleif",
      display: "Env Leif",
    });
    expect(await getOwner({ env, filePath: null })).toEqual({
      discordId: OWNER_ID,
      display: "Env Leif",
    });
    expect(await getOwner({ env: {}, filePath: null })).toBeNull();
  });

  test("resolves CORVIDINHO_ALLOWLIST_FILE and ~/.config/corvidinho like the allowlist", async () => {
    const viaEnv = writeTmp("allow-via-env.toml", OWNER_TOML);
    expect(
      (await getOwner({ env: { CORVIDINHO_ALLOWLIST_FILE: viaEnv }, home: root }))
        ?.discordId,
    ).toBe(FILE_ID);

    const home = join(root, "home");
    mkdirSync(join(home, ".config", "corvidinho"), { recursive: true });
    writeFileSync(
      join(home, ".config", "corvidinho", "allowlist.json"),
      JSON.stringify({ owner: { discord_id: OWNER_ID, display: "Json Leif" } }),
    );
    expect(await getOwner({ env: {}, home })).toEqual({
      discordId: OWNER_ID,
      display: "Json Leif",
    });
  });

  test("survives restarts: reloading the same config yields the same owner", async () => {
    const path = writeTmp("allow-restart.toml", OWNER_TOML);
    const first = await getOwner({ env: {}, filePath: path });
    const second = await getOwner({ env: {}, filePath: path });
    expect(second).toEqual(first);
    expect(second?.discordId).toBe(FILE_ID);
  });

  test("missing or unreadable file fails closed (no owner from file)", async () => {
    expect(
      await loadOwnerConfig({ env: {}, filePath: join(root, "nope.toml") }),
    ).toEqual({ owner: null, issues: [] });
    const dir = join(root, "a-directory.toml");
    mkdirSync(dir, { recursive: true });
    const r = await loadOwnerConfig({
      env: { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID },
      filePath: dir,
    });
    expect(r.owner).toEqual({ discordId: OWNER_ID });
    expect(r.issues.join(" ")).toContain("could not be read");
  });
});

describe("owner matching", () => {
  const owner: OwnerRecord = {
    discordId: OWNER_ID,
    githubLogin: "0xleif",
    display: "Leif",
  };

  test("Discord: exact snowflake only", () => {
    expect(isOwnerDiscord(owner, OWNER_ID)).toBe(true);
    expect(isOwnerDiscord(owner, ` ${OWNER_ID} `)).toBe(true);
    expect(isOwnerDiscord(owner, OTHER_ID)).toBe(false);
    expect(isOwnerDiscord(owner, "")).toBe(false);
    expect(isOwnerDiscord(null, OWNER_ID)).toBe(false);
    expect(isOwnerDiscord(undefined, OWNER_ID)).toBe(false);
  });

  test("GitHub: login is case-insensitive, optional @", () => {
    expect(isOwnerGithub(owner, "0xLeif")).toBe(true);
    expect(isOwnerGithub(owner, "@0XLEIF")).toBe(true);
    expect(isOwnerGithub(owner, "0xleif-bot")).toBe(false);
    expect(isOwnerGithub(null, "0xLeif")).toBe(false);
  });

  test("display name never matches", () => {
    const displayOnlyLogin: OwnerRecord = { discordId: OWNER_ID, display: "0xLeif" };
    expect(isOwnerGithub(displayOnlyLogin, "0xLeif")).toBe(false);
    expect(isOwnerDiscord(displayOnlyLogin, "0xLeif")).toBe(false);
    expect(isOwnerDiscord(owner, "Leif")).toBe(false);
    expect(isOwnerGithub(owner, "Leif")).toBe(false);
  });
});

describe("owner status lines (display only)", () => {
  test("formatOwnerStatus", () => {
    expect(formatOwnerStatus(null)).toBe("Owner configured: no");
    expect(formatOwnerStatus({ discordId: OWNER_ID })).toBe("Owner configured: yes");
    const line = formatOwnerStatus({
      discordId: OWNER_ID,
      githubLogin: "0xleif",
      display: "Leif",
    });
    expect(line).toBe("Owner configured: yes (Leif)");
    expect(line).not.toContain(OWNER_ID);
    expect(line).not.toContain("0xleif");
  });

  test("formatOwnerDoctorDetail", () => {
    const yes = formatOwnerDoctorDetail({
      owner: { discordId: OWNER_ID, githubLogin: "0xleif", display: "Leif" },
      issues: [],
    });
    expect(yes).toBe("configured: yes (Leif)");
    expect(
      formatOwnerDoctorDetail({ owner: { discordId: OWNER_ID }, issues: [] }),
    ).toBe("configured: yes (no display name set)");
    const no = formatOwnerDoctorDetail({ owner: null, issues: ["x issue"] });
    expect(no).toStartWith("configured: no");
    expect(no).toContain("CORVIDINHO_OWNER_DISCORD_ID");
    expect(no).toContain("x issue");
  });
});

describe("corvidinho doctor owner line (REQ-cli-042)", () => {
  function baseEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const k of Object.keys(env)) {
      if (k.startsWith("CORVIDINHO_OWNER_")) delete env[k];
    }
    env.HOME = join(root, "doctor-home");
    env.CORVIDINHO_ALLOWLIST_FILE = join(root, "doctor-missing.toml");
    return env;
  }

  async function runDoctor(env: NodeJS.ProcessEnv): Promise<{ code: number; out: string }> {
    const proc = Bun.spawn(["bun", "src/cli.ts", "doctor"], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
      env,
    });
    const [code, out, err] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    return { code, out: out + err };
  }

  test("configured owner shows yes + display only; missing owner does not change exit code", async () => {
    const path = writeTmp(
      "doctor-allow.toml",
      `[owner]\ndiscord_id = "${OWNER_ID}"\ngithub_login = "0xLeif"\ndisplay = "Leif Doctor"\n`,
    );
    const withOwner = await runDoctor({ ...baseEnv(), CORVIDINHO_ALLOWLIST_FILE: path });
    expect(withOwner.out).toContain("[ok] owner: configured: yes (Leif Doctor)");
    expect(withOwner.out).not.toContain(OWNER_ID);
    expect(withOwner.out.toLowerCase()).not.toContain("0xleif");

    const without = await runDoctor(baseEnv());
    expect(without.out).toContain("[info] owner: configured: no");
    expect(without.out).not.toContain(OWNER_ID);
    expect(without.code).toBe(withOwner.code);
  }, 30_000);

  test("legacy admin lists get a warn line and never change the exit code (IDENTITY-2)", async () => {
    const env = baseEnv();
    delete env.CORVIDINHO_DISCORD_ADMIN_USERS;
    delete env.CORVIDINHO_DISCORD_ADMIN_ROLES;
    const clean = await runDoctor(env);
    expect(clean.out).not.toContain("admin-lists");
    const withLists = await runDoctor({
      ...env,
      CORVIDINHO_DISCORD_ADMIN_USERS: "123456789012345678",
      CORVIDINHO_DISCORD_ADMIN_ROLES: "234567890123456789",
    });
    expect(withLists.out).toContain("[warn] admin-lists:");
    expect(withLists.out).toContain("owner-only (IDENTITY-2)");
    expect(withLists.out).not.toContain("123456789012345678");
    expect(withLists.code).toBe(clean.code);
  }, 30_000);
});
