import { cn } from '@/lib/utils'
import type { SessionTurnStep } from '@/api/types'

type ToolAction = NonNullable<SessionTurnStep['action']>

const MAIN_PARAM_KEYS = [
    'cmd',
    'path',
    'file_path',
    'dir_path',
    'query',
    'pattern',
    'url',
    'content',
]
const PATH_PARAM_KEYS = new Set(['path', 'file_path', 'dir_path'])

function truncate(value: string, max = 80): string {
    if (value.length <= max) return value
    return `${value.slice(0, Math.max(0, max - 1))}...`
}

function safeStringify(value: unknown): string {
    if (typeof value === 'string') return value
    try {
        return JSON.stringify(value)
    } catch {
        return String(value)
    }
}

function looksLikePathInput(value: string): boolean {
    if (!value) return false
    return (
        value.startsWith('/') ||
        value.startsWith('./') ||
        value.startsWith('../') ||
        value.includes('/')
    )
}

function toRelativeDisplayPath(value: string, cwd: string): string {
    if (!cwd) return value
    const normalizedCwd = cwd.endsWith('/') ? cwd.slice(0, -1) : cwd
    if (!normalizedCwd) return value
    if (value === normalizedCwd) return '.'
    const prefix = `${normalizedCwd}/`
    if (value.startsWith(prefix)) {
        return value.slice(prefix.length)
    }
    return value
}

function mainParam(input: unknown, cwd: string): string | null {
    if (input === undefined || input === null) return null

    if (typeof input === 'string') {
        const display = looksLikePathInput(input) ? toRelativeDisplayPath(input, cwd) : input
        return truncate(display, 80)
    }

    if (typeof input !== 'object' || Array.isArray(input)) {
        return truncate(String(input), 80)
    }

    const record = input as Record<string, unknown>
    for (const key of MAIN_PARAM_KEYS) {
        const raw = record[key]
        if (raw === undefined || raw === null || raw === '') continue
        const value = String(raw)
        const display = PATH_PARAM_KEYS.has(key) ? toRelativeDisplayPath(value, cwd) : value
        return truncate(display, 80)
    }

    return truncate(safeStringify(record), 80)
}

function resolveToolStatusTone(resultStatus?: string): { dotClass: string } {
    if (!resultStatus) {
        return {
            dotClass: 'bg-amber-500',
        }
    }

    if (resultStatus === 'success') {
        return {
            dotClass: 'bg-emerald-500',
        }
    }

    return {
        dotClass: 'bg-red-500',
    }
}

function getStepActions(step: SessionTurnStep): ToolAction[] {
    if (step.parallelActions && step.parallelActions.length > 1) {
        return step.parallelActions
    }
    if (step.action) {
        return [step.action]
    }
    return []
}

export function ToolStepCard({ step, cwd }: { step: SessionTurnStep; cwd: string }) {
    const actions = getStepActions(step)
    if (actions.length === 0) return null

    const statusTone = resolveToolStatusTone(step.resultStatus)

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {actions.map((action, index) => {
                const param = mainParam(action.input, cwd)
                return (
                    <div
                        key={`${action.tool}-${index}`}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted/70 px-2 py-1 text-[11px]"
                    >
                        <span className={cn('size-1.5 shrink-0 rounded-full', statusTone.dotClass)} />
                        <span className="font-medium text-foreground">{action.tool}</span>
                        {param ? (
                            <span className="max-w-[280px] truncate text-muted-foreground">
                                ({param})
                            </span>
                        ) : null}
                    </div>
                )
            })}
        </div>
    )
}
