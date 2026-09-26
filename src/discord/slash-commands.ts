/**
 * Thin slash command bodies for Discord application commands (DISCORD-4).
 * Plain JSON — no live discord.js required for fixture tests.
 *
 * Steal shape from corvid-agent session/status/agents/work; skip voice,
 * council, schedule, iced UI.
 */

/** Discord Application Command option type: SUB_COMMAND */
export const OPT_SUB_COMMAND = 1;
/** Discord Application Command option type: STRING */
export const OPT_STRING = 3;

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
 * Build the thin useful slash set: /session list|start, /status, /agents, /work.
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
      ],
    },
  ];
}

export const SLASH_COMMAND_NAMES = ["session", "status", "agents", "work"] as const;
export type SlashCommandName = (typeof SLASH_COMMAND_NAMES)[number];
