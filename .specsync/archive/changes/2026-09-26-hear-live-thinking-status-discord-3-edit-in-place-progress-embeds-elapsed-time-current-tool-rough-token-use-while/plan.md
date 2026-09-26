---
change: hear-live-thinking-status-discord-3-edit-in-place-progress-embeds-elapsed-time-current-tool-rough-token-use-while
artifact: plan
---

# Plan

1. Add pure thinking-status builders (elapsed, tool, token footer; embed colors)
   stolen thinly from corvid-agent embeds/progress-response.
2. Add ThinkingStatus controller (start → tick/update → done/error) over an
   injectable outbound send/edit surface.
3. Extend gateway handlers with editMessage / sendEmbed for live path; keep
   null gateway testable via injected outbound.
4. Wire bridge: post progress before agent.runChat; elapsed ticker during wait;
   optional onStatus from agent client; finalize progress then post reply.
5. Fixture tests for builders + bridge edit sequence; refresh STATUS Done;
   SpecSync discord delta; verify lane.
