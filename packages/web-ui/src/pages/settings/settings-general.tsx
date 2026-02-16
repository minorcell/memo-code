import { useMemo, type ReactNode } from 'react'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { SETTINGS_SECTION_CLASS } from '@/pages/settings/styles'
import { useSystemSettingsStore } from '@/stores'

export function SettingsGeneral() {
    const theme = useSystemSettingsStore((state) => state.theme)
    const fontSize = useSystemSettingsStore((state) => state.fontSize)
    const autoCompact = useSystemSettingsStore((state) => state.autoCompact)
    const setTheme = useSystemSettingsStore((state) => state.setTheme)
    const setFontSize = useSystemSettingsStore((state) => state.setFontSize)
    const toggleAutoCompact = useSystemSettingsStore((state) => state.toggleAutoCompact)

    const themeLabel = useMemo(() => {
        if (theme === 'light') return 'Light'
        if (theme === 'dark') return 'Dark'
        return 'System'
    }, [theme])

    return (
        <div className="w-full p-8">
            <h1 className="text-xl font-semibold">General</h1>
            <p className="text-sm text-muted-foreground">
                Manage local web preferences for this browser.
            </p>

            <div className="mt-8 space-y-8">
                <section className={SETTINGS_SECTION_CLASS}>
                    <h2 className="text-sm font-medium">Theme</h2>
                    <p className="text-xs text-muted-foreground">Current: {themeLabel}</p>
                    <div className="mt-3 grid grid-cols-3 gap-3">
                        <ThemeOption
                            icon={<Sun className="size-4" />}
                            label="Light"
                            selected={theme === 'light'}
                            onClick={() => setTheme('light')}
                        />
                        <ThemeOption
                            icon={<Moon className="size-4" />}
                            label="Dark"
                            selected={theme === 'dark'}
                            onClick={() => setTheme('dark')}
                        />
                        <ThemeOption
                            icon={<Monitor className="size-4" />}
                            label="System"
                            selected={theme === 'system'}
                            onClick={() => setTheme('system')}
                        />
                    </div>
                </section>

                <section className={SETTINGS_SECTION_CLASS}>
                    <h2 className="text-sm font-medium">Font Size</h2>
                    <p className="text-xs text-muted-foreground">Adjust web UI text size.</p>
                    <div className="mt-3 flex items-center gap-4">
                        <Slider
                            value={[fontSize]}
                            min={12}
                            max={18}
                            step={1}
                            onValueChange={(values) => {
                                const next = values[0]
                                if (typeof next === 'number') {
                                    setFontSize(next)
                                }
                            }}
                            className="flex-1"
                        />
                        <span className="w-12 text-sm text-muted-foreground">{fontSize}px</span>
                    </div>
                </section>

                <section className={SETTINGS_SECTION_CLASS}>
                    <h2 className="text-sm font-medium">Session Management</h2>
                    <p className="text-xs text-muted-foreground">
                        Prefer auto-compaction when context reaches the threshold.
                    </p>
                    <div className="mt-3 flex items-center gap-3">
                        <Switch checked={autoCompact} onCheckedChange={toggleAutoCompact} />
                        <Label
                            className="cursor-pointer text-sm"
                            onClick={(event) => {
                                event.preventDefault()
                                toggleAutoCompact()
                            }}
                        >
                            Enable auto-compact by default in web chat
                        </Label>
                    </div>
                </section>
            </div>
        </div>
    )
}

function ThemeOption({
    icon,
    label,
    selected,
    onClick,
}: {
    icon: ReactNode
    label: string
    selected: boolean
    onClick: () => void
}) {
    return (
        <Button
            variant={selected ? 'secondary' : 'outline'}
            onClick={onClick}
            className={cn(
                'h-auto flex-col items-center gap-2 p-3 transition-colors',
                selected ? 'border-primary bg-primary/5' : '',
            )}
        >
            <div
                className={cn(
                    'flex size-10 items-center justify-center rounded-full',
                    selected ? 'bg-primary text-primary-foreground' : 'bg-muted',
                )}
            >
                {icon}
            </div>
            <span className="text-sm font-medium">{label}</span>
            {selected ? <Check className="size-4 text-primary" /> : null}
        </Button>
    )
}
