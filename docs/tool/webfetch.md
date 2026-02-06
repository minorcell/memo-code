# Memo CLI `webfetch` Tool

Performs restricted HTTP GET and returns processed plain-text body preview (HTML tags stripped), with timeout and size limits.

## Basic Info

- Tool name: `webfetch`
- Description: HTTP GET that returns cleaned plain-text body preview (auto-strips HTML)
- File: `packages/tools/src/tools/webfetch.ts`
- Confirmation: no

## Parameters

- `url` (string, required): full request URL. Supported schemes: `http:`, `https:`, `data:`.

## Behavior

- Validates URL and scheme; unsupported/invalid URL is rejected.
- 10-second timeout via AbortController.
- Body size cap 512000 bytes:
    - rejects early if `content-length` exceeds limit
    - aborts during stream read if limit is exceeded
- For HTML responses, strips content:
    - removes `<script>/<style>`
    - converts block elements and line breaks to newlines
    - prefixes `<li>` with `- `
    - removes other tags
    - decodes common entities and compresses extra whitespace/blank lines
- Non-HTML content is `trim`med directly.
- Preview text max length is 4000 chars; longer text is truncated with `text_truncated=true`.
- Return format:
    - `status=<code> bytes=<len> text_chars=<chars> text="<preview>" [text_truncated=true] [source=html_stripped]`
- Timeout/abort/fetch errors return `isError=true` with error message.

## Output Example

`status=200 bytes=10240 text_chars=3800 text="Example content..." source=html_stripped`

## Notes

- GET only. No custom headers. Redirect/compression details are not specially handled.
- Always decoded as UTF-8; non-UTF-8 pages may produce garbled text.
- Large `data:` URLs still go through fetch and may hit size limits.
