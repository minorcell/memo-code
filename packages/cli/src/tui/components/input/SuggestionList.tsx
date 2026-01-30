import { Box, Text } from 'ink'

export type SuggestionListItem = {
    id: string
    title: string
    subtitle?: string
    kind: 'file' | 'history' | 'slash' | 'model'
    badge?: string
}

type SuggestionListProps = {
    items: SuggestionListItem[]
    activeIndex: number
    loading: boolean
}

const ACTIVE_BG = '#3a3a3a'
const INACTIVE_BG = '#2b2b2b'
const SUBTITLE_COLOR = '#888888'
const EMPTY_COLOR = '#666666'

export function SuggestionList({ items, activeIndex, loading }: SuggestionListProps) {
    if (loading) {
        return (
            <Box flexDirection="column" paddingX={1} {...({ backgroundColor: INACTIVE_BG } as any)}>
                <Text color="gray">Loading...</Text>
            </Box>
        )
    }
    if (!items.length) {
        return (
            <Box flexDirection="column" paddingX={1} {...({ backgroundColor: INACTIVE_BG } as any)}>
                <Text color={EMPTY_COLOR}>No matches</Text>
            </Box>
        )
    }
    return (
        <Box flexDirection="column" {...({ backgroundColor: INACTIVE_BG } as any)}>
            {items.map((item, index) => {
                const isActive = index === activeIndex
                const bgColor = isActive ? ACTIVE_BG : INACTIVE_BG

                if (item.kind === 'slash') {
                    return (
                        <Box
                            key={item.id}
                            flexDirection="row"
                            gap={2}
                            paddingX={1}
                            {...({ backgroundColor: bgColor } as any)}
                        >
                            <Text color={isActive ? 'cyan' : 'white'} bold={isActive}>
                                {item.title}
                            </Text>
                            {item.subtitle ? (
                                <Text color={SUBTITLE_COLOR}>{item.subtitle}</Text>
                            ) : null}
                        </Box>
                    )
                }

                return (
                    <Box
                        key={item.id}
                        flexDirection="row"
                        gap={1}
                        paddingX={1}
                        {...({ backgroundColor: bgColor } as any)}
                    >
                        <Text color={isActive ? 'cyan' : 'white'} bold={isActive}>
                            {item.title}
                        </Text>
                        {item.subtitle ? <Text color={SUBTITLE_COLOR}>{item.subtitle}</Text> : null}
                    </Box>
                )
            })}
        </Box>
    )
}
