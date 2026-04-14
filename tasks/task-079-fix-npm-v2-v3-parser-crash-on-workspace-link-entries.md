# Fix npm v2/v3 parser crash on workspace link entries

## Description
Fix the executable bug and prepare the change for review.

## Acceptance Criteria
- The bug acceptance criteria and verification steps are satisfied.
- The change preserves the expected behavior outside the bug scope.
- The design note captures the root-cause and fix plan.

## Inputs
bug_file: docs/bugs/BUG-002-npm-v2v3-parser-crashes-on-workspace-link-entries.md
system_overview: docs/architecture/system-overview.md
global_conventions: context/global/conventions.md
global_architecture: context/global/architecture.md
adrs: docs/adrs/ADR-*.md
## Outputs
design_note: docs/design-notes/task-079-approach.md
review_artifact: docs/reviews/task-079-review.md
source_files: src/lockfile/npm.js
test_files: test/lockfile/npm.test.js
