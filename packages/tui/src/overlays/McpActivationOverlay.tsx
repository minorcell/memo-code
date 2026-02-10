import { useMemo, useState } from 'react'
import { Box, Text, useInput } from 'ink'

type McpActivationOverlayProps = {
    serverNames: string[]
    defaultSelected: string[]
    onConfirm: (selectedServerNames: string[], persistSelection: boolean) => void
    onExit: () => void
}

function normalizeSelected(serverNames: string[], selected: string[]) {
    const allowed = new Set(serverNames)
    return selected.filter((name) => allowed.has(name))
}

export function McpActivationOverlay({
    serverNames,
    defaultSelected,
    onConfirm,
    onExit,
}: McpActivationOverlayProps) {
    const initialSelection = useMemo(() => {
        const normalized = normalizeSelected(serverNames, defaultSelected)
        if (defaultSelected.length === 0) return []
        return normalized.length > 0 ? normalized : [...serverNames]
    }, [defaultSelected, serverNames])

    const [selectedNames, setSelectedNames] = useState<string[]>(initialSelection)
    const [cursor, setCursor] = useState(0)
    const [persistSelection, setPersistSelection] = useState(true)

    const selectedSet = useMemo(() => new Set(selectedNames), [selectedNames])
    const allSelected = selectedNames.length === serverNames.length

    useInput((input, key) => {
        if (key.ctrl && input === 'c') {
            onExit()
            return
        }

        if (key.upArrow) {
            setCursor((prev) => (prev <= 0 ? serverNames.length - 1 : prev - 1))
            return
        }

        if (key.downArrow) {
            setCursor((prev) => (prev + 1) % serverNames.length)
            return
        }

        if (key.return) {
            onConfirm(selectedNames, persistSelection)
            return
        }

        if (input === ' ') {
            const target = serverNames[cursor]
            if (!target) return
            setSelectedNames((prev) => {
                const next = new Set(prev)
                if (next.has(target)) {
                    next.delete(target)
                } else {
                    next.add(target)
                }
                return serverNames.filter((name) => next.has(name))
            })
            return
        }

        if (input.toLowerCase() === 'a') {
            setSelectedNames([...serverNames])
            return
        }

        if (input.toLowerCase() === 'n') {
            setSelectedNames([])
            return
        }

        if (input.toLowerCase() === 'p') {
            setPersistSelection((prev) => !prev)
            return
        }

        if (key.escape) {
            onConfirm(selectedNames, persistSelection)
        }
    })

    return (
        <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
            <Text bold color="cyan">
                Activate MCP Servers
            </Text>
            <Text color="gray">Select servers to load for this run.</Text>
            <Box marginTop={1} flexDirection="column">
                {serverNames.map((name, index) => {
                    const checked = selectedSet.has(name)
                    return (
                        <Text key={name} color={index === cursor ? 'green' : 'gray'}>
                            {index === cursor ? '> ' : '  '}[{checked ? 'x' : ' '}] {name}
                        </Text>
                    )
                })}
            </Box>
            <Box marginTop={1} flexDirection="column">
                <Text color="gray">
                    Selected: {selectedNames.length}/{serverNames.length}
                    {allSelected ? ' (all)' : ''}
                </Text>
                <Text color="gray">Persist as default: {persistSelection ? 'yes' : 'no'}</Text>
                <Text color="gray">
                    Controls: ↑/↓ move, Space toggle, A all, N none, P persist, Enter confirm
                </Text>
            </Box>
        </Box>
    )
}
