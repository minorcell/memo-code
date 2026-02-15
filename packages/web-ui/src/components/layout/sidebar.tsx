import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
    ChevronLeft,
    ChevronRight,
    House,
    FolderGit,
    FolderPlus,
    Plus,
    Settings,
    Trash2,
    Undo2,
} from 'lucide-react'
import { sessionsApi, workspacesApi } from '@/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useChatStore, useWorkspaceStore } from '@/stores'
import { emitAppRefresh } from '@/utils/refresh-bus'
import type { SessionListItem, SessionRuntimeBadge, WorkspaceRecord } from '@/api/types'

type SidebarProps = {
    sessions: SessionListItem[]
    runtimeBadges: Record<string, SessionRuntimeBadge>
    workspaces: WorkspaceRecord[]
    selectedWorkspaceId: string | null
    onSelectWorkspace: (workspaceId: string | null) => void
    onCreateSession: (workspaceId: string) => Promise<string | null>
}

type WorkspaceGroup = {
    workspace: WorkspaceRecord
    sessions: SessionListItem[]
}

type PendingDeleteTarget =
    | {
          kind: 'workspace'
          workspaceId: string
          name: string
      }
    | {
          kind: 'session'
          sessionId: string
          workspaceId: string
          title: string
      }

function statusDotClass(
    session: SessionListItem,
    runtimeBadges: Record<string, SessionRuntimeBadge>,
): string {
    const runtime = runtimeBadges[session.sessionId]
    if (runtime?.status === 'running') return 'bg-emerald-500'
    if (session.status === 'error') return 'bg-red-500'
    if (session.status === 'cancelled') return 'bg-amber-500'
    return 'bg-muted-foreground/60'
}

export function Sidebar({
    sessions,
    runtimeBadges,
    workspaces,
    selectedWorkspaceId,
    onSelectWorkspace,
    onCreateSession,
}: SidebarProps) {
    const [collapsed, setCollapsed] = useState(false)
    const [pickerOpen, setPickerOpen] = useState(false)
    const [workspaceName, setWorkspaceName] = useState('')
    const [pendingDelete, setPendingDelete] = useState<PendingDeleteTarget | null>(null)
    const [deleting, setDeleting] = useState(false)
    const navigate = useNavigate()
    const location = useLocation()
    const resetChat = useChatStore((state) => state.reset)

    const browserPath = useWorkspaceStore((state) => state.browserPath)
    const homePath = useWorkspaceStore((state) => state.homePath)
    const browserParentPath = useWorkspaceStore((state) => state.browserParentPath)
    const browserItems = useWorkspaceStore((state) => state.browserItems)
    const browsing = useWorkspaceStore((state) => state.browsing)
    const loadDirectories = useWorkspaceStore((state) => state.loadDirectories)
    const addWorkspace = useWorkspaceStore((state) => state.addWorkspace)
    const loadWorkspaces = useWorkspaceStore((state) => state.loadWorkspaces)

    const activeSessionId = useMemo(() => {
        const params = new URLSearchParams(location.search)
        const value = params.get('session')
        return value?.trim() || null
    }, [location.search])

    const groupedSessions = useMemo<WorkspaceGroup[]>(() => {
        const sessionsByWorkspace = new Map<string, SessionListItem[]>()
        for (const session of sessions) {
            if (!session.workspaceId) continue
            const list = sessionsByWorkspace.get(session.workspaceId)
            if (list) {
                list.push(session)
            } else {
                sessionsByWorkspace.set(session.workspaceId, [session])
            }
        }

        return workspaces
            .map((workspace) => {
                const list = sessionsByWorkspace.get(workspace.id) ?? []
                return {
                    workspace,
                    sessions: [...list].sort((left, right) =>
                        right.date.updatedAt.localeCompare(left.date.updatedAt),
                    ),
                }
            })
            .sort((left, right) =>
                left.workspace.name.localeCompare(right.workspace.name, undefined, {
                    sensitivity: 'base',
                }),
            )
    }, [sessions, workspaces])

    async function handleCreateSession(workspaceId: string) {
        const sessionId = await onCreateSession(workspaceId)
        if (!sessionId) return
        onSelectWorkspace(workspaceId)
        navigate(`/chat?session=${sessionId}`)
    }

    async function handleOpenPicker() {
        setWorkspaceName('')
        setPickerOpen(true)
        await loadDirectories()
    }

    async function handleAddCurrentPath() {
        const created = await addWorkspace({
            cwd: browserPath,
            name: workspaceName.trim() || undefined,
        })
        if (!created) return
        onSelectWorkspace(created.id)
        setPickerOpen(false)
    }

    function requestDeleteWorkspace(workspace: WorkspaceRecord) {
        setPendingDelete({
            kind: 'workspace',
            workspaceId: workspace.id,
            name: workspace.name,
        })
    }

    function requestDeleteSession(session: SessionListItem) {
        setPendingDelete({
            kind: 'session',
            sessionId: session.sessionId,
            workspaceId: session.workspaceId,
            title: session.title,
        })
    }

    async function handleConfirmDelete() {
        if (!pendingDelete || deleting) return
        setDeleting(true)
        try {
            if (pendingDelete.kind === 'session') {
                await sessionsApi.removeSession(pendingDelete.sessionId)
                if (activeSessionId === pendingDelete.sessionId) {
                    resetChat()
                    navigate('/chat')
                }
                toast.success('Session deleted')
            } else {
                const result = await workspacesApi.removeWorkspace({
                    workspaceId: pendingDelete.workspaceId,
                })
                await loadWorkspaces()
                const activeSession = sessions.find((item) => item.sessionId === activeSessionId)
                if (activeSession && activeSession.workspaceId === pendingDelete.workspaceId) {
                    resetChat()
                    navigate('/chat')
                }
                const deletedSessions = result.deletedSessions ?? 0
                toast.success(
                    deletedSessions > 0
                        ? `Project deleted (${deletedSessions} sessions removed)`
                        : 'Project deleted',
                )
            }
            emitAppRefresh()
            setPendingDelete(null)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Delete failed')
        } finally {
            setDeleting(false)
        }
    }

    const quickAccessEntries = useMemo(
        () =>
            [
                { label: 'Home', path: homePath ?? null },
                {
                    label: 'Desktop',
                    path: homePath ? `${homePath.replace(/\/+$/g, '')}/Desktop` : null,
                },
                {
                    label: 'Downloads',
                    path: homePath ? `${homePath.replace(/\/+$/g, '')}/Downloads` : null,
                },
                {
                    label: 'Documents',
                    path: homePath ? `${homePath.replace(/\/+$/g, '')}/Documents` : null,
                },
            ].filter(
                (entry): entry is { label: string; path: string } =>
                    typeof entry.path === 'string' && entry.path.length > 0,
            ),
        [homePath],
    )

    if (collapsed) {
        return (
            <div className="flex h-full w-12 flex-col bg-sidebar">
                <div className="flex h-10 items-center justify-center">
                    <Button
                        onClick={() => setCollapsed(false)}
                        variant="ghost"
                        size="icon-sm"
                        className="size-7"
                    >
                        <ChevronRight className="size-3.5" />
                    </Button>
                </div>

                <div className="flex flex-1 flex-col items-center overflow-auto py-1">
                    <Button
                        onClick={() => {
                            void handleOpenPicker()
                        }}
                        variant="ghost"
                        size="icon-sm"
                        className="mb-1 size-7"
                        title="Add project"
                    >
                        <FolderPlus className="size-3.5" />
                    </Button>
                </div>

                <div className="py-1">
                    <NavLink
                        to="/settings/general"
                        state={{ from: `${location.pathname}${location.search}` }}
                        className={({ isActive }) =>
                            cn(
                                'mx-1.5 mb-1 flex size-8 items-center justify-center rounded-md transition-colors',
                                isActive
                                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                                    : 'hover:bg-sidebar-accent',
                            )
                        }
                        title="Settings"
                    >
                        <Settings className="size-3.5" />
                    </NavLink>
                </div>
            </div>
        )
    }

    return (
        <div className="relative flex h-full w-72 flex-col bg-sidebar">
            <div className="flex items-center gap-1 px-2 py-1">
                <Button
                    onClick={() => {
                        void handleOpenPicker()
                    }}
                    variant="ghost"
                    className="h-auto flex-1 justify-start gap-2 px-2 py-1.5 text-xs font-medium"
                >
                    <FolderPlus className="size-3.5" />
                    Add project
                </Button>
                <Button
                    onClick={() => setCollapsed(true)}
                    variant="ghost"
                    size="icon-sm"
                    className="size-6 shrink-0"
                    title="Collapse sidebar"
                >
                    <ChevronLeft className="size-3.5" />
                </Button>
            </div>

            <div className="flex-1 overflow-auto">
                <div className="px-2 py-1">
                    <div className="px-1 py-0.5">
                        <span className="text-xs font-medium text-muted-foreground">Projects</span>
                    </div>

                    <div className="mt-0.5 space-y-1.5">
                        {groupedSessions.map(({ workspace, sessions: workspaceSessions }) => {
                            const selected =
                                workspace.id === selectedWorkspaceId && activeSessionId === null
                            return (
                                <div key={workspace.id} className="space-y-0.5">
                                    <div
                                        className={cn(
                                            'group/workspace flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs transition-colors duration-75',
                                            selected
                                                ? 'bg-sidebar-accent text-foreground'
                                                : 'text-muted-foreground',
                                        )}
                                    >
                                        <button
                                            type="button"
                                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                            onClick={() => onSelectWorkspace(workspace.id)}
                                        >
                                            <FolderGit className="size-3 shrink-0" />
                                            <span className="truncate">{workspace.name}</span>
                                            <span className="text-[11px]">
                                                ({workspaceSessions.length})
                                            </span>
                                        </button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            className="size-[18px]"
                                            onClick={() => {
                                                void handleCreateSession(workspace.id)
                                            }}
                                            title={`New thread in ${workspace.name}`}
                                        >
                                            <Plus className="size-3" />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            className="size-[18px] opacity-0 transition-opacity group-hover/workspace:opacity-100"
                                            onClick={(event) => {
                                                event.stopPropagation()
                                                requestDeleteWorkspace(workspace)
                                            }}
                                            title={`Delete project ${workspace.name}`}
                                        >
                                            <Trash2 className="size-3" />
                                        </Button>
                                    </div>

                                    {workspaceSessions.map((session) => (
                                        <div
                                            key={session.sessionId}
                                            className={cn(
                                                'group/session flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs transition-colors duration-75',
                                                activeSessionId === session.sessionId
                                                    ? 'bg-sidebar-accent text-foreground'
                                                    : 'hover:bg-sidebar-accent',
                                            )}
                                        >
                                            <button
                                                type="button"
                                                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                                                onClick={() => {
                                                    onSelectWorkspace(workspace.id)
                                                    navigate(`/chat?session=${session.sessionId}`)
                                                }}
                                            >
                                                <span
                                                    className={cn(
                                                        'mt-[2px] inline-block size-1.5 shrink-0 rounded-full',
                                                        statusDotClass(session, runtimeBadges),
                                                    )}
                                                />
                                                <span className="truncate font-medium leading-5">
                                                    {session.title}
                                                </span>
                                            </button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon-sm"
                                                className="size-[18px] opacity-0 transition-opacity group-hover/session:opacity-100"
                                                onClick={(event) => {
                                                    event.stopPropagation()
                                                    requestDeleteSession(session)
                                                }}
                                                title={`Delete session ${session.title}`}
                                            >
                                                <Trash2 className="size-3" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )
                        })}

                        {groupedSessions.length === 0 && (
                            <p className="px-1.5 py-1 text-xs text-muted-foreground">No projects</p>
                        )}
                    </div>
                </div>
            </div>

            <div className="px-2 py-1.5">
                <NavLink
                    to="/settings/general"
                    state={{ from: `${location.pathname}${location.search}` }}
                    className={({ isActive }) =>
                        cn(
                            'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                            isActive
                                ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                                : 'hover:bg-sidebar-accent',
                        )
                    }
                >
                    <Settings className="size-3.5" />
                    Settings
                </NavLink>
            </div>

            {pickerOpen && (
                <div className="fixed inset-0 z-50 bg-black/40 p-4 backdrop-blur-sm">
                    <div className="mx-auto flex h-full max-h-[760px] w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
                        <div className="flex items-center justify-between border-b px-4 py-3">
                            <h3 className="font-medium text-sm">Select Project Directory</h3>
                            <Button variant="ghost" size="sm" onClick={() => setPickerOpen(false)}>
                                Close
                            </Button>
                        </div>

                        <div className="border-b px-4 py-2">
                            <div className="mb-2 flex items-center gap-1 overflow-x-auto">
                                {quickAccessEntries.map((item) => (
                                    <Button
                                        key={`${item.label}:${item.path}`}
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 shrink-0 px-2 text-xs"
                                        onClick={() => {
                                            void loadDirectories(item.path)
                                        }}
                                    >
                                        {item.label}
                                    </Button>
                                ))}
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    className="size-7"
                                    onClick={() => {
                                        if (!browserParentPath) return
                                        void loadDirectories(browserParentPath)
                                    }}
                                    disabled={!browserParentPath}
                                    title="Parent directory"
                                >
                                    <Undo2 className="size-4" />
                                </Button>
                                <Input value={browserPath} readOnly className="h-8 text-xs" />
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-auto px-4 py-2">
                            {browsing ? (
                                <p className="text-xs text-muted-foreground">Loading...</p>
                            ) : (
                                <div className="space-y-1">
                                    {browserItems.map((item) => (
                                        <Button
                                            key={`${item.path}-${item.name}`}
                                            variant="ghost"
                                            className="h-auto w-full justify-start px-2 py-1 text-left text-xs"
                                            disabled={!item.readable}
                                            onClick={() => {
                                                void loadDirectories(item.path)
                                            }}
                                        >
                                            <House className="mr-2 size-3 shrink-0 opacity-70" />
                                            <span className="truncate">{item.name}</span>
                                        </Button>
                                    ))}
                                    {browserItems.length === 0 && (
                                        <p className="text-xs text-muted-foreground">
                                            No directories
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="space-y-2 border-t px-4 py-3">
                            <Input
                                value={workspaceName}
                                onChange={(event) => setWorkspaceName(event.target.value)}
                                placeholder="Project name (optional)"
                                className="h-8 text-xs"
                            />
                            <Button
                                className="h-8 w-full text-xs"
                                onClick={() => {
                                    void handleAddCurrentPath()
                                }}
                            >
                                Add this project
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {pendingDelete && (
                <div
                    className="fixed inset-0 z-[70] bg-black/40 p-4 backdrop-blur-sm"
                    onClick={() => {
                        if (deleting) return
                        setPendingDelete(null)
                    }}
                >
                    <div
                        className="mx-auto mt-[18vh] w-full max-w-md rounded-xl border bg-background p-4 shadow-2xl"
                        onClick={(event) => {
                            event.stopPropagation()
                        }}
                    >
                        <h3 className="text-sm font-medium">
                            {pendingDelete.kind === 'session'
                                ? 'Delete session?'
                                : 'Delete project?'}
                        </h3>
                        <p className="mt-2 text-xs text-muted-foreground">
                            {pendingDelete.kind === 'session'
                                ? `This will permanently delete "${pendingDelete.title}".`
                                : `This will remove project "${pendingDelete.name}".`}
                        </p>
                        <div className="mt-4 flex items-center justify-end gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={deleting}
                                onClick={() => {
                                    setPendingDelete(null)
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                size="sm"
                                disabled={deleting}
                                onClick={() => {
                                    void handleConfirmDelete()
                                }}
                            >
                                {deleting ? 'Deleting...' : 'Delete'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
