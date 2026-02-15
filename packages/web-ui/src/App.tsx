import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { appRouter } from '@/router'
import { applyFontSize, applyTheme, useSystemSettingsStore } from '@/stores'

export default function App() {
    const theme = useSystemSettingsStore((state) => state.theme)
    const fontSize = useSystemSettingsStore((state) => state.fontSize)

    useEffect(() => {
        applyTheme(theme)
    }, [theme])

    useEffect(() => {
        applyFontSize(fontSize)
    }, [fontSize])

    useEffect(() => {
        if (theme !== 'system' || typeof window === 'undefined') return

        const media = window.matchMedia('(prefers-color-scheme: dark)')
        const handleSystemThemeChange = () => applyTheme('system')
        handleSystemThemeChange()

        media.addEventListener('change', handleSystemThemeChange)
        return () => {
            media.removeEventListener('change', handleSystemThemeChange)
        }
    }, [theme])

    return (
        <>
            <RouterProvider router={appRouter} />
            <Toaster />
        </>
    )
}
