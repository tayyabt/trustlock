# Implement Monorepo Root Resolution: paths.js, git.js, and All Command Callers

## Description
Implement the story exactly as specified and prepare it for review.

## Acceptance Criteria
- The implementation satisfies the story acceptance criteria.
- Required tests are added or updated.
- The design note records the implementation and verification mapping.

## Inputs
story: docs/stories/F09-S1-monorepo-root-resolution-paths-git-and-callers.md
feature_brief: docs/feature-briefs/F09-monorepo-root-resolution.md
system_overview: docs/architecture/system-overview.md
global_conventions: context/global/conventions.md
global_architecture: context/global/architecture.md
adrs: docs/adrs/ADR-*.md
## Outputs
design_note: docs/design-notes/F09-S1-approach.md
review_artifact: docs/reviews/task-059-review.md
source_files: src/utils/paths.js, src/utils/git.js, src/cli/args.js, src/baseline/manager.js, src/cli/commands/init.js, src/cli/commands/check.js, src/cli/commands/approve.js, src/cli/commands/audit.js, src/cli/commands/install-hook.js
test_files: test/unit/utils/paths.test.js, test/unit/cli/args.test.js, test/unit/cli/init.test.js, test/unit/cli/check.test.js, test/unit/cli/approve.test.js, test/unit/cli/audit.test.js, test/unit/cli/install-hook.test.js, test/integration/monorepo-init.test.js, test/integration/monorepo-check.test.js, test/integration/monorepo-install-hook.test.js
docs_updates: docs/design-notes/F09-S1-approach.md, docs/reviews/task-059-review.md
