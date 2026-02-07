# Memo CLI `write_stdin` Tool

Continues an existing `exec_command` session by sending stdin bytes and collecting new output.

## Basic Info

- Tool name: `write_stdin`
- Description: write stdin to managed exec session and fetch recent output
- File: `packages/tools/src/tools/write_stdin.ts`
- Confirmation: no

## Parameters

- `session_id` (integer, required): target exec session id.
- `chars` (string, optional): text to write to stdin.
- `yield_time_ms` (integer, optional): wait window before reading output.
- `max_output_tokens` (integer, optional): output cap.

## Behavior

- Looks up session by `session_id`.
- Writes `chars` when session is still running.
- Waits for output/exit window and returns formatted chunk.
- Returns `isError=true` if session does not exist.

## Output Example

```text
Chunk ID: def456
Wall time: 2.0100 seconds
Process exited with code 0
Original token count: 20
Output:
interactive response
```

## Notes

- Use empty `chars` to poll output only.
- Session lifecycle is managed in-memory.
