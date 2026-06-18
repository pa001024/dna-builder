<script setup lang="ts">
import * as dialog from "@tauri-apps/plugin-dialog"
import { t } from "i18next"
import { computed, ref } from "vue"
import { deleteFile, openExplorer, removeDirAll } from "../api/app"
import { useCloudGameStore } from "../store/cloudgame"
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
</script>

<template>
    <div class="flex flex-col h-full overflow-hidden relative">
        <div class="flex-none tabs tabs-lift tabs-lg items-center gap-1">
            <input v-model="tab" type="radio" name="game_mod" class="tab" value="update" :aria-label="$t('game-launcher.gameUpdate')" />
            <input v-model="tab" type="radio" name="game_mod" class="tab" value="setting" :aria-label="$t('game-launcher.gameSetting')" />
            <!-- <input v-model="tab" type="radio" name="game_mod" class="tab" value="mod" :aria-label="$t('game-launcher.modManager')" /> -->
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
    </div>
</template>
