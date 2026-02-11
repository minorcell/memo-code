import { Box, Text } from 'ink'
import { marked } from 'marked'

type MarkdownNode =
    | { type: 'text'; content: string }
    | { type: 'bold'; content: string }
    | { type: 'italic'; content: string }
    | { type: 'inlineCode'; content: string }
    | { type: 'link'; content: string; href: string }
    | { type: 'heading'; level: number; content: string }
    | { type: 'code'; language?: string; content: string }
    | { type: 'blockquote'; content: string }
    | { type: 'list'; items: string[]; ordered: boolean }
    | { type: 'paragraph'; content: string }
    | { type: 'hr' }
    | { type: 'html'; content: string }
    | { type: 'think'; content: string }

function parseInlineTokens(text: string): MarkdownNode[] {
    const nodes: MarkdownNode[] = []
    const regex = /(```[\s\S]*?```|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|_\b[^_]+\b|_|[^\*`_]+)/g
    let match: RegExpExecArray | null

    while ((match = regex.exec(text)) !== null) {
        const [full, codeOrBold, backtick, doubleAsterisk, asterisk, underscore, singleUnderscore, rest] = match

        if (codeOrBold?.startsWith('```')) {
            const content = codeOrBold.slice(3, -3)
            const firstLineEnd = content.indexOf('\n')
            let lang = ''
            let code = content
            if (firstLineEnd !== -1) {
                const firstLine = content.slice(0, firstLineEnd).trim()
                if (/^[a-zA-Z0-9_-]+$/.test(firstLine)) {
                    lang = firstLine
                    code = content.slice(firstLineEnd + 1)
                }
            }
            nodes.push({ type: 'code', language: lang || undefined, content: code })
        } else if (backtick) {
            nodes.push({ type: 'inlineCode', content: backtick.slice(1, -1) })
        } else if (doubleAsterisk) {
            nodes.push({ type: 'bold', content: doubleAsterisk.slice(2, -2) })
        } else if (asterisk && asterisk.length > 1) {
            nodes.push({ type: 'italic', content: asterisk.slice(1, -1) })
        } else if (underscore && underscore.length > 1) {
            nodes.push({ type: 'italic', content: underscore.slice(1, -1) })
        } else if (rest !== undefined) {
            const plainText = rest.replace(/^_+/, '').replace(/_+$/, '')
            if (plainText) {
                nodes.push({ type: 'text', content: parseInlineLinks(plainText) })
            }
        } else {
            const plainText = full.replace(/^_+/, '').replace(/_+$/, '')
            if (plainText) {
                nodes.push({ type: 'text', content: parseInlineLinks(plainText) })
            }
        }
    }

    return nodes
}

function parseInlineLinks(text: string): string {
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
    return text.replace(linkRegex, (_, text, url) => `${text} (${url})`)
}

function repeat(str: string, count: number): string {
    return str.repeat(count)
}

function parseMarkdown(markdown: string): MarkdownNode[] {
    const nodes: MarkdownNode[] = []

    let thinkContent = ''
    const cleanedMarkdown = markdown.replace(/<think>[\s\S]*?<\/think>/g, (_, content) => {
        thinkContent += content + '\n'
        return ''
    })

    if (thinkContent.trim()) {
        nodes.push({ type: 'think', content: thinkContent.trim() })
    }

    const cleanedTokens = marked.lexer(cleanedMarkdown)

    for (const token of cleanedTokens as Array<{ type: string; text?: string; lang?: string; depth?: number; ordered?: boolean; items?: Array<{ text: string }> }>) {
        switch (token.type) {
            case 'html': {
                const html = token as { text: string }
                nodes.push({ type: 'html', content: html.text })
                break
            }
            case 'hr': {
                nodes.push({ type: 'hr' })
                break
            }
            case 'heading': {
                const heading = token as { depth: number; text: string }
                nodes.push({ type: 'heading', level: heading.depth, content: heading.text })
                break
            }
            case 'paragraph': {
                const paragraph = token as { text: string }
                const content = paragraph.text
                if (content.startsWith('> ')) {
                    nodes.push({ type: 'blockquote', content: content.slice(2) })
                } else {
                    nodes.push({ type: 'paragraph', content: parseInlineLinks(content) })
                }
                break
            }
            case 'code': {
                const code = token as { lang?: string; text: string }
                nodes.push({ type: 'code', language: code.lang, content: code.text })
                break
            }
            case 'list': {
                const list = token as { ordered: boolean; items: Array<{ text: string }> }
                const items = list.items.map((item) => item.text)
                nodes.push({ type: 'list', items, ordered: list.ordered })
                break
            }
            case 'text': {
                const text = token as { text: string }
                nodes.push({ type: 'text', content: text.text })
                break
            }
        }
    }

    return nodes
}

function CodeBlock({ language, content }: { language?: string; content: string }) {
    const langLabel = language ? `[${language}] ` : ''
    const lines = content.split('\n')
    const maxWidth = Math.max(...lines.map((l) => l.length), 40)
    const border = '─'.repeat(Math.min(maxWidth, 60))

    return (
        <Box flexDirection="column" marginY={1}>
            <Box>
                <Text color="yellow" dimColor>
                    {langLabel}┌{border}┐
                </Text>
            </Box>
            {lines.map((line, i) => (
                <Box key={i}>
                    <Text color="yellow" dimColor>│</Text>
                    <Text color="gray"> {line}</Text>
                </Box>
            ))}
            <Box>
                <Text color="yellow" dimColor>
                    {langLabel}└{border}┘
                </Text>
            </Box>
        </Box>
    )
}

function InlineNode({ node }: { node: MarkdownNode }) {
    switch (node.type) {
        case 'bold':
            return <Text bold>{node.content}</Text>
        case 'italic':
            return <Text italic>{node.content}</Text>
        case 'inlineCode':
            return (
                <Text color="green" backgroundColor="#1a1a2e">
                    {node.content}
                </Text>
            )
        case 'link':
            return (
                <Text color="blue" underline>
                    {node.content} ({node.href})
                </Text>
            )
        case 'text':
            return <Text>{parseInlineLinks(node.content)}</Text>
        default:
            return null
    }
}

function InlineContent({ content }: { content: string }) {
    const nodes = parseInlineTokens(content)
    return (
        <Box flexWrap="wrap">
            {nodes.map((node, i) => (
                <InlineNode key={i} node={node} />
            ))}
        </Box>
    )
}

function MarkdownNode({ node }: { node: MarkdownNode }) {
    switch (node.type) {
        case 'html': {
            return (
                <Box>
                    <Text color="gray" dimColor>&lt;{node.content}&gt;</Text>
                </Box>
            )
        }
        case 'hr': {
            return (
                <Box marginY={1}>
                    <Text color="gray">─────────────────────────────────</Text>
                </Box>
            )
        }
        case 'think': {
            return (
                <Box flexDirection="column" marginY={1}>
                    <Text color="gray" dimColor>│ Think: {node.content}</Text>
                </Box>
            )
        }
        case 'heading': {
            return (
                <Box>
                    <Text bold color="cyan">{repeat('#', node.level)} {node.content}</Text>
                </Box>
            )
        }
        case 'paragraph':
        case 'text': {
            const inlineNodes = parseInlineTokens(node.content)
            return (
                <Box flexWrap="wrap">
                    {inlineNodes.map((inline, i) => (
                        <InlineNode key={i} node={inline} />
                    ))}
                </Box>
            )
        }
        case 'code': {
            return <CodeBlock language={node.language} content={node.content} />
        }
        case 'blockquote': {
            return (
                <Box>
                    <Text color="gray" dimColor>│ {node.content}</Text>
                </Box>
            )
        }
        case 'list': {
            return (
                <Box flexDirection="column">
                    {node.items.map((item, i) => (
                        <Box key={i}>
                            <Text color="gray">{node.ordered ? `${i + 1}.` : '•'} </Text>
                            <InlineContent content={item} />
                        </Box>
                    ))}
                </Box>
            )
        }
    }
}

export function MarkdownRenderer({ content }: { content: string }) {
    if (!content) return null

    const rawNodes = parseMarkdown(content)

    return (
        <Box flexDirection="column">
            {rawNodes.map((node, index) => (
                <MarkdownNode key={index} node={node} />
            ))}
        </Box>
    )
}
