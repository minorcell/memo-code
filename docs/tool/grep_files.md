# Memo CLI `grep_files` Tool

Finds files whose contents match a regex pattern.

## Basic Info

- Tool name: `grep_files`
- Description: ripgrep-backed file discovery by content match
- File: `packages/tools/src/tools/grep_files.ts`
- Confirmation: no

## Parameters

- `pattern` (string, required): regex pattern.
- `include` (string, optional): ripgrep `--glob` filter.
- `path` (string, optional): search path (resolved from current working directory).
- `limit` (integer, optional): max file paths returned; default `100`, hard cap `2000`.

## Behavior

- Executes `rg --files-with-matches --sortr=modified --regexp <pattern>`.
- Uses `--glob <include>` when provided.
- Uses 30s timeout.
- Exit code handling:
    - `0`: returns matching file paths
    - `1`: returns `No matches found.`
    - other: returns `isError=true`
- Returns `isError=true` when `rg` is unavailable or command fails.

## Output Example

```text
/abs/repo/src/a.ts
/abs/repo/src/b.ts
```

## Notes

- Requires system `rg` in PATH.
- Output is path list only (no line snippets).
