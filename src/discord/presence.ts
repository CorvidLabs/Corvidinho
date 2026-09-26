/**
 * Discord presence / custom-status payload for version display (DISCORD-12).
 * Pure helpers — fixture-tested without a live Discord token.
 */

import {
  formatPresenceVersionString,
  VERSION,
} from "../version.ts";

/** ActivityType.Custom — discord-api-types / discord.js. */
export const PRESENCE_ACTIVITY_TYPE_CUSTOM = 4 as const;

export type VersionPresenceActivity = {
  /** Discord expects "Custom Status" as name for type Custom. */
  name: string;
  /** Displayed custom-status text (short version string). */
  state: string;
  type: typeof PRESENCE_ACTIVITY_TYPE_CUSTOM;
};

/**
 * Build the Custom Status activity showing the shared package version.
 * Example state: `v0.0.3`.
 */
export function buildVersionPresenceActivity(
  version: string = VERSION,
): VersionPresenceActivity {
  return {
    name: "Custom Status",
    state: formatPresenceVersionString(version),
    type: PRESENCE_ACTIVITY_TYPE_CUSTOM,
  };
}
