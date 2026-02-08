# Safety & Approvals

Memo uses an approval system to reduce risk when tools can modify files or execute commands.

## Default Approval Policy

Current default behavior is equivalent to `auto` mode:

- read-risk tools: auto-approved
- write-risk tools: require approval
- execute-risk tools: require approval

Special case:

- subagent tool family (`spawn_agent`, `send_input`, `resume_agent`, `wait`, `close_agent`) is auto-approved.

## Approval Options in TUI

When approval is required, you can choose:

- `Allow once`
- `Allow all session`
- `Reject this time`

## What "same request" means

Memo uses a fingerprint derived from:

- tool name
- tool parameters

If either changes, Memo treats it as a new approval target.

## Approval Lifetime

- `Allow once`: valid until current turn ends.
- `Allow all session`: valid for matching requests in the current session.
- `Reject this time`: rejects current request; matching requests remain non-auto-approved.

## Dangerous Mode

```bash
memo --dangerous
# or
memo -d
```

In dangerous mode, approval checks are bypassed.

Use only when:

- you trust the workspace and prompt scope
- you can review changes safely
- you understand potential command/file risks

## Plain Mode and Approvals

Plain mode cannot show interactive approval UI.

Result:

- approval-required tools are denied by default
- use TUI mode or `--dangerous` if you intentionally need execution/writes

## Recommended Safe Practices

- Keep a clean git status before high-impact runs.
- Ask Memo to plan changes before applying them.
- Limit allowed files and directories in prompts.
- Prefer read-only verification commands before mutating commands.
- Avoid `--dangerous` in sensitive or production-critical repositories.
