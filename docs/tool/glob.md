# Memo CLI `glob` Tool

Scans directories by glob pattern and returns a list of matched absolute paths.

## Basic Info

- Tool name: `glob`
- Description: match files by glob pattern and return absolute paths
- File: `packages/tools/src/tools/glob.ts`
- Confirmation: no

## Parameters

- `pattern` (string, required): glob pattern (for example `src/**/*.ts`).
- `path` (string, optional): scan root directory; defaults to current working directory.

## Behavior

- Uses `fast-glob` with specified `cwd`.
- Normalizes all matches to absolute paths and returns newline-separated output in discovery order.
- If no match, returns `No matching files found`.
- Returns error message on exception.

## Output Example

```text
/abs/workspace/src/a.ts
/abs/workspace/src/sub/b.ts
```

## Notes

- Does not automatically ignore directories like `node_modules`; filter through pattern if needed.
