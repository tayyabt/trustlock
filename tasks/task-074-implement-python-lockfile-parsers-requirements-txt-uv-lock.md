# Implement Python lockfile parsers (requirements.txt + uv.lock)

## Description
Implement the story exactly as specified and prepare it for review.

## Acceptance Criteria
- The implementation satisfies the story acceptance criteria.
- Required tests are added or updated.
- The design note records the implementation and verification mapping.

## Inputs
story: docs/stories/F16-S1-python-lockfile-parsers.md
feature_brief: docs/feature-briefs/F16-python-ecosystem.md
system_overview: docs/architecture/system-overview.md
global_conventions: context/global/conventions.md
global_architecture: context/global/architecture.md
adrs: docs/adrs/ADR-*.md
## Outputs
design_note: docs/design-notes/F16-S1-approach.md
review_artifact: docs/reviews/task-074-review.md
source_files: src/lockfile/models.js, src/lockfile/npm.js, src/lockfile/pnpm.js, src/lockfile/parser.js, src/lockfile/requirements.js, src/lockfile/uv.js
test_files: test/lockfile/models.test.js, test/lockfile/requirements.test.js, test/lockfile/uv.test.js, test/fixtures/lockfiles/requirements-basic.txt, test/fixtures/lockfiles/requirements-piped.txt, test/fixtures/lockfiles/uv-basic.lock, test/fixtures/lockfiles/uv-source-path.lock
docs_updates: docs/design-notes/F16-S1-approach.md, docs/reviews/task-074-review.md
