// worker realm 里必须显式加载 helper：它负责注册 CharBuild.createTeamResolver，
// 否则快照重建出的构筑解析不了「角色名::属性」，跨角色表达式会静默算成 0。
import "@/data/CharBuildHelper"
import { type CharBuildWorkerSnapshot, createBuildFromSnapshot } from "@/data/CharBuildSnapshot"

/**
 * 升华装备收益快照计算：只负责从主线程组装好的 `CharBuildWorkerSnapshot` 重建构筑并求值。
 * 数据解析留在主线程（与页面同一个数据包实例），worker 不直接读自己的 `@/data` 数据表，
 * 避免换包 / 安全模式 / 新角色下页面伤害与收益不一致。
 */

export interface SnapshotDamageResult {
    damage?: number
    error?: string
}

/**
 * 从构筑快照计算伤害。
 * @param snapshot 主线程生成的构筑快照
 * @returns 伤害或明确错误
 */
export function calculateSnapshotDamage(snapshot: CharBuildWorkerSnapshot): SnapshotDamageResult {
    try {
        const build = createBuildFromSnapshot(snapshot)
        // 显式目标表达式已在主线程组装快照前校验；这里直接计算，
        // 避免把 CharBuild 的默认目标函数（"伤害"）误判为非法标识符。
        const damage = build.calculate()
        if (!Number.isFinite(damage)) return { error: "damage-not-finite" }
        return { damage }
    } catch (cause) {
        return { error: cause instanceof Error ? cause.message : String(cause) }
    }
}

/**
 * 团队快照的侧集合是否一致（side id 集合 + 数量）：worker 拒绝侧集合漂移的候选，
 * 避免用缩小 / 更换分母的候选与基准合计做差分。
 * @param baseline 基准侧 id 列表
 * @param candidate 候选侧 id 列表
 * @returns 一致为 true
 */
export function hasSameTeamSides(baseline: readonly string[], candidate: readonly string[]): boolean {
    if (baseline.length !== candidate.length) return false
    const expected = [...baseline].sort()
    const actual = [...candidate].sort()
    return expected.every((side, index) => side === actual[index])
}

/**
 * 求一组参与侧快照的目标合计（与目标函数卡的 `charTeamSnapshot.total` 同口径）。
 * 空数组或任一侧失败都返回明确错误，不用部分和冒充合计。
 * @param snapshots 参与合计的各侧构筑快照
 * @returns 伤害合计或明确错误
 */
export function calculateTeamSnapshotDamage(snapshots: readonly CharBuildWorkerSnapshot[]): SnapshotDamageResult {
    if (!snapshots.length) return { error: "build-unavailable" }
    let total = 0
    for (const snapshot of snapshots) {
        const result = calculateSnapshotDamage(snapshot)
        if (result.damage === undefined) return { error: result.error ?? "build-unavailable" }
        total += result.damage
    }
    return { damage: total }
}
