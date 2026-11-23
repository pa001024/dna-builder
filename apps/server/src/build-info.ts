import {
    decodeTranscendSettingsPayload,
    isTranscendBuildEnabled,
    type TranscendSettings,
} from "dna-builder-data/transcendSettings"

/** 构筑类型：普通 / 升华 */
export type BuildType = "normal" | "transcend"

/** 构筑摘要信息（GraphQL `BuildInfo`） */
export interface BuildInfo {
    buildType: BuildType
}

/** 已解析次数：仅供排查与测试确认「未请求 / 已入库时不解析」 */
let parseCount = 0

/**
 * 从构筑配置原文判定构筑类型（写入构筑时落库，也用于旧数据回退）。
 * 只认结构化解码后的 `transcend.enabled`，与迁移回填 `0035` 同口径；
 * 分享 / 存档载荷的 `enabled` 是 `1|0`，先经 `decodeTranscendSettingsPayload` 还原成布尔。
 * @param charSettings 构筑配置原文（JSON 字符串）
 * @returns 构筑类型；解析失败 / 配置损坏时回退普通
 */
export function computeBuildType(charSettings: string): BuildType {
    parseCount++
    try {
        const parsed = JSON.parse(charSettings) as { transcend?: unknown } | null
        const transcend = decodeTranscendSettingsPayload(parsed?.transcend) as TranscendSettings | null | undefined
        return isTranscendBuildEnabled(transcend) ? "transcend" : "normal"
    } catch {
        return "normal"
    }
}

/**
 * 优先采用已入库的构筑类型；入库值缺失 / 非法（迁移前数据、手工数据）时按配置原文回退判定。
 * @param stored 数据库 build_type 列的值
 * @param charSettings 构筑配置原文
 * @returns 构筑类型
 */
export function resolveBuildType(stored: unknown, charSettings: string): BuildType {
    if (stored === "normal" || stored === "transcend") return stored
    return computeBuildType(charSettings)
}

/**
 * 读取构筑类型解析次数（仅供排查与测试）。
 * @returns 自模块载入以来 computeBuildType 的调用次数
 */
export function getBuildInfoParseCount(): number {
    return parseCount
}
