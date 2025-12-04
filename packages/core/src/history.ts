/** 默认的对话记录文件名。 */
export const HISTORY_FILE = "history.xml"

/**
 * 将对话日志写入 XML 文件，便于复盘与调试。
 * @param logEntries 已格式化的 XML <message> 片段集合
 * @param filePath 自定义写入路径，默认 history.xml
 */
export async function writeHistory(logEntries: string[], filePath = HISTORY_FILE) {
    const startedAt = new Date().toISOString()
    const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<history startedAt="${startedAt}">`,
        ...logEntries,
        "</history>",
        "",
    ].join("\n")
    await Bun.write(filePath, xml)
}
