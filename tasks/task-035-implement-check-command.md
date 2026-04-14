# Implement check Command

## Description
Implement the story exactly as specified and prepare it for review.

## Acceptance Criteria
- The implementation satisfies the story acceptance criteria.
- Required tests are added or updated.
- The design note records the implementation and verification mapping.

## Inputs
story: docs/stories/F08-S2-check-command.md
feature_brief: docs/feature-briefs/F08-cli-commands.md
workflow_docs: docs/workflows/cli/check-admit.md
system_overview: docs/architecture/system-overview.md
global_conventions: context/global/conventions.md
global_architecture: context/global/architecture.md
adrs: docs/adrs/ADR-*.md
## Outputs
design_note: docs/design-notes/F08-S2-approach.md
review_artifact: docs/reviews/task-035-review.md
source_files: src/cli/commands/check.js, src/policy/engine.js
test_files: test/unit/cli/check.test.js
docs_updates: docs/design-notes/F08-S2-approach.md, docs/reviews/task-035-review.md
