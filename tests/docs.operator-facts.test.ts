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
import { loadBridgeConfig } from "../src/discord/config.ts";
import {
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
    for (const p of OPERATOR_DOCS) {
      expect({ p, hit: read(p).match(wrong)?.[0] ?? null }).toEqual({ p, hit: null });
    }
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
    const cli = read("src/cli.ts");
    const box = read("docs/BOX-UPDATE.md");
    for (const name of ["discord", "github", "github-watch", "fledge", "specsync", "plugins", "allowlist-file"]) {
      expect(cli).toContain(`name: "${name}"`);
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
