# Memo CLI `get_memory` Tool

Reads memory payload from local `Agents.md` and returns it in structured JSON.

## Basic Info

- Tool name: `get_memory`
- Description: Loads stored memory payload for a `memory_id`
- File: `packages/tools/src/tools/get_memory.ts`
- Confirmation: no

## Parameters

- `memory_id` (string, required): caller-provided memory key (must be non-empty).

## Behavior

- Resolves memory file path:
    - `MEMO_HOME/Agents.md` when `MEMO_HOME` is set
    - otherwise `~/.memo/Agents.md`
- Reads file as UTF-8 text.
- Returns JSON payload:
    - `memory_id`: echoes input id
    - `memory_summary`: full file content
- If file is missing/unreadable, returns `isError=true` with:
    - `memory not found for memory_id=<id>`

## Output Example

```json
{
    "memory_id": "thread-1",
    "memory_summary": "## Memo Added Memories\n\n- User prefers concise output\n"
}
```

## Notes

- Current implementation is read-only; it does not modify memory content.
- `memory_id` is currently used as request context/echo and does not select separate memory files.
