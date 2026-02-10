/** @file System prompt loading: reads built-in Markdown template by default. */
import os from 'node:os'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const TEMPLATE_PATTERN = /{{\s*([\w.-]+)\s*}}/g

function renderTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(TEMPLATE_PATTERN, (_match, key: string) => vars[key] ?? '')
}

function resolveUsername(): string {
    try {
        return os.userInfo().username
    } catch {
        return process.env.USER ?? process.env.USERNAME ?? 'unknown'
    }
}

/**
 * Load built-in system prompt template.
 * Can be overridden externally via dependency injection.
 */
export async function loadSystemPrompt(): Promise<string> {
    const __dirname = dirname(fileURLToPath(import.meta.url))
    const promptPath = join(__dirname, 'prompt.md')
    const prompt = await readFile(promptPath, 'utf-8')
    const vars = {
        date: new Date().toISOString(),
        user: resolveUsername(),
        pwd: process.cwd(),
    }
    return renderTemplate(prompt, vars)
}
