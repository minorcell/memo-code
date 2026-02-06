# Memo CLI `todo` Tool

Maintains an in-process todo list with add/replace/update/remove operations. Maximum 10 items, non-persistent.

## Basic Info

- Tool name: `todo`
- Description: manage todo list (`add`/`update`/`remove`/`replace`), max 10 items, not persisted
- File: `packages/tools/src/tools/todo.ts`
- Confirmation: no

## Parameters

Uses a discriminated union:

- `type`: `add` / `replace` / `update` / `remove`.
- For `type=add`: `todos` is an array of tasks to add. Each item must include `content`, `status` (`pending`/`in_progress`/`completed`), `activeForm`; array length 1-10.
- For `type=replace`: same structure as add, but existing tasks are cleared and replaced.
- For `type=update`: each todo item additionally requires `id` (existing task id), no duplicates, length 1-10.
- For `type=remove`: `ids` is an array of strings, length >=1.
- Field constraints: `content` 1-100 chars, `activeForm` 1-120 chars.

## Behavior

- All state is in process memory only; cleared when process exits.
- `add`: returns error if list would exceed 10 items; otherwise generates `id` and appends.
- `replace`: clears and replaces with new list (still max 10).
- `update`: validates existing/non-duplicate ids and updates content/status/activeForm.
- `remove`: removes given ids; returns error if none matched.
- Returns a JSON string with current list and operation metadata (`op/count/tasks/added/updated/removed/replaced`).
- Invalid rules or runtime exceptions return error messages.

## Output Example

`{"op":"add","count":2,"tasks":[{"id":"...","content":"do A","status":"pending","activeForm":"task A"}],"added":[...],"updated":null,"removed":null,"replaced":false}`

## Notes

- No persistence and no concurrency lock; suitable for short-lived, single-process todo tracking.
- Upper layers should keep returned `id` values for subsequent updates/removals.
