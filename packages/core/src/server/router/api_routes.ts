import { CoreAuth } from '@memo/core/server/handler/auth'
import { CoreSessionManager } from '@memo/core/server/handler/session_manager'
import {
    loadMemoConfig,
    resolveContextWindowForProvider,
    selectProvider,
    writeMemoConfig,
    type LoadedConfig,
    type MCPServerConfig,
    type MemoConfig,
    type ModelProfileOverride,
    type ProviderConfig,
} from '@memo/core/config/config'
import {
    createMcpServer,
    getMcpServer,
    listMcpServers,
    loginMcpServer,
    logoutMcpServer,
    removeMcpServer,
    setActiveMcpServers,
    updateMcpServer,
} from '@memo/core/runtime/mcp/admin'
import { getFileSuggestions } from '@memo/core/runtime/workspace/file_suggestions'
import {
    createSkill,
    getSkill,
    listSkills,
    removeSkill,
    setActiveSkills,
    updateSkill,
} from '@memo/core/runtime/skills/admin'
import { buildOpenApiSpec } from '@memo/core/server/router/openapi'
import {
    HttpRouter,
    type RouteContext,
    type RouteMethod,
} from '@memo/core/server/router/http_router'
import { SseHub } from '@memo/core/server/utils/sse'
import type { AuthLoginRequest, ConfigSnapshot, UpdateConfigRequest } from '@memo/core/web/types'
import {
    ensureAuth,
    HttpApiError,
    normalizeError,
    parseInteger,
    readJsonBody,
    requireString,
    writeError,
    writeSuccess,
} from '@memo/core/server/utils/http'
import {
    buildWorkspaceRecord,
    listWorkspaces,
    listWorkspaceDirectories,
    type WorkspaceState,
} from '@memo/core/server/handler/workspace'

export type RegisterCoreApiRoutesOptions = {
    router: HttpRouter
    auth: CoreAuth
    sessionManager: CoreSessionManager
    sseHub: SseHub
    workspaceState: WorkspaceState
    getServerUrl: () => string
}

function parseProvider(input: unknown, index: number): ProviderConfig {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new HttpApiError(400, 'BAD_REQUEST', `providers[${index}] must be an object`)
    }
    const candidate = input as Record<string, unknown>
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : ''
    const envApiKey = typeof candidate.env_api_key === 'string' ? candidate.env_api_key.trim() : ''
    const model = typeof candidate.model === 'string' ? candidate.model.trim() : ''
    const baseUrl =
        typeof candidate.base_url === 'string' && candidate.base_url.trim()
            ? candidate.base_url.trim()
            : undefined

    if (!name || !envApiKey || !model) {
        throw new HttpApiError(
            400,
            'BAD_REQUEST',
            `providers[${index}] requires name, env_api_key, and model`,
        )
    }

    return {
        name,
        env_api_key: envApiKey,
        model,
        base_url: baseUrl,
    }
}

function parseProviders(input: unknown): ProviderConfig[] {
    if (!Array.isArray(input)) {
        throw new HttpApiError(400, 'BAD_REQUEST', 'providers must be an array')
    }
    const providers = input.map((item, index) => parseProvider(item, index))
    if (providers.length === 0) {
        throw new HttpApiError(400, 'BAD_REQUEST', 'providers cannot be empty')
    }
    return providers
}

function parseModelProfiles(input: unknown): Record<string, ModelProfileOverride> | undefined {
    if (input === undefined || input === null) return undefined
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new HttpApiError(400, 'BAD_REQUEST', 'model_profiles must be an object')
    }

    const normalized: Record<string, ModelProfileOverride> = {}
    for (const [key, rawValue] of Object.entries(input as Record<string, unknown>)) {
        if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
            continue
        }
        const profile = rawValue as Record<string, unknown>
        const next: ModelProfileOverride = {}
        if (typeof profile.supports_parallel_tool_calls === 'boolean') {
            next.supports_parallel_tool_calls = profile.supports_parallel_tool_calls
        }
        if (typeof profile.supports_reasoning_content === 'boolean') {
            next.supports_reasoning_content = profile.supports_reasoning_content
        }
        if (
            typeof profile.context_window === 'number' &&
            Number.isFinite(profile.context_window) &&
            profile.context_window > 0
        ) {
            next.context_window = Math.floor(profile.context_window)
        }
        if (Object.keys(next).length > 0) {
            normalized[key] = next
        }
    }

    return Object.keys(normalized).length > 0 ? normalized : undefined
}

function parseMcpServerConfig(name: string, input: unknown): MCPServerConfig {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new HttpApiError(400, 'BAD_REQUEST', `mcp_servers.${name} must be an object`)
    }
    const config = input as Record<string, unknown>

    if (typeof config.url === 'string' && config.url.trim()) {
        const headers =
            config.headers && typeof config.headers === 'object' && !Array.isArray(config.headers)
                ? (config.headers as Record<string, string>)
                : undefined
        const httpHeaders =
            config.http_headers &&
            typeof config.http_headers === 'object' &&
            !Array.isArray(config.http_headers)
                ? (config.http_headers as Record<string, string>)
                : undefined
        return {
            type: 'streamable_http',
            url: config.url.trim(),
            headers,
            http_headers: httpHeaders,
            bearer_token_env_var:
                typeof config.bearer_token_env_var === 'string' &&
                config.bearer_token_env_var.trim()
                    ? config.bearer_token_env_var.trim()
                    : undefined,
        }
    }

    if (typeof config.command === 'string' && config.command.trim()) {
        return {
            type: 'stdio',
            command: config.command.trim(),
            args: Array.isArray(config.args)
                ? config.args
                      .filter((item): item is string => typeof item === 'string')
                      .map((item) => item.trim())
                      .filter(Boolean)
                : undefined,
            env:
                config.env && typeof config.env === 'object' && !Array.isArray(config.env)
                    ? (config.env as Record<string, string>)
                    : undefined,
            stderr:
                config.stderr === 'inherit' ||
                config.stderr === 'pipe' ||
                config.stderr === 'ignore'
                    ? config.stderr
                    : undefined,
        }
    }

    throw new HttpApiError(400, 'BAD_REQUEST', `mcp_servers.${name} must contain url or command`)
}

function parseMcpServers(input: unknown): Record<string, MCPServerConfig> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new HttpApiError(400, 'BAD_REQUEST', 'mcp_servers must be an object')
    }

    const normalized: Record<string, MCPServerConfig> = {}
    for (const [name, value] of Object.entries(input as Record<string, unknown>)) {
        const trimmedName = name.trim()
        if (!trimmedName) continue
        normalized[trimmedName] = parseMcpServerConfig(trimmedName, value)
    }
    return normalized
}

function parseActiveMcpServers(input: unknown): string[] {
    if (!Array.isArray(input)) {
        throw new HttpApiError(400, 'BAD_REQUEST', 'active_mcp_servers must be an array')
    }
    return Array.from(
        new Set(
            input
                .filter((item): item is string => typeof item === 'string')
                .map((item) => item.trim())
                .filter(Boolean),
        ),
    )
}

function parseAutoCompactThresholdPercent(input: unknown): number {
    if (
        typeof input !== 'number' ||
        !Number.isFinite(input) ||
        !Number.isInteger(input) ||
        input < 1 ||
        input > 100
    ) {
        throw new HttpApiError(
            400,
            'BAD_REQUEST',
            'auto_compact_threshold_percent must be an integer between 1 and 100',
        )
    }
    return input
}

function buildConfigSnapshot(loaded: LoadedConfig): ConfigSnapshot {
    const selected = selectProvider(loaded.config, loaded.config.current_provider)
    return {
        configPath: loaded.configPath,
        memoHome: loaded.home,
        needsSetup: loaded.needsSetup,
        currentProvider: selected.name,
        selectedProvider: {
            name: selected.name,
            model: selected.model,
            contextWindow: resolveContextWindowForProvider(loaded.config, selected),
        },
        providers: loaded.config.providers,
        modelProfiles: loaded.config.model_profiles,
        mcpServers: loaded.config.mcp_servers ?? {},
        activeMcpServers: loaded.config.active_mcp_servers ?? [],
        autoCompactThresholdPercent: loaded.config.auto_compact_threshold_percent ?? 80,
    }
}

export function registerCoreApiRoutes(options: RegisterCoreApiRoutesOptions): void {
    const { auth, getServerUrl, router, sessionManager, sseHub, workspaceState } = options

    const registerJsonRoute = (
        method: RouteMethod,
        path: string,
        handler: (context: RouteContext, body: Record<string, unknown>) => Promise<unknown>,
        authRequired = true,
    ) => {
        router.register(method, path, async (context) => {
            try {
                if (authRequired) {
                    ensureAuth(auth, context.req)
                }
                const body =
                    method === 'GET' || method === 'DELETE' ? {} : await readJsonBody(context.req)
                const result = await handler(context, body)
                if (!context.res.writableEnded) {
                    writeSuccess(context.res, context.requestId, result)
                }
            } catch (error) {
                const normalized = normalizeError(error)
                writeError(
                    context.res,
                    context.requestId,
                    context.path,
                    normalized.statusCode,
                    normalized.code,
                    normalized.message,
                    normalized.details,
                )
            }
        })
    }

    registerJsonRoute(
        'POST',
        '/api/auth/login',
        async (_context, body) => {
            const passwordInput = requireString(body as AuthLoginRequest, 'password')
            return auth.login(passwordInput)
        },
        false,
    )

    router.register('GET', '/api/openapi.json', async (context) => {
        try {
            writeSuccess(
                context.res,
                context.requestId,
                buildOpenApiSpec({ serverUrl: getServerUrl() }),
            )
        } catch (error) {
            const normalized = normalizeError(error)
            writeError(
                context.res,
                context.requestId,
                context.path,
                normalized.statusCode,
                normalized.code,
                normalized.message,
                normalized.details,
            )
        }
    })

    router.register('GET', '/api/config', async (context) => {
        try {
            ensureAuth(auth, context.req)
            const loaded = await loadMemoConfig()
            writeSuccess(context.res, context.requestId, buildConfigSnapshot(loaded))
        } catch (error) {
            const normalized = normalizeError(error)
            writeError(
                context.res,
                context.requestId,
                context.path,
                normalized.statusCode,
                normalized.code,
                normalized.message,
                normalized.details,
            )
        }
    })

    registerJsonRoute('PATCH', '/api/config', async (_context, body) => {
        const loaded = await loadMemoConfig()
        const patch = body as UpdateConfigRequest
        const nextConfig: MemoConfig = {
            ...loaded.config,
        }

        if (Object.prototype.hasOwnProperty.call(body, 'providers')) {
            nextConfig.providers = parseProviders(patch.providers)
        }
        if (Object.prototype.hasOwnProperty.call(body, 'current_provider')) {
            const currentProvider =
                typeof patch.current_provider === 'string' ? patch.current_provider.trim() : ''
            if (!currentProvider) {
                throw new HttpApiError(400, 'BAD_REQUEST', 'current_provider must be a string')
            }
            nextConfig.current_provider = currentProvider
        }
        if (Object.prototype.hasOwnProperty.call(body, 'model_profiles')) {
            nextConfig.model_profiles = parseModelProfiles(patch.model_profiles)
        }
        if (Object.prototype.hasOwnProperty.call(body, 'mcp_servers')) {
            nextConfig.mcp_servers = parseMcpServers(patch.mcp_servers)
        }
        if (Object.prototype.hasOwnProperty.call(body, 'active_mcp_servers')) {
            nextConfig.active_mcp_servers = parseActiveMcpServers(patch.active_mcp_servers)
        }
        if (Object.prototype.hasOwnProperty.call(body, 'auto_compact_threshold_percent')) {
            nextConfig.auto_compact_threshold_percent = parseAutoCompactThresholdPercent(
                patch.auto_compact_threshold_percent,
            )
        }

        if (nextConfig.providers.length === 0) {
            throw new HttpApiError(400, 'BAD_REQUEST', 'providers cannot be empty')
        }

        const selectedProvider = selectProvider(nextConfig, nextConfig.current_provider)
        nextConfig.current_provider = selectedProvider.name

        if (nextConfig.active_mcp_servers) {
            const knownServers = new Set(Object.keys(nextConfig.mcp_servers ?? {}))
            nextConfig.active_mcp_servers = nextConfig.active_mcp_servers.filter((name) =>
                knownServers.has(name),
            )
        }

        await writeMemoConfig(loaded.configPath, nextConfig)
        return buildConfigSnapshot({
            ...loaded,
            config: nextConfig,
            needsSetup: nextConfig.providers.length === 0,
        })
    })

    registerJsonRoute('POST', '/api/chat/sessions', async (_context, body) => {
        return sessionManager.createSession({
            sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
            providerName: typeof body.providerName === 'string' ? body.providerName : undefined,
            cwd: typeof body.cwd === 'string' ? body.cwd : undefined,
            toolPermissionMode:
                body.toolPermissionMode === 'none' ||
                body.toolPermissionMode === 'once' ||
                body.toolPermissionMode === 'full'
                    ? body.toolPermissionMode
                    : undefined,
            activeMcpServers: Array.isArray(body.activeMcpServers)
                ? body.activeMcpServers.filter((item): item is string => typeof item === 'string')
                : undefined,
        })
    })

    router.register('GET', '/api/chat/sessions/providers', async (context) => {
        try {
            ensureAuth(auth, context.req)
            const result = await sessionManager.listProviders()
            writeSuccess(context.res, context.requestId, result)
        } catch (error) {
            const normalized = normalizeError(error)
            writeError(
                context.res,
                context.requestId,
                context.path,
                normalized.statusCode,
                normalized.code,
                normalized.message,
                normalized.details,
            )
        }
    })

    router.register('GET', '/api/chat/runtimes', async (context) => {
        try {
            ensureAuth(auth, context.req)
            const workspaceCwd = context.query.get('workspaceCwd') ?? undefined
            const result = sessionManager.listRuntimeBadges({ workspaceCwd })
            writeSuccess(context.res, context.requestId, result)
        } catch (error) {
            const normalized = normalizeError(error)
            writeError(
                context.res,
                context.requestId,
                context.path,
                normalized.statusCode,
                normalized.code,
                normalized.message,
                normalized.details,
            )
        }
    })

    router.register('GET', '/api/chat/sessions/:id', async (context) => {
        try {
            ensureAuth(auth, context.req)
            const session = sessionManager.getSessionState(context.params.id!)
            if (!session) {
                throw new HttpApiError(404, 'SESSION_NOT_FOUND', 'session not found')
            }
            writeSuccess(context.res, context.requestId, session)
        } catch (error) {
            const normalized = normalizeError(error)
            writeError(
                context.res,
                context.requestId,
                context.path,
                normalized.statusCode,
                normalized.code,
                normalized.message,
                normalized.details,
            )
        }
    })

    registerJsonRoute('DELETE', '/api/chat/sessions/:id', async (context) => {
        return sessionManager.closeSession(context.params.id!)
    })

    registerJsonRoute('POST', '/api/chat/sessions/:id/messages', async (context, body) => {
        return sessionManager.submitMessage(context.params.id!, requireString(body, 'input'))
    })

    registerJsonRoute('POST', '/api/chat/sessions/:id/input', async (context, body) => {
        return sessionManager.submitMessage(context.params.id!, requireString(body, 'input'))
    })

    registerJsonRoute('DELETE', '/api/chat/sessions/:id/queue/:queueId', async (context) => {
        return sessionManager.removeQueuedInput(context.params.id!, context.params.queueId!)
    })

    registerJsonRoute('POST', '/api/chat/sessions/:id/queue/send_now', async (context) => {
        return sessionManager.sendQueuedInputNow(context.params.id!)
    })

    registerJsonRoute('POST', '/api/chat/sessions/:id/history', async (context, body) => {
        const messages = body.messages
        if (!Array.isArray(messages)) {
            throw new HttpApiError(400, 'BAD_REQUEST', 'messages must be an array')
        }
        return sessionManager.restoreHistory(context.params.id!, messages)
    })

    registerJsonRoute('POST', '/api/chat/files/suggest', async (_context, body) => {
        if (typeof body.query !== 'string') {
            throw new HttpApiError(400, 'BAD_REQUEST', 'query is required')
        }
        const query = body.query.trim()
        const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
        const workspaceCwd = typeof body.workspaceCwd === 'string' ? body.workspaceCwd.trim() : ''
        const sessionCwd = sessionId ? sessionManager.resolveSessionCwd(sessionId) : null
        const cwd = sessionCwd || workspaceCwd

        if (!cwd) {
            throw new HttpApiError(
                400,
                'BAD_REQUEST',
                'workspaceCwd is required when sessionId is unavailable',
            )
        }

        const limit =
            typeof body.limit === 'number' && Number.isFinite(body.limit)
                ? Math.max(1, Math.floor(body.limit))
                : undefined
        const maxDepth =
            typeof body.maxDepth === 'number' && Number.isFinite(body.maxDepth)
                ? Math.max(1, Math.floor(body.maxDepth))
                : undefined
        const maxEntries =
            typeof body.maxEntries === 'number' && Number.isFinite(body.maxEntries)
                ? Math.max(100, Math.floor(body.maxEntries))
                : undefined
        const respectGitIgnore =
            typeof body.respectGitIgnore === 'boolean' ? body.respectGitIgnore : undefined
        const ignoreGlobs = Array.isArray(body.ignoreGlobs)
            ? body.ignoreGlobs.filter((item): item is string => typeof item === 'string')
            : undefined

        const items = await getFileSuggestions({
            cwd,
            query,
            limit,
            maxDepth,
            maxEntries,
            respectGitIgnore,
            ignoreGlobs,
        })
        return { items }
    })

    router.register('GET', '/api/chat/sessions/:id/events', async (context) => {
        try {
            ensureAuth(auth, context.req)
            const session = sessionManager.getSessionState(context.params.id!)
            if (!session) {
                throw new HttpApiError(404, 'SESSION_NOT_FOUND', 'session not found')
            }

            sseHub.subscribe(context.params.id!, context.req, context.res)
            sseHub.publish(context.params.id!, 'session.snapshot', session)
        } catch (error) {
            const normalized = normalizeError(error)
            writeError(
                context.res,
                context.requestId,
                context.path,
                normalized.statusCode,
                normalized.code,
                normalized.message,
                normalized.details,
            )
        }
    })

    registerJsonRoute('POST', '/api/chat/sessions/:id/cancel', async (context) => {
        return sessionManager.cancelTurn(context.params.id!)
    })

    registerJsonRoute('POST', '/api/chat/sessions/:id/compact', async (context) => {
        return sessionManager.compactSession(context.params.id!)
    })

    registerJsonRoute('POST', '/api/chat/sessions/:id/approval', async (context, body) => {
        const fingerprint = requireString(body, 'fingerprint')
        const decision = requireString(body, 'decision')
        if (decision !== 'once' && decision !== 'session' && decision !== 'deny') {
            throw new HttpApiError(400, 'BAD_REQUEST', 'decision must be once | session | deny')
        }
        return sessionManager.applyApprovalDecision(context.params.id!, fingerprint, decision)
    })

    registerJsonRoute(
        'POST',
        '/api/chat/sessions/:id/approvals/:fingerprint',
        async (context, body) => {
            const decision = requireString(body, 'decision')
            if (decision !== 'once' && decision !== 'session' && decision !== 'deny') {
                throw new HttpApiError(400, 'BAD_REQUEST', 'decision must be once | session | deny')
            }
            return sessionManager.applyApprovalDecision(
                context.params.id!,
                context.params.fingerprint!,
                decision,
            )
        },
    )

    router.register('GET', '/api/sessions', async (context) => {
        try {
            ensureAuth(auth, context.req)
            const data = await sessionManager.listSessions({
                page: parseInteger(context.query.get('page'), 1),
                pageSize: parseInteger(context.query.get('pageSize'), 20),
                sortBy:
                    context.query.get('sortBy') === 'updatedAt' ||
                    context.query.get('sortBy') === 'startedAt' ||
                    context.query.get('sortBy') === 'project' ||
                    context.query.get('sortBy') === 'title'
                        ? (context.query.get('sortBy') as
                              | 'updatedAt'
                              | 'startedAt'
                              | 'project'
                              | 'title')
                        : undefined,
                order:
                    context.query.get('order') === 'asc' || context.query.get('order') === 'desc'
                        ? (context.query.get('order') as 'asc' | 'desc')
                        : undefined,
                project: context.query.get('project') ?? undefined,
                workspaceCwd: context.query.get('workspaceCwd') ?? undefined,
                dateFrom: context.query.get('dateFrom') ?? undefined,
                dateTo: context.query.get('dateTo') ?? undefined,
                q: context.query.get('q') ?? undefined,
            })
            writeSuccess(context.res, context.requestId, data)
        } catch (error) {
            const normalized = normalizeError(error)
            writeError(
                context.res,
                context.requestId,
                context.path,
                normalized.statusCode,
                normalized.code,
                normalized.message,
                normalized.details,
            )
        }
    })

    router.register('GET', '/api/sessions/:id', async (context) => {
        try {
            ensureAuth(auth, context.req)
            const detail = await sessionManager.getSessionDetail(context.params.id!)
            if (!detail) {
                throw new HttpApiError(404, 'SESSION_NOT_FOUND', 'session not found')
            }
            writeSuccess(context.res, context.requestId, detail)
        } catch (error) {
            const normalized = normalizeError(error)
            writeError(
                context.res,
                context.requestId,
                context.path,
                normalized.statusCode,
                normalized.code,
                normalized.message,
                normalized.details,
            )
        }
    })

    router.register('GET', '/api/sessions/:id/events', async (context) => {
        try {
            ensureAuth(auth, context.req)
            const detail = await sessionManager.getSessionEvents(
                context.params.id!,
                context.query.get('cursor') ?? undefined,
                parseInteger(context.query.get('limit'), 100),
            )
            if (!detail) {
                throw new HttpApiError(404, 'SESSION_NOT_FOUND', 'session not found')
            }
            writeSuccess(context.res, context.requestId, detail)
        } catch (error) {
            const normalized = normalizeError(error)
            writeError(
                context.res,
                context.requestId,
                context.path,
                normalized.statusCode,
                normalized.code,
                normalized.message,
                normalized.details,
            )
        }
    })

    registerJsonRoute('DELETE', '/api/sessions/:id', async (context) => {
        return sessionManager.removeSessionHistory(context.params.id!)
    })

    router.register('GET', '/api/mcp/servers', async (context) => {
        try {
            ensureAuth(auth, context.req)
            const data = await listMcpServers()
            writeSuccess(context.res, context.requestId, data)
        } catch (error) {
            const normalized = normalizeError(error)
            writeError(
                context.res,
                context.requestId,
                context.path,
                normalized.statusCode,
                normalized.code,
                normalized.message,
                normalized.details,
            )
        }
    })

    router.register('GET', '/api/mcp/servers/:name', async (context) => {
        try {
            ensureAuth(auth, context.req)
            const data = await getMcpServer(context.params.name!)
            writeSuccess(context.res, context.requestId, data)
        } catch (error) {
            const normalized = normalizeError(error)
            writeError(
                context.res,
                context.requestId,
                context.path,
                normalized.statusCode,
                normalized.code,
                normalized.message,
                normalized.details,
            )
        }
    })

    registerJsonRoute('POST', '/api/mcp/servers', async (_context, body) => {
        const name = requireString(body, 'name')
        return createMcpServer(name, body.config)
    })

    registerJsonRoute('PUT', '/api/mcp/servers/:name', async (context, body) => {
        return updateMcpServer(context.params.name!, body.config)
    })

    registerJsonRoute('DELETE', '/api/mcp/servers/:name', async (context) => {
        return removeMcpServer(context.params.name!)
    })

    registerJsonRoute('POST', '/api/mcp/servers/:name/login', async (context, body) => {
        const scopes = Array.isArray(body.scopes)
            ? body.scopes.filter((item): item is string => typeof item === 'string')
            : undefined
        return loginMcpServer(context.params.name!, scopes)
    })

    registerJsonRoute('POST', '/api/mcp/servers/:name/logout', async (context) => {
        return logoutMcpServer(context.params.name!)
    })

    registerJsonRoute('POST', '/api/mcp/active', async (_context, body) => {
        const names = Array.isArray(body.names)
            ? body.names.filter((item): item is string => typeof item === 'string')
            : []
        return setActiveMcpServers(names)
    })

    router.register('GET', '/api/skills', async (context) => {
        try {
            ensureAuth(auth, context.req)
            const workspaceCwd = context.query.get('workspaceCwd')
            const scope = context.query.get('scope')
            const q = context.query.get('q')
            const data = await listSkills({
                workspaceCwd,
                scope,
                q,
            })
            writeSuccess(context.res, context.requestId, data)
        } catch (error) {
            const normalized = normalizeError(error)
            writeError(
                context.res,
                context.requestId,
                context.path,
                normalized.statusCode,
                normalized.code,
                normalized.message,
                normalized.details,
            )
        }
    })

    router.register('GET', '/api/skills/:id', async (context) => {
        try {
            ensureAuth(auth, context.req)
            const data = await getSkill(context.params.id!)
            writeSuccess(context.res, context.requestId, data)
        } catch (error) {
            const normalized = normalizeError(error)
            writeError(
                context.res,
                context.requestId,
                context.path,
                normalized.statusCode,
                normalized.code,
                normalized.message,
                normalized.details,
            )
        }
    })

    registerJsonRoute('POST', '/api/skills', async (_context, body) => {
        return createSkill({
            scope: body.scope,
            workspaceCwd: typeof body.workspaceCwd === 'string' ? body.workspaceCwd : undefined,
            name: body.name,
            description: body.description,
            content: body.content,
        })
    })

    registerJsonRoute('PATCH', '/api/skills/:id', async (context, body) => {
        return updateSkill(context.params.id!, {
            description: body.description,
            content: body.content,
        })
    })

    registerJsonRoute('DELETE', '/api/skills/:id', async (context) => {
        return removeSkill(context.params.id!)
    })

    registerJsonRoute('POST', '/api/skills/active', async (_context, body) => {
        const ids = Array.isArray(body.ids)
            ? body.ids.filter((item): item is string => typeof item === 'string')
            : []
        return setActiveSkills(ids)
    })

    router.register('GET', '/api/workspaces', async (context) => {
        try {
            ensureAuth(auth, context.req)
            const data = await listWorkspaces(sessionManager, workspaceState)
            writeSuccess(context.res, context.requestId, data)
        } catch (error) {
            const normalized = normalizeError(error)
            writeError(
                context.res,
                context.requestId,
                context.path,
                normalized.statusCode,
                normalized.code,
                normalized.message,
                normalized.details,
            )
        }
    })

    registerJsonRoute('POST', '/api/workspaces', async (_context, body) => {
        const cwd = requireString(body, 'cwd')
        const name = typeof body.name === 'string' ? body.name : undefined
        const next = buildWorkspaceRecord(cwd, name)
        workspaceState.overrides.set(next.id, next)
        workspaceState.removedIds.delete(next.id)
        return {
            created: true,
            item: next,
        }
    })

    registerJsonRoute('PATCH', '/api/workspaces/:id', async (context, body) => {
        const name = requireString(body, 'name')
        const current = workspaceState.overrides.get(context.params.id!)
        if (!current) {
            const all = await listWorkspaces(sessionManager, workspaceState)
            const found = all.items.find((item) => item.id === context.params.id!)
            if (!found) {
                throw new HttpApiError(404, 'WORKSPACE_NOT_FOUND', 'workspace not found')
            }
            workspaceState.overrides.set(context.params.id!, {
                ...found,
                name,
                lastUsedAt: new Date().toISOString(),
            })
        } else {
            workspaceState.overrides.set(context.params.id!, {
                ...current,
                name,
                lastUsedAt: new Date().toISOString(),
            })
        }

        return {
            updated: true,
            item: workspaceState.overrides.get(context.params.id!),
        }
    })

    registerJsonRoute('DELETE', '/api/workspaces/:id', async (context) => {
        workspaceState.overrides.delete(context.params.id!)
        workspaceState.removedIds.add(context.params.id!)
        return { deleted: true }
    })

    router.register('GET', '/api/workspaces/fs/list', async (context) => {
        try {
            ensureAuth(auth, context.req)
            const data = await listWorkspaceDirectories(context.query.get('path'))
            writeSuccess(context.res, context.requestId, data)
        } catch (error) {
            const normalized = normalizeError(error)
            writeError(
                context.res,
                context.requestId,
                context.path,
                normalized.statusCode,
                normalized.code,
                normalized.message,
                normalized.details,
            )
        }
    })
}
