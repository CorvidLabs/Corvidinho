/**
 * Default-deny allowlists (ALLOW-1..6). Empty allow ⇒ refuse; deny always wins.
 * Never Merlin empty-permissions → BASIC allow-by-default.
 */

export type GithubAllowlists = {
  /** Org names (matches owner of OWNER/REPO). */
  orgs: string[];
  /** Patterns: owner/repo or owner/* */
  repos: string[];
  /** GitHub login / user ids */
  users: string[];
  denyOrgs: string[];
  denyRepos: string[];
  denyUsers: string[];
};

export type DiscordAllowlists = {
  channels: string[];
  roles: string[];
  users: string[];
  denyChannels: string[];
  denyRoles: string[];
  denyUsers: string[];
};

export type AllowlistConfig = {
  /** Absolute path loaded, if any. */
  sourcePath: string | null;
  github: GithubAllowlists;
  discord: DiscordAllowlists;
};

export type GateResult =
  | { ok: true }
  | { ok: false; error: string };

export function emptyGithub(): GithubAllowlists {
  return {
    orgs: [],
    repos: [],
    users: [],
    denyOrgs: [],
    denyRepos: [],
    denyUsers: [],
  };
}

export function emptyDiscord(): DiscordAllowlists {
  return {
    channels: [],
    roles: [],
    users: [],
    denyChannels: [],
    denyRoles: [],
    denyUsers: [],
  };
}

export function emptyConfig(): AllowlistConfig {
  return {
    sourcePath: null,
    github: emptyGithub(),
    discord: emptyDiscord(),
  };
}
