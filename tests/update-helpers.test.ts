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

  test("REQ-cli-347: log_indicates_ready rejects protocol OK alone (printed before Discord login)", () => {
    const r = bashEval(
      `source "${helpers}"; log_indicates_ready '[discord] protocol version 1 OK'`,
    );
    expect(r.exitCode).not.toBe(0);
  });

  test("REQ-cli-347: log_indicates_ready rejects protocol OK followed by a login failure", () => {
    const blob = "[discord] protocol version 2 OK\nDiscordAPIError[403]: Missing Access";
    const r = bashEval(`source "${helpers}"; log_indicates_ready "$(printf '${blob}')"`);
    expect(r.exitCode).not.toBe(0);
  });

  test("REQ-cli-347: log_indicates_ready accepts protocol OK followed by the login line", () => {
    const blob = "[discord] protocol version 2 OK\n[discord] logged in as Corvidinho#1234";
    const r = bashEval(`source "${helpers}"; log_indicates_ready "$(printf '${blob}')"`);
    expect(r.exitCode).toBe(0);
  });

  test("REQ-cli-347: the ready line is the one the gateway prints on ClientReady, after login", () => {
    const gateway = readFileSync(join(root, "src/discord/gateway.ts"), "utf8");
    const readyAt = gateway.indexOf("client.on(Events.ClientReady");
    const lineAt = gateway.indexOf("console.log(`[discord] logged in as ${ready.user.tag}`)");
    expect(readyAt).toBeGreaterThan(-1);
    // Printed inside the ClientReady handler (the next handler registration comes after it).
    expect(lineAt).toBeGreaterThan(readyAt);
    expect(lineAt).toBeLessThan(gateway.indexOf("client.on(", readyAt + 1));
    expect(gateway.split("[discord] logged in as").length - 1).toBe(1);
    const r = bashEval(
      `source "${helpers}"; log_indicates_ready '[discord] logged in as Corvidinho#1234'`,
    );
    expect(r.exitCode).toBe(0);
    // The protocol line comes from the pre-login handshake and never counts.
    const proto = readFileSync(join(root, "src/discord/protocol-version.ts"), "utf8");
    expect(proto).toContain("console.log(`[discord] protocol version ${result.version} OK`)");
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

  test("extract_changelog_section stays fast on a large UTF-8 section", () => {
    // A 400 KB section of multibyte text under a UTF-8 locale: the old
    // "${out// }" emptiness check was quadratic there (seconds for 70 KB).
    const dir = mkdtempSync(join(tmpdir(), "cl-big-"));
    try {
      const line = "- **Big** — a line with UTF-8 → and spaces to keep it honest.\n";
      const body = line.repeat(Math.ceil(400_000 / line.length));
      writeFileSync(join(dir, "CHANGELOG.md"), `# Changelog\n\n## 9.9.9\n\n${body}\n## 9.9.8\n\n- old\n`);
      const t0 = Date.now();
      const proc = Bun.spawnSync(
        ["bash", "-c", `source "${helpers}"; extract_changelog_section "${join(dir, "CHANGELOG.md")}" 9.9.9`],
        { cwd: root, stdout: "pipe", stderr: "pipe", env: { ...process.env, LC_ALL: "C.UTF-8" } },
      );
      const ms = Date.now() - t0;
      expect(proc.exitCode).toBe(0);
      expect(new TextDecoder().decode(proc.stdout)).toContain("a line with UTF-8");
      expect(ms).toBeLessThan(2000);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("extract_changelog_section finds 0.0.40", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.40`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("PLUGIN-7");
    expect(r.stdout).toContain("PLUGIN-8");
    expect(r.stdout).toContain("gif-search");
    expect(r.stdout).not.toContain("## 0.0.39");
  });

  test("extract_changelog_section finds 0.0.39", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.39`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("GITHUB-9");
    expect(r.stdout).toContain("AGENT-12");
    expect(r.stdout).not.toContain("## 0.0.38");
  });

  test("extract_changelog_section finds 0.0.38", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.38`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("SAFE-8.a");
    expect(r.stdout).toContain("DISCORD-3.b");
  });

  test("extract_changelog_section finds 0.0.37", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.37`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("SAFE-3.a");
    expect(r.stdout).toContain("AGENT-3.b");
  });

  test("extract_changelog_section finds 0.0.36", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.36`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("SAFE-18");
    expect(r.stdout).toContain("AUTONOMY-6.a");
  });

  test("extract_changelog_section finds 0.0.35", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.35`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("IDENTITY-7.a");
    expect(r.stdout).toContain("DISCORD-SCHEDULE-3.a");
  });

  test("extract_changelog_section finds 0.0.34", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.34`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("forget_requests");
    expect(r.stdout).toContain("CORVIDINHO_BACKUP_DIR");
  });

  test("extract_changelog_section finds 0.0.33", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.33`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Open asks are secret-scrubbed when a session is saved");
    expect(r.stdout).toContain("now holds the next poll");
  });

  test("extract_changelog_section finds 0.0.32", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.32`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Fledge itself is a set of typed plugin commands");
    expect(r.stdout).toContain("The final answer keeps the model and run state in a small footer");
  });

  test("extract_changelog_section finds 0.0.31", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.31`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("parallel(a, b)");
    expect(r.stdout).toContain("schedule-delete");
  });

  test("extract_changelog_section finds 0.0.30", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.30`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("discord_session_turns");
    expect(r.stdout).toContain("CORVIDINHO_LLM_MODEL_READ");
  });

  test("extract_changelog_section finds 0.0.29", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.29`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Slash asks stay pending");
    expect(r.stdout).toContain("schedule_runs.runner");
  });

  test("extract_changelog_section finds 0.0.28", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.28`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("discord-user-lookup");
    expect(r.stdout).toContain("AGENT-9");
    expect(r.stdout).toContain("Stopped after");
  });

  test("extract_changelog_section finds 0.0.27", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.27`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("agent.3md");
  });

  test("extract_changelog_section finds 0.0.26", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.26`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Spend cap");
    expect(r.stdout).toContain("Interrupted replies");
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
  /** HEAD before the update (the rollback target). */
  prevSha: string;
  run(env: Record<string, string>): { exitCode: number; out: string };
  lines(): string[];
  head(): string;
  cleanup(): void;
}

/** `ahead`: origin/main gets a commit the box does not have, so an update moves HEAD. */
function makeFakeBox(opts: { ahead?: boolean } = {}): FakeBox {
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
  *"discord bridge")
    # Like the real bridge: the protocol handshake line comes before the Discord login.
    echo "[discord] protocol version 2 OK"
    case "\${FAKE_BRIDGE:-ready}" in
      login-fails) sleep 0.3; echo "DiscordAPIError[403]: Missing Access (fake)" >&2; exit 1 ;;
      no-login) exec sleep 30 ;;
      *) sleep 0.3; echo "[discord] logged in as Fake#0001"; exec sleep 3 ;;
    esac ;;
esac
exit 0
`;
  const fakeSystemctl = `#!/usr/bin/env bash
echo "systemctl $* | mark=\${CORVIDINHO_FAKE_MARK:-unset}" >> "$FAKE_CALLS"
case "$1" in
  is-active) [ "\${FAKE_UNIT_INACTIVE:-0}" = "1" ] && exit 3 ;;
esac
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
    return new TextDecoder().decode(p.stdout).trim();
  };
  git(["init", "-q", "--bare", origin], dir);
  git(["init", "-q", "-b", "main"], box);
  writeFileSync(join(box, "package.json"), "{}\n");
  git(["add", "package.json"], box);
  git(["commit", "-q", "-m", "seed"], box);
  git(["remote", "add", "origin", origin], box);
  git(["push", "-q", "origin", "main"], box);
  const prevSha = git(["rev-parse", "HEAD"], box);
  if (opts.ahead) {
    writeFileSync(join(box, "next.txt"), "next\n");
    git(["add", "next.txt"], box);
    git(["commit", "-q", "-m", "next"], box);
    git(["push", "-q", "origin", "main"], box);
    git(["reset", "-q", "--hard", prevSha], box);
  }

  return {
    dir,
    calls,
    pidfile,
    envFile,
    prevSha,
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
    head() {
      return git(["rev-parse", "HEAD"], box);
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

describe("corvidinho-update.sh ready gate (fake box)", () => {
  test("REQ-cli-347: pidfile mode: a bridge that prints protocol OK then exits 1 on login rolls back", () => {
    const box = makeFakeBox({ ahead: true });
    try {
      const r = box.run({ CORVIDINHO_SKIP_DOCTOR: "1", CORVIDINHO_READY_TIMEOUT: "3", FAKE_BRIDGE: "login-fails" });
      expect(r.exitCode).toBe(1);
      expect(r.out).not.toContain("ready signal observed");
      expect(r.out).not.toContain("OK updated");
      // Exit is seen as soon as the pid is reaped; where nothing reaps it, the timeout catches it.
      expect(r.out).toMatch(/bridge exited before ready|ready timeout/);
      expect(r.out).toContain("ROLLBACK: bridge restart/health failed");
      expect(r.out).toContain("ROLLBACK: checkout restored to");
      expect(box.head()).toBe(box.prevSha);
      // Forward start + rollback restart, both from the pidfile path.
      expect(box.lines().filter((l) => l.includes("discord bridge")).length).toBe(2);
    } finally {
      box.cleanup();
    }
  }, 45_000);

  test("REQ-cli-347: pidfile mode: a bridge that never logs in rolls back after CORVIDINHO_READY_TIMEOUT", () => {
    const box = makeFakeBox({ ahead: true });
    try {
      const r = box.run({ CORVIDINHO_SKIP_DOCTOR: "1", CORVIDINHO_READY_TIMEOUT: "2", FAKE_BRIDGE: "no-login" });
      expect(r.exitCode).toBe(1);
      expect(r.out).toContain("waiting up to 2s for [discord] logged in as");
      expect(r.out).toContain("ready timeout");
      expect(r.out).not.toContain("ready signal observed");
      expect(r.out).toContain("ROLLBACK: bridge restart/health failed");
      expect(box.head()).toBe(box.prevSha);
    } finally {
      box.cleanup();
    }
  }, 45_000);

  test("REQ-cli-347: pidfile mode: a bridge that prints the login line passes", () => {
    const box = makeFakeBox({ ahead: true });
    try {
      const r = box.run({ CORVIDINHO_SKIP_DOCTOR: "1", FAKE_BRIDGE: "ready" });
      expect(r.exitCode).toBe(0);
      expect(r.out).toContain("ready signal observed");
      expect(r.out).toContain("OK updated");
      expect(r.out).not.toContain("ROLLBACK");
      expect(box.head()).not.toBe(box.prevSha);
    } finally {
      box.cleanup();
    }
  }, 45_000);

  test("REQ-cli-347: systemd mode keeps its systemctl is-active check", () => {
    const ok = makeFakeBox({ ahead: true });
    try {
      const r = ok.run({ CORVIDINHO_BRIDGE_UNIT: "corvidinho-bridge", CORVIDINHO_SKIP_DOCTOR: "1" });
      expect(r.exitCode).toBe(0);
      expect(ok.lines()).toContain("systemctl is-active --quiet corvidinho-bridge | mark=from-env-file");
      expect(ok.lines().some((l) => l.includes("discord bridge"))).toBe(false);
    } finally {
      ok.cleanup();
    }
    const down = makeFakeBox({ ahead: true });
    try {
      const r = down.run({
        CORVIDINHO_BRIDGE_UNIT: "corvidinho-bridge",
        CORVIDINHO_SKIP_DOCTOR: "1",
        FAKE_UNIT_INACTIVE: "1",
      });
      expect(r.exitCode).toBe(1);
      expect(r.out).toContain("ROLLBACK: bridge restart/health failed");
      expect(down.head()).toBe(down.prevSha);
    } finally {
      down.cleanup();
    }
  }, 45_000);
});

describe("release workflow", () => {
  test("release.yml tags every package version and creates its Release (push to main, vX.Y.Z tag, dispatch backfill)", () => {
    expect(existsSync(releaseYml)).toBe(true);
    const body = readFileSync(releaseYml, "utf8");
    // Triggers: main pushes auto-tag (with catch-up), a person's v* tag, and a manual backfill.
    expect(body).toMatch(/branches:\s*\n\s*- main/);
    expect(body).toContain('- "v*"');
    expect(body).toContain("workflow_dispatch:");
    expect(body).toContain("contents: write");
    expect(body).toContain("!github.event.deleted");
    // Tags at each version's bump commit; idempotent on tags and Releases.
    expect(body).toContain("package_version_commits origin/main");
    expect(body).toContain('release_push_targets "$versions" "$ver"');
    expect(body).toContain('release_dispatch_targets "$versions" "$VERSIONS"');
    expect(body).toContain('git rev-parse -q --verify "refs/tags/${tag}"');
    expect(body).toContain('gh release view "${tag}"');
    expect(body).toContain("--verify-tag");
    expect(body).not.toMatch(/git push[^\n]*(--force|-f\b|--delete)/);
    expect(body).not.toMatch(/git tag[^\n]*(-f\b|--force|-d\b)/);
    expect(body).not.toContain("gh release delete");
    // Event data reaches the shell through env only: no ${{ }} inside any run script.
    const runBlocks = [...body.matchAll(/run: \|\n((?:(?: {10}.*)?\n)*)/g)].map((m) => m[1]);
    expect(runBlocks.length).toBe(2);
    for (const block of runBlocks) expect(block).not.toContain("${{");
  });
});

describe("release tagging helpers", () => {
  // A throwaway repo: 0.0.1, a non-version commit, a release cut to 0.0.2, a
  // dependency-only package.json change, then a feature commit bumping to 0.0.3
  // whose subject names another version.
  function makeRepo() {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-reltag-"));
    // The workflow sources the helpers under strict mode; so do these tests.
    const run = (script: string) =>
      bashEval(
        `cd "${dir}" && export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t && set -euo pipefail && source "${helpers}" && ${script}`,
      );
    const pkg = (version: string, dep = "1") =>
      JSON.stringify({ name: "x", version, scripts: { version: "bun src/cli.ts version" }, dependencies: { d: dep } }, null, 2);
    const commit = (files: Record<string, string>, subject: string) => {
      for (const [f, text] of Object.entries(files)) writeFileSync(join(dir, f), text);
      const r = run(`git add -A && git commit -q -m "${subject}"`);
      if (r.exitCode !== 0) throw new Error(r.stderr);
    };
    expect(run("git init -q -b main").exitCode).toBe(0);
    commit({ "package.json": pkg("0.0.1"), "CHANGELOG.md": "# Changelog\n\n## 0.0.1\n\n### First cut\n\n- a\n" }, "boot (#1)");
    commit({ "README.md": "hi\n" }, "docs: readme (#2)");
    commit(
      { "package.json": pkg("0.0.2"), "CHANGELOG.md": "# Changelog\n\n## 0.0.2\n\n### Second thing\n\n- b\n\n## 0.0.1\n\n### First cut\n\n- a\n" },
      "chore(release): v0.0.2 — second thing (#5)",
    );
    commit({ "package.json": pkg("0.0.2", "2") }, "chore(deps): bump d (#6)");
    commit(
      {
        "package.json": pkg("0.0.3", "2"),
        "CHANGELOG.md": "# Changelog\n\n## 0.0.3\n\n### Third heading\n\n- c\n\n## 0.0.2\n\n### Second thing\n\n- b\n",
      },
      "feat: stuff (v0.0.2) (#7)",
    );
    const sha = (rev: string) => run(`git rev-parse ${rev}`).stdout.trim();
    const versions = join(dir, ".versions.txt");
    return { dir, sha, run, versions, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
  }

  test("package_version_commits lists each version once at the commit that bumped it, oldest first; a bad ref fails", () => {
    const repo = makeRepo();
    try {
      const r = repo.run("package_version_commits main");
      expect(r.exitCode).toBe(0);
      expect(r.stdout.trim().split("\n")).toEqual([
        `0.0.1 ${repo.sha("HEAD~4")}`,
        `0.0.2 ${repo.sha("HEAD~2")}`,
        `0.0.3 ${repo.sha("HEAD")}`,
      ]);
      expect(repo.run("package_version_at HEAD~1").stdout.trim()).toBe("0.0.2");
      expect(repo.run("package_version_commits nosuch").exitCode).not.toBe(0);
    } finally {
      repo.cleanup();
    }
  });

  test("release_push_targets catches up every untagged version from the oldest tag to main's, oldest first", () => {
    const repo = makeRepo();
    try {
      expect(repo.run(`package_version_commits main > "${repo.versions}"`).exitCode).toBe(0);
      // Only 0.0.1 tagged: 0.0.2 and 0.0.3 are pending.
      expect(repo.run("git tag -a v0.0.1 HEAD~4 -m v0.0.1").exitCode).toBe(0);
      let r = repo.run(`release_push_targets "${repo.versions}" 0.0.3`);
      expect(r.exitCode).toBe(0);
      expect(r.stdout.trim().split("\n")).toEqual([`v0.0.2 ${repo.sha("HEAD~2")}`, `v0.0.3 ${repo.sha("HEAD")}`]);
      // Everything tagged: main's version is still listed so its Release is ensured.
      expect(repo.run("git tag -a v0.0.2 HEAD~2 -m v0.0.2 && git tag -a v0.0.3 HEAD -m v0.0.3").exitCode).toBe(0);
      r = repo.run(`release_push_targets "${repo.versions}" 0.0.3`);
      expect(r.stdout.trim()).toBe(`v0.0.3 ${repo.sha("HEAD")}`);
      // Versions older than the oldest existing tag (a bootstrap) are never tagged.
      expect(repo.run("git tag -d v0.0.1 v0.0.3 >/dev/null").exitCode).toBe(0);
      r = repo.run(`release_push_targets "${repo.versions}" 0.0.3`);
      expect(r.stdout.trim()).toBe(`v0.0.3 ${repo.sha("HEAD")}`);
    } finally {
      repo.cleanup();
    }
  });

  test("release_dispatch_targets takes space, comma or newline lists, oldest first, and refuses bad input", () => {
    const repo = makeRepo();
    try {
      expect(repo.run(`package_version_commits main > "${repo.versions}"`).exitCode).toBe(0);
      const r = repo.run(`release_dispatch_targets "${repo.versions}" $'0.0.3,v0.0.2\n0.0.3'`);
      expect(r.exitCode).toBe(0);
      expect(r.stdout.trim().split("\n")).toEqual([`v0.0.2 ${repo.sha("HEAD~2")}`, `v0.0.3 ${repo.sha("HEAD")}`]);
      for (const bad of ["''", "'0.0.9'", "'abc'", "'0.0.2-rc.1'", "'$(id)'"]) {
        expect(repo.run(`release_dispatch_targets "${repo.versions}" ${bad}`).exitCode).not.toBe(0);
      }
    } finally {
      repo.cleanup();
    }
  });

  test("release_tag_subject: a release cut keeps its summary; another bump uses its CHANGELOG heading", () => {
    const repo = makeRepo();
    try {
      expect(repo.run("release_tag_subject 0.0.2 HEAD~2").stdout.trim()).toBe("v0.0.2 — second thing");
      expect(repo.run("release_tag_subject 0.0.3 HEAD").stdout.trim()).toBe("v0.0.3 — Third heading");
    } finally {
      repo.cleanup();
    }
  });

  test("release_notes: package.json version, CHANGELOG section, commits since the previous vX.Y.Z tag, updater line", () => {
    const repo = makeRepo();
    try {
      // A non-release tag in between must not shorten the range.
      expect(repo.run("git tag -a v0.0.2 HEAD~2 -m v0.0.2 && git tag vfoo HEAD~1 && git tag -a v0.0.3 HEAD -m v0.0.3").exitCode).toBe(0);
      const r = repo.run("release_notes v0.0.3");
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain("## Corvidinho v0.0.3");
      expect(r.stdout).toContain("**package.json version:** `0.0.3`");
      expect(r.stdout).toContain("**Commit range:** `v0.0.2..v0.0.3`");
      expect(r.stdout).toContain("### Changes (CHANGELOG.md)\n\n### Third heading");
      expect(r.stdout).not.toContain("### Second thing");
      expect(r.stdout).toContain("- chore(deps): bump d (#6)");
      expect(r.stdout).toContain("- feat: stuff (v0.0.2) (#7)");
      expect(r.stdout).not.toContain("second thing (#5)");
      expect(r.stdout).toContain("CORVIDINHO_REF=v0.0.3 ./scripts/corvidinho-update.sh");
      expect(r.stdout).toContain("Made with [Corvidinho](https://github.com/CorvidLabs/Corvidinho)");
      // A tag whose commit carries another package version says so.
      expect(repo.run("git tag -a v0.0.9 HEAD~1 -m v0.0.9").exitCode).toBe(0);
      expect(repo.run("release_notes v0.0.9").stdout).toContain("**package.json version:** `0.0.2`");
    } finally {
      repo.cleanup();
    }
  });
});

describe("package version", () => {
  test("package.json is 0.0.40", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      version: string;
    };
    expect(pkg.version).toBe("0.0.40");
  });
});
