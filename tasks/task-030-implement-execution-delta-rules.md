# Implement Execution & Delta Rules

## Description
Implement the story exactly as specified and prepare it for review.

## Acceptance Criteria
- The implementation satisfies the story acceptance criteria.
- Required tests are added or updated.
- The design note records the implementation and verification mapping.

## Inputs
story: docs/stories/F06-S03-execution-and-delta-rules.md
feature_brief: docs/feature-briefs/F06-policy-engine.md
system_overview: docs/architecture/system-overview.md
global_conventions: context/global/conventions.md
global_architecture: context/global/architecture.md
adrs: docs/adrs/ADR-*.md
## Outputs
design_note: docs/design-notes/F06-S03-approach.md
review_artifact: docs/reviews/task-030-review.md
source_files: src/policy/rules/scripts.js, src/policy/rules/sources.js, src/policy/rules/new-dependency.js, src/policy/rules/transitive-surprise.js
test_files: test/policy/rules/scripts.test.js, test/policy/rules/sources.test.js, test/policy/rules/new-dependency.test.js, test/policy/rules/transitive-surprise.test.js
