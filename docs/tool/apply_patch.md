# Memo CLI `apply_patch` Tool

Applies structured patches with add/update/delete operations.

## Basic Info

- Tool name: `apply_patch`
- Description: apply structured patch operations with hunk-based replacements
- File: `packages/tools/src/tools/apply_patch.ts`
- Confirmation: no

## Parameters

- `input` (string, required): patch text.

Patch must start with `*** Begin Patch` and end with `*** End Patch`. Supported operations:

- `*** Add File: <path>` with `+` lines
- `*** Delete File: <path>`
- `*** Update File: <path>` with hunks (`@@` + ` ` / `-` / `+` lines)
- Optional move in update: `*** Move to: <new path>`

## Behavior

- Validates patch framing and operation grammar.
- Normalizes target paths to absolute paths.
- Enforces writable-root sandbox policy before mutating files.
- `add`: creates parent dirs and writes joined `+` lines.
- `delete`: removes the target file.
- `update`: loads file, applies each hunk by exact old-chunk match, writes result.
- On move: writes updated content to target path and removes source file (when different).
- Returns `isError=true` on parse failures, sandbox denial, missing context, or I/O errors.

## Output Example

`apply_patch succeeded (2 operations)`

## Notes

- Hunk matching uses exact text chunk replacement; if context is not found, update fails.
- Tool is mutating and should be approval-gated in normal policy.
