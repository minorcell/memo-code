# Memo CLI `edit` Tool

Replaces target text in a file, with optional global replacement and batch edits.

## Basic Info

- Tool name: `edit`
- Description: replace text in file, supports `replace_all` and `edits`
- File: `packages/tools/src/tools/edit.ts`
- Confirmation: no

## Parameters

- `file_path` (string, required): target file path (normalized to absolute path).
- Single-edit mode:
  - `old_string` (string, required): source text to replace.
  - `new_string` (string, required): replacement text.
  - `replace_all` (boolean, optional): whether to replace all occurrences; default is single replacement.
- Batch mode:
  - `edits` (array, required in batch mode): each item has `old_string`, `new_string`, and optional `replace_all`.
  - `edits` cannot be used together with `old_string/new_string`.

## Behavior

- Returns error if file does not exist.
- Reads full file and checks whether `old_string` exists; returns error if not found.
- In single-edit mode: if `replace_all=true`, replaces all occurrences and counts replacements; otherwise only first occurrence, count = 1.
- In batch mode: applies all edits in order in-memory and writes once. If any edit target is missing, the tool returns error and does not write partial changes.
- If content is unchanged after replacement, returns notice; otherwise overwrites file and returns count/path.
- Returns error message on exception.

## Output Example

`Replacement complete: file=/abs/path/file.ts edits=3 count=4`

## Notes

- Does not validate uniqueness; `replace_all=false` still replaces only the first match.
- Does not show diff or handle encoding/binary specifics.
