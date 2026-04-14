# Implement policy/loader.js: async entry point and command wiring

## Description
Implement the story exactly as specified and prepare it for review.

## Acceptance Criteria
- The implementation satisfies the story acceptance criteria.
- Required tests are added or updated.
- The design note records the implementation and verification mapping.

## Inputs
story: docs/stories/F15-S2-loader-async-entry-command-wiring.md
feature_brief: docs/feature-briefs/F15-policy-config-load-order.md
workflow_docs: docs/workflows/cli/org-policy-setup.md
system_overview: docs/architecture/system-overview.md
global_conventions: context/global/conventions.md
global_architecture: context/global/architecture.md
adrs: docs/adrs/ADR-*.md
## Outputs
design_note: docs/design-notes/F15-S2-approach.md
review_artifact: docs/reviews/task-073-review.md
source_files: src/policy/loader.js, src/cli/commands/check.js, src/cli/commands/audit.js, src/cli/commands/approve.js, src/cli/commands/init.js
test_files: test/policy/loader.test.js
docs_updates: docs/design-notes/F15-S2-approach.md, docs/reviews/task-073-review.md
