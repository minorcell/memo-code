import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { MemoLogo } from '@/components/layout/memo-logo'
import type { WorkspaceRecord } from '@/api/types'

type ChatEmptyStateProps = {
    workspaces: WorkspaceRecord[]
    selectedWorkspaceId: string | null
    onQuickSelectWorkspace: (workspaceId: string) => Promise<void> | void
}

export function ChatEmptyState({
    workspaces,
    selectedWorkspaceId,
    onQuickSelectWorkspace,
}: ChatEmptyStateProps) {
    return (
        <div className="mx-auto w-full max-w-xl text-center">
            <div className="flex flex-col items-center gap-2">
                <MemoLogo className="size-10" />
                <h2 className="text-xl font-semibold">Memo Code</h2>
                <p className="text-sm text-muted-foreground">
                    Local-first coding workspace assistant.
                </p>
            </div>

            <div className="mt-6 space-y-3">
                <p className="text-sm text-muted-foreground">Select a project to start a new session.</p>
                {workspaces.length > 0 ? (
                    <div className="mx-auto w-full max-w-[220px]">
                        <Select
                            value={selectedWorkspaceId ?? undefined}
                            onValueChange={(workspaceId) => {
                                void onQuickSelectWorkspace(workspaceId)
                            }}
                        >
                            <SelectTrigger className="h-9 w-full">
                                <SelectValue placeholder="Choose project" />
                            </SelectTrigger>
                            <SelectContent>
                                {workspaces.map((workspace) => (
                                    <SelectItem key={workspace.id} value={workspace.id}>
                                        {workspace.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        No project yet. Add one from the left sidebar.
                    </p>
                )}
            </div>
        </div>
    )
}
