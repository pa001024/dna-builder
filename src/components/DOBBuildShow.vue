<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, onMounted, ref } from "vue"
import { Build, buildQuery, buildsWithCountQuery } from "@/api/query"
import { useCharSettings } from "@/composables/useCharSettings"
import { useUIStore } from "@/store/ui"

const props = defineProps<{
    charName: string
    charId: number
}>()

const ui = useUIStore()
const { t } = useTranslation()

// 搜索和筛选
const searchKeyword = ref("")
const loading = ref(false)
const loadingBuild = ref<string | null>(null)
const builds = ref<Build[]>([])
const totalCount = ref(0)

// 当前角色的 charSettings
const charSettings = useCharSettings(computed(() => props.charName))

// 格式化日期
function formatDate(dateString: string): string {
    const date = new Date(dateString)
    return date.toLocaleDateString("zh-CN")
}

// 获取构筑列表
async function fetchBuilds(offset = 0) {
    loading.value = true
    try {
        const result = await buildsWithCountQuery({
            limit: 20,
            offset,
            search: searchKeyword.value || undefined,
            charId: props.charId,
        })

        if (result) {
            builds.value = result.builds
            totalCount.value = result.buildsCount
        }
    } catch (error) {
        ui.showErrorMessage("加载构筑列表失败:", error instanceof Error ? error.message : "未知错误")
    } finally {
        loading.value = false
    }
}

// 搜索处理
function handleSearch() {
    fetchBuilds(0)
}

// 使用构筑
async function useBuild(buildId: string) {
    loadingBuild.value = buildId
    try {
        const result = await buildQuery({ id: buildId })

        if (result?.charSettings) {
            const loadedSettings = JSON.parse(result.charSettings)

            // 应用加载的设置
            Object.assign(charSettings.value, loadedSettings)

            ui.showSuccessMessage("已应用构筑配置")
        }
    } catch (error) {
        ui.showErrorMessage("加载构筑失败:", error instanceof Error ? error.message : "未知错误")
    } finally {
        loadingBuild.value = null
    }
}

// 加载更多
async function loadMore() {
    if (builds.value.length < totalCount.value) {
        const offset = builds.value.length
        loading.value = true
        try {
            const result = await buildsWithCountQuery({
                limit: 20,
                offset,
                search: searchKeyword.value || undefined,
                charId: props.charId,
            })

            if (result) {
                builds.value.push(...result.builds)
            }
        } catch (error) {
            ui.showErrorMessage("加载更多失败:", error instanceof Error ? error.message : "未知错误")
        } finally {
            loading.value = false
        }
    }
}

onMounted(() => {
    fetchBuilds()
})
</script>

<template>
    <div class="h-full flex flex-col">
        <!-- 搜索和筛选栏 -->
        <div class="p-3">
            <div class="flex gap-2 flex-wrap">
                <input
                    v-model="searchKeyword"
                    type="text"
                    :placeholder="t('搜索构筑标题...')"
                    class="input input-bordered input-sm flex-1 min-w-50"
                    @keyup.enter="handleSearch"
                />
                <button class="btn btn-primary btn-sm" @click="handleSearch">
                    <Icon icon="ri:search-line" class="w-4 h-4" />
                    {{ t("搜索") }}
                </button>
            </div>
        </div>

        <!-- 构筑列表 -->
        <ScrollArea class="flex-1">
            <div v-if="loading && builds.length === 0" class="flex justify-center items-center h-full m-4">
                <span class="loading loading-spinner loading-lg" />
            </div>

            <div v-else-if="builds.length === 0" class="flex justify-center items-center h-full text-base-content/50 m-4">
                <div class="text-center">
                    <Icon icon="ri:inbox-line" class="w-16 h-16 mx-auto mb-2 opacity-30" />
                    <div>{{ t("暂无构筑") }}</div>
                </div>
            </div>

            <div v-else class="p-4 grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
                <div
                    v-for="build in builds"
                    :key="build.id"
                    class="card bg-base-100 shadow-lg hover:shadow-xl transition-all cursor-pointer border border-base-200"
                >
                    <div class="card-body p-4">
                        <!-- 标题和标签 -->
                        <div class="flex items-start justify-between mb-2">
                            <h3 class="card-title text-base line-clamp-2 flex-1">
                                {{ build.title }}
                            </h3>
                            <div class="flex gap-1 ml-2">
                                <div v-if="build.isRecommended" class="badge badge-warning badge-sm">
                                    <Icon icon="ri:star-fill" class="w-3 h-3" />
                                </div>
                                <div v-if="build.isPinned" class="badge badge-primary badge-sm">
                                    <Icon icon="ri:pushpin-fill" class="w-3 h-3" />
                                </div>
                            </div>
                        </div>
                        <div class="text-sm text-base-content/60 line-clamp-2 flex-1">{{ build.desc }}</div>

                        <!-- 用户信息 -->
                        <div v-if="build.user" class="flex items-center gap-2 mb-3">
                            <div class="avatar placeholder">
                                <div
                                    class="bg-neutral text-neutral-content rounded-full w-6 h-6 inline-flex justify-center items-center text-xs"
                                >
                                    <QQAvatar :qq="build.user.qq || 0" :name="build.user.name" />
                                </div>
                            </div>
                            <span class="text-xs text-base-content/70">{{ build.user.name }}</span>
                        </div>

                        <!-- 统计信息 -->
                        <div class="flex items-center justify-between text-xs text-base-content/50 mb-3">
                            <div class="flex items-center gap-3">
                                <div class="flex items-center gap-1">
                                    <Icon icon="ri:eye-line" class="w-4 h-4" />
                                    <span>{{ build.views }}</span>
                                </div>
                                <div class="flex items-center gap-1">
                                    <Icon
                                        :icon="build.isLiked ? 'ri:heart-fill' : 'ri:heart-line'"
                                        class="w-4 h-4"
                                        :class="build.isLiked ? 'text-red-500' : ''"
                                    />
                                    <span>{{ build.likes }}</span>
                                </div>
                            </div>
                            <span>{{ formatDate(build.createdAt) }}</span>
                        </div>

                        <!-- 操作按钮 -->
                        <div class="card-actions justify-end mt-2">
                            <button
                                class="btn btn-primary btn-sm w-full"
                                :class="{ 'btn-disabled': loadingBuild === build.id }"
                                @click.stop="useBuild(build.id)"
                            >
                                <span v-if="loadingBuild === build.id" class="loading loading-spinner loading-sm" />
                                <Icon v-else icon="ri:download-2-line" class="w-4 h-4" />
                                {{ loadingBuild === build.id ? t("加载中...") : t("使用") }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 加载更多 -->
            <div class="flex justify-center p-4">
                <button
                    v-if="builds.length >= 20 && builds.length < totalCount"
                    class="btn btn-sm"
                    :class="{ 'btn-disabled': loading }"
                    @click="loadMore"
                >
                    <span v-if="loading" class="loading loading-spinner loading-sm" />
                    <span v-else>{{ t("加载更多") }}</span>
                </button>
            </div>
        </ScrollArea>

        <!-- 统计栏 -->
        <div class="p-2 border-t border-base-200 text-center text-xs text-base-content/50">
            {{ t("共") }} {{ totalCount }} {{ t("个构筑") }}
        </div>
    </div>
</template>
