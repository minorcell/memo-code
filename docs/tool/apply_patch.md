# Memo CLI `apply_patch` Tool

Applies structured patch text to local files.

## Basic Info

- Tool name: `apply_patch`
- Description: Apply a structured patch envelope (`*** Begin Patch` ... `*** End Patch`) with Add/Delete/Update hunks.
- File: `packages/tools/src/tools/apply_patch.ts`
- Confirmation: no

## Parameters

- `input` (string, required): full patch text.

Patch format:

```
*** Begin Patch
*** Add File: path/to/file
+line
*** Update File: path/to/existing
*** Move to: path/to/new
@@ optional context
-old line
+new line
*** Delete File: path/to/delete
*** End Patch
```

## Behavior

- Supports `Add File`, `Delete File`, `Update File`, optional `Move to`, `@@` chunks, and `*** End of File`.
- Requires relative file paths (absolute paths are rejected).
- Resolves paths against runtime cwd and enforces writable-root sandbox policy.
- Computes update replacements with tolerant matching (`exact` -> `trimEnd` -> `trim` -> normalized unicode punctuation).
- Returns `isError=true` for parse failures, missing files/context, sandbox denial, or invalid input.

## Output Example

Success:

```
Success. Updated the following files:
A nested/new.txt
M src/app.ts
D obsolete.txt
```

Failure:

```
Invalid patch hunk on line 4: Expected update hunk to start with a @@ context marker, got: '...'
```
