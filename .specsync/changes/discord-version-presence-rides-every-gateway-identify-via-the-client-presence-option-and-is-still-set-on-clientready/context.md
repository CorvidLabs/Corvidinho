---
change: discord-version-presence-rides-every-gateway-identify-via-the-client-presence-option-and-is-still-set-on-clientready
artifact: context
---

# Context

DISCORD-12 (hi/discord.md): "Under the bot name I always see the Corvidinho
version (same shared version as /status) as a short Discord presence or
custom status so I can tell which build is live at a glance."

On `origin/main` (fbaa84b) `createLiveGateway` builds the discord.js Client
with intents only, and the version Custom Status is set only in the
`ClientReady` handler through `ready.user.setPresence`. In discord.js
14.27.0, `Client#login` copies `options.presence` (default `{}`) into
`options.ws.presence`, which becomes `initialPresence` of the
@discordjs/ws manager; @discordjs/ws sends it as `d.presence` on every
IDENTIFY. With the default, that is `status: online` and an empty activity
list. `WebSocketManager#checkShardsReady` returns early once the client is
Ready, so `ClientReady` does not fire again after a non-resumable
re-identify (invalid or expired session): the gateway then shows no custom
status until the bridge restarts. That breaks "always".

Scope: this slice only. Open PRs #232 (ask-button actor gate) and #233
(SAFE-3 clamp) are unrelated and untouched.
