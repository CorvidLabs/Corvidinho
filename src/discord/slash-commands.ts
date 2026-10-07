/**
 * Thin slash command bodies for Discord application commands (DISCORD-4 / 7 /
 * DISCORD-SCHEDULE-1..2 / DISCORD-ANNOUNCE-1..2 / ADMIN-1..3). Plain JSON — no live discord.js required for fixture tests.
 *
 * Steal shape from corvid-agent session/status/agents/work + mute/unmute ADMIN
 * + /schedule list|create|pause|resume|delete (single-project; skip templates)
 * + /admin users|channels|config (corvid-agent admin-commands.ts, trimmed to
 * the captured ADMIN-1..3 surface) + /admin people (ADMIN-3.a, #36; role ADMIN-3.b, #65; forget MEMORY-ACL-6.a, #101)
 * + /admin deny|github add|remove (ADMIN-3.c part 1: deny lists and the GitHub repo allow lists). Channel options use STRING + autocomplete
 * (searchable names/ids) instead of the limited native CHANNEL picker.
 */

/** Discord Application Command option type: SUB_COMMAND */
export const OPT_SUB_COMMAND = 1;
/** Discord Application Command option type: SUB_COMMAND_GROUP */
export const OPT_SUB_COMMAND_GROUP = 2;
/** Discord Application Command option type: STRING */
export const OPT_STRING = 3;
/** Discord Application Command option type: USER */
export const OPT_USER = 6;
/** Discord Application Command option type: CHANNEL (native picker) */
export const OPT_CHANNEL = 7;
/** Discord Application Command option type: BOOLEAN */
export const OPT_BOOLEAN = 5;
/** Discord Application Command option type: ROLE (role picker; the value is the role id) */
export const OPT_ROLE = 8;
/** Guild text channel type for CHANNEL option channel_types filter */
export const CHANNEL_TYPE_GUILD_TEXT = 0;

export type SlashOptionDef = {
  type: number;
  name: string;
  description: string;
  required?: boolean;
  /** Restrict CHANNEL picker (e.g. [0] = guild text). Legacy; prefer STRING+autocomplete. */
  channel_types?: number[];
  /** Enable Discord autocomplete (STRING/INTEGER/NUMBER). Max 25 choices. */
  autocomplete?: boolean;
  /** Fixed choices (STRING): the only values Discord offers (the handler still re-checks). */
  choices?: Array<{ name: string; value: string }>;
  options?: SlashOptionDef[];
};

export type SlashCommandBody = {
  name: string;
  description: string;
  options?: SlashOptionDef[];
};

/**
 * Build the slash set: /session list|start, /status, /agents, /work,
 * /mute /unmute (DISCORD-7), /schedule list|create|pause|resume|delete
 * (DISCORD-SCHEDULE), /announce channel|show (DISCORD-ANNOUNCE),
 * /admin users add | channels add|remove | config show (ADMIN-1..3)
 * | people list|add|link|unlink|remove (ADMIN-3.a / IDENTITY-13) | people role
 * (ADMIN-3.b / IDENTITY-8) | people forget (MEMORY-ACL-6.a) | deny add|remove
 * and github add|remove (ADMIN-3.c part 1).
 */
export function buildSlashCommandBodies(): SlashCommandBody[] {
  return [
    {
      name: "session",
      description: "Manage agent sessions",
      options: [
        {
          type: OPT_SUB_COMMAND,
          name: "list",
          description: "List active sessions",
        },
        {
          type: OPT_SUB_COMMAND,
          name: "start",
          description: "Start a session with a topic",
          options: [
            {
              type: OPT_STRING,
              name: "topic",
              description: "What to work on",
              required: true,
            },
            {
              type: OPT_STRING,
              name: "project",
              description: "Target project path (optional; default bridge root)",
              required: false,
            },
          ],
        },
      ],
    },
    {
      name: "status",
      description: "Show bridge status and key metrics",
    },
    {
      name: "agents",
      description: "List available agents",
    },
    {
      name: "work",
      description: "Drive a work task without leaving Discord",
      options: [
        {
          type: OPT_STRING,
          name: "description",
          description: "What the agent should work on",
          required: true,
        },
        {
          type: OPT_STRING,
          name: "project",
          description: "Target project path (optional; default bridge root)",
          required: false,
        },
      ],
    },
    {
      name: "mute",
      description: "Mute a user from bot interactions (admin)",
      options: [
        {
          type: OPT_USER,
          name: "user",
          description: "User to mute",
          required: true,
        },
      ],
    },
    {
      name: "unmute",
      description: "Unmute a user (admin)",
      options: [
        {
          type: OPT_USER,
          name: "user",
          description: "User to unmute",
          required: true,
        },
      ],
    },
    {
      name: "schedule",
      description: "Manage recurring single-project agent runs",
      options: [
        {
          type: OPT_SUB_COMMAND,
          name: "list",
          description: "Show all schedules and their status",
        },
        {
          type: OPT_SUB_COMMAND,
          name: "create",
          description: "Create a recurring run (admin)",
          options: [
            {
              type: OPT_STRING,
              name: "name",
              description: "Schedule name",
              required: true,
            },
            {
              type: OPT_STRING,
              name: "cadence",
              description:
                'Human cadence: "every hour", "@daily", or cron "0 * * * *" (min 5m)',
              required: true,
            },
            {
              type: OPT_STRING,
              name: "project",
              description: "Target project path or name (single-project)",
              required: true,
            },
            {
              type: OPT_STRING,
              name: "prompt",
              description: "What the agent should do each run",
              required: true,
            },
            {
              type: OPT_STRING,
              name: "channel",
              description: "Optional allowlisted channel for result posts",
              required: false,
            },
          ],
        },
        {
          type: OPT_SUB_COMMAND,
          name: "pause",
          description: "Pause a schedule (admin)",
          options: [
            {
              type: OPT_STRING,
              name: "schedule",
              description: "Schedule ID (from /schedule list)",
              required: true,
            },
          ],
        },
        {
          type: OPT_SUB_COMMAND,
          name: "resume",
          description: "Resume a paused schedule (admin)",
          options: [
            {
              type: OPT_STRING,
              name: "schedule",
              description: "Schedule ID",
              required: true,
            },
          ],
        },
        {
          type: OPT_SUB_COMMAND,
          name: "delete",
          description: "Delete a schedule (admin)",
          options: [
            {
              type: OPT_STRING,
              name: "schedule",
              description: "Schedule ID",
              required: true,
            },
          ],
        },
      ],
    },
    {
      name: "announce",
      description: "Configure ops/dev announcements channel (admin)",
      options: [
        {
          type: OPT_SUB_COMMAND,
          name: "channel",
          description: "Set or clear the announcements channel (admin)",
          options: [
            {
              type: OPT_STRING,
              name: "channel",
              description: "Search guild text channels by name or paste a snowflake id",
              required: false,
              autocomplete: true,
            },
            {
              type: OPT_BOOLEAN,
              name: "clear",
              description: "Clear the announcements channel (default-deny until set again)",
              required: false,
            },
          ],
        },
        {
          type: OPT_SUB_COMMAND,
          name: "show",
          description: "Show the current announcements channel",
        },
      ],
    },
    {
      name: "admin",
      description: "Runtime allowlist and declared-people admin (owner only)",
      options: [
        {
          type: OPT_SUB_COMMAND_GROUP,
          name: "users",
          description: "Discord user allowlist",
          options: [
            {
              type: OPT_SUB_COMMAND,
              name: "add",
              description: "Approve a user: add to [discord].users (owner only)",
              options: [
                {
                  type: OPT_USER,
                  name: "user",
                  description: "User to approve",
                  required: true,
                },
              ],
            },
          ],
        },
        {
          type: OPT_SUB_COMMAND_GROUP,
          name: "channels",
          description: "Discord channel allowlist",
          options: [
            {
              type: OPT_SUB_COMMAND,
              name: "add",
              description: "Add a channel to [discord].channels (owner only)",
              options: [
                {
                  type: OPT_STRING,
                  name: "channel",
                  description: "Search guild text channels by name or paste a snowflake id",
                  required: true,
                  autocomplete: true,
                },
              ],
            },
            {
              type: OPT_SUB_COMMAND,
              name: "remove",
              description: "Remove a channel from [discord].channels (owner only)",
              options: [
                {
                  type: OPT_STRING,
                  name: "channel",
                  description: "Search allowlisted channels by name or paste a snowflake id",
                  required: true,
                  autocomplete: true,
                },
              ],
            },
          ],
        },
        {
          type: OPT_SUB_COMMAND_GROUP,
          name: "config",
          description: "Allowlist / safe config knobs",
          options: [
            {
              type: OPT_SUB_COMMAND,
              name: "show",
              description: "Show allowlists and safe config knobs (owner only)",
            },
          ],
        },
        {
          type: OPT_SUB_COMMAND_GROUP,
          name: "people",
          description: "Declared people and their links (IDENTITY-13)",
          options: [
            {
              type: OPT_SUB_COMMAND,
              name: "list",
              description: "Show declared people and their links (owner only)",
            },
            {
              type: OPT_SUB_COMMAND,
              name: "add",
              description: "Declare a person, or change their display name (owner only)",
              options: [
                {
                  type: OPT_STRING,
                  name: "person",
                  description: "Person id: lowercase letters, digits, - or _ (e.g. tofu)",
                  required: true,
                },
                {
                  type: OPT_STRING,
                  name: "display",
                  description: "Display name (never used for matching)",
                  required: false,
                },
              ],
            },
            {
              type: OPT_SUB_COMMAND,
              name: "link",
              description: "Link accounts or nicknames to a person (owner only)",
              options: [
                {
                  type: OPT_STRING,
                  name: "person",
                  description: "Person id, e.g. tofu",
                  required: true,
                },
                {
                  type: OPT_USER,
                  name: "discord",
                  description: "Discord account (matched on its user id)",
                  required: false,
                },
                {
                  type: OPT_STRING,
                  name: "github",
                  description: "GitHub login — its numeric user id is looked up now and stored; only that id matches",
                  required: false,
                },
                {
                  type: OPT_STRING,
                  name: "github_id",
                  description: "GitHub numeric user id (what GitHub matching uses)",
                  required: false,
                },
                {
                  type: OPT_STRING,
                  name: "nickname",
                  description: "Nickname (shown to the model, never matched)",
                  required: false,
                },
              ],
            },
            {
              type: OPT_SUB_COMMAND,
              name: "unlink",
              description: "Unlink accounts or nicknames from a person (owner only)",
              options: [
                {
                  type: OPT_STRING,
                  name: "person",
                  description: "Person id, e.g. tofu",
                  required: true,
                },
                {
                  type: OPT_USER,
                  name: "discord",
                  description: "Discord account (matched on its user id)",
                  required: false,
                },
                {
                  type: OPT_STRING,
                  name: "github",
                  description: "GitHub login (a label; unlink github_id to stop GitHub matching)",
                  required: false,
                },
                {
                  type: OPT_STRING,
                  name: "github_id",
                  description: "GitHub numeric user id (what GitHub matching uses)",
                  required: false,
                },
                {
                  type: OPT_STRING,
                  name: "nickname",
                  description: "Nickname (shown to the model, never matched)",
                  required: false,
                },
              ],
            },
            {
              type: OPT_SUB_COMMAND,
              name: "remove",
              description: "Remove a declared person and all their links (owner only)",
              options: [
                {
                  type: OPT_STRING,
                  name: "person",
                  description: "Person id, e.g. tofu",
                  required: true,
                },
              ],
            },
            {
              type: OPT_SUB_COMMAND,
              name: "role",
              description: "Set a declared person's role: team or community (owner only)",
              options: [
                {
                  type: OPT_STRING,
                  name: "person",
                  description: "Person id, e.g. tofu",
                  required: true,
                },
                {
                  type: OPT_STRING,
                  name: "role",
                  description: "team: work tasks + reviews; community: Q&A only (IDENTITY-8)",
                  required: true,
                  choices: [
                    { name: "team", value: "team" },
                    { name: "community", value: "community" },
                  ],
                },
              ],
            },
            {
              type: OPT_SUB_COMMAND,
              name: "forget",
              description: "Start forgetting a declared person; you approve it on the DM card (owner only)",
              options: [
                {
                  type: OPT_STRING,
                  name: "person",
                  description: "Person id, e.g. tofu",
                  required: true,
                },
              ],
            },
          ],
        },
        {
          type: OPT_SUB_COMMAND_GROUP,
          name: "deny",
          description: "Deny lists: Discord channels, users, roles; GitHub orgs, repos, users (ADMIN-3.c)",
          options: [
            {
              type: OPT_SUB_COMMAND,
              name: "add",
              description: "Deny exactly one channel, user, role or GitHub org, repo or user (owner only)",
              options: denyListOptions(),
            },
            {
              type: OPT_SUB_COMMAND,
              name: "remove",
              description: "Remove exactly one entry from a deny list (owner only)",
              options: denyListOptions(),
            },
          ],
        },
        {
          type: OPT_SUB_COMMAND_GROUP,
          name: "github",
          description: "GitHub repo allow lists: [github].orgs and [github].repos (ADMIN-3.c)",
          options: [
            {
              type: OPT_SUB_COMMAND,
              name: "add",
              description: "Allow exactly one GitHub org or repo (owner only)",
              options: githubListOptions(),
            },
            {
              type: OPT_SUB_COMMAND,
              name: "remove",
              description: "Remove exactly one GitHub org or repo from the allow lists (owner only)",
              options: githubListOptions(),
            },
          ],
        },
      ],
    },
  ];
}

/** `/admin deny add|remove` options: give exactly one (the handler re-checks). */
function denyListOptions(): SlashOptionDef[] {
  return [
    {
      type: OPT_STRING,
      name: "channel",
      description: "Discord channel: search by name or paste a snowflake id",
      required: false,
      autocomplete: true,
    },
    { type: OPT_USER, name: "user", description: "Discord user", required: false },
    { type: OPT_ROLE, name: "role", description: "Discord role", required: false },
    { type: OPT_STRING, name: "github_org", description: "GitHub org login", required: false },
    { type: OPT_STRING, name: "github_repo", description: "GitHub repo: OWNER/REPO or OWNER/*", required: false },
    { type: OPT_STRING, name: "github_user", description: "GitHub login or numeric user id", required: false },
  ];
}

/** `/admin github add|remove` options: give exactly one (the handler re-checks). */
function githubListOptions(): SlashOptionDef[] {
  return [
    { type: OPT_STRING, name: "org", description: "GitHub org login (allows every repo it owns)", required: false },
    { type: OPT_STRING, name: "repo", description: "GitHub repo: OWNER/REPO or OWNER/*", required: false },
  ];
}

export const SLASH_COMMAND_NAMES = [
  "session",
  "status",
  "agents",
  "work",
  "mute",
  "unmute",
  "schedule",
  "announce",
  "admin",
] as const;
export type SlashCommandName = (typeof SLASH_COMMAND_NAMES)[number];
