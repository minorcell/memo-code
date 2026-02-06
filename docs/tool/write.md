# Memo CLI `write` Tool

Creates or overwrites file content and recursively creates parent directories when needed.

## Basic Info

- Tool name: `write`
- Description: create or overwrite file using `file_path` and `content`
- File: `packages/tools/src/tools/write.ts`
- Confirmation: no

## Parameters

- `file_path` (string, required): target path to write (normalized to absolute path).
- `content` (optional): content to write. Supports string, number, boolean, null, array, object, `Uint8Array`, `ArrayBuffer`.

## Behavior

- Normalizes path via `normalizePath`; recursively creates parent directories.
- Content normalization:
    - string: write as-is
    - `Uint8Array`/`ArrayBuffer`: write as binary
    - other types: serialize to formatted JSON
- Calls `fs.writeFile` to overwrite target file and returns write info (text length or byte size).
- Returns error message on exception.

## Output Example

`Wrote /abs/path/file.txt (overwrite, text_length=12)`

## Notes

- Always overwrites; no diff check.
- If `content` is omitted, an empty string value is serialized.
