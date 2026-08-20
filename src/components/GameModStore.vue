<script setup lang="ts">
import { t } from "i18next"
import { computed, onMounted, ref, watch } from "vue"
import { gameModsCountQuery, gameModsQuery } from "@/api/gen/api-queries"
import type { GameMod } from "@/api/gen/api-types"
import { uploadGameMod, uploadGameModVersion } from "@/api/modShare"
import { useModInstall } from "@/composables/useModInstall"
import { useUIStore } from "@/store/ui"
import { useUserStore } from "@/store/user"

/**
 * 在线 MOD 商店（分享列表 + 上传/新版本弹窗）。
 * 弹窗模式（桌面管理器内）：卡片点击发射 openDetail 事件，由外部弹详情弹窗；
 * 路由模式（web 列表页）：卡片链接到 /mods/:id 详情页路由。
 */
const props = withDefaults(
    defineProps<{
        /** 路由模式：卡片跳转详情页路由；否则点击发射 openDetail 事件由外部弹窗展示。 */
        routeMode?: boolean
    }>(),
    { routeMode: false }
)

const emit = defineEmits<{
    openDetail: [mod: GameMod]
    /** 安装完成通知（参数为目标实体名，供外部刷新本地列表）。 */
    installed: [targetEntity: string]
}>()

const ui = useUIStore()
const user = useUserStore()

const isLoggedIn = computed(() => !!user.jwtToken)

const shareMods = ref<GameMod[]>([])
const shareLoading = ref(false)
const shareLoadingMore = ref(false)
const shareSearch = ref("")
/** 只看自己的发布（含待审核/已拒绝）。 */
const shareMine = ref(false)
/** 分享分类筛选，初始为 "all"（全部分类占位值，Reka Select 不允许空字符串）。 */
const shareCategory = ref("all")
const shareTotal = ref(0)
const shareHasMore = ref(false)
const SHARE_PAGE_SIZE = 30

const shareCategoryOptions = [
    { value: "all", label: t("game-launcher.allCategories") },
    { value: "char", label: t("game-launcher.char") },
    { value: "weapon", label: t("game-launcher.weapon") },
    { value: "other", label: t("game-launcher.other") },
    { value: "standalone", label: t("game-launcher.standalone") },
]

const shareFiltered = computed(() => shareMods.value.filter(mod => mod.isActive !== false))

/** 分享卡片上的快速安装（详情页内的安装由 GameModDetail 处理）。 */
const { installing: cardInstalling, installSharedMod: installCardMod } = useModInstall(targetEntity =>
    emit("installed", targetEntity)
)

let shareLoadTimer: ReturnType<typeof setTimeout> | undefined

/**
 * 加载分享 MOD 列表。
 * @param append 是否追加下一页
 */
async function loadShareMods(append = false) {
    if (append) {
        shareLoadingMore.value = true
    } else {
        shareLoading.value = true
    }
    try {
        // "all" 为 Reka Select 的全部分类占位值（空字符串不被允许），查询时还原为不过滤
        const common = {
            search: shareSearch.value || undefined,
            category: shareCategory.value === "all" ? undefined : shareCategory.value || undefined,
            active: shareMine.value ? undefined : true,
            mine: shareMine.value ? true : undefined,
        }
        const [items, total] = await Promise.all([
            gameModsQuery(
                { ...common, limit: SHARE_PAGE_SIZE, offset: append ? shareMods.value.length : 0, sortBy: "latest" },
                { requestPolicy: "network-only" }
            ),
            gameModsCountQuery(common, { requestPolicy: "network-only" }),
        ])
        const list = items || []
        shareMods.value = append ? [...shareMods.value, ...list] : list
        shareTotal.value = total || shareMods.value.length
        shareHasMore.value = shareMods.value.length < (total || 0)
    } catch (error) {
        console.error("加载分享 MOD 失败:", error)
        ui.showErrorMessage(t("game-launcher.loadShareFailed", { error: error instanceof Error ? error.message : String(error) }))
    } finally {
        shareLoading.value = false
        shareLoadingMore.value = false
    }
}

watch([shareSearch, shareCategory, shareMine], () => {
    clearTimeout(shareLoadTimer)
    shareLoadTimer = setTimeout(() => {
        void loadShareMods()
    }, 200)
})

onMounted(() => {
    void loadShareMods()
})

/** 分类显示名 */
function categoryLabel(category: string) {
    return (
        {
            char: t("game-launcher.char"),
            weapon: t("game-launcher.weapon"),
            other: t("game-launcher.other"),
            standalone: t("game-launcher.standalone"),
        }[category] || category
    )
}

/**
 * @description 去除 markdown 标记，用于卡片上的纯文本摘要。
 * @param text markdown 源文本。
 * @returns 去标记后的纯文本。
 */
function stripMarkdown(text: string): string {
    return text
        .replace(/[#*`>\[\]()!_-]/g, "")
        .replace(/\n+/g, " ")
        .trim()
}

/**
 * @description 格式化日期为本地日期字符串（卡片统计行使用，与构筑卡片一致）。
 * @param timestamp 时间戳（毫秒）。
 * @returns 本地日期字符串。
 */
function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString()
}

//#region 上传弹窗
const MAX_UPLOAD_IMAGES = 9
const uploadOpen = ref(false)
const uploadFile = ref<File | undefined>(undefined)
const uploadImages = ref<File[]>([])
/** 用第几张预览图作封面（-1 表示不使用预览图作封面）。 */
const uploadCoverIndex = ref(-1)
const uploadCover = ref<File | undefined>(undefined)
const uploadName = ref("")
const uploadDescription = ref("")
const uploadCategory = ref("standalone")
const uploadEntity = ref("")
const uploadRequires = ref("")
/** 是否原创（勾选后无需填写来源）。 */
const uploadIsOriginal = ref(true)
/** 来源链接（非原创时必填，自动识别链接）。 */
const uploadSource = ref("")
/** 首个版本号（缺省 1.0.0）。 */
const uploadVersion = ref("")
/** 首个版本更新说明（支持 markdown）。 */
const uploadChangelog = ref("")
const uploadSubmitting = ref(false)
const zipInput = ref<HTMLInputElement | null>(null)
const coverInput = ref<HTMLInputElement | null>(null)
const imagesInput = ref<HTMLInputElement | null>(null)

/**
 * 打开上传弹窗（保留上次未提交的输入，关闭后重开不丢失草稿）。
 */
function openUploadModal() {
    uploadOpen.value = true
}

/**
 * 重置上传表单状态（发布成功后清空，为下一次发布做准备）。
 */
function resetUploadForm() {
    uploadFile.value = undefined
    uploadImages.value = []
    uploadCoverIndex.value = -1
    uploadCover.value = undefined
    uploadName.value = ""
    uploadDescription.value = ""
    uploadCategory.value = "standalone"
    uploadEntity.value = ""
    uploadRequires.value = ""
    uploadIsOriginal.value = true
    uploadSource.value = ""
    uploadVersion.value = ""
    uploadChangelog.value = ""
}

/**
 * 处理 ZIP 文件选择。
 * @param event 文件选择事件
 */
function onZipInputChange(event: Event) {
    const input = event.target as HTMLInputElement
    uploadFile.value = input.files?.[0] || undefined
}

/**
 * 处理封面文件选择（单独上传时清空预览图作封面的选择）。
 * @param event 文件选择事件
 */
function onCoverInputChange(event: Event) {
    const input = event.target as HTMLInputElement
    uploadCover.value = input.files?.[0] || undefined
    if (uploadCover.value) uploadCoverIndex.value = -1
}

/**
 * 判断文件是否为可用的 MOD 预览图片。
 * @param file 待判断文件
 * @returns 是否为预览图片
 */
function isPreviewImageFile(file: File) {
    const mime = file.type.toLowerCase()
    return (
        ["image/bmp", "image/gif", "image/jpeg", "image/png", "image/tiff", "image/webp", "image/x-icon"].includes(mime) ||
        /\.(?:png|jpg|jpeg|gif|webp|bmp|tif|tiff|ico)$/i.test(file.name)
    )
}

/**
 * @description 生成本地文件的临时预览地址（模板内使用，避免直接引用全局 URL）。
 * @param file 本地文件。
 * @returns 临时对象 URL。
 */
function objectUrl(file: File) {
    return URL.createObjectURL(file)
}

/**
 * 处理多张预览图选择（非封面，追加并去重）。
 * @param event 文件选择事件
 */
function onImagesInputChange(event: Event) {
    const input = event.target as HTMLInputElement
    const picked = Array.from(input.files ?? []).filter(isPreviewImageFile)
    input.value = ""
    for (const file of picked) {
        if (uploadImages.value.length >= MAX_UPLOAD_IMAGES) break
        if (!uploadImages.value.some(existing => existing.name === file.name && existing.size === file.size)) {
            uploadImages.value.push(file)
        }
    }
    // 封面选择下标超出时自动回退
    if (uploadCoverIndex.value >= uploadImages.value.length) {
        uploadCoverIndex.value = uploadImages.value.length - 1
    }
}

/**
 * 移除某张预览图。
 * @param index 预览图下标
 */
function removeUploadImage(index: number) {
    uploadImages.value.splice(index, 1)
    if (uploadCoverIndex.value >= uploadImages.value.length) {
        uploadCoverIndex.value = uploadImages.value.length - 1
    }
}

/**
 * 选择用第几张预览图作为封面。
 * @param index 预览图下标
 */
function selectUploadCover(index: number) {
    uploadCoverIndex.value = index
}

/**
 * 选择单独上传的图片作为封面。
 */
function selectUploadedCover() {
    uploadCoverIndex.value = -1
}

/**
 * 提交上传发布 MOD。
 */
async function submitUpload() {
    if (!user.jwtToken) {
        ui.showErrorMessage(t("game-launcher.loginToUpload"))
        return
    }
    if (!uploadFile.value) {
        ui.showErrorMessage(t("game-launcher.selectZipFile"))
        return
    }
    if (uploadCategory.value !== "standalone" && !uploadEntity.value.trim()) {
        ui.showErrorMessage(t("game-launcher.entityRequired"))
        return
    }
    // 非原创必须填写来源（任意文本，展示时其中链接自动转为可点击链接）
    if (!uploadIsOriginal.value && !uploadSource.value.trim()) {
        ui.showErrorMessage(t("game-launcher.sourceRequired"))
        return
    }

    uploadSubmitting.value = true
    try {
        const requires = uploadRequires.value
            .split(/[,，\n]/)
            .map(item => item.trim())
            .filter(Boolean)
        const res = await uploadGameMod(
            {
                file: uploadFile.value,
                cover: uploadCoverIndex.value >= 0 ? undefined : uploadCover.value,
                images: uploadImages.value,
                coverImageIndex: uploadCoverIndex.value >= 0 ? uploadCoverIndex.value : undefined,
                name: uploadName.value.trim() || undefined,
                description: uploadDescription.value.trim() || undefined,
                category: uploadCategory.value,
                entity: uploadCategory.value === "standalone" ? undefined : uploadEntity.value.trim(),
                requires,
                source: uploadIsOriginal.value ? undefined : uploadSource.value.trim(),
                version: uploadVersion.value.trim() || undefined,
                changelog: uploadChangelog.value.trim() || undefined,
            },
            user.jwtToken
        )
        if (!res.success) {
            ui.showErrorMessage(res.error || t("game-launcher.uploadModFailed", { error: "" }))
            return
        }
        resetUploadForm()
        uploadOpen.value = false
        ui.showSuccessMessage(t("game-launcher.uploadModPending"))
        await loadShareMods()
    } catch (error) {
        console.error("上传 MOD 失败:", error)
        ui.showErrorMessage(t("game-launcher.uploadModFailed", { error: error instanceof Error ? error.message : String(error) }))
    } finally {
        uploadSubmitting.value = false
    }
}
//#endregion

//#region 新版本上传弹窗
const versionOpen = ref(false)
/** 目标发布。 */
const versionMod = ref<GameMod | null>(null)
const versionFile = ref<File | undefined>(undefined)
const versionLabel = ref("")
const versionChangelog = ref("")
const versionSubmitting = ref(false)
const versionZipInput = ref<HTMLInputElement | null>(null)

/**
 * 打开新版本上传弹窗（同一发布关闭后重开保留输入，切换目标发布时清空）。
 * @param mod 目标发布
 */
function openVersionModal(mod: GameMod) {
    // 切换到其他发布时清空表单，避免残留上一次的输入
    if (versionMod.value?.id !== mod.id) {
        versionFile.value = undefined
        versionLabel.value = ""
        versionChangelog.value = ""
    }
    versionMod.value = mod
    versionOpen.value = true
}

/**
 * 处理新版本 ZIP 文件选择。
 * @param event 文件选择事件
 */
function onVersionZipChange(event: Event) {
    const input = event.target as HTMLInputElement
    versionFile.value = input.files?.[0] || undefined
}

/**
 * 提交上传新版本。
 */
async function submitVersion() {
    if (!user.jwtToken) {
        ui.showErrorMessage(t("game-launcher.loginToUpload"))
        return
    }
    if (!versionMod.value) return
    if (!versionFile.value) {
        ui.showErrorMessage(t("game-launcher.selectZipFile"))
        return
    }

    versionSubmitting.value = true
    try {
        const res = await uploadGameModVersion(
            versionMod.value.id,
            {
                file: versionFile.value,
                version: versionLabel.value.trim() || undefined,
                changelog: versionChangelog.value.trim() || undefined,
            },
            user.jwtToken
        )
        if (!res.success) {
            ui.showErrorMessage(res.error || t("game-launcher.uploadVersionFailed", { error: "" }))
            return
        }
        versionFile.value = undefined
        versionLabel.value = ""
        versionChangelog.value = ""
        versionOpen.value = false
        ui.showSuccessMessage(t("game-launcher.uploadVersionSuccess"))
        await loadShareMods()
    } catch (error) {
        console.error("上传新版本失败:", error)
        ui.showErrorMessage(t("game-launcher.uploadVersionFailed", { error: error instanceof Error ? error.message : String(error) }))
    } finally {
        versionSubmitting.value = false
    }
}
//#endregion
</script>

<template>
    <div class="flex min-h-0 flex-col overflow-hidden">
        <!-- 工具栏 -->
        <div class="flex-none p-2 flex items-center gap-2 border-b border-base-300 flex-wrap">
            <label
                class="input input-sm bg-base-content/5 hover:bg-base-content/10 backdrop-blur-xs rounded-xs border border-base-content/5 text-xs w-48"
            >
                <Icon icon="ri:search-line" class="size-4 opacity-50" />
                <input v-model="shareSearch" type="text" :placeholder="$t('game-launcher.searchMod')" class="grow" />
            </label>
            <Select v-model="shareCategory" variant="chip" class="w-32 min-w-0">
                <SelectItem v-for="opt in shareCategoryOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                </SelectItem>
            </Select>
            <label
                v-if="isLoggedIn"
                class="flex items-center gap-1.5 text-xs cursor-pointer select-none tooltip tooltip-bottom"
                :data-tip="$t('game-launcher.myModsHint')"
            >
                <input v-model="shareMine" type="checkbox" class="checkbox checkbox-primary checkbox-xs" />
                <Icon icon="ri:user-line" class="size-3.5 opacity-70" />
                {{ $t("game-launcher.myMods") }}
            </label>
            <div class="ml-auto flex items-center gap-2">
                <span v-if="!isLoggedIn" class="text-xs opacity-60 flex items-center gap-1">
                    <Icon icon="ri:lock-line" class="size-4" />
                    {{ $t("game-launcher.loginToDownload") }}
                </span>
                <button
                    class="btn btn-primary btn-sm"
                    :class="{ 'btn-disabled': !isLoggedIn }"
                    :data-tip="!isLoggedIn ? $t('game-launcher.loginToUpload') : ''"
                    @click="openUploadModal"
                >
                    <Icon icon="ri:upload-2-line" class="size-4" />
                    {{ $t("game-launcher.uploadMod") }}
                </button>
            </div>
        </div>
        <ScrollArea class="flex-1 min-h-0">
            <div v-if="shareLoading" class="h-40 flex justify-center items-center opacity-60">
                <span class="loading loading-spinner loading-sm"></span>
            </div>
            <div v-else-if="shareFiltered.length === 0" class="h-40 flex justify-center items-center opacity-60">
                {{ $t("game-launcher.noSharedMods") }}
            </div>
            <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 p-3">
                <div
                    v-for="(mod, index) in shareFiltered"
                    :key="mod.id"
                    class="group flex cursor-pointer flex-col rounded-xs border border-base-content/10 bg-base-100/60 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-lg animate-ef-rise motion-reduce:animate-none motion-reduce:transition-none"
                    :style="{ animationDelay: `${Math.min(index * 40, 400)}ms` }"
                    @click="routeMode ? $router.push(`/mods/${mod.id}`) : emit('openDetail', mod)"
                >
                    <!-- 封面 -->
                    <figure class="relative px-3 pt-3">
                        <img
                            v-if="mod.coverUrl"
                            :src="mod.coverUrl"
                            :alt="mod.name"
                            loading="lazy"
                            class="w-full aspect-video object-cover rounded-sm group-hover:opacity-90 transition-opacity"
                        />
                        <div v-else class="w-full aspect-video rounded-sm bg-base-300 flex justify-center items-center opacity-60">
                            <Icon icon="ri:image-line" class="size-10" />
                        </div>
                        <span
                            v-if="!mod.source"
                            class="absolute bottom-4 left-4 badge badge-sm gap-1 bg-primary/85 border-0 text-base-100"
                        >
                            <Icon icon="ri:pencil-fill" class="size-3" />
                            {{ $t("game-launcher.isOriginal") }}
                        </span>
                        <span
                            v-else
                            class="absolute bottom-4 left-4 badge badge-sm gap-1 bg-base-100/85 border-base-300 text-base-content/80"
                        >
                            <Icon icon="ri:external-link-line" class="size-3" />
                            {{ $t("game-launcher.reprint") }}
                        </span>
                        <span
                            v-if="shareMine && mod.status !== 'approved'"
                            class="absolute top-4 right-4 badge badge-sm gap-1"
                            :class="mod.status === 'pending' ? 'badge-warning' : 'badge-error'"
                        >
                            {{ mod.status === "pending" ? $t("game-launcher.statusPending") : $t("game-launcher.statusRejected") }}
                        </span>
                    </figure>
                    <div class="flex flex-1 flex-col p-4">
                        <!-- 标题和标签 -->
                        <div class="flex items-start justify-between mb-2">
                            <span
                                class="line-clamp-2 flex-1 text-base font-semibold text-base-content transition-colors duration-200 group-hover:text-primary"
                            >
                                {{ mod.name }}
                            </span>
                            <div class="flex gap-1 ml-2 flex-none">
                                <span v-if="mod.isRecommended" class="badge badge-warning badge-sm">
                                    <Icon icon="ri:star-fill" class="size-3" />
                                </span>
                                <span v-if="mod.isPinned" class="badge badge-primary badge-sm">
                                    <Icon icon="ri:pushpin-fill" class="size-3" />
                                </span>
                                <span class="badge badge-ghost badge-sm">{{ categoryLabel(mod.category) }}</span>
                            </div>
                        </div>
                        <!-- 描述 -->
                        <div v-if="mod.description" class="text-sm text-base-content/60 flex-1 mb-2">
                            <div class="line-clamp-2">{{ stripMarkdown(mod.description) }}</div>
                        </div>
                        <div v-if="mod.requires?.length" class="text-xs opacity-60 truncate mb-2">
                            {{ $t("game-launcher.modRequires") }}: {{ mod.requires.join(", ") }}
                        </div>

                        <!-- 用户信息 -->
                        <div v-if="mod.user" class="flex items-center gap-2 mb-3">
                            <div class="avatar placeholder">
                                <div
                                    class="bg-neutral text-neutral-content rounded-full w-6 h-6 inline-flex justify-center items-center text-xs"
                                >
                                    <QQAvatar :qq="mod.user.qq || 0" :name="mod.user.name" />
                                </div>
                            </div>
                            <span class="text-xs text-base-content/70">{{ mod.user.name }}</span>
                        </div>

                        <!-- 统计信息 -->
                        <div class="flex items-center justify-between text-xs text-base-content/50 mb-3">
                            <div class="flex items-center gap-3">
                                <div class="flex items-center gap-1 font-orbitron tabular-nums">
                                    <Icon icon="ri:eye-line" class="size-4" />
                                    <span>{{ mod.views }}</span>
                                </div>
                                <div class="flex items-center gap-1 font-orbitron tabular-nums">
                                    <Icon icon="ri:download-2-line" class="size-4" />
                                    <span>{{ mod.downloads }}</span>
                                </div>
                            </div>
                            <span class="font-orbitron tabular-nums">{{ formatDate(mod.updateAt) }}</span>
                        </div>

                        <!-- 操作按钮 -->
                        <div class="card-actions justify-end mt-2 flex gap-2">
                            <button
                                v-if="routeMode"
                                class="btn btn-primary btn-sm flex-1"
                                @click.stop="$router.push(`/mods/${mod.id}`)"
                            >
                                <Icon icon="ri:eye-line" class="size-4" />
                                {{ $t("mods-list.viewDetail") }}
                            </button>
                            <template v-else>
                                <button
                                    v-if="isLoggedIn"
                                    class="btn btn-primary btn-sm flex-1"
                                    :class="{ 'btn-disabled': cardInstalling === mod.id }"
                                    @click.stop="installCardMod(mod)"
                                >
                                    <span v-if="cardInstalling === mod.id" class="loading loading-spinner loading-xs"></span>
                                    <Icon v-else icon="ri:download-2-line" class="size-4" />
                                    {{ cardInstalling === mod.id ? $t("game-launcher.installing") : $t("game-launcher.download") }}
                                </button>
                                <button v-else class="btn btn-sm btn-ghost flex-1" disabled>
                                    <Icon icon="ri:lock-line" class="size-4" />
                                    {{ $t("game-launcher.loginToDownload") }}
                                </button>
                            </template>
                            <button
                                v-if="shareMine"
                                class="btn btn-sm btn-outline btn-primary tooltip tooltip-top"
                                :data-tip="$t('game-launcher.uploadNewVersion')"
                                @click.stop="openVersionModal(mod)"
                            >
                                <Icon icon="ri:upload-cloud-line" class="size-4" />
                                <span class="hidden lg:inline">{{ $t("game-launcher.newVersion") }}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <div v-if="shareHasMore" class="flex justify-center pb-3">
                <button class="btn btn-sm btn-ghost" :class="{ 'btn-disabled': shareLoadingMore }" @click="loadShareMods(true)">
                    <span v-if="shareLoadingMore" class="loading loading-spinner loading-xs"></span>
                    {{ $t("game-launcher.loadMore") }}
                </button>
            </div>
        </ScrollArea>

        <!-- 上传 MOD 弹窗 -->
        <dialog class="modal" :class="{ 'modal-open': uploadOpen }">
            <div
                class="bg-base-100 border border-base-300 rounded-xl shadow-xl max-w-lg w-full p-4 flex flex-col gap-3 h-[calc(100dvh-2rem)] overflow-hidden row-start-1 col-start-1"
            >
                <h3 class="flex-none text-lg font-bold flex items-center gap-2">
                    <Icon icon="ri:upload-2-line" class="size-5 text-primary" />
                    {{ $t("game-launcher.uploadMod") }}
                </h3>
                <input ref="zipInput" type="file" accept=".zip,application/zip" class="hidden" @change="onZipInputChange" />
                <input ref="coverInput" type="file" accept="image/*" class="hidden" @change="onCoverInputChange" />
                <input ref="imagesInput" type="file" accept="image/*" multiple class="hidden" @change="onImagesInputChange" />
                <div class="min-h-0 flex-1 overflow-y-auto flex flex-col gap-3 pr-1">
                    <!-- 格式要求提示 -->
                    <div class="text-xs bg-primary/10 border border-primary/30 rounded-lg p-2.5 text-base-content/80 flex gap-2">
                        <Icon icon="ri:file-zip-line" class="size-4 text-primary flex-none mt-0.5" />
                        <span>{{ $t("game-launcher.modFormatHint") }}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <button class="btn btn-sm btn-primary btn-outline" @click="zipInput?.click()">
                            <Icon icon="ri:file-zip-line" class="size-4" />
                            {{ $t("game-launcher.selectZipFile") }}
                        </button>
                        <span class="text-xs opacity-70 truncate flex-1">{{ uploadFile?.name || $t("game-launcher.noFileSelected") }}</span>
                    </div>

                    <!-- 预览图（非封面）多选 -->
                    <div class="flex items-center justify-between">
                        <span class="text-sm font-semibold flex items-center gap-1.5">
                            <Icon icon="ri:image-line" class="size-4 text-primary" />
                            {{ $t("game-launcher.previewImages") }}
                        </span>
                        <button class="btn btn-sm btn-ghost" @click="imagesInput?.click()">
                            <Icon icon="ri:image-add-line" class="size-4" />
                            {{ $t("game-launcher.addPreviewImages") }}
                        </button>
                    </div>
                    <div v-if="uploadImages.length" class="flex flex-wrap gap-2">
                        <div v-for="(image, index) in uploadImages" :key="`${image.name}-${image.size}`" class="relative group">
                            <img
                                :src="objectUrl(image)"
                                :alt="image.name"
                                class="w-16 aspect-video object-cover rounded-lg border border-base-300"
                            />
                            <button
                                class="absolute -top-1.5 -right-1.5 btn btn-square btn-xs btn-error opacity-0 group-hover:opacity-100 transition-opacity"
                                @click="removeUploadImage(index)"
                            >
                                <Icon icon="ri:close-line" class="size-3" />
                            </button>
                        </div>
                    </div>

                    <!-- 封面选择：预览图作封面或上传独立封面 -->
                    <div class="text-sm font-semibold flex items-center gap-1.5">
                        <Icon icon="ri:image-add-line" class="size-4 text-primary" />
                        {{ $t("game-launcher.coverSource") }}
                    </div>
                    <div class="flex flex-wrap gap-2 items-center">
                        <button
                            v-if="uploadCover"
                            type="button"
                            class="relative w-16 aspect-video border rounded-lg overflow-hidden cursor-pointer"
                            :class="{ 'border-primary ring-2 ring-primary/40': uploadCoverIndex === -1 }"
                            @click="selectUploadedCover()"
                        >
                            <img :src="objectUrl(uploadCover)" :alt="$t('game-launcher.coverSource')" class="w-full h-full object-cover" />
                            <span
                                v-if="uploadCoverIndex === -1"
                                class="absolute inset-0 flex items-center justify-center bg-primary/40 text-white"
                            >
                                <Icon icon="ri:checkbox-circle-fill" class="size-5" />
                            </span>
                        </button>
                        <button
                            v-for="(image, index) in uploadImages"
                            :key="`cover-${index}`"
                            type="button"
                            class="relative w-16 aspect-video border rounded-lg overflow-hidden cursor-pointer"
                            :class="{ 'border-primary ring-2 ring-primary/40': uploadCoverIndex === index }"
                            @click="selectUploadCover(index)"
                        >
                            <img :src="objectUrl(image)" :alt="image.name" class="w-full h-full object-cover" />
                            <span
                                v-if="uploadCoverIndex === index"
                                class="absolute inset-0 flex items-center justify-center bg-primary/40 text-white"
                            >
                                <Icon icon="ri:checkbox-circle-fill" class="size-5" />
                            </span>
                        </button>
                        <button
                            type="button"
                            class="w-16 aspect-video border border-dashed border-base-300 rounded-lg flex items-center justify-center hover:border-primary hover:text-primary transition-colors tooltip tooltip-top"
                            :data-tip="$t('game-launcher.coverUpload')"
                            @click="coverInput?.click()"
                        >
                            <Icon icon="ri:upload-cloud-line" class="size-5" />
                        </button>
                    </div>

                    <input
                        v-model="uploadName"
                        type="text"
                        :placeholder="$t('game-launcher.modName')"
                        class="input input-bordered input-sm w-full"
                    />
                    <div class="relative">
                        <textarea
                            v-model="uploadDescription"
                            :placeholder="$t('game-launcher.modDescription')"
                            class="textarea textarea-bordered textarea-sm w-full pr-16"
                            rows="4"
                        ></textarea>
                        <span class="absolute right-2 bottom-1.5 text-[10px] opacity-50 flex items-center gap-1"> Markdown </span>
                    </div>
                    <div class="flex gap-2">
                        <Select v-model="uploadCategory" class="w-40 input input-sm">
                            <SelectItem v-for="opt in shareCategoryOptions.slice(1)" :key="opt.value" :value="opt.value">
                                {{ opt.label }}
                            </SelectItem>
                        </Select>
                        <input
                            v-model="uploadEntity"
                            type="text"
                            :placeholder="$t('game-launcher.modEntity')"
                            class="input input-bordered input-sm w-full"
                            :disabled="uploadCategory === 'standalone'"
                        />
                    </div>
                    <input
                        v-model="uploadRequires"
                        type="text"
                        :placeholder="$t('game-launcher.modRequiresPlaceholder')"
                        class="input input-bordered input-sm w-full"
                    />

                    <!-- 原创 / 来源 -->
                    <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
                        <input v-model="uploadIsOriginal" type="checkbox" class="checkbox checkbox-primary checkbox-sm" />
                        <span class="flex items-center gap-1">
                            <Icon icon="ri:pencil-fill" class="size-4 text-primary" />
                            {{ $t("game-launcher.isOriginal") }}
                        </span>
                        <span v-if="uploadIsOriginal" class="text-xs opacity-50">{{ $t("game-launcher.originalHint") }}</span>
                    </label>
                    <div v-if="!uploadIsOriginal" class="flex flex-col gap-1">
                        <div class="relative">
                            <Icon icon="ri:external-link-line" class="size-4 absolute left-2 top-1/2 -translate-y-1/2 opacity-50 z-1" />
                            <input
                                v-model="uploadSource"
                                type="text"
                                :placeholder="$t('game-launcher.sourcePlaceholder')"
                                class="input input-bordered input-sm w-full pl-8"
                            />
                        </div>
                        <span class="text-[11px] opacity-50">{{ $t("game-launcher.sourceRequired") }}</span>
                    </div>

                    <!-- 首个版本信息 -->
                    <div class="flex gap-2">
                        <input
                            v-model="uploadVersion"
                            type="text"
                            :placeholder="$t('game-launcher.versionLabel')"
                            class="input input-bordered input-sm w-28"
                        />
                        <input
                            v-model="uploadChangelog"
                            type="text"
                            :placeholder="$t('game-launcher.changelog')"
                            class="input input-bordered input-sm w-full"
                        />
                    </div>
                </div>

                <div class="flex-none flex justify-end gap-2">
                    <button class="min-w-20 btn btn-primary" :class="{ 'btn-disabled': uploadSubmitting }" @click="submitUpload()">
                        <span v-if="uploadSubmitting" class="loading loading-spinner loading-xs"></span>
                        {{ $t("game-launcher.publish") }}
                    </button>
                    <button class="min-w-20 btn" @click="uploadOpen = false">{{ $t("setting.cancel") }}</button>
                </div>
            </div>
            <div class="modal-backdrop" @click="uploadOpen = false" />
        </dialog>

        <!-- 上传新版本弹窗 -->
        <dialog class="modal" :class="{ 'modal-open': versionOpen }">
            <div
                class="bg-base-100 border border-base-300 rounded-xl shadow-xl max-w-md w-full p-4 flex flex-col gap-3 max-h-[90vh] overflow-auto row-start-1 col-start-1"
            >
                <h3 class="text-lg font-bold flex items-center gap-2">
                    <Icon icon="ri:upload-cloud-line" class="size-5 text-primary" />
                    {{ $t("game-launcher.uploadNewVersion") }}
                </h3>
                <div v-if="versionMod" class="text-xs opacity-70 flex items-center gap-1.5 flex-wrap">
                    <span class="font-medium text-base-content">{{ versionMod.name }}</span>
                    <span class="badge badge-xs badge-ghost">{{ categoryLabel(versionMod.category) }}</span>
                </div>
                <!-- 格式要求提示 -->
                <div class="text-xs bg-primary/10 border border-primary/30 rounded-lg p-2.5 text-base-content/80 flex gap-2">
                    <Icon icon="ri:file-zip-line" class="size-4 text-primary flex-none mt-0.5" />
                    <span>{{ $t("game-launcher.modFormatHint") }}</span>
                </div>
                <input ref="versionZipInput" type="file" accept=".zip,application/zip" class="hidden" @change="onVersionZipChange" />
                <div class="flex items-center gap-2">
                    <button class="btn btn-sm btn-primary btn-outline" @click="versionZipInput?.click()">
                        <Icon icon="ri:file-zip-line" class="size-4" />
                        {{ $t("game-launcher.selectZipFile") }}
                    </button>
                    <span class="text-xs opacity-70 truncate flex-1">{{ versionFile?.name || $t("game-launcher.noFileSelected") }}</span>
                </div>
                <div class="flex gap-2">
                    <input
                        v-model="versionLabel"
                        type="text"
                        :placeholder="$t('game-launcher.versionLabel')"
                        class="input input-bordered input-sm w-28"
                    />
                    <input
                        v-model="versionChangelog"
                        type="text"
                        :placeholder="$t('game-launcher.changelog')"
                        class="input input-bordered input-sm w-full"
                    />
                </div>
                <div class="flex justify-end gap-2">
                    <button class="min-w-20 btn btn-primary" :class="{ 'btn-disabled': versionSubmitting }" @click="submitVersion()">
                        <span v-if="versionSubmitting" class="loading loading-spinner loading-xs"></span>
                        {{ $t("game-launcher.publish") }}
                    </button>
                    <button class="min-w-20 btn" @click="versionOpen = false">{{ $t("setting.cancel") }}</button>
                </div>
            </div>
            <div class="modal-backdrop" @click="versionOpen = false" />
        </dialog>
    </div>
</template>
