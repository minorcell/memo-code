# Memo CLI `resume_agent` Tool

Reopens a previously closed subagent.

## Basic Info

- Tool name: `resume_agent`
- Description: resume existing agent by id
- File: `packages/tools/src/tools/collab.ts`
- Confirmation: no

## Parameters

- `id` (string, required): agent id.

## Behavior

- Looks up agent by id.
- If status is `closed`, restores the pre-close status.
- Does not start a new submission by itself; use `send_input` for new work.
- Returns JSON with `agent_id` and current `status`.
- Returns `isError=true` when id is unknown.
