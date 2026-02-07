# Memo CLI `resume_agent` Tool

Marks a closed agent record as running again.

## Basic Info

- Tool name: `resume_agent`
- Description: resume existing agent by id
- File: `packages/tools/src/tools/collab.ts`
- Confirmation: no

## Parameters

- `id` (string, required): agent id.

## Behavior

- Looks up agent by id.
- Sets `status` to `running`.
- Returns updated record JSON.
- Returns `isError=true` when id is unknown.
