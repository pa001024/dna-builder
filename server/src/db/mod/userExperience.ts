import { and, eq } from "drizzle-orm"
import { db, schema } from ".."

export const USER_LEVEL_EXPERIENCE_REQUIREMENTS = [20, 50, 100, 200, 300, 500, 1000, 1500] as const
export const USER_LEVEL_EXPERIENCE_INCREMENT = 500
export const USER_DAILY_ONLINE_EXPERIENCE_REQUIRED_MS = 60 * 60 * 1000

export const USER_EXPERIENCE_SOURCES = {
    DAILY_LAUNCH: "daily_launch",
    DAILY_ONLINE_HOUR: "daily_online_hour",
    DAILY_MESSAGE: "daily_message",
} as const

export type UserExperienceSource = (typeof USER_EXPERIENCE_SOURCES)[keyof typeof USER_EXPERIENCE_SOURCES]

export const USER_EXPERIENCE_REWARD_MAP: Record<UserExperienceSource, number> = {
    [USER_EXPERIENCE_SOURCES.DAILY_LAUNCH]: 2,
    [USER_EXPERIENCE_SOURCES.DAILY_ONLINE_HOUR]: 3,
    [USER_EXPERIENCE_SOURCES.DAILY_MESSAGE]: 1,
}

export type UserExperienceGrantResult = {
    awardedExp: number
    awardedPoints: number
    user: typeof schema.users.$inferSelect
    levelChanged: boolean
    alreadyClaimed: boolean
}

export type UserExperienceEligibility =
    | {
          ok: true
      }
    | {
          ok: false
          reason: "launch_not_claimed" | "not_enough_online_time"
          waitMs?: number
      }

export type TodayUserExperienceRewardMap = Partial<Record<UserExperienceSource, typeof schema.userExperienceRewards.$inferSelect>>

/**
 * @description 计算当前用户距离“每日在线一小时”奖励的剩余等待时长。
 * @param userId 用户 ID。
 * @param todayRewards 可选的今日奖励缓存，避免重复查询。
 * @returns 剩余等待毫秒数；若今天尚未领取打开软件奖励，则返回 `null`。
 */
export async function getDailyOnlineExperienceRetryAfterMs(
    userId: string,
    todayRewards?: TodayUserExperienceRewardMap
): Promise<number | null> {
    const rewards = todayRewards ?? (await getTodayUserExperienceRewards(userId))
    const launchReward = rewards[USER_EXPERIENCE_SOURCES.DAILY_LAUNCH]
    if (!launchReward) {
        return null
    }

    const launchTimestamp = parseStoredDateTime(launchReward.createdAt)
    if (launchTimestamp === null) {
        return null
    }

    return Math.max(0, USER_DAILY_ONLINE_EXPERIENCE_REQUIRED_MS - (Date.now() - launchTimestamp))
}

/**
 * @description 根据累计经验计算当前等级。
 * 每个数组项表示“当前等级升到下一级所需经验”，超出配置后按最后一个档位递增。
 * @param experience 用户累计经验。
 * @returns 当前等级。
 */
export function calculateUserLevel(experience: number): number {
    let remainExperience = Math.max(0, experience)
    let level = 1

    while (remainExperience >= getLevelRequiredExperience(level)) {
        remainExperience -= getLevelRequiredExperience(level)
        level += 1
    }

    return level
}

/**
 * @description 获取指定等级升到下一级所需经验。
 * @param level 当前等级。
 * @returns 升到下一级所需经验。
 */
export function getLevelRequiredExperience(level: number): number {
    const index = Math.max(0, Math.floor(level) - 1)
    if (index < USER_LEVEL_EXPERIENCE_REQUIREMENTS.length) {
        return USER_LEVEL_EXPERIENCE_REQUIREMENTS[index]
    }

    const lastConfigured = USER_LEVEL_EXPERIENCE_REQUIREMENTS[USER_LEVEL_EXPERIENCE_REQUIREMENTS.length - 1]
    const extraLevelCount = index - (USER_LEVEL_EXPERIENCE_REQUIREMENTS.length - 1)
    return lastConfigured + extraLevelCount * USER_LEVEL_EXPERIENCE_INCREMENT
}

/**
 * @description 获取某等级起始时的累计经验。
 * @param level 当前等级。
 * @returns 该等级起始累计经验。
 */
export function getLevelStartExperience(level: number): number {
    let totalExperience = 0
    for (let currentLevel = 1; currentLevel < Math.max(1, Math.floor(level)); currentLevel += 1) {
        totalExperience += getLevelRequiredExperience(currentLevel)
    }
    return totalExperience
}

/**
 * @description 生成亚洲上海时区的自然日键，供“每日奖励”去重使用。
 * @param date 当前时间，默认使用系统当前时间。
 * @returns `YYYY-MM-DD` 格式日期键。
 */
export function getShanghaiDateKey(date: Date = new Date()): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date)
}

/**
 * @description 解析数据库里按 `zh-CN` 生成的时间字符串。
 * @param value 数据库保存的时间文本。
 * @returns 对应时间戳；解析失败时返回 `null`。
 */
export function parseStoredDateTime(value?: string | null): number | null {
    if (!value) return null
    const matched = value.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})$/)
    if (!matched) return null

    const [, year, month, day, hour, minute, second] = matched
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)).getTime()
}

/**
 * @description 查询用户今天是否已经领取过指定经验奖励。
 * @param userId 用户 ID。
 * @param source 奖励来源。
 * @returns 今日奖励记录，不存在则返回 `null`。
 */
export async function getTodayUserExperienceReward(userId: string, source: UserExperienceSource) {
    const rewards = await getTodayUserExperienceRewards(userId)
    return rewards[source] ?? null
}

/**
 * @description 查询用户今天已经领取过的所有经验奖励，并按来源映射返回。
 * @param userId 用户 ID。
 * @returns 今日奖励映射。
 */
export async function getTodayUserExperienceRewards(userId: string): Promise<TodayUserExperienceRewardMap> {
    const records = await db.query.userExperienceRewards.findMany({
        where: and(eq(schema.userExperienceRewards.userId, userId), eq(schema.userExperienceRewards.dateKey, getShanghaiDateKey())),
    })

    return records.reduce<TodayUserExperienceRewardMap>((result, record) => {
        const source = record.source as UserExperienceSource
        result[source] = record
        return result
    }, {})
}

/**
 * @description 校验“每日在线一小时”奖励是否满足领取条件。
 * 必须先领取当天的“每日打开软件”奖励，并且距离那次领取已满 1 小时。
 * @param userId 用户 ID。
 * @param todayRewards 可选的今日奖励缓存，避免重复查询。
 * @returns 是否满足在线奖励条件，以及未满足时的原因。
 */
export async function validateDailyOnlineExperienceEligibility(
    userId: string,
    todayRewards?: TodayUserExperienceRewardMap
): Promise<UserExperienceEligibility> {
    const rewards = todayRewards ?? (await getTodayUserExperienceRewards(userId))
    const launchReward = rewards[USER_EXPERIENCE_SOURCES.DAILY_LAUNCH]
    if (!launchReward) {
        return {
            ok: false,
            reason: "launch_not_claimed",
        }
    }

    const launchTimestamp = parseStoredDateTime(launchReward.createdAt)
    if (launchTimestamp === null) {
        return {
            ok: false,
            reason: "launch_not_claimed",
        }
    }

    const elapsedMs = Date.now() - launchTimestamp
    if (elapsedMs < USER_DAILY_ONLINE_EXPERIENCE_REQUIRED_MS) {
        return {
            ok: false,
            reason: "not_enough_online_time",
            waitMs: USER_DAILY_ONLINE_EXPERIENCE_REQUIRED_MS - elapsedMs,
        }
    }

    return { ok: true }
}

/**
 * @description 为用户发放指定来源的经验，并保证同一来源每天只能领取一次。
 * @param userId 用户 ID。
 * @param source 经验来源。
 * @returns 发放结果，包含是否重复领取与是否升级。
 * @throws Error 当用户不存在时抛出异常。
 */
export async function grantDailyUserExperience(userId: string, source: UserExperienceSource): Promise<UserExperienceGrantResult> {
    const awardedExp = USER_EXPERIENCE_REWARD_MAP[source]
    const awardedPoints = awardedExp
    const dateKey = getShanghaiDateKey()

    return await db.transaction(async tx => {
        const currentUser = await tx.query.users.findFirst({
            where: eq(schema.users.id, userId),
        })

        if (!currentUser) {
            throw new Error("user not found")
        }

        const rewardRecord = (
            await tx
                .insert(schema.userExperienceRewards)
                .values({
                    userId,
                    source,
                    dateKey,
                    awardedExp,
                })
                .onConflictDoNothing()
                .returning()
        )[0]

        if (!rewardRecord) {
            return {
                awardedExp: 0,
                awardedPoints: 0,
                user: currentUser,
                levelChanged: false,
                alreadyClaimed: true,
            }
        }

        const nextExperience = (currentUser.experience ?? 0) + awardedExp
        const nextPoints = (currentUser.points ?? 0) + awardedPoints
        const nextLevel = calculateUserLevel(nextExperience)
        const updatedUser = (
            await tx
                .update(schema.users)
                .set({
                    experience: nextExperience,
                    points: nextPoints,
                    level: nextLevel,
                })
                .where(eq(schema.users.id, userId))
                .returning()
        )[0]

        return {
            awardedExp,
            awardedPoints,
            user: updatedUser,
            levelChanged: nextLevel !== (currentUser.level ?? 1),
            alreadyClaimed: false,
        }
    })
}
