# Implement Cross-Project Audit Command (trustlock audit --compare)

## Description
Implement the story exactly as specified and prepare it for review.

## Acceptance Criteria
- The implementation satisfies the story acceptance criteria.
- Required tests are added or updated.
- The design note records the implementation and verification mapping.

## Inputs
story: docs/stories/F17-S1-cross-project-audit-command.md
feature_brief: docs/feature-briefs/F17-cross-project-audit.md
system_overview: docs/architecture/system-overview.md
global_conventions: context/global/conventions.md
global_architecture: context/global/architecture.md
adrs: docs/adrs/ADR-*.md
## Outputs
design_note: docs/design-notes/F17-S1-approach.md
review_artifact: docs/reviews/task-076-review.md
source_files: src/cli/args.js, src/cli/index.js, src/cli/commands/cross-audit.js
test_files: src/cli/commands/__tests__/cross-audit.test.js, test/integration/cross-audit.test.js
docs_updates: docs/design-notes/F17-S1-approach.md, docs/reviews/task-076-review.md
