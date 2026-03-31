/**
 * 深渊副本时间与版本的对应关系。
 * 版本按副本开启时间分段，列表页和筛选逻辑统一复用。
 */
export const abyssDungeonVersionRanges = [
    { startTime: 1761512400, endTime: 1766437200, version: "1.0" },
    { startTime: 1766437200, endTime: 1770688800, version: "1.1" },
    { startTime: 1770688800, endTime: 1775527200, version: "1.2" },
    { startTime: 1775527200, endTime: 1780304400, version: "1.3" },
    { startTime: 1780304400, endTime: Number.POSITIVE_INFINITY, version: "1.4" },
] as const

/**
 * 根据时间推导版本号。
 * @param timestamp 时间戳
 * @returns 版本号，未匹配时返回空字符串
 */
export function getVersionByTime(timestamp?: number): string {
    if (!timestamp) {
        return ""
    }

    if (timestamp < abyssDungeonVersionRanges[0].startTime) {
        return abyssDungeonVersionRanges[0].version
    }

    const range = abyssDungeonVersionRanges.find(item => timestamp >= item.startTime && timestamp < item.endTime)
    return range?.version || ""
}
