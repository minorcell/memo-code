export function buildOpenApiSpec(options: { serverUrl: string }): Record<string, unknown> {
    return {
        openapi: '3.1.0',
        info: {
            title: 'Memo Core HTTP API',
            version: '0.1.0',
            description: 'Core server endpoints for chat runtime, sessions, and admin APIs.',
        },
        servers: [{ url: options.serverUrl }],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
        security: [{ bearerAuth: [] }],
        paths: {
            '/api/openapi.json': {
                get: {
                    summary: 'Get OpenAPI document',
                    security: [],
                },
            },
            '/api/auth/login': {
                post: {
                    summary: 'Login with shared password',
                    security: [],
                },
            },
            '/api/config': {
                get: {
                    summary: 'Get runtime config snapshot',
                },
                patch: {
                    summary: 'Patch runtime config',
                },
            },
            '/api/chat/sessions': {
                post: {
                    summary: 'Create live session',
                },
            },
            '/api/chat/sessions/{id}': {
                get: {
                    summary: 'Get session live state',
                },
                delete: {
                    summary: 'Close session',
                },
            },
            '/api/chat/sessions/{id}/messages': {
                post: {
                    summary: 'Submit input to live session queue',
                },
            },
            '/api/chat/sessions/providers': {
                get: {
                    summary: 'List available chat providers',
                },
            },
            '/api/chat/runtimes': {
                get: {
                    summary: 'List live runtime badges',
                },
            },
            '/api/chat/sessions/{id}/queue/{queueId}': {
                delete: {
                    summary: 'Remove queued input',
                },
            },
            '/api/chat/sessions/{id}/queue/send_now': {
                post: {
                    summary: 'Trigger queued input processing',
                },
            },
            '/api/chat/sessions/{id}/history': {
                post: {
                    summary: 'Restore session history messages',
                },
            },
            '/api/chat/files/suggest': {
                post: {
                    summary: 'Suggest files for chat input',
                },
            },
            '/api/chat/sessions/{id}/events': {
                get: {
                    summary: 'Subscribe SSE events',
                },
            },
            '/api/chat/sessions/{id}/cancel': {
                post: {
                    summary: 'Cancel current turn',
                },
            },
            '/api/chat/sessions/{id}/compact': {
                post: {
                    summary: 'Manual compact for session history',
                },
            },
            '/api/chat/sessions/{id}/approval': {
                post: {
                    summary: 'Respond pending approval request',
                },
            },
            '/api/sessions': {
                get: {
                    summary: 'List persisted session history',
                },
            },
            '/api/sessions/{id}': {
                get: {
                    summary: 'Get persisted session detail',
                },
                delete: {
                    summary: 'Delete persisted session history',
                },
            },
            '/api/sessions/{id}/events': {
                get: {
                    summary: 'Get persisted session events',
                },
            },
            '/api/mcp/servers': {
                get: {
                    summary: 'List MCP servers',
                },
            },
            '/api/skills': {
                get: {
                    summary: 'List skills',
                },
            },
        },
    }
}
