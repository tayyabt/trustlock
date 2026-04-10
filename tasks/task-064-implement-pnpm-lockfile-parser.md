# Implement pnpm lockfile parser

## Description
Implement the story exactly as specified and prepare it for review.

## Acceptance Criteria
- The implementation satisfies the story acceptance criteria.
- Required tests are added or updated.
- The design note records the implementation and verification mapping.

## Inputs
story: docs/stories/F11-S1-pnpm-lockfile-parser.md
feature_brief: docs/feature-briefs/F11-lockfile-parsers-pnpm-yarn.md
system_overview: docs/architecture/system-overview.md
global_conventions: context/global/conventions.md
global_architecture: context/global/architecture.md
adrs: docs/adrs/ADR-*.md
## Outputs
design_note: docs/design-notes/F11-S1-approach.md
review_artifact: docs/reviews/task-064-review.md
source_files: src/lockfile/pnpm.js, src/lockfile/parser.js
test_files: test/lockfile/pnpm.test.js, test/lockfile/parser.test.js, test/fixtures/lockfiles/pnpm-v5.yaml, test/fixtures/lockfiles/pnpm-v6.yaml, test/fixtures/lockfiles/pnpm-v9.yaml, test/fixtures/lockfiles/pnpm-monorepo.yaml
