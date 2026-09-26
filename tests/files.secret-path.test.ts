import { describe, expect, test } from "bun:test";
import { isSecretPath, isProtectedPath } from "../plugins/files/protectedPaths.ts";

describe("isSecretPath (ROLES-CHAT-8)", () => {
  test("flags .env and keys", () => {
    expect(isSecretPath(".env")).toBe(true);
    expect(isSecretPath("foo/.env.local")).toBe(true);
    expect(isSecretPath(".ssh/id_rsa")).toBe(true);
    expect(isSecretPath("secrets/id_ed25519")).toBe(true);
    expect(isSecretPath("wallet-keystore.json")).toBe(true);
  });

  test("does not block ordinary docs / specs (unlike SAFE-2 write)", () => {
    expect(isSecretPath("STATUS.md")).toBe(false);
    expect(isSecretPath("hi/roles.md")).toBe(false);
    expect(isSecretPath("specs/discord/discord.spec.md")).toBe(false);
    // SAFE-2 still protects specs for writes:
    expect(isProtectedPath("specs/discord/discord.spec.md")).toBe(true);
  });
});
