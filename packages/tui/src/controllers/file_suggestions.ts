import { withSharedCoreServerClient } from '../http/shared_core_client'
import type { FileSuggestion, FileSuggestionRequest } from './types'

export function normalizePath(input: string): string {
    return input.replace(/\\/g, '/')
}

export async function getFileSuggestions(req: FileSuggestionRequest): Promise<FileSuggestion[]> {
    const response = await withSharedCoreServerClient((client) =>
        client.suggestFiles({
            query: req.query,
            workspaceCwd: req.cwd,
            limit: req.limit,
            maxDepth: req.maxDepth,
            maxEntries: req.maxEntries,
            respectGitIgnore: req.respectGitIgnore,
            ignoreGlobs: req.ignoreGlobs,
        }),
    )

    return response.items
}

export function invalidateFileSuggestionCache(_cwd?: string): void {
    // Suggestions are served by core HTTP API; cache invalidation is handled server-side.
}
