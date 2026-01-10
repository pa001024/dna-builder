<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { achievementData } from "../data"
import { useLocalStorage } from "@vueuse/core"
import { t } from "i18next"
import { useUIStore } from "../store/ui"

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
    const query = searchQuery.value.toLowerCase()
    let filtered = achievementData.filter(achievement => {
        // 分类筛选
        const categoryMatch = !selectedCategory.value || achievement.分类 === selectedCategory.value
        // 版本筛选
        const versionMatch = selectedVersion.value === "所有版本" || achievement.版本 === selectedVersion.value
        // 搜索筛选
        const searchMatch = achievement.名称.toLowerCase().includes(query) || achievement.描述.toLowerCase().includes(query)
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
                    throw new Error("无效的数据格式")
                }

                // 询问用户是否确认导入
                if (await ui.showDialog("确认导入", t("achievement.importConfirm", { count: importedData.length }))) {
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
//#endregion
</script>

<template>
    <div class="flex flex-col h-full bg-base-300 text-base-content/90">
        <!-- 顶部操作栏 -->
        <div class="bg-base-100 border-b border-base-200 p-2 px-4 flex justify-between items-center shadow-sm">
            <div class="flex items-center">
                <h1 class="text-lg font-bold mr-4">
                    {{ $t("achievement.title") }}
                </h1>
                <span class="text-sm text-base-content/60">{{ userFinishedIds.length }} / {{ achievementData.length }}</span>
            </div>

            <div class="flex items-center gap-2">
                <!-- 清空按钮 -->
                <button class="btn btn-error btn-sm space-x-1" @click="showClearConfirmDialog">
                    <Icon icon="ri:delete-bin-line" class="w-4 h-4" />
                    {{ $t("achievement.clear") }}
                </button>
                <!-- 导入按钮 -->
                <button class="btn btn-sm space-x-1" @click="importAchievements">
                    <Icon icon="ri:download-2-line" class="w-4 h-4" />
                    {{ $t("achievement.import") }}
                </button>
                <!-- 导出按钮 -->
                <button class="btn btn-sm space-x-1" @click="exportAchievements">
                    <Icon icon="ri:upload-2-line" class="w-4 h-4" />
                    {{ $t("achievement.export") }}
                </button>
            </div>
        </div>

        <!-- 主内容区 -->
        <div class="flex flex-1 overflow-hidden">
            <!-- 左侧分类区 -->
            <div class="w-64 border-r border-base-200 shrink-0 flex flex-col h-full bg-base-100">
                <ScrollArea class="flex-1 p-2">
                    <!-- 全部分类选项 -->
                    <div>
                        <div
                            class="flex flex-col items-end p-4 cursor-pointer transition-colors border-r-2"
                            :class="selectedCategory === null ? 'border-primary text-primary' : 'border-transparent'"
                            @click="selectedCategory = null"
                        >
                            <span class="text-sm font-medium">{{ $t("全部") }}</span>
                            <span class="text-xs">
                                {{ userFinishedIds.length }}/{{ totalAchievements }} ({{
                                    Math.round((userFinishedIds.length / totalAchievements) * 100)
                                }}%)
                            </span>
                        </div>
                    </div>
                    <div v-for="(achievements, category) in categorizedAchievements" :key="category">
                        <div
                            class="flex flex-col items-end p-4 cursor-pointer transition-colors border-r-2 hover:bg-base-200"
                            :class="selectedCategory === category ? 'border-primary text-primary' : 'border-transparent'"
                            @click="selectCategory(category)"
                        >
                            <span class="text-sm font-medium">{{ $t(category) }}</span>
                            <span class="text-xs">
                                {{ categoryFinishedCounts[category] || 0 }}/{{ achievements.length }} ({{
                                    Math.round(((categoryFinishedCounts[category] || 0) / achievements.length) * 100)
                                }}%)
                            </span>
                        </div>
                    </div>
                </ScrollArea>
            </div>

            <!-- 右侧成就列表 -->
            <div class="flex-1 flex flex-col overflow-hidden bg-base-300">
                <!-- 筛选, 搜索区域 -->
                <div class="bg-base-100 rounded-lg border border-base-200 p-4 m-4 shadow-sm flex gap-4">
                    <Select
                        v-model="selectedVersion"
                        class="inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap w-40"
                        :placeholder="$t('achievement.selectVersion')"
                    >
                        <SelectItem value="所有版本">
                            {{ $t("achievement.allVersions") }}
                        </SelectItem>
                        <SelectItem v-for="version in versionOptions" :key="version" :value="version">
                            {{ version }}
                        </SelectItem>
                    </Select>
                    <label class="label text-sm">
                        <input v-model="prioritizeUnfinished" type="checkbox" class="checkbox checkbox-sm" />
                        {{ $t("achievement.unfinishedFirst") }}
                    </label>
                    <label class="label text-sm">
                        <input v-model="hideCompleted" type="checkbox" class="checkbox checkbox-sm" />
                        {{ $t("achievement.hideCompleted") }}
                    </label>
                    <label class="label text-sm">
                        <input v-model="selectAllCurrentPage" type="checkbox" class="checkbox checkbox-sm" />
                        {{ $t("achievement.selectAllCurrentPage") }}
                    </label>
                    <input
                        v-model="searchQuery"
                        type="text"
                        class="ml-auto inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap min-w-40 max-w-80"
                        :placeholder="$t('achievement.searchAchievements')"
                    />
                </div>
                <ScrollArea class="flex-1">
                    <!-- 成就列表卡片 -->
                    <div class="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4 m-4">
                        <div
                            v-for="achievement in filteredAchievements"
                            :key="achievement.id"
                            class="bg-base-100 rounded-lg border border-base-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                        >
                            <div class="p-4">
                                <div class="flex justify-between items-start mb-3">
                                    <div class="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            :checked="userFinishedIds.indexOf(achievement.id) !== -1"
                                            class="checkbox"
                                            @change="toggleAchievement(achievement.id)"
                                        />
                                        <h3
                                            class="font-medium text-base"
                                            :class="{ 'line-through opacity-60': userFinishedIds.indexOf(achievement.id) !== -1 }"
                                        >
                                            {{ $t(achievement.名称) }}
                                        </h3>
                                    </div>
                                </div>

                                <div class="text-sm text-base-content/70 mb-3">
                                    {{ $t(achievement.描述) }}
                                </div>

                                <div class="flex flex-wrap items-center gap-2">
                                    <div v-if="achievement.分类" class="badge badge-soft badge-primary">
                                        {{ $t(achievement.分类) }}
                                    </div>
                                    <div class="text-xs ml-auto flex flex-wrap gap-2">
                                        <div v-for="(value, key) in achievement.奖励" :key="key" class="inline-flex flex-col items-center">
                                            <span class="text-base-content/60">{{ $t(key) }}</span>
                                            <span class="text-base-content/40">{{ value }}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </ScrollArea>
            </div>
        </div>

        <dialog id="reset-confirm-dialog" class="modal">
            <div class="modal-box bg-base-300">
                <p class="text-lg font-bold">
                    {{ $t("achievement.clearConfirm") }}
                </p>
                <div class="modal-action">
                    <form class="flex justify-end gap-2" method="dialog">
                        <button class="min-w-20 btn btn-secondary" @click="clearAllFinished">
                            {{ $t("setting.confirm") }}
                        </button>
                        <button class="min-w-20 btn">
                            {{ $t("setting.cancel") }}
                        </button>
                    </form>
                </div>
            </div>
        </dialog>
    </div>
</template>
