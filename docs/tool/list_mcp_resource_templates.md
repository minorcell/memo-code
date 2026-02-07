# Memo CLI `list_mcp_resource_templates` Tool

Lists MCP resource templates.

## Basic Info

- Tool name: `list_mcp_resource_templates`
- Description: list MCP resource templates globally or from one server
- File: `packages/tools/src/tools/mcp_resources.ts`
- Confirmation: no

## Parameters

- `server` (string, optional): target server name.
- `cursor` (string, optional): pagination cursor (only valid when `server` is set).

## Behavior

- Requires active MCP pool.
- With `server`:
    - verifies server exists
    - calls server `listResourceTemplates(cursor?)`
    - returns `{ server, resourceTemplates, nextCursor }`
- Without `server`:
    - rejects `cursor`
    - aggregates templates from all connected servers
    - returns `{ resourceTemplates: [{ server, ...template }] }`
- Returns `isError=true` on missing pool/server or call failure.
