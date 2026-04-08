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

## Regression Traps
- Changing cache TTL changes which data is considered "fresh." Tests that depend on specific cache behavior must use controlled timestamps.
- Adding a new registry endpoint must not affect caching behavior of existing endpoints.

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Module: registry
