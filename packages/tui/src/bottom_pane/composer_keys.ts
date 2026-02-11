type KeyLike = {
    backspace?: boolean
    delete?: boolean
    ctrl?: boolean
}

export type DeleteKind = 'none' | 'backspace' | 'delete'

const ASCII_BS = '\u0008'
const ASCII_DEL = '\u007f'

export function resolveDeleteKind(input: string, key: KeyLike): DeleteKind {
    const isBackspaceChar = input === ASCII_BS || input === ASCII_DEL
    const isCtrlHBackspace = Boolean(key.ctrl) && input.toLowerCase() === 'h'

    if (Boolean(key.backspace) || isBackspaceChar || isCtrlHBackspace) {
        return 'backspace'
    }

    if (Boolean(key.delete)) {
        return 'delete'
    }

    return 'none'
}
