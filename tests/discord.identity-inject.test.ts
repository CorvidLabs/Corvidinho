/**
 * IDENTITY-4 — Discord acting-user identity inject.
 */
import { describe, expect, test } from "bun:test";
import {
  IDENTITY_INJECT_HEADER,
  enrichPromptWithIdentity,
  formatIdentityInjectBlock,
  resolveActingDisplayLabel,
} from "../src/discord/identity-inject.ts";
import type { OwnerRecord } from "../src/identity/owner.ts";

const LEIF_ID = "181969874455756800";
const owner: OwnerRecord = {
  discordId: LEIF_ID,
  display: "Leif",
  githubLogin: "0xLeif",
};

describe("resolveActingDisplayLabel", () => {
  test("owner map display wins over Discord names", () => {
    expect(
      resolveActingDisplayLabel({
        userId: LEIF_ID,
        displayName: "KynSomething",
        username: "kyn",
        owner,
      }),
    ).toBe("Leif");
  });

  test("non-owner uses Discord displayName then username", () => {
    expect(
      resolveActingDisplayLabel({
        userId: "999",
        displayName: "Ada",
        username: "ada",
        owner,
      }),
    ).toBe("Ada");
    expect(
      resolveActingDisplayLabel({
        userId: "999",
        username: "ada",
        owner,
      }),
    ).toBe("ada");
  });

  test("never invents a name when nothing is known", () => {
    expect(
      resolveActingDisplayLabel({ userId: "999", owner }),
    ).toBeUndefined();
  });
});

describe("formatIdentityInjectBlock", () => {
  test("includes discord id + owner display + owner role", () => {
    const block = formatIdentityInjectBlock({
      userId: LEIF_ID,
      displayName: "Wrong",
      owner,
    });
    expect(block).toContain(IDENTITY_INJECT_HEADER);
    expect(block).toContain(`discord_user_id: ${LEIF_ID}`);
    expect(block).toContain("display_name: Leif");
    expect(block).toContain("role: owner (ADMIN)");
    expect(block).not.toContain("Wrong");
    expect(block).not.toContain("Kyn");
  });

  test("blank userId → null", () => {
    expect(formatIdentityInjectBlock({ userId: "  " })).toBeNull();
  });
});

describe("enrichPromptWithIdentity", () => {
  test("prepends block; blank id skips", () => {
    const r = enrichPromptWithIdentity("hello", {
      userId: LEIF_ID,
      owner,
    });
    expect(r.injected).toBe(true);
    expect(r.displayLabel).toBe("Leif");
    expect(r.prompt.startsWith(IDENTITY_INJECT_HEADER)).toBe(true);
    expect(r.prompt).toContain("hello");

    const skip = enrichPromptWithIdentity("hello", { userId: "" });
    expect(skip.injected).toBe(false);
    expect(skip.prompt).toBe("hello");
  });
});
