# Module Pitfalls: Baseline

## Known Pitfalls
1. Partial advancement on error
   - Why it happens: If baseline write succeeds but `git add` fails, the baseline file is updated but not staged. Next commit has an unstaged baseline change.
   - How to avoid it: Treat write + stage as atomic. If `git add` fails, warn the user but don't roll back the file (the file is still correct — it just needs manual staging).

2. Lockfile hash mismatch false positive
   - Why it happens: Lockfile hash is used for quick "no changes" detection. But whitespace or formatting changes in the lockfile produce a different hash without changing any dependency.
   - How to avoid it: The hash is a fast-path optimization only. If the hash differs, proceed to full delta computation. Delta computation is the authoritative check.

3. Concurrent hook runs
   - Why it happens: Developer has multiple terminals, both running `git commit` simultaneously. Both hooks read baseline, evaluate, and try to write.
   - How to avoid it: Atomic file write (temp + rename) prevents corruption. The last writer wins, which is correct — both evaluated against the same baseline.

## Regression Traps
- Changing `TrustProfile` fields requires a baseline `schema_version` bump and migration logic.
- The delta must treat "same name, different version" as a change, not as "removed + added."

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Module: baseline
