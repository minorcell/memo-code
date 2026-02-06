# Sessions and Logs (History / Sessions)

Memo writes session activity as a local JSONL event stream for context resume, debugging, and review.

## Session Log Location

Default directory:

- `~/.memo/sessions/`

Can be redirected with `MEMO_HOME` (see [Configuration](./configuration.md)).

File organization:

- Bucketed by current working directory (sanitized/truncated path)
- One JSONL per session: `YYYY-MM-DD_HHMMSS_<sessionId>.jsonl`

> Logs are only written when the session includes user messages, avoiding empty files.

## What Is Stored in JSONL?

Each line is one event object. Common events:

- `session_start` / `session_end`
- `turn_start` / `turn_end`
- `assistant` (model output)
- `action` (tool call)
- `observation` (tool result)
- `final` (final response)

You usually do not need every field; for troubleshooting, focus on `action/observation/final`.

## How to Resume History (`resume`)

Type in TUI input:

- `resume` (or `resume <keyword>`)

Memo shows matching history suggestions. When selected, it loads prior dialogue into current session context.

## Suggestions

- When reporting issues, sharing the relevant `.jsonl` path usually speeds up diagnosis.
- If context gets too long, use `/new` for a new session or lower cap with `/context`.
