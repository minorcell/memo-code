'use client'

import { Player } from '@remotion/player'
import {
    AbsoluteFill,
    Easing,
    interpolate,
    spring,
    useCurrentFrame,
    useVideoConfig,
} from 'remotion'

const FPS = 30
const ACTIVE_FRAMES = 14 * FPS
const HOLD_FRAMES = 8 * FPS
const DURATION_IN_FRAMES = ACTIVE_FRAMES + HOLD_FRAMES
const COMPOSITION_WIDTH = 1440
const COMPOSITION_HEIGHT = 900

const clamp = {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
} as const

const welcomeMeta = [
    { label: 'Directory', value: '~/Desktop/workspace/memo-cli' },
    { label: 'Session', value: '7f3bf47d...252a' },
    {
        label: 'Model',
        value: 'deepseek-chat',
        suffix: ' (powered by deepseek)',
    },
    { label: 'Version', value: 'v0.6.31' },
    { label: 'MCP', value: 'howtocook-mcp' },
]

type ToolEvent = {
    tool: string
    args?: string
}

const toolEvents: ToolEvent[] = [
    { tool: 'update_plan' },
    { tool: 'list_dir', args: '.' },
    { tool: 'read_file', args: 'package.json' },
    { tool: 'read_file', args: 'AGENTS.md' },
    { tool: 'exec_command', args: 'pwd' },
    { tool: 'list_dir', args: '/Users/mcell/Desktop/workspace/memo-cli' },
    { tool: 'read_file', args: '/Users/mcell/Desktop/workspace/memo-cli/package...' },
    { tool: 'read_file', args: '/Users/mcell/Desktop/workspace/memo-cli/AGENTS.md' },
    { tool: 'update_plan' },
    { tool: 'read_file', args: '/Users/mcell/Desktop/workspace/memo-cli/tsconfi...' },
    { tool: 'read_file', args: '/Users/mcell/Desktop/workspace/memo-cli/README.md' },
    { tool: 'read_file', args: '/Users/mcell/Desktop/workspace/memo-cli/pnpm-wo...' },
    { tool: 'update_plan' },
    { tool: 'list_dir', args: '/Users/mcell/Desktop/workspace/memo-cli/packages' },
    { tool: 'read_file', args: '/Users/mcell/Desktop/workspace/memo-cli/package...' },
    { tool: 'read_file', args: '/Users/mcell/Desktop/workspace/memo-cli/package...' },
    { tool: 'update_plan' },
    { tool: 'read_file', args: '/Users/mcell/Desktop/workspace/memo-cli/package...' },
    { tool: 'exec_command', args: 'find /Users/mcell/Desktop/workspace/memo-cli -n...' },
    { tool: 'update_plan' },
]

const responseLines = [
    'Memo Code is a TypeScript CLI coding agent with a monorepo structure:',
    '',
    'Core packages:',
    '- packages/cli: TUI interface with Ink/React',
    '- packages/core: Session state, config, shared types',
    '- packages/tools: Built-in tools + MCP integration',
    '',
    'Key features:',
    '- Interactive TUI and plain mode for scripts',
    '- DeepSeek/OpenAI providers with config.toml',
    '- MCP server support (local/remote)',
    '- Tool approval system with dangerous mode',
    '- Session history in JSONL format',
    '',
    'Development:',
    '- Node.js >=18, pnpm workspace',
    '- TypeScript + ESM, Prettier formatting',
    '- Vitest tests next to source files',
    '- Build outputs to dist/index.js',
    '',
    'The project follows clear boundaries: Core (logic), Tools (capabilities), CLI (UI).',
]

const questionPrompt = 'I want to quickly understand the project so as to develop it better.'

const typewriter = (text: string, frame: number, startFrame: number, charsPerStep = 2) => {
    if (frame < startFrame) {
        return ''
    }

    const typedChars = Math.floor((frame - startFrame) / charsPerStep)
    return text.slice(0, Math.min(text.length, typedChars))
}

const reveal = (frame: number, startFrame: number, duration = 12) => {
    return interpolate(frame, [startFrame, startFrame + duration], [0, 1], {
        ...clamp,
        easing: Easing.out(Easing.quad),
    })
}

const MemoHeroComposition = () => {
    const frame = useCurrentFrame()
    const { fps } = useVideoConfig()
    const playFrame = Math.min(frame, ACTIVE_FRAMES - 1)
    const commandStart = 20
    const commandCharsPerStep = 3
    const commandDoneFrame = commandStart + 'memo'.length * commandCharsPerStep
    const questionStart = 156
    const questionCharsPerStep = 1
    const questionDoneFrame = questionStart + questionPrompt.length * questionCharsPerStep
    const toolsStart = questionDoneFrame + 10
    const toolStagger = 6
    const responseStart = toolsStart + toolEvents.length * toolStagger + 18
    const finalPromptStart = responseStart + 12

    const entrance = spring({
        frame: playFrame - 4,
        fps,
        config: { damping: 200 },
        durationInFrames: Math.round(0.9 * fps),
    })

    const windowOpacity = interpolate(entrance, [0, 1], [0, 1], clamp)
    const windowTranslateY = interpolate(entrance, [0, 1], [36, 0], clamp)
    const windowScale = interpolate(entrance, [0, 1], [0.97, 1], clamp)

    const commandText = typewriter('memo', playFrame, commandStart, commandCharsPerStep)
    const questionText = typewriter(questionPrompt, playFrame, questionStart, questionCharsPerStep)
    const welcomeBlockOpacity = reveal(playFrame, 52, 8)
    const showCommandCursor = playFrame >= commandStart && playFrame < commandDoneFrame
    const showQuestionCursor = playFrame >= questionStart && playFrame < questionDoneFrame

    const cursorOpacity = interpolate(playFrame % 26, [0, 13, 26], [1, 0.2, 1], clamp)

    return (
        <AbsoluteFill style={{ background: '#0d1117' }}>
            <div
                style={{
                    flex: 1,
                    borderRadius: 16,
                    overflow: 'hidden',
                    border: '1px solid rgba(140, 148, 255, 0.35)',
                    backgroundColor: '#0d1117',
                    boxShadow: 'inset 0 0 50px rgba(94, 106, 210, 0.08)',
                    opacity: windowOpacity,
                    transform: `translateY(${windowTranslateY}px) scale(${windowScale})`,
                }}
            >
                <div
                    style={{
                        height: 58,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '0 20px',
                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                        background:
                            'linear-gradient(180deg, rgba(17, 21, 33, 1) 0%, rgba(11, 14, 23, 1) 100%)',
                    }}
                >
                    <div
                        style={{
                            width: 12,
                            height: 12,
                            borderRadius: 999,
                            backgroundColor: '#f87171',
                        }}
                    />
                    <div
                        style={{
                            width: 12,
                            height: 12,
                            borderRadius: 999,
                            backgroundColor: '#fbbf24',
                        }}
                    />
                    <div
                        style={{
                            width: 12,
                            height: 12,
                            borderRadius: 999,
                            backgroundColor: '#34d399',
                        }}
                    />
                    <div
                        style={{
                            marginLeft: 12,
                            color: 'rgba(161, 161, 170, 0.85)',
                            fontSize: 14,
                            fontWeight: 500,
                            fontFamily: 'Inter, system-ui, sans-serif',
                        }}
                    >
                        memo • terminal session
                    </div>
                </div>

                <div
                    style={{
                        position: 'relative',
                        height: COMPOSITION_HEIGHT - 58,
                        padding: '18px 22px',
                        fontFamily:
                            '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, monospace',
                        fontSize: 11,
                        lineHeight: 1.16,
                        color: '#e5e7eb',
                        whiteSpace: 'pre',
                        letterSpacing: 0.2,
                        overflow: 'hidden',
                        background:
                            'linear-gradient(180deg, rgba(13, 17, 23, 1) 0%, rgba(10, 14, 20, 1) 100%)',
                    }}
                >
                    <div>
                        <span style={{ color: '#32d74b' }}>➜ </span>
                        <span style={{ color: '#22d3ee', fontWeight: 700 }}>memo-cli</span>
                        <span style={{ color: '#8b5cf6' }}> git:</span>
                        <span style={{ color: '#f97316' }}>(dev)</span>
                        <span style={{ color: '#c9d13a' }}> ✗</span>
                        <span style={{ color: '#f3f4f6' }}> {commandText}</span>
                        {showCommandCursor ? (
                            <span style={{ opacity: cursorOpacity, color: '#818cf8' }}>▊</span>
                        ) : null}
                    </div>

                    <div style={{ marginTop: 6, opacity: welcomeBlockOpacity }}>
                        <div
                            style={{
                                maxWidth: 760,
                                border: '2px solid #7c3aed',
                                borderRadius: 8,
                                background:
                                    'linear-gradient(135deg, rgba(22, 24, 35, 0.78), rgba(14, 17, 28, 0.72))',
                                padding: '10px 14px 12px',
                                whiteSpace: 'normal',
                            }}
                        >
                            <div style={{ color: '#f3f4f6', fontWeight: 700 }}>
                                Welcome to Memo Code CLI!
                            </div>
                            <div style={{ color: '#a1a1aa' }}>
                                Send <span style={{ color: '#facc15' }}>/help</span> for help
                                information.
                            </div>
                            <div style={{ height: 8 }} />
                            {welcomeMeta.map((item) => (
                                <div key={item.label}>
                                    <span
                                        style={{
                                            color: '#a1a1aa',
                                            display: 'inline-block',
                                            width: 70,
                                        }}
                                    >
                                        {item.label}:
                                    </span>
                                    <span style={{ color: '#22d3ee' }}>{item.value}</span>
                                    {item.suffix ? (
                                        <span style={{ color: '#a1a1aa' }}>{item.suffix}</span>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div
                        style={{
                            marginTop: 8,
                            opacity: reveal(playFrame, questionStart, 8),
                            color: '#f9fafb',
                        }}
                    >
                        › {questionText}
                        {showQuestionCursor && (
                            <span style={{ opacity: cursorOpacity, color: '#818cf8' }}>▊</span>
                        )}
                    </div>

                    <div style={{ marginTop: 6 }}>
                        {toolEvents.map((item, index) => (
                            <div
                                key={`${item.tool}-${item.args ?? index}`}
                                style={{
                                    opacity: reveal(playFrame, toolsStart + index * toolStagger, 8),
                                }}
                            >
                                <span style={{ color: '#32d74b' }}>●</span>
                                <span style={{ color: '#9ca3af' }}> Used </span>
                                <span style={{ color: '#22d3ee' }}>{item.tool}</span>
                                {item.args ? (
                                    <>
                                        <span style={{ color: '#9ca3af' }}> (</span>
                                        <span style={{ color: '#22d3ee' }}>{item.args}</span>
                                        <span style={{ color: '#9ca3af' }}>)</span>
                                    </>
                                ) : null}
                            </div>
                        ))}
                    </div>

                    <div style={{ marginTop: 6, opacity: reveal(playFrame, responseStart, 10) }}>
                        {responseLines.map((line, index) => {
                            const isHeading = line.endsWith(':') && !line.startsWith('-')
                            const isBullet = line.startsWith('-')
                            return (
                                <div
                                    key={`${line}-${index}`}
                                    style={{
                                        color: isHeading
                                            ? '#f3f4f6'
                                            : isBullet
                                              ? '#cbd5e1'
                                              : '#f3f4f6',
                                        fontWeight: isHeading ? 600 : 400,
                                    }}
                                >
                                    {line || ' '}
                                </div>
                            )
                        })}
                    </div>

                    <div
                        style={{
                            marginTop: 6,
                            opacity: reveal(playFrame, finalPromptStart, 8),
                            color: '#f3f4f6',
                        }}
                    >
                        {'›'} <span style={{ opacity: cursorOpacity, color: '#22d3ee' }}>▊</span>
                    </div>
                </div>
            </div>
        </AbsoluteFill>
    )
}

export function MemoHeroRemotion() {
    return (
        <Player
            component={MemoHeroComposition}
            durationInFrames={DURATION_IN_FRAMES}
            compositionWidth={COMPOSITION_WIDTH}
            compositionHeight={COMPOSITION_HEIGHT}
            fps={FPS}
            autoPlay
            loop
            initiallyMuted
            controls={false}
            clickToPlay={false}
            acknowledgeRemotionLicense
            style={{
                width: '100%',
                height: 'auto',
                aspectRatio: `${COMPOSITION_WIDTH} / ${COMPOSITION_HEIGHT}`,
            }}
        />
    )
}
