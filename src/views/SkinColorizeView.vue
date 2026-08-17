<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import {
    createDyePlanMutation,
    type DyePlan,
    deleteDyePlanMutation,
    dyePlanQuery,
    likeDyePlanMutation,
    unlikeDyePlanMutation,
    updateDyePlanMutation,
} from "@/api/graphql"
import { useSearchParam } from "@/composables/useSearchParam"
import { skinData } from "@/data/d/accessory.data"
import charData from "@/data/d/char.data"
import { skinColorizeMaxColorParts, skinColorizeParts, skinColorizeSwatches } from "@/data/d/skin-colorize.data"
import { decodeSkinColorizeCode, encodeSkinColorizeCode, formatSkinColorizeRgb, type SkinColorizeSwatch } from "@/data/skin-colorize"
import { env } from "@/env"
import { useUIStore } from "@/store/ui"
import { useUserStore } from "@/store/user"
import { copyText } from "@/util"
import { formatRelativeTime } from "@/utils/time"

const ui = useUIStore()
const user = useUserStore()
const route = useRoute()
const router = useRouter()
/** i18n 实例（代理访问会登记语言切换重渲染依赖，保证相对时间随语言刷新）。 */
const { i18next } = useTranslation()

const selectedCharacterId = ref<number>()
const selectedSkinId = ref<number>()
const selectedColorIds = ref<number[]>([])
/** 当前正在编辑的部件序号，颜色选择器作用于该部件。 */
const activePartId = ref(1)

/** 当前预览图：用户上传的图片（blob URL）或分享方案携带的远程图片。 */
const previewImage = ref("")
/** 待上传的本地预览图文件。 */
const previewFile = ref<File>()
/** 已上传到服务器的预览图 URL。 */
const uploadedImageUrl = ref("")
const fileInputRef = ref<HTMLInputElement>()
const dragging = ref(false)

/** 当前通过分享链接载入的方案信息，新建模式下为空。 */
const loadedPlan = ref<DyePlan>()
const planLoading = ref(false)
const saving = ref(false)
const uploading = ref(false)

/** 分享弹窗状态。 */
const shareShow = ref(false)
const shareIsOriginal = ref(true)
const shareSource = ref("")
const sharing = ref(false)

/** 页面上的标题 / 描述编辑框（新建与编辑模式共用）。 */
const editTitle = ref("")
const editDesc = ref("")

/** 分享链接中的方案 ID，为空表示新建模式。 */
const sharePlanId = computed(() => (typeof route.params.planId === "string" ? route.params.planId : ""))
/** 是否新建模式（未携带方案 ID）。 */
const isCreateMode = computed(() => !sharePlanId.value)
/** 当前用户是否可编辑该方案（作者本人或管理员）。 */
const canEdit = computed(() => {
    if (isCreateMode.value) return true
    return !!loadedPlan.value && (loadedPlan.value.userId === user.id || user.isAdmin)
})

/** 发布页 URL 参数：展示页「发布」按钮传入的角色筛选。 */
const createCharId = useSearchParam<number>("charId", 0)
/** 发布页 URL 参数：展示页「发布」按钮传入的皮肤系列筛选。 */
const createSeries = useSearchParam<string>("series", "")

/** 拥有可染色皮肤的角色列表，数据来自本地游戏数据（importdata 生成）。 */
const characters = computed(() => {
    const charIds = new Set(skinData.filter(skin => skin.id !== skin.charId).map(skin => skin.charId))
    return charData.filter(character => charIds.has(character.id))
})

/** 当前角色的可染色皮肤列表（排除与角色同 ID 的默认衣饰）。 */
const characterSkins = computed(() => skinData.filter(skin => skin.charId === selectedCharacterId.value && skin.id !== skin.charId))

const selectedSkin = computed(() => characterSkins.value.find(skin => skin.id === selectedSkinId.value))

/** 当前编辑中的部件对象。 */
const activePart = computed(() => skinColorizeParts.find(part => part.id === activePartId.value))

/** 按染剂（ResourceID）聚合的色板分组，一行一个染剂。 */
const dyeGroups = computed(() => {
    const groups: { resourceId: number; name: string; swatches: SkinColorizeSwatch[] }[] = []
    for (const swatch of skinColorizeSwatches) {
        let group = groups.find(item => item.resourceId === swatch.resourceId)
        if (!group) {
            group = { resourceId: swatch.resourceId, name: swatch.name, swatches: [] }
            groups.push(group)
        }
        group.swatches.push(swatch)
    }
    return groups
})

/** 当前方案需要的染剂资源统计（按 ResourceID 聚合数量）。 */
const requiredResources = computed(() => {
    const counts = new Map<number, number>()
    for (const colorId of selectedColorIds.value) {
        if (!colorId) continue
        const swatch = skinColorizeSwatches.find(item => item.id === colorId)
        if (!swatch) continue
        counts.set(swatch.resourceId, (counts.get(swatch.resourceId) || 0) + 1)
    }
    return [...counts.entries()].map(([resourceId, count]) => ({ resourceId, count }))
})

const selectedCode = computed(() => {
    if (!selectedSkin.value) return ""
    return encodeSkinColorizeCode({ type: "Char", skinId: selectedSkin.value.id, colorIds: selectedColorIds.value })
})

/** 新建模式下标题编辑框的默认值（随皮肤变化）。 */
const defaultPlanTitle = computed(() => (selectedSkin.value ? `${selectedSkin.value.name}染色` : ""))

/** 初始化当前角色、皮肤和所有部件的默认色。 */
function resetSelection() {
    const character = characters.value[0]
    selectedCharacterId.value = character?.id
    selectedSkinId.value = character ? characterSkins.value[0]?.id : undefined
    selectedColorIds.value = Array.from({ length: skinColorizeMaxColorParts }, () => 0)
    activePartId.value = 1
    editTitle.value = ""
    editDesc.value = ""
}

/** 应用发布页 URL 中携带的筛选（角色或皮肤系列），预选角色与皮肤。 */
function applyCreateFilters() {
    if (!isCreateMode.value) return
    if (createCharId.value) {
        const character = characters.value.find(item => item.id === createCharId.value)
        if (character) selectCharacter(character.id)
    }
    if (createSeries.value) {
        const skin = skinData.find(item => item.name === createSeries.value && item.id !== item.charId)
        if (skin) {
            selectCharacter(skin.charId)
            selectSkin(skin.id)
        }
    }
}

/** 切换角色并选择该角色的第一套皮肤。 */
function selectCharacter(characterId: number) {
    selectedCharacterId.value = characterId
    selectedSkinId.value = characterSkins.value[0]?.id
    selectedColorIds.value = Array.from({ length: skinColorizeMaxColorParts }, () => 0)
}

/** 切换皮肤并清空不应跨皮肤复用的染色方案。 */
function selectSkin(skinId: number) {
    selectedSkinId.value = skinId
    selectedColorIds.value = Array.from({ length: skinColorizeMaxColorParts }, () => 0)
}

/** 修改一个游戏部件序号对应的色板 ID。 */
function selectColor(partId: number, colorId: number) {
    selectedColorIds.value = selectedColorIds.value.map((value, index) => (index + 1 === partId ? colorId : value))
}

/** 获取当前部件的色板 ID，0 表示游戏导出码中的默认色。 */
function currentColorId(partId: number): number {
    return selectedColorIds.value[partId - 1] || 0
}

/** 获取当前部件选中的色板对象，默认色返回空。 */
function currentSwatch(partId: number): SkinColorizeSwatch | undefined {
    const colorId = currentColorId(partId)
    if (!colorId) return undefined
    return skinColorizeSwatches.find(swatch => swatch.id === colorId)
}

/** 判断某个色板是否可用于当前编辑中的部件。 */
function isSwatchValidForActivePart(swatch: SkinColorizeSwatch) {
    if (!activePart.value?.colorIds?.length) return true
    return activePart.value.colorIds.includes(swatch.id)
}

/** 将色板应用到当前编辑中的部件。 */
function applyColorToActivePart(swatch: SkinColorizeSwatch) {
    if (!isSwatchValidForActivePart(swatch)) {
        ui.showErrorMessage("该部位不能使用此染剂")
        return
    }
    selectColor(activePartId.value, swatch.id)
}

/** 将当前编辑中的部件恢复为默认色。 */
function resetActivePartColor() {
    selectColor(activePartId.value, 0)
}

/** 校验并应用一张用户选择的图片作为预览图。 */
function handlePreviewFile(file: File) {
    if (!file.type.startsWith("image/")) {
        ui.showErrorMessage("只支持图片格式")
        return
    }
    if (file.size > 3 * 1024 * 1024) {
        ui.showErrorMessage("图片大小不能超过 3MB")
        return
    }
    if (previewImage.value.startsWith("blob:")) URL.revokeObjectURL(previewImage.value)
    previewImage.value = URL.createObjectURL(file)
    previewFile.value = file
    uploadedImageUrl.value = ""
}

/** 文件选择框变更处理。 */
function handleFileInput(event: Event) {
    const target = event.target as HTMLInputElement
    if (target.files?.[0]) handlePreviewFile(target.files[0])
    target.value = ""
}

/** 拖拽松手处理。 */
function handleDrop(event: DragEvent) {
    dragging.value = false
    const file = event.dataTransfer?.files?.[0]
    if (file) handlePreviewFile(file)
}

/** 移除用户上传的预览图。 */
function clearPreviewImage() {
    if (previewImage.value.startsWith("blob:")) URL.revokeObjectURL(previewImage.value)
    previewImage.value = ""
    previewFile.value = undefined
    uploadedImageUrl.value = ""
}

/**
 * @description 将本地预览图上传到服务器，返回可分享的图片 URL。
 * @returns 图片 URL，上传失败时返回空字符串。
 */
async function uploadPreviewImage(): Promise<string> {
    if (uploadedImageUrl.value) return uploadedImageUrl.value
    if (!previewFile.value) return ""
    const formData = new FormData()
    formData.append("file", previewFile.value)
    try {
        const response = await fetch(`${env.apiEndpoint}/api/upload/image`, {
            method: "POST",
            body: formData,
        })
        if (!response.ok) return ""
        const result = await response.json()
        if (result.success && result.url) {
            uploadedImageUrl.value = result.url
            return result.url
        }
        ui.showErrorMessage(result.error || "图片上传失败")
    } catch (error) {
        console.error("上传预览图失败:", error)
        ui.showErrorMessage("图片上传失败")
    }
    return ""
}

/** 应用一套染色方案到当前页面。 */
function applyDyePlan(plan: DyePlan) {
    if (plan.type !== "Char") {
        ui.showErrorMessage("当前页面只支持角色皮肤染色方案")
        return
    }
    const skin = skinData.find(item => item.id === plan.skinId)
    if (!skin) {
        ui.showErrorMessage("该方案对应的皮肤不在当前数据中")
        return
    }
    if (plan.colorIds.length > skinColorizeMaxColorParts) {
        ui.showErrorMessage("染色部件数量超出游戏上限")
        return
    }
    const validIds = new Set(skinColorizeSwatches.map(swatch => swatch.id))
    if (plan.colorIds.some(colorId => colorId !== 0 && !validIds.has(colorId))) {
        ui.showErrorMessage("该方案包含当前版本不存在的色板")
        return
    }
    selectedCharacterId.value = skin.charId
    selectedSkinId.value = plan.skinId
    selectedColorIds.value = Array.from({ length: skinColorizeMaxColorParts }, (_, index) => plan.colorIds[index] || 0)
    activePartId.value = 1
    editTitle.value = plan.title
    editDesc.value = plan.desc || ""
    if (previewImage.value.startsWith("blob:")) URL.revokeObjectURL(previewImage.value)
    previewImage.value = plan.imageUrl || ""
    previewFile.value = undefined
    uploadedImageUrl.value = plan.imageUrl || ""
    loadedPlan.value = plan
}

/** 从服务器加载一份染色方案。 */
async function loadDyePlan(id: string) {
    planLoading.value = true
    try {
        const plan = await dyePlanQuery({ id })
        if (!plan) {
            ui.showErrorMessage("染色方案不存在")
            return
        }
        applyDyePlan(plan)
    } catch (error) {
        ui.showErrorMessage("加载染色方案失败", error instanceof Error ? error.message : String(error))
    } finally {
        planLoading.value = false
    }
}

/** 打开分享弹窗并初始化表单（新建模式）。 */
function openShareModal() {
    if (!selectedSkin.value) return
    if (!user.id) {
        ui.showErrorMessage("请先登录后再分享")
        return
    }
    shareIsOriginal.value = true
    shareSource.value = ""
    shareShow.value = true
}

/** 确认分享当前染色方案（新建模式），成功后跳转到方案详情页。 */
async function confirmShare() {
    if (!selectedSkin.value || sharing.value) return
    if (!shareIsOriginal.value && !shareSource.value.trim()) {
        ui.showErrorMessage("转载必须标注来源链接或作者名称")
        return
    }
    sharing.value = true
    try {
        const imageUrl = await uploadPreviewImage()
        const result = await createDyePlanMutation({
            input: {
                title: editTitle.value.trim() || defaultPlanTitle.value,
                desc: editDesc.value.trim() || undefined,
                type: "Char",
                skinId: selectedSkin.value.id,
                colorIds: selectedColorIds.value,
                imageUrl: imageUrl || undefined,
                isOriginal: shareIsOriginal.value,
                source: shareIsOriginal.value ? undefined : shareSource.value.trim(),
            },
        })
        if (result?.id) {
            shareShow.value = false
            ui.showSuccessMessage("染色方案已发布")
            await router.replace(`/skin-colorize/${result.id}`)
        }
    } catch (error) {
        ui.showErrorMessage("发布失败", error instanceof Error ? error.message : String(error))
    } finally {
        sharing.value = false
    }
}

/** 保存当前染色方案（编辑模式），仅作者或管理员可操作。 */
async function savePlan() {
    if (!loadedPlan.value || !selectedSkin.value || saving.value) return
    if (!canEdit.value) {
        ui.showErrorMessage("仅作者可编辑此方案")
        return
    }
    saving.value = true
    try {
        const result = await updateDyePlanMutation({
            id: loadedPlan.value.id,
            input: {
                title: editTitle.value.trim() || loadedPlan.value.title,
                desc: editDesc.value.trim() || undefined,
                type: "Char",
                skinId: selectedSkin.value.id,
                colorIds: selectedColorIds.value,
                imageUrl: uploadedImageUrl.value || undefined,
                isOriginal: loadedPlan.value.isOriginal,
                source: loadedPlan.value.isOriginal ? undefined : loadedPlan.value.source,
            },
        })
        if (result?.id) {
            loadedPlan.value = {
                ...loadedPlan.value,
                title: editTitle.value.trim() || loadedPlan.value.title,
                desc: editDesc.value.trim() || undefined,
                skinId: selectedSkin.value.id,
                colorIds: [...selectedColorIds.value],
                imageUrl: uploadedImageUrl.value || loadedPlan.value.imageUrl,
                updateAt: Date.now(),
            }
            ui.showSuccessMessage("染色方案已保存")
        }
    } catch (error) {
        ui.showErrorMessage("保存失败", error instanceof Error ? error.message : String(error))
    } finally {
        saving.value = false
    }
}

/** 上传新的预览图并更新方案（编辑模式）。 */
async function uploadPreview() {
    if (!loadedPlan.value || !selectedSkin.value || uploading.value) return
    if (!canEdit.value) {
        ui.showErrorMessage("仅作者可编辑此方案")
        return
    }
    if (!previewFile.value) {
        ui.showErrorMessage("请先选择新的预览图")
        return
    }
    uploading.value = true
    try {
        const imageUrl = await uploadPreviewImage()
        if (!imageUrl) return
        const result = await updateDyePlanMutation({
            id: loadedPlan.value.id,
            input: {
                title: editTitle.value.trim() || loadedPlan.value.title,
                desc: editDesc.value.trim() || undefined,
                type: "Char",
                skinId: selectedSkin.value.id,
                colorIds: selectedColorIds.value,
                imageUrl,
                isOriginal: loadedPlan.value.isOriginal,
                source: loadedPlan.value.isOriginal ? undefined : loadedPlan.value.source,
            },
        })
        if (result?.id) {
            loadedPlan.value = {
                ...loadedPlan.value,
                imageUrl,
                title: editTitle.value.trim() || loadedPlan.value.title,
                desc: editDesc.value.trim() || undefined,
            }
            previewImage.value = imageUrl
            uploadedImageUrl.value = imageUrl
            ui.showSuccessMessage("预览图已更新")
        }
    } catch (error) {
        ui.showErrorMessage("上传失败", error instanceof Error ? error.message : String(error))
    } finally {
        uploading.value = false
    }
}

/** 删除当前方案并返回列表页。 */
async function removePlan() {
    if (!loadedPlan.value) return
    if (!confirm(`确定删除「${loadedPlan.value.title}」吗？`)) return
    try {
        await deleteDyePlanMutation({ id: loadedPlan.value.id })
        ui.showSuccessMessage("已删除")
        await router.replace("/skin-colorize")
    } catch (error) {
        ui.showErrorMessage("删除失败", error instanceof Error ? error.message : String(error))
    }
}

/** 点赞 / 取消点赞当前方案。 */
async function toggleLike() {
    if (!loadedPlan.value) return
    if (!user.id) {
        ui.showErrorMessage("请先登录")
        return
    }
    if (loadedPlan.value.isLiked) {
        await unlikeDyePlanMutation({ id: loadedPlan.value.id })
    } else {
        await likeDyePlanMutation({ id: loadedPlan.value.id })
    }
    void loadDyePlan(loadedPlan.value.id)
}

/** 将当前社区码复制到系统剪贴板。 */
async function copyCode() {
    if (!selectedCode.value) return
    await copyText(selectedCode.value)
    ui.showSuccessMessage("染色码已复制")
}

/** 从系统剪贴板读取社区码，并验证皮肤和色板存在。 */
async function importCode() {
    try {
        const imported = decodeSkinColorizeCode(await navigator.clipboard.readText())
        if (imported.type !== "Char") throw new Error("当前页面只支持角色皮肤染色码")
        const skin = skinData.find(item => item.id === imported.skinId)
        if (!skin) throw new Error("数据中不存在该皮肤")
        if (imported.colorIds.length > skinColorizeMaxColorParts) throw new Error("染色部件数量超出游戏上限")
        const validIds = new Set(skinColorizeSwatches.map(swatch => swatch.id))
        if (imported.colorIds.some(colorId => colorId !== 0 && !validIds.has(colorId))) throw new Error("染色码包含当前版本不存在的色板")
        selectedCharacterId.value = skin.charId
        selectedSkinId.value = imported.skinId
        selectedColorIds.value = Array.from({ length: skinColorizeMaxColorParts }, (_, index) => imported.colorIds[index] || 0)
        activePartId.value = 1
        ui.showSuccessMessage("染色码已导入")
    } catch (error) {
        ui.showErrorMessage(error instanceof Error ? error.message : String(error))
    }
}

/** 评论区数量变化时同步到当前方案。 */
function onCommentCount(count: number) {
    if (loadedPlan.value) {
        loadedPlan.value = { ...loadedPlan.value, commentsCount: count }
    }
}

/** 监听全局粘贴事件，方便直接粘贴游戏截图。 */
function onWindowPaste(event: ClipboardEvent) {
    const target = event.target as HTMLElement
    if (target.closest("input, textarea, [contenteditable]")) return
    const file = event.clipboardData?.files?.[0]
    if (file) handlePreviewFile(file)
}

onMounted(async () => {
    window.addEventListener("paste", onWindowPaste)
    resetSelection()
    applyCreateFilters()
    if (sharePlanId.value) await loadDyePlan(sharePlanId.value)
})

watch(
    () => route.params.planId,
    () => {
        resetSelection()
        applyCreateFilters()
        if (sharePlanId.value) void loadDyePlan(sharePlanId.value)
    }
)

onBeforeUnmount(() => {
    window.removeEventListener("paste", onWindowPaste)
    if (previewImage.value.startsWith("blob:")) URL.revokeObjectURL(previewImage.value)
})
</script>

<template>
    <div class="flex h-full min-h-0 w-full flex-col">
        <div class="min-h-0 flex-1 overflow-auto p-4">
            <div v-if="!characters.length" class="flex h-full items-center justify-center text-sm opacity-60">暂无角色染色数据</div>
            <div v-else class="mx-auto grid max-w-6xl items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
                <!-- 左列：平铺发布/展示区 -->
                <div class="min-w-0 overflow-hidden rounded-xl bg-base-100 shadow-sm">
                    <!-- 标题 / 描述 / 作者时间 -->
                    <div class="p-4 sm:p-5">
                        <div v-if="planLoading" class="py-6 text-center text-sm opacity-60">加载中...</div>
                        <template v-else>
                            <!-- 新建模式：直接编辑标题与描述 -->
                            <template v-if="isCreateMode">
                                <input
                                    id="plan-title"
                                    v-model="editTitle"
                                    type="text"
                                    class="w-full bg-transparent text-xl font-bold outline-none placeholder:text-base-content/40"
                                    maxlength="100"
                                    :placeholder="defaultPlanTitle || '填写标题'"
                                />
                                <textarea
                                    id="plan-desc"
                                    v-model="editDesc"
                                    class="mt-2 w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-base-content/40"
                                    rows="2"
                                    maxlength="500"
                                    placeholder="补充描述（可选）"
                                />
                                <div v-if="selectedSkin" class="mt-2 text-xs opacity-60">{{ selectedSkin.name }} · 新方案</div>
                            </template>
                            <!-- 编辑模式 -->
                            <template v-else-if="loadedPlan">
                                <div class="flex flex-wrap items-center gap-2">
                                    <span
                                        class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
                                        :class="loadedPlan.isOriginal ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'"
                                    >
                                        {{ loadedPlan.isOriginal ? "原创" : "转载" }}
                                    </span>
                                    <input
                                        v-if="canEdit"
                                        v-model="editTitle"
                                        type="text"
                                        class="min-w-0 flex-1 bg-transparent text-lg font-bold outline-none placeholder:text-base-content/40"
                                        maxlength="100"
                                        placeholder="请输入标题"
                                    />
                                    <h2 v-else class="min-w-0 flex-1 text-lg font-bold leading-snug">{{ loadedPlan.title }}</h2>
                                    <button
                                        v-if="loadedPlan.userId === user.id || user.isAdmin"
                                        class="btn btn-ghost btn-sm shrink-0 text-error"
                                        type="button"
                                        @click="removePlan"
                                    >
                                        删除
                                    </button>
                                </div>
                                <textarea
                                    v-if="canEdit"
                                    v-model="editDesc"
                                    class="mt-2 w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-base-content/40"
                                    rows="2"
                                    maxlength="2000"
                                    placeholder="可选：染色思路、搭配说明等"
                                />
                                <div v-else-if="loadedPlan.desc" class="mt-2 whitespace-pre-wrap text-sm leading-relaxed opacity-80">
                                    {{ loadedPlan.desc }}
                                </div>
                                <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs opacity-60">
                                    <span class="flex items-center gap-1.5">
                                        <span class="flex h-5 w-5 items-center justify-center rounded-full bg-base-300 text-[10px]">
                                            {{ (loadedPlan.user?.name || "?")[0] }}
                                        </span>
                                        <span class="font-medium">{{ loadedPlan.user?.name || "匿名" }}</span>
                                    </span>
                                    <span>{{ formatRelativeTime(loadedPlan.createdAt, i18next.language) }}</span>
                                    <span><Icon icon="ri:eye-line" class="align-[-2px]" /> {{ loadedPlan.views }} 浏览</span>
                                    <button
                                        class="flex items-center gap-1 transition-colors hover:opacity-80"
                                        :class="loadedPlan.isLiked ? 'text-error' : ''"
                                        type="button"
                                        @click="toggleLike"
                                    >
                                        <Icon :icon="loadedPlan.isLiked ? 'ri:heart-fill' : 'ri:heart-line'" class="align-[-2px]" />
                                        {{ loadedPlan.likes }} 点赞
                                    </button>
                                    <span><Icon icon="ri:message-2-line" class="align-[-2px]" /> {{ loadedPlan.commentsCount }} 评论</span>
                                </div>
                                <div v-if="!loadedPlan.isOriginal && loadedPlan.source" class="mt-1.5 text-xs opacity-60">
                                    来源：{{ loadedPlan.source }}
                                </div>
                            </template>
                            <div v-else class="py-6 text-center text-sm opacity-60">染色方案不存在</div>
                        </template>
                    </div>

                    <!-- 预览图 -->
                    <div class="border-t border-base-200 p-4 sm:p-5">
                        <div class="mb-2 flex items-center justify-between">
                            <span class="text-sm font-medium">预览图</span>
                            <div v-if="canEdit" class="flex items-center gap-1">
                                <button class="btn btn-ghost btn-xs" type="button" @click="fileInputRef?.click()">选择图片</button>
                                <button v-if="previewImage" class="btn btn-ghost btn-xs" type="button" @click="clearPreviewImage">
                                    移除
                                </button>
                            </div>
                        </div>
                        <div
                            class="relative flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-dashed border-base-300 bg-base-200/40"
                            @dragover.prevent="dragging = true"
                            @dragleave.prevent="dragging = false"
                            @drop.prevent="handleDrop"
                        >
                            <img v-if="previewImage" :src="previewImage" alt="预览图" class="h-full w-full object-contain" />
                            <div v-else class="flex flex-col items-center gap-2 px-4 text-center text-sm opacity-60">
                                <span>以游戏内截图作为预览图</span>
                                <span class="text-xs">支持拖拽、粘贴（截图）或点击选择</span>
                                <button class="btn btn-ghost btn-sm mt-1" type="button" @click="fileInputRef?.click()">选择图片</button>
                            </div>
                            <input ref="fileInputRef" type="file" accept="image/*" class="hidden" @change="handleFileInput" />
                            <div
                                v-if="dragging"
                                class="pointer-events-none absolute inset-0 flex items-center justify-center border-2 border-dashed border-primary bg-primary/10 text-sm"
                            >
                                松开以使用该图片
                            </div>
                        </div>
                    </div>

                    <!-- 颜色代码 -->
                    <div class="border-t border-base-200 p-4 sm:p-5">
                        <div class="mb-2 flex items-center justify-between">
                            <span class="text-sm font-medium">染色码</span>
                            <div class="flex items-center gap-1">
                                <button class="btn btn-ghost btn-xs" type="button" :disabled="!selectedCode" @click="copyCode">复制</button>
                                <button class="btn btn-ghost btn-xs" type="button" @click="importCode">导入</button>
                            </div>
                        </div>
                        <code class="block overflow-x-auto rounded-lg bg-base-200 px-3 py-2 text-center font-mono text-lg tracking-widest">
                            {{ selectedCode || "请先选择角色与皮肤" }}
                        </code>
                    </div>

                    <!-- 颜色预览 & 所需资源 -->
                    <div class="border-t border-base-200 p-4 sm:p-5">
                        <div class="mb-3 text-sm font-medium">颜色预览</div>
                        <div class="flex flex-wrap gap-1.5">
                            <div
                                v-for="part in skinColorizeParts"
                                :key="part.id"
                                class="flex items-center gap-1.5 rounded-lg border border-base-300 px-2 py-1 text-xs"
                                :class="activePartId === part.id ? 'border-primary ring-1 ring-primary' : ''"
                                :title="currentSwatch(part.id)?.name || '默认'"
                                @click="activePartId = part.id"
                            >
                                <span
                                    class="h-3.5 w-3.5 rounded-full border border-base-content/20"
                                    :style="{
                                        backgroundColor: currentSwatch(part.id)
                                            ? formatSkinColorizeRgb(currentSwatch(part.id)!.rgb)
                                            : 'transparent',
                                    }"
                                />
                                <span class="opacity-70">部位 {{ part.id }}</span>
                                <span class="font-mono opacity-60">{{ currentColorId(part.id) || "默认" }}</span>
                            </div>
                        </div>

                        <div class="mt-4 border-t border-base-200 pt-4">
                            <div class="mb-2 text-sm font-medium">所需资源</div>
                            <div v-if="requiredResources.length" class="flex flex-col gap-2">
                                <ResourceCostItem
                                    v-for="resource in requiredResources"
                                    :key="resource.resourceId"
                                    :name="'染剂'"
                                    :value="[resource.count, resource.resourceId, 'Resource']"
                                />
                            </div>
                            <div v-else class="text-xs opacity-60">默认配色，无需染剂</div>
                        </div>
                    </div>

                    <!-- 评论区 -->
                    <div v-if="!isCreateMode && loadedPlan" class="border-t border-base-200 p-4 sm:p-5">
                        <CommentSection :target-id="`dp_${loadedPlan.id}`" @count="onCommentCount" />
                    </div>
                </div>

                <!-- 右列：颜色选择器详情 -->
                <aside class="min-w-0 rounded-xl bg-base-100 p-4 shadow-sm sm:p-5 lg:sticky lg:top-4">
                    <div class="mb-3 flex items-center justify-between">
                        <span class="text-sm font-medium">颜色选择器</span>
                        <span v-if="!canEdit" class="text-[10px] opacity-50">仅作者可保存修改</span>
                    </div>

                    <!-- 角色 / 皮肤选择（新建或可编辑时展示） -->
                    <template v-if="canEdit">
                        <div class="mb-2 flex max-h-40 flex-wrap gap-1 overflow-y-auto">
                            <button
                                v-for="character in characters"
                                :key="character.id"
                                class="rounded-full border border-base-300 px-2.5 py-1 text-xs transition-colors"
                                :class="
                                    character.id === selectedCharacterId
                                        ? 'border-primary bg-primary text-primary-content'
                                        : 'hover:bg-base-200'
                                "
                                type="button"
                                @click="selectCharacter(character.id)"
                            >
                                {{ character.名称 }}
                            </button>
                        </div>
                        <select
                            class="select select-bordered select-sm mb-3 w-full"
                            :value="selectedSkinId"
                            @change="selectSkin(Number(($event.target as HTMLSelectElement).value))"
                        >
                            <option v-for="skin in characterSkins" :key="skin.id" :value="skin.id">{{ skin.name }}</option>
                        </select>
                    </template>

                    <!-- 部位选择 -->
                    <div class="mb-2 flex items-center justify-between">
                        <span class="text-xs opacity-60">当前部位</span>
                        <button class="btn btn-ghost btn-xs" type="button" @click="resetActivePartColor">恢复默认色</button>
                    </div>
                    <div class="mb-3 flex flex-wrap gap-1.5">
                        <button
                            v-for="part in skinColorizeParts"
                            :key="part.id"
                            class="flex items-center gap-1 rounded-full border px-2 py-1 text-xs"
                            :class="
                                activePartId === part.id ? 'border-primary bg-primary/10 text-primary' : 'border-base-300 hover:bg-base-200'
                            "
                            type="button"
                            @click="activePartId = part.id"
                        >
                            <span
                                class="h-3 w-3 rounded-full border border-base-content/20"
                                :style="{
                                    backgroundColor: currentSwatch(part.id)
                                        ? formatSkinColorizeRgb(currentSwatch(part.id)!.rgb)
                                        : 'transparent',
                                }"
                            />
                            {{ part.id }}
                        </button>
                    </div>

                    <!-- 染剂行：图标 + 分割线 + 所属颜色 -->
                    <div class="space-y-1.5">
                        <div
                            v-for="group in dyeGroups"
                            :key="group.resourceId"
                            class="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-base-200/60"
                        >
                            <ResourceCostItem :name="group.name" :value="[1, group.resourceId, 'Resource']" mini class="w-9 shrink-0" />
                            <div class="divider divider-horizontal my-0 mx-0 before:bg-base-300 after:bg-base-300" />
                            <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                                <button
                                    v-for="swatch in group.swatches"
                                    :key="swatch.id"
                                    class="h-6 w-6 rounded-full border-2 border-base-content/20 transition-transform hover:scale-110"
                                    :class="[
                                        currentColorId(activePartId) === swatch.id ? 'ring-2 ring-primary' : '',
                                        isSwatchValidForActivePart(swatch) ? '' : 'cursor-not-allowed opacity-25',
                                    ]"
                                    :style="{ backgroundColor: formatSkinColorizeRgb(swatch.rgb) }"
                                    type="button"
                                    :title="`${swatch.name} #${swatch.id}`"
                                    @click="applyColorToActivePart(swatch)"
                                />
                            </div>
                        </div>
                    </div>

                    <!-- 保存 / 上传 -->
                    <div v-if="canEdit" class="mt-4 flex flex-col gap-2">
                        <button
                            v-if="isCreateMode"
                            class="btn btn-primary w-full rounded-full"
                            type="button"
                            :disabled="!selectedSkin"
                            @click="openShareModal"
                        >
                            发布染色方案
                        </button>
                        <template v-else>
                            <button class="btn btn-primary w-full" type="button" :disabled="saving" @click="savePlan">
                                {{ saving ? "保存中..." : "保存染色" }}
                            </button>
                            <button
                                class="btn btn-outline w-full"
                                type="button"
                                :disabled="uploading || !previewFile"
                                @click="uploadPreview"
                            >
                                {{ uploading ? "上传中..." : "上传新的预览图" }}
                            </button>
                        </template>
                    </div>
                    <div v-else class="mt-4 rounded-lg bg-base-200 px-3 py-2 text-center text-xs opacity-60">
                        此方案由他人发布，仅作者可保存修改
                    </div>
                </aside>
            </div>
        </div>

        <DialogModel v-model="shareShow" @submit="confirmShare" class="bg-base-300">
            <h3 class="text-xl font-bold">发布染色方案</h3>
            <div class="mt-2 text-sm opacity-70">
                标题「{{ editTitle.trim() || defaultPlanTitle }}」<span v-if="editDesc.trim()"> · 含描述</span>
            </div>
            <div class="mt-3">
                <div class="mb-1 text-sm opacity-70">归属标注</div>
                <div class="flex gap-4">
                    <label class="flex cursor-pointer items-center gap-1.5 text-sm">
                        <input v-model="shareIsOriginal" type="radio" name="share-origin" class="radio radio-sm" :value="true" />
                        原创
                    </label>
                    <label class="flex cursor-pointer items-center gap-1.5 text-sm">
                        <input v-model="shareIsOriginal" type="radio" name="share-origin" class="radio radio-sm" :value="false" />
                        转载
                    </label>
                </div>
                <div v-if="!shareIsOriginal" class="mt-2">
                    <label class="label" for="share-source">
                        <span class="label-text">来源链接或作者名称（必填）</span>
                    </label>
                    <input
                        id="share-source"
                        v-model="shareSource"
                        type="text"
                        class="input input-bordered w-full"
                        maxlength="500"
                        placeholder="例如：https://xxx / @作者名"
                    />
                </div>
            </div>
            <div v-if="previewImage" class="mt-2">
                <div class="mb-1 text-sm opacity-70">预览图</div>
                <img :src="previewImage" alt="预览图" class="max-h-48 rounded object-contain" />
            </div>
            <div v-else class="mt-2 text-xs opacity-60">未上传预览图，发布后将不包含图片。</div>
            <div v-if="sharing" class="mt-2 text-sm opacity-60">正在发布...</div>
        </DialogModel>
    </div>
</template>
