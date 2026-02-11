# Memo CLI `apply_patch` Tool

Edits a file by direct string replacement.

## Basic Info

- Tool name: `apply_patch`
- Description: Edit a local file by direct string replacement. Supports single replacement fields or batch edits.
- File: `packages/tools/src/tools/apply_patch.ts`
- Confirmation: no

## Parameters

Use one of the following modes:

1. Single replacement mode

- `file_path` (string, required): target file path
- `old_string` (string, required)
- `new_string` (string, required)
- `replace_all` (boolean, optional, default `false`)

2. Batch replacement mode

- `file_path` (string, required)
- `edits` (array, required)

Each item in `edits`:

- `old_string` (string, required)
- `new_string` (string, required)
- `replace_all` (boolean, optional)

Do not mix `edits` with `old_string/new_string` in the same request.

## Behavior

- Normalizes target paths to absolute paths.
- Enforces writable-root sandbox policy before writing.
- Reads the file once, applies replacements in order, writes once.
- Batch edits are atomic: if any edit cannot find its target text, no file changes are written.
- Returns `isError=true` for missing files, sandbox denial, invalid input, or failed replacements.

## Output Example

Success:

```
Success. Updated file: /path/to/file.txt
Edits: 2
Replacements: 3
```

Failure:

```
apply_patch failed: target text not found at edit 2.
```
