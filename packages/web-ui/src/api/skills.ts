import { request } from '@/api/request'
import type { SkillDetail, SkillRecord } from '@/api/types'

export function getSkills(params?: {
    scope?: 'project' | 'global'
    q?: string
    workspaceCwd?: string
}) {
    return request<{ items: SkillRecord[] }>({
        method: 'GET',
        url: '/api/skills',
        params: params,
    })
}

export function getSkill(id: string) {
    return request<SkillDetail>({
        method: 'GET',
        url: `/api/skills/${encodeURIComponent(id)}`,
    })
}

export function createSkill(params: {
    scope: 'project' | 'global'
    workspaceCwd?: string
    name: string
    description?: string
    content?: string
}) {
    return request<{ created: true; item: SkillRecord }>({
        method: 'POST',
        url: '/api/skills',
        data: params,
    })
}

export function updateSkill(
    id: string,
    params: {
        description?: string
        content?: string
    },
) {
    return request<{ updated: true }>({
        method: 'PATCH',
        url: `/api/skills/${encodeURIComponent(id)}`,
        data: params,
    })
}

export function removeSkill(id: string) {
    return request<{ deleted: true }>({
        method: 'DELETE',
        url: `/api/skills/${encodeURIComponent(id)}`,
    })
}

export function setActiveSkillIds(ids: string[]) {
    return request<{ active: string[] }>({
        method: 'POST',
        url: '/api/skills/active',
        data: { ids },
    })
}
