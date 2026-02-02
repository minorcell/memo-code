/** @file 系统提示词加载：默认读取内置 Markdown 模板。 */
import os from 'node:os'
import prompt from './prompt.md' with { type: 'text' }

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
    const vars = {
        date: new Date().toISOString(),
        user: resolveUsername(),
        pwd: process.cwd(),
    }
    return renderTemplate(prompt, vars)
}
