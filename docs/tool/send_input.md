# Memo CLI `send_input` Tool

Sends a follow-up message to a spawned agent record.

## Basic Info

- Tool name: `send_input`
- Description: update last message for existing agent
- File: `packages/tools/src/tools/collab.ts`
- Confirmation: no

## Parameters

- `id` (string, required): agent id.
- `message` (string, required): new message.
- `interrupt` (boolean, optional): compatibility field.

## Behavior

- Looks up agent by id.
- Updates `lastMessage`.
- Returns updated record JSON.
- Returns `isError=true` when id is unknown.
