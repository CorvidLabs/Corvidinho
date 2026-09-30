/**
 * AUTONOMY-9/10 (#97, REQ-plugins-097 / REQ-discord-097) — regression pins
 * that load on any build: a real channel post and a push of the default
 * branch no longer just run. With no owner configured nothing can approve
 * their Approve card, so each is refused at once and nothing leaves the box.
 * (Imports only modules main already has, so on main these fail on what they
 * check: the post is sent and the push lands.)
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { runPlugin } from "../src/plugins/run.ts";

const KEYS = [
  "CORVIDINHO_OWNER_DISCORD_ID",
  "CORVIDINHO_DISCORD_ALLOW_CHANNELS",
  "DISCORD_TOKEN",
  "CORVIDINHO_DISCORD_DRY_RUN",
  "CORVIDINHO_ACTING_DISCORD_USER_ID",
  "CORVIDINHO_GITHUB_ALLOW_REPOS",
];
const saved: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;

beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
  delete process.env.CORVIDINHO_OWNER_DISCORD_ID;
  delete process.env.CORVIDINHO_ACTING_DISCORD_USER_ID;
  loadBuiltins();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function git(cwd: string, ...args: string[]): string {
  const r = Bun.spawnSync(["git", ...args], {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@e",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@e",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
    },
  });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString()}`);
  return r.stdout.toString().trim();
}

describe("must-ask regressions: nothing that needs the owner's OK just runs", () => {
  test("a real discord-post-message post waits for the card; with no owner it is refused and nothing is sent (AUTONOMY-10.a)", async () => {
    process.env.CORVIDINHO_DISCORD_ALLOW_CHANNELS = "999";
    process.env.DISCORD_TOKEN = "fixture-token-not-real";
    delete process.env.CORVIDINHO_DISCORD_DRY_RUN;
    const sent: string[] = [];
    globalThis.fetch = (async (url: string | URL | Request) => {
      sent.push(String(url));
      return new Response(JSON.stringify({ id: "m1" }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await runPlugin({
      name: "discord-post-message",
      args: ["--channel", "999", "--content", "text the owner dictated"],
      nonInteractive: true,
      allowlist: ["discord-post-message"],
    });
    expect(sent).toEqual([]);
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(2);
    expect(r.error).toContain("refused (AUTONOMY-10)");
    expect(r.error).toContain("no owner is configured");
  });

  test("git-push of the remote's default branch is a deploy: with no owner it is refused and the remote is unchanged (AUTONOMY-9)", async () => {
    // A local bare remote whose path names acme/widget (the GITHUB-6 slug).
    const bare = join(mkdtempSync(join(tmpdir(), "must-ask-reg-remote-")), "acme", "widget.git");
    mkdirSync(bare, { recursive: true });
    git(bare, "init", "-q", "--bare", "-b", "main");
    const parent = mkdtempSync(join(tmpdir(), "must-ask-reg-"));
    const dir = join(parent, "widget");
    git(parent, "init", "-q", "-b", "main", "widget");
    writeFileSync(join(dir, "a.txt"), "a\n");
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", "a");
    git(dir, "remote", "add", "origin", bare);
    process.env.CORVIDINHO_GITHUB_ALLOW_REPOS = "acme/widget";
    const r = await runPlugin({ name: "git-push", args: [], cwd: dir, nonInteractive: true, allowlist: ["git-push"] });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("refused (AUTONOMY-9)");
    expect(git(bare, "for-each-ref", "--format=%(refname)")).toBe("");
  });
});
