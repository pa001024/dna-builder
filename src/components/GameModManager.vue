<script setup lang="ts">
import { open as openFileDialog } from "@tauri-apps/plugin-dialog"
import DOMPurify from "dompurify"
import { t } from "i18next"
import MarkdownIt from "markdown-it"
import { computed, onMounted, ref, watch } from "vue"
import { gameModQuery, gameModsCountQuery, gameModsQuery } from "@/api/gen/api-queries"
import type { GameMod, GameModVersion } from "@/api/gen/api-types"
import { downloadGameMod, downloadGameModVersion, uploadGameMod, uploadGameModVersion } from "@/api/modShare"
import { useSearchParam } from "@/composables/useSearchParam.ts"
import { charData, LeveledChar, weaponData } from "@/data"
import { env } from "@/env"
import type { CustomEntity, Mod } from "@/store/db"
import { STANDALONE_ENTITY } from "@/store/db"
import { useGameStore } from "@/store/game"
import { useUIStore } from "@/store/ui"
import { useUserStore } from "@/store/user"
import type { IconTypes } from "./Icon.vue"

/**
 * 游戏启动器的 MOD 管理组件。
 * 分类：角色（单选）、武器（单选）、其他/自定义（单选）、独立（多选）、分享（在线商店）。
 * 界面参考首页设计语言：纸面 + 主色强调线 + 引导网格 + 斜切楔形，整体保持紧凑。
 */

const ui = useUIStore()
const game = useGameStore()
const user = useUserStore()

/** 子分类页签 */
const MOD_TYPES = ["char", "weapon", "custom", "standalone", "share"] as const
type ModType = (typeof MOD_TYPES)[number]
const modType = useSearchParam<ModType>("t", "share")

/** 各子页签对应的图标。 */
const MOD_TYPE_ICONS: Record<ModType, IconTypes> = {
    char: "ri:user-line",
    weapon: "ri:sword-line",
    custom: "ri:settings-3-line",
    standalone: "ri:stack-line",
    share: "ri:share-line",
}

const isStandalone = computed(() => modType.value === "standalone")
const isSingleTab = computed(() => modType.value === "char" || modType.value === "weapon" || modType.value === "custom")

/** markdown 渲染器（与指南详情页一致：禁 HTML、允许链接化）。 */
const md = MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    breaks: true,
})

/**
 * @description 将 markdown 文本渲染为安全的 HTML。
 * @param text markdown 源文本。
 * @returns 净化后的 HTML。
 */
function renderMarkdown(text: string): string {
    return DOMPurify.sanitize(md.render(text))
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
 * @description 将来源文本渲染为安全 HTML：先转义全部内容，再把其中的 http/https 链接替换为可点击的 <a> 标签。
 * @param text 来源文本（任意内容）。
 * @returns 安全 HTML。
 */
function renderSourceLinks(text: string): string {
    const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    return escaped.replace(/(https?:\/\/[^\s<>"'（）()，。；、,;:！!?？]+)/gi, link => {
        const clean = link.replace(/[，。；、,.;:！!?？]+$/, "")
        return `<a href="${clean}" target="_blank" rel="noopener noreferrer" class="link link-primary">${clean}</a>`
    })
}

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
 * @description 生成本地文件的临时预览地址（模板内使用，避免直接引用全局 URL）。
 * @param file 本地文件。
 * @returns 临时对象 URL。
 */
function objectUrl(file: File) {
    return URL.createObjectURL(file)
}

//#region 角色/武器/其他 单选管理
const customEntityName = ref("")
const customEntityIcon = ref("ri:gamepad-line")
const customEntityIconsOptions = [
    "ri:gamepad-line",
    "ri:rocket-2-line",
    "ri:heart-line",
    "ri:sword-line",
    "ri:settings-3-line",
    "ri:trophy-line",
    "ri:pencil-fill",
    "ri:edit-line",
    "ri:more-line",
    "ri:crosshair-line",
    "ri:flashlight-line",
] as const
const entitys = ref<{ name: string; icon: string; count: number; id?: number }[]>([])

/**
 * 刷新当前实体分类及每个实体的 MOD 数量（内容跟随顶部页签：char/weapon/custom）。
 */
async function refreshEntities() {
    if (modType.value === "custom") {
        entitys.value = await Promise.all(
            (game.customEntitys ?? []).map(async entity => ({
                id: entity.id,
                name: entity.name,
                icon: entity.icon,
                count: await game.getModsCountByEntity(entity.name),
            }))
        )
        return
    }

    const data = modType.value === "char" ? charData : weaponData
    entitys.value = await Promise.all(
        data.map(async entity => ({
            name: entity.名称,
            icon: LeveledChar.url(entity.icon),
            count: await game.getModsCountByEntity(entity.名称),
        }))
    )
}

watch(
    () => modType.value,
    () => {
        if (isSingleTab.value) {
            // 切换分类页签时清空上次选中的实体，避免跨分类残留选中
            game.selectedEntity = ""
            void refreshEntities()
        }
    },
    { immediate: true }
)

watch(
    () => game.customEntitys,
    () => {
        if (isSingleTab.value) void refreshEntities()
    }
)

const sortedEntitys = computed(() =>
    [...entitys.value].sort((a, b) => (game.likedChars.includes(a.name) ? -1 : game.likedChars.includes(b.name) ? 1 : b.count - a.count))
)

/**
 * 添加一个自定义实体类型。
 */
async function addCustomEntity() {
    if (!customEntityName.value) {
        ui.showErrorMessage(t("game-launcher.enterCustomTypeName"))
        return
    }

    try {
        await game.addCustomEntity({ name: customEntityName.value, icon: customEntityIcon.value })
        customEntityName.value = ""
    } catch (error) {
        if (error && typeof error === "object" && "name" in error && error.name === "ConstraintError") {
            ui.showErrorMessage(t("game-launcher.customTypeNameExists"))
            return
        }
        console.error("添加自定义类型失败:", error)
        ui.showErrorMessage(t("game-launcher.addCustomTypeFailed", { error: error instanceof Error ? error.message : String(error) }))
    }
}

const entityMod = ref<Mod | undefined>(undefined)
const modsInEntity = ref<Mod[]>([])

/**
 * 刷新当前实体的 MOD 列表和启用状态（单选分类）。
 */
async function updateEntityMod() {
    const entity = game.selectedEntity
    if (!entity) {
        entityMod.value = undefined
        modsInEntity.value = []
        return
    }

    const [currentMod, mods] = await Promise.all([game.getEntityMod(entity), game.getModsByEntity(entity)])
    if (entity !== game.selectedEntity) return

    entityMod.value = currentMod
    modsInEntity.value = mods
    const currentEntity = entitys.value.find(item => item.name === entity)
    if (currentEntity) currentEntity.count = mods.length
}

watch(
    () => [modType.value, game.selectedEntity, entitys.value],
    () => {
        if (isSingleTab.value) void updateEntityMod()
    },
    { immediate: true }
)

/**
 * 设置实体当前启用的 MOD（单选：切换时自动禁用当前已启用的 MOD 以防冲突）。
 * @param entity 实体名称
 * @param modid MOD ID，0 表示不使用 MOD
 */
async function setEntityMod(entity: string, modid: number) {
    try {
        if (!(await game.setEntityMod(entity, modid))) {
            ui.showErrorMessage(t("game-launcher.setModFailed", { error: "" }))
            return
        }
        await updateEntityMod()
        ui.showSuccessMessage(t(modid ? "game-launcher.modEnabled" : "game-launcher.modDisabled"))
    } catch (error) {
        console.error("设置MOD失败:", error)
        ui.showErrorMessage(t("game-launcher.setModFailed", { error: error instanceof Error ? error.message : String(error) }))
    }
}
//#endregion

//#region 独立（standalone）多选管理
const standaloneMods = ref<Mod[]>([])
const standaloneEnabled = ref<Set<number>>(new Set())
const standalonePreview = ref<Mod | undefined>(undefined)

/**
 * 刷新独立分类的 MOD 列表与启用状态。
 */
async function refreshStandalone() {
    const [mods, enabledIds] = await Promise.all([game.getStandaloneMods(), game.getStandaloneEnabledModIds()])
    standaloneMods.value = mods
    standaloneEnabled.value = enabledIds
    if (!standalonePreview.value || !mods.some(mod => mod.id === standalonePreview.value?.id)) {
        standalonePreview.value = mods[0]
    }
}

watch(
    () => modType.value,
    () => {
        if (isStandalone.value) void refreshStandalone()
    },
    { immediate: true }
)

/**
 * 切换独立分类某个 MOD 的启用状态（多选，勾选即应用）。
 * @param mod MOD 对象
 * @param enabled 是否启用
 */
async function toggleStandaloneMod(mod: Mod, enabled: boolean) {
    try {
        if (!(await game.setStandaloneModEnabled(mod.id, enabled))) {
            ui.showErrorMessage(t("game-launcher.setModFailed", { error: "" }))
            return
        }
        await refreshStandalone()
        ui.showSuccessMessage(t(enabled ? "game-launcher.modEnabled" : "game-launcher.modDisabled"))
    } catch (error) {
        console.error("设置独立MOD失败:", error)
        ui.showErrorMessage(t("game-launcher.setModFailed", { error: error instanceof Error ? error.message : String(error) }))
    }
}
//#endregion

//#region 手动添加 MOD（Tauri 原生文件选择 + 路径导入）
const modFileInput = ref<HTMLInputElement | null>(null)

/**
 * 手动添加 MOD：桌面端用 Tauri 原生对话框选择文件路径，再调用路径式导入（import_mod，直接解压/复制）；
 * 网页端回退到字节流导入。
 */
async function addModManually() {
    if (!game.path) {
        ui.showErrorMessage(t("game-launcher.selectGameFileFirst"))
        return
    }
    const target = isStandalone.value ? STANDALONE_ENTITY : game.selectedEntity
    if (!target) {
        ui.showErrorMessage(t("game-launcher.selectEntityFirst"))
        return
    }

    if (env.isApp) {
        const paths = await openFileDialog({
            title: t("game-launcher.selectModFiles"),
            multiple: true,
            filters: [{ name: "MOD", extensions: ["zip", "pak", "paks"] }],
        })
        if (!paths?.length) return
        try {
            const ok = await game.importModPaths(Array.isArray(paths) ? paths : [paths], target)
            if (!ok) {
                ui.showErrorMessage(t("game-launcher.importModFailed"))
                return
            }
            ui.showSuccessMessage(t("game-launcher.importModPathsSuccess", { count: Array.isArray(paths) ? paths.length : 1 }))
            await (isStandalone.value ? refreshStandalone() : updateEntityMod())
        } catch (error) {
            console.error("路径导入 MOD 失败:", error)
            ui.showErrorMessage(t("game-launcher.importModPathsFailed", { error: error instanceof Error ? error.message : String(error) }))
        }
        return
    }

    modFileInput.value?.click()
}

/**
 * 网页端回退：隐藏文件输入选择后的字节流导入。
 * @param event 文件选择事件
 */
async function onModFileInputChange(event: Event) {
    const input = event.target as HTMLInputElement
    const files = Array.from(input.files ?? [])
    input.value = ""
    if (!files.length) return
    const target = isStandalone.value ? STANDALONE_ENTITY : game.selectedEntity
    if (!target) return
    try {
        if (!(await game.importModToEntity(files, target))) {
            ui.showErrorMessage(t("game-launcher.importModFailed"))
            return
        }
        ui.showSuccessMessage(t("game-launcher.importModPathsSuccess", { count: files.length }))
        await (isStandalone.value ? refreshStandalone() : updateEntityMod())
    } catch (error) {
        console.error("导入 MOD 失败:", error)
        ui.showErrorMessage(t("game-launcher.importModPathsFailed", { error: error instanceof Error ? error.message : String(error) }))
    }
}
//#endregion

//#region 删除 MOD（通用）
/**
 * 删除指定 MOD。
 * @param mod 待删除的 MOD
 */
async function removeMod(mod: Mod) {
    try {
        await game.removeMod(mod)
        if (isStandalone.value) {
            await refreshStandalone()
        } else if (isSingleTab.value) {
            await updateEntityMod()
        }
        ui.showSuccessMessage(t("game-launcher.modDeleted"))
    } catch (error) {
        console.error("删除MOD失败:", error)
        ui.showErrorMessage(t("game-launcher.deleteModFailed", { error: error instanceof Error ? error.message : String(error) }))
    }
}
//#endregion

//#region 拖拽导入
const isDragging = ref(false)
let dragDepth = 0
const MOD_IMPORT_ESTIMATED_BYTES_PER_SECOND = 5 * 1024 * 1024
const MOD_IMPORT_MAX_PROGRESS = 95
const modImportProgress = ref<number | null>(null)
let modImportProgressAnimationFrame: number | undefined

/**
 * 按 MOD 文件总大小和估算吞吐率推进导入进度。
 * @param files 待导入的 MOD 文件
 */
function startModImportProgress(files: File[]) {
    if (modImportProgressAnimationFrame !== undefined) {
        cancelAnimationFrame(modImportProgressAnimationFrame)
    }

    const totalSize = files.reduce((size, file) => size + file.size, 0)
    const estimatedDuration = Math.max(600, (totalSize / MOD_IMPORT_ESTIMATED_BYTES_PER_SECOND) * 1000)
    const startedAt = performance.now()
    modImportProgress.value = 0

    const updateProgress = (now: number) => {
        const progress = Math.min(MOD_IMPORT_MAX_PROGRESS, Math.floor(((now - startedAt) / estimatedDuration) * MOD_IMPORT_MAX_PROGRESS))
        modImportProgress.value = progress
        if (progress < MOD_IMPORT_MAX_PROGRESS) {
            modImportProgressAnimationFrame = requestAnimationFrame(updateProgress)
        } else {
            modImportProgressAnimationFrame = undefined
        }
    }
    modImportProgressAnimationFrame = requestAnimationFrame(updateProgress)
}

/**
 * 停止 MOD 导入进度，并在成功后显示完成状态。
 * @param completed 是否已完成导入
 */
function stopModImportProgress(completed = false) {
    if (modImportProgressAnimationFrame !== undefined) {
        cancelAnimationFrame(modImportProgressAnimationFrame)
        modImportProgressAnimationFrame = undefined
    }
    modImportProgress.value = completed ? 100 : null
}

/**
 * 判断拖拽事件是否包含本地文件。
 * @param event 原生拖拽事件
 * @returns 是否为文件拖拽
 */
function isFileDrag(event: DragEvent) {
    return event.dataTransfer?.types.includes("Files") ?? false
}

/**
 * 判断文件是否为 MOD 压缩包或资源包。
 * @param file 待判断文件
 * @returns 是否为 MOD 文件
 */
function isModFile(file: File) {
    return /\.(?:zip|pak)$/i.test(file.name)
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
 * 处理原生 H5 文件拖拽进入页面。
 * @param event 原生拖拽事件
 */
function handleNativeDragEnter(event: DragEvent) {
    if (!isFileDrag(event)) return
    dragDepth += 1
    isDragging.value = true
}

/**
 * 处理原生 H5 文件拖拽经过页面。
 * @param event 原生拖拽事件
 */
function handleNativeDragOver(event: DragEvent) {
    const dataTransfer = event.dataTransfer
    if (!dataTransfer || !isFileDrag(event)) return
    event.preventDefault()
    dataTransfer.dropEffect = "copy"
    isDragging.value = true
}

/**
 * 处理原生 H5 文件拖拽离开页面。
 * @param event 原生拖拽事件
 */
function handleNativeDragLeave(event: DragEvent) {
    if (!isFileDrag(event)) return
    dragDepth = Math.max(0, dragDepth - 1)
    if (dragDepth === 0) isDragging.value = false
}

/**
 * 处理原生 H5 文件拖放并导入 MOD 或预览图。
 * @param event 原生拖拽事件
 */
async function handleNativeDrop(event: DragEvent) {
    event.preventDefault()
    dragDepth = 0
    isDragging.value = false

    const files = Array.from(event.dataTransfer?.files ?? [])
    if (!game.path) {
        ui.showErrorMessage(t("game-launcher.selectGameFileFirst"))
        return
    }

    // 独立分类：拖入的 MOD 直接加入独立分类（多选模型）
    if (isStandalone.value) {
        const modFiles = files.filter(isModFile)
        if (modFiles.length === 0) {
            ui.showErrorMessage(t("game-launcher.importModFailed"))
            return
        }
        startModImportProgress(modFiles)
        try {
            if (!(await game.importModToEntity(modFiles, STANDALONE_ENTITY))) {
                ui.showErrorMessage(t("game-launcher.importModFailed"))
                return
            }
            stopModImportProgress(true)
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
            ui.showSuccessMessage(t("game-launcher.importModSuccess", { count: 1 }))
            await refreshStandalone()
        } catch (error) {
            console.error("导入独立MOD失败:", error)
            ui.showErrorMessage(t("game-launcher.importModFailed", { error: error instanceof Error ? error.message : String(error) }))
        } finally {
            stopModImportProgress()
        }
        return
    }

    if (!game.selectedEntity) {
        ui.showErrorMessage(t("game-launcher.selectEntityFirst"))
        return
    }

    const modFiles = files.filter(isModFile)
    if (modFiles.length > 0) {
        startModImportProgress(modFiles)
        try {
            if (!(await game.importMod(modFiles))) {
                ui.showErrorMessage(t("game-launcher.importModFailed"))
                return
            }
            stopModImportProgress(true)
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
            ui.showSuccessMessage(t("game-launcher.importModSuccess", { count: 1 }))
            await updateEntityMod()
        } catch (error) {
            console.error("导入MOD失败:", error)
            ui.showErrorMessage(t("game-launcher.importModFailed", { error: error instanceof Error ? error.message : String(error) }))
        } finally {
            stopModImportProgress()
        }
        return
    }

    const imageFile = files.find(isPreviewImageFile)
    if (!imageFile) {
        ui.showErrorMessage(t("game-launcher.importModFailed"))
        return
    }
    if (!entityMod.value) {
        ui.showErrorMessage(t("game-launcher.selectModFirst"))
        return
    }

    try {
        if (!(await game.importPic(entityMod.value.id, imageFile))) {
            ui.showErrorMessage(t("game-launcher.importPicFailed", { error: "" }))
            return
        }
        await updateEntityMod()
        ui.showSuccessMessage(t("game-launcher.importPicSuccess"))
    } catch (error) {
        console.error("导入MOD图片失败:", error)
        ui.showErrorMessage(t("game-launcher.importPicFailed", { error: error instanceof Error ? error.message : String(error) }))
    }
}
//#endregion

//#region 分享（在线 MOD 商店）
const shareMods = ref<GameMod[]>([])
const shareLoading = ref(false)
const shareLoadingMore = ref(false)
const shareSearch = ref("")
/** 只看自己的发布（含待审核/已拒绝）。 */
const shareMine = ref(false)
/** 分享分类筛选，初始为 "all"（全部分类占位值，Reka Select 不允许空字符串）。 */
const shareCategory = ref("all")
const SHARE_PAGE_SIZE = 30
const shareInstalling = ref<string | null>(null)
/** 详情弹窗中的 MOD。 */
const detailMod = ref<GameMod | null>(null)
/** 详情弹窗中当前展示的图片下标：-1 表示封面，>=0 表示预览图。 */
const detailImageIndex = ref(-1)

const shareCategoryOptions = [
    { value: "all", label: t("game-launcher.allCategories") },
    { value: "char", label: t("game-launcher.char") },
    { value: "weapon", label: t("game-launcher.weapon") },
    { value: "other", label: t("game-launcher.other") },
    { value: "standalone", label: t("game-launcher.standalone") },
]

const isLoggedIn = computed(() => !!user.jwtToken)

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

const shareTotal = ref(0)
const shareHasMore = ref(false)

watch([modType, shareSearch, shareCategory, shareMine], () => {
    if (modType.value !== "share") return
    clearTimeout(shareLoadTimer)
    shareLoadTimer = setTimeout(() => {
        void loadShareMods()
    }, 200)
})

const shareFiltered = computed(() => shareMods.value.filter(mod => mod.isActive !== false))

/**
 * 打开 MOD 详情弹窗（拉取完整版本列表）。
 * @param mod MOD 对象
 */
async function openDetail(mod: GameMod) {
    detailMod.value = mod
    detailImageIndex.value = -1
    try {
        // 详情查询返回全部版本（含版本号/更新说明），供版本列表展示与指定版本下载
        const full = await gameModQuery({ id: mod.id }, { requestPolicy: "network-only" })
        if (full) {
            detailMod.value = full
        }
    } catch (error) {
        console.error("加载 MOD 详情失败:", error)
    }
}

/** 当前详情弹窗展示的图片地址（静态 OSS/CDN 直链，来自服务端返回）。 */
const detailImageSrc = computed(() => {
    const mod = detailMod.value
    if (!mod) return ""
    if (detailImageIndex.value >= 0 && mod.images?.length) {
        return mod.images[detailImageIndex.value]
    }
    return mod.coverUrl || ""
})

/**
 * 将已下载的压缩包字节安装到对应分类（一键下载安装的公共逻辑）。
 * @param mod 分享的 MOD
 * @param bytes 压缩包字节
 * @param name 安装后的本地 MOD 名称
 * @returns 是否成功
 */
async function installDownloadedMod(mod: GameMod, bytes: ArrayBuffer, name: string) {
    if (!game.path) {
        ui.showErrorMessage(t("game-launcher.selectGameFileFirst"))
        return false
    }

    // 其他（自定义）分类：若本地不存在该自定义实体则自动创建，保证一键安装后可见可用
    if (mod.category === "other" && mod.entity) {
        const exists = (game.customEntitys ?? []).some(entity => entity.name === mod.entity)
        if (!exists) {
            await game.addCustomEntity({ name: mod.entity, icon: "ri:gamepad-line" })
        }
    }

    const targetEntity = mod.category === "standalone" ? STANDALONE_ENTITY : mod.entity || STANDALONE_ENTITY
    const file = new File([bytes], mod.fileName, { type: "application/zip" })
    const ok = await game.importModToEntity([file], targetEntity, {
        name,
        pic: mod.coverUrl || "",
    })
    if (!ok) {
        ui.showErrorMessage(t("game-launcher.modDownloadFailed", { error: "" }))
        return false
    }
    ui.showSuccessMessage(t("game-launcher.modDownloadSuccess"))
    if (targetEntity === STANDALONE_ENTITY) {
        await refreshStandalone()
    } else if (isSingleTab.value) {
        await updateEntityMod()
    }
    return true
}

/**
 * 一键下载并安装分享的 MOD 最新版本到对应分类。
 * 登录后才显示下载链接；非独立分类安装到其适用实体，独立分类安装到「独立」。
 * @param mod 分享的 MOD
 */
async function installSharedMod(mod: GameMod) {
    if (!user.jwtToken) {
        ui.showErrorMessage(t("game-launcher.loginToDownload"))
        return
    }
    shareInstalling.value = mod.id
    try {
        const bytes = await downloadGameMod(mod.id, user.jwtToken)
        await installDownloadedMod(mod, bytes, mod.name)
    } catch (error) {
        console.error("下载安装 MOD 失败:", error)
        ui.showErrorMessage(t("game-launcher.modDownloadFailed", { error: error instanceof Error ? error.message : String(error) }))
    } finally {
        shareInstalling.value = null
    }
}

/**
 * 下载并安装分享 MOD 的指定版本。
 * @param mod 分享的 MOD
 * @param version 目标版本
 */
async function installSharedVersion(mod: GameMod, version: GameModVersion) {
    if (!user.jwtToken) {
        ui.showErrorMessage(t("game-launcher.loginToDownload"))
        return
    }
    shareInstalling.value = `${mod.id}:${version.id}`
    try {
        const bytes = await downloadGameModVersion(mod.id, version.id, user.jwtToken)
        await installDownloadedMod(mod, bytes, `${mod.name} v${version.version}`)
    } catch (error) {
        console.error("下载安装 MOD 版本失败:", error)
        ui.showErrorMessage(t("game-launcher.modDownloadFailed", { error: error instanceof Error ? error.message : String(error) }))
    } finally {
        shareInstalling.value = null
    }
}
//#endregion

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
 * 选择用第几张预览图作为封面（清空单独上传的封面）。
 * @param index 预览图下标
 */
function selectUploadCover(index: number) {
    uploadCover.value = undefined
    uploadCoverIndex.value = index
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
                cover: uploadCover.value,
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
        if (detailMod.value?.id === versionMod.value.id) {
            await openDetail(detailMod.value)
        }
    } catch (error) {
        console.error("上传新版本失败:", error)
        ui.showErrorMessage(t("game-launcher.uploadVersionFailed", { error: error instanceof Error ? error.message : String(error) }))
    } finally {
        versionSubmitting.value = false
    }
}
//#endregion

onMounted(() => {
    if (!game.selectedEntity && isSingleTab.value) {
        game.selectedEntity = ""
    }
})
</script>

<template>
    <div
        class="w-full h-full flex flex-col relative"
        @dragenter="handleNativeDragEnter"
        @dragover="handleNativeDragOver"
        @dragleave="handleNativeDragLeave"
        @drop="handleNativeDrop"
    >
        <!-- 子分类页签 -->
        <nav class="flex-none flex items-center gap-1 px-2 border-b border-base-300 bg-base-100 relative">
            <div
                class="pointer-events-none absolute inset-0"
                style="
                    background-image:
                        linear-gradient(to right, color-mix(in oklab, var(--color-base-content) 6%, transparent) 1px, transparent 1px),
                        linear-gradient(to bottom, color-mix(in oklab, var(--color-base-content) 6%, transparent) 1px, transparent 1px);
                    background-size: 40px 40px;
                    mask-image: linear-gradient(to bottom, black, transparent 90%);
                "
                aria-hidden="true"
            />
            <button
                v-for="type in MOD_TYPES"
                :key="type"
                type="button"
                class="px-3 py-2 text-sm rounded-t-lg border-b-2 transition-colors flex items-center gap-1.5"
                :class="
                    modType === type
                        ? 'border-primary text-primary font-semibold'
                        : 'border-transparent text-base-content/60 hover:text-base-content'
                "
                @click="modType = type"
            >
                <Icon :icon="MOD_TYPE_ICONS[type]" class="size-4" />
                {{ $t(`game-launcher.${type}`) }}
            </button>
            <button
                v-if="modType !== 'share'"
                type="button"
                class="ml-auto btn btn-square btn-ghost btn-xs tooltip tooltip-bottom"
                :data-tip="$t('game-launcher.addModManually')"
                @click="addModManually()"
            >
                <Icon icon="ri:add-line" class="size-4" />
            </button>
            <input ref="modFileInput" type="file" accept=".zip,.pak,.paks" multiple class="hidden" @change="onModFileInputChange" />
        </nav>

        <!-- 角色/武器/其他 单选管理（实体列表跟随顶部页签） -->
        <div v-if="isSingleTab" class="flex-1 min-h-0 flex overflow-hidden">
            <!-- 左侧：实体列表 -->
            <div class="flex-none w-52 overflow-hidden flex flex-col border-r border-base-300">
                <ScrollArea class="flex-1">
                    <transition-group name="list" tag="ul" class="list">
                        <template v-if="modType === 'custom'">
                            <ContextMenu v-for="item in sortedEntitys" :key="item.name">
                                <template #menu>
                                    <ContextMenuItem
                                        class="group text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-disabled:text-base-content/60 data-disabled:pointer-events-none data-highlighted:bg-primary data-highlighted:text-base-100"
                                        @click="game.removeCustomEntity(item as CustomEntity)"
                                    >
                                        {{ $t("game-launcher.delete") }}
                                    </ContextMenuItem>
                                </template>
                                <li
                                    class="flex gap-2 p-2 items-center cursor-pointer min-w-52 justify-between rounded-none hover:bg-primary/20 transition-colors"
                                    :class="{ 'bg-base-300': item.name === game.selectedEntity }"
                                    @click="game.selectedEntity = item.name"
                                >
                                    <div>
                                        <Icon :icon="item.icon as IconTypes" class="size-10 rounded-box" />
                                    </div>
                                    <div class="flex-1">
                                        <div>{{ item.name }}</div>
                                        <div class="text-xs font-semibold opacity-60">{{ item.count }}</div>
                                    </div>
                                    <button
                                        class="btn btn-square btn-sm btn-ghost"
                                        :class="{ 'text-primary': game.likedChars.includes(item.name) }"
                                        @click.stop="game.likeChar(item.name)"
                                    >
                                        <Icon
                                            :icon="game.likedChars.includes(item.name) ? 'ri:heart-fill' : 'ri:heart-line'"
                                            class="size-[1.2em]"
                                        />
                                    </button>
                                </li>
                            </ContextMenu>
                            <li class="flex gap-2 p-2 items-center min-w-52 rounded-none">
                                <button class="btn w-full" onclick="add_custom_entity_modal.show()">
                                    {{ $t("game-launcher.addCustomType") }}
                                </button>
                                <dialog id="add_custom_entity_modal" class="modal z-10">
                                    <div class="modal-box">
                                        <h3 class="text-lg font-bold">{{ $t("game-launcher.addCustomType") }}</h3>
                                        <p class="py-4">
                                            <input
                                                v-model="customEntityName"
                                                type="text"
                                                :placeholder="$t('game-launcher.enterCustomTypeName')"
                                                class="input input-bordered input-md w-full"
                                            />
                                        </p>
                                        <p class="py-4">
                                            <Select v-model="customEntityIcon" class="w-full input input-md">
                                                <SelectItem v-for="icon in customEntityIconsOptions" :key="icon" :value="icon">
                                                    <Icon :icon="icon" class="size-8 rounded-box" />
                                                </SelectItem>
                                            </Select>
                                        </p>
                                        <div class="modal-action">
                                            <form method="dialog" class="space-x-2">
                                                <button class="min-w-20 btn btn-primary" @click="addCustomEntity()">
                                                    {{ $t("setting.confirm") }}
                                                </button>
                                                <button class="min-w-20 btn">{{ $t("setting.cancel") }}</button>
                                            </form>
                                        </div>
                                    </div>
                                </dialog>
                            </li>
                        </template>
                        <template v-else>
                            <li
                                v-for="item in sortedEntitys"
                                :key="item.name"
                                class="flex gap-2 p-2 cursor-pointer min-w-52 justify-between rounded-none hover:bg-primary/20 transition-colors"
                                :class="{ 'bg-primary/40': item.name === game.selectedEntity }"
                                @click="game.selectedEntity = item.name"
                            >
                                <div>
                                    <ImageFallback class="size-10 rounded-box" :src="item.icon" :alt="item.name">
                                        <Icon icon="ri:question-mark" class="w-full h-full" />
                                    </ImageFallback>
                                </div>
                                <div class="flex-1">
                                    <div>{{ $t(item.name) }}</div>
                                    <div class="text-xs font-semibold opacity-60">{{ item.count }}</div>
                                </div>
                                <button
                                    class="btn btn-square btn-ghost"
                                    :class="{ 'text-primary': game.likedChars.includes(item.name) }"
                                    @click.stop="game.likeChar(item.name)"
                                >
                                    <Icon
                                        :icon="game.likedChars.includes(item.name) ? 'ri:heart-fill' : 'ri:heart-line'"
                                        class="size-[1.2em]"
                                    />
                                </button>
                            </li>
                        </template>
                    </transition-group>
                </ScrollArea>
            </div>

            <!-- 中间：MOD 列表（单选，含手动添加按钮） -->
            <div class="flex-1 p-2 overflow-hidden flex flex-col border-r border-base-300 gap-2 min-w-0">
                <div class="flex-none flex items-center justify-between">
                    <div class="font-bold text-primary flex items-center gap-1.5">
                        <Icon icon="ri:file-list-line" class="size-4" />
                        {{ $t("game-launcher.modList") }}
                    </div>
                    <button
                        class="btn btn-square btn-ghost btn-xs tooltip tooltip-left"
                        :data-tip="$t('game-launcher.addModManually')"
                        @click="addModManually()"
                    >
                        <Icon icon="ri:add-line" class="size-4" />
                    </button>
                </div>
                <ScrollArea class="flex-2 overflow-x-hidden overflow-y-auto">
                    <div v-if="!game.selectedEntity" class="h-40 flex justify-center items-center opacity-60">
                        {{ $t("game-launcher.selectEntityFirst") }}
                    </div>
                    <transition-group v-else name="list" tag="ul" class="list">
                        <li
                            :key="0"
                            class="flex gap-2 p-2 items-center cursor-pointer min-w-60 justify-between rounded-none hover:bg-primary/20 transition-colors"
                            :class="{ 'bg-primary/40': !entityMod }"
                            @click="setEntityMod(game.selectedEntity, 0)"
                        >
                            <div><Icon icon="ri:puzzle-line" class="size-10 rounded-box opacity-60" /></div>
                            <div class="flex-1">
                                <div>{{ $t("game-launcher.noMod") }}</div>
                            </div>
                        </li>
                        <li
                            v-for="mod in modsInEntity"
                            :key="mod.id"
                            class="flex gap-2 p-2 items-center cursor-pointer min-w-60 justify-between rounded-none hover:bg-primary/20 transition-colors"
                            :class="{ 'bg-primary/40': mod.id === entityMod?.id }"
                            @click="setEntityMod(game.selectedEntity, mod.id)"
                        >
                            <div><Icon icon="ri:puzzle-line" class="size-10 rounded-box opacity-60" /></div>
                            <div class="flex-1">
                                <div>{{ mod.name }}</div>
                                <div class="text-xs font-semibold opacity-60">
                                    {{ new Date(mod.addTime).toLocaleString() }} | {{ (mod.size / 1024 / 1024).toFixed(2) }} MB
                                </div>
                            </div>
                            <button class="btn btn-square btn-ghost" @click.stop="removeMod(mod)">
                                <Icon icon="ri:delete-bin-line" class="size-[1.2em]" />
                            </button>
                        </li>
                    </transition-group>
                </ScrollArea>
            </div>

            <!-- 右侧：预览 -->
            <div class="flex-1 p-2 overflow-hidden flex flex-col">
                <div class="flex-none font-bold text-primary flex items-center gap-1.5">
                    <Icon icon="ri:eye-line" class="size-4" />
                    {{ $t("game-launcher.preview") }}
                </div>
                <div class="flex-1 overflow-hidden flex justify-center items-center">
                    <img
                        v-if="entityMod?.pic"
                        :src="entityMod.pic"
                        :alt="$t('game-launcher.modPreview')"
                        class="max-w-full max-h-full mx-auto my-auto"
                    />
                    <div v-else class="h-40 flex justify-center items-center opacity-60">
                        {{ $t("game-launcher.noPreviewPic") }}
                    </div>
                </div>
            </div>
        </div>

        <!-- 独立（standalone）多选管理 -->
        <div v-if="isStandalone" class="flex-1 min-h-0 flex overflow-hidden">
            <div class="flex-1 p-2 overflow-hidden flex flex-col gap-2 min-w-0">
                <div class="flex-none flex items-center justify-between">
                    <div class="font-bold text-primary flex items-center gap-1.5">
                        <Icon icon="ri:stack-line" class="size-4" />
                        {{ $t("game-launcher.standalone") }}
                    </div>
                    <span class="text-xs opacity-60">{{ $t("game-launcher.standaloneHint") }}</span>
                    <button
                        class="btn btn-square btn-ghost btn-xs tooltip tooltip-left"
                        :data-tip="$t('game-launcher.addModManually')"
                        @click="addModManually()"
                    >
                        <Icon icon="ri:add-line" class="size-4" />
                    </button>
                </div>
                <ScrollArea class="flex-2 overflow-x-hidden overflow-y-auto">
                    <div v-if="standaloneMods.length === 0" class="h-40 flex justify-center items-center opacity-60">
                        {{ $t("game-launcher.noStandaloneMods") }}
                    </div>
                    <ul v-else class="list">
                        <li
                            v-for="mod in standaloneMods"
                            :key="mod.id"
                            class="flex gap-2 p-2 items-center cursor-pointer min-w-60 justify-between rounded-none hover:bg-primary/20 transition-colors"
                            :class="{ 'bg-base-300': mod.id === standalonePreview?.id }"
                            @click="standalonePreview = mod"
                        >
                            <label class="flex items-center gap-3 flex-1 cursor-pointer" @click.stop>
                                <input
                                    type="checkbox"
                                    class="checkbox checkbox-primary"
                                    :checked="standaloneEnabled.has(mod.id)"
                                    @change="toggleStandaloneMod(mod, ($event.target as HTMLInputElement).checked)"
                                />
                                <Icon icon="ri:puzzle-line" class="size-10 rounded-box opacity-60" />
                                <div class="flex-1">
                                    <div>{{ mod.name }}</div>
                                    <div class="text-xs font-semibold opacity-60">
                                        {{ new Date(mod.addTime).toLocaleString() }} | {{ (mod.size / 1024 / 1024).toFixed(2) }} MB
                                    </div>
                                </div>
                            </label>
                            <button class="btn btn-square btn-ghost" @click.stop="removeMod(mod)">
                                <Icon icon="ri:delete-bin-line" class="size-[1.2em]" />
                            </button>
                        </li>
                    </ul>
                </ScrollArea>
            </div>
            <div class="flex-1 p-2 overflow-hidden flex flex-col border-l border-base-300">
                <div class="flex-none font-bold text-primary flex items-center gap-1.5">
                    <Icon icon="ri:eye-line" class="size-4" />
                    {{ $t("game-launcher.preview") }}
                </div>
                <div class="flex-1 overflow-hidden flex justify-center items-center">
                    <img
                        v-if="standalonePreview?.pic"
                        :src="standalonePreview.pic"
                        :alt="$t('game-launcher.modPreview')"
                        class="max-w-full max-h-full mx-auto my-auto"
                    />
                    <div v-else class="h-40 flex justify-center items-center opacity-60">
                        {{ $t("game-launcher.noPreviewPic") }}
                    </div>
                </div>
            </div>
        </div>

        <!-- 分享（在线 MOD 商店） -->
        <div v-if="modType === 'share'" class="flex-1 min-h-0 flex flex-col overflow-hidden">
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
            <ScrollArea class="flex-1">
                <div v-if="shareLoading" class="h-40 flex justify-center items-center opacity-60">
                    <span class="loading loading-spinner loading-sm"></span>
                </div>
                <div v-else-if="shareFiltered.length === 0" class="h-40 flex justify-center items-center opacity-60">
                    {{ $t("game-launcher.noSharedMods") }}
                </div>
                <div v-else class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-3">
                    <div
                        v-for="mod in shareFiltered"
                        :key="mod.id"
                        class="card bg-base-200/70 border border-base-300 shadow-sm hover:border-primary/60 hover:shadow-md transition-all cursor-pointer group"
                        @click="openDetail(mod)"
                    >
                        <figure class="px-3 pt-3 relative">
                            <img
                                v-if="mod.coverUrl"
                                :src="mod.coverUrl"
                                :alt="mod.name"
                                loading="lazy"
                                class="w-full aspect-video object-cover rounded-lg group-hover:opacity-90 transition-opacity"
                            />
                            <div v-else class="w-full aspect-video rounded-lg bg-base-300 flex justify-center items-center opacity-60">
                                <Icon icon="ri:image-line" class="size-10" />
                            </div>
                            <span v-if="mod.isRecommended" class="absolute top-4 left-4 badge badge-sm badge-primary gap-1">
                                <Icon icon="ri:fire-line" class="size-3" />
                                {{ $t("game-launcher.recommended") }}
                            </span>
                            <span v-if="mod.isPinned" class="absolute top-4 right-4 badge badge-sm badge-ghost gap-1">
                                <Icon icon="ri:pushpin-2-line" class="size-3" />
                            </span>
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
                        <div class="card-body p-3 gap-1">
                            <div class="flex items-center gap-1 flex-wrap">
                                <span class="font-bold text-sm truncate flex-1">{{ mod.name }}</span>
                                <span class="badge badge-sm badge-ghost">{{ categoryLabel(mod.category) }}</span>
                            </div>
                            <p v-if="mod.description" class="text-xs opacity-70 line-clamp-2">{{ stripMarkdown(mod.description) }}</p>
                            <div v-if="mod.requires?.length" class="text-xs opacity-60 truncate">
                                {{ $t("game-launcher.modRequires") }}: {{ mod.requires.join(", ") }}
                            </div>
                            <div class="flex items-center justify-between mt-1">
                                <span class="text-xs opacity-60 flex items-center gap-1">
                                    <Icon icon="ri:download-2-line" class="size-3.5" />
                                    {{ mod.downloads }}
                                    <span class="opacity-40">·</span>
                                    <Icon icon="ri:eye-line" class="size-3.5" />
                                    {{ mod.views }}
                                </span>
                                <span class="text-xs opacity-60 truncate max-w-20">{{ mod.user?.name || "—" }}</span>
                            </div>
                            <div class="flex items-center gap-1 mt-1">
                                <button
                                    v-if="isLoggedIn"
                                    class="btn btn-primary btn-sm flex-1"
                                    :class="{ 'btn-disabled': shareInstalling === mod.id }"
                                    @click.stop="installSharedMod(mod)"
                                >
                                    <span v-if="shareInstalling === mod.id" class="loading loading-spinner loading-xs"></span>
                                    <Icon v-else icon="ri:download-2-line" class="size-4" />
                                    {{ shareInstalling === mod.id ? $t("game-launcher.installing") : $t("game-launcher.download") }}
                                </button>
                                <button v-else class="btn btn-sm btn-ghost flex-1" disabled>
                                    <Icon icon="ri:lock-line" class="size-4" />
                                    {{ $t("game-launcher.loginToDownload") }}
                                </button>
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
        </div>

        <!-- 上传 MOD 弹窗 -->
        <dialog class="modal" :class="{ 'modal-open': uploadOpen }">
            <div
                class="bg-base-100 border border-base-300 rounded-xl shadow-xl max-w-lg w-full p-4 flex flex-col gap-3 max-h-[90vh] overflow-auto row-start-1 col-start-1"
            >
                <h3 class="text-lg font-bold flex items-center gap-2">
                    <Icon icon="ri:upload-2-line" class="size-5 text-primary" />
                    {{ $t("game-launcher.uploadMod") }}
                </h3>
                <!-- 格式要求提示 -->
                <div class="text-xs bg-primary/10 border border-primary/30 rounded-lg p-2.5 text-base-content/80 flex gap-2">
                    <Icon icon="ri:file-zip-line" class="size-4 text-primary flex-none mt-0.5" />
                    <span>{{ $t("game-launcher.modFormatHint") }}</span>
                </div>
                <input ref="zipInput" type="file" accept=".zip,application/zip" class="hidden" @change="onZipInputChange" />
                <input ref="coverInput" type="file" accept="image/*" class="hidden" @change="onCoverInputChange" />
                <input ref="imagesInput" type="file" accept="image/*" multiple class="hidden" @change="onImagesInputChange" />
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
                        <img :src="objectUrl(image)" :alt="image.name" class="w-16 h-12 object-cover rounded-lg border border-base-300" />
                        <button
                            class="absolute -top-1.5 -right-1.5 btn btn-square btn-xs btn-error opacity-0 group-hover:opacity-100 transition-opacity"
                            @click="removeUploadImage(index)"
                        >
                            <Icon icon="ri:close-line" class="size-3" />
                        </button>
                    </div>
                </div>

                <!-- 封面选择：预览图作封面 或 单独上传 -->
                <div class="text-sm font-semibold flex items-center gap-1.5">
                    <Icon icon="ri:image-add-line" class="size-4 text-primary" />
                    {{ $t("game-launcher.coverSource") }}
                </div>
                <div v-if="uploadImages.length" class="flex flex-wrap gap-2 items-center">
                    <button
                        v-for="(image, index) in uploadImages"
                        :key="`cover-${index}`"
                        type="button"
                        class="relative btn btn-ghost btn-xs p-0 border rounded-lg overflow-hidden"
                        :class="{ 'border-primary ring-2 ring-primary/40': uploadCoverIndex === index }"
                        @click="selectUploadCover(index)"
                    >
                        <img :src="objectUrl(image)" :alt="image.name" class="w-14 h-10 object-cover" />
                        <span
                            v-if="uploadCoverIndex === index"
                            class="absolute inset-0 flex items-center justify-center bg-primary/40 text-white"
                        >
                            <Icon icon="ri:checkbox-circle-fill" class="size-5" />
                        </span>
                    </button>
                </div>
                <div class="flex items-center gap-2">
                    <button class="btn btn-sm btn-ghost" :class="{ 'btn-primary': uploadCover }" @click="coverInput?.click()">
                        <Icon icon="ri:upload-cloud-line" class="size-4" />
                        {{ $t("game-launcher.coverUpload") }}
                    </button>
                    <span class="text-xs opacity-70 truncate flex-1">{{ uploadCover?.name || $t("game-launcher.noFileSelected") }}</span>
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

                <div class="flex justify-end gap-2">
                    <button class="min-w-20 btn btn-primary" :class="{ 'btn-disabled': uploadSubmitting }" @click="submitUpload()">
                        <span v-if="uploadSubmitting" class="loading loading-spinner loading-xs"></span>
                        {{ $t("game-launcher.publish") }}
                    </button>
                    <button class="min-w-20 btn" @click="uploadOpen = false">{{ $t("setting.cancel") }}</button>
                </div>
            </div>
            <div class="modal-backdrop" @click="uploadOpen = false" />
        </dialog>

        <!-- MOD 详情弹窗 -->
        <dialog class="modal" :class="{ 'modal-open': !!detailMod }">
            <div
                v-if="detailMod"
                class="bg-base-100 border border-base-300 rounded-xl shadow-xl w-184 max-w-[92vw] flex flex-col max-h-[88vh] overflow-hidden row-start-1 col-start-1"
            >
                <div class="flex-none flex items-center gap-2 px-4 py-3 border-b border-base-300">
                    <Icon icon="ri:file-zip-line" class="size-5 text-primary" />
                    <span class="font-bold text-lg truncate">{{ detailMod.name }}</span>
                    <span class="badge badge-sm badge-ghost">{{ categoryLabel(detailMod.category) }}</span>
                    <button class="ml-auto btn btn-square btn-ghost btn-sm" @click="detailMod = null">
                        <Icon icon="ri:close-line" class="size-4" />
                    </button>
                </div>
                <ScrollArea class="flex-1">
                    <div class="p-4 flex flex-col gap-3">
                        <!-- 图片画廊 -->
                        <div class="flex gap-3">
                            <div
                                class="flex-none w-64 h-40 overflow-hidden rounded-lg border border-base-300 bg-base-200 flex items-center justify-center"
                            >
                                <img :src="detailImageSrc" :alt="detailMod.name" class="w-full h-full object-cover" />
                            </div>
                            <div class="flex-1 min-w-0 flex flex-col gap-2 justify-center">
                                <div class="flex items-center gap-3 text-xs opacity-70 flex-wrap">
                                    <span class="flex items-center gap-1">
                                        <Icon icon="ri:download-2-line" class="size-3.5" />
                                        {{ detailMod.downloads }}
                                    </span>
                                    <span class="flex items-center gap-1">
                                        <Icon icon="ri:eye-line" class="size-3.5" />
                                        {{ detailMod.views }}
                                    </span>
                                    <span class="flex items-center gap-1">
                                        <Icon icon="ri:user-line" class="size-3.5" />
                                        {{ detailMod.user?.name || "—" }}
                                    </span>
                                    <span class="flex items-center gap-1">
                                        <Icon icon="ri:time-line" class="size-3.5" />
                                        {{ new Date(detailMod.createdAt).toLocaleString() }}
                                    </span>
                                </div>
                                <div v-if="detailMod.entity" class="text-xs">
                                    {{ $t("game-launcher.modEntity") }}:
                                    <span class="badge badge-sm badge-primary">{{ detailMod.entity }}</span>
                                </div>
                                <div v-if="detailMod.requires?.length" class="text-xs flex items-center gap-1 flex-wrap">
                                    {{ $t("game-launcher.modRequires") }}:
                                    <span v-for="req in detailMod.requires" :key="req" class="badge badge-sm badge-warning">{{ req }}</span>
                                </div>
                                <div v-if="!detailMod.source" class="text-xs flex items-center gap-1.5 flex-wrap">
                                    <span class="badge badge-sm badge-primary gap-1">
                                        <Icon icon="ri:pencil-fill" class="size-3" />
                                        {{ $t("game-launcher.isOriginal") }}
                                    </span>
                                </div>
                                <div v-else class="text-xs flex items-start gap-1.5">
                                    <span class="badge badge-sm badge-ghost gap-1 flex-none">
                                        <Icon icon="ri:external-link-line" class="size-3" />
                                        {{ $t("game-launcher.reprint") }}
                                    </span>
                                    <span class="min-w-0 break-all leading-5" v-html="renderSourceLinks(detailMod.source || '')"></span>
                                </div>
                            </div>
                        </div>
                        <!-- 缩略图选择（封面 + 预览图，静态直链） -->
                        <div v-if="(detailMod.images?.length ?? 0) > 0" class="flex items-center gap-2 flex-wrap">
                            <button
                                v-if="detailMod.coverUrl"
                                type="button"
                                class="btn btn-ghost btn-xs p-0 border rounded-lg overflow-hidden"
                                :class="{ 'border-primary ring-2 ring-primary/40': detailImageIndex === -1 }"
                                @click="detailImageIndex = -1"
                            >
                                <img :src="detailMod.coverUrl" alt="cover" class="w-16 h-12 object-cover" />
                            </button>
                            <button
                                v-for="(image, index) in detailMod.images"
                                :key="index"
                                type="button"
                                class="btn btn-ghost btn-xs p-0 border rounded-lg overflow-hidden"
                                :class="{ 'border-primary ring-2 ring-primary/40': detailImageIndex === index }"
                                @click="detailImageIndex = index"
                            >
                                <img :src="image" :alt="`preview-${index}`" class="w-16 h-12 object-cover" />
                            </button>
                        </div>
                        <!-- 描述（markdown 渲染） -->
                        <div v-if="detailMod.description" class="mod-markdown text-sm" v-html="renderMarkdown(detailMod.description)"></div>

                        <!-- 版本列表 -->
                        <div v-if="detailMod.versions?.length" class="flex flex-col gap-1.5">
                            <div class="text-sm font-semibold flex items-center gap-1.5">
                                <Icon icon="ri:stack-line" class="size-4 text-primary" />
                                {{ $t("game-launcher.versionHistory") }}
                            </div>
                            <div
                                v-for="(version, index) in detailMod.versions"
                                :key="version.id"
                                class="flex items-center gap-2 rounded-lg border border-base-300 bg-base-200/50 px-2.5 py-2"
                            >
                                <Icon icon="ri:file-zip-line" class="size-5 text-primary/70 flex-none" />
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center gap-1.5 flex-wrap">
                                        <span class="text-sm font-medium">{{ version.version }}</span>
                                        <span v-if="index === 0" class="badge badge-xs badge-primary">{{
                                            $t("game-launcher.latest")
                                        }}</span>
                                        <span class="text-[11px] opacity-50">
                                            {{ new Date(version.createdAt).toLocaleString() }} ·
                                            {{ (version.fileSize / 1024 / 1024).toFixed(2) }} MB · {{ version.downloads }} 下载
                                        </span>
                                    </div>
                                    <div v-if="version.changelog" class="text-xs opacity-70 line-clamp-2">{{ version.changelog }}</div>
                                </div>
                                <button
                                    v-if="isLoggedIn"
                                    class="btn btn-sm btn-ghost btn-square"
                                    :class="{ 'btn-disabled': shareInstalling === `${detailMod.id}:${version.id}` }"
                                    :data-tip="$t('game-launcher.download')"
                                    @click="installSharedVersion(detailMod, version)"
                                >
                                    <span
                                        v-if="shareInstalling === `${detailMod.id}:${version.id}`"
                                        class="loading loading-spinner loading-xs"
                                    ></span>
                                    <Icon v-else icon="ri:download-2-line" class="size-4" />
                                </button>
                            </div>
                        </div>

                        <button
                            v-if="isLoggedIn"
                            class="btn btn-primary"
                            :class="{ 'btn-disabled': shareInstalling === detailMod.id }"
                            @click="installSharedMod(detailMod)"
                        >
                            <span v-if="shareInstalling === detailMod.id" class="loading loading-spinner loading-xs"></span>
                            <Icon v-else icon="ri:download-2-line" class="size-4" />
                            {{ shareInstalling === detailMod.id ? $t("game-launcher.installing") : $t("game-launcher.downloadLatest") }}
                        </button>
                        <button v-else class="btn btn-ghost" disabled>
                            <Icon icon="ri:lock-line" class="size-4" />
                            {{ $t("game-launcher.loginToDownload") }}
                        </button>
                    </div>
                </ScrollArea>
            </div>
            <div class="modal-backdrop" @click="detailMod = null" />
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

        <!-- 导入进度 -->
        <div
            v-if="modImportProgress !== null"
            class="fixed bottom-4 left-1/2 z-50 w-64 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded border border-base-300 bg-base-100 p-3 shadow-lg"
            role="status"
            aria-live="polite"
        >
            <div class="mb-2 text-center text-sm font-medium tabular-nums">{{ modImportProgress }}%</div>
            <progress class="progress progress-primary block h-2 w-full" :value="modImportProgress" max="100" />
        </div>
        <div v-if="isDragging" class="fixed inset-0 flex items-center justify-center bg-black/50 z-50" @click="isDragging = false">
            <div class="bg-base-200 p-8 rounded-lg text-2xl font-bold text-primary shadow-xl">
                {{ $t("game-launcher.dropToImport") }}
            </div>
        </div>
    </div>
</template>

<style>
/* MOD 详情的 markdown 渲染样式（v-html 内容不受 scoped 样式影响，使用普通样式块） */
.mod-markdown {
    color: var(--color-base-content);
    line-height: 1.65;
}
.mod-markdown h1,
.mod-markdown h2,
.mod-markdown h3,
.mod-markdown h4 {
    font-weight: 700;
    margin: 0.7em 0 0.35em;
    line-height: 1.3;
}
.mod-markdown h1 {
    font-size: 1.35em;
}
.mod-markdown h2 {
    font-size: 1.2em;
}
.mod-markdown h3 {
    font-size: 1.08em;
}
.mod-markdown p {
    margin: 0.4em 0;
}
.mod-markdown ul {
    list-style: disc;
    padding-left: 1.4em;
    margin: 0.4em 0;
}
.mod-markdown ol {
    list-style: decimal;
    padding-left: 1.4em;
    margin: 0.4em 0;
}
.mod-markdown li {
    margin: 0.15em 0;
}
.mod-markdown code {
    background: color-mix(in oklab, var(--color-base-content) 10%, transparent);
    padding: 0.1em 0.35em;
    border-radius: 4px;
    font-size: 0.9em;
}
.mod-markdown pre {
    background: color-mix(in oklab, var(--color-base-content) 8%, transparent);
    padding: 0.75em;
    border-radius: 8px;
    overflow-x: auto;
    margin: 0.5em 0;
}
.mod-markdown pre code {
    background: transparent;
    padding: 0;
}
.mod-markdown blockquote {
    border-left: 3px solid color-mix(in oklab, var(--color-primary) 60%, transparent);
    padding-left: 0.75em;
    margin: 0.5em 0;
    opacity: 0.85;
}
.mod-markdown a {
    color: var(--color-primary);
    text-decoration: underline;
}
.mod-markdown img {
    max-width: 100%;
    border-radius: 8px;
}
.mod-markdown hr {
    border-color: color-mix(in oklab, var(--color-base-content) 20%, transparent);
    margin: 0.75em 0;
}
.mod-markdown table {
    border-collapse: collapse;
    margin: 0.5em 0;
    font-size: 0.95em;
}
.mod-markdown th,
.mod-markdown td {
    border: 1px solid color-mix(in oklab, var(--color-base-content) 25%, transparent);
    padding: 0.3em 0.6em;
}
.mod-markdown th {
    background: color-mix(in oklab, var(--color-base-content) 8%, transparent);
    font-weight: 600;
}
</style>
