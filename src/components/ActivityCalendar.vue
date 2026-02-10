<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, nextTick, onMounted, ref } from "vue"
import { activitiesQuery } from "../api/gen/api-queries"
import type { AbyssDungeon } from "../data"
import { charMap } from "../data"
import { abyssDungeons } from "../data/d/abyss.data"
import { useSettingStore } from "../store/setting"
import { useUIStore } from "../store/ui"

const { t, i18next } = useTranslation()
const settingStore = useSettingStore()
const uiStore = useUIStore()

/**
 * 活动信息接口
 */
interface Activity {
    title: string
    description: string
    begin_at: number
    end_at: number
    isMoling?: boolean
    isNextMoling?: boolean
    isTheater?: boolean
    category?: string
    originalIndex?: number // 用于追踪原始索引
}

const loading = ref(true)
const activities = ref<Activity[]>([])
const error = ref<string | null>(null)
const currentTimestamp = ref(Date.now() / 1000)
const timelineRef = ref<HTMLElement | null>(null)
const currentLineRef = ref<HTMLElement | null>(null)

/**
 * 获取沉浸式戏剧的开始和结束时间（秒）
 * 使用深渊地牢数据中的实际开始和结束时间
 */
const getTheaterTimes = () => {
    const now = Date.now() / 1000

    // 从深渊地牢数据中筛选出有时间信息的记录
    const timedDungeons = abyssDungeons.filter(dungeon => dungeon.st && dungeon.et).sort((a, b) => (a.st || 0) - (b.st || 0))

    // 找到当前正在进行或最近的活动
    let currentDungeon: AbyssDungeon | undefined
    let nextDungeon: AbyssDungeon | undefined

    for (const dungeon of timedDungeons) {
        if (dungeon.st && dungeon.et) {
            if (now >= dungeon.st && now <= dungeon.et) {
                currentDungeon = dungeon
            } else if (now < dungeon.st && !nextDungeon) {
                nextDungeon = dungeon
            }
        }
    }

    // 如果没有当前活动，使用最近的一个
    if (!currentDungeon && timedDungeons.length > 0) {
        currentDungeon = timedDungeons[timedDungeons.length - 1]
    }

    // 如果没有下一个活动，使用第一个活动
    if (!nextDungeon && timedDungeons.length > 0) {
        nextDungeon = timedDungeons[0]
    }

    // 获取当前活动的角色名称
    const currentCharName = currentDungeon?.cid ? charMap.get(currentDungeon.cid)?.名称 || "" : ""
    // 获取下一个活动的角色名称
    const nextCharName = nextDungeon?.cid ? charMap.get(nextDungeon.cid)?.名称 || "" : ""

    // 生成当前活动信息
    const current = {
        title: t("activity-calendar.theater_title", "沉浸式戏剧"),
        description: t("activity-calendar.theater_desc", {
            charName: t(currentCharName),
        }),
        begin_at: currentDungeon?.st || Math.floor(now),
        end_at: currentDungeon?.et || Math.floor(now + 7 * 24 * 60 * 60),
        isTheater: true,
        category: "theater",
    }

    // 生成下一个活动信息
    const next = {
        title: t("activity-calendar.theater_title", "沉浸式戏剧"),
        description: t("activity-calendar.theater_desc", { charName: nextCharName }),
        begin_at: nextDungeon?.st || Math.floor(now + 7 * 24 * 60 * 60),
        end_at: nextDungeon?.et || Math.floor(now + 14 * 24 * 60 * 60),
        isTheater: true,
        category: "theater",
    }

    return {
        current,
        next,
    }
}

/**
 * 获取魔灵刷新的开始和结束时间（秒）
 * 魔灵刷新：每3天刷新一次，偏移1天（第2、5、8天...凌晨5点）
 */
const getMolingRefreshTimes = () => {
    const now = Date.now()
    const oneDay = 24 * 60 * 60 * 1000
    const oneHour = 60 * 60 * 1000

    // 计算偏移：1天 + 3小时（偏移1天从次日5点开始）
    const offset = 1 * oneDay + 3 * oneHour

    // 计算当前周期的开始时间（上一个刷新点）
    const currentCycleStart = Math.floor((now + offset) / (3 * oneDay)) * (3 * oneDay) - offset

    // 计算下一个刷新时间（当前周期结束时间）
    const nextRefresh = Math.ceil((now + offset) / (3 * oneDay)) * (3 * oneDay) - offset

    return {
        current: {
            begin_at: currentCycleStart / 1000, // 转换为秒
            end_at: nextRefresh / 1000, // 转换为秒
        },
        next: {
            begin_at: nextRefresh / 1000, // 下一个周期开始
            end_at: nextRefresh / 1000 + (3 * oneDay) / 1000, // 下一个周期结束
        },
    }
}

/**
 * 标记当前周期的魔灵已完成
 */
const markMolingCompleted = () => {
    const times = getMolingRefreshTimes()
    settingStore.lastCapInterval = Math.floor(times.current.begin_at)
}

/**
 * 检查当前周期的魔灵是否已完成
 */
const isMolingCompleted = computed(() => {
    const times = getMolingRefreshTimes()
    return settingStore.lastCapInterval === Math.floor(times.current.begin_at)
})

/**
 * 格式化完整日期时间（国际化）
 * @param timestamp 时间戳（秒）
 * @returns 格式化后的完整日期时间字符串
 */
const formatFullDateTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000)
    const locale = i18next.language || "zh-CN"

    return date.toLocaleString(locale, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    })
}

/**
 * 获取活动的倒计时/已过期字符串
 */
const getTimeDistance = (endAt: number) => {
    const endMs = endAt * 1000
    const nowMs = uiStore.timeNow

    if (nowMs >= endMs) {
        return uiStore.timeDistancePassed(endMs) + t("activity-calendar.ended_suffix", "结束")
    } else {
        return uiStore.timeDistanceFuture(endMs) + t("activity-calendar.end_suffix", "结束")
    }
}

// 活动块的 ref 映射
const activityRefs = ref<Map<number, HTMLElement>>(new Map())
// 需要显示粘性内容的索引集合
const stickyActivities = ref<Set<number>>(new Set())

// API缓存键
const CACHE_KEY = "activity-calendar-data"
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 1day

// 每天的像素宽度
const DAY_WIDTH = 120

/**
 * 格式化日期
 * @param timestamp 时间戳（秒）
 * @returns 格式化后的日期字符串
 */
const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
    })
}

/**
 * 判断活动状态
 */
const getActivityStatus = (activity: Activity) => {
    const now = currentTimestamp.value
    if (now < activity.begin_at) return "upcoming"
    if (now > activity.end_at) return "ended"
    return "ongoing"
}

/**
 * 加载活动数据（带localStorage缓存）
 */
const loadActivities = async () => {
    try {
        loading.value = true
        error.value = null

        // 检查localStorage缓存
        const cachedData = localStorage.getItem(CACHE_KEY)
        if (cachedData) {
            try {
                const { data, timestamp } = JSON.parse(cachedData)
                const now = Date.now()
                if (now - timestamp < CACHE_DURATION) {
                    console.log("Using cached activities data from localStorage")
                    activities.value = data
                    return
                }
            } catch (e) {
                console.error("Failed to parse cache:", e)
            }
        }

        // 使用当前登录账号的服务端标识，未登录时默认国服
        // const currentUser = await settingStore.getCurrentUser()
        // const server = currentUser?.server || "cn"
        // 从自建服务端拉取活动数据，并只获取当前时间之后仍可能展示的活动
        const rawData = await activitiesQuery(
            {
                server: "cn",
                startTime: Date.now(),
            },
            { requestPolicy: "network-only" }
        )
        // 转换为组件内部活动结构，保持后续渲染逻辑不变
        const data = rawData?.map(activity => ({
            title: activity.name,
            description: activity.desc,
            begin_at: ~~(activity.startTime / 1000),
            end_at: ~~(activity.endTime / 1000),
        }))
        if (data) {
            // 过滤掉API返回的沉浸式戏剧活动（改为自己计算）
            const filteredData = data.filter(activity => !activity.title.includes("委托密函轮换") && !activity.title.includes("兑换码"))

            // 保存到localStorage
            const cacheData = {
                data: filteredData,
                timestamp: Date.now(),
            }
            localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData))
            activities.value = filteredData
        }
    } catch (err) {
        console.error("Failed to load activities:", err)
        error.value = t("activity-calendar.load_error")
    } finally {
        loading.value = false
    }
}

/**
 * 按开始时间排序活动，已过期的活动放到底部，同一类别的活动放在同一行
 */
const sortedActivities = computed(() => {
    // 获取魔灵刷新时间
    const molingTimes = getMolingRefreshTimes()

    // 获取沉浸式戏剧时间
    const theaterTimes = getTheaterTimes()

    // 添加当前周期的魔灵刷新活动
    const currentMolingActivity: Activity = {
        title: t("activity-calendar.moling_refresh", "魔灵刷新"),
        description: isMolingCompleted.value
            ? t("activity-calendar.moling_completed", "本周期魔灵已完成")
            : t("activity-calendar.moling_desc", "每3天刷新一次"),
        begin_at: molingTimes.current.begin_at,
        end_at: molingTimes.current.end_at,
        isMoling: true,
        category: "moling",
    }

    // 添加下一个周期的魔灵刷新活动
    const nextMolingActivity: Activity = {
        title: t("activity-calendar.moling_refresh_next", "下一周期魔灵刷新"),
        description: t("activity-calendar.moling_desc", "每3天刷新一次"),
        begin_at: molingTimes.next.begin_at,
        end_at: molingTimes.next.end_at,
        isMoling: false,
        isNextMoling: true,
        category: "moling",
    }

    // 添加当前半期的沉浸式戏剧活动
    const currentTheaterActivity: Activity = theaterTimes.current

    // 添加下一个半期的沉浸式戏剧活动
    const nextTheaterActivity: Activity = theaterTimes.next

    // 定义优先级：魔灵=0, 戏剧=1, 其他=2
    const getPriority = (activity: Activity) => {
        if (activity.isMoling || activity.isNextMoling) return 0
        if (activity.isTheater) return 1
        return 2
    }

    return [...activities.value, currentMolingActivity, nextMolingActivity, currentTheaterActivity, nextTheaterActivity].sort((a, b) => {
        const now = currentTimestamp.value
        const aPriority = getPriority(a)
        const bPriority = getPriority(b)

        // 先按优先级排序（魔灵 -> 戏剧 -> 其他）
        if (aPriority !== bPriority) return aPriority - bPriority

        // 同一优先级内，如果一个是已过期，一个是未过期，未过期的在前面
        const aEnded = a.end_at < now
        const bEnded = b.end_at < now
        if (aEnded && !bEnded) return 1
        if (!aEnded && bEnded) return -1

        // 如果都已过期或都未过期，按开始时间升序
        return a.begin_at - b.begin_at
    })
})

/**
 * 按类别分组活动，并为每个活动分配独立的垂直位置
 */
const groupedActivities = computed(() => {
    const result: Array<{ category: string; activity: Activity; groupIndex: number }> = []
    // 创建类别到分组索引的映射，确保同一类别的活动在同一行
    const categoryToGroupIndex = new Map<string, number>()
    let currentGroupIndex = 0

    sortedActivities.value.forEach((activity, originalIndex) => {
        const category = activity.category || `activity_${originalIndex}`

        // 如果该类别还没有分配过分组索引，则分配一个新的
        if (!categoryToGroupIndex.has(category)) {
            categoryToGroupIndex.set(category, currentGroupIndex)
            currentGroupIndex++
        }

        // 使用类别对应的分组索引，确保同一类别的活动在同一行
        result.push({
            category,
            activity: { ...activity, originalIndex },
            groupIndex: categoryToGroupIndex.get(category)!,
        })
    })

    return result
})

/**
 * 获取所有活动的时间范围
 */
const timeRange = computed(() => {
    if (sortedActivities.value.length === 0) return { start: 0, end: 0 }
    const allTimes = sortedActivities.value.flatMap(a => [a.begin_at, a.end_at])
    return {
        start: Math.min(...allTimes),
        end: Math.max(...allTimes),
    }
})
/**
 * 计算总天数
 */
const totalDays = computed(() => {
    const { start, end } = timeRange.value
    const startSeconds = Math.floor(start / 86400) * 86400 // 向下取整到天
    const endSeconds = Math.ceil(end / 86400) * 86400 // 向上取整到天
    return (endSeconds - startSeconds) / 86400 + 2 // 多加2天缓冲
})

/**
 * 计算时间轴总宽度
 */
const timelineWidth = computed(() => {
    return totalDays.value * DAY_WIDTH
})

/**
 * 计算时间戳对应的像素位置
 */
const getTimestampPosition = (timestamp: number) => {
    const { start } = timeRange.value
    const startSeconds = Math.floor(start / 86400) * 86400
    const secondsDiff = timestamp - startSeconds
    const daysDiff = secondsDiff / 86400
    return daysDiff * DAY_WIDTH
}

/**
 * 计算活动块的样式（位置和宽度）
 */
const getActivityStyle = (activity: Activity) => {
    const left = getTimestampPosition(activity.begin_at)
    const right = getTimestampPosition(activity.end_at)
    const width = right - left
    return {
        left: `${left}px`,
        width: `${Math.max(width, 20)}px`, // 最小20px宽度
    }
}

/**
 * 生成日期刻度
 */
const dateTicks = computed(() => {
    const { start, end } = timeRange.value
    const startSeconds = Math.floor(start / 86400) * 86400
    const endSeconds = Math.ceil(end / 86400) * 86400
    const days = Math.ceil((endSeconds - startSeconds) / 86400) + 1
    const ticks = []
    for (let i = 0; i < days; i++) {
        const dayStart = startSeconds + i * 86400
        ticks.push({
            timestamp: dayStart,
            dateStr: formatDate(dayStart),
            position: getTimestampPosition(dayStart),
        })
    }
    return ticks
})

/**
 * 自动滚动到当前时间
 */
const scrollToCurrentTime = () => {
    if (!timelineRef.value) return
    const currentPos = getTimestampPosition(currentTimestamp.value)
    const containerWidth = timelineRef.value.clientWidth
    timelineRef.value.scrollLeft = currentPos - containerWidth / 2
}

/**
 * 更新当前时间线位置
 */
const updateCurrentLinePosition = () => {
    if (!currentLineRef.value) return
    const currentPos = getTimestampPosition(currentTimestamp.value)
    currentLineRef.value.style.left = `${currentPos}px`
}

/**
 * 切换手动拖动模式
 */
const isDragging = ref(false)
const startX = ref(0)
const scrollLeft = ref(0)

const startDrag = (e: MouseEvent) => {
    if (!timelineRef.value) return
    isDragging.value = true
    startX.value = e.clientX
    scrollLeft.value = timelineRef.value.scrollLeft
    document.addEventListener("mousemove", onDrag)
    document.addEventListener("mouseup", stopDrag)
}

const onDrag = (e: MouseEvent) => {
    if (!isDragging.value || !timelineRef.value) return
    const dx = e.clientX - startX.value
    timelineRef.value.scrollLeft = scrollLeft.value - dx
    updateStickyActivities()
}

const stopDrag = () => {
    isDragging.value = false
    document.removeEventListener("mousemove", onDrag)
    document.removeEventListener("mouseup", stopDrag)
}

/**
 * 检查活动是否在视口中可见（任何部分可见）
 */
const isActivityInViewport = (index: number) => {
    const activityEl = activityRefs.value.get(index)
    if (!activityEl || !timelineRef.value) return false

    const rect = activityEl.getBoundingClientRect()
    const containerRect = timelineRef.value.getBoundingClientRect()

    // 检查活动块的任何部分是否在容器内可见
    return rect.right > containerRect.left && rect.left < containerRect.right
}

/**
 * 检查活动开始时间是否超出屏幕左侧
 */
const isActivityStartOffscreen = (index: number) => {
    const activityEl = activityRefs.value.get(index)
    if (!activityEl || !timelineRef.value) return false

    const rect = activityEl.getBoundingClientRect()
    const containerRect = timelineRef.value.getBoundingClientRect()

    // 活动块的左侧是否超出了容器的左侧（考虑容器的padding）
    return rect.left < containerRect.left
}

/**
 * 更新粘性活动列表
 */
const updateStickyActivities = () => {
    if (!timelineRef.value) return

    const newSticky = new Set<number>()

    sortedActivities.value.forEach((_activity, index) => {
        const inViewport = isActivityInViewport(index)
        const startOffscreen = isActivityStartOffscreen(index)

        // 如果活动在视口中可见且开始时间超出屏幕左侧，则显示粘性内容
        if (inViewport && startOffscreen) {
            newSticky.add(index)
        }
    })

    stickyActivities.value = newSticky
}

/**
 * 获取粘性内容的样式
 * @param groupIndex 分组索引（同一类别使用相同索引）
 * @param originalIndex 活动在 sortedActivities 中的原始索引
 */
const getStickyContentStyle = (groupIndex: number, originalIndex: number) => {
    const activity = sortedActivities.value[originalIndex]
    const top = groupIndex * 120 + 40

    // 计算容器左侧和右侧对应的时间
    const containerLeft = timelineRef.value?.scrollLeft || 0
    const containerWidth = timelineRef.value?.clientWidth || 600
    const containerRight = containerLeft + containerWidth

    // 容器左侧对应的绝对位置
    const leftPosition = containerLeft
    // 活动结束时间对应的绝对位置
    const activityEndPosition = getTimestampPosition(activity.end_at)

    // 粘性块的宽度：从容器左侧到活动结束位置（取较小值）
    const maxPosition = Math.min(containerRight, activityEndPosition)
    const visibleWidth = Math.max(20, maxPosition - leftPosition)

    return {
        top: `${top}px`,
        height: "120px",
        left: "0",
        width: `${visibleWidth}px`,
    }
}

onMounted(() => {
    loadActivities().then(() => {
        // 数据加载完成后滚动到当前时间
        nextTick(() => {
            scrollToCurrentTime()
            updateStickyActivities()
        })
    })
    // 每秒更新当前时间
    setInterval(() => {
        currentTimestamp.value = Date.now() / 1000
        updateCurrentLinePosition()
    }, 1000)

    // 监听滚动事件更新粘性活动
    if (timelineRef.value) {
        timelineRef.value.addEventListener("scroll", updateStickyActivities)
    }
})
</script>

<template>
    <div class="w-full max-w-6xl mx-auto p-2 sm:p-4">
        <div class="card bg-base-100 shadow-md">
            <div class="card-body p-3 sm:p-4">
                <h2 class="card-title text-lg sm:text-xl mb-6 text-primary flex items-center gap-3">
                    <Icon icon="ri:calendar-event-line" class="w-6 h-6" />
                    {{ $t("activity-calendar.title") }}
                </h2>

                <!-- 加载状态 -->
                <div v-if="loading" class="flex items-center justify-center py-12">
                    <span class="loading loading-spinner loading-lg"></span>
                </div>

                <!-- 错误状态 -->
                <div v-else-if="error" class="alert alert-warning">
                    <Icon icon="ri:error-warning-line" class="w-6 h-6" />
                    <span class="ml-2">{{ error }}</span>
                </div>

                <!-- 空状态 -->
                <div v-else-if="activities.length === 0 && groupedActivities.length === 0" class="text-center py-12 text-gray-500">
                    <Icon icon="ri:inbox-line" class="w-16 h-16 mb-3 opacity-50" />
                    <p class="text-lg">{{ $t("activity-calendar.no_activities") }}</p>
                </div>

                <!-- 活动时间轴 -->
                <div v-else class="relative">
                    <!-- 拖动提示 -->
                    <div class="text-xs text-gray-400 mb-2 flex items-center gap-1">
                        <Icon icon="ri:drag-move-line" class="w-4 h-4" />
                        {{ t("activity-calendar.drag_hint", "可左右拖动查看") }}
                    </div>

                    <!-- 时间轴容器（非滚动容器） -->
                    <div
                        class="relative"
                        :style="{ height: `${Math.max(...groupedActivities.map(item => item.groupIndex)) * 120 + 160}px` }"
                    >
                        <!-- 粘性内容层（相对于非滚动容器定位） -->
                        <div class="absolute inset-0 pointer-events-none z-10">
                            <div
                                v-for="item in groupedActivities"
                                v-show="stickyActivities.has(item.activity.originalIndex!)"
                                :key="`sticky-${item.activity.originalIndex}`"
                                class="absolute bg-base-100 rounded-lg shadow-md border-l-4 truncate"
                                :class="{
                                    'border-primary': getActivityStatus(item.activity) === 'ongoing',
                                    'border-gray-300': getActivityStatus(item.activity) === 'ended',
                                    'border-dashed border-gray-300': getActivityStatus(item.activity) === 'upcoming',
                                    'opacity-60': getActivityStatus(item.activity) === 'ended',
                                }"
                                :style="getStickyContentStyle(item.groupIndex, item.activity.originalIndex!)"
                            >
                                <!-- 粘性内容 -->
                                <div class="p-3 sm:p-4 h-full flex flex-col justify-between">
                                    <div>
                                        <!-- 状态标签 -->
                                        <div class="flex items-center gap-2 mb-2">
                                            <span
                                                class="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
                                                :class="{
                                                    'bg-primary text-primary-content': getActivityStatus(item.activity) === 'ongoing',
                                                    'bg-gray-400 text-white': getActivityStatus(item.activity) === 'ended',
                                                    'bg-gray-200 text-gray-600': getActivityStatus(item.activity) === 'upcoming',
                                                    'bg-green-500 text-white': item.activity.isMoling && isMolingCompleted,
                                                }"
                                            >
                                                {{
                                                    item.activity.isMoling && isMolingCompleted
                                                        ? $t("activity-calendar.moling_completed", "本周期魔灵已完成")
                                                        : getActivityStatus(item.activity) === "upcoming"
                                                          ? $t("activity-calendar.status_upcoming")
                                                          : getActivityStatus(item.activity) === "ongoing"
                                                            ? $t("activity-calendar.status_ongoing")
                                                            : $t("activity-calendar.status_ended")
                                                }}
                                            </span>
                                            <!-- 进行中时显示倒计时 -->
                                            <div
                                                v-if="getActivityStatus(item.activity) === 'ongoing'"
                                                class="text-xs text-primary font-medium"
                                            >
                                                {{ getTimeDistance(item.activity.end_at) }}
                                            </div>
                                        </div>
                                        <!-- 活动标题 -->
                                        <h3 class="font-bold text-sm sm:text-base mb-1 text-base-content line-clamp-1">
                                            {{ item.activity.title }}
                                        </h3>
                                    </div>

                                    <!-- 活动描述 -->
                                    <p v-if="item.activity.description" class="text-xs text-gray-600 line-clamp-2">
                                        {{ item.activity.description }}
                                    </p>

                                    <!-- 时间信息 -->
                                    <div class="flex gap-2 text-xs text-gray-500">
                                        <div class="flex items-center gap-1">
                                            <Icon icon="ri:play-circle-line" class="w-3.5 h-3.5 shrink-0" />
                                            <span class="whitespace-nowrap">{{ formatFullDateTime(item.activity.begin_at) }}</span>
                                        </div>
                                        <div class="flex items-center gap-1">
                                            <Icon icon="ri:stop-circle-line" class="w-3.5 h-3.5 shrink-0" />
                                            <span class="whitespace-nowrap">{{ formatFullDateTime(item.activity.end_at) }}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 时间轴滚动容器 -->
                    <div
                        ref="timelineRef"
                        class="absolute inset-0 top-6 overflow-x-auto overflow-y-hidden border-l border-r border-b border-base-300 bg-base-200/50"
                        @mousedown="startDrag"
                    >
                        <!-- 时间轴背景内容 -->
                        <div class="absolute inset-0" :style="{ width: `${timelineWidth}px` }">
                            <!-- 日期刻度 -->
                            <div class="absolute top-0 bottom-0">
                                <div
                                    v-for="tick in dateTicks"
                                    :key="tick.timestamp"
                                    class="absolute top-0 bottom-0 w-px border-l border-dashed border-base-300/50"
                                    :style="{ left: `${tick.position}px` }"
                                >
                                    <div class="absolute top-1 left-2 text-xs text-gray-400 font-medium">
                                        {{ tick.dateStr }}
                                    </div>
                                </div>
                            </div>

                            <!-- 当前时间竖线 -->
                            <div
                                ref="currentLineRef"
                                class="absolute top-0 bottom-0 w-1 bg-linear-to-b from-blue-500 via-blue-400 to-blue-300 z-20 pointer-events-none"
                                :style="{ left: `${getTimestampPosition(currentTimestamp)}px` }"
                            >
                                <div
                                    class="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-blue-500 rounded-full shadow-lg"
                                >
                                    <div class="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-75"></div>
                                </div>
                            </div>

                            <!-- 活动块（每个活动独立一行） -->
                            <div
                                v-for="item in groupedActivities"
                                :key="`${item.category}-${item.activity.originalIndex}`"
                                :ref="(el: any) => el && activityRefs.set(item.activity.originalIndex!, el as HTMLElement)"
                                class="absolute bg-base-100 rounded-lg shadow-md hover:shadow-lg transition-all border-l-4 cursor-pointer group"
                                :class="{
                                    'border-primary': getActivityStatus(item.activity) === 'ongoing',
                                    'border-gray-300': getActivityStatus(item.activity) === 'ended',
                                    'border-dashed border-gray-300': getActivityStatus(item.activity) === 'upcoming',
                                    'opacity-60': getActivityStatus(item.activity) === 'ended',
                                }"
                                :style="{
                                    ...getActivityStyle(item.activity),
                                    top: `${item.groupIndex * 120 + 40}px`,
                                    height: '120px',
                                }"
                                @click="item.activity.isMoling && !isMolingCompleted && markMolingCompleted()"
                            >
                                <!-- 活动内容 - 如果需要粘性显示则使用粘性层的内容，否则显示正常内容 -->
                                <div
                                    v-if="!stickyActivities.has(item.activity.originalIndex!)"
                                    class="p-3 sm:p-4 h-full flex flex-col justify-between"
                                >
                                    <div>
                                        <!-- 状态标签 -->
                                        <div class="flex items-center gap-2 mb-2">
                                            <span
                                                class="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
                                                :class="{
                                                    'bg-primary text-primary-content': getActivityStatus(item.activity) === 'ongoing',
                                                    'bg-gray-400 text-white': getActivityStatus(item.activity) === 'ended',
                                                    'bg-gray-200 text-gray-600': getActivityStatus(item.activity) === 'upcoming',
                                                    'bg-green-500 text-white': item.activity.isMoling && isMolingCompleted,
                                                }"
                                            >
                                                {{
                                                    item.activity.isMoling && isMolingCompleted
                                                        ? $t("activity-calendar.moling_completed", "本周期魔灵已完成")
                                                        : getActivityStatus(item.activity) === "upcoming"
                                                          ? $t("activity-calendar.status_upcoming")
                                                          : getActivityStatus(item.activity) === "ongoing"
                                                            ? $t("activity-calendar.status_ongoing")
                                                            : $t("activity-calendar.status_ended")
                                                }}
                                            </span>
                                            <!-- 进行中时显示倒计时 -->
                                            <div
                                                v-if="getActivityStatus(item.activity) === 'ongoing'"
                                                class="text-xs text-primary font-medium"
                                            >
                                                {{ getTimeDistance(item.activity.end_at) }}
                                            </div>
                                        </div>

                                        <!-- 活动标题 -->
                                        <h3 class="font-bold text-sm sm:text-base mb-1 text-base-content line-clamp-1">
                                            {{ item.activity.title }}
                                        </h3>
                                        <!-- 魔灵刷新点击提示 -->
                                        <div
                                            v-if="
                                                item.activity.isMoling &&
                                                !isMolingCompleted &&
                                                getActivityStatus(item.activity) === 'ongoing'
                                            "
                                            class="text-xs text-gray-400"
                                        >
                                            {{ $t("activity-calendar.click_to_complete", "点击标记完成") }}
                                        </div>
                                        <!-- 活动描述 -->
                                        <p v-else-if="item.activity.description" class="text-xs text-gray-600 line-clamp-2">
                                            {{ item.activity.description }}
                                        </p>

                                        <!-- 时间信息 -->
                                        <div class="flex gap-2 text-xs text-gray-500">
                                            <div class="flex items-center gap-1">
                                                <Icon icon="ri:play-circle-line" class="w-3.5 h-3.5 shrink-0" />
                                                <span class="whitespace-nowrap">{{ formatFullDateTime(item.activity.begin_at) }}</span>
                                            </div>
                                            <div class="flex items-center gap-1">
                                                <Icon icon="ri:stop-circle-line" class="w-3.5 h-3.5 shrink-0" />
                                                <span class="whitespace-nowrap">{{ formatFullDateTime(item.activity.end_at) }}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
