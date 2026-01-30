# Memo CLI `save_memory` Tool

Appends **user-related identity traits/preferences** to a local memory file (default `~/.memo/Agents.md`) for injection into system prompts in subsequent sessions.

## Basic Info

- Tool name: `save_memory`
- Description: Save user-related identity traits or preferences (e.g., language habits, tech preferences) for cross-session reuse. Do not save project-specific technical details or file structures.
- File: `packages/tools/src/tools/save_memory.ts`
- Confirmation: No

## Parameters

- `fact` (string, required): User-related identity traits or preferences, max 120 characters. Examples: "User prefers Chinese responses", "User is a frontend engineer". **Do not** store project-specific technical details, file structures, or business logic.

## Behavior

- Sanitizes input: replaces newlines with spaces, compresses whitespace, trims; errors if empty.
- Resolves storage path: prefers `MEMO_HOME` env var, otherwise `~/.memo/Agents.md`; recursively creates parent directories.
- Reads existing content (if exists), extracts entries after header `## Memo Added Memories` (prefix `- `).
- Appends new fact, keeps most recent 50, rewrites with header.
- Returns error on write failure; warnings during maintenance only printed to console.
- Returns path on success.

## Example Output

`Memory saved to: /Users/you/.memo/Agents.md`

## Notes

- Only maintains a single section, does not preserve other custom content.
- File is shared across processes, ensure write permissions to the path.
- **Important**: This tool is for storing user identity information, not project-specific technical details. Project context should be managed via `AGENTS.md` or the working directory for each session.
