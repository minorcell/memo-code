import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
    title: {
        default: 'Memo 官方站点',
        template: '%s | Memo',
    },
    description: 'Memo: 运行在终端里的轻量级编码代理。本站提供产品介绍与完整文档站。',
    icons: {
        icon: '/logo.svg',
        shortcut: '/logo.svg',
        apple: '/logo.svg',
    },
}

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    return (
        <html lang="zh-CN">
            <body>
                <div className="site-shell">{children}</div>
            </body>
        </html>
    )
}
