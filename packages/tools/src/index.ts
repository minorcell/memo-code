import type { ToolFn, ToolName } from '@memo/tools/tools/types'
import { bash } from '@memo/tools/tools/bash'
import { edit } from '@memo/tools/tools/edit'
import { fetchUrl } from '@memo/tools/tools/fetch'
import { glob } from '@memo/tools/tools/glob'
import { grep } from '@memo/tools/tools/grep'
import { read } from '@memo/tools/tools/read'
import { write } from '@memo/tools/tools/write'

/** 对外暴露的工具集合，供 Agent 通过 tool name 查找。 */
export const TOOLKIT: Record<ToolName, ToolFn> = {
    bash,
    read,
    write,
    edit,
    glob,
    grep,
    fetch: fetchUrl,
}
