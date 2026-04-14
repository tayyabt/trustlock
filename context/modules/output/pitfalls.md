# Module Pitfalls: Output

## Known Pitfalls
1. ANSI codes in piped output
   - Why it happens: Terminal colors look wrong or produce garbage when output is piped to a file or another command.
   - How to avoid it: Detect if stdout is a TTY (`process.stdout.isTTY`). Disable colors for non-TTY, NO_COLOR env, and TERM=dumb.
   - Implementation note (F07-S01): The terminal formatter (`src/output/terminal.js`) is a pure function that only checks NO_COLOR and TERM=dumb. TTY detection belongs at the call site (CLI command handler). When F08 wires the CLI, the caller should pass `NO_COLOR=1` or check `process.stdout.isTTY` before invoking the formatter, or pass a `noColor` flag. Do not add `process.stdout` reads inside the formatter — keep it pure.

2. Approval command escaping
   - Why it happens: Generated approval commands include `--reason "..."` with user-facing text. If the reason template contains special shell characters, the command won't copy-paste correctly.
   - How to avoid it: Use single quotes for the reason placeholder. Or print the command components on separate lines.

3. Wide terminal output
   - Why it happens: Long package names + version + finding message can exceed 80 columns.
   - How to avoid it: Don't line-wrap programmatically — let the terminal handle it. Keep messages concise. Use indentation for structure.

## Regression Traps
- Adding new finding types must produce sensible terminal output. Test new rules' findings through the terminal formatter.
- JSON output structure is a contract for CI integrations. Adding fields is fine, removing or renaming fields is breaking.

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Module: output
