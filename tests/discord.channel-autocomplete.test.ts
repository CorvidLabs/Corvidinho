/**
 * STRING + autocomplete channel matching (ADMIN-2 / DISCORD-ANNOUNCE-2).
 * Pure unit tests — no live Discord.
 */
import { describe, expect, test } from "bun:test";
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
