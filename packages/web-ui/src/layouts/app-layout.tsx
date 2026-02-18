import { useCallback, useEffect, useMemo, useState } from 'react'
import { Menu } from 'lucide-react'
import { Outlet, useLocation } from 'react-router-dom'
import { chatApi, sessionsApi, wsSubscribe } from '@/api'
import { MemoLogo } from '@/components/layout/memo-logo'
import { Sidebar } from '@/components/layout/sidebar'
import { Button } from '@/components/ui/button'
import type { SessionListItem } from '@/api/types'
import { useChatStore, useWorkspaceStore } from '@/stores'
import { onAppRefresh } from '@/utils/refresh-bus'
import { getErrorMessage } from '@/utils/error'

export function AppLayout() {
    const [sessions, setSessions] = useState<SessionListItem[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
    const location = useLocation()

    const workspaces = useWorkspaceStore((state) => state.items)
    const selectedWorkspaceId = useWorkspaceStore((state) => state.selectedWorkspaceId)
    const setSelectedWorkspaceId = useWorkspaceStore((state) => state.setSelectedWorkspaceId)
    const loadWorkspaces = useWorkspaceStore((state) => state.loadWorkspaces)

    const runtimeBadges = useChatStore((state) => state.runtimeBadges)
    const setRuntimeBadges = useChatStore((state) => state.setRuntimeBadges)
    const createSession = useChatStore((state) => state.createSession)

    const loadSessions = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const response = await sessionsApi.getSessions({
                page: 1,
                pageSize: 200,
                sortBy: 'updatedAt',
                order: 'desc',
            })
            setSessions(response.items)
        } catch (err) {
            setError(getErrorMessage(err, 'Failed to load sessions'))
        } finally {
            setLoading(false)
        }
    }, [])

    const createSessionForWorkspace = useCallback(
        async (workspaceId: string) => {
            const sessionId = await createSession(workspaceId)
            if (!sessionId) return null
            await loadSessions()
            return sessionId
        },
        [createSession, loadSessions],
    )

    const loadRuntimeBadges = useCallback(async () => {
        try {
            const response = await chatApi.listChatRuntimes({})
            setRuntimeBadges(response.items)
        } catch {
            // Ignore runtime badge bootstrap errors.
        }
    }, [setRuntimeBadges])

    const bootstrap = useCallback(async () => {
        await Promise.all([loadWorkspaces(), loadSessions(), loadRuntimeBadges()])
    }, [loadRuntimeBadges, loadSessions, loadWorkspaces])

    useEffect(() => {
        void bootstrap()
    }, [bootstrap])

    useEffect(() => {
        return onAppRefresh(() => {
            void bootstrap()
        })
    }, [bootstrap])

    useEffect(() => {
        const unsubs = [
            wsSubscribe('workspace.changed', () => {
                void Promise.all([loadWorkspaces(), loadSessions()])
            }),
            wsSubscribe('chat.runtime.status', () => {
                void loadSessions()
            }),
        ]
        return () => {
            for (const unsub of unsubs) {
                unsub()
            }
        }
    }, [loadSessions, loadWorkspaces])

    const workspaceById = useMemo(() => {
        const map = new Map<string, { id: string; name: string; cwd: string }>()
        for (const workspace of workspaces) {
            map.set(workspace.id, workspace)
        }
        return map
    }, [workspaces])

    const mobileTitle = useMemo(() => {
        if (location.pathname.startsWith('/settings')) return 'Settings'
        if (location.pathname.startsWith('/mcp')) return 'MCP Servers'
        if (location.pathname.startsWith('/skills')) return 'Skills'
        if (location.pathname.startsWith('/chat')) return 'Chat'
        return 'Memo Code'
    }, [location.pathname])

    useEffect(() => {
        setMobileSidebarOpen(false)
    }, [location.pathname, location.search])

    return (
        <div className="flex h-dvh w-full overflow-hidden bg-background">
            <Sidebar
                sessions={sessions}
                runtimeBadges={runtimeBadges}
                workspaces={workspaces}
                selectedWorkspaceId={selectedWorkspaceId}
                onSelectWorkspace={setSelectedWorkspaceId}
                onCreateSession={createSessionForWorkspace}
                mobileOpen={mobileSidebarOpen}
                onMobileOpenChange={setMobileSidebarOpen}
            />
            <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <header className="flex h-12 items-center border-b px-3 md:hidden">
                    <div className="flex min-w-0 items-center gap-2">
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            className="size-7"
                            onClick={() => setMobileSidebarOpen(true)}
                            title="Open navigation"
                        >
                            <Menu className="size-4" />
                        </Button>
                        <MemoLogo className="size-5" />
                        <span className="truncate text-sm font-medium">{mobileTitle}</span>
                    </div>
                </header>
                <div className="min-h-0 flex-1 overflow-hidden">
                    <Outlet
                        context={{
                            sessions,
                            loading,
                            error,
                            refreshSessions: loadSessions,
                            workspaces,
                            selectedWorkspaceId,
                            selectedWorkspace:
                                selectedWorkspaceId && workspaceById.has(selectedWorkspaceId)
                                    ? workspaceById.get(selectedWorkspaceId)
                                    : null,
                            createSessionForWorkspace,
                        }}
                    />
                </div>
            </main>
        </div>
    )
}
