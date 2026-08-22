<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { t } from "i18next"
import { computed, ref, watch } from "vue"
import { achievementData } from "@/data"
import { useUIStore } from "@/store/ui"
import { matchPinyin } from "@/utils/pinyin-utils"

const ui = useUIStore()

// 用户已完成的成就ID列表
const userFinishedIds = useLocalStorage("achi.finished", [] as number[])

// 当前选中的分类
const selectedCategory = ref<string | null>(null)
const selectedVersion = ref("所有版本")
const searchQuery = ref("")
const prioritizeUnfinished = ref(false)
const hideCompleted = ref(false)

// 获取所有类别并构建分类树
const categorizedAchievements = computed(() => {
    const categories: Record<string, any[]> = {}
    achievementData.forEach(achievement => {
        if (achievement.分类) {
            if (!categories[achievement.分类]) {
                categories[achievement.分类] = []
            }
            categories[achievement.分类].push(achievement)
        }
    })
    return categories
})

const versionOptions = computed(() => {
    const versions = new Set<string>()
    achievementData.forEach(achievement => {
        if (achievement.版本) {
            versions.add(achievement.版本)
        }
    })
    return [...versions].sort()
})

// 计算每个分类的完成数量
const categoryFinishedCounts = computed(() => {
    const counts: Record<string, number> = {}

    Object.entries(categorizedAchievements.value).forEach(([category, achievements]) => {
        counts[category] = achievements.filter(a => userFinishedIds.value.indexOf(a.id) !== -1).length
    })

    return counts
})

// 切换成就完成状态
const toggleAchievement = (id: number) => {
    const index = userFinishedIds.value.indexOf(id)
    if (index > -1) {
        userFinishedIds.value.splice(index, 1)
    } else {
        userFinishedIds.value.push(id)
    }
}

// 清空所有完成记录
const clearAllFinished = () => {
    userFinishedIds.value = []
}
const showClearConfirmDialog = () => {
    const dialog = document.getElementById("reset-confirm-dialog") as HTMLDialogElement
    dialog?.show()
}

// 根据选中分类筛选的成就列表
const filteredAchievements = computed(() => {
    const query = searchQuery.value.trim()
    let filtered = achievementData.filter(achievement => {
        // 分类筛选
        const categoryMatch = !selectedCategory.value || achievement.分类 === selectedCategory.value
        // 版本筛选
        const versionMatch = selectedVersion.value === "所有版本" || achievement.版本 === selectedVersion.value

        // 搜索筛选
        let searchMatch = false
        if (query) {
            // 直接中文匹配
            const directMatch = achievement.名称.includes(query) || achievement.描述.includes(query)
            if (directMatch) {
                searchMatch = true
            } else {
                // 拼音匹配（全拼/首字母）
                const nameMatch = matchPinyin(achievement.名称, query).match
                const descMatch = matchPinyin(achievement.描述, query).match
                searchMatch = nameMatch || descMatch
            }
        } else {
            searchMatch = true
        }

        // 已完成筛选
        const completedMatch = !hideCompleted.value || userFinishedIds.value.indexOf(achievement.id) === -1

        return categoryMatch && versionMatch && searchMatch && completedMatch
    })

    // 排序：未完成优先
    if (prioritizeUnfinished.value) {
        filtered.sort((a, b) => {
            const aCompleted = userFinishedIds.value.indexOf(a.id) !== -1
            const bCompleted = userFinishedIds.value.indexOf(b.id) !== -1

            if (aCompleted && !bCompleted) return 1
            if (!aCompleted && bCompleted) return -1
            return 0
        })
    }

    return filtered
})

// 统计数据计算
const totalAchievements = computed(() => achievementData.length)

// 选择分类的方法
const selectCategory = (category: string) => {
    selectedCategory.value = selectedCategory.value === category ? null : category
}

// 导出成就数据
const exportAchievements = () => {
    // 将用户完成的成就ID列表转换为JSON格式
    const data = JSON.stringify(userFinishedIds.value, null, 2)
    const blob = new Blob([data], { type: "application/json" })

    // 创建下载链接
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `achievements_backup_${new Date().toISOString().split("T")[0]}.json`

    // 触发下载
    document.body.appendChild(link)
    link.click()

    // 清理
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}

// 导入成就数据
const importAchievements = () => {
    // 创建文件输入元素
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".json"

    // 监听文件选择事件
    input.onchange = event => {
        const file = (event.target as HTMLInputElement).files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = async e => {
            try {
                // 解析JSON数据
                const importedData = JSON.parse(e.target?.result as string)

                // 验证数据格式
                if (!Array.isArray(importedData)) {
                    throw new Error(t("achievement.invalidData"))
                }

                // 询问用户是否确认导入
                if (await ui.showDialog(t("achievement.importTitle"), t("achievement.importConfirm", { count: importedData.length }))) {
                    userFinishedIds.value = importedData
                }
            } catch (e) {
                ui.showErrorMessage(t("achievement.importFailed"), e)
            }
        }

        reader.readAsText(file)
    }

    // 触发文件选择对话框
    input.click()
}

//#region 全选当前分类
const selectAllCurrentPage = ref(false)
// 监听全选复选框变化
watch(selectAllCurrentPage, newValue => {
    // 创建一个新的数组，避免直接修改userFinishedIds
    const updatedFinishedIds = [...userFinishedIds.value]

    // 遍历当前页面的所有成就
    filteredAchievements.value.forEach(achievement => {
        const id = achievement.id
        const index = updatedFinishedIds.indexOf(id)

        if (newValue && index === -1) {
            // 如果要全选且成就未完成，则添加到完成列表
            updatedFinishedIds.push(id)
        } else if (!newValue && index > -1) {
            // 如果要取消全选且成就已完成，则从完成列表中移除
            updatedFinishedIds.splice(index, 1)
        }
    })

    // 更新userFinishedIds
    userFinishedIds.value = updatedFinishedIds
})

// 监听筛选结果变化，更新全选复选框状态
watch(
    filteredAchievements,
    () => {
        // 检查当前页面是否所有成就都已完成
        const allCompleted =
            filteredAchievements.value.length > 0 &&
            filteredAchievements.value.every(achievement => userFinishedIds.value.includes(achievement.id))

        // 只有当筛选结果不为空时，才更新全选状态
        if (filteredAchievements.value.length > 0) {
            selectAllCurrentPage.value = allCompleted
        } else {
            selectAllCurrentPage.value = false
        }
    },
    { immediate: true }
)

function getAchievementIcon(category: string) {
    const categoryMap: Record<string, number> = {
        "此岸×彼岸": 2,
        欢乐时日: 3,
        "你好，世界": 5,
        友人成行: 10,
        美妙的一瞬: 4,
        "我来，我见，我征服": 7,
        完美主义: 6,
        不止是数字: 1,
        英雄的诞生: 9,
        愿望清单: 11,
        向最高处: 8,
        迷宫花园: 12,
    }
    return `/imgs/webp/T_Achievement_${categoryMap[category] > 9 ? categoryMap[category] : "0" + categoryMap[category]}.webp`
}
//#endregion
</script>

<template>
    <div class="flex h-full flex-col">
        <!-- 顶部操作栏：hairline 检索带 -->
        <div class="flex-none border-b border-base-content/15 px-4 py-2.5">
            <div class="flex items-center justify-between gap-3">
                <div class="flex items-baseline gap-3">
                    <h1 class="text-sm font-semibold tracking-wide">{{ $t("achievement.title") }}</h1>
                    <span class="font-mono text-[11px] tabular-nums text-base-content/45">
                        {{ userFinishedIds.length }} / {{ achievementData.length }}
                    </span>
                </div>

                <div class="flex items-center gap-2">
                    <!-- 清空按钮 -->
                    <button
                        type="button"
                        class="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-xs border border-base-content/15 px-2.5 text-xs font-medium text-base-content/70 transition-colors duration-150 hover:border-error/50 hover:text-error"
                        @click="showClearConfirmDialog"
                    >
                        <Icon icon="ri:delete-bin-line" class="h-4 w-4" />
                        {{ $t("achievement.clear") }}
                    </button>
                    <!-- 导入按钮 -->
                    <button
                        type="button"
                        class="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-xs border border-base-content/15 px-2.5 text-xs font-medium text-base-content/70 transition-colors duration-150 hover:border-primary/50 hover:text-primary"
                        @click="importAchievements"
                    >
                        <Icon icon="ri:download-2-line" class="h-4 w-4" />
                        {{ $t("achievement.import") }}
                    </button>
                    <!-- 导出按钮 -->
                    <button
                        type="button"
                        class="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-xs border border-base-content/15 px-2.5 text-xs font-medium text-base-content/70 transition-colors duration-150 hover:border-primary/50 hover:text-primary"
                        @click="exportAchievements"
                    >
                        <Icon icon="ri:upload-2-line" class="h-4 w-4" />
                        {{ $t("achievement.export") }}
                    </button>
                </div>
            </div>
        </div>

        <!-- 主内容区 -->
        <div class="flex flex-1 overflow-hidden">
            <!-- 左侧分类区 -->
            <div class="w-64 shrink-0 overflow-hidden border-r border-base-content/10">
                <ScrollArea class="h-full">
                    <div class="space-y-0.5 p-2">
                        <!-- 全部分类选项 -->
                        <button
                            type="button"
                            class="relative flex w-full cursor-pointer items-center justify-between gap-2 rounded-xs px-3 py-2.5 text-left transition-colors duration-150"
                            :class="
                                selectedCategory === null ? 'bg-primary/10 text-primary' : 'text-base-content/70 hover:bg-base-content/5'
                            "
                            @click="selectedCategory = null"
                        >
                            <span class="truncate text-sm font-medium">{{ $t("全部") }}</span>
                            <span class="shrink-0 text-[11px] tabular-nums opacity-80">
                                {{ userFinishedIds.length }}/{{ totalAchievements }}
                            </span>
                        </button>
                        <button
                            v-for="(achievements, category) in categorizedAchievements"
                            :key="category"
                            type="button"
                            class="relative flex w-full cursor-pointer items-center gap-2.5 rounded-xs px-3 py-2 text-left transition-colors duration-150"
                            :class="
                                selectedCategory === category
                                    ? 'bg-primary/10 text-primary'
                                    : 'text-base-content/70 hover:bg-base-content/5'
                            "
                            @click="selectCategory(category)"
                        >
                            <img
                                v-if="category !== '全部'"
                                :src="getAchievementIcon(category)"
                                :alt="$t(category)"
                                class="size-10 shrink-0 rounded-xs object-cover"
                            />
                            <div class="min-w-0 flex-1">
                                <div class="truncate text-sm font-medium">{{ $t(category) }}</div>
                                <div class="mt-0.5 text-[11px] tabular-nums opacity-70">
                                    {{ categoryFinishedCounts[category] || 0 }}/{{ achievements.length }}
                                </div>
                            </div>
                            <!-- 选中态左侧主色竖条 -->
                            <span
                                class="absolute inset-y-1 left-0 w-0.75 rounded-full bg-primary transition-opacity duration-150"
                                :class="selectedCategory === category ? 'opacity-100' : 'opacity-0'"
                                aria-hidden="true"
                            />
                        </button>
                    </div>
                </ScrollArea>
            </div>

            <!-- 右侧成就列表 -->
            <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
                <!-- 筛选区：外层区块卡 -->
                <div class="mx-4 mt-4 rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <Select
                            v-model="selectedVersion"
                            class="input input-bordered input-sm h-7 w-36 rounded-xs border-base-content/20 bg-transparent text-xs"
                            :placeholder="$t('achievement.selectVersion')"
                        >
                            <SelectItem value="所有版本">
                                {{ $t("achievement.allVersions") }}
                            </SelectItem>
                            <SelectItem v-for="version in versionOptions" :key="version" :value="version">
                                {{ version }}
                            </SelectItem>
                        </Select>

                        <!-- 开关方章：未完成优先 -->
                        <button
                            type="button"
                            class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150"
                            :class="
                                prioritizeUnfinished
                                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                                    : 'border-base-content/20 text-base-content/55 hover:border-primary/50 hover:text-primary'
                            "
                            @click="prioritizeUnfinished = !prioritizeUnfinished"
                        >
                            {{ $t("achievement.unfinishedFirst") }}
                        </button>
                        <!-- 开关方章：隐藏已完成 -->
                        <button
                            type="button"
                            class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150"
                            :class="
                                hideCompleted
                                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                                    : 'border-base-content/20 text-base-content/55 hover:border-primary/50 hover:text-primary'
                            "
                            @click="hideCompleted = !hideCompleted"
                        >
                            {{ $t("achievement.hideCompleted") }}
                        </button>
                        <!-- 开关方章：全选当前筛选 -->
                        <button
                            type="button"
                            class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150"
                            :class="
                                selectAllCurrentPage
                                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                                    : 'border-base-content/20 text-base-content/55 hover:border-primary/50 hover:text-primary'
                            "
                            @click="selectAllCurrentPage = !selectAllCurrentPage"
                        >
                            {{ $t("achievement.selectAllCurrentPage") }}
                        </button>

                        <!-- 下划线搜索 -->
                        <div class="relative ml-auto w-52">
                            <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                            <input
                                v-model="searchQuery"
                                type="text"
                                :placeholder="$t('achievement.searchPlaceholder')"
                                class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1 pl-7 pr-3 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                            />
                        </div>
                    </div>
                </div>

                <ScrollArea class="min-h-0 flex-1">
                    <!-- 成就列表卡片 -->
                    <div class="grid grid-cols-1 gap-3 m-4 lg:grid-cols-2 2xl:grid-cols-3">
                        <div
                            v-for="(achievement, index) in filteredAchievements"
                            :key="achievement.id"
                            class="group relative overflow-hidden rounded-xs border bg-base-100/60 p-4 backdrop-blur-sm transition-colors duration-200 hover:border-primary/50 animate-ef-rise motion-reduce:animate-none"
                            :class="userFinishedIds.indexOf(achievement.id) !== -1 ? 'border-success/30' : 'border-base-content/12'"
                            :style="{ animationDelay: `${Math.min(index * 20, 240)}ms` }"
                        >
                            <div class="flex items-start justify-between gap-2 mb-3">
                                <div class="flex items-center gap-2.5">
                                    <input
                                        type="checkbox"
                                        :checked="userFinishedIds.indexOf(achievement.id) !== -1"
                                        class="checkbox checkbox-sm"
                                        @change="toggleAchievement(achievement.id)"
                                    />
                                    <h3
                                        class="text-sm font-medium"
                                        :class="{ 'line-through opacity-50': userFinishedIds.indexOf(achievement.id) !== -1 }"
                                    >
                                        {{ $t(achievement.名称) }}
                                    </h3>
                                </div>
                                <img
                                    v-if="achievement.品质"
                                    :src="`/imgs/webp/Icon_Achievement_${['Copper', 'Silver', 'Gold'][achievement.品质 - 1]}.webp`"
                                    :alt="$t('achievement.quality')"
                                    class="size-6 shrink-0"
                                />
                            </div>

                            <div class="mb-3 text-sm leading-relaxed text-base-content/65">
                                {{ $t(achievement.描述) }}
                            </div>

                            <div class="flex flex-wrap items-end justify-between gap-2 border-t border-base-content/8 pt-2.5">
                                <span
                                    v-if="achievement.分类"
                                    class="inline-flex shrink-0 items-center rounded-xs border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium leading-none text-primary"
                                >
                                    {{ $t(achievement.分类) }}
                                </span>
                                <div class="ml-auto flex flex-wrap justify-end gap-x-3 gap-y-1">
                                    <div
                                        v-for="(value, key) in achievement.奖励"
                                        :key="key"
                                        class="inline-flex flex-col items-end leading-tight"
                                    >
                                        <span class="text-[10px] text-base-content/45">{{ $t(key) }}</span>
                                        <span class="font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ value }}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 空状态 -->
                    <div
                        v-if="filteredAchievements.length === 0"
                        class="flex flex-col items-center justify-center py-24 text-base-content/45"
                    >
                        <Icon icon="ri:trophy-line" class="mb-4 h-12 w-12 opacity-40" />
                        <p class="text-sm">没有符合条件的成就</p>
                    </div>
                </ScrollArea>
            </div>
        </div>

        <dialog id="reset-confirm-dialog" class="modal">
            <div class="modal-box rounded-xs border border-base-content/15 bg-base-100/85 backdrop-blur-md">
                <p class="text-lg font-bold">
                    {{ $t("achievement.clearConfirm") }}
                </p>
                <div class="modal-action">
                    <form class="flex justify-end gap-2" method="dialog">
                        <button class="btn btn-error min-w-20" @click="clearAllFinished">
                            {{ $t("setting.confirm") }}
                        </button>
                        <button class="btn min-w-20">
                            {{ $t("setting.cancel") }}
                        </button>
                    </form>
                </div>
            </div>
        </dialog>
    </div>
</template>
