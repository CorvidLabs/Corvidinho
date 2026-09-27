/**
 * DISCORD-SCHEDULE-3 (REQ-discord-020): a schedule tick re-checks its creator
 * against the live Discord actor gate (REQ-discord-201) — deny list wins, a
 * non-empty user list must list the creator unless they are the configured
 * owner — before running and again before posting. Fixtures only: in-memory
 * store, injected agent, no Discord.
 */
import { describe, expect, test } from "bun:test";
import { emptyConfig, type AllowlistConfig } from "../src/allowlist/types.ts";
import type { AgentClient } from "../src/discord/agent-client.ts";
import type { OwnerRecord } from "../src/identity/owner.ts";
import { ScheduleStore } from "../src/scheduler/store.ts";
import {
  FAILURE_AUTO_PAUSE,
  SchedulerService,
  type ScheduleRunFinished,
} from "../src/scheduler/service.ts";

const OWNER_ID = "123456789012345678";
const OWNER: OwnerRecord = { discordId: OWNER_ID };

function allowCfg(over: Partial<AllowlistConfig["discord"]> = {}): AllowlistConfig {
  const cfg = emptyConfig();
  cfg.discord.channels = ["chan-ok"];
  Object.assign(cfg.discord, over);
  return cfg;
}

function harness(opts: {
  allowlist: AllowlistConfig;
  creators: string[];
  owner?: OwnerRecord | null;
  agent?: AgentClient;
}) {
  const store = new ScheduleStore();
  const past = Date.now() - 60_000;
  const schedules = opts.creators.map((creator, i) => {
    const s = store.create({
      name: `job-${i}`,
      cronExpression: "0 * * * *",
      project: "p",
      prompt: "do thing",
      createdByUserId: creator,
      channelId: "chan-ok",
      now: past - 3_600_000,
    });
    s.nextRunAt = past;
    return s;
  });
  const calls: string[] = [];
  const posts: Array<{ channelId: string; content: string }> = [];
  const finished: ScheduleRunFinished[] = [];
  const agent: AgentClient = opts.agent ?? {
    async runChat({ sessionId, actingUserId }) {
      calls.push(actingUserId ?? "");
      return { ok: true, sessionId, summary: "done", exitCode: 0 };
    },
  };
  const svc = new SchedulerService({
    store,
    agent,
    allowlist: opts.allowlist,
    owner: opts.owner ?? null,
    manual: true,
    maxConcurrent: 5,
    useWorktrees: false,
    outbound: {
      post: async (p) => {
        posts.push(p);
      },
    },
    onRunFinished: (e) => finished.push(e),
  });
  return { store, schedules, svc, calls, posts, finished, past };
}

describe("schedule tick creator gate (DISCORD-SCHEDULE-3)", () => {
  test("a deny-listed creator's schedule is refused at tick: no agent run, no post", async () => {
    const h = harness({
      allowlist: allowCfg({ denyUsers: ["creator-1"] }),
      creators: ["creator-1"],
    });
    const r = await h.svc.tick();
    expect(r.started).toEqual([h.schedules[0]!.id]);
    expect(await h.svc.drain(2_000)).toBe(true);
    expect(h.calls).toEqual([]);
    expect(h.posts).toEqual([]);
    expect(h.finished).toHaveLength(1);
    expect(h.finished[0]!.ok).toBe(false);
    expect(h.finished[0]!.error).toStartWith("creator not allowlisted: ");
    expect(h.schedules[0]!.consecutiveFailures).toBe(1);
  });

  test("a creator not on a non-empty user allowlist is refused; listed users and the owner still run", async () => {
    const h = harness({
      allowlist: allowCfg({ users: ["listed-1"] }),
      owner: OWNER,
      creators: ["unlisted-1", "listed-1", OWNER_ID],
    });
    await h.svc.tick();
    expect(await h.svc.drain(2_000)).toBe(true);
    expect(h.calls.sort()).toEqual([OWNER_ID, "listed-1"].sort());
    const byId = new Map(h.finished.map((e) => [e.scheduleId, e]));
    const [unlisted, listed, owner] = h.schedules;
    expect(byId.get(unlisted!.id)).toMatchObject({ ok: false });
    expect(byId.get(unlisted!.id)?.error).toStartWith("creator not allowlisted: ");
    expect(byId.get(listed!.id)).toMatchObject({ ok: true });
    expect(byId.get(owner!.id)).toMatchObject({ ok: true });
    expect(h.posts).toHaveLength(2);
  });

  test("the configured owner on the deny list is refused (deny wins)", async () => {
    const h = harness({
      allowlist: allowCfg({ denyUsers: [OWNER_ID] }),
      owner: OWNER,
      creators: [OWNER_ID],
    });
    await h.svc.tick();
    expect(await h.svc.drain(2_000)).toBe(true);
    expect(h.calls).toEqual([]);
    expect(h.posts).toEqual([]);
    expect(h.finished[0]!.error).toStartWith("creator not allowlisted: ");
  });

  test("a creator deny-listed while the run is in flight gets no post", async () => {
    const allowlist = allowCfg();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let started = false;
    const h = harness({
      allowlist,
      creators: ["creator-1"],
      agent: {
        async runChat({ sessionId }) {
          started = true;
          await gate;
          return { ok: true, sessionId, summary: "done", exitCode: 0 };
        },
      },
    });
    await h.svc.tick();
    await Bun.sleep(10);
    expect(started).toBe(true);
    // e.g. `/admin` in the bridge edits the shared allowlist in place.
    allowlist.discord.denyUsers.push("creator-1");
    release();
    expect(await h.svc.drain(2_000)).toBe(true);
    expect(h.posts).toEqual([]);
  });

  test("refused creator ticks count toward the auto-pause", async () => {
    const h = harness({
      allowlist: allowCfg({ users: ["someone-else"] }),
      creators: ["creator-1"],
    });
    const s = h.schedules[0]!;
    for (let i = 0; i < FAILURE_AUTO_PAUSE; i++) {
      s.nextRunAt = h.past;
      await h.svc.tick();
      expect(await h.svc.drain(2_000)).toBe(true);
    }
    expect(h.calls).toEqual([]);
    expect(h.store.get(s.id)?.status).toBe("paused");
    expect(h.finished.at(-1)?.autoPaused).toBe(true);
  });

  test("empty user and role lists stay channel-gated: an unlisted creator still runs", async () => {
    const h = harness({ allowlist: allowCfg(), creators: ["anyone"] });
    await h.svc.tick();
    expect(await h.svc.drain(2_000)).toBe(true);
    expect(h.calls).toEqual(["anyone"]);
    expect(h.posts).toHaveLength(1);
  });
});
