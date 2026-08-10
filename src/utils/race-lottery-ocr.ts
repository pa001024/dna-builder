export interface RaceLotteryOcrPlayer {
    playerId: number
    name: string
}

export interface RaceLotteryOcrBuff {
    buffId: number
    name: string
}

export type RaceLotteryBuffIds = [number, number, number]

export interface RaceLotteryOcrResult {
    playerId: number | null
    playerName: string | null
    buffIds: RaceLotteryBuffIds
}

/**
 * 规整 OCR 文本，去除空白与常见分隔符以便匹配中文名称。
 * @param value OCR 原文
 * @returns 规整后的文本
 */
function normalizeOcrText(value: string): string {
    return value.normalize("NFKC").replace(/\s+/gu, "").replace(/[：:]/gu, "")
}

/**
 * 计算两个短文本之间的编辑距离。
 * @param left 左侧文本
 * @param right 右侧文本
 * @returns 编辑距离
 */
function getEditDistance(left: string, right: string): number {
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
    for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
        const current = [leftIndex + 1]
        for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
            current.push(
                left[leftIndex] === right[rightIndex]
                    ? previous[rightIndex]
                    : Math.min(previous[rightIndex], previous[rightIndex + 1], current[rightIndex]) + 1
            )
        }
        for (let index = 0; index < current.length; index += 1) {
            previous[index] = current[index]
        }
    }
    return previous[right.length]
}

/**
 * 在短文本中查找最接近的候选名称，最多容忍一个 OCR 字符错误。
 * @param value 待匹配文本
 * @param candidates 候选名称
 * @returns 匹配到的候选名称
 */
function findClosestName(value: string, candidates: string[]): string | null {
    const normalizedValue = normalizeOcrText(value)
    if (!normalizedValue) return null

    for (const candidate of candidates) {
        if (normalizedValue.includes(normalizeOcrText(candidate))) return candidate
    }

    let closest: { name: string; distance: number } | null = null
    for (const candidate of candidates) {
        const normalizedCandidate = normalizeOcrText(candidate)
        if (!normalizedCandidate || normalizedValue.length < normalizedCandidate.length) continue
        for (let start = 0; start <= normalizedValue.length - normalizedCandidate.length; start += 1) {
            const part = normalizedValue.slice(start, start + normalizedCandidate.length)
            const distance = getEditDistance(part, normalizedCandidate)
            if (distance <= 1 && (!closest || distance < closest.distance)) {
                closest = { name: candidate, distance }
            }
        }
    }
    return closest?.name || null
}

/**
 * 从 OCR 行中找到选手名称。
 * @param lines OCR 行
 * @param players 静态选手列表
 * @returns 选手信息
 */
function findPlayer(lines: string[], players: RaceLotteryOcrPlayer[]): RaceLotteryOcrPlayer | null {
    const names = players.map(player => player.name)
    for (const line of lines) {
        const matchedName = findClosestName(line, names)
        if (matchedName) return players.find(player => player.name === matchedName) || null
    }
    return null
}

/**
 * 从 OCR 文本中找到最接近的结构化词条。
 * @param value 待匹配文本。
 * @param buffs 词条候选列表。
 * @returns 匹配到的词条。
 */
function findClosestBuff(value: string, buffs: RaceLotteryOcrBuff[]): RaceLotteryOcrBuff | null {
    const matchedName = findClosestName(
        value,
        buffs.map(buff => buff.name)
    )
    return matchedName ? buffs.find(buff => buff.name === matchedName) || null : null
}

/**
 * 从 OCR 行中读取状态槽位编号。
 * @param line OCR 行。
 * @returns 0 到 2 的槽位索引，无法识别时返回 null。
 */
function getStatusIndex(line: string): number | null {
    const match = line.match(/^状态\s*([0-9一二三四五六七八九十]+)/u)
    if (!match?.[1]) return null
    const chineseIndex: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
    const statusNumber = Number(match[1]) || chineseIndex[match[1]]
    return statusNumber >= 1 && statusNumber <= 3 ? statusNumber - 1 : null
}

/**
 * 从 OCR 行中提取三个状态槽位的 buff ID。
 * @param lines OCR 行
 * @param buffs 活动词条
 * @returns 固定三个位置的 buff ID
 */
function extractBuffIds(lines: string[], buffs: RaceLotteryOcrBuff[]): RaceLotteryBuffIds {
    const buffIds: RaceLotteryBuffIds = [0, 0, 0]
    let nextIndex = 0
    for (const line of lines) {
        const statusMatch = line.match(/^状态\s*[0-9一二三四五六七八九十]*\s*(?:[:：]\s*)?(.+?)\s*$/u)
        if (!statusMatch) continue
        const rawValue = statusMatch[1].trim()
        const matchedBuff = findClosestBuff(rawValue.replace(/^[|丨]+|[|丨]+$/gu, "").trim(), buffs)
        if (!matchedBuff) continue

        const explicitIndex = getStatusIndex(line)
        const targetIndex = explicitIndex ?? nextIndex
        if (targetIndex < 0 || targetIndex > 2 || buffIds[targetIndex] !== 0) continue
        buffIds[targetIndex] = matchedBuff.buffId
        nextIndex = targetIndex + 1
    }
    return buffIds
}

/**
 * 解析 RaceLottery 选手卡片 OCR 文本。
 * @param text OCR 原文
 * @param players 静态选手列表
 * @param buffs 活动词条列表
 * @returns 识别出的选手和可上传词条
 */
export function parseRaceLotteryOcr(text: string, players: RaceLotteryOcrPlayer[], buffs: RaceLotteryOcrBuff[]): RaceLotteryOcrResult {
    const lines = text
        .split(/\r?\n/u)
        .map(line => line.trim())
        .filter(Boolean)
    const player = findPlayer(lines, players)
    return {
        playerId: player?.playerId || null,
        playerName: player?.name || null,
        buffIds: extractBuffIds(lines, buffs),
    }
}

/**
 * 按提交记录顺序合并状态槽位，并去除空位与重复 buff ID。
 * @param records 多个用户提交的三个状态槽位。
 * @returns 首次出现顺序的汇总 buff ID。
 */
export function mergeRaceLotteryBuffIds(records: readonly RaceLotteryBuffIds[]): number[] {
    const seenBuffIds = new Set<number>()
    const mergedBuffIds: number[] = []
    for (const record of records) {
        for (const buffId of record) {
            if (buffId > 0 && !seenBuffIds.has(buffId)) {
                seenBuffIds.add(buffId)
                mergedBuffIds.push(buffId)
            }
        }
    }
    return mergedBuffIds
}
