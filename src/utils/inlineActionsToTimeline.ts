import type { InlineActions } from "../composables/useCharSettings"
import type { RawTimelineData } from "../store/timeline"

/**
 * 将内联动作转换为标准时间线数据
 * @param inlineActions 内联动作数据
 * @param charName 角色名称，用于生成时间线名称
 * @returns 标准时间线数据数组
 */
export function inlineActionsToTimeline(inlineActions: InlineActions, charName: string): RawTimelineData {
    // 计算总时长
    const calculateTotalDuration = () => {
        let total = 0
        inlineActions.i.forEach(action => {
            const { d: duration, t: times = 1 } = action
            total += duration * times
        })
        return total
    }

    const totalDuration = calculateTotalDuration()

    // 收集所有使用的buff组索引
    const usedBuffGroups = new Set<number>()
    inlineActions.i.forEach(action => {
        if (action.b !== undefined && action.b !== "-") {
            usedBuffGroups.add(action.b)
        }
    })

    // 收集所有动作的buff组信息，为每个动作创建对应的轨道
    const actionTracks: Array<{
        action: (typeof inlineActions.i)[0]
        buffGroupIndex: number | undefined
    }> = inlineActions.i.map(action => ({
        action,
        buffGroupIndex: action.b !== undefined && action.b !== "-" ? action.b : undefined,
    }))

    // 计算需要的轨道数量：每个动作对应一个技能轨道和一个buff轨道
    // 然后加上背景轨道
    const requiredSkillTracks = actionTracks.length
    const requiredBuffTracks = actionTracks.length
    const backgroundTrackIndex = requiredSkillTracks + requiredBuffTracks

    // 生成轨道名称
    const tracks: string[] = []
    for (let i = 0; i < requiredSkillTracks; i++) {
        tracks.push(`技能轨道${i + 1}`)
        tracks.push(`buff轨道${i + 1}`)
    }
    tracks.push("背景轨道")

    // 主轨道：包含时序动作、背景动作和血量曲线
    const result: RawTimelineData = {
        name: `${charName}_inline`,
        tracks,
        items: [],
        hp: inlineActions.hp, // 直接添加血量曲线数据
    }

    // 处理时序动作和对应的buff轨道
    let currentTime = 0

    actionTracks.forEach((trackItem, trackIndex) => {
        const { action } = trackItem
        const { s: skill, d: duration, t: times = 1 } = action
        const buffGroupIndex = trackItem.buffGroupIndex

        // 技能轨道索引：2 * trackIndex
        const skillTrackIndex = 2 * trackIndex
        // buff轨道索引：2 * trackIndex + 1
        const buffTrackIndex = 2 * trackIndex + 1

        // 重复次数处理
        for (let repeat = 0; repeat < times; repeat++) {
            // 添加动作到对应技能轨道
            result.items.push({
                i: skillTrackIndex, // 技能轨道索引
                n: skill, // 技能名称/表达式
                t: currentTime, // 开始时间
                d: duration, // 持续时间
                l: trackIndex, // 原始动作索引
            })

            // 如果该动作使用了buff组，添加对应的buff轨道项目
            if (buffGroupIndex !== undefined && buffGroupIndex >= 0 && buffGroupIndex < inlineActions.bgs.length) {
                const buffGroup = inlineActions.bgs[buffGroupIndex]
                // 为每个buff创建一个轨道项目
                buffGroup.forEach(([buffName, buffLv]) => {
                    result.items.push({
                        i: buffTrackIndex, // buff轨道索引，位于对应技能轨道下方
                        n: `${buffName}×${buffLv}`, // buff名称和等级
                        t: currentTime, // 开始时间与技能相同
                        d: duration, // 持续时间与技能相同
                        l: buffGroupIndex, // buff组索引
                    })
                })
            }

            // 更新当前时间
            currentTime += duration
        }
    })

    // 处理背景动作
    inlineActions.b.forEach((action, actionIndex) => {
        const { s: skill, i: interval, t: times = 1, d: delay = 0 } = action

        let backgroundTime = 0

        // 填满整个轨道
        while (backgroundTime < totalDuration) {
            // 添加延迟
            backgroundTime += delay

            // 重复times次动作
            for (let repeat = 0; repeat < times && backgroundTime < totalDuration; repeat++) {
                // 添加背景动作到背景轨道
                result.items.push({
                    i: backgroundTrackIndex, // 背景轨道索引
                    n: skill, // 技能名称/表达式
                    t: backgroundTime, // 开始时间
                    d: interval, // 持续时间与间隔相等
                    l: actionIndex, // 原始动作索引
                })

                // 更新背景时间
                backgroundTime += interval
            }
        }
    })

    return result
}
