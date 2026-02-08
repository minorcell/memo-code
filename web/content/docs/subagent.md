# Multi-Agent (Subagent)

Subagents let Memo split large tasks into smaller parallel jobs and collect results back into the main session.

## What Subagents Are

A subagent is a child Memo run created by the current session to execute a scoped task.

Subagent tool family:

- `spawn_agent`
- `send_input`
- `resume_agent`
- `wait`
- `close_agent`

## When to Use

Good use cases:

- parallel audits across multiple folders
- independent investigations (errors, tests, logs)
- large tasks that can be decomposed cleanly

Not ideal:

- tiny single-file edits
- tasks requiring strict step-by-step dependency

## Enable / Disable

Enabled by default.

Disable all subagent tools:

```bash
export MEMO_ENABLE_COLLAB_TOOLS=0
```

Common tuning:

```bash
export MEMO_SUBAGENT_COMMAND="memo --dangerous"
export MEMO_SUBAGENT_MAX_AGENTS=4
```

Defaults:

- max concurrent running subagents: `4`
- spawn command:
    - `MEMO_SUBAGENT_COMMAND` if set
    - otherwise `node <cwd>/dist/index.js --dangerous` if `dist/index.js` exists
    - otherwise `memo --dangerous`

## Lifecycle

Typical flow:

1. `spawn_agent` to create an agent and start its first submission.
2. `wait` to poll until one target agent reaches a final status.
3. `send_input` to continue the same agent.
4. `close_agent` when done.
5. `resume_agent` only if you need to reopen a closed agent record.

## Behavior Notes

### `spawn_agent`

- starts immediately with `message`
- fails if running-agent count reaches `MEMO_SUBAGENT_MAX_AGENTS`

### `send_input`

- fails with busy error if agent is running
- use `interrupt=true` to cancel current submission and send new input

### `wait`

- timeout range is clamped to `10s` to `300s`
- default timeout is `30s`
- returns only final statuses in `status/details`
- returns `timed_out=true` if none reached final state before timeout

### `close_agent`

- marks agent as `closed`
- terminates running submission if present

### `resume_agent`

- reopens closed status
- does not start a new submission by itself

## Status Values

Main statuses:

- `running`
- `completed`
- `errored`
- `closed`

`wait` may also report `not_found` for unknown IDs.

## Safety

Subagent tools are auto-approved by default, so task scoping matters.

Recommended:

- keep prompts specific and bounded
- set clear deliverables per subagent
- close unused agents to reduce noise and resource usage
