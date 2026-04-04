import type { DNARoleEntity } from "dna-api"
import type { AbyssUsageSubmissionInput } from "@/api/gen/api-types"
import { abyssDungeons } from "@/data/d/abyss.data"
import { abyssDungeonVersionRanges, getVersionByTime } from "@/data/time.data"
import { parseAbyssBestTimeVo1 } from "@/utils/abyss-best-time"
import { sha256 } from "@/utils/sha256"

export interface AbyssUploadParticipantInput {
    roleType: "main" | "support"
    charId: number
    gradeLevel: number
    weaponId: number
    skillLevel: number
}

export interface AbyssUsageOwnedInput {
    chars: Array<{ charId: number; gradeLevel: number }>
    weapons: Array<{ weaponId: number; skillLevel: number }>
}

export interface CurrentAbyssSeason {
    seasonId: number
    seasonName?: string
    version?: string
    half?: "上半" | "下半"
    startTime: number
    endTime: number
    bindCharId?: number
}

/**
 * 归一化深渊上传用的角色 ID。
 * @param charId 角色 ID。
 * @returns 上传时使用的角色 ID。
 */
function normalizeAbyssCharId(charId: number): number {
    return charId === 160101 ? 1601 : charId
}

/**
 * 从已持有角色列表中优先按 icon 反查角色 ID。
 * @param roleInfo 角色信息。
 * @param icon 图标名。
 * @returns 角色 ID。
 */
function findOwnedCharIdByIcon(roleInfo: DNARoleEntity, icon?: string) {
    const roleShow = roleInfo.roleInfo?.roleShow
    if (!roleShow || !icon) {
        return null
    }
    const found = roleShow.roleChars.find(item => item.icon === icon && item.unLocked)
    return found ? found.charId : null
}

/**
 * 从已持有武器列表中优先按 icon 反查武器 ID。
 * @param roleInfo 角色信息。
 * @param icon 图标名。
 * @returns 武器 ID。
 */
function findOwnedWeaponIdByIcon(roleInfo: DNARoleEntity, icon?: string) {
    const roleShow = roleInfo.roleInfo?.roleShow
    if (!roleShow || !icon) {
        return null
    }
    const ownedWeapons = [...roleShow.closeWeapons, ...roleShow.langRangeWeapons]
    const found = ownedWeapons.find(item => item.icon === icon && item.unLocked)
    return found ? found.weaponId : null
}

/**
 * 推导赛季属于版本上半还是下半。
 * @param seasonStart 赛季开始时间。
 * @param versionStart 版本开始时间。
 * @param versionEnd 版本结束时间。
 * @returns 上半或下半。
 */
function getAbyssSeasonHalf(seasonStart: number, versionStart: number, versionEnd: number): "上半" | "下半" {
    return seasonStart < (versionStart + versionEnd) / 2 ? "上半" : "下半"
}

/**
 * 推导当前可上传的深渊赛季。
 * @param timestamp 当前时间戳（毫秒）。
 * @returns 当前赛季 ID。
 */
export function getCurrentAbyssSeason(timestamp = Date.now()): CurrentAbyssSeason | null {
    const now = Math.floor(timestamp / 1000)
    const seasons = abyssDungeons
        .filter(item => typeof item.sid === "number" && typeof item.st === "number" && typeof item.et === "number")
        .map(item => {
            const version = getVersionByTime(item.st)
            const versionRange = abyssDungeonVersionRanges.find(range => range.version === version)
            const half = versionRange ? getAbyssSeasonHalf(item.st!, versionRange.startTime, versionRange.endTime) : undefined
            return {
                seasonId: item.sid!,
                seasonName: item.sn,
                version,
                half,
                startTime: item.st!,
                endTime: item.et!,
                bindCharId: item.cid,
            }
        })
        .sort((a, b) => a.startTime - b.startTime)
    return seasons.find(item => now >= item.startTime && now < item.endTime) ?? null
}

/**
 * 推导当前可上传的深渊赛季 ID。
 * @param timestamp 当前时间戳（毫秒）。
 * @returns 当前赛季 ID。
 */
export function getCurrentAbyssSeasonId(timestamp = Date.now()) {
    return getCurrentAbyssSeason(timestamp)?.seasonId || null
}

/**
 * 提取当前账号已持有的角色和武器 ID。
 * @param roleInfo 角色信息。
 * @returns 已持有的角色和武器 ID。
 */
export function buildAbyssOwnedIds(roleInfo: DNARoleEntity): AbyssUsageOwnedInput {
    const roleShow = roleInfo.roleInfo?.roleShow
    if (!roleShow) {
        return { chars: [], weapons: [] }
    }
    const charMap = new Map<number, number>()
    for (const char of roleShow.roleChars) {
        if (!char.unLocked) {
            continue
        }
        const current = charMap.get(char.charId)
        if (current == null || char.gradeLevel > current) {
            charMap.set(char.charId, char.gradeLevel)
        }
    }
    const weaponMap = new Map<number, number>()
    for (const weapon of [...roleShow.closeWeapons, ...roleShow.langRangeWeapons]) {
        if (!weapon.unLocked) {
            continue
        }
        const current = weaponMap.get(weapon.weaponId)
        if (current == null || weapon.skillLevel > current) {
            weaponMap.set(weapon.weaponId, weapon.skillLevel)
        }
    }
    return {
        chars: [...charMap.entries()].map(([charId, gradeLevel]) => ({ charId, gradeLevel })),
        weapons: [...weaponMap.entries()].map(([weaponId, skillLevel]) => ({ weaponId, skillLevel })),
    }
}

/**
 * 先从持有信息优先反解，失败后回退到全局映射。
 * @param roleInfo 角色信息。
 * @param bestTimeVo1 深渊最佳阵容图标对象。
 * @returns 结构化 ID。
 */
function parseAbyssBestTimeVo1WithOwned(roleInfo: DNARoleEntity, bestTimeVo1?: Parameters<typeof parseAbyssBestTimeVo1>[0]) {
    const parsed = parseAbyssBestTimeVo1(bestTimeVo1)
    const roleShow = roleInfo.roleInfo?.roleShow
    if (!roleShow) {
        return parsed
    }

    return {
        ...parsed,
        charId: normalizeAbyssCharId(findOwnedCharIdByIcon(roleInfo, bestTimeVo1?.charIcon) ?? parsed.charId ?? 0) || null,
        meleeId: findOwnedWeaponIdByIcon(roleInfo, bestTimeVo1?.closeWeaponIcon) ?? parsed.meleeId,
        rangedId: findOwnedWeaponIdByIcon(roleInfo, bestTimeVo1?.langRangeWeaponIcon) ?? parsed.rangedId,
        petId: parsed.petId,
        support1: normalizeAbyssCharId(findOwnedCharIdByIcon(roleInfo, bestTimeVo1?.phantomCharIcon1) ?? parsed.support1 ?? 0) || null,
        supportWeapon1: findOwnedWeaponIdByIcon(roleInfo, bestTimeVo1?.phantomWeaponIcon1) ?? parsed.supportWeapon1,
        support2: normalizeAbyssCharId(findOwnedCharIdByIcon(roleInfo, bestTimeVo1?.phantomCharIcon2) ?? parsed.support2 ?? 0) || null,
        supportWeapon2: findOwnedWeaponIdByIcon(roleInfo, bestTimeVo1?.phantomWeaponIcon2) ?? parsed.supportWeapon2,
    }
}

/**
 * 将角色深渊数据转换为可提交的 GraphQL payload。
 * @param roleInfo 角色信息。
 * @returns 可提交的 payload；若无法反解则返回 `null`。
 */
export async function buildAbyssUploadPayload(roleInfo: DNARoleEntity): Promise<AbyssUsageSubmissionInput | null> {
    const roleShow = roleInfo.roleInfo?.roleShow
    const bestTimeVo1 = roleInfo.roleInfo?.abyssInfo?.bestTimeVo1
    if (!roleShow || !bestTimeVo1) {
        return null
    }

    const lineup = parseAbyssBestTimeVo1WithOwned(roleInfo, bestTimeVo1)
    const owned = buildAbyssOwnedIds(roleInfo)

    const uidSha256 = sha256(String(roleShow.roleId ?? ""))
    if (!uidSha256) {
        return null
    }

    const starsValue = String(roleInfo.roleInfo.abyssInfo!.stars).split("/")[0]
    const stars = Number(starsValue)
    if (!Number.isInteger(stars) || stars < 0) {
        throw new Error("stars 非法")
    }

    const payload: AbyssUsageSubmissionInput = {
        uidSha256,
        level: roleShow.level,
        charId: lineup.charId != null ? normalizeAbyssCharId(lineup.charId) : 0,
        meleeId: lineup.meleeId ?? 0,
        rangedId: lineup.rangedId ?? 0,
        support1: lineup.support1 != null ? normalizeAbyssCharId(lineup.support1) : 0,
        supportWeapon1: lineup.supportWeapon1 ?? 0,
        support2: lineup.support2 != null ? normalizeAbyssCharId(lineup.support2) : 0,
        supportWeapon2: lineup.supportWeapon2 ?? 0,
        stars,
        ownedChars: owned.chars,
        ownedWeapons: owned.weapons,
    }
    if (lineup.petId != null) {
        payload.petId = lineup.petId
    }
    return payload
}
