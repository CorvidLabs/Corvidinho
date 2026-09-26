---
change: hear-live-thinking-status-discord-3-edit-in-place-progress-embeds-elapsed-time-current-tool-rough-token-use-while
artifact: requirements
---

# Requirements

## DISCORD-3 live thinking status

- When a session starts or continues, the bridge SHALL post one progress status
  message (embed preferred) so the channel is not a silent void.
- While the agent runs, the bridge SHALL edit that message in-place with at
  least elapsed time; when a current tool or rough token estimate is known, those
  SHALL appear in the description or footer.
- When the agent finishes, the progress message SHALL be marked Done (or error)
  and the final reply SHALL still be posted as a separate message.
- SHALL NOT introduce ProcessManager. SHALL NOT weaken Discord/GitHub allowlists.
- Fixture/unit tests SHALL cover builders + edit sequence without a live token.
