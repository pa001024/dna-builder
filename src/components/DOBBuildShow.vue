<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, onMounted, ref } from "vue"
import {
    Build,
    buildQuery,
    buildsWithCountQuery,
    deleteBuildMutation,
    likeBuildMutation,
    unlikeBuildMutation,
    updateBuildMutation,
} from "@/api/graphql"
import { useCharSettings } from "@/composables/useCharSettings"
import { env } from "@/env"
import { useUIStore } from "@/store/ui"
import { useUserStore } from "@/store/user"
import { copyText } from "@/util"

const props = defineProps<{
    charName: string
    charId: number
}>()

const ui = useUIStore()
const userStore = useUserStore()
const { t } = useTranslation()

// 搜索和筛选
const searchKeyword = ref("")
const sortBy = ref<"latest" | "views">("latest")
const loading = ref(false)
const loadingBuild = ref<string | null>(null)
const builds = ref<Build[]>([])
const totalCount = ref(0)
const LIMIT = 10

// 编辑弹窗
const edit_model_show = ref(false)
const editingBuildId = ref<string | null>(null)
const editingBuild = ref<Build | null>(null)
const edit_title = ref("")
const edit_desc = ref("")
const updatingBuild = ref<string | null>(null)
const deletingBuild = ref<string | null>(null)
const expandedBuildIds = ref<Record<string, boolean>>({})
const DESCRIPTION_COLLAPSE_THRESHOLD = 40

// 当前角色的 charSettings
const charSettings = useCharSettings(computed(() => props.charName))

/**
 * 判断描述是否超过折叠阈值，超长时显示展开按钮。
 * @param desc 构筑描述文本。
 * @returns 是否需要显示“查看全部”按钮。
 */
function shouldShowExpandButton(desc?: string | null): boolean {
    return Boolean(desc?.trim() && desc.trim().length > DESCRIPTION_COLLAPSE_THRESHOLD)
}

/**
 * 判断指定构筑描述是否处于展开状态。
 * @param buildId 构筑 ID。
 * @returns 当前描述是否展开。
 */
function isDescriptionExpanded(buildId: string): boolean {
    return Boolean(expandedBuildIds.value[buildId])
}

/**
 * 切换指定构筑描述的展开/收起状态。
 * @param buildId 构筑 ID。
 */
function toggleDescriptionExpand(buildId: string) {
    expandedBuildIds.value[buildId] = !expandedBuildIds.value[buildId]
}

// 格式化日期
function formatDate(dateString: string): string {
    const date = new Date(dateString)
    return date.toLocaleDateString("zh-CN")
}

// 获取构筑列表
async function fetchBuilds(offset = 0) {
    loading.value = true
    try {
        const result = await buildsWithCountQuery(
            {
                limit: LIMIT,
                offset,
                search: searchKeyword.value || undefined,
                charId: props.charId,
                sortBy: sortBy.value,
            },
            { requestPolicy: "cache-and-network" }
        )

        if (result) {
            builds.value = result.builds
            totalCount.value = result.buildsCount
            expandedBuildIds.value = {}
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

/**
 * 切换排序方式后重新查询构筑列表。
 */
function handleSortChange() {
    fetchBuilds(0)
}

// 使用构筑
async function useBuild(buildId: string) {
    loadingBuild.value = buildId
    try {
        const result = await buildQuery({ id: buildId }, { requestPolicy: "network-only" })

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

// 打开编辑弹窗
function openEditModal(build: Build) {
    editingBuildId.value = build.id
    editingBuild.value = build
    edit_title.value = build.title
    edit_desc.value = build.desc || ""
    edit_model_show.value = true
}

// 确认编辑
async function confirmEdit() {
    if (!editingBuildId.value || !editingBuild.value) return

    // 权限检查：只有当前用户创建的配装或管理员才能被编辑
    if (userStore.id !== editingBuild.value.userId && !userStore.isAdmin) {
        ui.showErrorMessage("没有权限编辑该构筑")
        edit_model_show.value = false
        editingBuildId.value = null
        editingBuild.value = null
        return
    }

    updatingBuild.value = editingBuildId.value
    try {
        const result = await updateBuildMutation({
            id: editingBuildId.value,
            input: {
                title: edit_title.value,
                desc: edit_desc.value,
                charId: editingBuild.value.charId,
                charSettings: JSON.stringify(charSettings.value),
            },
        })

        if (result) {
            // 更新本地构筑列表
            const index = builds.value.findIndex(b => b.id === editingBuildId.value)
            if (index > -1) {
                builds.value[index].title = edit_title.value
                builds.value[index].desc = edit_desc.value
            }
            ui.showSuccessMessage("构筑已更新")
        }
    } catch (error) {
        ui.showErrorMessage("更新构筑失败:", error instanceof Error ? error.message : "未知错误")
    } finally {
        updatingBuild.value = null
        edit_model_show.value = false
        editingBuildId.value = null
        editingBuild.value = null
    }
}

// 删除构筑
async function deleteBuild() {
    if (!editingBuildId.value || !editingBuild.value) return

    // 权限检查：只有当前用户创建的配装或管理员才能删除
    if (userStore.id !== editingBuild.value.userId && !userStore.isAdmin) {
        ui.showErrorMessage("没有权限删除该构筑")
        return
    }

    // 确认删除
    if (!(await ui.showDialog("删除确认", "确定要删除该构筑吗？此操作不可恢复。"))) {
        return
    }

    deletingBuild.value = editingBuildId.value
    try {
        const result = await deleteBuildMutation({
            id: editingBuildId.value,
        })

        if (result) {
            // 从本地列表中移除
            builds.value = builds.value.filter(b => b.id !== editingBuildId.value)
            totalCount.value--
            ui.showSuccessMessage("构筑已删除")
            edit_model_show.value = false
        }
    } catch (error) {
        ui.showErrorMessage("删除构筑失败:", error instanceof Error ? error.message : "未知错误")
    } finally {
        deletingBuild.value = null
        editingBuildId.value = null
        editingBuild.value = null
    }
}

function copyLink(url: string) {
    copyText(url)
    ui.showSuccessMessage("链接已复制")
}

// 点赞/取消点赞
async function toggleLike(build: Build) {
    // 检查用户是否已登录
    if (!userStore.id) {
        ui.showErrorMessage("请先登录后再进行点赞操作")
        return
    }

    try {
        if (build.isLiked) {
            // 取消点赞
            const result = await unlikeBuildMutation({ id: build.id })
            if (result) {
                build.isLiked = result.isLiked
                build.likes = result.likes
            }
        } else {
            // 点赞
            const result = await likeBuildMutation({ id: build.id })
            if (result) {
                build.isLiked = result.isLiked
                build.likes = result.likes
            }
        }
    } catch (error) {
        ui.showErrorMessage("点赞操作失败:", error instanceof Error ? error.message : "未知错误")
    }
}

// 加载更多
async function loadMore() {
    if (builds.value.length < totalCount.value) {
        const offset = builds.value.length
        loading.value = true
        try {
            const result = await buildsWithCountQuery(
                {
                    limit: LIMIT,
                    offset,
                    search: searchKeyword.value || undefined,
                    charId: props.charId,
                    sortBy: sortBy.value,
                },
                { requestPolicy: "cache-and-network" }
            )

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

defineExpose({
    fetchBuilds,
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
                <select v-model="sortBy" class="select select-bordered select-sm w-36" @change="handleSortChange">
                    <option value="latest">最新修改</option>
                    <option value="views">最多浏览</option>
                </select>
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

            <div v-else class="p-2 grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
                <div
                    v-for="build in builds"
                    :key="build.id"
                    class="card bg-base-100 shadow-lg hover:shadow-xl transition-all border border-base-200"
                >
                    <div class="card-body p-4">
                        <!-- 标题和标签 -->
                        <div class="flex items-start justify-between mb-2">
                            <a
                                :href="`${env.endpoint}/char/${charId}/${build.id}`"
                                title="点击复制链接"
                                @click.prevent="copyLink(`${env.endpoint}/char/${charId}/${build.id}`)"
                                class="card-title text-base line-clamp-2 flex-1 link"
                            >
                                {{ build.title }}
                            </a>
                            <div class="flex gap-1 ml-2">
                                <div v-if="build.isRecommended" class="badge badge-warning badge-sm">
                                    <Icon icon="ri:star-fill" class="w-3 h-3" />
                                </div>
                                <div v-if="build.isPinned" class="badge badge-primary badge-sm">
                                    <Icon icon="ri:pushpin-fill" class="w-3 h-3" />
                                </div>
                            </div>
                        </div>
                        <div class="text-sm text-base-content/60 flex-1">
                            <div :class="{ 'line-clamp-2': !isDescriptionExpanded(build.id) }">
                                {{ build.desc || "作者很懒没填任何东西..." }}
                            </div>
                            <button
                                v-if="shouldShowExpandButton(build.desc)"
                                type="button"
                                class="text-primary cursor-pointer text-xs mt-1"
                                @click.stop="toggleDescriptionExpand(build.id)"
                            >
                                {{ isDescriptionExpanded(build.id) ? $t("收起") : $t("查看全部") }}
                            </button>
                        </div>

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
                                <div
                                    class="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
                                    @click="toggleLike(build)"
                                >
                                    <Icon
                                        :icon="build.isLiked ? 'ri:heart-fill' : 'ri:heart-line'"
                                        class="w-4 h-4"
                                        :class="build.isLiked ? 'text-secondary' : ''"
                                    />
                                    <span>{{ build.likes }}</span>
                                </div>
                            </div>
                            <span>{{ formatDate(build.updateAt) }}</span>
                        </div>

                        <!-- 操作按钮 -->
                        <div class="card-actions justify-end mt-2 flex gap-2">
                            <button
                                v-if="userStore.id === build.userId || userStore.isAdmin"
                                class="btn btn-secondary btn-sm flex-1"
                                :class="{ 'btn-disabled': updatingBuild === build.id }"
                                @click.stop="openEditModal(build)"
                            >
                                <span v-if="updatingBuild === build.id" class="loading loading-spinner loading-sm" />
                                <Icon v-else icon="ri:edit-line" class="w-4 h-4" />
                                {{ $t("编辑") }}
                            </button>
                            <button
                                class="btn btn-primary btn-sm flex-1"
                                :class="{ 'btn-disabled': loadingBuild === build.id }"
                                @click.stop="useBuild(build.id)"
                            >
                                <span v-if="loadingBuild === build.id" class="loading loading-spinner loading-sm" />
                                <Icon v-else icon="ri:download-2-line" class="w-4 h-4" />
                                {{ loadingBuild === build.id ? $t("加载中...") : $t("使用") }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 加载更多 -->
            <div class="flex justify-center p-4">
                <button
                    v-if="builds.length >= LIMIT && builds.length < totalCount"
                    class="btn btn-sm"
                    :class="{ 'btn-disabled': loading }"
                    @click="loadMore"
                >
                    <span v-if="loading" class="loading loading-spinner loading-sm" />
                    <span v-else>{{ $t("加载更多") }}</span>
                </button>
            </div>
        </ScrollArea>

        <!-- 统计栏 -->
        <div class="p-2 border-t border-base-200 text-center text-xs text-base-content/50">
            {{ $t("共") }} {{ totalCount }} {{ $t("个构筑") }}
        </div>
    </div>

    <!-- 编辑弹窗 -->
    <DialogModel v-model="edit_model_show" class="bg-base-300">
        <div class="space-y-4">
            <h3 class="text-xl font-bold">{{ $t("编辑构筑") }}</h3>
            <div>
                <label class="label" for="edit-title">
                    <span class="label-text">{{ $t("标题") }}</span>
                </label>
                <input
                    id="edit-title"
                    v-model="edit_title"
                    type="text"
                    class="input input-bordered w-full"
                    :placeholder="t('输入标题...')"
                    maxlength="50"
                />
            </div>
            <div>
                <label class="label" for="edit-desc">
                    <span class="label-text">{{ $t("描述") }}</span>
                </label>
                <textarea
                    id="edit-desc"
                    v-model="edit_desc"
                    class="textarea textarea-bordered w-full"
                    :placeholder="t('输入描述...')"
                    rows="3"
                    maxlength="200"
                ></textarea>
            </div>
        </div>
        <template #action>
            <button
                type="button"
                class="btn btn-danger flex-1"
                @click="deleteBuild"
                :class="{ 'btn-disabled': deletingBuild === editingBuildId }"
            >
                <span v-if="deletingBuild === editingBuildId" class="loading loading-spinner loading-sm" />
                <Icon v-else icon="ri:delete-bin-line" class="w-4 h-4" />
                {{ $t("game-launcher.delete") }}
            </button>
            <button
                type="button"
                class="btn btn-primary flex-1"
                @click="confirmEdit"
                :class="{ 'btn-disabled': updatingBuild === editingBuildId }"
            >
                <span v-if="updatingBuild === editingBuildId" class="loading loading-spinner loading-sm" />
                {{ $t("char-build.save") }}
            </button>
        </template>
    </DialogModel>
</template>
