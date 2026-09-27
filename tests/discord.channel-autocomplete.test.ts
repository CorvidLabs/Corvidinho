/**
 * STRING + autocomplete channel matching (ADMIN-2 / DISCORD-ANNOUNCE-2) and
 * its ADMIN gate (DISCORD-DENY-3 / ADMIN-4 / REQ-discord-431).
 * Fixture tests — no live Discord.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { createEchoAgentClient } from "../src/discord/agent-client.ts";
import { startBridge } from "../src/discord/bridge.ts";
import {
  createNullGateway,
  respondChannelAutocomplete,
  type AutocompleteActor,
  type GatewayHandlers,
} from "../src/discord/gateway.ts";
import {
  AUTOCOMPLETE_MAX_CHOICES,
  buildChannelAutocompleteChoices,
  extractChannelSnowflake,
  matchChannels,
  rankChannelMatch,
  resolveChannelOption,
  type ChannelCandidate,
} from "../src/discord/channel-autocomplete.ts";
import {
  buildSlashCommandBodies,
  OPT_STRING,
} from "../src/discord/slash-commands.ts";

const ch = (
  id: string,
  name: string,
  type = 0,
): ChannelCandidate => ({ id, name, type });

const GUILD: ChannelCandidate[] = [
  ch("100000000000000001", "general"),
  ch("100000000000000002", "dev-ops"),
  ch("100000000000000003", "🐦-corvid-lab"),
  ch("100000000000000004", "Announcements"),
  ch("100000000000000005", "dev"),
  ch("100000000000000006", "voice-lobby", 2), // not text
];

describe("extractChannelSnowflake", () => {
  test("raw digits and <#id> mention", () => {
    expect(extractChannelSnowflake("100000000000000001")).toBe("100000000000000001");
    expect(extractChannelSnowflake("<#100000000000000002>")).toBe("100000000000000002");
    expect(extractChannelSnowflake("  <#100000000000000003>  ")).toBe("100000000000000003");
    expect(extractChannelSnowflake("general")).toBeNull();
    expect(extractChannelSnowflake("#dev")).toBeNull();
  });
});

describe("rankChannelMatch", () => {
  test("exact / prefix / substring / id; empty query lists all", () => {
    expect(rankChannelMatch(GUILD[0]!, "")).toBe("substring");
    expect(rankChannelMatch(GUILD[0]!, "general")).toBe("exact");
    expect(rankChannelMatch(GUILD[0]!, "#general")).toBe("exact");
    expect(rankChannelMatch(GUILD[1]!, "dev")).toBe("prefix"); // "dev-ops" prefix
    expect(rankChannelMatch(GUILD[4]!, "dev")).toBe("exact");
    expect(rankChannelMatch(GUILD[1]!, "ops")).toBe("substring");
    expect(rankChannelMatch(GUILD[2]!, "corvid")).toBe("substring");
    expect(rankChannelMatch(GUILD[2]!, "🐦")).toBe("prefix");
    expect(rankChannelMatch(GUILD[0]!, "100000000000000001")).toBe("exact");
    expect(rankChannelMatch(GUILD[0]!, "zzz")).toBeNull();
  });
});

describe("matchChannels + buildChannelAutocompleteChoices", () => {
  test("case-insensitive substring incl. emoji names; text-only", () => {
    const hits = matchChannels(GUILD, "CORVID");
    expect(hits.map((h) => h.id)).toEqual(["100000000000000003"]);
    expect(hits[0]!.name).toContain("🐦");
    // voice channel excluded when textOnly
    expect(matchChannels(GUILD, "voice").map((h) => h.id)).toEqual([]);
  });

  test("prioritize exact then prefix over substring; cap 25", () => {
    const many: ChannelCandidate[] = [];
    for (let i = 0; i < 40; i++) {
      many.push(ch(String(2000 + i).padStart(18, "1"), `chan-${i}-dev`));
    }
    many.push(ch("300000000000000001", "dev"));
    many.push(ch("300000000000000002", "dev-tools"));
    many.push(ch("300000000000000003", "my-dev-room"));

    const ranked = matchChannels(many, "dev");
    expect(ranked.length).toBe(AUTOCOMPLETE_MAX_CHOICES);
    expect(ranked[0]!.name).toBe("dev");
    expect(ranked[0]!.rank).toBe("exact");
    expect(ranked[1]!.name).toBe("dev-tools");
    expect(ranked[1]!.rank).toBe("prefix");
    // substring "*-dev*" / "*-dev-*" come after prefixes
    expect(ranked.some((r) => r.rank === "substring")).toBe(true);
  });

  test("snowflake query matches id even when name differs", () => {
    const hits = matchChannels(GUILD, "100000000000000003");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.id).toBe("100000000000000003");
  });

  test("remove scope: idAllowlist filters candidates", () => {
    const allow = new Set(["100000000000000001", "100000000000000003"]);
    const hits = matchChannels(GUILD, "", { idAllowlist: allow });
    expect(hits.map((h) => h.id).sort()).toEqual([
      "100000000000000001",
      "100000000000000003",
    ]);
    const choices = buildChannelAutocompleteChoices(GUILD, "corvid", {
      idAllowlist: allow,
    });
    expect(choices).toHaveLength(1);
    expect(choices[0]!.value).toBe("100000000000000003");
    expect(choices[0]!.name).toContain("🐦");
  });

  test("choice value is snowflake; name includes #label", () => {
    const choices = buildChannelAutocompleteChoices(GUILD, "general");
    expect(choices[0]).toEqual({
      name: "#general (100000000000000001)",
      value: "100000000000000001",
    });
  });
});

describe("resolveChannelOption", () => {
  test("accepts snowflake and <#id>; rejects bare names without candidates", () => {
    expect(resolveChannelOption("100000000000000001")).toEqual({
      ok: true,
      id: "100000000000000001",
    });
    expect(resolveChannelOption("<#100000000000000002>")).toEqual({
      ok: true,
      id: "100000000000000002",
    });
    expect(resolveChannelOption("general").ok).toBe(false);
    expect(resolveChannelOption("general", GUILD)).toEqual({
      ok: true,
      id: "100000000000000001",
    });
  });
});

describe("slash bodies: STRING + autocomplete", () => {
  test("/admin channels add|remove and /announce channel use STRING autocomplete", () => {
    const bodies = buildSlashCommandBodies();
    const admin = bodies.find((b) => b.name === "admin");
    const channels = admin?.options?.find((g) => g.name === "channels");
    const add = channels?.options?.find((o) => o.name === "add")?.options?.[0];
    const remove = channels?.options?.find((o) => o.name === "remove")?.options?.[0];
    expect(add).toMatchObject({
      type: OPT_STRING,
      name: "channel",
      required: true,
      autocomplete: true,
    });
    expect(remove).toMatchObject({
      type: OPT_STRING,
      name: "channel",
      required: true,
      autocomplete: true,
    });
    expect(add).not.toHaveProperty("channel_types");

    const announce = bodies.find((b) => b.name === "announce");
    const chOpt = announce?.options?.find((o) => o.name === "channel")?.options?.find(
      (o) => o.name === "channel",
    );
    expect(chOpt).toMatchObject({
      type: OPT_STRING,
      autocomplete: true,
    });
  });
});

/**
 * DISCORD-DENY-3 / ADMIN-4 / REQ-discord-431 — Discord shows channel
 * autocomplete to every guild member, so the gateway re-checks each request:
 * no choices unless the invoker is ADMIN (the owner) in an allowlisted channel.
 * Fixture interactions + a dry-run bridge; no live Discord token or network.
 */
describe("channel autocomplete gate (DISCORD-DENY-3 / ADMIN-4)", () => {
  const OWNER_ID = "200000000000000001";
  const OTHER_ID = "200000000000000002";
  const ALLOWED = "100000000000000001"; // #general, the only allowlisted channel
  const OUTSIDE = "100000000000000002"; // #dev-ops, a guild channel not allowlisted
  const TEXT = { GuildText: 0 };
  // The guild channel cache the gateway reads (discord.js `guild.channels.cache`).
  const CACHE = GUILD.map((c) => ({ id: c.id, name: c.name, type: c.type ?? 0 }));

  type Call = {
    commandName: "admin" | "announce";
    group?: string;
    sub: string;
    userId: string;
    channelId?: string;
    roleIds?: string[];
    query?: string;
  };

  const ADD: Omit<Call, "userId"> = { commandName: "admin", group: "channels", sub: "add" };
  const REMOVE: Omit<Call, "userId"> = { commandName: "admin", group: "channels", sub: "remove" };
  const ANNOUNCE: Omit<Call, "userId"> = { commandName: "announce", sub: "channel" };

  async function autocomplete(handlers: GatewayHandlers, call: Call): Promise<string[]> {
    const responses: { name: string; value: string }[][] = [];
    await respondChannelAutocomplete(
      {
        commandName: call.commandName,
        createdTimestamp: Date.now(),
        channelId: call.channelId ?? ALLOWED,
        user: { id: call.userId },
        member: { roles: call.roleIds ?? [] },
        guild: { channels: { cache: { values: () => CACHE.values() } } },
        options: {
          getFocused: () => ({ name: "channel", value: call.query ?? "" }),
          getSubcommand: () => call.sub,
          getSubcommandGroup: () => call.group ?? null,
        },
        respond: async (choices) => {
          responses.push(choices);
        },
      },
      handlers,
      TEXT,
    );
    // Exactly one answer per request (Discord's 3s rule), refused or not.
    expect(responses).toHaveLength(1);
    return responses[0]!.map((c) => c.value);
  }

  async function withBridge(
    env: Record<string, string>,
    body: (h: GatewayHandlers, mute: (id: string) => void) => Promise<void>,
  ): Promise<void> {
    const box: { handlers: GatewayHandlers | null } = { handlers: null };
    const result = await startBridge({
      env: {
        DISCORD_BOT_TOKEN: "fake",
        DISCORD_CHANNEL_IDS: ALLOWED,
        CORVIDINHO_DISCORD_DRY_RUN: "1",
        CORVIDINHO_ALLOWLIST_FILE: join(
          mkdtempSync(join(tmpdir(), "corvidinho-ac-gate-")),
          "missing.toml",
        ),
        ...env,
      },
      projectRoot: mkdtempSync(join(tmpdir(), "corvidinho-ac-gate-proj-")),
      skipProtocolCheck: true,
      disableScheduler: true,
      thinkingDebounceMs: 0,
      thinkingTickMs: 60_000,
      agent: createEchoAgentClient({ delayMs: 0 }),
      gatewayFactory: async (_cfg, handlers) => {
        box.handlers = handlers;
        return createNullGateway();
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok || !box.handlers) return;
    try {
      await body(box.handlers, result.muteUser);
    } finally {
      await result.stop();
    }
  }

  const WITH_OWNER = { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID };
  const ALL_TEXT = GUILD.filter((c) => c.type === 0).map((c) => c.id).sort();

  test("owner in an allowlisted channel keeps today's choices", async () => {
    await withBridge(WITH_OWNER, async (h) => {
      expect((await autocomplete(h, { ...ADD, userId: OWNER_ID })).sort()).toEqual(ALL_TEXT);
      expect((await autocomplete(h, { ...ANNOUNCE, userId: OWNER_ID })).sort()).toEqual(
        ALL_TEXT,
      );
      // remove stays scoped to the live allowlist.
      expect(await autocomplete(h, { ...REMOVE, userId: OWNER_ID })).toEqual([ALLOWED]);
      expect(await autocomplete(h, { ...ADD, userId: OWNER_ID, query: "corvid" })).toEqual([
        "100000000000000003",
      ]);
    });
  });

  test("a non-owner in an allowlisted channel gets no choices (no allowlist leak)", async () => {
    await withBridge(WITH_OWNER, async (h) => {
      for (const call of [ADD, REMOVE, ANNOUNCE]) {
        expect(await autocomplete(h, { ...call, userId: OTHER_ID })).toEqual([]);
        expect(await autocomplete(h, { ...call, userId: OTHER_ID, query: "gen" })).toEqual([]);
      }
    });
  });

  test("a non-owner on the user allowlist is still not ADMIN", async () => {
    await withBridge(
      { ...WITH_OWNER, CORVIDINHO_DISCORD_ALLOW_USERS: OTHER_ID },
      async (h) => {
        for (const call of [ADD, REMOVE, ANNOUNCE]) {
          expect(await autocomplete(h, { ...call, userId: OTHER_ID })).toEqual([]);
        }
      },
    );
  });

  test("the owner outside an allowlisted channel gets no choices", async () => {
    await withBridge(WITH_OWNER, async (h) => {
      for (const call of [ADD, REMOVE, ANNOUNCE]) {
        expect(await autocomplete(h, { ...call, userId: OWNER_ID, channelId: OUTSIDE })).toEqual(
          [],
        );
      }
    });
  });

  test("a muted owner or an owner holding a deny-listed role gets no choices", async () => {
    await withBridge({ ...WITH_OWNER, CORVIDINHO_DISCORD_DENY_ROLES: "banned" }, async (h, mute) => {
      expect(
        await autocomplete(h, { ...ADD, userId: OWNER_ID, roleIds: ["banned"] }),
      ).toEqual([]);
      expect(await autocomplete(h, { ...REMOVE, userId: OWNER_ID })).toEqual([ALLOWED]);
      mute(OWNER_ID);
      for (const call of [ADD, REMOVE, ANNOUNCE]) {
        expect(await autocomplete(h, { ...call, userId: OWNER_ID })).toEqual([]);
      }
    });
  });

  test("no owner configured: nobody gets choices (IDENTITY-3 / ADMIN-4)", async () => {
    await withBridge({}, async (h) => {
      for (const call of [ADD, REMOVE, ANNOUNCE]) {
        expect(await autocomplete(h, { ...call, userId: OWNER_ID })).toEqual([]);
        expect(await autocomplete(h, { ...call, userId: OTHER_ID })).toEqual([]);
      }
    });
  });

  test("the gateway fails closed: no gate wired, a false gate or a throwing gate", async () => {
    const seen: AutocompleteActor[] = [];
    const base = { onMessage: () => {}, getAllowlistedChannelIds: () => [ALLOWED] };
    expect(await autocomplete(base, { ...ADD, userId: OWNER_ID })).toEqual([]);
    expect(
      await autocomplete(
        {
          ...base,
          mayAutocompleteChannels: (a) => {
            seen.push(a);
            return false;
          },
        },
        { ...ANNOUNCE, userId: OTHER_ID, roleIds: ["crew"] },
      ),
    ).toEqual([]);
    expect(seen).toEqual([
      { commandName: "announce", channelId: ALLOWED, userId: OTHER_ID, roleIds: ["crew"] },
    ]);
    const original = console.error;
    console.error = () => {};
    try {
      expect(
        await autocomplete(
          {
            ...base,
            mayAutocompleteChannels: () => {
              throw new Error("boom");
            },
          },
          { ...ADD, userId: OWNER_ID },
        ),
      ).toEqual([]);
    } finally {
      console.error = original;
    }
    expect(
      (
        await autocomplete(
          { ...base, mayAutocompleteChannels: () => true },
          { ...ADD, userId: OWNER_ID },
        )
      ).sort(),
    ).toEqual(ALL_TEXT);
  });
});
