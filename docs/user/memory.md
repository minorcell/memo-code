# Long-term Memory

Memo keeps memory in a local file and exposes it through the read-only `get_memory` tool.

## Memory File Location

Default:

- `~/.memo/Agents.md`

You can relocate it with `MEMO_HOME` (see [Configuration](./configuration.md)).

## Current Behavior

- `get_memory` reads the memory file and returns its content as `memory_summary`.
- Memory content is **not auto-injected** into the system prompt.
- To change memory, edit `Agents.md` directly or use your own custom/MCP write tool.

## What to Store

Suitable:

- Language preferences (for example, "User prefers Chinese responses")
- Technical preferences (for example, "User prefers TypeScript")
- Output preferences (for example, "Keep answers concise")

Not suitable:

- Project structure or repo implementation details (use project `AGENTS.md` instead)
- Secrets/tokens/personal sensitive information

## Related Docs

- Tool details: `docs/tool/get_memory.md`
- Project-level conventions: `AGENTS.md` inside the repository
