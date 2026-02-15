# Web Package Guide

This file defines local contribution rules for `web`.

## Scope

- Owns Next.js pages, components, and web-facing docs/presentation layer.
- Keep app behavior consistent on desktop and mobile breakpoints.

## Change Rules

- If public docs content, navigation, or examples change, keep related docs in sync.
- Keep web docs aligned with current package boundaries (`packages/tui` contains CLI entry and interactive UI runtime).
- Preserve established UI patterns unless a deliberate design change is required.
- 需要维护agents.md的更新。

## Internationalization (i18n)

The site supports multiple languages via `next-intl`:

- **Supported locales**: `en` (default), `zh`
- **URL pattern**: `/{lang}/path` (e.g., `/en/docs`, `/zh/docs`)
- **Content structure**:
  - Page text translations: `lib/i18n/messages/{locale}.json`
  - MDX docs: `content/docs/{locale}/`
  - MDX blog: `content/blog/{locale}/`

### i18n Configuration Notes

- **No middleware**: Static export (`output: 'export'`) doesn't support middleware, so locale detection is handled via URL path
- **Locale from URL**: The `[lang]` dynamic route segment provides the locale
- **Suppress hydration warning**: Both `layout.tsx` files have `suppressHydrationWarning` on `<html>` to handle lang attribute differences

### Adding a new language

1. Add locale to `lib/i18n/config.ts`
2. Create message file `lib/i18n/messages/{locale}.json`
3. Create content directories `content/docs/{locale}/` and `content/blog/{locale}/`
4. Translate all MDX files

### Modifying content

- When updating page text, update all language message files
- When updating MDX content, update all language versions
