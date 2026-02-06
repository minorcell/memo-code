# Memo CLI `grep` Tool

Searches text using ripgrep, supports content output, file-only output, or count output.

## Basic Info

- Tool name: `grep`
- Description: search text via ripgrep with content/file-list/count modes
- File: `packages/tools/src/tools/grep.ts`
- Confirmation: no

## Parameters

- `pattern` (string, required): regex pattern to search.
- `path` (string, optional): search root directory, defaults to current working directory.
- `output_mode` (enum, optional): `content` (default, with line numbers), `files_with_matches` (file list only), `count` (counts).
- `glob` (string, optional): additional `--glob` filter.
- `-i` (boolean, optional): case-insensitive search.
- `-A`/`-B`/`-C` (non-negative integer, optional): context lines (after/before/both).

## Behavior

- Requires system `rg`; returns error if not installed.
- Builds `rg` args:
    - `--line-number --no-heading` for `content`
    - `-l` for `files_with_matches`
    - `-c` for `count`
    - color disabled
- Runs `rg` with `pattern` and `path`, collects stdout/stderr.
- Exit code 2 is treated as error; exit code 1 with empty output means no match; otherwise returns output.
- Returns error message on exception.

## Output Example (`content` mode)

```text
src/index.ts:12: const x = 1;
src/index.ts:18: console.log(x);
```

## Notes

- Directly depends on external `rg` binary available in PATH.
- No pagination; large matches are returned in one response.
