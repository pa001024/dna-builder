import type { Monster } from "@/data/d/monster.data"
import monsterData from "@/data/d/monster.data"
import { monsterTagData, type MonsterTag } from "@/data/d/monstertag.data"

export interface MonsterTagGroup {
    name: string
    prefix: string
    primaryTag: MonsterTag
    tags: MonsterTag[]
}

const monsterTagGroupByName = new Map<string, MonsterTagGroup>()
const monsterTagGroupByTagId = new Map<string, MonsterTagGroup>()
const monsterTagGroupByPrefix = new Map<string, MonsterTagGroup>()

/**
 * 提取名称中的前缀（按空白字符分词后的首个词）。
 * @param name 原始名称
 * @returns 名称前缀；若为空则返回空字符串
 */
function extractNamePrefix(name: string): string {
    return name.trim().split(/\s+/)[0] || ""
}

for (const tag of monsterTagData) {
    const prefix = extractNamePrefix(tag.name)
    if (!prefix) {
        continue
    }

    const existingGroup = monsterTagGroupByName.get(tag.name)
    const group = existingGroup || {
        name: tag.name,
        prefix,
        primaryTag: tag,
        tags: [],
    }

    group.tags.push(tag)
    monsterTagGroupByName.set(tag.name, group)
    monsterTagGroupByTagId.set(tag.id, group)

    if (!monsterTagGroupByPrefix.has(prefix)) {
        monsterTagGroupByPrefix.set(prefix, group)
    }
}

export const monsterTagGroups = [...monsterTagGroupByName.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))

const relatedMonstersByPrimaryTagId = new Map<string, Monster[]>()

for (const monster of monsterData) {
    if (monster.id < 2000000) {
        continue
    }

    const group = monsterTagGroupByPrefix.get(extractNamePrefix(monster.n))
    if (!group) {
        continue
    }

    const monsters = relatedMonstersByPrimaryTagId.get(group.primaryTag.id)
    if (monsters) {
        monsters.push(monster)
    } else {
        relatedMonstersByPrimaryTagId.set(group.primaryTag.id, [monster])
    }
}

for (const monsters of relatedMonstersByPrimaryTagId.values()) {
    monsters.sort((a, b) => a.id - b.id)
}

/**
 * 根据号令者标签ID获取分组信息。
 * @param tagId 号令者标签ID（如 Mon.Strong.Blood）
 * @returns 对应分组，不存在时返回 null
 */
export function getMonsterTagGroupByTagId(tagId: string): MonsterTagGroup | null {
    return monsterTagGroupByTagId.get(tagId) || null
}

/**
 * 根据怪物名称匹配号令者分组。
 * @param monsterName 怪物名称（如 猩红 野蜂暗箭）
 * @returns 对应号令者分组，不存在时返回 null
 */
export function getMonsterTagGroupByMonsterName(monsterName: string): MonsterTagGroup | null {
    const prefix = extractNamePrefix(monsterName)
    if (!prefix) {
        return null
    }

    return monsterTagGroupByPrefix.get(prefix) || null
}

/**
 * 根据号令者标签ID获取关联怪物列表。
 * @param tagId 号令者标签ID
 * @returns 关联怪物数组
 */
export function getRelatedMonstersByMonsterTagId(tagId: string): Monster[] {
    const group = monsterTagGroupByTagId.get(tagId)
    if (!group) {
        return []
    }

    return relatedMonstersByPrimaryTagId.get(group.primaryTag.id) || []
}
