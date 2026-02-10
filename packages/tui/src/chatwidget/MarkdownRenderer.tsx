import { Box, Text } from 'ink'
import { marked } from 'marked'

type MarkdownNode =
    | { type: 'text'; content: string }
    | { type: 'heading'; level: number; content: string }
    | { type: 'code'; language?: string; content: string }
    | { type: 'blockquote'; content: string }
    | { type: 'list'; items: string[]; ordered: boolean }
    | { type: 'paragraph'; content: string }

function parseMarkdown(markdown: string): MarkdownNode[] {
    const nodes: MarkdownNode[] = []
    const tokens = marked.lexer(markdown)

    for (const token of tokens) {
        switch (token.type) {
            case 'heading': {
                const heading = token as marked.Tokens.Heading
                nodes.push({
                    type: 'heading',
                    level: heading.depth,
                    content: heading.text,
                })
                break
            }
            case 'paragraph': {
                const paragraph = token as marked.Tokens.Paragraph
                const text = paragraph.text
                if (text.startsWith('> ')) {
                    nodes.push({
                        type: 'blockquote',
                        content: text.slice(2),
                    })
                } else {
                    nodes.push({
                        type: 'paragraph',
                        content: text,
                    })
                }
                break
            }
            case 'code': {
                const code = token as marked.Tokens.Code
                nodes.push({
                    type: 'code',
                    language: code.lang,
                    content: code.text,
                })
                break
            }
            case 'list': {
                const list = token as marked.Tokens.List
                const items = list.items.map((item) => item.text)
                nodes.push({
                    type: 'list',
                    items,
                    ordered: list.ordered,
                })
                break
            }
            case 'text': {
                const text = token as marked.Tokens.Text
                nodes.push({
                    type: 'text',
                    content: text.text,
                })
                break
            }
        }
    }

    return nodes
}

export function MarkdownRenderer({ content }: { content: string }) {
    if (!content) return null

    const nodes = parseMarkdown(content)

    return (
        <Box flexDirection="column">
            {nodes.map((node, index) => (
                <MarkdownNode key={index} node={node} />
            ))}
        </Box>
    )
}

function MarkdownNode({ node }: { node: MarkdownNode }) {
    switch (node.type) {
        case 'heading': {
            const prefix = '#'.repeat(node.level)
            return (
                <Box>
                    <Text bold color="cyan">
                        {prefix} {node.content}
                    </Text>
                </Box>
            )
        }
        case 'paragraph':
        case 'text': {
            return <Text>{node.content}</Text>
        }
        case 'code': {
            const language = node.language ? `[${node.language}] ` : ''
            return (
                <Box flexDirection="column" marginY={1}>
                    <Text color="yellow" dimColor>
                        {language}{'```'}
                    </Text>
                    <Text color="gray">{node.content}</Text>
                    <Text color="yellow" dimColor>
                        {'```'}
                    </Text>
                </Box>
            )
        }
        case 'blockquote': {
            return (
                <Box>
                    <Text color="gray" dimColor>
                        │ {node.content}
                    </Text>
                </Box>
            )
        }
        case 'list': {
            return (
                <Box flexDirection="column">
                    {node.items.map((item, i) => (
                        <Box key={i}>
                            <Text color="gray">
                                {node.ordered ? `${i + 1}.` : '•'}
                            </Text>
                            <Text> {item}</Text>
                        </Box>
                    ))}
                </Box>
            )
        }
    }
}
