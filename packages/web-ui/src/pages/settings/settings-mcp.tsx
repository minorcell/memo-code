import { useEffect, useState } from 'react'
import {
    Bot,
    Loader2,
    Pencil,
    Plus,
    Power,
    RefreshCw,
    ShieldCheck,
    Terminal,
    Trash2,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { McpServerConfig, McpServerRecord } from '@/api/types'
import { cn } from '@/lib/utils'
import { SETTINGS_MODAL_CLASS } from '@/pages/settings/styles'
import { useMcpStore } from '@/stores'
import { onAppRefresh } from '@/utils/refresh-bus'

type EditorMode = 'create' | 'edit'
type McpTransport = 'http' | 'stdio'

type EditorState = {
    mode: EditorMode
    originalName?: string
    form: McpEditorForm
}

type McpEditorForm = {
    name: string
    transport: McpTransport
    url: string
    bearerTokenEnvVar: string
    headersJson: string
    command: string
    argsText: string
    envJson: string
    stderr: 'inherit' | 'pipe' | 'ignore'
}

type BuildConfigResult =
    | {
          ok: true
          config: McpServerConfig
      }
    | {
          ok: false
          message: string
      }

const DEFAULT_EDITOR_FORM: McpEditorForm = {
    name: '',
    transport: 'http',
    url: '',
    bearerTokenEnvVar: '',
    headersJson: '',
    command: '',
    argsText: '',
    envJson: '',
    stderr: 'inherit',
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeStringRecord(value: unknown): Record<string, string> | null {
    if (!isRecord(value)) return null
    const output: Record<string, string> = {}
    for (const [key, item] of Object.entries(value)) {
        if (typeof item === 'string') {
            output[key] = item
            continue
        }
        if (typeof item === 'number' || typeof item === 'boolean') {
            output[key] = String(item)
        }
    }
    return output
}

function toJsonInput(value: Record<string, string> | null): string {
    if (!value || Object.keys(value).length === 0) return ''
    return JSON.stringify(value, null, 2)
}

function parseStringRecordJson(
    raw: string,
    fieldName: string,
): {
    value?: Record<string, string>
    error?: string
} {
    const source = raw.trim()
    if (!source) {
        return { value: undefined }
    }

    let parsed: unknown
    try {
        parsed = JSON.parse(source)
    } catch {
        return { error: `${fieldName} must be valid JSON.` }
    }

    if (!isRecord(parsed)) {
        return { error: `${fieldName} must be a JSON object.` }
    }

    const output: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') {
            output[key] = value
            continue
        }
        if (typeof value === 'number' || typeof value === 'boolean') {
            output[key] = String(value)
            continue
        }
        return {
            error: `${fieldName} values must be string, number, or boolean.`,
        }
    }

    return { value: Object.keys(output).length > 0 ? output : undefined }
}

function isHttpConfig(config: Record<string, unknown>): boolean {
    return typeof config.url === 'string' && config.url.trim().length > 0
}

function serverTransport(config: Record<string, unknown>): McpTransport {
    return isHttpConfig(config) ? 'http' : 'stdio'
}

function buildEditorForm(record?: McpServerRecord): McpEditorForm {
    if (!record) {
        return { ...DEFAULT_EDITOR_FORM }
    }

    const config = isRecord(record.config) ? record.config : {}
    const transport = serverTransport(config)
    const args = Array.isArray(config.args)
        ? config.args.filter((item): item is string => typeof item === 'string')
        : []

    return {
        name: record.name,
        transport,
        url: typeof config.url === 'string' ? config.url : '',
        bearerTokenEnvVar:
            typeof config.bearer_token_env_var === 'string' ? config.bearer_token_env_var : '',
        headersJson: toJsonInput(normalizeStringRecord(config.http_headers ?? config.headers)),
        command: typeof config.command === 'string' ? config.command : '',
        argsText: args.join('\n'),
        envJson: toJsonInput(normalizeStringRecord(config.env)),
        stderr:
            config.stderr === 'pipe' || config.stderr === 'ignore' || config.stderr === 'inherit'
                ? config.stderr
                : 'inherit',
    }
}

function buildConfig(form: McpEditorForm): BuildConfigResult {
    if (form.transport === 'http') {
        const url = form.url.trim()
        if (!url) {
            return { ok: false, message: 'HTTP mode requires a URL.' }
        }

        const headers = parseStringRecordJson(form.headersJson, 'Headers')
        if (headers.error) {
            return { ok: false, message: headers.error }
        }

        return {
            ok: true,
            config: {
                type: 'streamable_http',
                url,
                ...(form.bearerTokenEnvVar.trim()
                    ? { bearer_token_env_var: form.bearerTokenEnvVar.trim() }
                    : {}),
                ...(headers.value ? { http_headers: headers.value } : {}),
            },
        }
    }

    const command = form.command.trim()
    if (!command) {
        return { ok: false, message: 'Stdio mode requires a command.' }
    }

    const env = parseStringRecordJson(form.envJson, 'Environment')
    if (env.error) {
        return { ok: false, message: env.error }
    }

    const args = form.argsText
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean)

    return {
        ok: true,
        config: {
            type: 'stdio',
            command,
            ...(args.length > 0 ? { args } : {}),
            ...(env.value ? { env: env.value } : {}),
            stderr: form.stderr,
        },
    }
}

function authStatusText(status: McpServerRecord['authStatus']) {
    switch (status) {
        case 'not_logged_in':
            return 'Not logged in'
        case 'oauth':
            return 'OAuth'
        case 'bearer_token':
            return 'Bearer token'
        default:
            return 'Unsupported'
    }
}

function transportSummary(config: Record<string, unknown>): string {
    if (isHttpConfig(config)) {
        return typeof config.url === 'string' ? config.url : '-'
    }

    const command = typeof config.command === 'string' ? config.command : ''
    const args = Array.isArray(config.args)
        ? config.args.filter((item): item is string => typeof item === 'string')
        : []
    return `${command}${args.length > 0 ? ` ${args.join(' ')}` : ''}`.trim() || '-'
}

export function SettingsMcp() {
    const items = useMcpStore((state) => state.items)
    const loading = useMcpStore((state) => state.loading)
    const error = useMcpStore((state) => state.error)
    const load = useMcpStore((state) => state.load)
    const createServer = useMcpStore((state) => state.createServer)
    const updateServer = useMcpStore((state) => state.updateServer)
    const removeServer = useMcpStore((state) => state.removeServer)
    const loginServer = useMcpStore((state) => state.loginServer)
    const logoutServer = useMcpStore((state) => state.logoutServer)
    const toggleActive = useMcpStore((state) => state.toggleActive)

    const [editor, setEditor] = useState<EditorState | null>(null)
    const [editorError, setEditorError] = useState<string | null>(null)
    const [editorSubmitting, setEditorSubmitting] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<McpServerRecord | null>(null)
    const [deleteSubmitting, setDeleteSubmitting] = useState(false)

    useEffect(() => {
        if (items.length > 0) return
        void load()
    }, [items.length, load])

    useEffect(() => {
        return onAppRefresh(() => {
            void load()
        })
    }, [load])

    function openCreateEditor() {
        setEditorError(null)
        setEditor({
            mode: 'create',
            form: buildEditorForm(),
        })
    }

    function openEditEditor(item: McpServerRecord) {
        setEditorError(null)
        setEditor({
            mode: 'edit',
            originalName: item.name,
            form: buildEditorForm(item),
        })
    }

    function updateEditorForm(patch: Partial<McpEditorForm>) {
        setEditor((current) => {
            if (!current) return current
            return {
                ...current,
                form: {
                    ...current.form,
                    ...patch,
                },
            }
        })
    }

    async function handleSubmitEditor() {
        if (!editor) return

        const name = editor.form.name.trim()
        if (!name) {
            setEditorError('Server name is required.')
            return
        }

        const built = buildConfig(editor.form)
        if (!built.ok) {
            setEditorError(built.message)
            return
        }

        setEditorSubmitting(true)
        setEditorError(null)
        const success =
            editor.mode === 'create'
                ? await createServer(name, built.config)
                : await updateServer(editor.originalName ?? name, built.config)
        setEditorSubmitting(false)

        if (success) {
            setEditor(null)
            setEditorError(null)
        }
    }

    async function handleConfirmDelete() {
        if (!deleteTarget) return
        setDeleteSubmitting(true)
        const success = await removeServer(deleteTarget.name)
        setDeleteSubmitting(false)
        if (success) {
            setDeleteTarget(null)
        }
    }

    return (
        <div className="w-full p-8">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold">MCP Servers</h1>
                    <p className="text-sm text-muted-foreground">
                        Visual management for `memo mcp` (list/add/edit/remove/login/active).
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={openCreateEditor}>
                        <Plus className="size-4" />
                        Add server
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void load()}
                        disabled={loading}
                    >
                        {loading ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : (
                            <RefreshCw className="size-4" />
                        )}
                        Refresh
                    </Button>
                </div>
            </div>

            {error ? (
                <Alert variant="destructive" className="mt-4">
                    <AlertTitle>Operation failed</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            ) : null}

            <section className="mt-6 space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground">
                    Configured servers ({items.length})
                </h2>

                {items.length === 0 && !loading ? (
                    <Card>
                        <CardContent className="py-8 text-center text-sm text-muted-foreground">
                            <Bot className="mx-auto mb-2 size-6 opacity-60" />
                            No MCP servers configured.
                        </CardContent>
                    </Card>
                ) : null}

                {items.map((item) => {
                    const config = isRecord(item.config) ? item.config : {}
                    const isHttp = isHttpConfig(config)
                    const canAuth = isHttp

                    return (
                        <Card key={item.name}>
                            <CardContent className="py-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <h3 className="truncate text-sm font-medium">
                                                {item.name}
                                            </h3>
                                            <Badge variant="outline">
                                                {isHttp ? 'streamable_http' : 'stdio'}
                                            </Badge>
                                            <Badge
                                                className={cn(
                                                    item.active
                                                        ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                                                        : 'bg-muted text-muted-foreground',
                                                )}
                                            >
                                                {item.active ? 'Active' : 'Inactive'}
                                            </Badge>
                                            <Badge variant="outline" className="gap-1">
                                                <ShieldCheck className="size-3.5" />
                                                {authStatusText(item.authStatus)}
                                            </Badge>
                                        </div>

                                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                                            {isHttp ? (
                                                <Power className="size-3.5" />
                                            ) : (
                                                <Terminal className="size-3.5" />
                                            )}
                                            <span className="truncate">
                                                {transportSummary(config)}
                                            </span>
                                        </div>

                                        <details className="mt-2">
                                            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                                                View raw config
                                            </summary>
                                            <pre className="mt-2 overflow-x-auto rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
                                                {JSON.stringify(item.config, null, 2)}
                                            </pre>
                                        </details>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-2">
                                        <div className="flex items-center gap-2 rounded-md border px-2 py-1">
                                            <span className="text-xs text-muted-foreground">
                                                Active
                                            </span>
                                            <Switch
                                                checked={item.active}
                                                onCheckedChange={(checked) => {
                                                    void toggleActive(item.name, checked)
                                                }}
                                            />
                                        </div>

                                        {canAuth && item.authStatus === 'not_logged_in' ? (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => void loginServer(item.name)}
                                            >
                                                Login
                                            </Button>
                                        ) : null}
                                        {canAuth &&
                                        (item.authStatus === 'oauth' ||
                                            item.authStatus === 'bearer_token') ? (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => void logoutServer(item.name)}
                                            >
                                                Logout
                                            </Button>
                                        ) : null}

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => openEditEditor(item)}
                                        >
                                            <Pencil className="size-3.5" />
                                            Edit
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setDeleteTarget(item)}
                                            className="text-destructive hover:text-destructive"
                                        >
                                            <Trash2 className="size-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )
                })}
            </section>

            {editor ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                    onClick={() => {
                        if (!editorSubmitting) {
                            setEditor(null)
                            setEditorError(null)
                        }
                    }}
                >
                    <div
                        className={cn('w-full max-w-2xl p-5', SETTINGS_MODAL_CLASS)}
                        onClick={(event) => {
                            event.stopPropagation()
                        }}
                    >
                        <div className="flex items-center justify-between">
                            <h2 className="text-base font-semibold">
                                {editor.mode === 'create' ? 'Add MCP server' : 'Edit MCP server'}
                            </h2>
                            <Badge variant="outline">{editor.mode}</Badge>
                        </div>

                        <div className="mt-4 space-y-4">
                            <div className="space-y-1">
                                <Label htmlFor="mcp-editor-name">Name</Label>
                                <Input
                                    id="mcp-editor-name"
                                    value={editor.form.name}
                                    disabled={editor.mode === 'edit'}
                                    onChange={(event) => {
                                        updateEditorForm({ name: event.target.value })
                                    }}
                                    placeholder="github"
                                />
                            </div>

                            <Tabs
                                value={editor.form.transport}
                                onValueChange={(value) => {
                                    if (value === 'http' || value === 'stdio') {
                                        updateEditorForm({ transport: value })
                                    }
                                }}
                            >
                                <TabsList>
                                    <TabsTrigger value="http">HTTP</TabsTrigger>
                                    <TabsTrigger value="stdio">Stdio</TabsTrigger>
                                </TabsList>

                                <TabsContent value="http" className="mt-3 space-y-3">
                                    <div className="space-y-1">
                                        <Label htmlFor="mcp-editor-url">URL</Label>
                                        <Input
                                            id="mcp-editor-url"
                                            value={editor.form.url}
                                            onChange={(event) => {
                                                updateEditorForm({ url: event.target.value })
                                            }}
                                            placeholder="https://example.com/mcp"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="mcp-editor-bearer">
                                            Bearer token env var (optional)
                                        </Label>
                                        <Input
                                            id="mcp-editor-bearer"
                                            value={editor.form.bearerTokenEnvVar}
                                            onChange={(event) => {
                                                updateEditorForm({
                                                    bearerTokenEnvVar: event.target.value,
                                                })
                                            }}
                                            placeholder="MY_MCP_TOKEN"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="mcp-editor-headers">
                                            HTTP headers JSON (optional)
                                        </Label>
                                        <Textarea
                                            id="mcp-editor-headers"
                                            value={editor.form.headersJson}
                                            onChange={(event) => {
                                                updateEditorForm({
                                                    headersJson: event.target.value,
                                                })
                                            }}
                                            rows={4}
                                            placeholder={'{\n  "X-API-KEY": "token"\n}'}
                                        />
                                    </div>
                                </TabsContent>

                                <TabsContent value="stdio" className="mt-3 space-y-3">
                                    <div className="space-y-1">
                                        <Label htmlFor="mcp-editor-command">Command</Label>
                                        <Input
                                            id="mcp-editor-command"
                                            value={editor.form.command}
                                            onChange={(event) => {
                                                updateEditorForm({ command: event.target.value })
                                            }}
                                            placeholder="npx"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="mcp-editor-args">
                                            Arguments (one per line)
                                        </Label>
                                        <Textarea
                                            id="mcp-editor-args"
                                            value={editor.form.argsText}
                                            onChange={(event) => {
                                                updateEditorForm({ argsText: event.target.value })
                                            }}
                                            rows={5}
                                            placeholder={'-y\n@modelcontextprotocol/server-github'}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="mcp-editor-env">
                                            Environment JSON (optional)
                                        </Label>
                                        <Textarea
                                            id="mcp-editor-env"
                                            value={editor.form.envJson}
                                            onChange={(event) => {
                                                updateEditorForm({ envJson: event.target.value })
                                            }}
                                            rows={4}
                                            placeholder={'{\n  "GITHUB_TOKEN": "xxxx"\n}'}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="mcp-editor-stderr">stderr</Label>
                                        <Select
                                            value={editor.form.stderr}
                                            onValueChange={(value) => {
                                                if (
                                                    value === 'inherit' ||
                                                    value === 'pipe' ||
                                                    value === 'ignore'
                                                ) {
                                                    updateEditorForm({ stderr: value })
                                                }
                                            }}
                                        >
                                            <SelectTrigger id="mcp-editor-stderr">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="inherit">inherit</SelectItem>
                                                <SelectItem value="pipe">pipe</SelectItem>
                                                <SelectItem value="ignore">ignore</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </TabsContent>
                            </Tabs>

                            {editorError ? (
                                <p className="text-sm text-destructive">{editorError}</p>
                            ) : null}
                        </div>

                        <div className="mt-5 flex items-center justify-end gap-2">
                            <Button
                                variant="ghost"
                                onClick={() => {
                                    setEditor(null)
                                    setEditorError(null)
                                }}
                                disabled={editorSubmitting}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={() => void handleSubmitEditor()}
                                disabled={editorSubmitting}
                            >
                                {editorSubmitting ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : null}
                                {editor.mode === 'create' ? 'Create server' : 'Save changes'}
                            </Button>
                        </div>
                    </div>
                </div>
            ) : null}

            {deleteTarget ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                    onClick={() => {
                        if (!deleteSubmitting) {
                            setDeleteTarget(null)
                        }
                    }}
                >
                    <div
                        className={cn('w-full max-w-md p-5', SETTINGS_MODAL_CLASS)}
                        onClick={(event) => {
                            event.stopPropagation()
                        }}
                    >
                        <h3 className="text-base font-semibold">Delete MCP server</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Remove{' '}
                            <span className="font-medium text-foreground">{deleteTarget.name}</span>{' '}
                            from configuration?
                        </p>
                        <div className="mt-5 flex items-center justify-end gap-2">
                            <Button
                                variant="ghost"
                                onClick={() => setDeleteTarget(null)}
                                disabled={deleteSubmitting}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={() => void handleConfirmDelete()}
                                disabled={deleteSubmitting}
                            >
                                {deleteSubmitting ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : null}
                                Delete
                            </Button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    )
}
