# Feature: [F14] Policy Profiles

Keep this artifact concise and deterministic. Fill every required section, but prefer short specific bullets over broad prose.

## Summary

Adds named policy profiles to `.trustlockrc.json`. Profiles are shallow-merged overlays selected with `trustlock check --profile <name>`. Two built-in profiles ship: `strict` (tighter cooldown, provenance required for all packages) and `relaxed` (reduced cooldown, no provenance requirement). Profile floor enforcement prevents user-defined profiles from lowering numeric floors below the base config — the built-in `relaxed` profile is the only exception (C11).

## Delivery Metadata
- UI-Bearing: no
- Preview Required: no
- Workflow Coverage: not required
- Workflow Rationale: Profile selection is a config flag addition. No new interactive flow is introduced — the user adds `--profile strict` to their `trustlock check` invocation. Blocked-approve and check-admit flows are unchanged in structure; only the policy strictness changes. No unique recovery or onboarding pattern that warrants a workflow doc.
- Target Sprint: 3
- Sprint Rationale: Policy profiles are self-contained after `args.js` gains `--profile`. Can proceed in parallel with F11 and F12 once F09 is done and `args.js` is updated. No dependency on output redesign (F10).

## Description

The `profiles` key in `.trustlockrc.json` holds named profile objects. Each profile is a shallow overlay: profile keys override base config keys; nested objects (`provenance`, `scripts`, `sources`) merge one level deep — profile keys override base keys, unspecified keys fall through to base.

Floor enforcement: if a user-defined profile sets a numeric value below the base config, trustlock exits with `Profile "<name>" sets <key>=<value>, below base config minimum of <base>. Profiles can only tighten policy, not loosen it.` The built-in `relaxed` profile is exempt from this enforcement (C11). The floor check must distinguish built-in profiles from user-defined profiles by source.

`required_for: ["*"]` in a profile triggers a mandatory warning before results: the ecosystem context warning about ~85–90% of npm packages having no provenance. This warning is in terminal output and in the JSON `warnings[]` array. It is not suppressible.

Built-in profiles (`strict`, `relaxed`) ship as constants in `src/policy/builtin-profiles.js` and can be referenced without defining them in `.trustlockrc.json`. A user-defined profile with the same name as a built-in overrides the built-in entirely.

## User-Facing Behavior

- `trustlock check --profile strict` applies the strict overlay: tighter cooldown, provenance required for all packages.
- `trustlock check --profile relaxed` applies the relaxed overlay: reduced cooldown, no provenance requirement.
- `trustlock check --profile myprofile` applies a user-defined profile from `profiles.myprofile` in `.trustlockrc.json`.
- Unknown profile name: exit with error `Profile "myprofile" not found in .trustlockrc.json or built-in profiles.`
- User-defined profile lowering a numeric floor: exit with specific error message naming the key and values.
- `required_for: ["*"]` warning appears before results (terminal and JSON `warnings[]`); not suppressible.
- Built-in `relaxed` profile values are documented and predictable; user-defined `relaxed` overrides the built-in entirely.

## UI Expectations (if applicable)
N/A — CLI-only feature.

## Primary Workflows
- none

## Edge Cases
1. Profile not defined in `.trustlockrc.json` and not a built-in — error exit.
2. User-defined profile with name `relaxed` — overrides built-in; floor enforcement applies to the user-defined version.
3. User-defined profile with name `strict` — overrides built-in; floor enforcement applies.
4. Profile sets `cooldown_hours` below base — error with specific message (C11).
5. Built-in `relaxed` sets `cooldown_hours` below base — permitted; no error (C11 exception).
6. Profile sets `provenance.required_for: ["*"]` — mandatory warning before results.
7. Profile merges nested `provenance` object — keys in profile override base; unspecified keys fall through.
8. Profile merges nested `scripts` object — same shallow merge semantics.
9. No `--profile` flag — base config used directly; profiles key in `.trustlockrc.json` is ignored.
10. `profiles` key absent from `.trustlockrc.json` — built-in profiles still available via `--profile`.

## Acceptance Criteria
- [ ] `--profile strict` applies strict overlay; stricter results than base config.
- [ ] `--profile relaxed` applies relaxed overlay (built-in); more permissive than base config without error.
- [ ] User-defined profile lowering `cooldown_hours` below base: exits with `Profile "<name>" sets cooldown_hours=<N>, below base config minimum of <M>. Profiles can only tighten policy, not loosen it.` (C11).
- [ ] Built-in `relaxed` lowering cooldown below base: no error (C11 exception).
- [ ] User-defined `relaxed` profile: overrides built-in; floor enforcement applies.
- [ ] `required_for: ["*"]` in any profile: warning emitted before results in terminal and JSON `warnings[]`; not suppressible.
- [ ] Profile with nested `provenance` overlay: profile keys override base; unspecified keys fall through.
- [ ] Unknown profile name: error exit with clear message.
- [ ] No `--profile` flag: base config used; no profile-related output.

## Dependencies
- F09 (paths.js — all commands must resolve roots before policy load)
- F06 (policy engine — profiles overlay is applied at policy load time)

## Layering
- `src/policy/builtin-profiles.js` (new) + profile merge logic in policy loader → `src/cli/args.js` (`--profile` flag) → `src/cli/commands/check.js` (profile passed to policy load)

## Module Scope
- policy, cli

## Complexity Assessment
- Modules affected: policy/builtin-profiles.js (new), policy loader (modified — merge + floor enforcement), cli/args.js (--profile flag)
- New patterns introduced: yes — three-layer config merge (base + profile + built-in distinction); floor enforcement with built-in exception
- Architecture review needed: no (spec review covers semantics)
- Design review needed: no

## PM Assumptions (if any)
- F15 (policy inheritance via `extends`) is Sprint 4 work. F14 (profiles) is Sprint 3. The floor enforcement logic for profiles must not be tightly coupled to the `extends` merge logic — each must be independently testable. ADR-005 (written in task-045) governs the merged flow for Sprint 4.
- Built-in `strict` profile exact values (cooldown_hours, provenance settings) are an architecture decision; PM only defines the name and behavior contract.
- Built-in `relaxed` profile exact values (reduced cooldown, no provenance requirement) are an architecture decision.

## Metadata
- Agent: pm
- Date: 2026-04-10
- Spec source: specs/2026-04-10-trustlock-v0.2-v0.4-spec.md §3.5, §5.2
- Sprint: 3
