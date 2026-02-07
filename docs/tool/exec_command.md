# Memo CLI `exec_command` Tool

Starts a managed shell session and returns output chunks. Can continue later with `write_stdin`.

## Basic Info

- Tool name: `exec_command`
- Description: run command in managed session and return output or running session id
- File: `packages/tools/src/tools/exec_command.ts`
- Confirmation: no

## Parameters

- `cmd` (string, required): command string to run.
- `workdir` (string, optional): working directory (resolved from current cwd).
- `shell` (string, optional): shell binary override.
- `login` (boolean, optional): login shell behavior.
- `tty` (boolean, optional): accepted for compatibility.
- `yield_time_ms` (integer, optional): wait window before returning output.
- `max_output_tokens` (integer, optional): output cap (character-truncated by token estimate).
- `sandbox_permissions` / `justification` / `prefix_rule` (optional): compatibility fields for approval flows.

## Behavior

- Spawns a shell command process and records session state.
- Returns formatted response with chunk metadata and output.
- If process is still running after yield window, response includes session id and running status.
- If process exits, response includes exit code.

## Output Example

```text
Chunk ID: abc123
Wall time: 1.2345 seconds
Process running with session ID 7
Original token count: 42
Output:
...
```

## Notes

- Pair with `write_stdin` for interactive commands.
- Tool is execution-risk and should be approval-gated.
