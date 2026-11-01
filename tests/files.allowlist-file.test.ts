/**
 * IDENTITY-6 (hi/identity.md): "Only I add, change or remove a person's
 * links, never through chat." ALLOW-6 (hi/allow.md): "Widening an allowlist
 * is an explicit config change I make; the agent does not grow trust from
 * chatting with someone new."
 *
 * In a project folder that isn't a git repo the owner's talk runs in the
 * folder itself (AGENT-1.a), so the allowlist file the process reads people
 * from can sit inside the project: `CORVIDINHO_ALLOWLIST_FILE` pointing into
 * it, or the bridge running in a non-git $HOME (the default
 * `~/.config/corvidinho/allowlist.toml`). files-write, files-edit and
 * files-delete refuse that file wherever the write would land (relative,
 * absolute, through a symlink, a hard link), for every caller, the owner's
 * session included; `/admin people` stays the way links change.
 *
 * Temp folders only; no token, no network.
 */
import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry } from "../src/plugins/registry.ts";
import { ACTING_ROLE_ENV, ACTING_WORK_TASK_ENV, resolveActingIsAdmin } from "../src/plugins/roles.ts";
import { runPlugin } from "../src/plugins/run.ts";

const REPO = resolve(import.meta.dir, "..");
const OWNER_ID = "181969874455756800";
const TOFU = "200000000000000002"; // team
const PAT = "200000000000000003"; // community
const MALLORY = "300000000000000009"; // a stranger a chat would link

const ALLOWLIST = [
  `[discord]`,
  `channels = ["600000000000000006"]`,
  ``,
  `[owner]`,
  `discord_id = "${OWNER_ID}"`,
  `display = "Leif"`,
  ``,
  `[people.tofu]`,
  `display = "Tofu"`,
  `role = "team"`,
  `discord_ids = ["${TOFU}"]`,
  ``,
  `[people.pat]`,
  `display = "Pat"`,
  `role = "community"`,
  `discord_ids = ["${PAT}"]`,
  ``,
].join("\n");

/** The two chat asks IDENTITY-6 is about: link an account, change a role. */
const LINK = { old: `discord_ids = ["${TOFU}"]`, new: `discord_ids = ["${TOFU}", "${MALLORY}"]` };
const ROLE = { old: `role = "community"`, new: `role = "team"` };

const KEYS = [
  "CORVIDINHO_ACTING_IS_ADMIN",
  "CORVIDINHO_ACTING_DISCORD_USER_ID",
  ACTING_ROLE_ENV,
  ACTING_WORK_TASK_ENV,
  "CORVIDINHO_OWNER_DISCORD_ID",
  "CORVIDINHO_ALLOWLIST_FILE",
  "CORVIDINHO_ALLOWLIST",
] as const;

const temps: string[] = [];
let saved: Record<string, string | undefined> = {};

function tempDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  temps.push(d);
  return d;
}

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  clearRegistry();
  loadBuiltins();
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  clearRegistry();
  loadBuiltins();
});

afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});

/** The owner's Discord session as the bridge stamps it. */
function ownerSession(): void {
  process.env.CORVIDINHO_ACTING_IS_ADMIN = "1";
  process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = OWNER_ID;
  process.env[ACTING_ROLE_ENV] = "owner";
  process.env[ACTING_WORK_TASK_ENV] = "0";
}

/** A non-git project folder holding the allowlist file the process reads. */
function projectWithAllowlist(): { project: string; file: string } {
  const project = join(tempDir("corvidinho-allowfile-"), "plain");
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, "notes.txt"), "live\n");
  const file = join(project, "allowlist.toml");
  writeFileSync(file, ALLOWLIST);
  return { project, file };
}

const write = (cwd: string, path: string, content = "planted") =>
  runPlugin({ name: "files-write", args: [path, content], cwd, nonInteractive: true, allowlist: [] });
const edit = (cwd: string, path: string, e: { old: string; new: string }) =>
  runPlugin({ name: "files-edit", args: [path, "--old", e.old, "--new", e.new], cwd, nonInteractive: true, allowlist: [] });
const del = (cwd: string, path: string) =>
  runPlugin({ name: "files-delete", args: [path], cwd, nonInteractive: true, allowlist: ["files-delete"] });

function expectRefused(r: { ok: boolean; exitCode?: number; error?: string }): void {
  expect(r.ok).toBe(false);
  expect(r.exitCode).toBe(2);
  expect(r.error ?? "").toContain("refused (IDENTITY-6)");
  expect(r.error ?? "").toContain("/admin people");
}

describe("IDENTITY-6: CORVIDINHO_ALLOWLIST_FILE inside a non-git project", () => {
  test("the owner's session can't link an account or change a role through files-edit; the file stays byte-for-byte", async () => {
    const { project, file } = projectWithAllowlist();
    process.env.CORVIDINHO_ALLOWLIST_FILE = file;
    ownerSession();
    // The session really is the owner's: the owner is read from this file.
    expect(await resolveActingIsAdmin()).toBe(true);

    for (const path of ["allowlist.toml", "./allowlist.toml", file]) {
      expectRefused(await edit(project, path, LINK));
      expectRefused(await edit(project, path, ROLE));
    }
    expect(readFileSync(file, "utf8")).toBe(ALLOWLIST);
  });

  test("files-write and files-delete are refused too, for the owner and the local CLI alike", async () => {
    const { project, file } = projectWithAllowlist();
    process.env.CORVIDINHO_ALLOWLIST_FILE = file;
    for (const who of ["cli", "owner"] as const) {
      if (who === "owner") ownerSession();
      for (const path of ["allowlist.toml", "./sub/../allowlist.toml", file]) {
        expectRefused(await write(project, path, ALLOWLIST.replace(ROLE.old, ROLE.new)));
        expectRefused(await del(project, path));
      }
      expectRefused(await edit(project, "allowlist.toml", LINK));
      expect(readFileSync(file, "utf8")).toBe(ALLOWLIST);
    }
  });

  test("a symlink to it and a hard link to it are judged where the write lands", async () => {
    const { project, file } = projectWithAllowlist();
    process.env.CORVIDINHO_ALLOWLIST_FILE = file;
    ownerSession();
    symlinkSync("allowlist.toml", join(project, "people.toml"));
    linkSync(file, join(project, "copy.toml"));
    expectRefused(await edit(project, "people.toml", LINK));
    expectRefused(await write(project, "people.toml"));
    expectRefused(await del(project, "people.toml"));
    expectRefused(await edit(project, "copy.toml", ROLE));
    expectRefused(await write(project, "copy.toml"));
    expect(readFileSync(file, "utf8")).toBe(ALLOWLIST);
    expect(existsSync(join(project, "people.toml"))).toBe(true);

    // The env names the link; writing the file it leads to is refused too.
    process.env.CORVIDINHO_ALLOWLIST_FILE = join(project, "people.toml");
    expectRefused(await write(project, "allowlist.toml"));
    expect(readFileSync(file, "utf8")).toBe(ALLOWLIST);
  });

  test("other project files are written, edited and deleted as before", async () => {
    const { project, file } = projectWithAllowlist();
    process.env.CORVIDINHO_ALLOWLIST_FILE = file;
    ownerSession();
    writeFileSync(join(project, "allowlist.example.toml"), ALLOWLIST);
    for (const path of ["notes.txt", "src/app.ts", "allowlist.example.toml", "sub/allowlist.toml"]) {
      const w = await write(project, path, "work");
      expect(w.error).toBeUndefined();
      expect(w.ok).toBe(true);
      expect(readFileSync(join(project, path), "utf8")).toBe("work");
    }
    const e = await edit(project, "notes.txt", { old: "work", new: "done" });
    expect(e.ok).toBe(true);
    expect(readFileSync(join(project, "notes.txt"), "utf8")).toBe("done");
    const d = await del(project, "src/app.ts");
    expect(d.ok).toBe(true);
    expect(existsSync(join(project, "src/app.ts"))).toBe(false);
    expect(readFileSync(file, "utf8")).toBe(ALLOWLIST);
  });
});

describe("IDENTITY-6: the default ~/.config/corvidinho/allowlist.toml under a non-git $HOME project", () => {
  /**
   * A process whose $HOME is the project (homedir() is read at start), with
   * no CORVIDINHO_ALLOWLIST_FILE: it reads people from the default path.
   * Prints whether the session is the owner's and each file-tool result.
   */
  async function runAsHome(home: string, calls: Array<[string, string[]]>): Promise<{
    admin: boolean;
    results: Array<{ ok: boolean; exitCode?: number; error?: string }>;
  }> {
    const script = join(tempDir("corvidinho-allowfile-script-"), "run.ts");
    writeFileSync(
      script,
      [
        `import { loadBuiltins } from ${JSON.stringify(join(REPO, "src/plugins/builtins.ts"))};`,
        `import { resolveActingIsAdmin } from ${JSON.stringify(join(REPO, "src/plugins/roles.ts"))};`,
        `import { runPlugin } from ${JSON.stringify(join(REPO, "src/plugins/run.ts"))};`,
        `loadBuiltins();`,
        `const calls = JSON.parse(process.env.ALLOWFILE_CALLS ?? "[]");`,
        `const admin = await resolveActingIsAdmin();`,
        `const results = [];`,
        `for (const [name, args] of calls) {`,
        `  const r = await runPlugin({ name, args, cwd: process.cwd(), nonInteractive: true, allowlist: ["files-delete"] });`,
        `  results.push({ ok: r.ok, exitCode: r.exitCode, error: r.error });`,
        `}`,
        `console.log(JSON.stringify({ admin, results }));`,
      ].join("\n"),
    );
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
    delete env.CORVIDINHO_ALLOWLIST_FILE;
    delete env.CORVIDINHO_OWNER_DISCORD_ID;
    Object.assign(env, {
      HOME: home,
      CORVIDINHO_ACTING_IS_ADMIN: "1",
      CORVIDINHO_ACTING_DISCORD_USER_ID: OWNER_ID,
      [ACTING_ROLE_ENV]: "owner",
      [ACTING_WORK_TASK_ENV]: "0",
      ALLOWFILE_CALLS: JSON.stringify(calls),
    });
    const proc = Bun.spawn([process.execPath, script], { cwd: home, env, stdout: "pipe", stderr: "pipe" });
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (code !== 0) throw new Error(`child exited ${code}: ${err}`);
    return JSON.parse(out.trim().split("\n").pop()!);
  }

  function homeProject(): { home: string; file: string } {
    const home = join(tempDir("corvidinho-allowfile-home-"), "home");
    mkdirSync(join(home, ".config", "corvidinho"), { recursive: true });
    writeFileSync(join(home, "notes.txt"), "live\n");
    const file = join(home, ".config", "corvidinho", "allowlist.toml");
    writeFileSync(file, ALLOWLIST);
    return { home, file };
  }

  test("the owner's session can't link an account or change a role through files-edit; write and delete are refused; other files are written", async () => {
    const { home, file } = homeProject();
    const rel = ".config/corvidinho/allowlist.toml";
    const { admin, results } = await runAsHome(home, [
      ["files-edit", [rel, "--old", LINK.old, "--new", LINK.new]],
      ["files-edit", [rel, "--old", ROLE.old, "--new", ROLE.new]],
      ["files-edit", [file, "--old", ROLE.old, "--new", ROLE.new]],
      ["files-write", [rel, ALLOWLIST.replace(ROLE.old, ROLE.new)]],
      ["files-delete", [rel]],
      ["files-write", ["notes.txt", "work"]],
    ]);
    // The session really is the owner's: the owner is read from the default file.
    expect(admin).toBe(true);
    for (const r of results.slice(0, 5)) expectRefused(r);
    expect(results[5]!.ok).toBe(true);
    expect(readFileSync(file, "utf8")).toBe(ALLOWLIST);
    expect(readFileSync(join(home, "notes.txt"), "utf8")).toBe("work");
  });

  test("creating the other default file, which the loader would read first, is refused", async () => {
    const { home, file } = homeProject();
    const json = join(home, ".config", "corvidinho", "allowlist.json");
    rmSync(file);
    writeFileSync(json, JSON.stringify({ owner: { discord_id: OWNER_ID } }));
    const { results } = await runAsHome(home, [
      ["files-write", [".config/corvidinho/allowlist.toml", ALLOWLIST]],
      ["files-write", [".config/corvidinho/allowlist.json", "{}"]],
    ]);
    for (const r of results) expectRefused(r);
    expect(existsSync(file)).toBe(false);
    expect(readFileSync(json, "utf8")).toBe(JSON.stringify({ owner: { discord_id: OWNER_ID } }));
  });
});

describe("isAllowlistFilePath", () => {
  test("judges the loaded file, both default paths and a dangling link's target, and nothing else", async () => {
    const { isAllowlistFilePath } = await import("../plugins/files/protectedPaths.ts");
    const home = join(tempDir("corvidinho-allowfile-unit-"), "home");
    const conf = join(home, ".config", "corvidinho");
    mkdirSync(conf, { recursive: true });
    const env = { HOME: home } as NodeJS.ProcessEnv;
    // No file yet: creating either default would make it the file read.
    expect(isAllowlistFilePath(join(conf, "allowlist.toml"), env, home)).toBe(true);
    expect(isAllowlistFilePath(join(conf, "allowlist.json"), env, home)).toBe(true);
    expect(isAllowlistFilePath(join(conf, "other.toml"), env, home)).toBe(false);
    expect(isAllowlistFilePath(join(home, "allowlist.toml"), env, home)).toBe(false);

    // A dangling default link: writing its target creates the file read.
    symlinkSync(join(home, "real.toml"), join(conf, "allowlist.toml"));
    expect(isAllowlistFilePath(join(home, "real.toml"), env, home)).toBe(true);

    // An explicit file elsewhere, also relative to home.
    const explicit = { HOME: home, CORVIDINHO_ALLOWLIST_FILE: "~/team/allow.toml" } as NodeJS.ProcessEnv;
    expect(isAllowlistFilePath(join(home, "team", "allow.toml"), explicit, home)).toBe(true);
    expect(isAllowlistFilePath(join(home, "team", "notes.toml"), explicit, home)).toBe(false);
  });
});
