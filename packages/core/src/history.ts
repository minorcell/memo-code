export const HISTORY_FILE = "history.xml"

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
