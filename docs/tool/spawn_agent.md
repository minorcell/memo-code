# Memo CLI `spawn_agent` Tool

Creates a real subagent task process and returns its id.

## Basic Info

- Tool name: `spawn_agent`
- Description: spawn subagent task and return `agent_id` / `submission_id`
- File: `packages/tools/src/tools/collab.ts`
- Confirmation: no

## Parameters

- `message` (string, required): initial task message.
- `agent_type` (string, optional): reserved compatibility field.

## Behavior

- Creates/starts a subagent submission immediately.
- Returns JSON like:
    - `agent_id`: stable id for the agent
    - `submission_id`: current run id
    - `status`: initial status (`running`)
- Fails when concurrent running agents exceed `MEMO_SUBAGENT_MAX_AGENTS`.

## Notes

- Tool is enabled by default; set `MEMO_ENABLE_COLLAB_TOOLS=0` to disable collab tools.
- Runtime command is controlled by `MEMO_SUBAGENT_COMMAND` (default uses `memo --dangerous` fallback).
