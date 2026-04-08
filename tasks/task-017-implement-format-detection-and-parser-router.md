# Implement format detection and parser router

## Description
Implement the story exactly as specified and prepare it for review.

## Acceptance Criteria
- The implementation satisfies the story acceptance criteria.
- Required tests are added or updated.
- The design note records the implementation and verification mapping.

## Inputs
story: docs/stories/F02-S02-format-detection-parser-router.md
feature_brief: docs/feature-briefs/F02-lockfile-parsing.md
system_overview: docs/architecture/system-overview.md
global_conventions: context/global/conventions.md
global_architecture: context/global/architecture.md
adrs: docs/adrs/ADR-*.md
## Outputs
design_note: docs/design-notes/F02-S02-approach.md
review_artifact: docs/reviews/task-017-review.md
source_files: src/lockfile/parser.js, src/lockfile/npm.js
test_files: test/lockfile/parser.test.js, test/fixtures/lockfiles/npm-v1.json, test/fixtures/lockfiles/npm-v2.json, test/fixtures/lockfiles/npm-v3.json, test/fixtures/lockfiles/npm-v4-unknown.json, test/fixtures/lockfiles/npm-no-version.json, test/fixtures/lockfiles/package.json
docs_updates: docs/design-notes/F02-S02-approach.md
