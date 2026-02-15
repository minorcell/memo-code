import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound, LogOut, Shield, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getAuthTokens } from '@/api'
import { SETTINGS_SECTION_CLASS } from '@/pages/settings/styles'
import { useAuthStore } from '@/stores'

function maskedToken(token: string): string {
    if (token.length <= 16) return token
    return `${token.slice(0, 8)}...${token.slice(-8)}`
}

export function SettingsAccount() {
    const navigate = useNavigate()
    const username = useAuthStore((state) => state.username)
    const logout = useAuthStore((state) => state.logout)
    const pending = useAuthStore((state) => state.pending)

    const tokens = useMemo(() => getAuthTokens(), [])

    async function handleLogout() {
        await logout()
        navigate('/login', { replace: true })
    }

    return (
        <div className="w-full p-8">
            <h1 className="text-xl font-semibold">Account</h1>
            <p className="text-sm text-muted-foreground">
                Authentication and local session details.
            </p>

            <div className="mt-8 space-y-6">
                <section className={SETTINGS_SECTION_CLASS}>
                    <h2 className="mb-3 text-sm font-medium">Profile</h2>
                    <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                            <User className="size-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Username:</span>
                            <span className="font-medium">{username || 'memo'}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Configured by server auth in ~/.memo/server.yaml
                        </p>
                    </div>
                </section>

                <section className={SETTINGS_SECTION_CLASS}>
                    <h2 className="mb-3 text-sm font-medium">Token Status</h2>
                    {tokens ? (
                        <div className="space-y-2 text-xs">
                            <div className="flex items-center gap-2">
                                <KeyRound className="size-3.5 text-muted-foreground" />
                                <span className="text-muted-foreground">Access:</span>
                                <code className="rounded bg-muted px-2 py-1">
                                    {maskedToken(tokens.accessToken)}
                                </code>
                            </div>
                            <div className="flex items-center gap-2">
                                <Shield className="size-3.5 text-muted-foreground" />
                                <span className="text-muted-foreground">Refresh:</span>
                                <code className="rounded bg-muted px-2 py-1">
                                    {maskedToken(tokens.refreshToken)}
                                </code>
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">No local token is stored.</p>
                    )}
                </section>

                <section className={SETTINGS_SECTION_CLASS}>
                    <h2 className="mb-2 text-sm font-medium">Security</h2>
                    <p className="mb-3 text-xs text-muted-foreground">
                        To rotate credentials, edit ~/.memo/server.yaml and restart memo web server.
                    </p>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleLogout()}
                        disabled={pending}
                        className="gap-1.5"
                    >
                        <LogOut className="size-4" />
                        {pending ? 'Signing out...' : 'Sign out'}
                    </Button>
                </section>
            </div>
        </div>
    )
}
