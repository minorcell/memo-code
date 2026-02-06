# Long-term Memory

Memo can store user preferences/profile info in a local memory file and inject it into future system prompts for more consistent behavior.

## Memory File Location

Default:

- `~/.memo/Agents.md`

You can relocate it with `MEMO_HOME` (see [Configuration](./configuration.md)).

## What `save_memory` Should Store

Suitable:

- Language preferences: for example, "User prefers Chinese responses"
- Technical preferences: for example, "User prefers TypeScript" or "leans functional style"
- Output preferences: for example, "Keep answers concise, conclusion first"

Not suitable (do not store):

- Project structure/business logic/repo details (put these in project `AGENTS.md`)
- Secrets/tokens/personal sensitive information

## How It Is Used in Practice

Usually you only need to state your preference in chat; the model may call `save_memory` when appropriate.

If you want explicit memory capture, say something like:

- "Please remember: I want all responses in Chinese and as concise as possible."

## Related Docs

- Tool details: `docs/tool/save_memory.md`
- Project-level conventions: `AGENTS.md` inside the repository
