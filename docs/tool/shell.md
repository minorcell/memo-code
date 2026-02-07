# Memo CLI `shell` Tool

Executes shell commands using argv form.

## Basic Info

- Tool name: `shell`
- Description: run shell command from argv array
- File: `packages/tools/src/tools/shell.ts`
- Confirmation: no

## Parameters

- `command` (string array, required): argv-style command.
- `workdir` (string, optional): working directory.
- `timeout_ms` (integer, optional): mapped to output wait window.
- `sandbox_permissions` / `justification` / `prefix_rule` (optional): compatibility fields.

## Behavior

- Escapes argv into a command string.
- Runs through managed exec runtime (`login=false`).
- Returns same chunk metadata format as `exec_command`.
- Returns `isError=true` on runtime errors.

## Notes

- Enabled when `MEMO_SHELL_TOOL_TYPE=shell`.
