# Sessions & History

Memo writes session events to local JSONL files for resume, debugging, and auditability.

## Storage Location

Default base directory:

- `~/.memo/sessions/`

If `MEMO_HOME` is set:

- `$MEMO_HOME/sessions/`

Date-partitioned structure:

- `YYYY/MM/DD/rollout-YYYY-MM-DDTHH-MM-SS-<sessionId>.jsonl`

## Event Types in JSONL

Common event types:

- `session_start`
- `turn_start`
- `assistant`
- `action`
- `observation`
- `final`
- `turn_end`
- `session_end`

For debugging, `action` + `observation` + `final` are usually most useful.

## Resume Behavior in TUI

Type in input:

- `resume`
- `resume <keyword>`
- `/resume`

Then choose an entry from suggestions.

Current behavior:

- suggestions are filtered to sessions whose recorded `cwd` matches current working directory
- selecting one loads historical conversation context into current session
- the current active session file is excluded from resume suggestions

## Practical Tips

- Share relevant `.jsonl` path when asking others to investigate behavior.
- If context gets too large, start fresh with `/new`.
- Use `/context` to choose a smaller or larger context limit when needed.

## Privacy Note

Session logs can include:

- user prompts
- assistant outputs
- tool parameters
- tool output excerpts

Review and redact before sharing logs externally.

## Optional Cleanup

Example cleanup command:

```bash
find ~/.memo/sessions -type f -name '*.jsonl' -mtime +90 -delete
```
