# Memo CLI `read_media_file` Tool

Reads an image/audio file and returns base64 payload metadata.

## Basic Info

- Tool name: `read_media_file`
- Description: read binary media and return JSON string in text payload
- File: `packages/tools/src/tools/read_media_file.ts`
- Confirmation: no

## Parameters

- `path` (string, required): media file path within allowed roots.

## Behavior

- Uses shared filesystem validation before reading.
- Infers MIME type from extension, falls back to `application/octet-stream`.
- Returns JSON string with fixed fields: `type`, `mimeType`, `data`.
- `type` is `image`, `audio`, or `blob`.

## Output Example

```json
{ "type": "image", "mimeType": "image/png", "data": "iVBORw0KGgo..." }
```
