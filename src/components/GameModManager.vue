<script setup lang="ts">
import { open as openFileDialog } from "@tauri-apps/plugin-dialog"
import { t } from "i18next"
import { computed, onMounted, ref, watch } from "vue"
import type { GameMod } from "@/api/gen/api-types"
import { useSearchParam } from "@/composables/useSearchParam.ts"
import { charData, LeveledChar, weaponData } from "@/data"
import { env } from "@/env"
import type { CustomEntity, Mod } from "@/store/db"
import { STANDALONE_ENTITY } from "@/store/db"
import { useGameStore } from "@/store/game"
import { useUIStore } from "@/store/ui"
import type { IconTypes } from "./Icon.vue"

/**
 * 游戏启动器的 MOD 管理组件。
 * 分类：角色（单选）、武器（单选）、其他/自定义（单选）、独立（多选）、分享（在线商店，由 GameModStore 承载）。
 * 界面参考首页设计语言：纸面 + 主色强调线 + 引导网格 + 斜切楔形，整体保持紧凑。
 */

const ui = useUIStore()
const game = useGameStore()

/** 子分类页签 */
const MOD_TYPES = ["char", "weapon", "custom", "standalone", "share"] as const
type ModType = (typeof MOD_TYPES)[number]
const modType = useSearchParam<ModType>("t", "share")

/** web 端不提供本地 MOD 管理：隐藏页签、锁定分享页签，避免触发仅桌面端可用的 API。 */
const isWeb = !env.isApp
if (isWeb) {
    // 强制锁定分享页签（同时把 URL 中的本地管理页签参数清掉）
    modType.value = "share"
}

// web 端 URL 参数被改成本地管理页签时强制拉回分享页签
watch(modType, value => {
    if (isWeb && value !== "share") modType.value = "share"
})

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
        // 仅桌面端提供本地 MOD 管理
        if (!env.isApp) return
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
        if (!env.isApp) return
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
        // 仅桌面端提供本地 MOD 管理
        if (!env.isApp) return
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
        // 仅桌面端提供本地 MOD 管理
        if (!env.isApp) return
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
 * 处理原生 H5 文件拖放并导入 MOD 或预览图（web 端不提供本地导入，直接忽略）。
 * @param event 原生拖拽事件
 */
async function handleNativeDrop(event: DragEvent) {
    event.preventDefault()
    dragDepth = 0
    isDragging.value = false

    // web 端不提供本地 MOD 管理，拖入文件直接忽略
    if (isWeb) return

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

//#region 分享（在线 MOD 商店）：列表/上传/新版本由 GameModStore 独立组件承载
/** 详情弹窗中的 MOD。 */
const detailMod = ref<GameMod | null>(null)

/**
 * 打开 MOD 详情弹窗（完整数据由 GameModDetail 内部拉取）。
 * @param mod MOD 对象
 */
function openDetail(mod: GameMod) {
    detailMod.value = mod
}

/**
 * MOD 安装成功后刷新本地列表（详情组件通过 installed 事件通知）。
 */
function refreshLocalMods() {
    if (isStandalone.value) {
        void refreshStandalone()
    } else if (isSingleTab.value) {
        void updateEntityMod()
    }
}
//#endregion

onMounted(() => {
    // 仅桌面端提供本地 MOD 管理
    if (!env.isApp) return
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
        <!-- 子分类页签（web 端隐藏：仅提供在线商店） -->
        <nav v-if="env.isApp" class="flex-none flex items-center gap-1 px-2 border-b border-base-300 bg-base-100 relative">
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

        <!-- 角色/武器/其他 单选管理（实体列表跟随顶部页签；仅桌面端） -->
        <div v-if="env.isApp && isSingleTab" class="flex-1 min-h-0 flex overflow-hidden">
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

        <!-- 独立（standalone）多选管理（仅桌面端） -->
        <div v-if="env.isApp && isStandalone" class="flex-1 min-h-0 flex overflow-hidden">
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

        <!-- 分享（在线 MOD 商店）：复用独立组件 GameModStore，弹窗模式点击卡片弹详情 -->
        <GameModStore
            v-if="modType === 'share'"
            class="flex-1 min-h-0"
            @open-detail="openDetail"
            @installed="refreshLocalMods"
        />

        <!-- MOD 详情弹窗（内容复用独立组件 GameModDetail，ScrollArea 滚动容器在组件内部） -->
        <dialog class="modal" :class="{ 'modal-open': !!detailMod }">
            <div
                v-if="detailMod"
                class="bg-base-100 border border-base-300 rounded-xl shadow-xl w-184 max-w-[92vw] flex flex-col h-[88vh] overflow-hidden row-start-1 col-start-1"
            >
                <GameModDetail
                    :mod-id="detailMod.id"
                    :initial-mod="detailMod"
                    closable
                    class="flex-1 min-h-0"
                    @close="detailMod = null"
                    @installed="refreshLocalMods"
                />
            </div>
            <div class="modal-backdrop" @click="detailMod = null" />
        </dialog>

        <!-- 导入进度 -->
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
