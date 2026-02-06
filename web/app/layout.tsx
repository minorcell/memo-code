import type { Metadata } from 'next'
import './globals.css'

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
const logoPath = `${basePath}/logo.svg`

export const metadata: Metadata = {
    title: {
        default: 'Memo 官方站点',
        template: '%s | Memo',
    },
    description: 'Memo: 运行在终端里的轻量级编码代理。本站提供产品介绍与完整文档站。',
    icons: {
        icon: logoPath,
        shortcut: logoPath,
        apple: logoPath,
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
