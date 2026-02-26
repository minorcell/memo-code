# Memo CLI `read_text_file` Tool

Reads a text file with optional head/tail line limits.

## Basic Info

- Tool name: `read_text_file`
- Description: read full text file content, or first/last N lines
- File: `packages/tools/src/tools/read_text_file.ts`
- Confirmation: no

## Parameters

- `path` (string, required): file path within allowed roots.
- `head` (integer, optional): return first N lines.
- `tail` (integer, optional): return last N lines.

## Behavior

- Uses shared filesystem validation before reading.
- Rejects calls that provide both `head` and `tail`.
- Returns plain text content via `textResult`.
- Returns `isError=true` on validation/read failures.

## Output Example

```text
line1
line2
```
