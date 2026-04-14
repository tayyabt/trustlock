# Implement PyPI registry adapter and ecosystem dispatch

## Description
Implement the story exactly as specified and prepare it for review.

## Acceptance Criteria
- The implementation satisfies the story acceptance criteria.
- Required tests are added or updated.
- The design note records the implementation and verification mapping.

## Inputs
story: docs/stories/F16-S2-pypi-registry-adapter.md
feature_brief: docs/feature-briefs/F16-python-ecosystem.md
system_overview: docs/architecture/system-overview.md
global_conventions: context/global/conventions.md
global_architecture: context/global/architecture.md
adrs: docs/adrs/ADR-*.md
## Outputs
design_note: docs/design-notes/F16-S2-approach.md
review_artifact: docs/reviews/task-075-review.md
source_files: src/registry/pypi.js, src/registry/client.js, src/registry/http.js
test_files: test/registry/pypi.test.js, test/registry/cache-namespace.test.js, test/registry/client.test.js
docs_updates: docs/design-notes/F16-S2-approach.md
