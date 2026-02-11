# Memo CLI `apply_patch` Tool

Applies structured patches with add/update/delete operations.

## Basic Info

- Tool name: `apply_patch`
- Description: Apply file edits using Codex-style patch format
- File: `packages/tools/src/tools/apply_patch.ts`
- Confirmation: no

## Parameters

- `input` (string, required): patch text.

Patch must start with `*** Begin Patch` and end with `*** End Patch`. Supported operations:

- `*** Add File: <path>` with `+` lines
- `*** Delete File: <path>`
- `*** Update File: <path>` with hunks
- Optional move in update: `*** Move to: <new path>` (can appear before or after hunks)

## Patch Format

### Envelope

```
*** Begin Patch
... one or more operations ...
*** End Patch
```

### Operations

1. **Add file**: Creates a new file with the given content.
   ```
   *** Add File: path/to/file
   +line1
   +line2
   ```

2. **Delete file**: Removes an existing file.
   ```
   *** Delete File: path/to/file
   ```

3. **Update file**: Modifies an existing file using hunks.
   ```
   *** Update File: path/to/file
   @@ optional context description
   -line to remove
   +line to add
    unchanged line
   *** End of File (optional)
   ```

   Optional rename (Move to can appear before or after hunk context):
   ```
   *** Update File: path/to/file
   *** Move to: path/to/new-file
   @@ update renamed file
   +new content
   *** End of File
   ```

   Or Move to after hunk:
   ```
   *** Update File: path/to/file
   @@ update renamed file
   +new content
   *** Move to: path/to/new-file
   *** End of File
   ```

### Hunk Lines

Hunk lines must begin with one of:
- ` ` (space): unchanged context line
- `+`: added line
- `-`: removed line
- `*** End of File`: must appear alone on its own line (no additional text on the same line)

### Heredoc Syntax (Optional)

Content can use heredoc syntax:
```
*** Begin Patch
*** Add File: path/to/file
<<EOF
line1
line2
EOF
*** End Patch
```

Note: The `*** End of File` marker (if used) must be on its own line.

## Behavior

- Validates patch framing and operation grammar.
- Normalizes target paths to absolute paths.
- Enforces writable-root sandbox policy before mutating files.
- `add`: creates parent dirs and writes joined `+` lines.
- `delete`: removes the target file.
- `update`: loads file, applies each hunk by pattern matching, writes result.
- On move: writes updated content to target path and removes source file (when different).
- Returns `isError=true` on parse failures, sandbox denial, missing context, or I/O errors.

## Pattern Matching

Hunk matching uses a multi-strategy approach in order:
1. Exact line match
2. Trim-end match (ignores trailing whitespace)
3. Trim match (ignores leading/trailing whitespace)
4. Unicode loose match (normalizes unicode variants like em-dash, smart quotes, etc.)

If the expected context is not found, update fails with a descriptive error.

## Output Example

```
Success. Updated the following files:
A /path/to/new-file
M /path/to/modified-file
D /path/to/deleted-file
```

## Notes

- Tool is mutating and should be approval-gated in normal policy.
- Empty `oldLines` in hunk triggers insertion at end of file.
- Unicode normalization handles em-dashes (-–—), smart quotes, and various spaces.
