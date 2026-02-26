# Memo CLI `webfetch` Tool

Fetches web content with pagination, optional HTML-to-Markdown extraction, robots policy checks, and private-network protection.

## Basic Info

- Tool name: `webfetch`
- Description: Fetch URL content and return paged text; HTML can be simplified into Markdown.
- File: `packages/tools/src/tools/webfetch.ts`
- Confirmation: no

## Parameters

- `url` (string, required): URL to fetch. Supported schemes: `http:`, `https:`.
- `max_length` (number, optional): max returned characters for this call. Default `5000`, range `1..999999`.
- `start_index` (number, optional): start offset for paged reads. Default `0`.
- `raw` (boolean, optional): return raw response body instead of simplifying HTML. Default `false`.
- `proxy_url` (string, optional): HTTP(S) proxy URL.

## Behavior

- Validates URL/proxy URL and requires HTTP(S) protocols.
- Applies private-network guard by default:
    - blocks `localhost`, loopback, link-local, RFC1918, ULA, and related reserved ranges
    - checks both IP literals and DNS-resolved addresses
- Applies robots.txt policy by default for autonomous fetches:
    - robots URL is `{scheme}://{host}/robots.txt`
    - `401/403` blocks fetch
    - other `4xx` allows fetch
    - robots network failures are treated as errors
- Follows redirects (up to 10 hops), and enforces timeout and response-byte limits.
- For HTML (when `raw=false`), extracts readable article content with Readability and converts to Markdown.
- For non-HTML or `raw=true`, returns raw body with a prefix note.
- Supports pagination with `start_index` + `max_length`:
    - appends continuation hint when truncated
    - returns `<error>No more content available.</error>` when offset is out of range

## Output Example

Success (simplified HTML):

`Contents of https://example.com/article:`
`# Title`
`...`

Success (raw / non-HTML):

`Content type application/json cannot be simplified to markdown, but here is the raw content:`
`Contents of https://example.com/data:`
`{"ok":true}`

## Notes

- All failures return `isError=true` with a readable message.
- Default environment settings:
    - `MEMO_WEBFETCH_USER_AGENT`
    - `MEMO_WEBFETCH_IGNORE_ROBOTS_TXT=0`
    - `MEMO_WEBFETCH_TIMEOUT_MS=30000`
    - `MEMO_WEBFETCH_MAX_BODY_BYTES=5000000`
    - `MEMO_WEBFETCH_BLOCK_PRIVATE_NET=1`
