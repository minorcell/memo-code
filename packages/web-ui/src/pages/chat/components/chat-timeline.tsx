import { Loader2 } from 'lucide-react'
import type { RefObject } from 'react'
import type { ChatTurn, WorkspaceRecord } from '@/api/types'
import { ChatEmptyState } from '@/pages/chat/components/chat-empty-state'
import { MarkdownMessage } from '@/pages/chat/components/markdown-message'
import { ToolStepCard } from '@/pages/chat/components/tool-step-card'
import { stripThinkingBlocks } from '@/utils/thinking'

type ChatTimelineProps = {
    hasActiveSession: boolean
    workspaces: WorkspaceRecord[]
    selectedWorkspaceId: string | null
    onQuickSelectWorkspace: (workspaceId: string) => Promise<void> | void
    turns: ChatTurn[]
    sessionCwd: string
    messagesEndRef: RefObject<HTMLDivElement | null>
}

export function ChatTimeline({
    hasActiveSession,
    workspaces,
    selectedWorkspaceId,
    onQuickSelectWorkspace,
    turns,
    sessionCwd,
    messagesEndRef,
}: ChatTimelineProps) {
    if (!hasActiveSession) {
        return (
            <div className="flex-1 overflow-auto">
                <div className="px-3 py-4 sm:px-4 sm:py-6">
                    <div className="mx-auto flex min-h-full max-w-3xl items-center justify-center">
                        <div className="w-full translate-y-16">
                            <ChatEmptyState
                                workspaces={workspaces}
                                selectedWorkspaceId={selectedWorkspaceId}
                                onQuickSelectWorkspace={onQuickSelectWorkspace}
                            />
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="flex-1 overflow-auto">
            <div className="px-3 py-4 sm:px-4 sm:py-6">
                <div className="mx-auto max-w-3xl">
                    {turns.map((turn) => {
                        const assistantContent = stripThinkingBlocks(turn.assistant)
                        const normalizedAssistant = assistantContent.trim()
                        const normalizedError = turn.errorMessage?.trim() ?? ''
                        const shouldShowError =
                            Boolean(normalizedError) && normalizedError !== normalizedAssistant
                        const stepViews = (turn.steps ?? [])
                            .map((step) => {
                                const thinkingText = step.thinking
                                    ? stripThinkingBlocks(step.thinking).trim()
                                    : ''
                                const assistantStepText = step.assistantText
                                    ? stripThinkingBlocks(step.assistantText).trim()
                                    : ''
                                const hasToolAction = Boolean(
                                    (step.parallelActions && step.parallelActions.length > 1) ||
                                    step.action,
                                )
                                const showAssistantStep =
                                    Boolean(assistantStepText) && !hasToolAction
                                const hasRenderableContent =
                                    Boolean(thinkingText) || hasToolAction || showAssistantStep
                                return {
                                    step,
                                    thinkingText,
                                    assistantStepText,
                                    hasToolAction,
                                    showAssistantStep,
                                    hasRenderableContent,
                                }
                            })
                            .filter((item) => item.hasRenderableContent)
                        const hasStepAssistantText = stepViews.some(
                            (item) => item.showAssistantStep,
                        )
                        const shouldShowGlobalAssistant =
                            Boolean(normalizedAssistant) &&
                            !hasStepAssistantText &&
                            (turn.status !== 'running' || stepViews.length === 0)
                        return (
                            <div key={turn.turn} className="mb-6">
                                <div className="mb-4 flex justify-end">
                                    <div className="max-w-[92%] rounded-2xl bg-muted px-3 py-2 text-sm font-medium leading-relaxed text-foreground sm:max-w-[85%]">
                                        <MarkdownMessage content={turn.input} />
                                    </div>
                                </div>
                                <div className="flex-1 space-y-2">
                                    <div className="space-y-2">
                                        {stepViews.map((item) => (
                                            <div
                                                key={`${turn.turn}-step-${item.step.step}`}
                                                className="space-y-2"
                                            >
                                                {item.thinkingText ? (
                                                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                                                        {item.thinkingText}
                                                    </p>
                                                ) : null}
                                                {item.hasToolAction ? (
                                                    <ToolStepCard
                                                        step={item.step}
                                                        cwd={sessionCwd}
                                                    />
                                                ) : null}
                                                {item.showAssistantStep ? (
                                                    <div className="text-sm leading-relaxed">
                                                        <MarkdownMessage
                                                            content={item.assistantStepText}
                                                            isStreaming={turn.status === 'running'}
                                                        />
                                                    </div>
                                                ) : null}
                                            </div>
                                        ))}
                                    </div>

                                    <div className="text-sm leading-relaxed">
                                        {shouldShowGlobalAssistant ? (
                                            <MarkdownMessage
                                                content={assistantContent}
                                                isStreaming={turn.status === 'running'}
                                            />
                                        ) : turn.status === 'running' ? (
                                            <span className="inline-flex items-center gap-2 text-muted-foreground">
                                                <Loader2 className="size-4 animate-spin" />
                                                Thinking...
                                            </span>
                                        ) : null}
                                    </div>

                                    {shouldShowError && (
                                        <p className="text-sm text-destructive">
                                            {turn.errorMessage}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )
                    })}

                    <div ref={messagesEndRef} />
                </div>
            </div>
        </div>
    )
}
