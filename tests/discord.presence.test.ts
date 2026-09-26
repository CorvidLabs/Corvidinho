/**
 * Discord presence version payload (DISCORD-12) — no live token.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PRESENCE_ACTIVITY_TYPE_CUSTOM,
  buildVersionPresenceActivity,
} from "../src/discord/presence.ts";
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
