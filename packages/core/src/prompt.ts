import { join } from "node:path"

export async function loadSystemPrompt(): Promise<string> {
    const promptPath = join(import.meta.dir, "..", "prompt.tmpl")
    try {
        return await Bun.file(promptPath).text()
    } catch (err) {
        throw new Error(
            `无法读取系统提示词 ${promptPath}: ${(err as Error).message}`,
        )
    }
}
