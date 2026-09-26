import { describe, expect, test } from "bun:test";
import { emptyConfig } from "../src/allowlist/types.ts";
import { routeMessage } from "../src/discord/message-router.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import { NOT_AUTHORIZED, type InboundMessage } from "../src/discord/types.ts";

function baseMsg(over: Partial<InboundMessage> = {}): InboundMessage {
  return {
    id: "m1",
    channelId: "chan-allowed",
    authorId: "user-1",
    authorBot: false,
    content: "hello <@bot>",
    mentionedBot: true,
    ...over,
  };
}

function allowCfg(channels: string[] = ["chan-allowed"]) {
  const cfg = emptyConfig();
  cfg.discord.channels = channels.map((c) => c.toLowerCase());
  return cfg;
}

describe("discord message-router (DISCORD-1/2/2.a/5)", () => {
  test("mention in allowlisted channel starts session stub", () => {
    const store = new SessionStore();
    const action = routeMessage(baseMsg(), {
      store,
      allowlist: allowCfg(),
    });
    expect(action.kind).toBe("start_session");
    if (action.kind === "start_session") {
      expect(action.session.id.startsWith("sess_")).toBe(true);
      expect(action.session.channelId).toBe("chan-allowed");
      expect(action.prompt).toContain("hello");
    }
  });

  test("non-allowlisted channel refuse on mention with short not-authorized", () => {
    const store = new SessionStore();
    const action = routeMessage(baseMsg({ channelId: "chan-other" }), {
      store,
      allowlist: allowCfg(),
    });
    expect(action.kind).toBe("refuse");
    if (action.kind === "refuse") {
      expect(action.reply).toBe(NOT_AUTHORIZED);
    }
    expect(store.bySessionId.size).toBe(0);
  });

  test("non-allowlisted channel without mention is quiet ignore", () => {
    const store = new SessionStore();
    const action = routeMessage(
      baseMsg({ channelId: "chan-other", mentionedBot: false, content: "noise" }),
      { store, allowlist: allowCfg() },
    );
    expect(action.kind).toBe("ignore");
  });

  test("reply to bot message continues same session id (DISCORD-2)", () => {
    const store = new SessionStore();
    const start = routeMessage(baseMsg({ id: "m-start" }), {
      store,
      allowlist: allowCfg(),
    });
    expect(start.kind).toBe("start_session");
    if (start.kind !== "start_session") return;
    store.trackBotMessage("bot-msg-1", start.session);

    const cont = routeMessage(
      baseMsg({
        id: "m-reply",
        mentionedBot: false,
        content: "follow up",
        referencedMessageId: "bot-msg-1",
      }),
      { store, allowlist: allowCfg() },
    );
    expect(cont.kind).toBe("continue_session");
    if (cont.kind === "continue_session") {
      expect(cont.session.id).toBe(start.session.id);
    }
  });

  test("thread continues same session (DISCORD-2.a)", () => {
    const store = new SessionStore();
    const start = routeMessage(
      baseMsg({ id: "m-t0", threadId: "thread-9", content: "@bot open thread" }),
      { store, allowlist: allowCfg() },
    );
    expect(start.kind).toBe("start_session");
    if (start.kind !== "start_session") return;
    expect(start.session.threadId).toBe("thread-9");

    const cont = routeMessage(
      baseMsg({
        id: "m-t1",
        threadId: "thread-9",
        mentionedBot: false,
        content: "more in thread",
      }),
      { store, allowlist: allowCfg() },
    );
    expect(cont.kind).toBe("continue_session");
    if (cont.kind === "continue_session") {
      expect(cont.session.id).toBe(start.session.id);
    }
  });

  test("empty channel allowlist denies mention", () => {
    const store = new SessionStore();
    const action = routeMessage(baseMsg(), {
      store,
      allowlist: allowCfg([]),
    });
    expect(action.kind).toBe("refuse");
  });
});
