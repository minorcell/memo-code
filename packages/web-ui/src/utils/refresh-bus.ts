const APP_REFRESH_EVENT = 'memo:web:refresh'

export function emitAppRefresh(): void {
    window.dispatchEvent(new CustomEvent(APP_REFRESH_EVENT))
}

export function onAppRefresh(handler: () => void): () => void {
    const listener = () => {
        handler()
    }

    window.addEventListener(APP_REFRESH_EVENT, listener)
    return () => {
        window.removeEventListener(APP_REFRESH_EVENT, listener)
    }
}
