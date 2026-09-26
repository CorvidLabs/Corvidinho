---
change: headless-schedule-daemon-issue-108-captured-slice-cli-8-autonomous-4-corvidinho-daemon-ticks-schedules-without-discord
artifact: research
---

# Research

- Only `startBridge` constructed a `SchedulerService`, so schedules ticked
  only while the bridge ran. `githubWatch` has no scheduler.
- `ScheduleStore` loaded rows once in its constructor, and `persistUpdate`
  rewrote every column. Two processes would each fire a due run, and a
  finishing run would rewrite a stale `status`.
- `openCorvidinhoDb` already sets `busy_timeout = 5000`, so short
  cross-process writes wait instead of failing.
- `bun:sqlite` `Database.run()` returns `{ changes }`, which is enough for a
  compare-and-set claim (checked on bun 1.4.2).
- Signal listeners do not keep a Bun process alive, and the scheduler's own
  interval is `unref`'d. The daemon needs a ref'd interval of its own.
- `/proc/<pid>/stat` field 22 (start time) tells a recycled pid apart from
  the lock's holder. The comm field can contain `)`, so parsing starts after
  the last `)`.
- Steal sources named in #108 (corvid-agent `deploy/*.service`,
  shutdown-coordinator; Merlin `daemon.rs`): only the systemd unit shape and
  the "stop intake, drain, then exit" order were used. Heartbeat, health
  monitor and death-loop breaker belong to the draft OPS-4/5 and were not
  used.
