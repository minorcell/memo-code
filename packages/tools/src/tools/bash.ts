import type { ToolFn } from "@memo/tools/tools/types"

/**
 * 执行任意 bash 命令，将 exit/stdout/stderr 拼接返回。
 * 主要用于调试/脚本执行，注意命令安全性需由上层控制。
 */
export const bash: ToolFn = async (rawCmd: string) => {
    const cmd = rawCmd.trim()
    if (!cmd) return "bash 需要要执行的命令"

    try {
        // 直接调用 bash -lc 执行用户命令，保留当前环境变量。
        const proc = Bun.spawn(["bash", "-lc", cmd], {
            stdout: "pipe",
            stderr: "pipe",
            env: process.env,
        })

        // 并行读取 stdout/stderr，避免缓冲阻塞。
        const [stdout, stderr] = await Promise.all([
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text(),
        ])
        const exitCode = await proc.exited

        return `exit=${exitCode} stdout="${stdout}" stderr="${stderr}"`
    } catch (err) {
        return `bash 执行失败: ${(err as Error).message}`
    }
}
