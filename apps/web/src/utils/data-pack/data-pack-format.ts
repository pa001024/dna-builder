/**
 * 数据包格式 major：打包与抓取共用的统一自增版本。
 *
 * versions.json 条目与包内 manifest.json 都带 major；改动数据包格式（读包侧按旧结构解析会崩）
 * 时把这个值加一。抓取侧只接受 major <= 当前值的包，新格式包由新版应用/SDK 消费，老版本自动
 * 跳过，从而向前兼容。加字段是纯 additive，老版本读包忽略未知字段，不受影响。
 */
export const DATA_PACK_FORMAT_MAJOR = 2

/**
 * 历史分割线：1.6.208.7 把 MOD 数值挪进 `加成`（dict），旧读包侧会把 dict 当数值除而崩溃。
 * 远端版本列表里缺 major 的老条目按这条线归一化，显式 major 优先。
 */
export const DATA_PACK_LEGACY_CUTOFF_VERSION = "1.6.208.7"

/** 按数字段比较版本号，长度不等时短者补零，非数字段按零处理。 */
export function compareDataPackVersions(a: string, b: string): number {
    const num = (part: string) => {
        const value = Number(part)
        return Number.isNaN(value) ? 0 : value
    }
    const pa = a.split(".").map(num)
    const pb = b.split(".").map(num)
    const length = Math.max(pa.length, pb.length)
    for (let index = 0; index < length; index++) {
        const diff = (pa[index] ?? 0) - (pb[index] ?? 0)
        if (diff !== 0) return diff > 0 ? 1 : -1
    }
    return 0
}

/** 归一化 major：合法正整数直接采用；缺失/非法时按历史分割线推断（老包=1，新格式=2）。 */
export function normalizeDataPackMajor(major: unknown, version?: string): number {
    if (typeof major === "number" && Number.isInteger(major) && major > 0) return major
    if (version && compareDataPackVersions(version, DATA_PACK_LEGACY_CUTOFF_VERSION) >= 0) return 2
    return 1
}

/** 当前应用/SDK 是否能读取该 major 的包。 */
export function isDataPackMajorSupported(major: unknown, version?: string): boolean {
    return normalizeDataPackMajor(major, version) <= DATA_PACK_FORMAT_MAJOR
}
