import { cjk } from '@streamdown/cjk'
import { code } from '@streamdown/code'
import { mermaid } from '@streamdown/mermaid'
import { Streamdown } from 'streamdown'
import { cn } from '@/lib/utils'

type MarkdownMessageProps = {
    content: string
    isStreaming?: boolean
    className?: string
}

const streamdownPlugins = {
    code,
    mermaid,
    cjk,
}

export function MarkdownMessage({ content, isStreaming = false, className }: MarkdownMessageProps) {
    return (
        <Streamdown
            mode={isStreaming ? 'streaming' : 'static'}
            isAnimating={isStreaming}
            plugins={streamdownPlugins}
            className={cn('text-sm leading-relaxed', className)}
        >
            {content}
        </Streamdown>
    )
}
