/**
 * REQ-plugins-008 — SpecSync module listing without `.specsync/registry.toml`
 * (SPECSYNC-1 / SPECSYNC-5).
 *
 * `specsync init` + `specsync scaffold <name>` leave `.specsync/` and
 * `specs/<name>/<name>.spec.md` (+ companions) but no `registry.toml`. With no
 * registry file the module names come from the specs dir, so specsync-list,
 * specsync-read / specsync-brief by listed name and the Planning spec briefing
 * (with companions) work there. A registry file stays authoritative when
 * present, and the fallback lists only specs that stay inside `specs/`.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRelevantSpecs } from "../src/agent/specLoader.ts";
import { clearRegistry } from "../src/plugins/registry.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { listRegisteredModules } from "../plugins/specsync/api.ts";

const SECRET = "OUTSIDE-SECRET-51c9";
const repoRoot = join(import.meta.dir, "..");
const cliPath = join(repoRoot, "src", "cli.ts");

let dir = "";
let outside = "";

function put(path: string, content: string) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

function spec(name: string) {
  return `---\nmodule: ${name}\nversion: 1\nstatus: draft\n---\n\n# ${name}\n\n## Purpose\n\n${name} purpose text.\n\n## Invariants\n\n1. ${name} invariant.\n`;
}

/** The layout `specsync init` + `specsync scaffold billing` leave (no registry.toml). */
function scaffoldProject() {
  put(join(dir, ".specsync", "config.toml"), 'specs_dir = "specs"\nsource_dirs = ["src"]\n');
  put(join(dir, ".specsync", "version"), "6.0.0\n");
  put(join(dir, "specs", "billing", "billing.spec.md"), spec("billing"));
  put(join(dir, "specs", "billing", "context.md"), "billing context: invoices are immutable\n");
  put(join(dir, "specs", "billing", "tasks.md"), "- [ ] billing task\n");
}

function run(name: string, args: string[] = [], cwd = dir) {
  return runPlugin({ name, args, cwd, nonInteractive: true });
}

beforeEach(() => {
  clearRegistry();
  loadBuiltins();
  dir = realpathSync(mkdtempSync(join(tmpdir(), "corvidinho-specsync-noreg-")));
  outside = realpathSync(mkdtempSync(join(tmpdir(), "corvidinho-specsync-noreg-out-")));
  put(join(outside, "leak", "leak.spec.md"), `${SECRET} spec\n`);
  put(join(outside, "leak", "context.md"), `${SECRET} context\n`);
  put(join(outside, "outside.spec.md"), `${SECRET} spec file\n`);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe("no registry.toml: modules come from specs/ (SPECSYNC-1)", () => {
  test("listRegisteredModules lists specs/<name>/<name>.spec.md modules, sorted", () => {
    scaffoldProject();
    put(join(dir, "specs", "auth", "auth.spec.md"), spec("auth"));
    expect(listRegisteredModules(dir)).toEqual(["auth", "billing"]);
  });

  test("specsync-list returns the specs-dir modules", async () => {
    scaffoldProject();
    const r = await run("specsync-list", [], dir);
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({ count: 1, modules: ["billing"] });
  });

  test("`corvidinho specsync list` in a registry-less SpecSync project prints the module", async () => {
    scaffoldProject();
    const proc = Bun.spawn(["bun", cliPath, "specsync", "list"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(code).toBe(0);
    expect(stdout).toContain("1 spec(s) registered");
    expect(stdout).toContain("billing");
  });

  test("a listed module reads and briefs with its companions (SPECSYNC-5)", async () => {
    scaffoldProject();
    const [name] = listRegisteredModules(dir);
    expect(name).toBe("billing");
    const read = await run("specsync-read", [name!]);
    expect(read.ok).toBe(true);
    expect(JSON.stringify(read.data)).toContain("billing purpose text.");
    const brief = await run("specsync-brief", [name!], dir);
    expect(brief.ok).toBe(true);
    expect(JSON.stringify(brief.data)).toContain("invoices are immutable");
  });

  test("the Planning spec briefing loads the module and its companions", () => {
    scaffoldProject();
    const text = loadRelevantSpecs({ cwd: dir, task: "change the billing module" });
    expect(text).toContain("# Spec: billing");
    expect(text).toContain("billing purpose text.");
    expect(text).toContain("# Companion: billing/context.md");
    expect(text).toContain("invoices are immutable");
    expect(text).toContain("# Companion: billing/tasks.md");
  });

  test.skipIf(!Bun.which("specsync"))(
    "real specsync init + scaffold (no registry.toml) lists and briefs the module",
    async () => {
      const sh = (args: string[]) =>
        Bun.spawnSync(args, { cwd: dir, stdout: "pipe", stderr: "pipe" });
      expect(sh(["git", "init", "-q"]).exitCode).toBe(0);
      expect(sh(["specsync", "init"]).exitCode).toBe(0);
      expect(sh(["specsync", "scaffold", "billing"]).exitCode).toBe(0);
      expect(existsSync(join(dir, ".specsync", "registry.toml"))).toBe(false);
      expect(listRegisteredModules(dir)).toEqual(["billing"]);
      const text = loadRelevantSpecs({ cwd: dir, task: "change the billing module" });
      expect(text).toContain("# Spec: billing");
      expect(text).toContain("# Companion: billing/context.md");
    },
  );
});

describe("registry.toml stays authoritative when present", () => {
  test("only registered names are listed, not every specs/ module", () => {
    scaffoldProject();
    put(join(dir, "specs", "auth", "auth.spec.md"), spec("auth"));
    put(join(dir, ".specsync", "registry.toml"), '[specs]\nauth = "specs/auth/auth.spec.md"\n');
    expect(listRegisteredModules(dir)).toEqual(["auth"]);
  });

  test("a registry with no [specs] entries lists nothing", () => {
    scaffoldProject();
    put(join(dir, ".specsync", "registry.toml"), '[registry]\nname = "x"\n');
    expect(listRegisteredModules(dir)).toEqual([]);
  });
});

describe("the fallback lists only what specsync-read reads inside specs/ (REQ-plugins-008)", () => {
  test("not a SpecSync project (no .specsync/ dir): nothing listed, briefing empty", () => {
    put(join(dir, "specs", "billing", "billing.spec.md"), spec("billing"));
    expect(listRegisteredModules(dir)).toEqual([]);
    put(join(dir, ".specsync"), "not a dir\n");
    expect(listRegisteredModules(dir)).toEqual([]);
    expect(loadRelevantSpecs({ cwd: dir, task: "change the billing module" })).toBe("");
  });

  test("no specs dir: nothing listed", () => {
    put(join(dir, ".specsync", "config.toml"), 'specs_dir = "specs"\n');
    expect(listRegisteredModules(dir)).toEqual([]);
  });

  test("skips flat specs, dirs without a spec, a spec that is a dir, and non-module names", () => {
    scaffoldProject();
    put(join(dir, "specs", "legacy.md"), spec("legacy"));
    mkdirSync(join(dir, "specs", "empty"));
    mkdirSync(join(dir, "specs", "dirspec", "dirspec.spec.md"), { recursive: true });
    put(join(dir, "specs", "bad.name", "bad.name.spec.md"), spec("bad"));
    put(join(dir, "specs", "other", "wrong.spec.md"), spec("other"));
    put(join(dir, "specs", "README.md"), "specs readme\n");
    expect(listRegisteredModules(dir)).toEqual(["billing"]);
  });

  test("a symlinked spec or module dir that stays inside specs/ is listed", () => {
    scaffoldProject();
    mkdirSync(join(dir, "specs", "alias"));
    symlinkSync(
      join(dir, "specs", "billing", "billing.spec.md"),
      join(dir, "specs", "alias", "alias.spec.md"),
    );
    put(join(dir, "specs", "shared", "mirror.spec.md"), spec("mirror"));
    symlinkSync(join(dir, "specs", "shared"), join(dir, "specs", "mirror"));
    expect(listRegisteredModules(dir)).toEqual(["alias", "billing", "mirror"]);
  });

  test("a spec or module dir that links outside specs/ is not listed and never briefs", async () => {
    scaffoldProject();
    symlinkSync(join(outside, "leak"), join(dir, "specs", "leak"));
    mkdirSync(join(dir, "specs", "evil"));
    symlinkSync(join(outside, "outside.spec.md"), join(dir, "specs", "evil", "evil.spec.md"));
    expect(listRegisteredModules(dir)).toEqual(["billing"]);
    const list = await run("specsync-list");
    expect(JSON.stringify(list)).not.toContain(SECRET);
    for (const task of ["change the leak module", "change the evil module"]) {
      const text = loadRelevantSpecs({ cwd: dir, task });
      expect(text).toBe("");
    }
  });

  test("a specs dir that resolves outside the project lists nothing", () => {
    put(join(dir, ".specsync", "config.toml"), 'specs_dir = "specs"\n');
    symlinkSync(outside, join(dir, "specs"));
    expect(listRegisteredModules(dir)).toEqual([]);
    const text = loadRelevantSpecs({ cwd: dir, task: "change the leak module" });
    expect(text).not.toContain(SECRET);
    expect(text).toBe("");
  });
});
