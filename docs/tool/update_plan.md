# Memo CLI `update_plan` Tool

Stores and updates an in-session plan state.

## Basic Info

- Tool name: `update_plan`
- Description: update structured plan with pending/in_progress/completed statuses
- File: `packages/tools/src/tools/update_plan.ts`
- Confirmation: no

## Parameters

- `explanation` (string, optional): context text for current plan revision.
- `plan` (array, required): list of plan items:
    - `step` (string, required)
    - `status` (`pending` | `in_progress` | `completed`, required)

## Behavior

- Validates there is at most one `in_progress` item.
- Replaces current in-memory plan with provided list.
- Returns JSON payload containing message, explanation, and plan.
- Returns `isError=true` on validation failure.

## Output Example

```json
{
    "message": "Plan updated",
    "explanation": "Implement parser then tests",
    "plan": [
        { "step": "Implement parser", "status": "in_progress" },
        { "step": "Add tests", "status": "pending" }
    ]
}
```

## Notes

- Plan state is process-local and non-persistent.
