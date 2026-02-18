import type { ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Settings, User, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { SETTINGS_CONTAINER_CLASS } from '@/pages/settings/styles'

type SettingsNavItem = {
    to: string
    label: string
    icon: ReactNode
}

const settingsNavItems: SettingsNavItem[] = [
    { to: '/settings/general', label: 'General', icon: <Settings className="size-4" /> },
    { to: '/settings/account', label: 'Account', icon: <User className="size-4" /> },
]

export function SettingsPage() {
    const navigate = useNavigate()
    const location = useLocation()
    const closeTarget = (location.state as { from?: string } | null)?.from ?? '/chat'

    return (
        <div
            className="fixed inset-0 z-40 bg-black/35 p-2 backdrop-blur-[2px] sm:p-5"
            onClick={() => {
                navigate(closeTarget, { replace: true })
            }}
        >
            <div
                className={cn(
                    'mx-auto flex h-full max-h-[860px] w-full max-w-6xl flex-col overflow-hidden md:flex-row',
                    SETTINGS_CONTAINER_CLASS,
                )}
                onClick={(event) => {
                    event.stopPropagation()
                }}
            >
                <aside className="flex w-full shrink-0 flex-col border-b bg-muted/35 px-3 py-3 md:w-72 md:border-b-0 md:border-r">
                    <div className="mb-2 flex h-10 items-center justify-between px-2">
                        <h1 className="text-sm font-medium">Settings</h1>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            className="size-7"
                            onClick={() => {
                                navigate(closeTarget, { replace: true })
                            }}
                            title="Close settings"
                        >
                            <X className="size-4" />
                        </Button>
                    </div>
                    <nav className="overflow-auto p-1">
                        <div className="flex gap-1 md:block">
                            {settingsNavItems.map((item) => (
                                <NavLink
                                    key={item.to}
                                    to={item.to}
                                    state={{ from: closeTarget }}
                                    className={({ isActive }) =>
                                        cn(
                                            'mb-0 flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors md:mb-1 md:gap-3',
                                            isActive
                                                ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                                                : 'hover:bg-sidebar-accent',
                                        )
                                    }
                                >
                                    {item.icon}
                                    {item.label}
                                </NavLink>
                            ))}
                        </div>
                    </nav>
                </aside>

                <div className="min-w-0 flex-1 overflow-auto bg-background">
                    <Outlet />
                </div>
            </div>
        </div>
    )
}
