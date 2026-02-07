# Memo CLI `shell_command` Tool

Executes shell commands using string form.

## Basic Info

- Tool name: `shell_command`
- Description: run shell command string and return output
- File: `packages/tools/src/tools/shell_command.ts`
- Confirmation: no

## Parameters

- `command` (string, required): command string.
- `workdir` (string, optional): working directory.
- `login` (boolean, optional): login shell mode.
- `timeout_ms` (integer, optional): mapped to output wait window.
- `sandbox_permissions` / `justification` / `prefix_rule` (optional): compatibility fields.

## Behavior

- Runs command through managed exec runtime.
- Returns same chunk metadata format as `exec_command`.
- Returns `isError=true` on runtime errors.

## Notes

- Enabled when `MEMO_SHELL_TOOL_TYPE=shell_command`.
