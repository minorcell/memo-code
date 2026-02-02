/** @file 系统提示词加载：默认读取内置 Markdown 模板。 */
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
 * 读取内置的系统提示词模板。
 * 可在外部通过依赖注入覆盖。
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
