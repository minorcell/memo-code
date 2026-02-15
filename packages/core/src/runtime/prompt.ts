/** @file System prompt loading: reads built-in Markdown template by default. */
import os from 'node:os'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSkills, renderSkillsSection } from '@memo/core/runtime/skills'

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

type LoadSystemPromptOptions = {
    /** Project root at process startup; defaults to current working directory. */
    cwd?: string
    /** Optional explicit skill roots, useful in tests and custom embeddings. */
    skillRoots?: string[]
    /** Optional custom home directory, defaults to OS home directory. */
    homeDir?: string
    /** Optional memo home override, defaults to MEMO_HOME or ~/.memo. */
    memoHome?: string
    /** Disable skills injection into system prompt when false. */
    includeSkills?: boolean
}

async function readProjectAgentsMd(
    projectRoot: string,
): Promise<{ path: string; content: string } | null> {
    const agentsPath = join(projectRoot, 'AGENTS.md')
    try {
        const content = await readFile(agentsPath, 'utf-8')
        if (!content.trim()) {
            return null
        }
        return { path: agentsPath, content }
    } catch {
        return null
    }
}

function appendProjectAgentsPrompt(
    basePrompt: string,
    agents: { path: string; content: string },
): string {
    return `${basePrompt}

## Project AGENTS.md (Startup Root)
Loaded from: ${agents.path}

${agents.content}`
}

function appendSkillsPrompt(basePrompt: string, skillsSection: string): string {
    return `${basePrompt}

${skillsSection}`
}

function resolveModuleDir(): string {
    if (typeof __dirname === 'string') {
        return __dirname
    }
    return dirname(fileURLToPath(import.meta.url))
}

/**
 * Load built-in system prompt template.
 * Can be overridden externally via dependency injection.
 */
export async function loadSystemPrompt(options: LoadSystemPromptOptions = {}): Promise<string> {
    const startupRoot = options.cwd ?? process.cwd()
    const promptPath = join(resolveModuleDir(), 'prompt.md')
    const prompt = await readFile(promptPath, 'utf-8')
    const vars = {
        date: new Date().toISOString(),
        user: resolveUsername(),
        pwd: startupRoot,
    }
    let composedPrompt = renderTemplate(prompt, vars)
    const agents = await readProjectAgentsMd(startupRoot)
    if (agents) {
        composedPrompt = appendProjectAgentsPrompt(composedPrompt, agents)
    }

    if (options.includeSkills !== false) {
        const skills = await loadSkills({
            cwd: startupRoot,
            skillRoots: options.skillRoots,
            homeDir: options.homeDir,
            memoHome: options.memoHome,
        })
        const skillsSection = renderSkillsSection(skills)
        if (skillsSection) {
            composedPrompt = appendSkillsPrompt(composedPrompt, skillsSection)
        }
    }

    return composedPrompt
}
