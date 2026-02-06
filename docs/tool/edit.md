# Memo CLI `edit` Tool

Replaces target text in a file, with optional global replacement.

## Basic Info

- Tool name: `edit`
- Description: replace text in file, supports `replace_all`
- File: `packages/tools/src/tools/edit.ts`
- Confirmation: no

## Parameters

- `file_path` (string, required): target file path (normalized to absolute path).
- `old_string` (string, required): source text to replace.
- `new_string` (string, required): replacement text.
- `replace_all` (boolean, optional): whether to replace all occurrences; default is single replacement.

## Behavior

- Returns error if file does not exist.
- Reads full file and checks whether `old_string` exists; returns error if not found.
- If `replace_all=true`, replaces all occurrences and counts replacements; otherwise only first occurrence, count = 1.
- If content is unchanged after replacement, returns notice; otherwise overwrites file and returns count/path.
- Returns error message on exception.

## Output Example

`Replacement complete: file=/abs/path/file.ts count=2`

## Notes

- Does not validate uniqueness; `replace_all=false` still replaces only the first match.
- Does not show diff or handle encoding/binary specifics.
