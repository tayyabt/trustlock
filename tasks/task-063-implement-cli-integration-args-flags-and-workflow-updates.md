# Implement CLI integration, args flags, and workflow updates

## Description
Implement the story exactly as specified and prepare it for review.

## Acceptance Criteria
- The implementation satisfies the story acceptance criteria.
- Required tests are added or updated.
- The design note records the implementation and verification mapping.

## Inputs
story: /Users/tayyabtariq/Documents/projects/.burnish-worktrees/trustlock/task-051/docs/stories/F10-S4-cli-integration-and-workflow-updates.md
feature_brief: /Users/tayyabtariq/Documents/projects/.burnish-worktrees/trustlock/task-051/docs/feature-briefs/F10-output-ux-redesign.md
workflow_docs: /Users/tayyabtariq/Documents/projects/.burnish-worktrees/trustlock/task-051/docs/workflows/cli/blocked-approve.md,/Users/tayyabtariq/Documents/projects/.burnish-worktrees/trustlock/task-051/docs/workflows/cli/check-admit.md
system_overview: docs/architecture/system-overview.md
global_conventions: context/global/conventions.md
global_architecture: context/global/architecture.md
adrs: docs/adrs/ADR-*.md
## Outputs
design_note: docs/design-notes/F10-S4-approach.md
review_artifact: docs/reviews/task-063-review.md
source_files: src/utils/progress.js, src/output/terminal.js, src/output/json.js, src/cli/commands/check.js, src/cli/commands/approve.js, src/cli/commands/audit.js, src/cli/commands/init.js
test_files: src/cli/__tests__/args.test.js, src/cli/__tests__/check.integration.test.js, test/unit/cli/check.test.js, test/unit/cli/approve.test.js, test/unit/cli/audit.test.js, test/integration/cli-e2e.test.js
docs_updates: docs/design-notes/F10-S4-approach.md, docs/reviews/task-063-review.md, docs/workflows/cli/blocked-approve.md
