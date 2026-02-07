# Memo CLI `close_agent` Tool

Closes an existing subagent and terminates running work.

## Basic Info

- Tool name: `close_agent`
- Description: close subagent by id
- File: `packages/tools/src/tools/collab.ts`
- Confirmation: no

## Parameters

- `id` (string, required): agent id.

## Behavior

- Looks up agent by id.
- If a submission is running, terminates it before returning.
- Sets status to `closed`.
- Returns JSON with `agent_id` and `status`.
- Returns `isError=true` when id is unknown.
