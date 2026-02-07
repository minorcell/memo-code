# Memo CLI `read_file` Tool

Reads local files with numbered lines. Supports simple slicing and indentation-aware block extraction.

## Basic Info

- Tool name: `read_file`
- Description: read local file with line numbers and optional indentation mode
- File: `packages/tools/src/tools/read_file.ts`
- Confirmation: no

## Parameters

- `file_path` (string, required): absolute path only.
- `offset` (integer, optional): 1-indexed starting line; default `1`.
- `limit` (integer, optional): max lines; default `200`.
- `mode` (optional): `slice` (default) or `indentation`.
- `indentation` (object, optional; used with `mode=indentation`):
    - `anchor_line` (integer)
    - `max_levels` (integer >= 0)
    - `include_siblings` (boolean)
    - `include_header` (boolean)
    - `max_lines` (integer)

## Behavior

- Rejects non-absolute paths.
- Clips each displayed line to 500 chars.
- Output format: `L<line_number>: <text>`.
- `slice` mode returns `[offset, offset+limit)`.
- `indentation` mode expands around anchor line by indentation boundaries.
- Returns `isError=true` for invalid ranges, missing files, or read failures.

## Output Example

```text
L12: export function foo() {
L13:   return 1
L14: }
```

## Notes

- Tabs are treated as indentation width 4.
- Empty file returns empty text payload.
