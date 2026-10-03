---
change: missing-plugin-asks-soft-land-with-the-real-gap
artifact: requirements
---

# Requirements

See acceptance criteria in `change.md` and living requirement REQ-agent-742 (delta `deltas/agent.md`).

Observable outcomes:

- A named plugin or GIF ask that is not offered gets one concrete gap reply (not installed, not allowlisted, not configured, role, or tier) and does not call the model.
- HI ids and open PR numbers appear only when the lookup returned them.
- The reply never invents Tenor or any other provider, and never asks what to install when the message already named the plugin.
- When a candidate tool is already offered, the model still runs.
- Community sessions are not given mutating tools and are not told to edit the allowlist.
