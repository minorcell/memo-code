/** @file 配置管理：读取/写入 ~/.memo/config.toml 及路径构造工具。 */
import { mkdir, writeFile, readFile, access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { parse } from 'toml'
import type { AgentSessionOptions } from '@memo/core/types'

export type ProviderConfig = {
    name: string
    env_api_key: string
    model: string
    base_url?: string
}

export type MCPServerConfig =
    | {
          /** 默认：启动本地进程，通过 stdio 连接。 */
          type?: 'stdio'
          command: string
          args?: string[]
          /** 传递给本地进程的环境变量（会与当前环境合并）。 */
          env?: Record<string, string>
          /** 子进程 stderr 行为（默认在 TTY 中静默）。 */
          stderr?: 'inherit' | 'pipe' | 'ignore'
      }
    | {
          /** 通过 Streamable HTTP 连接远程 MCP。 */
          type?: 'streamable_http'
          url: string
          /** 附加请求头（如鉴权）。 */
          headers?: Record<string, string>
          /** codex 风格字段：附加请求头（优先于 headers）。 */
          http_headers?: Record<string, string>
          /** codex 风格字段：Bearer token env var。 */
          bearer_token_env_var?: string
      }

export type MemoConfig = {
    current_provider: string
    stream_output?: boolean
    /** Persistent prompt token limit (maps to AgentSessionOptions.maxPromptTokens). */
    max_prompt_tokens?: number
    /** Map of server name to server configuration */
    mcp_servers?: Record<string, MCPServerConfig>
    providers: ProviderConfig[]
}

type ParsedMemoConfig = Omit<Partial<MemoConfig>, 'providers'> & { providers?: unknown }

const DEFAULT_MEMO_HOME = join(homedir(), '.memo')
const DEFAULT_SESSIONS_DIR = 'sessions'

const DEFAULT_CONFIG: MemoConfig = {
    current_provider: 'deepseek',
    stream_output: false,
    max_prompt_tokens: 120000,
    providers: [
        {
            name: 'deepseek',
            env_api_key: 'DEEPSEEK_API_KEY',
            model: 'deepseek-chat',
            base_url: 'https://api.deepseek.com',
        },
    ],
    mcp_servers: {},
}

function formatTomlKey(key: string) {
    return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key)
}

function normalizeProviders(input: unknown): ProviderConfig[] {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return []

    const providers: ProviderConfig[] = []
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        if (!value) continue
        const entries = Array.isArray(value) ? value : [value]
        for (const entry of entries) {
            if (!entry || typeof entry !== 'object') continue
            const provider = { ...(entry as ProviderConfig) }
            if ((typeof provider.name !== 'string' || provider.name.length === 0) && key) {
                provider.name = key
            }
            providers.push(provider)
        }
    }
    return providers
}

function expandHome(path: string) {
    if (path.startsWith('~')) {
        return join(homedir(), path.slice(1))
    }
    return path
}

function serializeConfig(config: MemoConfig) {
    const providers = config.providers
        .map((p) => {
            const name = typeof p?.name === 'string' ? p.name : ''
            if (!name) return ''
            const key = formatTomlKey(name)
            const lines = [
                `[[providers.${key}]]`,
                `name = ${JSON.stringify(name)}`,
                `env_api_key = ${JSON.stringify(String(p.env_api_key ?? ''))}`,
                `model = ${JSON.stringify(String(p.model ?? ''))}`,
            ]
            if (p.base_url) {
                lines.push(`base_url = ${JSON.stringify(String(p.base_url))}`)
            }
            return lines.join('\n')
        })
        .filter(Boolean)
        .join('\n\n')

    let mcpSection = ''
    if (config.mcp_servers && Object.keys(config.mcp_servers).length > 0) {
        mcpSection = Object.entries(config.mcp_servers)
            .map(([name, conf]) => {
                if ('url' in conf) {
                    const lines = [`[mcp_servers.${name}]`]
                    lines.push(`type = "${conf.type ?? 'streamable_http'}"`)
                    lines.push(`url = "${conf.url}"`)
                    if (conf.bearer_token_env_var) {
                        lines.push(
                            `bearer_token_env_var = ${JSON.stringify(conf.bearer_token_env_var)}`,
                        )
                    }
                    const headers = conf.http_headers ?? conf.headers
                    if (headers && Object.keys(headers).length > 0) {
                        const headerEntries = Object.entries(headers)
                            .map(([k, v]) => `${JSON.stringify(k)} = ${JSON.stringify(v)}`)
                            .join(', ')
                        const headerKey = conf.http_headers ? 'http_headers' : 'headers'
                        lines.push(`${headerKey} = { ${headerEntries} }`)
                    }
                    return lines.join('\n')
                }
                const argsLine = conf.args ? `args = ${JSON.stringify(conf.args)}` : ''
                const typeLine = conf.type ? `type = "${conf.type}"\n` : ''
                const stderrLine = conf.stderr ? `stderr = "${conf.stderr}"\n` : ''
                const base =
                    `[mcp_servers.${name}]\n${typeLine}command = "${conf.command}"\n${stderrLine}${argsLine}`.trimEnd()
                const envEntries = conf.env ? Object.entries(conf.env) : []
                if (envEntries.length === 0) return base
                const envLines = envEntries
                    .map(([key, value]) => `${JSON.stringify(key)} = ${JSON.stringify(value)}`)
                    .join('\n')
                return `${base}\n\n[mcp_servers.${name}.env]\n${envLines}`
            })
            .join('\n\n')
    }

    const mainLines = [
        `current_provider = "${config.current_provider}"`,
        `stream_output = ${config.stream_output ?? false}`,
    ]
    if (typeof config.max_prompt_tokens === 'number' && Number.isFinite(config.max_prompt_tokens)) {
        mainLines.push(`max_prompt_tokens = ${Math.floor(config.max_prompt_tokens)}`)
    }
    const mainConfig = mainLines.join('\n')

    return [mainConfig, providers, mcpSection].filter(Boolean).join('\n\n')
}

export async function writeMemoConfig(path: string, config: MemoConfig) {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, serializeConfig(config), 'utf-8')
}

export type LoadedConfig = {
    config: MemoConfig
    home: string
    configPath: string
    needsSetup: boolean
}

export async function loadMemoConfig(): Promise<LoadedConfig> {
    const home = process.env.MEMO_HOME ? expandHome(process.env.MEMO_HOME) : DEFAULT_MEMO_HOME
    const configPath = join(home, 'config.toml')
    try {
        await access(configPath)
        const text = await readFile(configPath, 'utf-8')
        const parsed = parse(text) as ParsedMemoConfig
        const providers = normalizeProviders(parsed.providers)
        const maxPromptTokens =
            typeof parsed.max_prompt_tokens === 'number' &&
            Number.isFinite(parsed.max_prompt_tokens) &&
            parsed.max_prompt_tokens > 0
                ? Math.floor(parsed.max_prompt_tokens)
                : undefined
        const merged: MemoConfig = {
            current_provider: parsed.current_provider ?? DEFAULT_CONFIG.current_provider,
            stream_output: parsed.stream_output ?? DEFAULT_CONFIG.stream_output,
            max_prompt_tokens: maxPromptTokens ?? DEFAULT_CONFIG.max_prompt_tokens,
            providers,
            mcp_servers: parsed.mcp_servers ?? {},
        }
        const needsSetup = !merged.providers.length
        return { config: needsSetup ? DEFAULT_CONFIG : merged, home, configPath, needsSetup }
    } catch {
        return { config: DEFAULT_CONFIG, home, configPath, needsSetup: true }
    }
}

export function selectProvider(config: MemoConfig, preferred?: string): ProviderConfig {
    const name = preferred || config.current_provider
    const found = config.providers.find((p) => p.name === name)
    if (found) return found
    return config.providers?.[0] ?? DEFAULT_CONFIG.providers[0]!
}

export function getSessionsDir(loaded: LoadedConfig, options: AgentSessionOptions) {
    const base = options.historyDir ?? join(loaded.home, DEFAULT_SESSIONS_DIR)
    return expandHome(base)
}

export function buildSessionPath(baseDir: string, sessionId: string) {
    const now = new Date()
    const yyyy = String(now.getFullYear())
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const HH = String(now.getHours()).padStart(2, '0')
    const MM = String(now.getMinutes()).padStart(2, '0')
    const SS = String(now.getSeconds()).padStart(2, '0')
    const fileName = `rollout-${yyyy}-${mm}-${dd}T${HH}-${MM}-${SS}-${sessionId}.jsonl`
    return join(baseDir, yyyy, mm, dd, fileName)
}

/** 提供一个新的 sessionId，便于外部复用。 */
export function createSessionId() {
    return randomUUID()
}
