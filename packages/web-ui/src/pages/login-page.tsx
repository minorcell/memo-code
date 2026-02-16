import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { MemoLogo } from '@/components/layout/memo-logo'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores'

type RedirectState = {
    from?: {
        pathname?: string
    }
}

export function LoginPage() {
    const navigate = useNavigate()
    const location = useLocation()
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
    const pending = useAuthStore((state) => state.pending)
    const error = useAuthStore((state) => state.error)
    const login = useAuthStore((state) => state.login)
    const clearError = useAuthStore((state) => state.clearError)

    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')

    if (isAuthenticated) {
        const state = location.state as RedirectState | null
        const target = state?.from?.pathname || '/chat'
        return <Navigate replace to={target} />
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        clearError()
        const ok = await login(username, password)
        if (ok) {
            const state = location.state as RedirectState | null
            const target = state?.from?.pathname || '/chat'
            navigate(target, { replace: true })
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <div className="w-full max-w-sm">
                {/* Logo */}
                <div className="mb-8 flex flex-col items-center">
                    <div className="mb-4 flex size-14 items-center justify-center rounded-xl border border-border bg-card">
                        <MemoLogo className="size-10" />
                    </div>
                    <h1 className="text-xl font-semibold">Welcome to Memo</h1>
                    <p className="text-sm text-muted-foreground">Sign in to continue</p>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Account Login</CardTitle>
                        <CardDescription>Use your local server credentials.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="login-username">Username</Label>
                                <Input
                                    id="login-username"
                                    type="text"
                                    autoComplete="username"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="Enter your username"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="login-password">Password</Label>
                                <Input
                                    id="login-password"
                                    type="password"
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter your password"
                                />
                            </div>

                            {error ? (
                                <Alert variant="destructive">
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            ) : null}

                            <Button
                                type="submit"
                                disabled={pending}
                                className="w-full gap-2"
                                size="lg"
                            >
                                {pending ? (
                                    <>
                                        <Loader2 className="size-4 animate-spin" />
                                        Signing in...
                                    </>
                                ) : (
                                    'Sign in'
                                )}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                {/* Footer */}
                <p className="mt-6 text-center text-xs text-muted-foreground">
                    Use the credentials configured in{' '}
                    <code className="rounded bg-muted px-1 py-0.5">~/.memo/server.yaml</code>
                </p>
            </div>
        </div>
    )
}
