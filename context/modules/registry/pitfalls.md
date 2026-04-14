# Module Pitfalls: Registry

## Known Pitfalls
1. npm registry rate limiting
   - Why it happens: Fetching metadata for hundreds of changed packages (e.g., major lockfile refresh) can trigger npm rate limits.
   - How to avoid it: Concurrency limit of 10 parallel requests. Only fetch for changed packages, not the entire tree. Cache aggressively.

2. Stale cache giving false confidence
   - Why it happens: A package loses provenance between cache writes. Stale cache still shows provenance. The provenance regression check passes when it shouldn't.
   - How to avoid it: Annotate findings produced from stale data. Terminal output shows "based on cached data from [timestamp]" when stale.

3. Attestation API response format changes
   - Why it happens: npm's attestation API is relatively new and could change format.
   - How to avoid it: Parse attestation responses defensively. Look for SLSA provenance predicate type. If format is unrecognized, treat as "no attestation" with warning.

4. Scoped package URL encoding
   - Why it happens: Scoped packages need URL encoding (`@scope%2fname`) in some npm API endpoints but not others.
   - How to avoid it: Test registry client with scoped package fixtures. Encode consistently.

5. Double-rejection in async HTTP promise handlers
   - Why it happens: `req.destroy()` and `res.on('error')` can both fire after a size-limit or timeout rejection. Without a guard, the promise rejects twice and the second rejection becomes an unhandled rejection.
   - How to avoid it: Use a `settled` flag with a `done(fn, val)` closure that is a no-op after the first call. All resolution/rejection paths must go through `done`. Source: `src/registry/http.js` — replicate this pattern in any new HTTP helper.

6. Attestation null coerced to `{}` through cache without `_value` envelope
   - Why it happens: `cache.set` spreads its data argument `{ ...data, _cachedAt }`. When `data` is `null`, the spread produces `{}`. A subsequent `cache.get` returns `{}`, not `null`, silently breaking the "no attestation" signal.
   - How to avoid it: Wrap attestation data in `{ _value: data }` before calling `cache.set`; unwrap after `cache.get`. Source: `src/registry/client.js:176-190`. Apply the same envelope to any future method that may legitimately return `null` as a domain value.

7. `noCache: true` still writes to cache (write-through is intentional)
   - Why it happens: The spec requires that `noCache` bypass cache reads but still write successful fetches so subsequent non-noCache runs benefit. Callers that assume `noCache` skips all cache I/O will be confused.
   - How to avoid it: Document the write-through contract clearly in any caller. If you ever need "skip read AND skip write," add a separate `noWrite` option — do not repurpose `noCache`. Source: `src/registry/client.js:93-128`, story F03-S03 behavioral rule.

8. Semaphore pre-increments for queued waiters in `release()` — double-increment trap
   - Why it happens: In `createSemaphore`, `active` is incremented once in `run()` for an immediately admitted slot, and once in `release()` for the waiter it unblocks. If you modify the semaphore and add an increment in both places for the same waiter, `active` over-counts and fewer slots become available than expected.
   - How to avoid it: The contract is: every `active++` has exactly one matching `active--` in `release()`. Read the comment in `run()` before editing. Source: `src/registry/client.js:22-44`.

## Regression Traps
- Changing cache TTL changes which data is considered "fresh." Tests that depend on specific cache behavior must use controlled timestamps.
- Adding a new registry endpoint must not affect caching behavior of existing endpoints.

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Module: registry
