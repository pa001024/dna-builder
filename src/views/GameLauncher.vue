<script setup lang="ts">
import * as dialog from "@tauri-apps/plugin-dialog"
import { t } from "i18next"
import { computed, onMounted, ref, watchEffect } from "vue"
import { deleteFile, openExplorer, removeDirAll } from "../api/app"
import type { IconTypes } from "../components/Icon.vue"
import { charData, LeveledChar, weaponData } from "../data"
import { useCloudGameStore } from "../store/cloudgame"
import type { CustomEntity, Mod } from "../store/db"
import { useGameStore } from "../store/game"
import { useUIStore } from "../store/ui"

// 状态管理
const ui = useUIStore()
const keys = ["path", "beforeGame", "afterGame"] as const
const tab = ref("update")
const cloudgame = useCloudGameStore()
const game = useGameStore()

//#region 启动
async function selectPath(key: (typeof keys)[number]) {
    const result = await dialog.open({
        defaultPath: game[key],
        filters:
            key === "path"
                ? [{ name: "EM.exe", extensions: ["exe"] }]
                : [
                      { name: t("misc.exec_files"), extensions: ["exe", "bat", "cmd", "ahk", "ps1"] },
                      { name: t("misc.all_files"), extensions: ["*"] },
                  ],
    })
    if (result) {
        game[key] = result
    }
}

// 打开游戏所在目录
const openGameDirectory = async () => {
    if (!game.path) {
        ui.showErrorMessage(t("game-launcher.selectGamePathFirst"))
        return
    }

    try {
        await openExplorer(game.gameDir)
    } catch (error) {
        console.error("打开目录失败:", error)
        ui.showErrorMessage(t("game-launcher.openDirFailed", { error: error instanceof Error ? error.message : String(error) }))
    }
}

/**
 * 卸载游戏目录内容。
 */
const uninstallGame = async () => {
    if (!game.gameDir) {
        ui.showErrorMessage(t("game-launcher.selectGamePathFirst"))
        return
    }

    const confirmed = await ui.showDialog(t("game-launcher.uninstall"), t("game-launcher.confirmUninstall"))
    if (!confirmed) return

    try {
        await deleteFile(game.path, true)
        await deleteFile(`${game.gameDir}BaseVersion.json`, true)
        await deleteFile(`${game.gameDir}GameVersion.json`, true)
        await deleteFile(`${game.gameDir}.extracting`, true)
        await removeDirAll(`${game.gameDir}EM`)
        await removeDirAll(`${game.gameDir}Engine`)
        await game.refreshGameInstalled()
        ui.showSuccessMessage(t("game-launcher.uninstallSuccess"))
    } catch (error) {
        console.error("卸载游戏失败:", error)
        ui.showErrorMessage(t("game-launcher.uninstallFailed", { error: error instanceof Error ? error.message : String(error) }))
    }
}

const launchGame = async () => {
    if (!game.path) {
        ui.showErrorMessage(t("game-launcher.selectGameFileFirst"))
        return
    }
    try {
        await game.launchGame()
    } catch (error) {
        console.error("启动游戏失败:", error)
        ui.showErrorMessage(t("game-launcher.launchGameFailed", { error: error instanceof Error ? error.message : String(error) }))
    }
}

const cloudGameEntryTitle = computed(() => {
    if (cloudgame.opening) return "正在打开云游戏窗口"
    if (cloudgame.isBridgeConnected) return "聚焦云游戏窗口（已连通）"
    if (cloudgame.isWindowOpen) return "聚焦云游戏窗口"
    return "打开云游戏窗口"
})

/**
 * 从游戏启动页打开或聚焦云游戏窗口。
 */
async function openCloudGameFromLauncher() {
    await cloudgame.openOrFocusCloudGame()
}
//#endregion

//#region MOD 管理
const entityTypes = ["char", "weapon", "custom"] as const
const entityType = ref<(typeof entityTypes)[number]>("char")
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
 * 刷新当前实体分类及每个实体的 MOD 数量。
 */
async function refreshEntities() {
    if (entityType.value === "custom") {
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

    const data = entityType.value === "char" ? charData : weaponData
    entitys.value = await Promise.all(
        data.map(async entity => ({
            name: entity.名称,
            icon: LeveledChar.url(entity.icon),
            count: await game.getModsCountByEntity(entity.名称),
        }))
    )
}

watchEffect(() => {
    void refreshEntities()
})

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
 * 刷新当前实体的 MOD 列表和启用状态。
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

watchEffect(() => {
    void updateEntityMod()
})

/**
 * 设置实体当前启用的 MOD。
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

/**
 * 删除指定 MOD。
 * @param mod 待删除的 MOD
 */
async function removeMod(mod: Mod) {
    try {
        await game.removeMod(mod)
        await updateEntityMod()
        ui.showSuccessMessage(t("game-launcher.modDeleted"))
    } catch (error) {
        console.error("删除MOD失败:", error)
        ui.showErrorMessage(t("game-launcher.deleteModFailed", { error: error instanceof Error ? error.message : String(error) }))
    }
}

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
    if (!game.selectedEntity) {
        ui.showErrorMessage(t("game-launcher.selectEntityFirst"))
        return
    }
    if (!game.path) {
        ui.showErrorMessage(t("game-launcher.selectGameFileFirst"))
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

/**
 * 初始化云游戏监听。
 */
onMounted(async () => {
    await cloudgame.initCloudGameTracking()
})
//#endregion
</script>

<template>
    <div
        class="flex flex-col h-full overflow-hidden relative"
        @dragenter="handleNativeDragEnter"
        @dragover="handleNativeDragOver"
        @dragleave="handleNativeDragLeave"
        @drop="handleNativeDrop"
    >
        <div class="flex-none tabs tabs-lift tabs-lg items-center gap-1">
            <input v-model="tab" type="radio" name="game_mod" class="tab" value="update" :aria-label="$t('game-launcher.gameUpdate')" />
            <input v-model="tab" type="radio" name="game_mod" class="tab" value="setting" :aria-label="$t('game-launcher.gameSetting')" />
            <input v-model="tab" type="radio" name="game_mod" class="tab" value="mod" :aria-label="$t('game-launcher.modManager')" />
            <div
                class="ml-auto btn btn-square tooltip tooltip-bottom"
                :data-tip="$t('game-launcher.openGameDir')"
                @click="openGameDirectory()"
            >
                <Icon icon="ri:folder-line" class="w-6 h-6" />
            </div>
            <div
                class="btn btn-square tooltip tooltip-bottom"
                :class="{ 'btn-primary': cloudgame.isWindowOpen || cloudgame.opening }"
                :data-tip="cloudGameEntryTitle"
                @click="openCloudGameFromLauncher()"
            >
                <Icon :icon="cloudgame.isBridgeConnected ? 'ri:cloud-fill' : 'ri:cloud-line'" class="w-6 h-6" />
            </div>
            <div class="btn btn-square btn-error tooltip tooltip-bottom" :data-tip="$t('game-launcher.uninstall')" @click="uninstallGame()">
                <Icon icon="ri:delete-bin-6-line" class="w-6 h-6" />
            </div>
            <div class="w-40 btn btn-primary mx-2" :class="{ 'btn-disabled': game.running }" @click="launchGame()">
                <Icon icon="ri:rocket-2-line" class="w-6 h-6" />
                {{ $t("game-launcher.launch") }}
            </div>
        </div>
        <div v-if="tab === 'mod'" class="flex-1 bg-base-100 border-base-300 flex relative h-full overflow-hidden">
            <div class="flex-none overflow-hidden flex flex-col">
                <div class="flex-none p-1">
                    <Select v-model="entityType" class="w-full inline-flex items-center justify-between input input-sm whitespace-nowrap">
                        <SelectItem v-for="type in entityTypes" :key="type" :value="type">
                            {{ $t(`game-launcher.${type}`) }}
                        </SelectItem>
                    </Select>
                </div>
                <ScrollArea class="flex-1">
                    <transition-group name="list" tag="ul" class="list">
                        <template v-if="entityType === 'custom'">
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
                                    class="list-row cursor-pointer min-w-60 justify-between rounded-none"
                                    :class="{ 'bg-base-300': item.name === game.selectedEntity }"
                                    @click="game.selectedEntity = item.name"
                                >
                                    <div>
                                        <Icon :icon="item.icon as IconTypes" class="size-10 rounded-box" />
                                    </div>
                                    <div>
                                        <div>{{ item.name }}</div>
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
                            </ContextMenu>
                            <li class="list-row min-w-60 rounded-none flex">
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
                                            <Select
                                                v-model="customEntityIcon"
                                                class="w-full inline-flex items-center justify-between input input-md whitespace-nowrap"
                                            >
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
                                class="list-row cursor-pointer min-w-60 justify-between rounded-none"
                                :class="{ 'bg-base-300': item.name === game.selectedEntity }"
                                @click="game.selectedEntity = item.name"
                            >
                                <div>
                                    <ImageFallback class="size-10 rounded-box" :src="item.icon" :alt="item.name">
                                        <Icon icon="ri:question-mark" class="w-full h-full" />
                                    </ImageFallback>
                                </div>
                                <div>
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
            <div class="flex-1 p-2 overflow-hidden flex flex-col border-l border-r border-base-300 gap-2">
                <div class="flex-none font-bold text-primary">{{ $t("game-launcher.modList") }}</div>
                <ScrollArea class="flex-2 overflow-x-hidden overflow-y-auto">
                    <div v-if="!game.selectedEntity" class="h-40 flex justify-center items-center opacity-60">
                        {{ $t("game-launcher.selectEntityFirst") }}
                    </div>
                    <transition-group name="list" tag="ul" class="list">
                        <li
                            v-if="game.selectedEntity"
                            :key="0"
                            class="list-row cursor-pointer min-w-60 justify-between rounded-none"
                            :class="{ 'bg-base-300': !entityMod }"
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
                            class="list-row cursor-pointer min-w-60 justify-between rounded-none"
                            :class="{ 'bg-base-300': mod.id === entityMod?.id }"
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
            <div class="flex-1 p-2 overflow-hidden flex flex-col">
                <div class="flex-none font-bold text-primary">{{ $t("game-launcher.preview") }}</div>
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
        <ScrollArea v-if="tab === 'setting'" class="flex-1">
            <div class="bg-base-100 p-4">
                <div class="max-w-6xl m-auto">
                    <div v-for="key in keys" :key="key">
                        <div class="p-2 flex flex-row justify-between items-center flex-wrap">
                            <label class="label cursor-pointer space-x-2 min-w-32 justify-start">
                                <input v-model="game[`${key}Enable`]" type="checkbox" class="checkbox checkbox-primary" />
                                <span class="label-text">{{ $t("game-launcher." + key) }}</span>
                            </label>
                            <div v-show="game[`${key}Enable`]" class="flex flex-1 space-x-2">
                                <input
                                    type="text"
                                    disabled
                                    :value="game[key]"
                                    :placeholder="$t('game-launcher.selectPath')"
                                    class="input input-bordered input-sm w-full min-w-32"
                                />
                                <div class="btn btn-primary btn-sm" @click="selectPath(key)">
                                    {{ $t("game-launcher.select") }}
                                </div>
                            </div>
                        </div>
                        <div v-if="key === 'path' && game[`${key}Enable`]" class="p-2 flex flex-row justify-between items-center flex-wrap">
                            <label class="label cursor-pointer min-w-32 justify-start">
                                <span class="label-text ml-12">{{ $t("game-launcher.params") }}</span>
                            </label>
                            <div v-show="game.pathEnable" class="flex flex-1 space-x-2">
                                <input v-model="game.pathParams" type="text" class="input input-bordered input-sm w-full min-w-32" />
                            </div>
                        </div>
                    </div>
                    <div>
                        <div class="p-2 flex flex-row justify-between items-center flex-wrap">
                            <label class="label cursor-pointer space-x-2 min-w-32 justify-start">
                                <input v-model="game.dx11Enable" type="checkbox" class="checkbox checkbox-primary" />
                                <span class="label-text">{{ $t("game-launcher.dx11Enable") }}</span>
                            </label>
                        </div>
                        <div class="p-2 flex flex-row justify-between items-center flex-wrap">
                            <label class="label cursor-pointer space-x-2 min-w-32 justify-start">
                                <input v-model="game.modEnable" type="checkbox" class="checkbox checkbox-primary" />
                                <span class="label-text">{{ $t("game-launcher.modEnable") }}</span>
                            </label>
                        </div>
                        <div v-if="game.modEnable" class="p-2 flex flex-row justify-between items-center flex-wrap">
                            <label class="label cursor-pointer min-w-32 justify-start">
                                <span class="label-text ml-12">{{ $t("game-launcher.modLoader") }}</span>
                            </label>
                            <div class="flex flex-1 space-x-2">
                                <label class="label tooltip" data-tip="启动命令行添加-fileopenlog, 可能导致游戏卡顿">
                                    <input v-model="game.modLoader" type="radio" value="legacy" class="radio radio-primary" />
                                    <span class="label-text">{{ $t("game-launcher.legacy") }}</span>
                                </label>
                            </div>
                        </div>
                    </div>
                    <div class="mt-3">
                        <GameSetting />
                    </div>
                </div>
            </div>
        </ScrollArea>
        <div v-if="tab === 'update'" class="flex-1 bg-base-100 border-base-300 h-full overflow-hidden">
            <GameUpdate />
        </div>
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
