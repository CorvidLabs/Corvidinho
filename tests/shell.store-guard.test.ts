/**
 * SAFE-4 (REQ-plugins-404): the shell and the language runners never wipe or
 * overwrite Corvidinho's own store. A shell or runner call has no second
 * phase, so a raw-SQL wipe, an overwrite or a truncate of the store is
 * refused before anything is spawned; memory-forget / memory-override keep
 * their two-phase confirm (REQ-plugins-011).
 *
 * Temp dirs only: HOME is a temp home and CORVIDINHO_DATA_DIR its
 * `~/.local/share/corvidinho`, seeded with memories through memory-store;
 * every refused shell command starts with `touch spawned`, and each test
 * reads the memories rows back. A fake `sqlite3` (bun:sqlite) stands in for
 * the CLI, so the wipes really happen where they are not refused. Imports
 * come only from modules the base has; the new module is imported inside its
 * own tests.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setConfirmTurnForTests } from "../src/memory/index.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry } from "../src/plugins/registry.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { RUNNERS, resolveRunnerBin, runRunner } from "../plugins/runners/index.ts";
import { runnerProdWhy, shellProdWhy } from "../plugins/shell/must-ask.ts";

const ENV_KEYS = [
  "HOME",
  "PATH",
  "CORVIDINHO_DATA_DIR",
  "CORVIDINHO_ACTING_DISCORD_USER_ID",
  "CORVIDINHO_ACTING_IS_ADMIN",
  "CORVIDINHO_ACTING_CONFIRM_TOKENS",
  "CORVIDINHO_OWNER_DISCORD_ID",
  "CORVIDINHO_MEMORY_INMEM",
] as const;

const OWNER = "900000000000000001";

/** Fake `sqlite3`: `sqlite3 [opts] DB [SQL…]`, SQL from stdin when none is given. */
const FAKE_SQLITE3 = `#!/usr/bin/env bun
import { Database } from "bun:sqlite";
const pos = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const db = new Database(pos[0] ?? ":memory:");
const sql = pos.length > 1 ? pos.slice(1).join(";\\n") : require("node:fs").readFileSync(0, "utf8");
db.exec(sql);
db.close();
`;

const bases: string[] = [];
let saved: Record<string, string | undefined> = {};
let fakeBin = "";
let home = "";
let data = "";
let db = "";
let repo = "";
let seeded: unknown[] = [];

function tempBase(prefix: string): string {
  const b = mkdtempSync(join(tmpdir(), prefix));
  bases.push(b);
  return b;
}

beforeAll(() => {
  fakeBin = join(tempBase("corvidinho-store-guard-bin-"), "bin");
  mkdirSync(fakeBin, { recursive: true });
  writeFileSync(join(fakeBin, "sqlite3"), FAKE_SQLITE3);
  chmodSync(join(fakeBin, "sqlite3"), 0o755);
});

afterAll(() => {
  for (const b of bases) rmSync(b, { recursive: true, force: true });
});

function actAs(userId: string | undefined, admin = false): void {
  if (userId === undefined) delete process.env.CORVIDINHO_ACTING_DISCORD_USER_ID;
  else process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = userId;
  if (admin) process.env.CORVIDINHO_ACTING_IS_ADMIN = "1";
  else delete process.env.CORVIDINHO_ACTING_IS_ADMIN;
}

/** The memories rows, or why they can't be read (a wiped or truncated store). */
function rows(): unknown {
  try {
    const d = new Database(db, { readonly: true });
    try {
      return d
        .query("SELECT id, owner_user_id, category, key, content, deleted_at FROM memories ORDER BY id")
        .all();
    } finally {
      d.close();
    }
  } catch (e) {
    return `unreadable: ${e instanceof Error ? e.message : String(e)}`;
  }
}

beforeEach(async () => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  const base = tempBase("corvidinho-store-guard-");
  home = join(base, "home");
  data = join(home, ".local", "share", "corvidinho");
  db = join(data, "corvidinho.db");
  repo = join(base, "repo");
  mkdirSync(data, { recursive: true });
  mkdirSync(repo, { recursive: true });
  // A worktree link to the data dir.
  symlinkSync(data, join(repo, "store"));
  // A fixture DB of the run's own, which SQL may change.
  const fx = new Database(join(repo, "fixture.db"), { create: true });
  fx.exec("CREATE TABLE t (x INTEGER); INSERT INTO t VALUES (1), (2);");
  fx.close();
  process.env.HOME = home;
  process.env.CORVIDINHO_DATA_DIR = data;
  process.env.PATH = `${fakeBin}:${saved.PATH ?? "/usr/bin:/bin"}`;
  delete process.env.CORVIDINHO_OWNER_DISCORD_ID;
  delete process.env.CORVIDINHO_MEMORY_INMEM;
  delete process.env.CORVIDINHO_ACTING_CONFIRM_TOKENS;
  setConfirmTurnForTests(() => "turn-1");
  clearRegistry();
  loadBuiltins();
  for (const [user, key, content] of [
    ["u1", "leif", "likes corvids"],
    ["u2", "deploy", "ships on fridays"],
  ] as const) {
    actAs(user);
    const r = await runPlugin({
      name: "memory-store",
      args: ["--category", "person", "--key", key, content],
      nonInteractive: true,
      allowlist: [],
    });
    expect(r.ok).toBe(true);
  }
  actAs(undefined);
  seeded = rows() as unknown[];
  expect(seeded).toHaveLength(2);
});

afterEach(() => {
  setConfirmTurnForTests(null);
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const shell = (command: string) =>
  runPlugin({
    name: "shell-exec",
    args: ["--command", command],
    cwd: repo,
    nonInteractive: true,
    allowlist: ["shell-exec"],
  });

type Refused = { refused?: boolean; rule?: string; script?: string | null };

/** `shell-exec` refused `command` for SAFE-4, spawned nothing, and the memories are all there. */
async function expectStoreRefused(command: string, script: string | null = null): Promise<string> {
  const result = await shell(`touch spawned; ${command}`);
  const msg = result.error ?? "";
  expect({ command, ok: result.ok, exitCode: result.exitCode }).toEqual({ command, ok: false, exitCode: 2 });
  expect(msg).toStartWith("shell-exec refused (SAFE-4): ");
  expect(msg).toContain("memory-forget or memory-override");
  expect(msg).toContain("two-phase confirm");
  const d = result.data as Refused | undefined;
  expect(d?.refused).toBe(true);
  expect(d?.rule).toBe("SAFE-4");
  expect(d?.script ?? null).toBe(script);
  expect({ command, spawned: existsSync(join(repo, "spawned")) }).toEqual({ command, spawned: false });
  expect({ command, rows: rows() }).toEqual({ command, rows: seeded });
  return msg;
}

describe("SAFE-4: shell-exec refuses raw-SQL wipes and overwrites of the store (REQ-plugins-404)", () => {
  test("each wipe or overwrite form is refused before spawning, and the memories stay", async () => {
    const forms = [
      // Raw SQL on the store, spelled every way the shell reaches it.
      `sqlite3 ~/.local/share/corvidinho/corvidinho.db "DELETE FROM memories"`,
      `sqlite3 ${db} 'DROP TABLE memories'`,
      `sqlite3 "$CORVIDINHO_DATA_DIR/corvidinho.db" 'DELETE FROM memories'`,
      `sqlite3 "\${HOME}/.local/share/corvidinho/corvidinho.db" 'DELETE FROM memories'`,
      `sqlite3 store/corvidinho.db 'DELETE FROM memories'`,
      `echo 'DELETE FROM memories;' | sqlite3 "$CORVIDINHO_DATA_DIR/corvidinho.db"`,
      `sqlite3 :memory: "ATTACH '${db}' AS s; DELETE FROM s.memories;"`,
      // Truncates and overwrites.
      `truncate -s 0 ${db}`,
      `truncate -s 0 store/corvidinho.db`,
      `cp /dev/null ~/.local/share/corvidinho/corvidinho.db`,
      `dd if=/dev/null of=$HOME/.local/share/corvidinho/corvidinho.db`,
      `cp fixture.db "$CORVIDINHO_DATA_DIR"/corvidinho.db`,
      // An interpreter's SQL inside the shell.
      `python3 -c "import os, sqlite3; c = sqlite3.connect(os.environ['CORVIDINHO_DATA_DIR'] + '/corvidinho.db'); c.execute('DELETE FROM memories'); c.commit()"`,
      `python3 -c "import sqlite3; c = sqlite3.connect('${db}'); c.execute('DELETE FROM memories'); c.commit()"`,
      // Behind a shell string and a wrapper.
      `sh -c 'sqlite3 ~/.local/share/corvidinho/corvidinho.db "DELETE FROM memories"'`,
      `timeout 30 truncate -s 0 "$CORVIDINHO_DATA_DIR/corvidinho.db"`,
    ];
    for (const f of forms) await expectStoreRefused(f);
  }, 60_000);

  test("a target the check can't resolve is refused fail-closed", async () => {
    // where.txt holds the data dir: only the running shell knows what it says.
    writeFileSync(join(repo, "where.txt"), `${data}\n`);
    for (const f of [
      `sqlite3 "$(cat where.txt)/corvidinho.db" 'DELETE FROM memories'`,
      `truncate -s 0 "$(cat where.txt)/corvidinho.db"`,
      `cp /dev/null "$(cat where.txt)/corvidinho.db"`,
      `DB=corvidinho.db; cp /dev/null "$(cat where.txt)/$DB"`,
      `sed 's|$|/corvidinho.db|' where.txt | xargs truncate -s 0`,
    ]) {
      const msg = await expectStoreRefused(f);
      expect(msg).toMatch(/can't be shown to stay off Corvidinho's store/);
    }
  }, 60_000);

  test("a look that writes or runs a command, and code put in a variable, are refused", async () => {
    for (const f of [
      // xxd's second operand, tree -o and less -o are output files.
      `xxd /dev/null ${db}`,
      `tree -o ${db} .`,
      `less -o ${db} fixture.db`,
      // rg --pre runs its command on every file it searches.
      `rg --pre rm x ${db}`,
      // Code that names the data dir, carried in a variable to the interpreter.
      `CODE='import os, sqlite3; c = sqlite3.connect(os.environ["CORVIDINHO_DATA_DIR"] + "/corvidinho.db"); c.execute("DELETE FROM memories"); c.commit()'; python3 -c "$CODE"`,
      `export CODE='import os, sqlite3; c = sqlite3.connect(os.environ["CORVIDINHO_DATA_DIR"] + "/corvidinho.db"); c.execute("DELETE FROM memories"); c.commit()'; python3 -c "$CODE"`,
    ]) {
      await expectStoreRefused(f);
    }
  }, 60_000);

  test("the -wal / -shm / -journal siblings are the store too", async () => {
    for (const sib of ["-wal", "-shm", "-journal"]) {
      await expectStoreRefused(`cp /dev/null ${db}${sib}`);
    }
  });

  test("an in-root script the command runs in a shell is read too", async () => {
    writeFileSync(join(repo, "wipe.sh"), `sqlite3 "$CORVIDINHO_DATA_DIR/corvidinho.db" 'DELETE FROM memories'\n`);
    writeFileSync(join(repo, "wipe.sql"), `ATTACH '${db}' AS s;\nDELETE FROM s.memories;\n`);
    const msg = await expectStoreRefused("sh wipe.sh", "wipe.sh");
    expect(msg).toContain("(in wipe.sh)");
    const sql = await expectStoreRefused("sqlite3 :memory: < wipe.sql");
    expect(sql).toContain("`wipe.sql`");
  });

  test("commands that don't name the store still run", async () => {
    const fixture = await shell("sqlite3 ./fixture.db 'DELETE FROM t'");
    expect(fixture.ok).toBe(true);
    const fx = new Database(join(repo, "fixture.db"), { readonly: true });
    expect(fx.query("SELECT count(*) AS n FROM t").get()).toEqual({ n: 0 });
    fx.close();
    for (const cmd of [
      `ls -la "$CORVIDINHO_DATA_DIR"`,
      `stat ~/.local/share/corvidinho/corvidinho.db`,
      `sha256sum store/corvidinho.db`,
      "cp fixture.db copy.db && truncate -s 0 copy.db",
      `python3 -c "print(1)"`,
      "echo ok",
    ]) {
      const r = await shell(cmd);
      expect({ cmd, ok: r.ok, exitCode: r.exitCode, error: r.error }).toEqual({
        cmd,
        ok: true,
        exitCode: 0,
        error: undefined,
      });
    }
    expect(rows()).toEqual(seeded);
  }, 60_000);

  test("SAFE-21 still answers first, with its own families and messages", async () => {
    const rm = await shell(`rm ${db}`);
    expect(rm.exitCode).toBe(2);
    expect(rm.error).toStartWith("shell-exec refused (SAFE-21): ");
    expect((rm.data as { rule?: string; family?: string }).rule).toBe("SAFE-21");
    expect((rm.data as { family?: string }).family).toBe("delete");
    const edit = await shell(`echo > ${db}`);
    expect(edit.error).toStartWith("shell-exec refused (SAFE-21): ");
    expect((edit.data as { family?: string }).family).toBe("edit");
    expect(rows()).toEqual(seeded);
  });

  test("the owner gets no Approve card for a command the store guard refuses", () => {
    const env = { ...process.env };
    expect(shellProdWhy("kubectl get pods", repo, { env })).not.toBeNull();
    expect(
      shellProdWhy(`kubectl get pods; sqlite3 ${db} 'DELETE FROM memories'`, repo, { env }),
    ).toBeNull();
  });
});

describe("SAFE-4: the language runners refuse argv naming the store (REQ-plugins-404)", () => {
  const spec = (name: string) => RUNNERS.find((r) => r.name === name)!;
  const run = (name: string, args: string[]) =>
    runRunner({
      spec: spec(name),
      bin: resolveRunnerBin(spec(name), process.env) ?? spec(name).candidates[0]!,
      args,
      cwd: repo,
    });

  async function expectRunnerRefused(name: string, args: string[]) {
    const r = await run(name, args);
    expect({ name, args, ok: r.ok, exitCode: r.exitCode }).toEqual({ name, args, ok: false, exitCode: 2 });
    expect(r.error).toStartWith(`${name} refused (SAFE-4): `);
    expect(r.error).toContain("memory-forget or memory-override");
    expect((r.data as Refused).rule).toBe("SAFE-4");
    expect({ name, args, rows: rows() }).toEqual({ name, args, rows: seeded });
  }

  test("python-exec and node-exec refuse pre-spawn, and the memories stay", async () => {
    await expectRunnerRefused("python-exec", [
      "-c",
      `import sqlite3; c = sqlite3.connect('${db}'); c.execute('DELETE FROM memories'); c.commit()`,
    ]);
    await expectRunnerRefused("python-exec", [
      "-c",
      "import os, sqlite3; c = sqlite3.connect(os.environ['CORVIDINHO_DATA_DIR'] + '/corvidinho.db'); c.execute('DROP TABLE memories'); c.commit()",
    ]);
    await expectRunnerRefused("node-exec", [
      "-e",
      "require('fs').truncateSync(process.env.CORVIDINHO_DATA_DIR + '/corvidinho.db', 0)",
    ]);
    await expectRunnerRefused("node-exec", ["-e", "require('fs').truncateSync('store/corvidinho.db', 0)"]);
    await expectRunnerRefused("node-exec", ["-e", `require('fs').writeFileSync('${db}', '')`]);
  }, 60_000);

  test("argv that doesn't name the store still runs; no Approve card for a refused call", async () => {
    const py = resolveRunnerBin(spec("python-exec"), process.env);
    if (py) {
      const r = await run("python-exec", ["-c", "print(40 + 2)"]);
      expect(r.ok).toBe(true);
      expect(r.message).toContain("42");
    }
    const kube = ["-c", "import subprocess; subprocess.run(['kubectl', 'get', 'pods'])"];
    expect(runnerProdWhy("python", kube, repo, { env: process.env })).not.toBeNull();
    expect(
      runnerProdWhy("python", [kube[0]!, `${kube[1]}; open('${db}', 'w')`], repo, { env: process.env }),
    ).toBeNull();
    expect(rows()).toEqual(seeded);
  });
});

describe("SAFE-4: memory-forget / memory-override keep their two-phase confirm (REQ-plugins-011)", () => {
  test("phase 1 only issues a token; the row stays until a later turn confirms", async () => {
    process.env.CORVIDINHO_OWNER_DISCORD_ID = OWNER;
    const id = (seeded[0] as { id: string }).id;
    actAs(OWNER, true);
    for (const name of ["memory-forget", "memory-override"]) {
      const args = name === "memory-forget" ? ["--id", id] : ["--id", id, "rewritten"];
      const phase1 = await runPlugin({ name, args, nonInteractive: true, allowlist: [name] });
      expect({ name, ok: phase1.ok }).toEqual({ name, ok: true });
      expect((phase1.data as { pending?: boolean }).pending).toBe(true);
      expect(typeof (phase1.data as { confirmToken?: string }).confirmToken).toBe("string");
    }
    actAs(undefined);
    expect(rows()).toEqual(seeded);
  });
});

describe("firstStoreHit (REQ-plugins-404)", () => {
  test("reads the store from the env, fails closed, and states its residual", async () => {
    const { firstStoreHit, runnerStoreHit } = await import("../plugins/shell/store-guard.ts");
    const env = { HOME: home, PATH: "/usr/bin:/bin" } as NodeJS.ProcessEnv; // no override: ~/.local/share/corvidinho
    const hit = (c: string, root = repo) => firstStoreHit(c, root, { env })?.why ?? null;
    expect(hit(`sqlite3 ~/.local/share/corvidinho/corvidinho.db 'SELECT count(*) FROM memories'`)).toContain(
      "reads are refused too",
    );
    expect(hit(`HOME=/elsewhere; truncate -s 0 ~/.local/share/corvidinho/corvidinho.db`)).not.toBeNull();
    expect(hit(`HOME=/elsewhere; truncate -s 0 ~/notes.txt`)).toContain("can't be shown");
    expect(hit(`truncate -s 0 ~user/x`)).toContain("can't be shown");
    expect(hit(`truncate -s 0 store/*`)).not.toBeNull();
    expect(hit(`cp -r dist/ ~/.local/share/`)).toContain("holds Corvidinho's store");
    expect(hit(`tar -xf backup.tar -C ~/.local/share`)).toContain("holds Corvidinho's store");
    expect(hit(`find ~ -name corvidinho.db -exec truncate -s 0 {} +`)).toContain("can reach");
    expect(hit(`find -L . -name '*.db' -exec truncate -s 0 {} +`)).toContain("follows symlinks");
    expect(hit(`sqlite3 x.db <<EOF\nDELETE FROM t WHERE id = $ID\nEOF`)).toContain("here-doc");
    expect(hit(`export DB=~/.local/share/corvidinho/corvidinho.db`)).not.toBeNull();
    expect(hit(`DB=$HOME/.local/share/corvidinho/corvidinho.db python3 x.py`)).toContain("points a variable");
    expect(hit(`gzip ~/.local/share/corvidinho/corvidinho.db`)).not.toBeNull();
    // Commands that don't name the store.
    for (const ok of [
      "sqlite3 ./fixture.db 'DELETE FROM t'",
      "sqlite3 x.db <<'EOF'\nDELETE FROM t\nEOF",
      "find . -name '*.log' -exec truncate -s 0 {} +",
      "cp -r src/ dist/",
      "tar -xf a.tar",
      "CORVIDINHO_DATA_DIR=$(mktemp -d) bun test",
      "git grep CORVIDINHO_DATA_DIR",
      "cat ~/.local/share/corvidinho/corvidinho.db > /dev/null",
      "du -sh ~/.local/share/corvidinho",
      "truncate -s 0 ~/.local/share/corvidinho-old.db",
      "rg -n memories store/",
      "grep -rn memories store/",
      "export CORVIDINHO_DATA_DIR=/tmp/elsewhere",
    ]) {
      expect({ ok, hit: hit(ok) }).toEqual({ ok, hit: null });
    }
    // A root inside the data dir: only the DB file family counts there.
    const inside = join(data, "talks", "t1");
    mkdirSync(inside, { recursive: true });
    const narrowEnv = { HOME: home, CORVIDINHO_DATA_DIR: data } as NodeJS.ProcessEnv;
    expect(firstStoreHit("truncate -s 0 notes.txt && sqlite3 ./x.db 'DELETE FROM t'", inside, { env: narrowEnv })).toBeNull();
    expect(firstStoreHit(`sqlite3 ${db} 'DELETE FROM memories'`, inside, { env: narrowEnv })).not.toBeNull();
    expect(firstStoreHit(`truncate -s 0 ../../corvidinho.db-wal`, inside, { env: narrowEnv })).not.toBeNull();
    // Residual (stated in the spec): a path built at runtime, or code reaching
    // the store without naming it, is not read.
    writeFileSync(join(repo, "x.py"), `open('${db}', 'w')\n`);
    expect(hit("python3 x.py")).toBeNull();
    expect(hit(`python3 -c "import pathlib; pathlib.Path.home().joinpath('.local', 'share', 'corvidinho')"`)).toBeNull();
    // Runners: argv only.
    expect(runnerStoreHit(["-c", "print(1)"], repo, { env })).toBeNull();
    expect(runnerStoreHit(["-e", "x(process.env.CORVIDINHO_DATA_DIR)"], repo, { env })).not.toBeNull();
    expect(runnerStoreHit(["store/corvidinho.db"], repo, { env })).not.toBeNull();
    expect(readFileSync(join(repo, "x.py"), "utf8")).toContain("open(");
  });
});
