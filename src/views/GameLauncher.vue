<script setup lang="ts">
import * as dialog from "@tauri-apps/plugin-dialog"
import { t } from "i18next"
import { computed, onMounted, ref } from "vue"
import { createDesktopShortcut as createShortcut, deleteFile, openExplorer, pathExists, removeDirAll, renameFile } from "@/api/app"
import { useCloudGameStore } from "@/store/cloudgame"
import { useGameStore } from "@/store/game"
import { useUIStore } from "@/store/ui"

// 状态管理
const ui = useUIStore()
const keys = ["path", "beforeGame", "afterGame"] as const
const tab = ref("update")
// 卸载游戏时是否保留用户设置（EM\Saved 目录），默认勾选
const uninstallKeepSettings = ref(true)
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
    // 弹出自定义卸载确认框（含「保留用户设置」选项）
    const modal = document.getElementById("uninstall_modal") as HTMLDialogElement | null
    modal?.showModal()
}

/**
 * 关闭卸载确认框。
 */
const uninstallModalClose = () => {
    const modal = document.getElementById("uninstall_modal") as HTMLDialogElement | null
    modal?.close()
}

/**
 * 确认卸载游戏：勾选「保留用户设置」时保留 EM\Saved 目录，删除其余文件。
 */
const confirmUninstall = async () => {
    const modal = document.getElementById("uninstall_modal") as HTMLDialogElement | null
    modal?.close()
    const gameDir = game.gameDir
    const savedDir = `${gameDir}EM\\Saved`
    const backupDir = `${gameDir}.uninstall_saved_backup`

    try {
        // 先将 EM\Saved 移动到临时位置，删除 EM 后再移回，避免逐个删除大目录下的文件
        if (uninstallKeepSettings.value) {
            if (await pathExists(savedDir)) {
                // 清理可能残留的旧备份，避免重命名失败
                await removeDirAll(backupDir)
                await renameFile(savedDir, backupDir)
            }
        }
        await deleteFile(game.path, true)
        await deleteFile(`${gameDir}BaseVersion.json`, true)
        await deleteFile(`${gameDir}GameVersion.json`, true)
        await deleteFile(`${gameDir}.extracting`, true)
        await removeDirAll(`${gameDir}EM`)
        await removeDirAll(`${gameDir}Engine`)
        // 将保留的用户设置目录移回原位
        if (uninstallKeepSettings.value && (await pathExists(backupDir))) {
            await renameFile(backupDir, savedDir)
        }
        await game.refreshGameInstalled()
        ui.showSuccessMessage(t("game-launcher.uninstallSuccess"))
    } catch (error) {
        // 卸载失败时尝试恢复被移动的用户设置目录，避免数据丢失
        if (uninstallKeepSettings.value) {
            try {
                if ((await pathExists(backupDir)) && !(await pathExists(savedDir))) {
                    await renameFile(backupDir, savedDir)
                }
            } catch (restoreError) {
                console.error("恢复用户设置目录失败:", restoreError)
            }
        }
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

/**
 * 在桌面创建指向游戏主程序（EM.exe）的快捷方式，名称为「二重螺旋」。
 */
const createDesktopShortcut = async () => {
    if (!game.path) {
        ui.showErrorMessage(t("game-launcher.selectGameFileFirst"))
        return
    }
    try {
        await createShortcut(game.path)
        ui.showSuccessMessage(t("game-launcher.desktopShortcutCreated"))
    } catch (error) {
        console.error("创建桌面快捷方式失败:", error)
        ui.showErrorMessage(t("game-launcher.desktopShortcutFailed", { error: error instanceof Error ? error.message : String(error) }))
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

/**
 * 初始化云游戏监听。
 */
onMounted(async () => {
    await cloudgame.initCloudGameTracking()
})
</script>

<template>
    <div class="flex flex-col h-full overflow-hidden relative">
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
                type="button"
                class="px-3 py-2 text-sm rounded-t-lg border-b-2 transition-colors flex items-center gap-1.5"
                :class="
                    tab === 'update'
                        ? 'border-primary text-primary font-semibold'
                        : 'border-transparent text-base-content/60 hover:text-base-content'
                "
                @click="tab = 'update'"
            >
                <Icon icon="ri:refresh-line" class="size-4" />
                {{ $t("game-launcher.gameUpdate") }}
            </button>
            <button
                type="button"
                class="px-3 py-2 text-sm rounded-t-lg border-b-2 transition-colors flex items-center gap-1.5"
                :class="
                    tab === 'setting'
                        ? 'border-primary text-primary font-semibold'
                        : 'border-transparent text-base-content/60 hover:text-base-content'
                "
                @click="tab = 'setting'"
            >
                <Icon icon="ri:settings-3-line" class="size-4" />
                {{ $t("game-launcher.gameSetting") }}
            </button>
            <button
                type="button"
                class="px-3 py-2 text-sm rounded-t-lg border-b-2 transition-colors flex items-center gap-1.5"
                :class="
                    tab === 'account'
                        ? 'border-primary text-primary font-semibold'
                        : 'border-transparent text-base-content/60 hover:text-base-content'
                "
                @click="tab = 'account'"
            >
                <Icon icon="ri:user-line" class="size-4" />
                {{ $t("game-launcher.accountManage") }}
            </button>
            <RouterLink
                to="/mods"
                class="btn btn-sm btn-square btn-ghost tooltip tooltip-bottom ml-auto"
                :data-tip="$t('game-launcher.modManager')"
            >
                <Icon icon="ri:puzzle-line" class="w-6 h-6" />
            </RouterLink>
            <div
                class="btn btn-sm btn-square btn-ghost tooltip tooltip-bottom"
                :data-tip="$t('game-launcher.openGameDir')"
                @click="openGameDirectory()"
            >
                <Icon icon="ri:folder-line" class="w-6 h-6" />
            </div>
            <div
                class="btn btn-sm btn-square btn-ghost tooltip tooltip-bottom"
                :class="{ 'btn-primary': cloudgame.isWindowOpen || cloudgame.opening }"
                :data-tip="cloudGameEntryTitle"
                @click="openCloudGameFromLauncher()"
            >
                <Icon :icon="cloudgame.isBridgeConnected ? 'ri:cloud-fill' : 'ri:cloud-line'" class="w-6 h-6" />
            </div>
            <div
                class="btn btn-sm btn-square btn-ghost btn-error tooltip tooltip-bottom"
                :data-tip="$t('game-launcher.uninstall')"
                @click="uninstallGame()"
            >
                <Icon icon="ri:delete-bin-6-line" class="w-6 h-6" />
            </div>
            <div class="w-40 btn btn-primary mx-2" :class="{ 'btn-disabled': game.running }" @click="launchGame()">
                <Icon icon="ri:rocket-2-line" class="w-6 h-6" />
                {{ $t("game-launcher.launch") }}
            </div>
        </nav>
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
                        <div class="p-2 flex flex-row justify-between items-center flex-wrap">
                            <button class="btn btn-primary btn-sm" :class="{ 'btn-disabled': !game.path }" @click="createDesktopShortcut()">
                                <Icon icon="ri:file-copy-line" class="w-4 h-4" />
                                {{ $t("game-launcher.desktopShortcut") }}
                            </button>
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
        <ScrollArea v-if="tab === 'account'" class="flex-1">
            <div class="bg-base-100 p-4">
                <div class="max-w-6xl m-auto">
                    <GameSessionManager />
                </div>
            </div>
        </ScrollArea>

        <!-- 自定义卸载游戏确认框 -->
        <dialog id="uninstall_modal" class="modal">
            <div class="modal-box">
                <h3 class="text-lg font-bold flex items-center gap-2">
                    <Icon icon="ri:delete-bin-6-line" class="size-5" />
                    {{ $t("game-launcher.uninstallTitle") }}
                </h3>
                <p class="py-4 text-base-content/70">{{ $t("game-launcher.uninstallContent") }}</p>
                <label class="label cursor-pointer justify-start gap-2 rounded-lg bg-base-200 p-3">
                    <input v-model="uninstallKeepSettings" type="checkbox" class="checkbox checkbox-primary" />
                    <div class="flex flex-col">
                        <span class="label-text font-semibold">{{ $t("game-launcher.uninstallKeepSettings") }}</span>
                        <span class="text-xs text-base-content/50">{{ $t("game-launcher.uninstallKeepSettingsHint") }}</span>
                    </div>
                </label>
                <div class="modal-action">
                    <form method="dialog" class="space-x-2">
                        <button class="min-w-20 btn btn-error" @click="confirmUninstall()">
                            <Icon icon="ri:delete-bin-6-line" class="size-4" />
                            {{ $t("game-launcher.uninstall") }}
                        </button>
                        <button class="min-w-20 btn">{{ $t("setting.cancel") }}</button>
                    </form>
                </div>
            </div>
            <div class="modal-backdrop" @click="uninstallModalClose()" />
        </dialog>
    </div>
</template>
