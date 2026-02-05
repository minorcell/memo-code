import { Box, Text, useInput } from 'ink'
import { useCallback, useMemo, useState } from 'react'
import { writeMemoConfig, type MemoConfig } from '@memo/core'

type SetupWizardProps = {
    configPath: string
    onComplete: () => void
    onExit: () => void
}

type Step = {
    key: 'name' | 'envKey' | 'model' | 'baseUrl'
    label: string
    hint?: string
    defaultValue: string
}

const STEPS: Step[] = [
    {
        key: 'name',
        label: 'Provider name',
        hint: 'Used in /model and config',
        defaultValue: 'deepseek',
    },
    {
        key: 'envKey',
        label: 'API key env var',
        hint: 'Memo reads this env var at runtime',
        defaultValue: 'DEEPSEEK_API_KEY',
    },
    {
        key: 'model',
        label: 'Model name',
        hint: 'Provider model ID',
        defaultValue: 'deepseek-chat',
    },
    {
        key: 'baseUrl',
        label: 'Base URL',
        hint: 'Leave default unless you have a custom endpoint',
        defaultValue: 'https://api.deepseek.com',
    },
]

export function SetupWizard({ configPath, onComplete, onExit }: SetupWizardProps) {
    const [stepIndex, setStepIndex] = useState(0)
    const [value, setValue] = useState('')
    const [values, setValues] = useState<Record<string, string>>({})
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const step = STEPS[stepIndex] ?? STEPS[0]!
    const displayValue = value || values[step.key] || ''

    const writeConfig = useCallback(
        async (nextValues: Record<string, string>) => {
            setSubmitting(true)
            setError(null)
            try {
                const name = nextValues.name || STEPS[0].defaultValue
                const envKey = nextValues.envKey || STEPS[1].defaultValue
                const model = nextValues.model || STEPS[2].defaultValue
                const baseUrl = nextValues.baseUrl || STEPS[3].defaultValue

                const config: MemoConfig = {
                    current_provider: name,
                    providers: [
                        {
                            name,
                            env_api_key: envKey,
                            model,
                            base_url: baseUrl || undefined,
                        },
                    ],
                }
                await writeMemoConfig(configPath, config)
                onComplete()
            } catch (err) {
                setError((err as Error).message)
                setSubmitting(false)
            }
        },
        [configPath, onComplete],
    )

    const commitCurrent = useCallback(async () => {
        const trimmed = value.trim()
        const nextValue = trimmed || step.defaultValue
        const nextValues = { ...values, [step.key]: nextValue }
        setValues(nextValues)
        setValue('')
        if (stepIndex < STEPS.length - 1) {
            setStepIndex(stepIndex + 1)
            return
        }
        await writeConfig(nextValues)
    }, [step.defaultValue, step.key, stepIndex, value, values, writeConfig])

    useInput(
        useCallback(
            (input, key) => {
                if (submitting) return
                if (key.ctrl && input === 'c') {
                    onExit()
                    return
                }
                if (key.return) {
                    void commitCurrent()
                    return
                }
                if (key.backspace || key.delete) {
                    setValue((prev) => prev.slice(0, -1))
                    return
                }
                if (input) {
                    setValue((prev) => prev + input)
                }
            },
            [commitCurrent, onExit, submitting],
        ),
    )

    const progress = useMemo(() => `Step ${stepIndex + 1}/${STEPS.length}`, [stepIndex])

    return (
        <Box flexDirection="column">
            <Box flexDirection="column" marginBottom={1}>
                <Text bold>Memo setup</Text>
                <Text color="gray">No provider config found. Create one to continue.</Text>
                <Text color="gray">Config path: {configPath}</Text>
            </Box>
            <Box flexDirection="column" marginBottom={1}>
                <Text color="cyan">{progress}</Text>
                <Text>
                    {step.label} (default: {step.defaultValue})
                </Text>
                {step.hint ? <Text color="gray">{step.hint}</Text> : null}
            </Box>
            <Box>
                <Text>{'> '}</Text>
                <Text>{displayValue}</Text>
            </Box>
            <Box marginTop={1}>
                <Text color="gray">Press Enter to continue. Ctrl+C to exit.</Text>
            </Box>
            {error ? (
                <Box marginTop={1}>
                    <Text color="red">Failed to write config: {error}</Text>
                </Box>
            ) : null}
        </Box>
    )
}
