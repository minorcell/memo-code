# Memo CLI `read_files` Tool

Reads multiple text files in one call.

## Basic Info

- Tool name: `read_files`
- Description: batch read text files; per-file failures do not stop the batch
- File: `packages/tools/src/tools/read_files.ts`
- Confirmation: no

## Parameters

- `paths` (string[], required): list of file paths.

## Behavior

- Iterates in input order.
- Each file is validated with shared filesystem rules.
- If one file fails, returns `<path>: Error - <message>` for that item and continues.
- Results are separated by `---`.

## Output Example

```text
/repo/a.txt:
alpha

---
/repo/b.txt: Error - ENOENT: no such file or directory
```
