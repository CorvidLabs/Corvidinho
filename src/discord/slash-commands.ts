/**
 * Thin slash command bodies for Discord application commands (DISCORD-4 / 7 /
 * DISCORD-SCHEDULE-1..2). Plain JSON — no live discord.js required for fixture tests.
 *
 * Steal shape from corvid-agent session/status/agents/work + mute/unmute ADMIN
 * + /schedule list|create|pause|resume|delete (single-project; skip templates).
 */

/** Discord Application Command option type: SUB_COMMAND */
export const OPT_SUB_COMMAND = 1;
/** Discord Application Command option type: STRING */
export const OPT_STRING = 3;
/** Discord Application Command option type: USER */
export const OPT_USER = 6;

export type SlashCommandBody = {
  name: string;
  description: string;
  options?: Array<{
    type: number;
    name: string;
    description: string;
    required?: boolean;
    options?: Array<{
      type: number;
      name: string;
      description: string;
      required?: boolean;
    }>;
  }>;
};

/**
 * Build the slash set: /session list|start, /status, /agents, /work,
 * /mute /unmute (DISCORD-7), /schedule list|create|pause|resume|delete
 * (DISCORD-SCHEDULE).
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
] as const;
export type SlashCommandName = (typeof SLASH_COMMAND_NAMES)[number];
