# Memo CLI `read` Tool

Reads target file content, with optional line slicing by range and numbered output.

## Basic Info

- Tool name: `read`
- Description: read file content with optional offset/limit and line numbers
- File: `packages/tools/src/tools/read.ts`
- Confirmation: no

## Parameters

- `file_path` (string, required): target file path (normalized to absolute path).
- `offset` (positive integer, optional): start line (1-based), default 1.
- `limit` (positive integer, optional): max number of lines to read, default reads to file end.

## Behavior

- Resolves absolute path with `normalizePath`; returns error if file does not exist.
- Reads text content and splits by `\r?\n`.
- Slices from `offset` to `offset + limit` (bounded by file end), prefixes each line with 1-based line number.
- Returns joined text; on exception, returns error message.

## Output Example

```text
1: first line
2: second line
```

## Notes

- No binary-file detection. Binary content is still processed as text lines.
