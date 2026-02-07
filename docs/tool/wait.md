# Memo CLI `wait` Tool

Returns status snapshots for one or more agent ids.

## Basic Info

- Tool name: `wait`
- Description: fetch current statuses for listed agents
- File: `packages/tools/src/tools/collab.ts`
- Confirmation: no

## Parameters

- `ids` (string array, required): one or more agent ids.
- `timeout_ms` (integer, optional): compatibility field (currently not used).

## Behavior

- For each id, returns `{ id, status, lastMessage }`.
- Unknown ids are treated as `status: "closed"` with empty `lastMessage`.
- Response shape: `{ statuses: [...] }`.
