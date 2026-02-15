import { Navigate, createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '@/layouts/app-layout'
import { ChatPage } from '@/pages/chat'
import { LoginPage } from '@/pages/login-page'
import { SkillsPage } from '@/pages/skills-page'
import { SettingsPage } from '@/pages/settings-page'
import { SettingsGeneral } from '@/pages/settings/settings-general'
import { SettingsMcp } from '@/pages/settings/settings-mcp'
import { SettingsAccount } from '@/pages/settings/settings-account'
import { RequireAuth } from '@/router/require-auth'

export const appRouter = createBrowserRouter([
    {
        path: '/login',
        element: <LoginPage />,
    },
    {
        path: '/',
        element: (
            <RequireAuth>
                <AppLayout />
            </RequireAuth>
        ),
        children: [
            {
                index: true,
                element: <Navigate replace to="/chat" />,
            },
            {
                path: 'sessions',
                element: <Navigate replace to="/chat" />,
            },
            {
                path: 'chat',
                element: <ChatPage />,
            },
            {
                path: 'skills',
                element: <SkillsPage />,
            },
            {
                path: 'settings',
                element: <SettingsPage />,
                children: [
                    {
                        index: true,
                        element: <Navigate replace to="general" />,
                    },
                    {
                        path: 'general',
                        element: <SettingsGeneral />,
                    },
                    {
                        path: 'mcp',
                        element: <SettingsMcp />,
                    },
                    {
                        path: 'account',
                        element: <SettingsAccount />,
                    },
                    {
                        path: 'accunt',
                        element: <Navigate replace to="../account" />,
                    },
                    {
                        path: '*',
                        element: <Navigate replace to="general" />,
                    },
                ],
            },
        ],
    },
    {
        path: '*',
        element: <Navigate replace to="/chat" />,
    },
])
