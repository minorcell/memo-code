import {
    createEmbeddedCoreServerClient,
    type CoreServerClient,
    type ListSessionsQuery,
} from './core_server_client'

let sharedClientPromise: Promise<{
    client: CoreServerClient
    close: () => Promise<void>
}> | null = null

async function ensureSharedClient() {
    if (!sharedClientPromise) {
        sharedClientPromise = createEmbeddedCoreServerClient({
            memoHome: process.env.MEMO_HOME,
        }).then((embedded) => ({
            client: embedded.client,
            close: embedded.close,
        }))
    }
    return sharedClientPromise
}

export async function getSharedCoreServerClient(): Promise<CoreServerClient> {
    const shared = await ensureSharedClient()
    return shared.client
}

export async function withSharedCoreServerClient<T>(
    task: (client: CoreServerClient) => Promise<T>,
): Promise<T> {
    const client = await getSharedCoreServerClient()
    return task(client)
}

export async function closeSharedCoreServerClient(): Promise<void> {
    if (!sharedClientPromise) return

    const pending = sharedClientPromise
    sharedClientPromise = null

    try {
        const shared = await pending
        await shared.close()
    } catch {
        // Best-effort close.
    }
}

export type { CoreServerClient, ListSessionsQuery }
