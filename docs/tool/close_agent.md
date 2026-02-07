# Memo CLI `close_agent` Tool

Closes an agent record.

## Basic Info

- Tool name: `close_agent`
- Description: set agent status to closed
- File: `packages/tools/src/tools/collab.ts`
- Confirmation: no

## Parameters

- `id` (string, required): agent id.

## Behavior

- Looks up agent by id.
- Sets `status` to `closed`.
- Returns updated record JSON.
- Returns `isError=true` when id is unknown.
