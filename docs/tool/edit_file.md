# Memo CLI `edit_file` Tool

Applies one or more ordered text edits to a file and returns a unified diff.

## Basic Info

- Tool name: `edit_file`
- Description: server-aligned ordered edits with optional dry-run diff preview
- File: `packages/tools/src/tools/edit_file.ts`
- Confirmation: yes

## Parameters

- `path` (string, required): target file path.
- `edits` (array, required): each item is `{ oldText, newText }`.
- `dryRun` (boolean, optional, default `false`): preview only, no write.

## Behavior

- Executes edits in order; each next edit sees prior results.
- For each edit, replaces only the first exact match.
- If exact match fails, falls back to line-trim whitespace-tolerant matching.
- Preserves indentation using server-compatible relative indentation rules.
- If any edit does not match, stops with `Could not find exact match for edit: ...`.
- Returns Git unified diff in a fenced `diff` code block.

## Best Practice

Run once with `dryRun: true` to preview diff, then re-run with `dryRun: false`.
