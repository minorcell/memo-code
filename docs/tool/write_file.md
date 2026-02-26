# Memo CLI `write_file` Tool

Creates or overwrites a text file.

## Basic Info

- Tool name: `write_file`
- Description: atomically write UTF-8 content
- File: `packages/tools/src/tools/write_file.ts`
- Confirmation: yes

## Parameters

- `path` (string, required): target file path.
- `content` (string, required): UTF-8 content.

## Behavior

- Validates target path against allowed roots first.
- Uses temporary file + rename to preserve atomic replace semantics.
- Returns success text on completion.
- Returns `isError=true` on validation or write failures.

## Output Example

```text
Successfully wrote to /repo/notes/todo.txt
```
