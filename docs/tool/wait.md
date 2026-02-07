# Memo CLI `wait` Tool

Waits for subagents to reach a final state.

## Basic Info

- Tool name: `wait`
- Description: wait for final subagent statuses
- File: `packages/tools/src/tools/collab.ts`
- Confirmation: no

## Parameters

- `ids` (string array, required): one or more agent ids.
- `timeout_ms` (integer, optional): wait timeout in ms.

## Behavior

- Polls listed ids until at least one becomes final, or timeout.
- Timeout is clamped to `[10000, 300000]` ms; default is `30000` ms.
- Response shape:
    - `status`: map of `id -> final_status` (only final entries included)
    - `details`: map of `id -> detail` (same ids as `status`)
        - `status`: final status
        - `last_message`: latest message sent to the agent
        - `last_output`: final stdout/stderr summary for the latest submission
        - `last_error`: error summary (if any)
        - `last_submission_id`: latest submission id
        - `updated_at`: record update time
    - `timed_out`: whether timeout happened before any final status
- Final statuses: `completed`, `errored`, `closed`, `not_found`.
