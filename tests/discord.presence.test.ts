/**
 * Discord presence version payload (DISCORD-12) — no live token.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client, Events } from "discord.js";
import { createLiveGateway } from "../src/discord/gateway.ts";
import {
  setRequesterPermCheckerForTests,
  verifyRequesterCanSend,
} from "../src/discord/requester-perms.ts";
import {
  PRESENCE_ACTIVITY_TYPE_CUSTOM,
  buildVersionPresenceActivity,
  buildVersionPresenceData,
} from "../src/discord/presence.ts";
import type { BridgeConfig } from "../src/discord/types.ts";
import {
  VERSION,
  formatPresenceVersionString,
} from "../src/version.ts";

describe("formatPresenceVersionString", () => {
  test("prefixes v when missing", () => {
    expect(formatPresenceVersionString("0.0.4")).toBe("v0.0.4");
  });

  test("keeps existing v prefix", () => {
    expect(formatPresenceVersionString("v1.2.3")).toBe("v1.2.3");
  });

  test("empty falls back to 0.0.0 shape", () => {
    expect(formatPresenceVersionString("  ")).toBe("v0.0.0");
  });
});

describe("buildVersionPresenceActivity", () => {
  test("Custom type with short state from package VERSION", () => {
    const pkg = JSON.parse(
      readFileSync(join(import.meta.dir, "..", "package.json"), "utf8"),
    ) as { version: string };
    expect(VERSION).toBe(pkg.version);

    const activity = buildVersionPresenceActivity();
    expect(activity.type).toBe(PRESENCE_ACTIVITY_TYPE_CUSTOM);
    expect(activity.type).toBe(4);
    expect(activity.name).toBe("Custom Status");
    expect(activity.state).toBe(`v${pkg.version}`);
    expect(activity.state.length).toBeLessThanOrEqual(32);
  });

  test("honors explicit version override", () => {
    const activity = buildVersionPresenceActivity("9.9.9");
    expect(activity.state).toBe("v9.9.9");
    expect(activity.type).toBe(4);
  });
});

describe("buildVersionPresenceData", () => {
  test("online status with the version Custom Status as the only activity", () => {
    expect(buildVersionPresenceData("9.9.9")).toEqual({
      status: "online",
      activities: [{ name: "Custom Status", state: "v9.9.9", type: 4 }],
    });
    expect(buildVersionPresenceData().activities[0].state).toBe(`v${VERSION}`);
  });

  test("fresh object per call (discord.js mutates what it is given)", () => {
    const a = buildVersionPresenceData("1.2.3");
    const b = buildVersionPresenceData("1.2.3");
    expect(a).not.toBe(b);
    expect(a.activities).not.toBe(b.activities);
    expect(a.activities[0]).not.toBe(b.activities[0]);
  });
});

/**
 * DISCORD-12 on every IDENTIFY. `Client#login` copies `options.presence` into
 * `options.ws.presence`, which discord.js hands to @discordjs/ws as
 * `initialPresence`; @discordjs/ws sends it as `d.presence` on every IDENTIFY,
 * including a non-resumable re-identify after an invalid or expired session,
 * where ClientReady does not fire again. The real `login` runs here with only
 * the socket connect stubbed out: no token, no network.
 */
type WsPresence = {
  status: string;
  activities: { type: number; name: string; state?: string }[];
};

const fixtureConfig = {
  token: "fixture-token-not-real",
  channelIds: ["100"],
} as unknown as BridgeConfig;

async function startLiveGatewayOffline(
  version: string,
  onReady?: (id: string) => void,
) {
  const realLogin = Client.prototype.login;
  let client: Client | null = null;
  Client.prototype.login = async function (this: Client, token?: string) {
    client = this;
    (this.ws as unknown as { connect: () => Promise<void> }).connect =
      async () => {};
    return realLogin.call(this, token);
  };
  try {
    const gateway = await createLiveGateway(
      fixtureConfig,
      { onMessage: () => {}, onReady },
      { version },
    );
    await gateway.start();
    if (!client) throw new Error("login was not called");
    return { gateway, client: client as Client };
  } finally {
    Client.prototype.login = realLogin;
  }
}

describe("live gateway presence on IDENTIFY (DISCORD-12)", () => {
  test("the IDENTIFY presence built at login carries the version Custom Status", async () => {
    const { gateway, client } = await startLiveGatewayOffline("9.9.9");
    try {
      const identifyPresence = (
        client.options.ws as { presence?: WsPresence }
      ).presence;
      expect(identifyPresence?.status).toBe("online");
      expect(identifyPresence?.activities).toHaveLength(1);
      expect(identifyPresence?.activities[0]).toMatchObject({
        type: 4,
        name: "Custom Status",
        state: "v9.9.9",
      });
    } finally {
      await gateway.stop();
    }
  });

  test("ClientReady still sets the same version presence", async () => {
    const readyIds: string[] = [];
    const { gateway, client } = await startLiveGatewayOffline("9.9.9", (id) => {
      readyIds.push(id);
    });
    try {
      const sets: unknown[] = [];
      client.emit(Events.ClientReady, {
        user: {
          id: "42",
          tag: "corvidinho#0001",
          setPresence: (p: unknown) => {
            sets.push(p);
          },
        },
      } as never);
      expect(sets).toEqual([
        {
          status: "online",
          activities: [{ name: "Custom Status", state: "v9.9.9", type: 4 }],
        },
      ]);
      expect(readyIds).toEqual(["42"]);
      expect(gateway.botUserId).toBe("42");
    } finally {
      await gateway.stop();
    }
  });

  test("a failed setPresence on ready does not stop the ready path", async () => {
    const readyIds: string[] = [];
    const { gateway, client } = await startLiveGatewayOffline("9.9.9", (id) => {
      readyIds.push(id);
    });
    try {
      client.emit(Events.ClientReady, {
        user: {
          id: "43",
          tag: "corvidinho#0001",
          setPresence: () => {
            throw new Error("presence rejected");
          },
        },
      } as never);
      expect(readyIds).toEqual(["43"]);
    } finally {
      await gateway.stop();
    }
  });
});

/**
 * DISCORD-12 on the second gateway login. The DISCORD-8 requester check
 * (`discord-post-message --requesting-user-id`) opens its own short-lived
 * gateway session with the same bot token; its IDENTIFY must carry the version
 * too, not an empty activity list. Real `login`, socket connect stubbed to
 * fail after the IDENTIFY presence is built: no token, no network.
 */
describe("requester check presence on IDENTIFY (DISCORD-12)", () => {
  test("the requester check client identifies with the version Custom Status", async () => {
    setRequesterPermCheckerForTests(undefined);
    const realLogin = Client.prototype.login;
    let identifyPresence: WsPresence | undefined;
    let destroyed = false;
    Client.prototype.login = async function (this: Client, token?: string) {
      const ws = this.ws as unknown as { connect: () => Promise<void> };
      ws.connect = async () => {
        identifyPresence = (this.options.ws as { presence?: WsPresence })
          .presence;
        throw new Error("offline fixture: no gateway");
      };
      const realDestroy = this.destroy.bind(this);
      this.destroy = async () => {
        destroyed = true;
        return realDestroy();
      };
      return realLogin.call(this, token);
    };
    try {
      await expect(
        verifyRequesterCanSend("100", "200", {
          token: "fixture-token-not-real",
        }),
      ).rejects.toThrow("offline fixture: no gateway");
    } finally {
      Client.prototype.login = realLogin;
    }
    expect(destroyed).toBe(true);
    expect(identifyPresence?.status).toBe("online");
    expect(identifyPresence?.activities).toHaveLength(1);
    expect(identifyPresence?.activities[0]).toMatchObject({
      type: 4,
      name: "Custom Status",
      state: `v${VERSION}`,
    });
  });
});
