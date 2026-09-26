/**
 * Exercises scripts/lib/update-helpers.sh predicates via bash -c.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
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
  test("extract_changelog_section finds 0.0.9", () => {
    const r = bashEval(
      `source "${helpers}"; extract_changelog_section CHANGELOG.md 0.0.9`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("SAFE-6");
    expect(r.stdout).toContain("memory ACL hardening");
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
  test("package.json is 0.0.9", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      version: string;
    };
    expect(pkg.version).toBe("0.0.9");
  });
});
