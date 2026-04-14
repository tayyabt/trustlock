# Implement CLI Scaffolding: Entry Point, Router, and Argument Parser

## Description
Implement the story exactly as specified and prepare it for review.

## Acceptance Criteria
- The implementation satisfies the story acceptance criteria.
- Required tests are added or updated.
- The design note records the implementation and verification mapping.

## Inputs
story: docs/stories/F08-S1-cli-scaffolding-entry-point-and-argument-parser.md
feature_brief: docs/feature-briefs/F08-cli-commands.md
system_overview: docs/architecture/system-overview.md
global_conventions: context/global/conventions.md
global_architecture: context/global/architecture.md
adrs: docs/adrs/ADR-*.md
## Outputs
design_note: docs/design-notes/F08-S1-approach.md
review_artifact: docs/reviews/task-034-review.md
source_files: src/cli/index.js, src/cli/args.js, src/cli/commands/init.js, src/cli/commands/check.js, src/cli/commands/approve.js, src/cli/commands/audit.js, src/cli/commands/clean.js, src/cli/commands/install-hook.js, package.json
test_files: test/unit/cli/args.test.js, test/smoke.test.js
docs_updates: docs/design-notes/F08-S1-approach.md, docs/reviews/task-034-review.md
