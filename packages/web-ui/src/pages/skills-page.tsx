import { useEffect, useMemo, useState } from 'react'
import { Zap, Plus, Search, Globe, Folder, Trash2, FileText, Loader2, X } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { useSkillsStore } from '@/stores'
import { cn } from '@/lib/utils'

export function SkillsPage() {
    const [showAddForm, setShowAddForm] = useState(false)
    const [scope, setScope] = useState<'project' | 'global'>('project')
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [searchQuery, setSearchQuery] = useState('')

    const items = useSkillsStore((state) => state.items)
    const loading = useSkillsStore((state) => state.loading)
    const error = useSkillsStore((state) => state.error)
    const load = useSkillsStore((state) => state.load)
    const create = useSkillsStore((state) => state.create)
    const remove = useSkillsStore((state) => state.remove)

    useEffect(() => {
        if (items.length > 0) return
        void load()
    }, [items.length, load])

    async function handleCreate() {
        const trimmed = name.trim()
        if (!trimmed) return
        await create({
            scope,
            name: trimmed,
            description: description.trim() || `${trimmed} skill`,
        })
        setName('')
        setDescription('')
        setShowAddForm(false)
    }

    const filteredItems = useMemo(
        () =>
            items.filter(
                (item) =>
                    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    item.description.toLowerCase().includes(searchQuery.toLowerCase()),
            ),
        [items, searchQuery],
    )

    const globalSkills = filteredItems.filter((s) => s.scope === 'global')
    const projectSkills = filteredItems.filter((s) => s.scope === 'project')

    return (
        <div className="flex h-full flex-col">
            <header className="flex h-14 items-center justify-between border-b px-4">
                <div className="flex items-center gap-3">
                    <Zap className="size-5" />
                    <h1 className="text-sm font-medium">Skills</h1>
                    <Badge variant="outline" className="text-xs">
                        {items.length}
                    </Badge>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void load()}
                        disabled={loading}
                        className="h-8"
                    >
                        {loading ? <Loader2 className="size-4 animate-spin" /> : 'Refresh'}
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => setShowAddForm(true)}
                        disabled={showAddForm}
                        className="h-8 gap-1.5"
                    >
                        <Plus className="size-4" />
                        Create Skill
                    </Button>
                </div>
            </header>

            <div className="flex-1 overflow-auto">
                {error ? (
                    <div className="mx-4 mt-4">
                        <Alert variant="destructive">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    </div>
                ) : null}

                {showAddForm ? (
                    <div className="border-b bg-muted/30 p-4">
                        <Card className="mx-auto max-w-xl gap-0 py-0">
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between gap-2">
                                    <div>
                                        <CardTitle className="text-sm">Create New Skill</CardTitle>
                                        <CardDescription>
                                            Define a reusable skill entry.
                                        </CardDescription>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        onClick={() => setShowAddForm(false)}
                                    >
                                        <X className="size-4" />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3 pb-4">
                                <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="skill-scope">Scope</Label>
                                        <Select
                                            value={scope}
                                            onValueChange={(value) => {
                                                if (value === 'project' || value === 'global') {
                                                    setScope(value)
                                                }
                                            }}
                                        >
                                            <SelectTrigger id="skill-scope" className="w-full">
                                                <SelectValue placeholder="Select scope" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="project">Project</SelectItem>
                                                <SelectItem value="global">Global</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="skill-name">Name</Label>
                                        <Input
                                            id="skill-name"
                                            type="text"
                                            placeholder="Skill name"
                                            value={name}
                                            onChange={(event) => setName(event.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="skill-description">Description</Label>
                                    <Input
                                        id="skill-description"
                                        type="text"
                                        placeholder="Description (optional)"
                                        value={description}
                                        onChange={(event) => setDescription(event.target.value)}
                                    />
                                </div>
                                <div className="flex justify-end gap-2">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setShowAddForm(false)}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={() => void handleCreate()}
                                        disabled={!name.trim() || loading}
                                    >
                                        Create
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                ) : null}

                <div className="border-b px-4 py-3">
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input
                            type="text"
                            placeholder="Search skills..."
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            className="pl-9"
                        />
                    </div>
                </div>

                <div className="mx-auto max-w-3xl p-4">
                    {globalSkills.length > 0 ? (
                        <div className="mb-6">
                            <h2 className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                <Globe className="size-3" />
                                Global Skills
                            </h2>
                            <div className="space-y-2">
                                {globalSkills.map((skill) => (
                                    <SkillCard
                                        key={skill.id}
                                        skill={skill}
                                        onDelete={() => void remove(skill.id)}
                                    />
                                ))}
                            </div>
                        </div>
                    ) : null}

                    {projectSkills.length > 0 ? (
                        <div>
                            <h2 className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                <Folder className="size-3" />
                                Project Skills
                            </h2>
                            <div className="space-y-2">
                                {projectSkills.map((skill) => (
                                    <SkillCard
                                        key={skill.id}
                                        skill={skill}
                                        onDelete={() => void remove(skill.id)}
                                    />
                                ))}
                            </div>
                        </div>
                    ) : null}

                    {filteredItems.length === 0 && !loading ? (
                        <div className="flex h-64 flex-col items-center justify-center text-muted-foreground">
                            <Zap className="mb-2 size-8 opacity-50" />
                            <p className="text-sm">No skills found</p>
                            {searchQuery ? (
                                <p className="text-xs">Try adjusting your search</p>
                            ) : (
                                <p className="text-xs">Create a skill to get started</p>
                            )}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    )
}

interface SkillCardProps {
    skill: {
        id: string
        name: string
        description: string
        scope: 'project' | 'global'
        path: string
    }
    onDelete: () => void
}

function SkillCard({ skill, onDelete }: SkillCardProps) {
    return (
        <Card className="gap-0 py-0 transition-colors hover:bg-muted/50">
            <CardContent className="flex items-start gap-3 p-3">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    <FileText className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium">{skill.name}</h3>
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
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{skill.description}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{skill.path}</p>
                </div>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={onDelete}
                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                    <Trash2 className="size-4" />
                </Button>
            </CardContent>
        </Card>
    )
}
