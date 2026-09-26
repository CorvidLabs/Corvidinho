---
change: harden-child-process-lifetimes-and-fledge-scoping-issue-112-follow-up-to-154-157-167-fledge-plugin-argv-after-own
artifact: tasks
---

# Tasks

- [x] Verify fledge 1.8.0 honours `--` after the plugin command name
- [x] Add the process-tree stop module with pid-reuse guards and parent-exit / signal hooks
- [x] Put `--` before model argv in `fledge-<command>` runs
- [x] Spawn Fledge runs in their own process group; kill the tree on timeout and abort
- [x] Bind Fledge commands to their project root; rebind or remove on another root's load; refuse other cwds
- [x] Add identity-checked `unregister` to the plugin registry
- [x] Spawn delegate workers in their own process group; stop the whole tree on timeout / abort
- [x] Spawn schedule/chat agents in their own process group; abort kills the tree
- [x] Abort abandoned schedule runs at daemon shutdown
- [x] Remove unused `ScheduleStore.markRunStarted`
- [x] Leave signals the process started with ignored (nohup SIGHUP, background SIGINT) unhooked
- [x] Stop what an exited child left in its group on abort and at parent exit (exit snapshot for agent client, delegate, spawnCapped and the tracker)
- [x] Regression tests for each fix (fake fledge / fake bins / real sh trees, no network)
- [x] Deltas, spec file coverage and verify lane green
