# Memo CLI `send_input` Tool

Sends a follow-up message to an existing subagent and starts a new submission.

## Basic Info

- Tool name: `send_input`
- Description: submit input to existing subagent
- File: `packages/tools/src/tools/collab.ts`
- Confirmation: no

## Parameters

- `id` (string, required): agent id.
- `message` (string, required): new message.
- `interrupt` (boolean, optional): when true, interrupts current running submission first.

## Behavior

- Looks up agent by id.
- If agent is running and `interrupt` is not true, returns busy error.
- If `interrupt=true`, terminates current submission, then starts the new one.
- Returns JSON with `agent_id`, `status`, and new `submission_id`.
- Returns `isError=true` when id is unknown.
