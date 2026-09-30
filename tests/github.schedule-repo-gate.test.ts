/**
 * DISCORD-SCHEDULE-3.a — scheduled runs read and act only on repos the owner
 * allowlists, even public ones.
 *
 * - The schedule-run marker: `CORVIDINHO_DISCORD_SESSION_ID` starting with
 *   `SCHEDULE_SESSION_PREFIX` (`isScheduleRunEnv`); the scheduler builds its
 *   session id from the constant, and `delegate` / `council` workers inherit it.
 * - The GitHub repo gate (`checkRepoGateForActingRole`, used by every
 *   `github-*` reader and writer, the review readers and the public-docs
 *   readers): in a schedule env a repo off the GITHUB-6 allowlist is refused
 *   with no visibility lookup, for the owner and community stamps and for a
 *   worker; deny still wins; the role rules still apply to what passes.
 * - `web-fetch`: in a schedule env every hop to a GitHub host must name an
 *   allowlisted repo, redirects included; other hosts and other runs are
 *   unchanged.
 *
 * No network: GitHub is a stubbed `fetch`, web-fetch gets resolver and
 * transport seams. The new exports are read through a namespace import so
 * that, on the base sources, these tests fail on behaviour, not on import.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDelegateSpawn } from "../src/autonomous/delegate.ts";
import { emptyConfig, type AllowlistConfig } from "../src/allowlist/types.ts";
import type { AgentRunChatOpts } from "../src/discord/agent-client.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { checkRepoGateForActingRole } from "../src/plugins/githubPublic.ts";
import { clearRegistry } from "../src/plugins/registry.ts";
import * as roles from "../src/plugins/roles.ts";
import { runPlugin } from "../src/plugins/run.ts";
import type { PluginHandlerArgs } from "../src/plugins/types.ts";
import { SchedulerService } from "../src/scheduler/service.ts";
import { ScheduleStore } from "../src/scheduler/store.ts";
import { WebFetchError, webFetch, type Resolver, type WebFetchDeps } from "../plugins/web/fetch.ts";
import { createWebCommands } from "../plugins/web/index.ts";
import type { Transport, TransportRequest } from "../plugins/web/transport.ts";

const OWNER = "181969874455756800";
const STRANGER = "999";
const ALLOWED = "CorvidLabs/Corvidinho";
const PUBLIC_OFF_LIST = "torvalds/linux";
const SCHEDULE_SESSION = "schedule_sched_abc123";

/** Every env key these tests set on `process.env`; restored after each test. */
const KEYS = [
  "CORVIDINHO_DISCORD_SESSION_ID",
  "CORVIDINHO_ACTING_IS_ADMIN",
  "CORVIDINHO_ACTING_DISCORD_USER_ID",
  "CORVIDINHO_ACTING_ROLE",
  "CORVIDINHO_ACTING_WORK_TASK",
  "CORVIDINHO_OWNER_DISCORD_ID",
  "CORVIDINHO_ALLOWLIST_FILE",
  "CORVIDINHO_GITHUB_ALLOW_REPOS",
  "CORVIDINHO_GITHUB_ALLOW_ORGS",
  "CORVIDINHO_GITHUB_DENY_REPOS",
  "CORVIDINHO_GITHUB_DENY_ORGS",
  "GITHUB_TOKEN",
  "GH_TOKEN",
] as const;

let saved: Record<string, string | undefined> = {};
let tmp = "";
let allowFile = "";

beforeEach(() => {
  saved = {};
  for (const k of KEYS) saved[k] = process.env[k];
  for (const k of KEYS) delete process.env[k];
  tmp = mkdtempSync(join(tmpdir(), "gh-schedule-gate-"));
  allowFile = join(tmp, "allowlist.toml");
  writeFileSync(
    allowFile,
    `[github]\norgs = ["CorvidLabs"]\ndeny_repos = ["CorvidLabs/secret"]\n\n` +
      `[discord]\nchannels = ["1"]\n\n[owner]\ndiscord_id = "${OWNER}"\ndisplay = "Leif"\n`,
    "utf8",
  );
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(tmp, { recursive: true, force: true });
});

/** A spawned run's env as the Discord spawn client stamps it. */
function runEnv(opts: { session: string; owner: boolean }): NodeJS.ProcessEnv {
  return {
    CORVIDINHO_ALLOWLIST_FILE: allowFile,
    CORVIDINHO_DISCORD_SESSION_ID: opts.session,
    CORVIDINHO_ACTING_DISCORD_USER_ID: opts.owner ? OWNER : STRANGER,
    CORVIDINHO_ACTING_IS_ADMIN: opts.owner ? "1" : "0",
    CORVIDINHO_ACTING_ROLE: opts.owner ? "owner" : "community",
    CORVIDINHO_ACTING_WORK_TASK: "0",
  };
}

/** A visibility lookup that answers `vis` and counts its calls. */
function lookup(vis: "public" | "private" = "public") {
  const calls: string[] = [];
  return {
    calls,
    fn: async (repo: string) => {
      calls.push(repo);
      return vis;
    },
  };
}

describe("schedule-run marker (DISCORD-SCHEDULE-3.a)", () => {
  test("SCHEDULE_SESSION_PREFIX / isScheduleRunEnv: schedule_* only", () => {
    expect(roles.SCHEDULE_SESSION_PREFIX).toBe("schedule_");
    expect(roles.isScheduleRunEnv({ CORVIDINHO_DISCORD_SESSION_ID: SCHEDULE_SESSION })).toBe(true);
    for (const id of ["sess_0123456789abcdef", "work_0123456789abcdef", "wsess_0123456789abcdef", "", "x_schedule_1"]) {
      expect(roles.isScheduleRunEnv({ CORVIDINHO_DISCORD_SESSION_ID: id })).toBe(false);
    }
    expect(roles.isScheduleRunEnv({})).toBe(false);
  });

  test("the scheduler's run session id carries the marker", async () => {
    const calls: AgentRunChatOpts[] = [];
    const store = new ScheduleStore();
    const past = Date.now() - 60_000;
    const s = store.create({
      name: "digest",
      cronExpression: "0 * * * *",
      project: "",
      prompt: "summarize",
      createdByUserId: OWNER,
      now: past - 3_600_000,
    });
    s.nextRunAt = past;
    const cfg = emptyConfig();
    const svc = new SchedulerService({
      store,
      agent: {
        runChat: async (o: AgentRunChatOpts) => {
          calls.push(o);
          return { ok: true, sessionId: o.sessionId, summary: "ok", exitCode: 0 } as never;
        },
      } as never,
      allowlist: cfg,
      manual: true,
      useWorktrees: false,
      owner: { discordId: OWNER },
    });
    await svc.tick();
    await svc.drain(5_000);
    svc.stop();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sessionId).toBe(`${roles.SCHEDULE_SESSION_PREFIX}${s.id}`);
    expect(roles.isScheduleRunEnv({ CORVIDINHO_DISCORD_SESSION_ID: calls[0]!.sessionId })).toBe(true);
  });

  test("a delegate / council worker of a scheduled run inherits the marker", () => {
    for (const owner of [true, false]) {
      const lead = runEnv({ session: SCHEDULE_SESSION, owner });
      // council passes its voices `{ ...env, CORVIDINHO_ACTING_IS_ADMIN: "0" }`.
      for (const baseEnv of [lead, { ...lead, CORVIDINHO_ACTING_IS_ADMIN: "0" }]) {
        const { env } = buildDelegateSpawn({
          bin: "corvidinho",
          taskText: "look at a repo",
          tier: "read",
          childDepth: 1,
          allowlist: [],
          baseEnv,
        });
        expect(env.CORVIDINHO_DISCORD_SESSION_ID).toBe(SCHEDULE_SESSION);
        expect(roles.isScheduleRunEnv(env)).toBe(true);
        expect(env.CORVIDINHO_ACTING_IS_ADMIN).toBe("0");
      }
    }
  });
});

describe("checkRepoGateForActingRole in a scheduled run (DISCORD-SCHEDULE-3.a)", () => {
  test("a public repo off the allowlist is refused for the community and owner stamps, with no visibility lookup", async () => {
    for (const owner of [false, true]) {
      const look = lookup("public");
      const r = await checkRepoGateForActingRole(PUBLIC_OFF_LIST, {
        env: runEnv({ session: SCHEDULE_SESSION, owner }),
        visibilityLookup: look.fn,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toContain("GITHUB-6");
        expect(r.error).toContain("DISCORD-SCHEDULE-3.a");
      }
      expect(look.calls).toEqual([]);
    }
  });

  test("a delegate / council worker of a scheduled run is refused the same way", async () => {
    const { env } = buildDelegateSpawn({
      bin: "corvidinho",
      taskText: "read torvalds/linux",
      tier: "read",
      childDepth: 1,
      allowlist: [],
      baseEnv: runEnv({ session: SCHEDULE_SESSION, owner: false }),
    });
    const look = lookup("public");
    const r = await checkRepoGateForActingRole(PUBLIC_OFF_LIST, { env, visibilityLookup: look.fn });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("DISCORD-SCHEDULE-3.a");
    expect(look.calls).toEqual([]);
  });

  test("an allowlisted repo passes; deny still wins", async () => {
    for (const owner of [false, true]) {
      const env = runEnv({ session: SCHEDULE_SESSION, owner });
      const ok = await checkRepoGateForActingRole(ALLOWED, { env, visibilityLookup: lookup("public").fn });
      expect(ok).toEqual({ ok: true, repo: ALLOWED });
      const denied = await checkRepoGateForActingRole("CorvidLabs/secret", {
        env,
        visibilityLookup: lookup("public").fn,
      });
      expect(denied.ok).toBe(false);
      if (!denied.ok) expect(denied.error).toContain("is denied");
    }
  });

  test("the role rules still apply to an allowlisted repo: community writes refused, community reads need a public repo", async () => {
    const env = runEnv({ session: SCHEDULE_SESSION, owner: false });
    const write = await checkRepoGateForActingRole(ALLOWED, {
      env,
      write: true,
      visibilityLookup: lookup("public").fn,
    });
    expect(write.ok).toBe(false);
    if (!write.ok) expect(write.error).toContain("ROLES-CHAT-3");

    const privateRead = await checkRepoGateForActingRole(ALLOWED, {
      env,
      visibilityLookup: lookup("private").fn,
    });
    expect(privateRead.ok).toBe(false);
    if (!privateRead.ok) expect(privateRead.error).toContain("ROLES-CHAT-8");

    // The owner stamp keeps the plain allowlist: private allowlisted repos pass.
    const ownerRead = await checkRepoGateForActingRole(ALLOWED, {
      env: runEnv({ session: SCHEDULE_SESSION, owner: true }),
      visibilityLookup: lookup("private").fn,
    });
    expect(ownerRead.ok).toBe(true);
  });

  test("outside a scheduled run nothing changes: a community chat still reads a public repo (ROLES-CHAT-8)", async () => {
    const look = lookup("public");
    const r = await checkRepoGateForActingRole(PUBLIC_OFF_LIST, {
      env: runEnv({ session: "sess_0123456789abcdef", owner: false }),
      visibilityLookup: look.fn,
    });
    expect(r).toEqual({ ok: true, repo: PUBLIC_OFF_LIST });
    expect(look.calls).toEqual([PUBLIC_OFF_LIST]);
  });
});

/**
 * Through the plugins, with the real Octokit visibility lookup: GitHub is a
 * stubbed `fetch` that says the repo is public. In a scheduled run no GitHub
 * call is made at all; in a community chat the same call goes through.
 */
describe("GitHub readers in a scheduled run (DISCORD-SCHEDULE-3.a)", () => {
  const realFetch = globalThis.fetch;
  let urls: string[] = [];

  beforeEach(() => {
    urls = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      urls.push(url);
      const body = url.endsWith(`/repos/${PUBLIC_OFF_LIST}`)
        ? { full_name: PUBLIC_OFF_LIST, private: false }
        : url.includes("/readme")
          ? { type: "file", encoding: "base64", content: Buffer.from("# linux\n").toString("base64"), path: "README" }
          : [];
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    process.env.GITHUB_TOKEN = "fixture-token-not-real";
    clearRegistry();
    loadBuiltins();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const CALLS: ReadonlyArray<[string, string[]]> = [
    ["github-pr-list", ["--repo", PUBLIC_OFF_LIST]],
    ["github-issue-list", ["--repo", PUBLIC_OFF_LIST]],
    ["github-pr-diff", ["1", "--repo", PUBLIC_OFF_LIST]],
    ["github-pr-files", ["1", "--repo", PUBLIC_OFF_LIST]],
    ["github-docs-read", ["--repo", PUBLIC_OFF_LIST]],
    ["github-milestone-list", ["--repo", PUBLIC_OFF_LIST]],
  ];

  test("every reader refuses a public repo off the allowlist before any GitHub call", async () => {
    Object.assign(process.env, runEnv({ session: SCHEDULE_SESSION, owner: false }));
    for (const [name, args] of CALLS) {
      urls = [];
      const r = await runPlugin({ name, args, nonInteractive: true });
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(3);
      expect(r.error).toContain("DISCORD-SCHEDULE-3.a");
      expect(urls).toEqual([]);
    }
  });

  test("the same reader in a community chat still reaches the public repo", async () => {
    Object.assign(process.env, runEnv({ session: "sess_0123456789abcdef", owner: false }));
    const r = await runPlugin({ name: "github-pr-list", args: ["--repo", PUBLIC_OFF_LIST], nonInteractive: true });
    expect(r.ok).toBe(true);
    expect(urls.some((u) => u.endsWith(`/repos/${PUBLIC_OFF_LIST}`))).toBe(true);
  });
});

// --- web-fetch -------------------------------------------------------------

const PUBLIC_IP = "93.184.216.34";

function webSeams(reply: (req: TransportRequest) => { status?: number; headers?: Record<string, string>; text?: string }) {
  const calls: TransportRequest[] = [];
  const resolver: Resolver = async () => [{ address: PUBLIC_IP, family: 4 }];
  const transport: Transport = async (req) => {
    calls.push(req);
    const r = reply(req);
    return {
      status: r.status ?? 200,
      statusText: "",
      headers: r.headers ?? { "content-type": "text/plain; charset=utf-8" },
      body: (async function* () {
        yield new TextEncoder().encode(r.text ?? "ok");
      })(),
      close: () => {},
    };
  };
  return { resolver, transport, calls };
}

function allowCfg(): AllowlistConfig {
  const cfg = emptyConfig();
  cfg.github.orgs = ["corvidlabs"];
  cfg.github.denyRepos = ["corvidlabs/secret"];
  return cfg;
}

const SCHEDULE_ENV = { CORVIDINHO_DISCORD_SESSION_ID: SCHEDULE_SESSION };

async function refused(url: string, deps: WebFetchDeps): Promise<WebFetchError> {
  try {
    await webFetch(url, deps);
  } catch (e) {
    expect(e).toBeInstanceOf(WebFetchError);
    return e as WebFetchError;
  }
  throw new Error(`expected ${url} to be refused`);
}

const OFF_LIST_URLS = [
  `https://raw.githubusercontent.com/${PUBLIC_OFF_LIST}/master/README`,
  `https://github.com/${PUBLIC_OFF_LIST}`,
  `https://GitHub.com./${PUBLIC_OFF_LIST}/blob/master/README`,
  `https://www.github.com/${PUBLIC_OFF_LIST}`,
  `https://api.github.com/repos/${PUBLIC_OFF_LIST}/contents/README`,
  `https://codeload.github.com/${PUBLIC_OFF_LIST}/tar.gz/master`,
  `https://gist.github.com/torvalds/0123456789abcdef`,
  `https://gist.githubusercontent.com/torvalds/0123456789abcdef/raw/x.txt`,
  `https://objects.githubusercontent.com/github-production-release-asset/1`,
  // No repo this check can read: refused too (fails closed).
  "https://github.com/",
  "https://github.com/torvalds",
  "https://api.github.com/users/torvalds",
  "https://github.com/%2e%2e/linux",
  // Deny wins over the allowlisted org.
  "https://github.com/CorvidLabs/secret",
];

const ALLOWED_URLS = [
  `https://raw.githubusercontent.com/${ALLOWED}/main/README.md`,
  `https://github.com/${ALLOWED}`,
  `https://github.com/corvidlabs/corvidinho.git`,
  `https://api.github.com/repos/${ALLOWED}/contents/README.md`,
  `https://codeload.github.com/${ALLOWED}/tar.gz/main`,
  "https://example.com/page",
];

describe("web-fetch in a scheduled run (DISCORD-SCHEDULE-3.a)", () => {
  test("a GitHub URL off the allowlist is refused before DNS or any connection", async () => {
    for (const url of OFF_LIST_URLS) {
      const w = webSeams(() => ({ text: "repo content" }));
      const err = await refused(url, { ...w, env: SCHEDULE_ENV, allowlist: allowCfg() });
      expect(err.code).toBe("blocked");
      expect(err.message).toContain("DISCORD-SCHEDULE-3.a");
      expect(w.calls).toHaveLength(0);
    }
  });

  test("allowlisted repos and other hosts still fetch", async () => {
    for (const url of ALLOWED_URLS) {
      const w = webSeams(() => ({ text: "fine" }));
      const out = await webFetch(url, { ...w, env: SCHEDULE_ENV, allowlist: allowCfg() });
      expect(out.text).toBe("fine");
      expect(w.calls).toHaveLength(1);
    }
  });

  test("a redirect into raw.githubusercontent.com for a repo off the allowlist is refused on that hop", async () => {
    const w = webSeams((req) =>
      req.url.hostname === "example.com"
        ? { status: 302, headers: { location: `https://raw.githubusercontent.com/${PUBLIC_OFF_LIST}/master/README` } }
        : { text: "repo content" },
    );
    const err = await refused("https://example.com/r", { ...w, env: SCHEDULE_ENV, allowlist: allowCfg() });
    expect(err.code).toBe("blocked");
    expect(err.message).toContain("raw.githubusercontent.com");
    expect(err.message).toContain("DISCORD-SCHEDULE-3.a");
    expect(w.calls).toHaveLength(1);
    expect(w.calls[0]!.url.hostname).toBe("example.com");
  });

  test("an allowlisted GitHub URL that redirects off the allowlist is refused on that hop", async () => {
    const w = webSeams((req) =>
      req.url.pathname.startsWith(`/${ALLOWED}`)
        ? { status: 301, headers: { location: `/${PUBLIC_OFF_LIST}` } }
        : { text: "repo content" },
    );
    const err = await refused(`https://github.com/${ALLOWED}`, { ...w, env: SCHEDULE_ENV, allowlist: allowCfg() });
    expect(err.code).toBe("blocked");
    expect(w.calls).toHaveLength(1);
  });

  test("an unreadable allowlist refuses every GitHub hop in a scheduled run; other hosts still fetch", async () => {
    const bad = join(tmp, "broken.toml");
    writeFileSync(bad, "[github\norgs = [", "utf8");
    const env = { ...SCHEDULE_ENV, CORVIDINHO_ALLOWLIST_FILE: bad };
    const w = webSeams(() => ({ text: "x" }));
    const err = await refused(`https://github.com/${ALLOWED}`, { ...w, env });
    expect(err.code).toBe("blocked");
    const out = await webFetch("https://example.com/", { ...w, env });
    expect(out.text).toBe("x");
  });

  test("outside a scheduled run the same URLs and redirect fetch as before", async () => {
    for (const env of [{}, { CORVIDINHO_DISCORD_SESSION_ID: "sess_0123456789abcdef" }]) {
      const w = webSeams((req) =>
        req.url.hostname === "example.com"
          ? { status: 302, headers: { location: `https://raw.githubusercontent.com/${PUBLIC_OFF_LIST}/master/README` } }
          : { text: "repo content" },
      );
      const out = await webFetch("https://example.com/r", { ...w, env, allowlist: allowCfg() });
      expect(out.text).toBe("repo content");
      expect(out.finalUrl).toContain("raw.githubusercontent.com");
      const direct = await webFetch(OFF_LIST_URLS[0]!, { ...w, env, allowlist: allowCfg() });
      expect(direct.text).toBe("repo content");
    }
  });

  test("the web-fetch handler passes the run's env: refused in a scheduled run (exit 2), fetched in a chat", async () => {
    process.env.CORVIDINHO_ALLOWLIST_FILE = allowFile;
    const w = webSeams(() => ({ text: "repo content" }));
    const [cmd] = createWebCommands({ resolver: w.resolver, transport: w.transport });
    const ctx = (url: string): PluginHandlerArgs => ({
      args: [url],
      cwd: tmp,
      json: false,
      nonInteractive: true,
      allowlist: new Set(["web-fetch"]),
    });
    const url = `https://raw.githubusercontent.com/${PUBLIC_OFF_LIST}/master/README`;

    process.env.CORVIDINHO_DISCORD_SESSION_ID = SCHEDULE_SESSION;
    const r = await cmd!.handler(ctx(url));
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(2);
    expect(r.error).toContain("DISCORD-SCHEDULE-3.a");
    expect(w.calls).toHaveLength(0);

    process.env.CORVIDINHO_DISCORD_SESSION_ID = "sess_0123456789abcdef";
    const ok = await cmd!.handler(ctx(url));
    expect(ok.ok).toBe(true);
    expect(w.calls).toHaveLength(1);
  });
});
