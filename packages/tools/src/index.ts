import type { ToolFn, ToolName } from "./types"
import { bash } from "./bash"
import { edit } from "./edit"
import { fetchUrl } from "./fetch"
import { glob } from "./glob"
import { grep } from "./grep"
import { read } from "./read"
import { write } from "./write"

export const TOOLKIT: Record<ToolName, ToolFn> = {
    bash,
    read,
    write,
    edit,
    glob,
    grep,
    fetch: fetchUrl,
}
