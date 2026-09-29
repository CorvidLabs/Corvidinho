---
change: scheduler-refuses-a-zero-cron-step-0-a-b-0-n-0-as-a-cadenceerror-and-bounds-cron-ranges-at-the-field-maximum-so
artifact: design
---

# Design

All in `parseField` (`src/scheduler/cron.ts`); every caller
(`resolveCadence` → `parseCron`, `getNextCronDate` from the store's
`create` / `setStatus("active")` / `claimRun`) goes through it, so one guard
covers `/schedule create`, resume and the tick.

- After the step is read, a step below 1 throws `CadenceError`
  (`Invalid cron step in "PART": the step must be 1 or more.`) before either
  loop. `CadenceError` is what the `/schedule create` handler already turns
  into an ephemeral reply, and `resolveCadence` calls `parseCron` outside
  `validateAndResolveCadence`'s try, so the message reaches the owner as is.
  This refuses every zero step, including `n/0` on a single value, which
  never looped but has no meaning as a step.
- The range loop runs to `Math.min(end, max)` instead of `end`. Values past
  the field's maximum were never matched by `getNextCronDate`, so every
  cadence accepted today resolves to the same string and the same run times;
  only the huge-end and past-2^53 forms change, from a hang to an immediate
  result that the existing rules then judge (5-minute gap, or "no matching
  cron date within 366 days").
- The `*` loop is already bounded by the field's maximum once the step is 1
  or more; a start is never negative (it is split on `-`), a step is digits
  only, and a step too large for a number (`Infinity`) ends the loop at once.
  `getNextCronDate` stays bounded by its 366-day window (a cadence that never
  matches scans ~527k minutes in ~0.15 s and throws).
- No refusal is added for out-of-range bounds (`0-60`, `99 * * * *`): the
  smallest change that ends the hang, listed as a design choice for Leif.
