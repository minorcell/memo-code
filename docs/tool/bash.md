# Memo CLI `bash` Tool

Executes arbitrary bash commands and returns exit/stdout/stderr. Mainly for debugging and scripting (safety is controlled by upper layers).

## Basic Info

- Tool name: `bash`
- Description: run command in shell and return exit/stdout/stderr
- File: `packages/tools/src/tools/bash.ts`
- Confirmation: no

## Parameters

- `command` (string, required): full command to execute.

## Behavior

- Runs `bash -lc <command>` in current environment and inherits process `env`.
- Captures stdout/stderr and waits for child process exit.
- Returns one-line text: `exit=<code> stdout="<...>" stderr="<...>"`.
- Any exception (for example spawn failure) returns an error message with `isError=true`.

## Output Example

`exit=0 stdout="hello\n" stderr=""`

## Notes

- No command safety validation inside this tool; upper layers should control allowed commands.
- Blank `command` is rejected and not executed.
