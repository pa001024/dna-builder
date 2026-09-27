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
import { skinColorizeMaxColorParts, skinColorizeMaxHairColorParts, skinColorizeParts, skinColorizeSwatches } from "@/data/d/skin-colorize.data"
import { decodeSkinColorizeCode, encodeSkinColorizeCode, formatSkinColorizeRgb, type SkinColorizeSwatch } from "@/data/skin-colorize"
import { env } from "@/env"
import { useUIStore } from "@/store/ui"
import { useUserStore } from "@/store/user"
import { copyText, pasteText } from "@/util"
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

/** 是否附带可选的发型染色。 */
const includeHair = ref(false)
/** 发型染色目标 ID：无发型替换功能，默认用角色 ID（角色的默认发型），导入/加载发型码时以其为准。 */
const hairTargetId = ref<number>()
/** 发型染色的色板 ID 列表（6 个，0 表示默认色），发型码长度与皮肤码不同。 */
const hairColorIds = ref<number[]>(Array.from({ length: skinColorizeMaxHairColorParts }, () => 0))
/** 当前正在编辑的发型部件序号（1~6），发型颜色选择器作用于该部件。 */
const activeHairPartId = ref(1)
/** 皮肤染剂相似色查询弹窗开关。 */
const skinFinderShow = ref(false)
/** 发色染剂相似色查询弹窗开关。 */
const hairFinderShow = ref(false)

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

/** 当前方案需要的染剂资源统计（按 ResourceID 聚合数量，附带发型染色时含发色染剂）。 */
const requiredResources = computed(() => {
    const counts = new Map<number, number>()
    for (const colorId of selectedColorIds.value) {
        if (!colorId) continue
        const swatch = skinColorizeSwatches.find(item => item.id === colorId)
        if (!swatch) continue
        counts.set(swatch.resourceId, (counts.get(swatch.resourceId) || 0) + 1)
    }
    // 发型染色为可选附加项：勾选后其发色染剂同样计入消耗
    if (includeHair.value) {
        for (const colorId of hairColorIds.value) {
            if (!colorId) continue
            const swatch = skinColorizeSwatches.find(item => item.id === colorId)
            if (!swatch) continue
            counts.set(swatch.hairResourceId, (counts.get(swatch.hairResourceId) || 0) + 1)
        }
    }
    return [...counts.entries()].map(([resourceId, count]) => ({ resourceId, count }))
})

const selectedCode = computed(() => {
    if (!selectedSkin.value) return ""
    return encodeSkinColorizeCode({ type: "Char", skinId: selectedSkin.value.id, colorIds: selectedColorIds.value })
})

/** 发型染色部件列表（1~6，全部部件可使用所有色板）。 */
const hairParts = computed(() => Array.from({ length: skinColorizeMaxHairColorParts }, (_, index) => index + 1))

/** 按发色染剂（hairResourceId）聚合的色板分组，发型染色使用。 */
const hairDyeGroups = computed(() => {
    const groups: { resourceId: number; name: string; swatches: SkinColorizeSwatch[] }[] = []
    for (const swatch of skinColorizeSwatches) {
        let group = groups.find(item => item.resourceId === swatch.hairResourceId)
        if (!group) {
            group = { resourceId: swatch.hairResourceId, name: swatch.hairResourceName, swatches: [] }
            groups.push(group)
        }
        group.swatches.push(swatch)
    }
    return groups
})

/** 当前发型染色社区码（H 开头），未勾选或未选角色时为空。 */
const hairCode = computed(() => {
    if (!includeHair.value) return ""
    const targetId = hairTargetId.value || selectedCharacterId.value
    if (!targetId) return ""
    return encodeSkinColorizeCode({ type: "Hair", skinId: targetId, colorIds: hairColorIds.value })
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
    resetHairSelection()
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
    resetHairSelection()
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

/** 重置发型染色状态（跟随角色，发型无替换功能，目标默认用角色 ID）。 */
function resetHairSelection() {
    includeHair.value = false
    hairTargetId.value = undefined
    hairColorIds.value = Array.from({ length: skinColorizeMaxHairColorParts }, () => 0)
    activeHairPartId.value = 1
}

/** 修改一个发型部件序号对应的色板 ID。 */
function selectHairColor(partId: number, colorId: number) {
    hairColorIds.value = hairColorIds.value.map((value, index) => (index + 1 === partId ? colorId : value))
}

/** 获取发型部件当前的色板 ID，0 表示默认色。 */
function currentHairColorId(partId: number): number {
    return hairColorIds.value[partId - 1] || 0
}

/** 获取发型部件当前选中的色板对象，默认色返回空。 */
function currentHairSwatch(partId: number): SkinColorizeSwatch | undefined {
    const colorId = currentHairColorId(partId)
    if (!colorId) return undefined
    return skinColorizeSwatches.find(swatch => swatch.id === colorId)
}

/** 将色板应用到当前编辑中的发型部件（发型色位无限制，可用全部色板）。 */
function applyHairColorToActivePart(swatch: SkinColorizeSwatch) {
    selectHairColor(activeHairPartId.value, swatch.id)
}

/** 将当前编辑中的发型部件恢复为默认色。 */
function resetActiveHairPartColor() {
    selectHairColor(activeHairPartId.value, 0)
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
    if ((plan.colorIds?.length ?? 0) > skinColorizeMaxColorParts) {
        ui.showErrorMessage("染色部件数量超出游戏上限")
        return
    }
    const validIds = new Set(skinColorizeSwatches.map(swatch => swatch.id))
    if (plan.colorIds?.some(colorId => colorId !== 0 && !validIds.has(colorId))) {
        ui.showErrorMessage("该方案包含当前版本不存在的色板")
        return
    }
    selectedCharacterId.value = skin.charId
    selectedSkinId.value = plan.skinId
    selectedColorIds.value = Array.from({ length: skinColorizeMaxColorParts }, (_, index) => plan.colorIds?.[index] || 0)
    activePartId.value = 1
    applyHairFromCode(plan.hairCode)
    editTitle.value = plan.title
    editDesc.value = plan.desc || ""
    if (previewImage.value.startsWith("blob:")) URL.revokeObjectURL(previewImage.value)
    previewImage.value = plan.imageUrl || ""
    previewFile.value = undefined
    uploadedImageUrl.value = plan.imageUrl || ""
    loadedPlan.value = plan
}

/** 应用一段发型染色码到页面（解码出目标 ID 与色板，供颜色选择器回显）。 */
function applyHairFromCode(code?: string) {
    if (!code) {
        resetHairSelection()
        return
    }
    try {
        const decoded = decodeSkinColorizeCode(code)
        if (decoded.type !== "Hair") {
            resetHairSelection()
            return
        }
        includeHair.value = true
        hairTargetId.value = decoded.skinId
        hairColorIds.value = Array.from(
            { length: skinColorizeMaxHairColorParts },
            (_, index) => decoded.colorIds[index] || 0
        )
        activeHairPartId.value = 1
    } catch (error) {
        console.error("解析发型染色码失败:", error)
        resetHairSelection()
    }
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
                hairCode: hairCode.value || undefined,
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
                hairCode: hairCode.value || undefined,
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
                hairCode: hairCode.value || undefined,
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
                hairCode: hairCode.value || undefined,
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
                hairCode: hairCode.value || undefined,
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

/** 将当前发型染色码复制到系统剪贴板。 */
async function copyHairCode() {
    if (!hairCode.value) return
    await copyText(hairCode.value)
    ui.showSuccessMessage("发型染色码已复制")
}

/** 解析并应用一段发型染色码到页面（校验格式、数量与色板存在），失败时抛出错误。 */
function applyHairCode(rawCode: string) {
    const imported = decodeSkinColorizeCode(rawCode)
    if (imported.type !== "Hair") throw new Error("当前内容不是发型染色码")
    if (imported.colorIds.length > skinColorizeMaxHairColorParts) throw new Error("发型染色部件数量超出游戏上限")
    const validIds = new Set(skinColorizeSwatches.map(swatch => swatch.id))
    if (imported.colorIds.some(colorId => colorId !== 0 && !validIds.has(colorId))) {
        throw new Error("发型染色码包含当前版本不存在的色板")
    }
    includeHair.value = true
    hairTargetId.value = imported.skinId
    hairColorIds.value = Array.from({ length: skinColorizeMaxHairColorParts }, (_, index) => imported.colorIds[index] || 0)
    activeHairPartId.value = 1
}

/** 从系统剪贴板导入发型染色码（发型染色区专用入口）。 */
async function importHairCode() {
    try {
        const rawCode = (await pasteText()).trim()
        if (!rawCode) throw new Error("剪贴板为空")
        applyHairCode(rawCode)
        ui.showSuccessMessage("发型染色码已导入")
    } catch (error) {
        ui.showErrorMessage(error instanceof Error ? error.message : String(error))
    }
}

/** 解析并应用一段角色皮肤染色码到页面（校验格式、皮肤存在、数量与色板有效），失败时抛出错误。 */
function applySkinCode(rawCode: string) {
    const imported = decodeSkinColorizeCode(rawCode)
    if (imported.type !== "Char") throw new Error("当前内容不是角色皮肤染色码")
    const skin = skinData.find(item => item.id === imported.skinId)
    if (!skin) throw new Error("数据中不存在该皮肤")
    if (imported.colorIds.length > skinColorizeMaxColorParts) throw new Error("染色部件数量超出游戏上限")
    const validIds = new Set(skinColorizeSwatches.map(swatch => swatch.id))
    if (imported.colorIds.some(colorId => colorId !== 0 && !validIds.has(colorId))) {
        throw new Error("染色码包含当前版本不存在的色板")
    }
    selectedCharacterId.value = skin.charId
    selectedSkinId.value = imported.skinId
    selectedColorIds.value = Array.from({ length: skinColorizeMaxColorParts }, (_, index) => imported.colorIds[index] || 0)
    activePartId.value = 1
}

/** 从系统剪贴板读取社区码：发型码应用到发型染色，皮肤码应用到皮肤。 */
async function importCode() {
    try {
        const rawCode = (await pasteText()).trim()
        if (!rawCode) throw new Error("剪贴板为空")
        const imported = decodeSkinColorizeCode(rawCode)
        if (imported.type === "Hair") {
            applyHairCode(rawCode)
            ui.showSuccessMessage("发型染色码已导入")
            return
        }
        if (imported.type !== "Char") throw new Error("当前页面只支持角色皮肤染色码")
        applySkinCode(rawCode)
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
            <div v-if="!characters.length" class="flex h-full items-center justify-center text-sm text-base-content/50">
                {{ $t('skin-colorize.no_data') }}
            </div>
            <div v-else class="mx-auto grid max-w-7xl items-start gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
                <!-- 左列：方案信息 / 预览图 / 染色码 / 颜色预览 / 消耗 / 评论 -->
                <div class="stagger-rise min-w-0 space-y-4">
                    <!-- 方案信息：标题 / 描述 / 作者与统计 -->
                    <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                        <SectionHeader no-animate compact kicker="PLAN" title="方案信息">
                            <template #trailing>
                                <button
                                    v-if="loadedPlan && (loadedPlan.userId === user.id || user.isAdmin)"
                                    class="inline-flex h-6 shrink-0 cursor-pointer items-center rounded-xs border border-error/40 px-2 text-[11px] text-error transition-colors duration-150 hover:border-error hover:bg-error/10 active:scale-[0.97]"
                                    type="button"
                                    @click="removePlan"
                                >
                                    删除
                                </button>
                            </template>
                        </SectionHeader>

                        <div v-if="planLoading" class="py-6 text-center text-sm text-base-content/50">{{ $t('common.loading') }}</div>
                        <template v-else>
                            <!-- 新建模式：直接编辑标题与描述 -->
                            <template v-if="isCreateMode">
                                <input
                                    id="plan-title"
                                    v-model="editTitle"
                                    type="text"
                                    class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-lg font-semibold text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                                    maxlength="100"
                                    :placeholder="defaultPlanTitle || '填写标题'"
                                />
                                <textarea
                                    id="plan-desc"
                                    v-model="editDesc"
                                    class="mt-2 w-full resize-none rounded-none border-b border-base-content/20 bg-transparent px-0.5 py-1 text-[13px] leading-relaxed text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                                    rows="2"
                                    maxlength="500"
                                    :placeholder="$t('skin-colorize.desc_placeholder')"
                                />
                                <div v-if="selectedSkin" class="mt-2 text-[11px] tracking-wide text-base-content/50">
                                    {{ selectedSkin.name }} · 新方案
                                </div>
                            </template>
                            <!-- 编辑模式 -->
                            <template v-else-if="loadedPlan">
                                <div class="flex flex-wrap items-center gap-2">
                                    <span
                                        class="inline-flex shrink-0 items-center rounded-xs border px-1.5 py-0.5 text-[10px] leading-none"
                                        :class="
                                            loadedPlan.isOriginal
                                                ? 'border-success/40 bg-success/10 text-success'
                                                : 'border-warning/40 bg-warning/10 text-warning'
                                        "
                                    >
                                        {{ loadedPlan.isOriginal ? "原创" : "转载" }}
                                    </span>
                                    <input
                                        v-if="canEdit"
                                        v-model="editTitle"
                                        type="text"
                                        class="min-w-0 flex-1 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-lg font-semibold text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                                        maxlength="100"
                                        placeholder="请输入标题"
                                    />
                                    <h2 v-else class="min-w-0 flex-1 text-lg font-semibold leading-tight">{{ loadedPlan.title }}</h2>
                                </div>
                                <textarea
                                    v-if="canEdit"
                                    v-model="editDesc"
                                    class="mt-2 w-full resize-none rounded-none border-b border-base-content/20 bg-transparent px-0.5 py-1 text-[13px] leading-relaxed text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                                    rows="2"
                                    maxlength="2000"
                                    placeholder="可选：染色思路、搭配说明等"
                                />
                                <div v-else-if="loadedPlan.desc" class="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-base-content/70">
                                    {{ loadedPlan.desc }}
                                </div>
                                <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-base-content/50">
                                    <span class="flex items-center gap-1.5">
                                        <QQAvatar class="w-5" :qq="loadedPlan.user?.qq" />
                                        <span class="font-medium text-base-content/70">{{ loadedPlan.user?.name || "匿名" }}</span>
                                    </span>
                                    <span class="tabular-nums">{{ formatRelativeTime(loadedPlan.createdAt, i18next.language) }}</span>
                                    <span class="flex items-center gap-1">
                                        <Icon icon="ri:eye-line" class="size-3.5 shrink-0" />{{ loadedPlan.views }} 浏览
                                    </span>
                                    <button
                                        class="flex cursor-pointer items-center gap-1 transition-colors duration-150 hover:text-primary"
                                        :class="loadedPlan.isLiked ? 'text-error' : ''"
                                        type="button"
                                        @click="toggleLike"
                                    >
                                        <Icon :icon="loadedPlan.isLiked ? 'ri:heart-fill' : 'ri:heart-line'" class="size-3.5 shrink-0" />
                                        {{ loadedPlan.likes }} 点赞
                                    </button>
                                    <span class="flex items-center gap-1">
                                        <Icon icon="ri:message-2-line" class="size-3.5 shrink-0" />{{ loadedPlan.commentsCount }} 评论
                                    </span>
                                </div>
                                <div v-if="!loadedPlan.isOriginal && loadedPlan.source" class="mt-1.5 text-[11px] text-base-content/50">
                                    来源：{{ loadedPlan.source }}
                                </div>
                            </template>
                            <div v-else class="py-6 text-center text-sm text-base-content/50">染色方案不存在</div>
                        </template>
                    </section>

                    <!-- 预览图：选择 / 拖拽 / 粘贴截图 -->
                    <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                        <SectionHeader no-animate compact kicker="PREVIEW" title="预览图">
                            <template #trailing>
                                <div v-if="canEdit" class="flex shrink-0 items-center gap-1.5">
                                    <button
                                        class="inline-flex h-6 shrink-0 cursor-pointer items-center rounded-xs border border-base-content/20 px-2 text-[11px] text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97]"
                                        type="button"
                                        @click="fileInputRef?.click()"
                                    >
                                        选择图片
                                    </button>
                                    <button
                                        v-if="previewImage"
                                        class="inline-flex h-6 shrink-0 cursor-pointer items-center rounded-xs border border-base-content/20 px-2 text-[11px] text-base-content/60 transition-colors duration-150 hover:border-error/60 hover:text-error active:scale-[0.97]"
                                        type="button"
                                        @click="clearPreviewImage"
                                    >
                                        移除
                                    </button>
                                </div>
                            </template>
                        </SectionHeader>

                        <div
                            class="relative flex aspect-video items-center justify-center overflow-hidden rounded-xs border border-dashed border-base-content/20 bg-base-content/3"
                            @dragover.prevent="dragging = true"
                            @dragleave.prevent="dragging = false"
                            @drop.prevent="handleDrop"
                        >
                            <img v-if="previewImage" :src="previewImage" alt="预览图" class="h-full w-full object-contain" />
                            <div v-else class="flex flex-col items-center gap-2 px-4 text-center text-sm text-base-content/50">
                                <span>以游戏内截图作为预览图</span>
                                <span class="text-xs">支持拖拽、粘贴（截图）或点击选择</span>
                                <button
                                    class="mt-1 inline-flex h-6 shrink-0 cursor-pointer items-center rounded-xs border border-base-content/20 px-2 text-[11px] text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97]"
                                    type="button"
                                    @click="fileInputRef?.click()"
                                >
                                    选择图片
                                </button>
                            </div>
                            <input ref="fileInputRef" type="file" accept="image/*" class="hidden" @change="handleFileInput" />
                            <div
                                v-if="dragging"
                                class="pointer-events-none absolute inset-0 flex items-center justify-center border-2 border-dashed border-primary bg-primary/10 text-sm"
                            >
                                松开以使用该图片
                            </div>
                        </div>
                    </section>

                    <!-- 染色码：皮肤码 / 发型码（可选） -->
                    <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                        <SectionHeader no-animate compact kicker="CODE" title="染色码">
                            <template #trailing>
                                <div class="flex shrink-0 items-center gap-1.5">
                                    <button
                                        class="inline-flex h-6 shrink-0 items-center rounded-xs border px-2 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                                        :class="
                                            selectedCode
                                                ? 'cursor-pointer border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                                : 'cursor-not-allowed border-base-content/10 text-base-content/30'
                                        "
                                        type="button"
                                        :disabled="!selectedCode"
                                        @click="copyCode"
                                    >
                                        复制
                                    </button>
                                    <button
                                        class="inline-flex h-6 shrink-0 cursor-pointer items-center rounded-xs border border-base-content/20 px-2 text-[11px] text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97]"
                                        type="button"
                                        title="读取剪贴板内容"
                                        @click="importCode"
                                    >
                                        导入
                                    </button>
                                </div>
                            </template>
                        </SectionHeader>

                        <code
                            class="block overflow-x-auto rounded-xs border border-base-content/10 bg-base-content/3 px-3 py-2 text-center text-base-content"
                            :class="selectedCode ? 'font-mono text-lg tracking-widest' : 'text-sm text-base-content/45'"
                        >
                            {{ selectedCode || "请先选择角色与皮肤" }}
                        </code>

                        <template v-if="hairCode">
                            <div class="mt-3 flex items-center justify-between gap-2 border-t border-base-content/10 pt-3">
                                <span class="text-xs text-base-content/55">发型染色码</span>
                                <div class="flex shrink-0 items-center gap-1.5">
                                    <button
                                        class="inline-flex h-6 shrink-0 cursor-pointer items-center rounded-xs border border-base-content/20 px-2 text-[11px] text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97]"
                                        type="button"
                                        @click="copyHairCode"
                                    >
                                        复制
                                    </button>
                                    <button
                                        class="inline-flex h-6 shrink-0 cursor-pointer items-center rounded-xs border border-base-content/20 px-2 text-[11px] text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97]"
                                        type="button"
                                        title="读取剪贴板内容"
                                        @click="importHairCode"
                                    >
                                        导入
                                    </button>
                                </div>
                            </div>
                            <code
                                class="mt-1.5 block overflow-x-auto rounded-xs border border-base-content/10 bg-base-content/3 px-3 py-2 text-center font-mono text-lg tracking-widest text-base-content"
                            >
                                {{ hairCode }}
                            </code>
                        </template>
                    </section>

                    <!-- 颜色预览：每个部件当前色板 -->
                    <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                        <SectionHeader no-animate compact kicker="COLORS" title="颜色预览" />
                        <div class="flex flex-wrap gap-1.5">
                            <button
                                v-for="part in skinColorizeParts"
                                :key="part.id"
                                class="flex cursor-pointer items-center gap-1.5 rounded-xs border px-2 py-1 text-xs transition-colors duration-150"
                                :class="
                                    activePartId === part.id
                                        ? 'border-primary/70 bg-primary/10 text-primary'
                                        : 'border-base-content/15 bg-base-content/3 text-base-content/70 hover:border-primary/40'
                                "
                                type="button"
                                :title="currentSwatch(part.id)?.name || '默认'"
                                @click="activePartId = part.id"
                            >
                                <span
                                    class="size-3.5 shrink-0 rounded-xs border border-base-content/20"
                                    :style="{
                                        backgroundColor: currentSwatch(part.id)
                                            ? formatSkinColorizeRgb(currentSwatch(part.id)!.rgb)
                                            : 'transparent',
                                    }"
                                />
                                <span class="tabular-nums text-base-content/55">{{ part.id }}</span>
                                <span class="tabular-nums text-base-content/45">{{ currentColorId(part.id) || "默认" }}</span>
                            </button>
                        </div>

                        <!-- 发型颜色预览（可选） -->
                        <template v-if="includeHair">
                            <div class="mt-3 border-t border-base-content/10 pt-3">
                                <div class="mb-2 text-[11px] tracking-wide text-base-content/55">发型颜色预览</div>
                                <div class="flex flex-wrap gap-1.5">
                                    <button
                                        v-for="partId in hairParts"
                                        :key="partId"
                                        class="flex cursor-pointer items-center gap-1.5 rounded-xs border px-2 py-1 text-xs transition-colors duration-150"
                                        :class="
                                            activeHairPartId === partId
                                                ? 'border-primary/70 bg-primary/10 text-primary'
                                                : 'border-base-content/15 bg-base-content/3 text-base-content/70 hover:border-primary/40'
                                        "
                                        type="button"
                                        :title="currentHairSwatch(partId)?.name || '默认'"
                                        @click="activeHairPartId = partId"
                                    >
                                        <span
                                            class="size-3.5 shrink-0 rounded-xs border border-base-content/20"
                                            :style="{
                                                backgroundColor: currentHairSwatch(partId)
                                                    ? formatSkinColorizeRgb(currentHairSwatch(partId)!.rgb)
                                                    : 'transparent',
                                            }"
                                        />
                                        <span class="tabular-nums text-base-content/55">{{ partId }}</span>
                                        <span class="tabular-nums text-base-content/45">{{ currentHairColorId(partId) || "默认" }}</span>
                                    </button>
                                </div>
                            </div>
                        </template>
                    </section>

                    <!-- 所需资源：按染剂聚合的消耗 -->
                    <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                        <SectionHeader no-animate compact kicker="COST" title="所需资源" :count="requiredResources.length || undefined" />
                        <div v-if="requiredResources.length" class="flex flex-col gap-1.5">
                            <ResourceCostItem
                                v-for="resource in requiredResources"
                                :key="resource.resourceId"
                                :name="'染剂'"
                                :value="[resource.count, resource.resourceId, 'Resource']"
                            />
                        </div>
                        <div v-else class="text-xs text-base-content/45">默认配色，无需染剂</div>
                    </section>

                    <!-- 评论区 -->
                    <section
                        v-if="!isCreateMode && loadedPlan"
                        class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
                    >
                        <CommentSection :target-id="`dp_${loadedPlan.id}`" @count="onCommentCount" />
                    </section>
                </div>

                <!-- 右列：颜色选择器 / 发型染色 / 保存 -->
                <aside class="stagger-rise min-w-0 space-y-4 lg:sticky lg:top-4">
                    <!-- 颜色选择器 -->
                    <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                        <SectionHeader no-animate compact kicker="PALETTE" title="颜色选择器">
                            <template #trailing>
                                <span v-if="!canEdit" class="shrink-0 text-[11px] text-base-content/45">仅作者可保存修改</span>
                            </template>
                        </SectionHeader>

                        <!-- 角色 / 皮肤选择（新建或可编辑时展示） -->
                        <template v-if="canEdit">
                            <div class="mb-2 flex max-h-40 flex-wrap gap-1 overflow-y-auto rounded-xs border border-base-content/10 bg-base-content/3 p-2">
                                <button
                                    v-for="character in characters"
                                    :key="character.id"
                                    class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                                    :class="
                                        character.id === selectedCharacterId
                                            ? 'border-primary bg-primary font-semibold text-primary-content'
                                            : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                    "
                                    type="button"
                                    @click="selectCharacter(character.id)"
                                >
                                    {{ character.名称 }}
                                </button>
                            </div>
                            <Select
                                class="mb-3 w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                                :model-value="selectedSkinId"
                                @update:model-value="selectSkin"
                            >
                                <SelectItem v-for="skin in characterSkins" :key="skin.id" :value="skin.id">{{ skin.name }}</SelectItem>
                            </Select>
                        </template>

                        <!-- 部位选择 -->
                        <div class="mb-2 flex items-center justify-between gap-2">
                            <span class="text-[11px] tracking-wide text-base-content/55">当前部位</span>
                            <div class="flex shrink-0 items-center gap-1.5">
                                <button
                                    class="inline-flex h-6 shrink-0 cursor-pointer items-center rounded-xs border border-base-content/20 px-2 text-[11px] text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97]"
                                    type="button"
                                    @click="skinFinderShow = true"
                                >
                                    相似色
                                </button>
                                <button
                                    class="inline-flex h-6 shrink-0 cursor-pointer items-center rounded-xs border border-base-content/20 px-2 text-[11px] text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97]"
                                    type="button"
                                    @click="resetActivePartColor"
                                >
                                    恢复默认色
                                </button>
                            </div>
                        </div>
                        <div class="mb-3 flex flex-wrap gap-1.5">
                            <button
                                v-for="part in skinColorizeParts"
                                :key="part.id"
                                class="inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                                :class="
                                    activePartId === part.id
                                        ? 'border-primary bg-primary font-semibold text-primary-content'
                                        : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                "
                                type="button"
                                @click="activePartId = part.id"
                            >
                                <span
                                    class="size-3 shrink-0 rounded-xs border border-base-content/20"
                                    :style="{
                                        backgroundColor: currentSwatch(part.id)
                                            ? formatSkinColorizeRgb(currentSwatch(part.id)!.rgb)
                                            : 'transparent',
                                    }"
                                />
                                <span class="tabular-nums">{{ part.id }}</span>
                            </button>
                        </div>

                        <!-- 染剂行：图标 + 分割线 + 所属颜色 -->
                        <div class="space-y-1.5">
                            <div
                                v-for="group in dyeGroups"
                                :key="group.resourceId"
                                class="flex items-center gap-2.5 rounded-xs border border-base-content/10 bg-base-content/3 px-2 py-1.5 transition-colors duration-150 hover:border-primary/30"
                            >
                                <ResourceCostItem :name="group.name" :value="[1, group.resourceId, 'Resource']" mini class="w-9 shrink-0" />
                                <span class="h-6 w-px shrink-0 bg-base-content/10" aria-hidden="true" />
                                <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                                    <button
                                        v-for="swatch in group.swatches"
                                        :key="swatch.id"
                                        class="size-6 shrink-0 rounded-xs border transition-transform duration-150"
                                        :class="[
                                            currentColorId(activePartId) === swatch.id
                                                ? 'border-primary ring-1 ring-primary'
                                                : 'border-base-content/20',
                                            isSwatchValidForActivePart(swatch)
                                                ? 'cursor-pointer hover:scale-110'
                                                : 'cursor-not-allowed opacity-25',
                                        ]"
                                        :style="{ backgroundColor: formatSkinColorizeRgb(swatch.rgb) }"
                                        type="button"
                                        :title="`${swatch.name} #${swatch.id}`"
                                        @click="applyColorToActivePart(swatch)"
                                    />
                                </div>
                            </div>
                        </div>
                    </section>

                    <!-- 发型染色（可选）：勾选后显示发型色位与发色染剂，仅保存代码无需上传图片 -->
                    <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                        <SectionHeader no-animate compact kicker="HAIR" title="发型染色" />
                        <label class="flex cursor-pointer items-center gap-2">
                            <input v-model="includeHair" type="checkbox" class="checkbox checkbox-sm" />
                            <span class="text-[11px] tracking-wide text-base-content/55">附带发型染色</span>
                        </label>

                        <template v-if="includeHair">
                            <div class="mt-3 mb-2 flex items-center justify-between gap-2">
                                <span class="text-[11px] tracking-wide text-base-content/55">发型色位</span>
                                <div class="flex shrink-0 items-center gap-1.5">
                                    <button
                                        class="inline-flex h-6 shrink-0 cursor-pointer items-center rounded-xs border border-base-content/20 px-2 text-[11px] text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97]"
                                        type="button"
                                        @click="hairFinderShow = true"
                                    >
                                        相似色
                                    </button>
                                    <button
                                        class="inline-flex h-6 shrink-0 cursor-pointer items-center rounded-xs border border-base-content/20 px-2 text-[11px] text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97]"
                                        type="button"
                                        @click="resetActiveHairPartColor"
                                    >
                                        恢复默认色
                                    </button>
                                </div>
                            </div>
                            <div class="mb-3 flex flex-wrap gap-1.5">
                                <button
                                    v-for="partId in hairParts"
                                    :key="partId"
                                    class="inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                                    :class="
                                        activeHairPartId === partId
                                            ? 'border-primary bg-primary font-semibold text-primary-content'
                                            : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                    "
                                    type="button"
                                    @click="activeHairPartId = partId"
                                >
                                    <span
                                        class="size-3 shrink-0 rounded-xs border border-base-content/20"
                                        :style="{
                                            backgroundColor: currentHairSwatch(partId)
                                                ? formatSkinColorizeRgb(currentHairSwatch(partId)!.rgb)
                                                : 'transparent',
                                        }"
                                    />
                                    <span class="tabular-nums">{{ partId }}</span>
                                </button>
                            </div>

                            <!-- 发色染剂行：图标 + 分割线 + 所属颜色 -->
                            <div class="space-y-1.5">
                                <div
                                    v-for="group in hairDyeGroups"
                                    :key="group.resourceId"
                                    class="flex items-center gap-2.5 rounded-xs border border-base-content/10 bg-base-content/3 px-2 py-1.5 transition-colors duration-150 hover:border-primary/30"
                                >
                                    <ResourceCostItem :name="group.name" :value="[1, group.resourceId, 'Resource']" mini class="w-9 shrink-0" />
                                    <span class="h-6 w-px shrink-0 bg-base-content/10" aria-hidden="true" />
                                    <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                                        <button
                                            v-for="swatch in group.swatches"
                                            :key="swatch.id"
                                            class="size-6 shrink-0 cursor-pointer rounded-xs border transition-transform duration-150 hover:scale-110"
                                            :class="
                                                currentHairColorId(activeHairPartId) === swatch.id
                                                    ? 'border-primary ring-1 ring-primary'
                                                    : 'border-base-content/20'
                                            "
                                            :style="{ backgroundColor: formatSkinColorizeRgb(swatch.rgb) }"
                                            type="button"
                                            :title="`${swatch.name} #${swatch.id}`"
                                            @click="applyHairColorToActivePart(swatch)"
                                        />
                                    </div>
                                </div>
                            </div>

                            <p class="mt-3 text-[11px] leading-relaxed text-base-content/45">
                                仅保存发型染色码，无需上传图片；染色码以角色默认发型为目标生成。
                            </p>
                        </template>
                    </section>

                    <!-- 保存 / 上传 -->
                    <section v-if="canEdit" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                        <SectionHeader no-animate compact kicker="ACTION" title="方案操作" />
                        <div class="flex flex-col gap-2">
                            <button
                                v-if="isCreateMode"
                                class="inline-flex h-8 w-full items-center justify-center rounded-xs border px-3 text-xs font-semibold transition-colors duration-150 active:scale-[0.98]"
                                :class="
                                    selectedSkin
                                        ? 'cursor-pointer border-primary bg-primary text-primary-content hover:bg-primary/90'
                                        : 'cursor-not-allowed border-base-content/15 text-base-content/30'
                                "
                                type="button"
                                :disabled="!selectedSkin"
                                @click="openShareModal"
                            >
                                发布染色方案
                            </button>
                            <template v-else>
                                <button
                                    class="inline-flex h-8 w-full items-center justify-center rounded-xs border px-3 text-xs font-semibold transition-colors duration-150 active:scale-[0.98]"
                                    :class="
                                        saving
                                            ? 'cursor-not-allowed border-base-content/15 text-base-content/30'
                                            : 'cursor-pointer border-primary bg-primary text-primary-content hover:bg-primary/90'
                                    "
                                    type="button"
                                    :disabled="saving"
                                    @click="savePlan"
                                >
                                    {{ saving ? "保存中..." : "保存染色" }}
                                </button>
                                <button
                                    class="inline-flex h-8 w-full items-center justify-center rounded-xs border px-3 text-xs transition-colors duration-150 active:scale-[0.98]"
                                    :class="
                                        uploading || !previewFile
                                            ? 'cursor-not-allowed border-base-content/15 text-base-content/30'
                                            : 'cursor-pointer border-base-content/20 text-base-content/70 hover:border-primary/60 hover:text-primary'
                                    "
                                    type="button"
                                    :disabled="uploading || !previewFile"
                                    @click="uploadPreview"
                                >
                                    {{ uploading ? "上传中..." : "上传新的预览图" }}
                                </button>
                            </template>
                        </div>
                    </section>
                    <section
                        v-else
                        class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 text-center text-[11px] text-base-content/50 backdrop-blur-sm"
                    >
                        此方案由他人发布，仅作者可保存修改
                    </section>
                </aside>
            </div>
        </div>

        <DialogModel v-model="shareShow" @submit="confirmShare" class="rounded-xs border border-base-content/15 bg-base-100/85 backdrop-blur-md">
            <h3 class="text-xl font-bold">发布染色方案</h3>
            <div class="mt-2 text-sm text-base-content/70">
                标题「{{ editTitle.trim() || defaultPlanTitle }}」<span v-if="editDesc.trim()"> · 含描述</span>
            </div>
            <div class="mt-3">
                <div class="mb-1 text-sm text-base-content/70">归属标注</div>
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
                    <div class="mb-1 text-xs text-base-content/55">来源链接或作者名称（必填）</div>
                    <input
                        id="share-source"
                        v-model="shareSource"
                        type="text"
                        class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                        maxlength="500"
                        placeholder="例如：https://xxx / @作者名"
                    />
                </div>
            </div>
            <div v-if="previewImage" class="mt-2">
                <div class="mb-1 text-sm text-base-content/70">预览图</div>
                <img :src="previewImage" alt="预览图" class="max-h-48 rounded-xs object-contain" />
            </div>
            <div v-else class="mt-2 text-xs text-base-content/50">未上传预览图，发布后将不包含图片。</div>
            <div v-if="hairCode" class="mt-2 text-sm text-base-content/70">
                发型染色码：<code class="font-mono">{{ hairCode }}</code>
            </div>
            <div v-if="sharing" class="mt-2 text-sm text-base-content/50">正在发布...</div>
        </DialogModel>

        <!-- 相似色查询：按目标颜色的 ΔE 从近到远列出可用染剂 -->
        <SkinColorizeColorFinder
            v-model="skinFinderShow"
            :part-label="`部位 ${activePartId}`"
            :current-color-id="currentColorId(activePartId)"
            :valid-ids="activePart?.colorIds"
            @select="applyColorToActivePart"
        />
        <SkinColorizeColorFinder
            v-model="hairFinderShow"
            variant="hair"
            :part-label="`发型色位 ${activeHairPartId}`"
            :current-color-id="currentHairColorId(activeHairPartId)"
            @select="applyHairColorToActivePart"
        />
    </div>
</template>
