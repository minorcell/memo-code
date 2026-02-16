import { wsRequest } from '@/api/ws-client'
import type { SkillDetail, SkillRecord } from '@/api/types'

export function getSkills(params?: {
    scope?: 'project' | 'global'
    q?: string
    workspaceId?: string
}) {
    return wsRequest<{ items: SkillRecord[] }>('skills.list', params ?? {})
}

export function getSkill(id: string) {
    return wsRequest<SkillDetail>('skills.get', { id })
}

export function createSkill(params: {
    scope: 'project' | 'global'
    workspaceId?: string
    name: string
    description?: string
    content?: string
}) {
    return wsRequest<{ created: true; item: SkillRecord }>('skills.create', params)
}

export function updateSkill(
    id: string,
    params: {
        description?: string
        content?: string
    },
) {
    return wsRequest<{ updated: true }>('skills.update', {
        id,
        ...params,
    })
}

export function removeSkill(id: string) {
    return wsRequest<{ deleted: true }>('skills.remove', { id })
}

export function setActiveSkillIds(ids: string[]) {
    return wsRequest<{ active: string[] }>('skills.active.set', { ids })
}
