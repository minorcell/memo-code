'use client'

import { useEffect, useRef, useState } from 'react'

const DESIGN_WIDTH = 1440
const DESIGN_HEIGHT = 880

const LAYOUT = {
    leftX: 56,
    leftY: 132,
    leftW: 860,
    leftH: 690,
    rightX: 1130,
    rightY: 132,
    rightW: 254,
    rightH: 690,
}

const MIDDLE_DIVIDER_X = Math.round((LAYOUT.leftX + LAYOUT.leftW + LAYOUT.rightX) / 2)

const BRIDGE = {
    x: MIDDLE_DIVIDER_X - 52,
    y: 450,
    w: 104,
    h: 190,
}

const FLOW_LINES = {
    topY: 406,
    bottomY: 632,
    leftAnchorX: BRIDGE.x - 10,
    rightAnchorX: LAYOUT.rightX - 36,
}

const architectureGroups = [
    {
        title: 'CLI Layer',
        items: ['Input Prompt', 'Slash Commands', 'Turn Renderer', 'Session Header'],
    },
    {
        title: 'Core Layer',
        items: ['Session Runtime', 'Prompt Builder', 'History & Memory', 'Provider Config'],
    },
    {
        title: 'Tools Layer',
        items: ['Tool Router', 'Native Tools', 'MCP Tools', 'Approval Guard'],
    },
]

const providers = ['OpenAI', 'DeepSeek', 'Azure OpenAI', 'Ollama', 'More...']

export function MemoArchitectureDiagram() {
    const containerRef = useRef<HTMLDivElement>(null)
    const [scale, setScale] = useState(1)

    useEffect(() => {
        const node = containerRef.current
        if (!node) return

        const updateScale = () => {
            const nextWidth = node.clientWidth
            if (!nextWidth) return
            setScale(Math.min(nextWidth / DESIGN_WIDTH, 1))
        }

        updateScale()

        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', updateScale)
            return () => window.removeEventListener('resize', updateScale)
        }

        const observer = new ResizeObserver(() => updateScale())
        observer.observe(node)
        return () => observer.disconnect()
    }, [])

    const topArrowStartX = FLOW_LINES.leftAnchorX
    const topArrowEndX = FLOW_LINES.rightAnchorX
    const bottomArrowStartX = FLOW_LINES.rightAnchorX
    const bottomArrowEndX = FLOW_LINES.leftAnchorX

    return (
        <div
            ref={containerRef}
            style={{
                position: 'relative',
                width: '100%',
                aspectRatio: `${DESIGN_WIDTH} / ${DESIGN_HEIGHT}`,
                borderRadius: 20,
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.08)',
                background:
                    'radial-gradient(100% 70% at 50% -10%, rgba(255,255,255,0.08), rgba(255,255,255,0) 60%), linear-gradient(180deg, #0a0b0d 0%, #09090b 100%)',
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: DESIGN_WIDTH,
                    height: DESIGN_HEIGHT,
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                }}
            >
                <div
                    style={{
                        position: 'absolute',
                        left: 56,
                        top: 42,
                        right: 56,
                        fontFamily: 'Inter, system-ui, sans-serif',
                    }}
                >
                    <div
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 999,
                            padding: '4px 10px',
                            color: '#a1a1aa',
                            background: 'rgba(17,17,19,0.9)',
                            fontSize: 12,
                            fontWeight: 600,
                            letterSpacing: 0.2,
                        }}
                    >
                        SYSTEM ARCHITECTURE
                    </div>
                </div>

                <div
                    style={{
                        position: 'absolute',
                        left: LAYOUT.leftX,
                        top: LAYOUT.leftY,
                        width: LAYOUT.leftW,
                        height: LAYOUT.leftH,
                        border: '1px dashed rgba(255,255,255,0.35)',
                        borderRadius: 18,
                        padding: '20px 20px 16px',
                        background: 'rgba(17,17,19,0.42)',
                    }}
                >
                    <div
                        style={{
                            color: '#f4f4f5',
                            fontFamily: 'Inter, system-ui, sans-serif',
                            fontWeight: 700,
                            fontSize: 34,
                            letterSpacing: -0.5,
                            marginBottom: 16,
                        }}
                    >
                        Memo CLI
                    </div>

                    {architectureGroups.map((group) => (
                        <div
                            key={group.title}
                            style={{
                                border: '1px dashed rgba(255,255,255,0.24)',
                                borderRadius: 14,
                                padding: '14px 14px 12px',
                                marginBottom: 14,
                                background: 'rgba(10,11,14,0.4)',
                            }}
                        >
                            <div
                                style={{
                                    color: '#e4e4e7',
                                    fontFamily: 'Inter, system-ui, sans-serif',
                                    fontWeight: 620,
                                    fontSize: 22,
                                    letterSpacing: -0.3,
                                }}
                            >
                                {group.title}
                            </div>

                            <div
                                style={{
                                    marginTop: 10,
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 1fr',
                                    gap: 10,
                                }}
                            >
                                {group.items.map((item) => (
                                    <div
                                        key={item}
                                        style={{
                                            height: 48,
                                            borderRadius: 10,
                                            border: '1px solid rgba(255,255,255,0.09)',
                                            background: 'rgba(24,24,27,0.9)',
                                            color: '#d4d4d8',
                                            fontFamily: 'Inter, system-ui, sans-serif',
                                            fontSize: 16,
                                            fontWeight: 560,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        {item}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <div
                    style={{
                        position: 'absolute',
                        left: MIDDLE_DIVIDER_X,
                        top: LAYOUT.leftY,
                        height: LAYOUT.leftH,
                        borderLeft: '1px dashed rgba(161,161,170,0.55)',
                    }}
                />

                <div
                    style={{
                        position: 'absolute',
                        left: BRIDGE.x,
                        top: BRIDGE.y,
                        width: BRIDGE.w,
                        height: BRIDGE.h,
                        borderRadius: 12,
                        border: '1px dashed rgba(212,212,216,0.35)',
                        background: 'rgba(24,24,27,0.92)',
                        color: '#d4d4d8',
                        fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
                        fontSize: 16,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        writingMode: 'vertical-rl',
                        letterSpacing: 0.5,
                    }}
                >
                    Provider Bridge
                </div>
                <div
                    style={{
                        position: 'absolute',
                        left: LAYOUT.rightX,
                        top: LAYOUT.rightY,
                        width: LAYOUT.rightW,
                        height: LAYOUT.rightH,
                        border: '1px dashed rgba(255,255,255,0.35)',
                        borderRadius: 18,
                        background: 'rgba(17,17,19,0.5)',
                        padding: '16px 14px',
                    }}
                >
                    <div
                        style={{
                            color: '#e4e4e7',
                            fontFamily: 'Inter, system-ui, sans-serif',
                            fontWeight: 620,
                            fontSize: 28,
                            letterSpacing: -0.4,
                            marginBottom: 12,
                            textAlign: 'center',
                        }}
                    >
                        Providers
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {providers.map((provider) => (
                            <div
                                key={provider}
                                style={{
                                    height: 98,
                                    borderRadius: 12,
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    background: 'rgba(24,24,27,0.92)',
                                    color: '#d4d4d8',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontFamily: 'Inter, system-ui, sans-serif',
                                    fontWeight: 600,
                                    fontSize: 22,
                                }}
                            >
                                {provider}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

export const MemoArchitectureRemotion = MemoArchitectureDiagram
