const USER_LEVEL_EXPERIENCE_REQUIREMENTS = [20, 50, 100, 200, 300, 500, 1000, 1500] as const
const USER_LEVEL_EXPERIENCE_INCREMENT = 500

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
 * @description 计算当前等级的起始经验值。
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
 * @description 计算下一级所需的累计经验值。
 * @param level 当前等级。
 * @returns 下一等级门槛累计经验。
 */
export function getNextLevelExperience(level: number): number {
    return getLevelStartExperience(level) + getLevelRequiredExperience(level)
}

/**
 * @description 根据累计经验计算当前等级进度。
 * @param experience 累计经验。
 * @param level 当前等级。
 * @returns 当前等级内经验、升级所需经验与进度百分比。
 */
export function getUserLevelProgress(experience: number, level: number) {
    const safeExperience = Math.max(0, experience)
    const safeLevel = Math.max(1, level)
    const levelStartExperience = getLevelStartExperience(safeLevel)
    const nextLevelExperience = getNextLevelExperience(safeLevel)
    const currentLevelExp = safeExperience - levelStartExperience
    const requiredExp = Math.max(1, nextLevelExperience - levelStartExperience)
    const progressPercent = Math.min(100, Math.max(0, (currentLevelExp / requiredExp) * 100))

    return {
        currentLevelExp,
        requiredExp,
        progressPercent,
        nextLevelExperience,
    }
}
