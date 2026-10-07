/**
 * ADMIN-3.c (part 1, REQ-watch-043): `/admin deny|github` changes reach a
 * running `github watch` without a restart. Each poll cycle re-reads the
 * allowlist (file and env) like the schedule daemon's tick:
 *
 * - the new GitHub lists apply that cycle (repos to poll, the repo and user
 *   gates, the people list) — spliced into the poller's config in place;
 * - a file that cannot be loaded skips the cycle (fail closed: nothing is
 *   polled with its deny lists lost);
 * - an empty repo/org allowlist polls nothing;
 * - a change forgets the in-memory denied ids, so they are gated again under
 *   the new lists;
 * - IDENTITY-12.a still holds: a run gets its trigger's declared role.
 *
 * Temp allowlist file, in-memory DB, injected events, dry-run agent stub; no
 * token, no network.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAllowlist } from "../src/allowlist/load.ts";
import { commitAdminListChange, planAdminListChange, type AdminListKey } from "../src/discord/admin-allowlist.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { createEchoAckClient } from "../src/watch/ack.ts";
import type { AgentClient, AgentRunChatOpts } from "../src/watch/agent-client.ts";
import { startWatchPoller, type PollCycleResult } from "../src/watch/poller.ts";
import type { DetectedEvent } from "../src/watch/types.ts";

const REPO = "corvidlabs/app";
const OWNER_GH = 8268288;

function fileText(over: { repos?: string; orgs?: string; users?: string; denyUsers?: string } = {}): string {
  return `[github]
orgs = [${over.orgs ?? ""}]
repos = [${over.repos ?? `"${REPO}"`}]
users = [${over.users ?? `"0xleif", "alice"`}]
deny_users = [${over.denyUsers ?? ""}]

[discord]
channels = ["600000000000000006"]

[owner]
discord_id = "100000000000000001"
github_login = "0xleif"
github_id = "${OWNER_GH}"
`;
}

let dir = "";
let path = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "corvidinho-watch-reload-"));
  path = join(dir, "allowlist.toml");
  writeFileSync(path, fileText());
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function ev(over: Partial<DetectedEvent> = {}): DetectedEvent {
  return {
    id: "comment-1",
    type: "issue_comment",
    body: "@corvid-agent please look",
    sender: "alice",
    senderId: 4242,
    repo: REPO,
    number: 7,
    title: "Crash on start",
    htmlUrl: `https://github.com/${REPO}/issues/7`,
    createdAt: "2026-10-06T12:00:00Z",
    isPullRequest: false,
    ...over,
  };
}

/** A poller over the temp file whose next cycles return `batches` in turn. */
async function poller(batches: DetectedEvent[][]) {
  const runs: AgentRunChatOpts[] = [];
  const logs: string[] = [];
  let fetches = 0;
  const agent: AgentClient = {
    async runChat(opts) {
      runs.push(opts);
      return { ok: true, sessionId: opts.sessionId, summary: "ok", exitCode: 0 };
    },
  };
  const db = openCorvidinhoDb({ memory: true });
  const env: NodeJS.ProcessEnv = {
    GITHUB_TOKEN: "fixture-token-not-real",
    CORVIDINHO_WATCH_USERNAME: "corvid-agent",
    CORVIDINHO_WATCH_DRY_RUN: "1",
    HOME: dir,
  };
  const started = await startWatchPoller({
    env,
    filePath: path,
    runLoop: false,
    agent,
    ackClient: createEchoAckClient(),
    db,
    log: (m) => logs.push(m),
    logError: (m) => logs.push(m),
    fetchEvents: async () => {
      const batch = batches[fetches] ?? [];
      fetches += 1;
      return batch;
    },
  });
  if (!started.ok) throw new Error(started.message);
  return {
    started,
    runs,
    logs,
    env,
    fetches: () => fetches,
    poll: (): Promise<PollCycleResult> => started.pollOnce(),
    close: async () => {
      await started.stop();
      db.close();
    },
  };
}

/** What the bridge's /admin does: plan + commit on its own loaded allowlist. */
async function adminChange(key: AdminListKey, op: "add" | "remove", id: string): Promise<void> {
  const env = { HOME: dir, CORVIDINHO_ALLOWLIST_FILE: path };
  const bridge = await loadAllowlist({ env, home: dir });
  const plan = planAdminListChange({ allowlist: bridge, env, home: dir, key, op, id });
  if (!plan.ok) throw new Error(plan.error);
  commitAdminListChange(plan.plan, { allowlist: bridge });
}

describe("github watch re-reads the allowlist every cycle (ADMIN-3.c, REQ-watch-043)", () => {
  test("/admin github add / deny add apply on the next cycle, no restart; config spliced in place", async () => {
    const w = await poller([[], [ev({ id: "comment-2", repo: "octo-org/tool", number: 3 })], [ev({ id: "comment-3" })]]);
    try {
      const repos = w.started.config.repos;
      const allowlist = w.started.config.allowlist;
      expect(repos).toEqual([REPO]);
      await w.poll();

      await adminChange("github.repos", "add", "octo-org/tool");
      const second = await w.poll();
      expect(w.started.config.repos).toBe(repos);
      expect(repos).toEqual([REPO, "octo-org/tool"]);
      expect(w.started.config.allowlist).toBe(allowlist);
      expect(second.started).toBe(1);
      expect(w.runs.map((r) => r.repo)).toEqual(["octo-org/tool"]);

      await adminChange("github.deny_users", "add", "alice");
      const third = await w.poll();
      expect(third.refused).toBe(1);
      expect(w.runs).toHaveLength(1);
      expect(allowlist.github.denyUsers).toEqual(["alice"]);
      expect(w.logs.some((l) => l.startsWith("[watch] allowlist changed:"))).toBe(true);
    } finally {
      await w.close();
    }
  });

  test("/admin deny add github_user:<numeric id> refuses that sender's next event by their id, whatever login they use", async () => {
    const w = await poller([[ev({ id: "comment-10" })], [ev({ id: "comment-11", sender: "alice-renamed" })], [ev({ id: "comment-12", senderId: 999 })]]);
    try {
      // alice (id 4242) is on [github].users; deny her numeric id only.
      await adminChange("github.deny_users", "add", "4242");
      const first = await w.poll();
      expect(first.refused).toBe(1);
      expect(first.started).toBe(0);
      // A renamed login with the same id is refused too.
      expect((await w.poll()).refused).toBe(1);
      expect(w.runs).toHaveLength(0);
      // Another id with the allowlisted login still runs (the deny is the id).
      expect((await w.poll()).started).toBe(1);
      expect(w.runs.map((r) => r.actingGithubId)).toEqual([999]);
    } finally {
      await w.close();
    }
  });

  test("a file that cannot be loaded skips the cycle: nothing polled, the last good lists kept; fixed ⇒ polls again", async () => {
    const w = await poller([[ev()], [ev({ id: "comment-9" })]]);
    try {
      await adminChange("github.deny_users", "add", "mallory");
      writeFileSync(path, `${fileText({ denyUsers: '"mallory"' })}\n[github]\ndeny_repos = [\n  "unterminated",\n`);
      const r = await w.poll();
      expect(r.allowlistSkip).toBe("unreadable");
      expect(w.fetches()).toBe(0);
      expect(w.runs).toHaveLength(0);
      expect(w.logs.some((l) => l.includes("[watch] poll skip: allowlist could not be loaded"))).toBe(true);
      // Nothing was spliced from the broken file.
      expect(w.started.config.repos).toEqual([REPO]);

      writeFileSync(path, fileText({ denyUsers: '"mallory"' }));
      const ok = await w.poll();
      expect(ok.allowlistSkip).toBeUndefined();
      expect(w.fetches()).toBe(1);
      expect(w.started.config.allowlist.github.denyUsers).toEqual(["mallory"]);
      expect(w.runs).toHaveLength(1);
    } finally {
      await w.close();
    }
  });

  test("an empty repo/org allowlist polls nothing (after /admin github remove of the last entry)", async () => {
    const w = await poller([[ev()]]);
    try {
      await adminChange("github.repos", "remove", REPO);
      const r = await w.poll();
      expect(r.allowlistSkip).toBe("empty");
      expect(w.fetches()).toBe(0);
      expect(w.started.config.repos).toEqual([]);
      expect(w.logs.some((l) => l.includes("GitHub repo allowlist empty"))).toBe(true);

      await adminChange("github.orgs", "add", "corvidlabs");
      const back = await w.poll();
      expect(back.allowlistSkip).toBeUndefined();
      expect(w.started.config.repos).toEqual(["corvidlabs/*"]);
      expect(w.fetches()).toBe(1);
    } finally {
      await w.close();
    }
  });

  test("a change clears the denied ids: an event refused under the old lists is gated again under the new ones", async () => {
    const carol = ev({ id: "comment-5", sender: "carol", senderId: 5151 });
    const w = await poller([[carol], [carol], [carol]]);
    try {
      expect((await w.poll()).refused).toBe(1);
      // Same lists: the denied id is remembered (refused quietly once).
      expect((await w.poll()).refused).toBe(0);
      expect(w.runs).toHaveLength(0);
      // The VM file gains carol on [github].users (the list /admin leaves read-only).
      writeFileSync(path, fileText({ users: '"0xleif", "alice", "carol"' }));
      const third = await w.poll();
      expect(third.started).toBe(1);
      expect(w.runs.map((r) => r.actingGithubLogin)).toEqual(["carol"]);
    } finally {
      await w.close();
    }
  });

  test("IDENTITY-12.a still holds after a reload: the owner's comment runs as owner, a stranger's as community", async () => {
    const w = await poller([[], [ev({ id: "comment-7", sender: "0xLeif", senderId: OWNER_GH }), ev({ id: "comment-8", number: 8, senderId: 999 })]]);
    try {
      await w.poll();
      await adminChange("github.orgs", "add", "octo-org");
      await w.poll();
      const byId = Object.fromEntries(w.runs.map((r) => [r.actingGithubId, r.actingRole]));
      expect(byId[OWNER_GH]).toBe("owner");
      expect(byId[999]).toBe("community");
    } finally {
      await w.close();
    }
  });
});
