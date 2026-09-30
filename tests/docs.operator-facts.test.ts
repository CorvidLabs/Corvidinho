/**
 * Operator docs and templates must say what the shipped code does (PROCESS-1:
 * no invented commands, env names or behavior). Each check reads the fact from
 * the code first, then asserts the doc states it, so a doc that drifts from
 * the code fails here instead of misleading an operator on the bot VM.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { HumanAsk } from "../src/agent/types.ts";
import { emptyConfig, type AllowlistConfig } from "../src/allowlist/types.ts";
import {
  COLLAPSED_PING_NEEDS,
  COLLAPSED_PING_QUESTION,
  formatAskReply,
} from "../src/discord/ask-ping.ts";
import { goLiveChecklist, loadBridgeConfig } from "../src/discord/config.ts";
import {
  gateActor,
  PermissionLevel,
  resolvePermissionLevel,
} from "../src/discord/permissions.ts";
import { SLASH_COMMAND_NAMES } from "../src/discord/slash-commands.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { list } from "../src/plugins/registry.ts";
import type { OwnerRecord } from "../src/identity/owner.ts";
import { SCHEMA_VERSION } from "../src/store/db.ts";
import { defaultSpawnLogPath } from "../src/watch/spawn-log.ts";

const ROOT = join(import.meta.dir, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** Text of a markdown section: from its heading line to the next heading of the same or higher level. */
function section(md: string, heading: string): string {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => l.startsWith("#") && l.includes(heading));
  if (start < 0) throw new Error(`heading not found: ${heading}`);
  const level = lines[start]!.match(/^#+/)![0].length;
  const end = lines.findIndex(
    (l, i) => i > start && /^#+ /.test(l) && l.match(/^#+/)![0].length <= level,
  );
  return lines.slice(start, end < 0 ? undefined : end).join("\n");
}

/** What `corvidinho --help` prints, as an operator sees it (spawned once). */
let helpCache: string | undefined;
function helpText(): string {
  if (helpCache !== undefined) return helpCache;
  const r = Bun.spawnSync([process.execPath, "src/cli.ts", "--help"], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(r.exitCode).toBe(0);
  helpCache = r.stdout.toString();
  return helpCache;
}

function allowlist(discord: Partial<AllowlistConfig["discord"]> = {}): AllowlistConfig {
  const cfg = emptyConfig();
  return { ...cfg, discord: { ...cfg.discord, channels: ["1"], ...discord } };
}

const OPERATOR_DOCS = [
  "AGENTS.md",
  "README.md",
  "STATUS.md",
  "docs/DISCORD-GO-LIVE.md",
  "docs/BOX-UPDATE.md",
  "docs/UPDATE.md",
  "docs/WATCH.md",
  "docs/discord.md",
  "docs/DAEMON.md",
  ".env.example",
  "allowlist.example.toml",
];

describe("docs/discord.md slash surface", () => {
  test("gate order names the actor gate (REQ-discord-201) between channel and mute/rate", () => {
    const dispatch = read("src/discord/slash-dispatch.ts");
    expect(dispatch).toContain("channel allowlist → actor gate (REQ-discord-201) → mute/rate");
    const line = read("docs/discord.md")
      .split("\n")
      .find((l) => l.startsWith("Gate order for every slash:"));
    expect(line).toBeDefined();
    expect(line!).toMatch(
      /channel allowlist → actor gate \(.*REQ-discord-201.*\) → mute\/rate → minPermission → handler/,
    );
  });

  test("every registered slash command is listed and the count matches", () => {
    const doc = read("docs/discord.md");
    const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
    const heading = doc.split("\n").find((l) => l.startsWith("## Slash commands"));
    expect(heading).toContain(`(${words[SLASH_COMMAND_NAMES.length]}:`);
    for (const name of SLASH_COMMAND_NAMES) {
      expect(doc).toContain(`\`/${name}`);
    }
    const box = read("docs/BOX-UPDATE.md").replace(/\s+/g, " ");
    expect(box).toContain(`${words[SLASH_COMMAND_NAMES.length]} commands`);
  });

  test("/status row lists the announce, owner, audit and spend lines /status prints", () => {
    const row = read("docs/discord.md")
      .split("\n")
      .find((l) => l.startsWith("| `/status`"));
    expect(row).toBeDefined();
    for (const bit of ["announce channel", "owner configured", "audit chain", "24 h spend"]) {
      expect(row!).toContain(bit);
    }
    // SAFE-14.a: the spend line is the owner's; anyone else sees only the pause.
    expect(row!).toContain("24 h spend vs cap for the owner only");
    expect(row!).toContain("Work is paused for budget.");
  });

  test("the criteria line cites the whole captured DISCORD-1..N range", () => {
    const nums = [...read("hi/discord.md").matchAll(/\*\*DISCORD-(\d+)\*\*/g)].map((m) => Number(m[1]));
    const max = Math.max(...nums);
    const line = read("docs/discord.md")
      .split("\n")
      .find((l) => l.startsWith("Acceptance criteria live in"));
    expect(line).toBeDefined();
    expect(line!).toContain(`DISCORD-1..${max},`);
  });
});

describe("ask pings follow AUTONOMY-4 (clarify → requester, stuck → owner)", () => {
  const owner: OwnerRecord = { discordId: "111111111111111111" };
  const requester = "222222222222222222";

  test("code: clarify mentions the requester, stuck mentions the owner", () => {
    const clarify = formatAskReply({
      ask: { reason: "clarify", question: "Which branch?" } satisfies HumanAsk,
      owner,
      requesterDiscordId: requester,
    });
    expect(clarify.mentionUserIds).toEqual([requester]);
    const stuck = formatAskReply({
      ask: { reason: "stuck", question: "Verify keeps failing" } satisfies HumanAsk,
      owner,
      requesterDiscordId: requester,
    });
    expect(stuck.mentionUserIds).toEqual(["111111111111111111"]);
  });

  test("docs/discord.md says clarify addresses the requester, not the owner", () => {
    const text = section(read("docs/discord.md"), "Questions and owner ping");
    expect(text).toContain("AUTONOMY-4");
    expect(text).toMatch(/mentions the \*\*requester\*\*/);
    expect(text).not.toContain("mentions the configured owner (");
    expect(text).not.toContain("allowed mentions to the owner plus");
  });

  test("docs/discord.md names the fresh ping post that follows a collapsed answer (REQ-discord-215)", () => {
    const text = section(read("docs/discord.md"), "Questions and owner ping");
    expect(text).toContain("REQ-discord-215");
    expect(text).toContain(`\`${COLLAPSED_PING_QUESTION}\``);
    expect(text).toContain(`\`${COLLAPSED_PING_NEEDS}\``);
  });

  test("docs/DISCORD-GO-LIVE.md does not claim the owner is the only user an ask can ping", () => {
    const doc = read("docs/DISCORD-GO-LIVE.md");
    expect(doc).not.toContain("the owner is the only user it can ping");
    expect(doc).toMatch(/clarify question \(AUTONOMY-1\/4\) pings the requester/);
  });
});

describe("Discord user/role allowlists and ADMIN", () => {
  test("code: both lists empty ⇒ STANDARD; a listed user narrows everyone else to BLOCKED", () => {
    expect(resolvePermissionLevel({ userId: "5", allowlist: allowlist() })).toBe(
      PermissionLevel.STANDARD,
    );
    expect(
      resolvePermissionLevel({ userId: "5", allowlist: allowlist({ users: ["6"] }) }),
    ).toBe(PermissionLevel.BLOCKED);
  });

  test("code: admin env lists grant nothing; no owner ⇒ nobody is ADMIN", () => {
    expect(
      resolvePermissionLevel({
        userId: "5",
        allowlist: allowlist(),
        adminUserIds: ["5"],
        owner: null,
      }),
    ).toBe(PermissionLevel.STANDARD);
  });

  test("no doc says empty user/role lists are deny-all", () => {
    const wrong =
      /empty = deny-all (when user\/role gates apply|when those gates apply|when checked|for those checks)/;
    // A line naming the Discord user/role allow env vars that says empty
    // refuses or denies (the old `--help` row: "... / _ROLES / _USERS   HEAR
    // allowlists; empty = refuse (deny-all)").
    const userRoleRow = /DISCORD_ALLOW_[A-Z_ /]*(_USERS|_ROLES)\b.*empty = (refuse|deny-all)/;
    // Besides the markdown and templates: the go-live checklist that `doctor`
    // and `discord bridge` print, and `corvidinho --help`.
    const surfaces: [string, string][] = [
      ...OPERATOR_DOCS.map((p): [string, string] => [p, read(p)]),
      ["goLiveChecklist()", goLiveChecklist()],
      ["--help", helpText()],
    ];
    for (const [p, text] of surfaces) {
      expect({ p, hit: text.match(wrong)?.[0] ?? null }).toEqual({ p, hit: null });
      const row = text.split("\n").find((l) => userRoleRow.test(l)) ?? null;
      expect({ p, row }).toEqual({ p, row: null });
    }
  });

  test("--help and the go-live checklist say what empty user/role lists do (REQ-discord-043)", () => {
    // Fact from the code (see the STANDARD / BLOCKED test above): both empty
    // admits any caller in an allowlisted channel; one listed user narrows it.
    const says =
      /both empty = anyone in an allowlisted channel; once either is set, only those users, role holders and the owner/i;
    for (const [p, text] of [
      ["goLiveChecklist()", goLiveChecklist()],
      ["--help", helpText()],
    ] as const) {
      const flat = text.replace(/\s+/g, " ");
      expect({ p, says: says.test(flat) }).toEqual({ p, says: true });
    }
    expect(helpText().replace(/\s+/g, " ")).toMatch(
      /CORVIDINHO_DISCORD_ALLOW_CHANNELS HEAR channel allowlist; empty = refuse start/,
    );
  });

  test("docs/DAEMON.md allowlist row says what empty user/role lists do for schedules (REQ-discord-020)", () => {
    // Code: the schedule tick's creator gate (gateActor, no member roles).
    // Both empty ⇒ any creator passes; a listed user or a listed role narrows
    // it, and a tick knows no roles, so a role-only creator is refused.
    expect(gateActor({ userId: "5", allowlist: allowlist() }).ok).toBe(true);
    expect(gateActor({ userId: "5", allowlist: allowlist({ users: ["6"] }) }).ok).toBe(false);
    expect(gateActor({ userId: "5", allowlist: allowlist({ roles: ["7"] }) }).ok).toBe(false);
    const row = section(read("docs/DAEMON.md"), "Configuration")
      .split("\n")
      .find((l) => l.startsWith("| `CORVIDINHO_ALLOWLIST_FILE`"));
    expect(row).toBeDefined();
    expect(row!).not.toMatch(/empty means deny-all/i);
    expect(row!).toContain("An empty channel list refuses every schedule that has a channel");
    expect(row!).toContain(
      "Users and roles both empty leave only the channel gate and the deny lists, so any creator's schedule runs",
    );
  });

  test("no doc keys ADMIN on admin lists instead of the owner", () => {
    for (const p of OPERATOR_DOCS) {
      const text = read(p);
      expect({ p, hit: text.includes("empty admin = deny-all") }).toEqual({ p, hit: false });
      expect({ p, hit: text.includes("admin env lists unchanged") }).toEqual({ p, hit: false });
    }
  });

  test(".env.example rate-limit-by-level example only uses levels a caller can hold", () => {
    const line = read(".env.example")
      .split("\n")
      .find((l) => l.includes("DISCORD_RATE_LIMIT_BY_LEVEL="));
    expect(line).toBeDefined();
    const json = line!.match(/DISCORD_RATE_LIMIT_BY_LEVEL='(\{[^']*\})'/)?.[1];
    expect(json).toBeDefined();
    const keys = Object.keys(JSON.parse(json!)).map(Number);
    const reachable: number[] = [PermissionLevel.STANDARD, PermissionLevel.ADMIN];
    for (const k of keys) expect(reachable).toContain(k);
  });
});

describe("docs/DAEMON.md log events", () => {
  const src = read("src/daemon/daemon.ts");
  const table = section(read("docs/DAEMON.md"), "Logs")
    .split("\n")
    .filter((l) => l.startsWith("| `"));
  const rowOf = (event: string) =>
    table.find((l) => [...l.split("|")[1]!.matchAll(/`([a-z_.]+)`/g)].some((m) => m[1] === event));

  test("the Logs table has a row for every event the daemon logs", () => {
    // Every dotted event literal with a known prefix (catches the lock
    // ternary), plus whatever is passed as the event to log(level, "…") or
    // fail("…"), so an event with a new prefix is not missed.
    const events = [
      ...new Set(
        [
          ...src.matchAll(/"((?:daemon|tick|run|spend)\.[a-z_]+)"/g),
          ...src.matchAll(/\blog\(\s*[^,]+,\s*"([a-z_.]+)"/g),
          ...src.matchAll(/\bfail\(\s*"([a-z_.]+)"/g),
        ].map((m) => m[1]!),
      ),
    ];
    expect(events).toContain("tick");
    expect(events).toContain("daemon.protocol_mismatch");
    expect(events).toContain("daemon.start_failed");
    expect(events).toContain("spend.warning");
    const missing = events.filter((e) => !rowOf(e));
    expect(missing).toEqual([]);
  });

  test("daemon.start_failed: start refused, exit 1, the reason in `message`", () => {
    // Code: the start-setup catch goes through fail(), which logs `message`
    // and returns exit code 1.
    expect(src).toContain('return fail("daemon.start_failed", errorText(err));');
    expect(src).toMatch(/log\("error", event, \{ message \}\);[\s\S]*?exitCode: 1/);
    const row = rowOf("daemon.start_failed");
    expect(row).toBeDefined();
    expect(row!).toContain("Start refused (exit 1)");
    expect(row!).toContain("`message` gives the reason");
  });

  test("spend.warning: warn line with amounts and percent", () => {
    const row = rowOf("spend.warning");
    expect(row).toBeDefined();
    expect(row!).toContain("(warn)");
    for (const f of ["spentMicroUsd", "capMicroUsd", "percent"]) {
      expect(src).toContain(`${f}: e.spendWarning.${f}`);
      expect(row!).toContain(`\`${f}\``);
    }
  });
});

describe("Discord dry-run still needs a token", () => {
  test("code: dry-run with channels but no token refuses start", async () => {
    const r = await loadBridgeConfig({
      env: { CORVIDINHO_DISCORD_DRY_RUN: "1", DISCORD_CHANNEL_IDS: "111" },
      filePath: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_token");
  });

  test("every doc line that sets CORVIDINHO_DISCORD_DRY_RUN=1 mentions DISCORD_TOKEN", () => {
    for (const p of ["STATUS.md", "docs/DISCORD-GO-LIVE.md", ".env.example"]) {
      const lines = read(p).split("\n");
      lines.forEach((l, i) => {
        if (!l.includes("CORVIDINHO_DISCORD_DRY_RUN=1")) return;
        const near = `${lines[i - 1] ?? ""}\n${l}`;
        expect({ p, line: i + 1, ok: near.includes("DISCORD_TOKEN") }).toEqual({
          p,
          line: i + 1,
          ok: true,
        });
      });
    }
  });
});

describe("store, WATCH and doctor facts", () => {
  test("docs/BOX-UPDATE.md names the current schema version", () => {
    const hits = [...read("docs/BOX-UPDATE.md").matchAll(/schema v(\d+)/g)].map((m) => Number(m[1]));
    expect(hits.length).toBeGreaterThan(0);
    for (const v of hits) expect(v).toBe(SCHEMA_VERSION);
  });

  test("WATCH spawn log defaults to <data dir>/watch-spawn.jsonl", () => {
    expect(defaultSpawnLogPath({ env: { CORVIDINHO_DATA_DIR: "/srv/cdata" } })).toBe(
      "/srv/cdata/watch-spawn.jsonl",
    );
    const wrong = /(default|or) `~\/\.local\/share\/corvidinho\/watch-spawn\.jsonl`/;
    for (const p of ["docs/WATCH.md", "CHANGELOG.md", "docs/DISCORD-GO-LIVE.md"]) {
      expect({ p, hit: read(p).match(wrong)?.[0] ?? null }).toEqual({ p, hit: null });
    }
    expect(read("docs/WATCH.md")).toContain("`<data dir>/watch-spawn.jsonl`");
  });

  test("docs/BOX-UPDATE.md lists every doctor check that can fail an update", () => {
    // Doctor checks live in src/cli.ts and src/doctor.ts (#225).
    const src = `${read("src/cli.ts")}\n${read("src/doctor.ts")}`;
    const box = read("docs/BOX-UPDATE.md");
    for (const name of [
      "discord",
      "github",
      "github-watch",
      "fledge",
      "specsync",
      "fledge.toml",
      "verify-lane",
      ".specsync",
      "specs",
      "plugins",
      "allowlist-file",
      "data-dir",
    ]) {
      expect(
        src.includes(`name: "${name}"`) ||
          src.includes(`const name = "${name}"`) ||
          src.includes(`toolOnPathCheck("${name}")`),
      ).toBe(true);
      expect(box).toContain(`\`${name}\``);
    }
  });

  test("docs/DISCORD-GO-LIVE.md names every mutating tool that needs no allowlist entry", () => {
    loadBuiltins();
    const names = list()
      .filter((e) => e.mutating && !e.dangerous)
      .map((e) => e.name);
    expect(names).toContain("council");
    const para = read("docs/DISCORD-GO-LIVE.md")
      .split("\n\n")
      .find((b) => b.startsWith("Not dangerous, but mutating"));
    expect(para).toBeDefined();
    for (const n of names) expect(para!).toContain(`\`${n}\``);
  });
});

describe("Developer Portal intents", () => {
  test("DISCORD-GO-LIVE.md says when Server Members Intent is needed if any code requests GuildMembers", () => {
    const src = ["src", "plugins"]
      .flatMap((d) =>
        readdirSync(join(ROOT, d), { recursive: true, withFileTypes: true })
          .filter((e) => e.isFile() && e.name.endsWith(".ts"))
          .map((e) => readFileSync(join(e.parentPath, e.name), "utf8")),
      )
      .join("\n");
    const doc = read("docs/DISCORD-GO-LIVE.md");
    if (src.includes("GatewayIntentBits.GuildMembers")) {
      expect(doc).not.toMatch(/Server Members Intent is not used/);
      expect(doc).toMatch(/Server Members Intent\*\* only if you use the DISCORD-8 requester check/);
      expect(doc).toContain("--requesting-user-id");
    }
  });
});

describe("templates name what the loaders read", () => {
  const loaders = [
    "src/allowlist/load.ts",
    "src/discord/config.ts",
    "src/watch/config.ts",
    "src/watch/spawn-log.ts",
  ];
  const readByCode = [
    ...new Set(
      loaders.flatMap((f) =>
        [...read(f).matchAll(/env\.([A-Z][A-Z0-9_]+)/g)].map((m) => m[1]!),
      ),
    ),
  ];

  test(".env.example names every env var the allowlist, Discord and WATCH loaders read", () => {
    expect(readByCode).toContain("CORVIDINHO_WATCH_MAX_TRIGGERS");
    const env = read(".env.example");
    const missing = readByCode.filter((n) => !new RegExp(`\\b${n}\\b`).test(env));
    expect(missing).toEqual([]);
  });

  test("every env name in .env.example exists in the code", () => {
    const code = ["src", "plugins", "scripts"]
      .flatMap((d) =>
        readdirSync(join(ROOT, d), { recursive: true, withFileTypes: true })
          .filter((e) => e.isFile() && /\.(ts|sh)$/.test(e.name))
          .map((e) => readFileSync(join(e.parentPath, e.name), "utf8")),
      )
      .join("\n");
    const named = [
      ...new Set(
        [...read(".env.example").matchAll(/^#\s*([A-Z][A-Z0-9_]{3,})=/gm)].map((m) => m[1]!),
      ),
    ];
    expect(named.length).toBeGreaterThan(20);
    const invented = named.filter((n) => !code.includes(n));
    expect(invented).toEqual([]);
  });
});

describe("STATUS.md and AGENTS.md track what shipped", () => {
  test("STATUS.md has no '(this PR)' placeholders and no blank line inside a table", () => {
    const status = read("STATUS.md");
    expect(status.match(/\bthis PR\b/gi) ?? []).toEqual([]);
    const lines = status.split("\n");
    lines.forEach((l, i) => {
      if (l.trim() !== "") return;
      const before = lines[i - 1] ?? "";
      const after = lines[i + 1] ?? "";
      const splitsTable = before.startsWith("|") && after.startsWith("|");
      expect({ line: i + 1, splitsTable }).toEqual({ line: i + 1, splitsTable: false });
    });
  });

  test("AGENTS.md and STATUS.md name every hi/ file and compound criterion family", () => {
    const hiFiles = readdirSync(join(ROOT, "hi")).filter(
      (f) => f.endsWith(".md") && f !== "AGENTS.md" && f !== "CLAUDE.md",
    );
    const hiText = hiFiles.map((f) => read(`hi/${f}`)).join("\n");
    const compound = [
      ...new Set([...hiText.matchAll(/\*\*([A-Z]+-[A-Z]+)-\d+/g)].map((m) => m[1]!)),
    ];
    expect(compound).toContain("DISCORD-ASK");
    const agentsLine = read("AGENTS.md")
      .split("\n")
      .find((l) => l.startsWith("Before product decisions"));
    expect(agentsLine).toBeDefined();
    const listed = (agentsLine!.match(/`hi\/\*\.md` \(([^)]*)\)/)?.[1] ?? "").split(/,\s*/);
    for (const f of hiFiles) expect(listed).toContain(f.replace(/\.md$/, ""));
    const statusHi = read("STATUS.md")
      .split("\n")
      .find((l) => l.startsWith("| HI |"));
    expect(statusHi).toBeDefined();
    for (const c of compound) {
      expect({ c, agents: agentsLine!.includes(c), status: statusHi!.includes(c) }).toEqual({
        c,
        agents: true,
        status: true,
      });
    }
  });
});
