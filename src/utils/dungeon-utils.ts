import { t } from "i18next"
import { type AbyssDungeon, abyssDungeonMap, type Dungeon, monsterMap } from "../data"
import { getRewardDetails } from "./reward-utils"

// 获取副本类型信息
export function getDungeonType(type: string): { t: string; label: string; color: string } {
    const typeMap: Record<string, { t: string; label: string; color: string }> = {
        Capture: { t: "Capture", label: "追缉", color: "bg-red-500" },
        Defence: { t: "Defence", label: "扼守", color: "bg-blue-500" },
        DefenceMove: { t: "DefenceMove", label: "扼守M", color: "bg-blue-500" },
        DefencePro: { t: "DefencePro", label: "扼守+", color: "bg-blue-500" },
        Excavation: { t: "Excavation", label: "勘察", color: "bg-green-500" },
        ExtermPro: { t: "ExtermPro", label: "驱离", color: "bg-orange-600" },
        Exterminate: { t: "Exterminate", label: "驱逐", color: "bg-red-600" },
        Hijack: { t: "Hijack", label: "迁移", color: "bg-pink-500" },
        Rescue: { t: "Rescue", label: "护送", color: "bg-cyan-500" },
        Sabotage: { t: "Sabotage", label: "调停", color: "bg-teal-500" },
        SabotagePro: { t: "SabotagePro", label: "拆解", color: "bg-emerald-600" },
        SoloRaid: { t: "SoloRaid", label: "单人", color: "bg-indigo-500" },
        Survival: { t: "Survival", label: "探险", color: "bg-lime-500" },
        SurvivalMini: { t: "SurvivalMini", label: "探险M", color: "bg-lime-500" },
        SurvivalMiniPro: { t: "SurvivalMiniPro", label: "探险M+", color: "bg-lime-500" },
        SurvivalPro: { t: "SurvivalPro", label: "探险+", color: "bg-lime-500" },
        Synthesis: { t: "Synthesis", label: "竞逐", color: "bg-violet-500" },
    }
    return typeMap[type] || { t: type, label: type, color: "bg-gray-500" }
}

export function getAbyssDungeonGroup(dungeon: AbyssDungeon) {
    const typeMap: Record<string, string> = {
        奖励进度·经典剧目: "经典剧目",
        奖励进度·热映剧目: "热映剧目",
        奖励进度·不朽剧目: "不朽剧目",
    }
    return typeMap[dungeon.art || ""] || "经典剧目"
}

export function getAbyssDungeonLevel(dungeon: AbyssDungeon) {
    const isTwoSide = abyssDungeonMap.has(dungeon.id - (dungeon.id % 10) + 2)
    const isRight = dungeon.id % 10 === 2
    return ~~((dungeon.id / 10) % 10) + (isTwoSide ? (isRight ? " 右" : " 左") : "")
}

export function getAbyssDungeonName(dungeon: AbyssDungeon) {
    return `${getAbyssDungeonGroup(dungeon)} ${getAbyssDungeonLevel(dungeon)}`
}

const mhList = [
    {
        DungeonId: [60102, 60202, 60302, 60402, 60502, 60602, 60702, 60802, 60902, 61002, 61102],
        WalnutType: 1,
    },
    {
        DungeonId: [62102, 62202, 62302, 62402, 62502, 62602, 62702, 62802, 62902, 63002, 63102],
        WalnutType: 2,
    },
    {
        DungeonId: [64102, 64202, 64302, 64402, 64502, 64602, 64702, 64802, 64902, 65002, 65102],
        WalnutType: 3,
    },
].reduce(
    (acc, cur) => {
        acc[cur.WalnutType] = new Set(cur.DungeonId)
        return acc
    },
    {} as Record<number, Set<number>>
)

export function getDungeonName(dungeon: Dungeon) {
    const yehang = ["DefenceMove", "ExtermPro"]
    if (yehang.includes(dungeon.t) && dungeon.sr && dungeon.sm) {
        if (dungeon.sm.length > 1) {
            return `${t(dungeon.n)}(${t(monsterMap.get(dungeon.sm[0]!)!.n)} ${t("夜航手册")} 多号令)`
        }
        return `${t(dungeon.n)}(${t(monsterMap.get(dungeon.sm[0])!.n)} ${t("夜航手册")})`
    }
    const walnutType = [1, 2, 3].find(walnutType => mhList[walnutType].has(dungeon.id))
    if (walnutType) {
        return `${t(dungeon.n)}(${t(["角色", "武器", "魔之楔"][walnutType - 1])}${t("委托密函")})`
    }
    return dungeon.n
}

/**
 * 获取副本的实际奖励名称列表
 * 优先显示特殊奖励第一个，然后是普通奖励前两个
 * 如果没有特殊奖励则普通奖励前三个
 */
export function getDungeonRewardNames(dungeon: Dungeon) {
    // 收集所有奖励名称的函数
    function getRewardNamesFromIds(rewardIds: number[]) {
        const rewardNames: string[] = []

        /**
         * 递归遍历所有奖励层级，收集奖励名称
         */
        function collectRewards(rewardItem: any) {
            if (!rewardItem) {
                return
            }

            // 如果当前奖励项有名称，添加到列表
            if (rewardItem.n) {
                rewardNames.push(rewardItem.n)
            }

            // 如果当前奖励项有子奖励，递归遍历
            if (rewardItem.child && rewardItem.child.length > 0) {
                for (const child of rewardItem.child) {
                    collectRewards(child)
                }
            }
        }

        // 遍历所有奖励组ID
        for (const rewardId of rewardIds) {
            const rewardDetails = getRewardDetails(rewardId)
            if (rewardDetails) {
                collectRewards(rewardDetails)
            }
        }

        return rewardNames
    }

    // 获取特殊奖励名称（来自sr字段）
    const specialRewardNames = dungeon.sr ? getRewardNamesFromIds(dungeon.sr) : []

    // 获取普通奖励名称（来自r字段）
    const normalRewardNames = dungeon.r ? getRewardNamesFromIds(dungeon.r) : []

    // 按照规则组合奖励名称
    const result: string[] = []

    // 添加第一个特殊奖励（如果有）
    if (specialRewardNames.length > 0) {
        result.push(specialRewardNames[0])
    }

    // 添加普通奖励
    const neededNormals = specialRewardNames.length > 0 ? 2 : 3
    for (let i = 0; i < neededNormals && i < normalRewardNames.length; i++) {
        result.push(normalRewardNames[i])
    }

    // 限制最多显示3个奖励，超过则显示"等"
    const displayRewards = result.slice(0, 3)
    let displayText = displayRewards.join("、")

    // 检查是否有更多奖励
    const totalRewards = result.length
    const hasMore =
        totalRewards > 3 ||
        (specialRewardNames.length > 1 && displayRewards.length >= 1) ||
        (normalRewardNames.length > neededNormals && displayRewards.length >= 1)

    if (hasMore) {
        displayText += "等"
    }

    return displayText
}
