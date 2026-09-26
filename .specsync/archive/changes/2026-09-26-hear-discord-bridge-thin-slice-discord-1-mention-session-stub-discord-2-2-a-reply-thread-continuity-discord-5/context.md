---
change: hear-discord-bridge-thin-slice-discord-1-mention-session-stub-discord-2-2-a-reply-thread-continuity-discord-5
artifact: context
---

# Context

Issue #5 HEAR thin slice: DISCORD-1, 2/2.a, 5 first (soft later #10–14 out of scope).

Foundation already on main: plugin host + GH reads (#15), default-deny allowlists (#18) with Discord stub API, prove-before-done (#17) with `--no-verify` for bridges, SpecSync agent wiring (#22), STATUS ROADMAP (#21).

Steal (consult only): corvid-agent bridge → gateway → message-router → thread-session-manager + db maps + `isMonitoredChannel`; Merlin bridges/discord Bun spawn + protocol-version + `discord-post-message` dangerous. **Empty lists = deny-all (NOT Merlin BASIC).** Session **stub only** — do not port ProcessManager.

Blocked on live Discord secrets until CoS/Leif provide; ship fixture/unit tests + go-live checklist without blocking merge on missing token.
