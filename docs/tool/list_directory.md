# Memo CLI `list_directory` Tool

Lists direct children of a directory.

## Basic Info

- Tool name: `list_directory`
- Description: list one directory level with type labels
- File: `packages/tools/src/tools/list_directory.ts`
- Confirmation: no

## Parameters

- `path` (string, required): directory path.

## Behavior

- Validates directory path against allowed roots.
- Reads direct entries only (non-recursive).
- Output line format:
    - `[DIR] name`
    - `[FILE] name`

## Output Example

```text
[DIR] src
[FILE] package.json
```
