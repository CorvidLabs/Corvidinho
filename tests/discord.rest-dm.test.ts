/**
 * AUTONOMOUS-7.a (REQ-discord-707): the owner DM `corvidinho daemon` sends
 * with no gateway — a direct message over Discord's REST API with the bot
 * token (src/discord/rest-dm.ts) — and the note that closes it
 * (src/discord/schedule-ask.ts). A fake REST client only; no network.
 */
import { describe, expect, test } from "bun:test";
import {
  channelMessagesRoute,
  createRestSendDm,
  DM_CHANNEL_ROUTE,
  type DiscordRestClient,
} from "../src/discord/rest-dm.ts";
import { DISCORD_DM_MAX } from "../src/discord/rich-reply.ts";
import { formatScheduleAskDaemonNote } from "../src/discord/schedule-ask.ts";

const USER = "111122223333444455";
const DM = "900000000000000001";

type Call = { route: string; body: Record<string, unknown> };

function fake(opts: { channel?: unknown; message?: unknown; throwAt?: number; error?: unknown } = {}) {
  const calls: Call[] = [];
  const rest: DiscordRestClient = {
    async post(route, { body }) {
      calls.push({ route, body: body as Record<string, unknown> });
      if (opts.throwAt === calls.length) throw opts.error ?? new Error("boom");
      if (route === DM_CHANNEL_ROUTE) return "channel" in opts ? opts.channel : { id: DM, type: 1 };
      return "message" in opts ? opts.message : { id: "800000000000000001", channel_id: DM };
    },
  };
  return { rest, calls };
}

describe("createRestSendDm — a DM over Discord's REST API, no gateway (REQ-discord-707)", () => {
  test("opens the DM channel, then posts the message parsing no mentions; resolves both ids", async () => {
    const { rest, calls } = fake();
    const send = createRestSendDm({ token: "unused", rest });
    const out = await send({ userId: ` ${USER} `, content: "Question for you, @everyone and <@1234>" });
    expect(out).toEqual({ channelId: DM, messageId: "800000000000000001" });
    expect(calls).toEqual([
      { route: "/users/@me/channels", body: { recipient_id: USER } },
      {
        route: `/channels/${DM}/messages`,
        body: { content: "Question for you, @​everyone and <@1234>", allowed_mentions: { parse: [] } },
      },
    ]);
    expect(channelMessagesRoute(DM)).toBe(`/channels/${DM}/messages`);
  });

  test("content over the DM cap is refused, not cut: nothing is sent and the reason is reported", async () => {
    const { rest, calls } = fake();
    const errors: string[] = [];
    const send = createRestSendDm({ token: "unused", rest, onError: (r) => errors.push(r) });
    expect(await send({ userId: USER, content: "x".repeat(DISCORD_DM_MAX + 1) })).toBeNull();
    expect(calls).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(await send({ userId: USER, content: "x".repeat(DISCORD_DM_MAX) })).not.toBeNull();
  });

  test("a user id that is not a Discord id, or a response without an id, is a DM that did not go out", async () => {
    const errors: string[] = [];
    const a = fake();
    expect(await createRestSendDm({ token: "t", rest: a.rest, onError: (r) => errors.push(r) })({ userId: "../guilds/1", content: "hi" })).toBeNull();
    expect(a.calls).toEqual([]);
    const b = fake({ channel: { id: "../../webhooks" } });
    expect(await createRestSendDm({ token: "t", rest: b.rest, onError: (r) => errors.push(r) })({ userId: USER, content: "hi" })).toBeNull();
    expect(b.calls).toHaveLength(1);
    const c = fake({ message: null });
    expect(await createRestSendDm({ token: "t", rest: c.rest, onError: (r) => errors.push(r) })({ userId: USER, content: "hi" })).toBeNull();
    expect(errors).toHaveLength(3);
  });

  test("a REST error resolves null (never throws) and reports one scrubbed line (SAFE-6)", async () => {
    const secret = "ghp_" + "a1B2c3D4e5F6g7H8i9J0".repeat(2).slice(0, 36);
    const { rest } = fake({ throwAt: 2, error: new Error(`50007 Cannot send messages to this user (${secret})`) });
    const errors: string[] = [];
    const send = createRestSendDm({ token: "unused", rest, onError: (r) => errors.push(r) });
    expect(await send({ userId: USER, content: "hi" })).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Cannot send messages to this user");
    expect(errors[0]).not.toContain(secret);
    // A reporter that throws never makes the DM throw.
    const loud = createRestSendDm({
      token: "unused",
      rest,
      onError: () => {
        throw new Error("logger down");
      },
    });
    expect(await loud({ userId: USER, content: "x".repeat(DISCORD_DM_MAX + 1) })).toBeNull();
  });
});

describe("formatScheduleAskDaemonNote (AUTONOMOUS-7.a)", () => {
  test("names where the controls come (the schedule's channel, or this DM) and that its runs wait", () => {
    expect(formatScheduleAskDaemonNote({ channelId: "333344445555666677" })).toBe(
      "📭 Sent by `corvidinho daemon`: no Discord bridge is running, so this can't be answered yet. " +
        "Once `corvidinho discord bridge` runs, the schedule's wait note brings its controls in <#333344445555666677> " +
        "when its next run comes due. Until it is answered or cancelled, its next runs wait.",
    );
    expect(formatScheduleAskDaemonNote({})).toContain("brings its controls here when its next run comes due.");
  });
});
