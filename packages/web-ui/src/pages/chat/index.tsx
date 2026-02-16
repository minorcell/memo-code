import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { chatApi } from '@/api'
import type { ChatProviderRecord, WorkspaceRecord } from '@/api/types'
import { ChatInputPanel } from '@/pages/chat/components/chat-input-panel'
import { ChatTimeline } from '@/pages/chat/components/chat-timeline'
import { useChatStore, useWorkspaceStore } from '@/stores'

type ToolPermissionMode = 'none' | 'once' | 'full'
type ApprovalDecision = 'once' | 'session' | 'deny'
type LayoutContext = {
    workspaces: WorkspaceRecord[]
    selectedWorkspaceId: string | null
    selectedWorkspace: { id: string; name: string; cwd: string } | null
    createSessionForWorkspace: (workspaceId: string) => Promise<string | null>
}

export function ChatPage() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const [input, setInput] = useState('')
    const [providers, setProviders] = useState<ChatProviderRecord[]>([])
    const [loadingProviders, setLoadingProviders] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const layout = useOutletContext<LayoutContext>()

    const liveSession = useChatStore((state) => state.liveSession)
    const turns = useChatStore((state) => state.turns)
    const systemMessages = useChatStore((state) => state.systemMessages)
    const connected = useChatStore((state) => state.connected)
    const error = useChatStore((state) => state.error)
    const clearError = useChatStore((state) => state.clearError)
    const attachSession = useChatStore((state) => state.attachSession)
    const sendInput = useChatStore((state) => state.sendInput)
    const cancelCurrentTurn = useChatStore((state) => state.cancelCurrentTurn)
    const approvePendingApproval = useChatStore((state) => state.approvePendingApproval)
    const connectStream = useChatStore((state) => state.connectStream)
    const disconnectStream = useChatStore((state) => state.disconnectStream)
    const setSelectedWorkspaceId = useWorkspaceStore((state) => state.setSelectedWorkspaceId)

    const liveSessionId = liveSession?.id ?? null
    const pendingApproval = liveSession?.pendingApproval
    const selectedSessionId = searchParams.get('session')?.trim() || null
    const hasActiveSession = Boolean(liveSessionId)

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [turns, systemMessages])

    useEffect(() => {
        if (!error) return
        toast.error(error)
        clearError()
    }, [error, clearError])

    useEffect(() => {
        if (!selectedSessionId) return
        if (selectedSessionId !== liveSessionId) {
            void attachSession(selectedSessionId)
            return
        }
        if (!connected) {
            connectStream(selectedSessionId)
        }
    }, [selectedSessionId, liveSessionId, connected, attachSession, connectStream])

    useEffect(() => {
        return () => {
            disconnectStream()
        }
    }, [disconnectStream])

    useEffect(() => {
        let cancelled = false
        setLoadingProviders(true)
        void chatApi
            .listChatProviders()
            .then((items) => {
                if (cancelled) return
                setProviders(items)
            })
            .catch(() => {
                if (cancelled) return
                setProviders([])
            })
            .finally(() => {
                if (cancelled) return
                setLoadingProviders(false)
            })

        return () => {
            cancelled = true
        }
    }, [])

    async function handleSend() {
        const value = input.trim()
        if (!value || !hasActiveSession) return
        setInput('')
        await sendInput(value)
    }

    const isRunning = turns.some((item) => item.status === 'running')
    const modelOptions = useMemo(() => {
        const list = [...providers]
        if (
            liveSession?.providerName &&
            !list.some((item) => item.name === liveSession.providerName)
        ) {
            list.unshift({
                name: liveSession.providerName,
                model: liveSession.model,
                isCurrent: true,
            })
        }
        return list
    }, [providers, liveSession?.providerName, liveSession?.model])

    async function handleModelChange(nextProviderName: string) {
        if (!liveSession || isRunning) return
        if (!nextProviderName || nextProviderName === liveSession.providerName) return
        await sendInput(`/models ${nextProviderName}`)
    }

    async function handleToolModeChange(mode: ToolPermissionMode) {
        if (!liveSession || isRunning) return
        if (mode === liveSession.toolPermissionMode) return
        await sendInput(`/tools ${mode}`)
    }

    async function handleQuickSelectWorkspace(workspaceId: string) {
        const nextWorkspaceId = workspaceId.trim()
        if (!nextWorkspaceId) return
        setSelectedWorkspaceId(nextWorkspaceId)
        const sessionId = await layout.createSessionForWorkspace(nextWorkspaceId)
        if (!sessionId) return
        navigate(`/chat?session=${sessionId}`)
    }

    async function handleApprovalDecision(decision: ApprovalDecision) {
        await approvePendingApproval(decision)
    }

    return (
        <div className="flex h-full flex-col bg-background">
            <ChatTimeline
                hasActiveSession={hasActiveSession}
                workspaces={layout.workspaces}
                selectedWorkspaceId={layout.selectedWorkspaceId}
                onQuickSelectWorkspace={handleQuickSelectWorkspace}
                turns={turns}
                sessionCwd={liveSession?.cwd ?? ''}
                systemMessages={systemMessages}
                messagesEndRef={messagesEndRef}
            />
            <ChatInputPanel
                input={input}
                onInputChange={setInput}
                onSend={handleSend}
                hasActiveSession={hasActiveSession}
                isRunning={isRunning}
                liveSession={liveSession}
                pendingApproval={pendingApproval}
                modelOptions={modelOptions}
                loadingProviders={loadingProviders}
                onModelChange={handleModelChange}
                onToolModeChange={handleToolModeChange}
                onCancelTurn={cancelCurrentTurn}
                onApprovalDecision={handleApprovalDecision}
                sessionId={liveSession?.id ?? selectedSessionId}
                workspaceId={liveSession?.workspaceId ?? layout.selectedWorkspaceId}
            />
        </div>
    )
}
