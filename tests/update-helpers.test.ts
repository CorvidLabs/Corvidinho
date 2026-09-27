/**
 * Exercises scripts/lib/update-helpers.sh predicates via bash -c.
 */
import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const helpers = join(root, "scripts/lib/update-helpers.sh");
const updateSh = join(root, "scripts/corvidinho-update.sh");
const releaseYml = join(root, ".github/workflows/release.yml");

function bashEval(script: string): { exitCode: number; stdout: string; stderr: string } {
  const proc = Bun.spawnSync(["bash", "-c", script], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: proc.exitCode ?? 1,
    stdout: new TextDecoder().decode(proc.stdout),
    stderr: new TextDecoder().decode(proc.stderr),
  };
}

describe("update-helpers.sh", () => {
  test("helpers + update script exist and bash -n clean", () => {
    expect(existsSync(helpers)).toBe(true);
    expect(existsSync(updateSh)).toBe(true);
    expect(bashEval(`bash -n "${helpers}" && bash -n "${updateSh}"`).exitCode).toBe(0);
  });

  test("log_indicates_ready matches logged in", () => {
    const r = bashEval(
      `source "${helpers}"; log_indicates_ready '[discord] logged in as Corvidinho#1234'`,
    );
    expect(r.exitCode).toBe(0);
  });

  test("log_indicates_ready matches protocol OK", () => {
    const r = bashEval(
      `source "${helpers}"; log_indicates_ready '[discord] protocol version 1 OK'`,
    );
    expect(r.exitCode).toBe(0);
  });

  test("log_indicates_ready rejects noise", () => {
    const r = bashEval(
      `source "${helpers}"; log_indicates_ready 'still connecting…'`,
    );
    expect(r.exitCode).not.toBe(0);
  });

  test("should_rollback when wait failed and prev set", () => {
    const yes = bashEval(`source "${helpers}"; should_rollback 0 abcdef`);
    expect(yes.exitCode).toBe(0);
    const noOk = bashEval(`source "${helpers}"; should_rollback 1 abcdef`);
    expect(noOk.exitCode).not.toBe(0);
    const noPrev = bashEval(`source "${helpers}"; should_rollback 0 ""`);
    expect(noPrev.exitCode).not.toBe(0);
  });

  test("extract_changelog_section finds 0.0.6", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.6`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("SAFE-2");
    expect(r.stdout).toContain("files-read");
  });
  test("extract_changelog_section finds 0.0.7", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.7`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Auto-recall inject");
    expect(r.stdout).toContain("0.0.7");
  });
  test("extract_changelog_section finds 0.0.10", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.10`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("WATCH-RELIABILITY");
    expect(r.stdout).toContain("rate-limit");
    // Backfilled: #139 NDJSON + #143 argv fix + protocol-2 upgrade note.
    expect(r.stdout).toContain("NDJSON");
    expect(r.stdout).toContain("protocol is now `2`");
    expect(r.stdout).not.toContain("memory ACL");
  });

  test("extract_changelog_section finds 0.0.12", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.12`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("git-status");
    expect(r.stdout).toContain("watch_sessions");
    expect(r.stdout).not.toContain("DISCORD-ANNOUNCE-4");
  });

  test("extract_changelog_section finds 0.0.13", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.13`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Always verify");
    expect(r.stdout).toContain("REQ-discord-085");
    expect(r.stdout).not.toContain("DISCORD-ANNOUNCE-4");
  });

  test("extract_changelog_section finds 0.0.14", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.14`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("ROLES-CHAT");
    expect(r.stdout).toContain("files-write");
    expect(r.stdout).not.toContain("DISCORD-ANNOUNCE-4");
  });

  test("extract_changelog_section finds 0.0.25", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.25`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("DISCORD-ASK-7");
    expect(r.stdout).toContain("/session");
    expect(r.stdout).toContain("/work");
  });

  test("extract_changelog_section finds 0.0.24", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.24`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("DISCORD-ASK-6");
    expect(r.stdout).toContain("DISCORD-ASK-7");
    expect(r.stdout).toContain("collapse");
  });

  test("extract_changelog_section finds 0.0.23", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.23`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Scrub before clip");
    expect(r.stdout).toContain("Process-tree kill");
  });

  test("extract_changelog_section finds 0.0.22", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.22`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("DISCORD-ASK");
    expect(r.stdout).toContain("SESSION-MULTI");
    expect(r.stdout).toContain("ephemeral");
  });

  test("extract_changelog_section finds 0.0.21", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.21`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Council tool");
    expect(r.stdout).toContain("Soft-TTL purge");
  });

  test("extract_changelog_section finds 0.0.20", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.20`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("AUTONOMY-4");
    expect(r.stdout).toContain("AUTONOMY-5");
    expect(r.stdout).toContain("thin replies");
    expect(r.stdout).toContain("schema **v8**");
    expect(r.stdout).not.toContain("IDENTITY-4");
  });

  test("extract_changelog_section finds 0.0.19", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.19`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("IDENTITY-4");
    expect(r.stdout).toContain("DISCORD-3.a");
    expect(r.stdout).toContain("ROLES-CHAT-8");
    expect(r.stdout).toContain("public GitHub");
    expect(r.stdout).not.toContain("STRING + autocomplete");
  });

  test("extract_changelog_section finds 0.0.18", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.18`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("ask-human");
    expect(r.stdout).toContain("delegate");
  });

  test("extract_changelog_section finds 0.0.17", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.17`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("STRING + autocomplete");
    expect(r.stdout).toContain("ADMIN-2");
  });

  test("extract_changelog_section finds 0.0.16", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.16`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("corvidinho daemon");
    expect(r.stdout).toContain("web-fetch");
    expect(r.stdout).not.toContain("ADMIN-1");
  });

  test("extract_changelog_section finds 0.0.15", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.15`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("/admin");
    expect(r.stdout).toContain("ADMIN-1");
    expect(r.stdout).toContain("CHANNEL picker");
    expect(r.stdout).not.toContain("ROLES-CHAT-2");
  });

  test("extract_changelog_section finds 0.0.11", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.11`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("DISCORD-ANNOUNCE-4");
    expect(r.stdout).toContain("CHANGELOG bullets");
  });

  test("extract_changelog_section finds 0.0.9", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.9`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("SAFE-6");
    expect(r.stdout).toContain("memory ACL");
    // Backfilled: owner-only ADMIN upgrade note (#141) + SAFE-5 audit (#136).
    expect(r.stdout).toContain("ADMIN is now owner-only");
    expect(r.stdout).toContain("SAFE-5");
  });

  test("extract_changelog_section finds 0.0.8", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.8`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("/announce");
    expect(r.stdout).toContain("DISCORD-ANNOUNCE");
  });

  test("extract_changelog_section finds 0.0.3", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.3`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("pidfile");
    expect(r.stdout).toContain("UPDATE.md");
  });
});

/**
 * Fake box for scripts/corvidinho-update.sh: a local origin + checkout, and
 * fake `bun` / `systemctl` on PATH that log each call together with the value
 * of CORVIDINHO_FAKE_MARK (set only by the env file) so a test can see which
 * steps ran with the env file loaded. Nothing real is restarted or killed.
 */
interface FakeBox {
  dir: string;
  calls: string;
  pidfile: string;
  envFile: string;
  run(env: Record<string, string>): { exitCode: number; out: string };
  lines(): string[];
  cleanup(): void;
}

function makeFakeBox(): FakeBox {
  const dir = mkdtempSync(join(tmpdir(), "corvidinho-update-test-"));
  const bin = join(dir, "bin");
  const box = join(dir, "box");
  const origin = join(dir, "origin.git");
  const calls = join(dir, "calls.log");
  const pidfile = join(dir, "bridge.pid");
  const envFile = join(dir, "env");
  mkdirSync(bin);
  mkdirSync(box);
  writeFileSync(calls, "");
  writeFileSync(envFile, "CORVIDINHO_FAKE_MARK=from-env-file\n");
  const fakeBun = `#!/usr/bin/env bash
echo "bun $* | mark=\${CORVIDINHO_FAKE_MARK:-unset}" >> "$FAKE_CALLS"
case "$*" in
  install*) [ "\${FAKE_INSTALL_FAIL:-0}" = "1" ] && exit 1; exit 0 ;;
  *" doctor")
    # Like the real doctor: fails when the box env (secrets) is missing.
    [ "\${FAKE_DOCTOR_FAIL:-0}" = "1" ] && exit 1
    [ -n "\${CORVIDINHO_FAKE_MARK:-}" ] || exit 1
    exit 0 ;;
  *" version") echo 0.0.0 ;;
  *"discord bridge") echo "[discord] logged in as Fake#0001"; exec sleep 3 ;;
esac
exit 0
`;
  const fakeSystemctl = `#!/usr/bin/env bash
echo "systemctl $* | mark=\${CORVIDINHO_FAKE_MARK:-unset}" >> "$FAKE_CALLS"
exit 0
`;
  writeFileSync(join(bin, "bun"), fakeBun);
  writeFileSync(join(bin, "systemctl"), fakeSystemctl);
  chmodSync(join(bin, "bun"), 0o755);
  chmodSync(join(bin, "systemctl"), 0o755);
  const git = (args: string[], cwd: string) => {
    const p = Bun.spawnSync(
      ["git", "-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args],
      { cwd, stdout: "pipe", stderr: "pipe" },
    );
    if (p.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${new TextDecoder().decode(p.stderr)}`);
  };
  git(["init", "-q", "--bare", origin], dir);
  git(["init", "-q", "-b", "main"], box);
  writeFileSync(join(box, "package.json"), "{}\n");
  git(["add", "package.json"], box);
  git(["commit", "-q", "-m", "seed"], box);
  git(["remote", "add", "origin", origin], box);
  git(["push", "-q", "origin", "main"], box);

  return {
    dir,
    calls,
    pidfile,
    envFile,
    run(env) {
      const proc = Bun.spawnSync(["bash", updateSh], {
        cwd: box,
        stdout: "pipe",
        stderr: "pipe",
        // Clean env: never inherit a real box's CORVIDINHO_* settings.
        env: {
          PATH: `${bin}:${process.env.PATH ?? "/usr/bin:/bin"}`,
          HOME: dir,
          FAKE_CALLS: calls,
          CORVIDINHO_ROOT: box,
          CORVIDINHO_REF: "origin/main",
          CORVIDINHO_PIDFILE: pidfile,
          CORVIDINHO_BRIDGE_LOG: join(dir, "bridge.log"),
          CORVIDINHO_ENV_FILE: envFile,
          CORVIDINHO_READY_TIMEOUT: "15",
          ...env,
        },
      });
      const dec = new TextDecoder();
      return { exitCode: proc.exitCode ?? 1, out: dec.decode(proc.stdout) + dec.decode(proc.stderr) };
    },
    lines() {
      return readFileSync(calls, "utf8").split("\n").filter(Boolean);
    },
    cleanup() {
      // Stop a fake bridge the pidfile path may have spawned.
      if (existsSync(pidfile)) {
        const pid = Number(readFileSync(pidfile, "utf8").trim());
        if (Number.isInteger(pid) && pid > 0) {
          try {
            process.kill(pid, "SIGKILL");
          } catch {
            /* already gone */
          }
        }
      }
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** A pid that is certainly not running (a child that already exited). */
function deadPid(): number {
  const p = Bun.spawnSync(["bash", "-c", "echo $$"], { stdout: "pipe" });
  return Number(new TextDecoder().decode(p.stdout).trim());
}

describe("corvidinho-update.sh restart mode + env (fake box)", () => {
  test("REQ-cli-347: explicit CORVIDINHO_BRIDGE_UNIT wins over a leftover stale pidfile", () => {
    const box = makeFakeBox();
    try {
      writeFileSync(box.pidfile, `${deadPid()}\n`);
      // Doctor skipped: isolate restart-mode selection from env loading.
      const r = box.run({ CORVIDINHO_BRIDGE_UNIT: "corvidinho-bridge", CORVIDINHO_SKIP_DOCTOR: "1" });
      expect(r.exitCode).toBe(0);
      const lines = box.lines();
      expect(lines.some((l) => l.startsWith("systemctl restart corvidinho-bridge"))).toBe(true);
      // No second, nohup-started bridge next to the unit's bridge.
      expect(lines.some((l) => l.includes("discord bridge"))).toBe(false);
      // Stale pidfile is dropped so later updates stay in unit mode.
      expect(existsSync(box.pidfile)).toBe(false);
    } finally {
      box.cleanup();
    }
  }, 30_000);

  test("REQ-cli-347: unit mode never signals a live pid named by a leftover pidfile", () => {
    const box = makeFakeBox();
    const live = Bun.spawn(["sleep", "30"]);
    try {
      writeFileSync(box.pidfile, `${live.pid}\n`);
      const r = box.run({ CORVIDINHO_BRIDGE_UNIT: "corvidinho-bridge", CORVIDINHO_SKIP_DOCTOR: "1" });
      expect(r.exitCode).toBe(0);
      expect(box.lines().some((l) => l.startsWith("systemctl restart corvidinho-bridge"))).toBe(true);
      expect(box.lines().some((l) => l.includes("discord bridge"))).toBe(false);
      expect(r.out).toContain("ignoring");
      expect(live.exitCode).toBeNull();
      expect(() => process.kill(live.pid, 0)).not.toThrow();
    } finally {
      live.kill("SIGKILL");
      box.cleanup();
    }
  }, 30_000);

  test("REQ-cli-347: leftover pidfile without a unit keeps pidfile mode", () => {
    const box = makeFakeBox();
    try {
      writeFileSync(box.pidfile, `${deadPid()}\n`);
      const r = box.run({ CORVIDINHO_SKIP_DOCTOR: "1" });
      expect(r.exitCode).toBe(0);
      const lines = box.lines();
      expect(lines.some((l) => l.includes("discord bridge") && l.endsWith("mark=from-env-file"))).toBe(true);
      expect(lines.some((l) => l.startsWith("systemctl"))).toBe(false);
    } finally {
      box.cleanup();
    }
  }, 30_000);

  test("REQ-cli-347: env file is loaded before doctor and the unit restart", () => {
    const box = makeFakeBox();
    try {
      const r = box.run({ CORVIDINHO_BRIDGE_UNIT: "corvidinho-bridge" });
      expect(r.exitCode).toBe(0);
      const lines = box.lines();
      const doctor = lines.filter((l) => l.includes(" doctor |"));
      expect(doctor.length).toBe(1);
      expect(doctor[0]).toEndWith("mark=from-env-file");
      const restart = lines.filter((l) => l.startsWith("systemctl restart"));
      expect(restart).toEqual(["systemctl restart corvidinho-bridge | mark=from-env-file"]);
      // Secrets stay out of the dependency install.
      const install = lines.filter((l) => l.startsWith("bun install"));
      expect(install.length).toBeGreaterThan(0);
      for (const l of install) expect(l).toEndWith("mark=unset");
      expect(r.out).not.toContain("ROLLBACK");
    } finally {
      box.cleanup();
    }
  }, 30_000);

  test("REQ-cli-347: rollback after a failed bun install restarts with the env file", () => {
    const box = makeFakeBox();
    try {
      const r = box.run({ CORVIDINHO_BRIDGE_UNIT: "corvidinho-bridge", FAKE_INSTALL_FAIL: "1" });
      expect(r.exitCode).toBe(1);
      expect(r.out).toContain("ROLLBACK: bun install failed");
      const restart = box.lines().filter((l) => l.startsWith("systemctl restart"));
      expect(restart).toEqual(["systemctl restart corvidinho-bridge | mark=from-env-file"]);
    } finally {
      box.cleanup();
    }
  }, 30_000);

  test("REQ-cli-347: rollback restart sees the env file", () => {
    const box = makeFakeBox();
    try {
      const r = box.run({ CORVIDINHO_BRIDGE_UNIT: "corvidinho-bridge", FAKE_DOCTOR_FAIL: "1" });
      expect(r.exitCode).toBe(1);
      expect(r.out).toContain("ROLLBACK: doctor failed after update");
      const restart = box.lines().filter((l) => l.startsWith("systemctl restart"));
      expect(restart).toEqual(["systemctl restart corvidinho-bridge | mark=from-env-file"]);
    } finally {
      box.cleanup();
    }
  }, 30_000);

  test("REQ-cli-347: CORVIDINHO_BRIDGE_CMD with pkill -f cannot kill its own shell", () => {
    const box = makeFakeBox();
    // Unique pattern: never matches a real process on the host running the tests.
    const token = `zz-corvidinho-update-selfmatch-${process.pid}-${Date.now()}`;
    try {
      const r = box.run({
        CORVIDINHO_SKIP_DOCTOR: "1",
        CORVIDINHO_BRIDGE_CMD: `pkill -f '${token}' || true; echo "cmd-ran | mark=\${CORVIDINHO_FAKE_MARK:-unset}" >> "$FAKE_CALLS"`,
      });
      expect(r.exitCode).toBe(0);
      expect(box.lines()).toContain("cmd-ran | mark=from-env-file");
      expect(r.out).not.toContain("ROLLBACK");
    } finally {
      box.cleanup();
    }
  }, 30_000);

  test("REQ-cli-347: documented pkill patterns match the bridge but not the shell running them", () => {
    const doc = readFileSync(join(root, "docs/BOX-UPDATE.md"), "utf8");
    const pats = [...doc.matchAll(/pkill -f '([^']+)'/g)].map((m) => m[1]!);
    expect(pats.length).toBeGreaterThan(0);
    for (const pat of pats) {
      const shell = `bash -lc pkill -f '${pat}' || true; nohup bun src/cli.ts discord bridge &`;
      // pgrep/pkill -f use POSIX ERE against the joined argv, like grep -E.
      const matches = (s: string) =>
        Bun.spawnSync(["grep", "-Eq", "--", pat], { stdin: new TextEncoder().encode(`${s}\n`) }).exitCode === 0;
      expect(matches("bun src/cli.ts discord bridge")).toBe(true);
      expect(matches("/home/corvid/.bun/bin/bun /opt/Corvidinho/src/cli.ts discord bridge")).toBe(true);
      expect(matches(shell)).toBe(false);
    }
  });
});

describe("release workflow", () => {
  test("release.yml triggers on v* tags and is idempotent-aware", () => {
    expect(existsSync(releaseYml)).toBe(true);
    const body = readFileSync(releaseYml, "utf8");
    expect(body).toContain("tags:");
    expect(body).toContain("v*");
    expect(body).toContain("softprops/action-gh-release");
    expect(body).toContain("Idempotency");
    expect(body).toContain("contents: write");
  });
});

describe("package version", () => {
  test("package.json is 0.0.25", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      version: string;
    };
    expect(pkg.version).toBe("0.0.25");
  });
});
