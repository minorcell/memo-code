# Memo CLI `list_dir` Tool

Lists directory entries with lightweight type markers.

## Basic Info

- Tool name: `list_dir`
- Description: list local directory entries with depth/offset/limit controls
- File: `packages/tools/src/tools/list_dir.ts`
- Confirmation: no

## Parameters

- `dir_path` (string, required): absolute directory path.
- `offset` (integer, optional): 1-indexed entry offset; default `1`.
- `limit` (integer, optional): max returned entries; default `25`.
- `depth` (integer, optional): traversal depth; default `2`.

## Behavior

- Rejects non-absolute paths.
- Traverses directory tree breadth-first up to `depth`.
- Sorts each directory's children by name.
- Prefixes output with `Absolute path: <root>`.
- Entry suffixes:
    - `/` directory
    - `@` symlink
    - `?` other file types
- Returns `isError=true` when offset exceeds total entries or on I/O failures.

## Output Example

```text
Absolute path: /repo
src/
package.json
  index.ts
```

## Notes

- `depth=1` lists only direct children.
- When there are more entries than `limit`, output appends `More than <limit> entries found`.
