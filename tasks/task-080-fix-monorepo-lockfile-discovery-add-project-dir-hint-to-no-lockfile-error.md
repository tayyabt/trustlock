# Fix monorepo lockfile discovery — add --project-dir hint to no-lockfile error

## Description
Fix the executable bug and prepare the change for review.

## Acceptance Criteria
- The bug acceptance criteria and verification steps are satisfied.
- The change preserves the expected behavior outside the bug scope.
- The design note captures the root-cause and fix plan.

## Inputs
bug_file: docs/bugs/BUG-003-monorepo-lockfile-discovery-only-checks-project-root.md
system_overview: docs/architecture/system-overview.md
global_conventions: context/global/conventions.md
global_architecture: context/global/architecture.md
adrs: docs/adrs/ADR-*.md
## Outputs
design_note: docs/design-notes/task-080-approach.md
review_artifact: docs/reviews/task-080-review.md
source_files: src/utils/paths.js, src/cli/commands/init.js, src/cli/commands/audit.js
test_files: test/integration/monorepo-init.test.js, test/integration/monorepo-audit.test.js
