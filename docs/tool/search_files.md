# Memo CLI `search_files` Tool

Recursively searches under a root path using glob pattern matching.

## Basic Info

- Tool name: `search_files`
- Description: recursive glob path match with optional excludes
- File: `packages/tools/src/tools/search_files.ts`
- Confirmation: no

## Parameters

- `path` (string, required): search root path.
- `pattern` (string, required): glob pattern matched against relative paths.
- `excludePatterns` (string[], optional): glob patterns to exclude.

## Behavior

- Validates root path and each traversed path with shared filesystem security.
- Matches against paths relative to input `path`.
- Returns matching absolute paths, one per line.
- Returns `No matches found` when nothing matches.

## Output Example

```text
/repo/src/main.ts
/repo/src/utils/fs.ts
```
