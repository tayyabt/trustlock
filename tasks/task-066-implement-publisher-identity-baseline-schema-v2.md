# Implement Publisher Identity + Baseline Schema v2

## Description
Implement the story exactly as specified and prepare it for review.

## Acceptance Criteria
- The implementation satisfies the story acceptance criteria.
- Required tests are added or updated.
- The design note records the implementation and verification mapping.

## Inputs
story: docs/stories/F12-S01-publisher-identity-baseline-schema-v2.md
feature_brief: docs/feature-briefs/F12-publisher-identity-baseline-v2.md
system_overview: docs/architecture/system-overview.md
global_conventions: context/global/conventions.md
global_architecture: context/global/architecture.md
adrs: docs/adrs/ADR-*.md
## Outputs
design_note: docs/design-notes/F12-S01-approach.md
review_artifact: docs/reviews/task-066-review.md
source_files: src/registry/npm-registry.js, src/registry/publisher.js, src/baseline/manager.js, src/policy/engine.js, src/cli/commands/check.js
test_files: test/registry/publisher.test.js, test/registry/npm-registry.test.js, test/baseline/manager.test.js, test/integration/publisher-schema-migration.test.js
docs_updates: docs/design-notes/F12-S01-approach.md, docs/reviews/task-066-review.md
