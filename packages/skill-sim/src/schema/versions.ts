/**
 * 契约版本常量与迁移口径。
 *
 * 两个文档各自独立演进：
 * - `SKILL_ASSET_SCHEMA_VERSION`：导出器产物 `SkillAssetDoc`（跨仓库契约，U1/U2 写，U3 读）；
 * - `SKILL_BEHAVIOR_SCHEMA_VERSION`：本仓库 `SkillBehaviorDoc`（IR，U3 写，U4/U5 读）。
 *
 * 只做 additive 变更时保持版本号不变；字段语义变化、必填项变化、枚举收窄时 +1，
 * 并在 `MIGRATIONS` 里登记「旧版本 → 新版本」的迁移函数。未知版本一律 fail（不猜测）。
 */
export const SKILL_ASSET_SCHEMA_VERSION = 1
export const SKILL_BEHAVIOR_SCHEMA_VERSION = 1

/** 当前实现能读取的全部版本 */
export const SUPPORTED_ASSET_SCHEMA_VERSIONS: readonly number[] = [1]
export const SUPPORTED_BEHAVIOR_SCHEMA_VERSIONS: readonly number[] = [1]

export type SchemaKind = "asset" | "behavior"

export interface SchemaVersionCheck {
    ok: boolean
    version: unknown
    supported: readonly number[]
    message?: string
}

/**
 * 校验文档版本号；不抛异常，交由调用方转成带 path 的诊断。
 * @param value 文档里的 schemaVersion 原值
 * @param kind asset（导出器产物）或 behavior（运行时 IR）
 */
export function checkSchemaVersion(value: unknown, kind: SchemaKind): SchemaVersionCheck {
    const supported = kind === "asset" ? SUPPORTED_ASSET_SCHEMA_VERSIONS : SUPPORTED_BEHAVIOR_SCHEMA_VERSIONS
    const label = kind === "asset" ? "SkillAssetDoc" : "SkillBehaviorDoc"
    if (typeof value !== "number" || !Number.isInteger(value)) {
        return { ok: false, version: value, supported, message: `${label}.schemaVersion 必须是整数，实际为 ${JSON.stringify(value)}` }
    }
    if (!supported.includes(value)) {
        return {
            ok: false,
            version: value,
            supported,
            message: `${label}.schemaVersion=${value} 不受支持（支持 ${supported.join(", ")}）；请迁移或升级 skill-sim`,
        }
    }
    return { ok: true, version: value, supported }
}
