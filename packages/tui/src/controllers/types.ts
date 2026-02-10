export type FileSuggestion = {
    id: string
    path: string
    name: string
    parent?: string
    isDir: boolean
}

export type FileSuggestionRequest = {
    cwd: string
    query: string
    limit?: number
    maxDepth?: number
    maxEntries?: number
    respectGitIgnore?: boolean
    ignoreGlobs?: string[]
}
