import { spawn, spawnSync } from 'node:child_process'
import { z } from 'zod'
import { normalizePath, getIgnoreMatcher, appendLongResultHint } from '@memo/tools/tools/helpers'
import { isAbsolute, resolve } from 'node:path'
import { defineMcpTool } from '@memo/tools/tools/types'
import { textResult } from '@memo/tools/tools/mcp'

type OutputMode = 'content' | 'files_with_matches' | 'count'

const GREP_INPUT_SCHEMA = z
    .object({
        pattern: z.string().min(1),
        path: z.string().optional(),
        output_mode: z.enum(['content', 'files_with_matches', 'count']).optional(),
        glob: z.string().optional(),
        '-i': z.boolean().optional(),
        '-A': z.number().int().nonnegative().optional(),
        '-B': z.number().int().nonnegative().optional(),
        '-C': z.number().int().nonnegative().optional(),
    })
    .strict()

type GrepInput = z.infer<typeof GREP_INPUT_SCHEMA>

/**
 * 基于 ripgrep 查找文本，支持内容/文件列表/计数三种输出。
 */
export const grepTool = defineMcpTool<GrepInput>({
    name: 'grep',
    description: '基于 ripgrep 查找文本，支持输出匹配内容、文件列表或计数',
    inputSchema: GREP_INPUT_SCHEMA,
    execute: async (input) => {
        const rgCheck = spawnSync('rg', ['--version'], { stdio: 'ignore' })
        if (rgCheck.error || rgCheck.status !== 0) {
            return textResult('rg 未安装或不在 PATH', true)
        }

        const basePath = input.path ? normalizePath(input.path) : process.cwd()
        const args = ['--color', 'never']
        const mode: OutputMode = input.output_mode ?? 'content'

        if (mode === 'files_with_matches') {
            args.push('-l')
        } else if (mode === 'count') {
            args.push('-c')
        } else {
            args.push('--line-number', '--no-heading')
        }

        if (input['-i']) args.push('-i')
        if (input.glob) args.push('--glob', input.glob)
        if (input['-A'] !== undefined) args.push('-A', String(input['-A']))
        if (input['-B'] !== undefined) args.push('-B', String(input['-B']))
        if (input['-C'] !== undefined) args.push('-C', String(input['-C']))

        args.push(input.pattern, basePath)

        try {
            const matcher = await getIgnoreMatcher(basePath)
            const proc = spawn('rg', args, {
                stdio: ['ignore', 'pipe', 'pipe'],
            })

            const collectStream = (stream: NodeJS.ReadableStream | null) =>
                new Promise<string>((resolve) => {
                    if (!stream) return resolve('')
                    const chunks: string[] = []
                    stream.setEncoding('utf8')
                    stream.on('data', (chunk) => chunks.push(chunk))
                    stream.on('error', () => resolve(''))
                    stream.on('end', () => resolve(chunks.join('')))
                })

            const [stdout, stderr] = await Promise.all([
                collectStream(proc.stdout),
                collectStream(proc.stderr),
            ])

            const exitCode = await new Promise<number>((resolve, reject) => {
                proc.on('error', (error) => reject(error))
                proc.on('close', (code) => resolve(typeof code === 'number' ? code : -1))
            })

            if (exitCode === 2) {
                return textResult(`grep 失败(exit=2): ${stderr || stdout}`, true)
            }

            const rawOutput = stdout || stderr || ''
            const lines = rawOutput
                .split(/\r?\n/)
                .map((line) => line.trimEnd())
                .filter((line) => line.length > 0)
            const kept = lines.filter((line) => {
                if (mode === 'files_with_matches') {
                    const path = line.trim()
                    const absPath = isAbsolute(path) ? path : resolve(basePath, path)
                    return !matcher.ignores(absPath)
                }

                const firstColon = line.indexOf(':')
                if (firstColon === -1) return true
                const path = line.slice(0, firstColon)
                const absPath = isAbsolute(path) ? path : resolve(basePath, path)
                return !matcher.ignores(absPath)
            })

            if (kept.length === 0) {
                return textResult('未找到匹配')
            }

            const output = kept.join('\n')
            return textResult(appendLongResultHint(output, kept.length))
        } catch (err) {
            return textResult(`grep 执行失败: ${(err as Error).message}`, true)
        }
    },
})
