import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { cjk } from '@streamdown/cjk'
import { code } from '@streamdown/code'
import { mermaid } from '@streamdown/mermaid'
import { Streamdown } from 'streamdown'
import { FileText, Folder, Globe, Loader2, Trash2, X, Zap } from 'lucide-react'
import type { SkillDetail, SkillRecord } from '@/api/types'
import { skillsApi } from '@/api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useSkillsStore } from '@/stores'

const streamdownPlugins = {
    code,
    mermaid,
    cjk,
}

export function SkillsPage() {
    const [detailTarget, setDetailTarget] = useState<SkillRecord | null>(null)
    const [detail, setDetail] = useState<SkillDetail | null>(null)
    const [detailLoading, setDetailLoading] = useState(false)
    const [detailError, setDetailError] = useState<string | null>(null)

    const items = useSkillsStore((state) => state.items)
    const loading = useSkillsStore((state) => state.loading)
    const error = useSkillsStore((state) => state.error)
    const load = useSkillsStore((state) => state.load)
    const remove = useSkillsStore((state) => state.remove)
    const toggleActive = useSkillsStore((state) => state.toggleActive)

    useEffect(() => {
        if (items.length > 0) return
        void load()
    }, [items.length, load])

    const globalSkills = useMemo(
        () => items.filter((item) => item.scope === 'global'),
        [items],
    )
    const projectSkills = useMemo(
        () => items.filter((item) => item.scope === 'project'),
        [items],
    )

    useEffect(() => {
        if (!detailTarget) return
        const latest = items.find((item) => item.id === detailTarget.id)
        if (latest) {
            setDetailTarget(latest)
        }
    }, [items, detailTarget?.id])

    useEffect(() => {
        const targetId = detailTarget?.id
        if (!targetId) {
            setDetail(null)
            setDetailLoading(false)
            setDetailError(null)
            return
        }

        let cancelled = false
        setDetailLoading(true)
        setDetail(null)
        setDetailError(null)

        void skillsApi
            .getSkill(targetId)
            .then((response) => {
                if (cancelled) return
                setDetail(response)
                setDetailLoading(false)
            })
            .catch((reason: unknown) => {
                if (cancelled) return
                const message =
                    reason instanceof Error ? reason.message : 'Failed to load skill detail'
                setDetailError(message)
                setDetailLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [detailTarget?.id])

    async function handleDelete(skill: SkillRecord) {
        if (detailTarget?.id === skill.id) {
            setDetailTarget(null)
            setDetail(null)
            setDetailError(null)
            setDetailLoading(false)
        }
        await remove(skill.id)
    }

    function closeDetailModal() {
        setDetailTarget(null)
        setDetail(null)
        setDetailError(null)
        setDetailLoading(false)
    }

    return (
        <div className="flex h-full flex-col">
            <header className="flex min-h-14 flex-wrap items-center justify-between gap-2 px-4 py-2">
                <div className="flex min-w-0 items-center gap-3">
                    <Zap className="size-5" />
                    <h1 className="text-sm font-medium">Skills</h1>
                    <Badge variant="outline" className="text-xs">
                        {items.length}
                    </Badge>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void load()}
                        disabled={loading}
                        className="h-8"
                    >
                        {loading ? <Loader2 className="size-4 animate-spin" /> : 'Refresh'}
                    </Button>
                </div>
            </header>

            <div className="flex-1 overflow-auto p-4">
                {error ? (
                    <Alert variant="destructive" className="mb-4">
                        <AlertTitle>Operation failed</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : null}

                <section className="space-y-4">
                    {globalSkills.length > 0 ? (
                        <SkillSection
                            icon={<Globe className="size-3" />}
                            title="Global Skills"
                            skills={globalSkills}
                            activeId={detailTarget?.id ?? null}
                            onOpen={(skill) => setDetailTarget(skill)}
                            onDelete={(skill) => {
                                void handleDelete(skill)
                            }}
                            onToggleActive={(skill, active) => {
                                void toggleActive(skill.id, active)
                            }}
                        />
                    ) : null}

                    {projectSkills.length > 0 ? (
                        <SkillSection
                            icon={<Folder className="size-3" />}
                            title="Project Skills"
                            skills={projectSkills}
                            activeId={detailTarget?.id ?? null}
                            onOpen={(skill) => setDetailTarget(skill)}
                            onDelete={(skill) => {
                                void handleDelete(skill)
                            }}
                            onToggleActive={(skill, active) => {
                                void toggleActive(skill.id, active)
                            }}
                        />
                    ) : null}

                    {items.length === 0 && !loading ? (
                        <Card className="border-0 bg-muted/20 shadow-none">
                            <CardContent className="py-10 text-center text-muted-foreground">
                                <Zap className="mx-auto mb-2 size-8 opacity-50" />
                                <p className="text-sm">No skills found</p>
                                <p className="text-xs">Skills will appear here when available</p>
                            </CardContent>
                        </Card>
                    ) : null}
                </section>
            </div>

            {detailTarget ? (
                <div
                    className="fixed inset-0 z-50 bg-black/45 p-2 backdrop-blur-sm sm:p-4"
                    onClick={closeDetailModal}
                >
                    <div
                        className="mx-auto flex h-full max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-background shadow-2xl"
                        onClick={(event) => {
                            event.stopPropagation()
                        }}
                    >
                        <header className="flex items-start justify-between gap-4 px-5 py-4">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <h2 className="truncate text-base font-semibold">
                                        {detail?.name ?? detailTarget.name}
                                    </h2>
                                    <Badge
                                        className={cn(
                                            detailTarget.scope === 'global'
                                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                                                : 'bg-muted text-muted-foreground',
                                        )}
                                    >
                                        {detailTarget.scope}
                                    </Badge>
                                    <Badge
                                        className={cn(
                                            detailTarget.active
                                                ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                                                : 'bg-muted text-muted-foreground',
                                        )}
                                    >
                                        {detailTarget.active ? 'Active' : 'Inactive'}
                                    </Badge>
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {detail?.description ?? detailTarget.description}
                                </p>
                            </div>
                            <Button variant="ghost" size="icon-sm" onClick={closeDetailModal}>
                                <X className="size-4" />
                            </Button>
                        </header>

                        <div className="px-5 pb-3">
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                Path
                            </p>
                            <div className="mt-1 rounded-lg bg-muted/40 px-3 py-2">
                                <p className="break-all font-mono text-xs">
                                    {detail?.path ?? detailTarget.path}
                                </p>
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
                            {detailLoading ? (
                                <div className="space-y-2">
                                    <Skeleton className="h-5 w-2/3" />
                                    <Skeleton className="h-4 w-1/3" />
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-80 w-full" />
                                </div>
                            ) : detailError ? (
                                <Alert variant="destructive">
                                    <AlertTitle>Failed to load detail</AlertTitle>
                                    <AlertDescription>{detailError}</AlertDescription>
                                </Alert>
                            ) : detail ? (
                                <Streamdown
                                    mode="static"
                                    plugins={streamdownPlugins}
                                    className="text-sm leading-relaxed"
                                >
                                    {detail.content}
                                </Streamdown>
                            ) : null}
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    )
}

function SkillSection({
    icon,
    title,
    skills,
    activeId,
    onOpen,
    onDelete,
    onToggleActive,
}: {
    icon: ReactNode
    title: string
    skills: SkillRecord[]
    activeId: string | null
    onOpen: (skill: SkillRecord) => void
    onDelete: (skill: SkillRecord) => void
    onToggleActive: (skill: SkillRecord, active: boolean) => void
}) {
    return (
        <div>
            <h2 className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {icon}
                {title}
            </h2>
            <div className="space-y-2">
                {skills.map((skill) => (
                    <SkillCard
                        key={skill.id}
                        skill={skill}
                        selected={skill.id === activeId}
                        onOpen={() => onOpen(skill)}
                        onDelete={() => onDelete(skill)}
                        onToggleActive={(active) => onToggleActive(skill, active)}
                    />
                ))}
            </div>
        </div>
    )
}

function SkillCard({
    skill,
    selected,
    onOpen,
    onDelete,
    onToggleActive,
}: {
    skill: SkillRecord
    selected: boolean
    onOpen: () => void
    onDelete: () => void
    onToggleActive: (active: boolean) => void
}) {
    return (
        <Card
            className={cn(
                'gap-0 border-0 py-0 shadow-none transition-colors',
                selected ? 'bg-primary/10' : 'bg-card hover:bg-muted/35',
            )}
        >
            <CardContent className="p-0">
                <div
                    role="button"
                    tabIndex={0}
                    onClick={onOpen}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            onOpen()
                        }
                    }}
                    className={cn(
                        'flex flex-col gap-3 p-3 text-left outline-none sm:flex-row sm:items-start',
                        selected ? 'bg-primary/[0.02]' : '',
                    )}
                >
                    <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                        <FileText className="size-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <h3 className="truncate text-sm font-medium">{skill.name}</h3>
                            <Badge
                                className={cn(
                                    'shrink-0 text-xs',
                                    skill.scope === 'global'
                                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                                        : 'bg-muted text-muted-foreground',
                                )}
                            >
                                {skill.scope}
                            </Badge>
                            <Badge
                                className={cn(
                                    'shrink-0 text-xs',
                                    skill.active
                                        ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                                        : 'bg-muted text-muted-foreground',
                                )}
                            >
                                {skill.active ? 'Active' : 'Inactive'}
                            </Badge>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                            {skill.description}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{skill.path}</p>
                    </div>
                    <div
                        className="flex items-center gap-2 self-end sm:self-auto"
                        onClick={(event) => {
                            event.stopPropagation()
                        }}
                    >
                        <span className="text-xs text-muted-foreground">Use</span>
                        <Switch checked={skill.active} onCheckedChange={onToggleActive} />
                    </div>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={(event) => {
                            event.stopPropagation()
                            onDelete()
                        }}
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                        <Trash2 className="size-4" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
