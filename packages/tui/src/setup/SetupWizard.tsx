import { Box, Text, useInput } from 'ink'
import { useCallback, useMemo, useState } from 'react'
import { writeMemoConfig, type MemoConfig } from '@memo/core'

type SetupWizardProps = {
    configPath: string
    onComplete: () => void
    onExit: () => void
}

type SetupStep = {
    key: 'name' | 'envKey' | 'model' | 'baseUrl'
    label: string
    hint?: string
    defaultValue: string
}

type SetupValues = {
    name: string
    envKey: string
    model: string
    baseUrl: string
}

const STEPS: SetupStep[] = [
    {
        key: 'name',
        label: 'Provider name',
        hint: 'Used for /models switching',
        defaultValue: 'deepseek',
    },
    {
        key: 'envKey',
        label: 'API key env var',
        hint: 'Read at runtime from environment variables',
        defaultValue: 'DEEPSEEK_API_KEY',
    },
    {
        key: 'model',
        label: 'Model name',
        defaultValue: 'deepseek-chat',
    },
    {
        key: 'baseUrl',
        label: 'Base URL',
        defaultValue: 'https://api.deepseek.com',
    },
]

export function SetupWizard({ configPath, onComplete, onExit }: SetupWizardProps) {
    const [stepIndex, setStepIndex] = useState(0)
    const [draft, setDraft] = useState('')
    const [values, setValues] = useState<Partial<SetupValues>>({})
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const step = STEPS[stepIndex] ?? STEPS[0]

    const saveConfig = useCallback(
        async (nextValues: SetupValues) => {
            setBusy(true)
            setError(null)
            try {
                const config: MemoConfig = {
                    current_provider: nextValues.name,
                    providers: [
                        {
                            name: nextValues.name,
                            env_api_key: nextValues.envKey,
                            model: nextValues.model,
                            base_url: nextValues.baseUrl || undefined,
                        },
                    ],
                }
                await writeMemoConfig(configPath, config)
                onComplete()
            } catch (err) {
                setError((err as Error).message)
                setBusy(false)
            }
        },
        [configPath, onComplete],
    )

    const commitCurrent = useCallback(async () => {
        if (!step) return
        const value = draft.trim() || step.defaultValue
        const nextValues: Partial<SetupValues> = {
            ...values,
            [step.key]: value,
        }
        setValues(nextValues)
        setDraft('')
        if (stepIndex < STEPS.length - 1) {
            setStepIndex(stepIndex + 1)
            return
        }
        const completeValues: SetupValues = {
            name: nextValues.name || STEPS[0]!.defaultValue,
            envKey: nextValues.envKey || STEPS[1]!.defaultValue,
            model: nextValues.model || STEPS[2]!.defaultValue,
            baseUrl: nextValues.baseUrl || STEPS[3]!.defaultValue,
        }
        await saveConfig(completeValues)
    }, [draft, saveConfig, step, stepIndex, values])

    useInput((input, key) => {
        if (busy) return
        if (key.ctrl && input === 'c') {
            onExit()
            return
        }
        if (key.return) {
            void commitCurrent()
            return
        }
        if (key.backspace || key.delete) {
            setDraft((prev) => prev.slice(0, -1))
            return
        }
        if (input) {
            setDraft((prev) => prev + input)
        }
    })

    const progress = useMemo(() => `Step ${stepIndex + 1}/${STEPS.length}`, [stepIndex])

    if (!step) return null

    return (
        <Box flexDirection="column">
            <Text bold>Memo setup</Text>
            <Text color="gray">No provider config found. Complete setup to continue.</Text>
            <Text color="gray">Config path: {configPath}</Text>
            <Box marginTop={1} flexDirection="column">
                <Text color="cyan">{progress}</Text>
                <Text>{step.label}</Text>
                <Text color="gray">Default: {step.defaultValue}</Text>
                {step.hint ? <Text color="gray">{step.hint}</Text> : null}
            </Box>
            <Box marginTop={1}>
                <Text>{'> '}</Text>
                <Text>{draft}</Text>
            </Box>
            <Box marginTop={1}>
                <Text color="gray">Enter to continue, Ctrl+C to exit.</Text>
            </Box>
            {error ? (
                <Box marginTop={1}>
                    <Text color="red">Failed to save config: {error}</Text>
                </Box>
            ) : null}
        </Box>
    )
}
