# Memo CLI `spawn_agent` Tool

Creates an in-process sub-agent record for collaboration workflows.

## Basic Info

- Tool name: `spawn_agent`
- Description: spawn sub-agent and return id/status
- File: `packages/tools/src/tools/collab.ts`
- Confirmation: no

## Parameters

- `message` (string, required): initial task message.
- `agent_type` (string, optional): reserved compatibility field.

## Behavior

- Generates UUID id.
- Creates record `{ id, createdAt, lastMessage, status: "running" }` in memory.
- Returns full record as JSON text.

## Notes

- Tool is available only when `MEMO_ENABLE_COLLAB_TOOLS=1`.
