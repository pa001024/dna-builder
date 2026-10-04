/**
 * 构筑榜单目标值（targetValue）计算与内存缓存。
 *
 * 把构筑的 charSettings 交给上层真实的 CharBuild 模型算出 `calculate()` 结果，作为榜单排序依据。
 * 该值只缓存在进程内存里、不落库：数据包版本变化会让同一份 charSettings 算出不同数值，
 * 落库会留下无法判定新鲜度的脏值；改为内存缓存后由「改构筑 / 传数据包」两个入口显式清空。
 */

import { createCharBuildFromSettings } from "dna-builder-data/CharBuildHelper"
import { normalizeCharSettings } from "@/composables/useCharSettings"

/**
 * 单份构筑的目标值缓存，键为构筑 id。
 * 构筑内容被改动（updateBuild）或数据包更新后，必须显式清掉对应条目/整表，否则会返回旧值。
 */
const cache = new Map<string, number>()

/** 同一构筑的并发计算去重：同一 id 的请求共享同一次计算 */
const inflight = new Map<string, Promise<number | null>>()

/**
 * 计算单份构筑的目标值。
 * @param charId 角色 id
 * @param charSettings 构筑配置原文（JSON 字符串）
 * @returns 目标值；解析或计算失败、结果非有限数时返回 null（调用方按「无数据」处理）
 */
export function computeBuildTargetValue(charId: number, charSettings: string): number | null {
    try {
        const settings = normalizeCharSettings(JSON.parse(charSettings))
        const value = createCharBuildFromSettings(charId, settings).calculate()
        return Number.isFinite(value) ? value : null
    } catch {
        // 构筑可能引用已下线的 BUFF / 武器，或配置本身损坏：按无数据返回，不影响其他条目
        return null
    }
}

/**
 * 读取构筑目标值，命中缓存直接返回，未命中则计算并写入缓存。
 * 计算失败返回 null 且不写缓存，避免把失败结果固化（数据包更新后重试即可恢复）。
 * @param id 构筑 id
 * @param charId 角色 id
 * @param charSettings 构筑配置原文
 * @returns 目标值；不可得时为 null
 */
export function getBuildTargetValue(id: string, charId: number, charSettings: string): Promise<number | null> {
    const cached = cache.get(id)
    if (cached !== undefined) return Promise.resolve(cached)

    const pending = inflight.get(id)
    if (pending) return pending

    const task = Promise.resolve()
        .then(() => computeBuildTargetValue(charId, charSettings))
        .then(value => {
            if (value !== null) cache.set(id, value)
            return value
        })
        .finally(() => {
            inflight.delete(id)
        })

    inflight.set(id, task)
    return task
}

/**
 * 批量读取构筑目标值，供列表类查询一次性补齐。
 * 单条失败只影响自身，不中断整批。
 * @param items 构筑列表（需要 id / charId / charSettings）
 * @returns 构筑 id → 目标值（不可得的条目不会出现在结果中）
 */
export async function getBuildTargetValues(
    items: Array<{ id: string; charId: number; charSettings: string }>
): Promise<Map<string, number>> {
    const values = await Promise.all(
        items.map(item => getBuildTargetValue(item.id, item.charId, item.charSettings).then(value => [item.id, value] as const))
    )
    const result = new Map<string, number>()
    for (const [id, value] of values) {
        if (value !== null) result.set(id, value)
    }
    return result
}

/**
 * 清空全部缓存。用于内容不再可信的场景：上传数据包、服务器数据更新等。
 * @returns 被清掉的条目数
 */
export function clearBuildTargetValueCache(): number {
    const size = cache.size
    cache.clear()
    return size
}

/**
 * 清除单个构筑的缓存。
 * @param id 构筑 id
 * @returns 是否清掉了条目
 */
export function invalidateBuildTargetValue(id: string): boolean {
    return cache.delete(id)
}

/**
 * 当前缓存条目数（仅供排查与测试）。
 * @returns 缓存条目数
 */
export function getBuildTargetValueCacheSize(): number {
    return cache.size
}
