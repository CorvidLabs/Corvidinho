---
change: discord-ask-8-clear-ephemeral-choice-buttons-on-pick-and-delete-got-it-working-ephemeral-after-resume
artifact: requirements
---

# Requirements

## REQ delta (discord)

### REQ-discord-049 (DISCORD-ASK-8) — Added

After the requester presses an ephemeral choice button, the bridge SHALL clear
or disable those option buttons immediately, SHALL keep `pendingAsk` cleared so
a re-press is expired or otherwise a no-op (not a second agent resume), and
SHALL delete or thin-update the ephemeral "Got it — Working on it…" message once
the resume finishes (or immediately after pick) so it does not linger as a
dismissible half-done UI (DISCORD-ASK-8).

Acceptance Criteria
- Pick update includes empty components (buttons gone) and clears pendingAsk before resume.
- Re-press after clear does not spawn a second resume.
- Ephemeral ack is deleted (or thin-updated without buttons) after resume completes when deleteReply is available.
