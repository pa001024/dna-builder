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
    <div class="relative flex h-full flex-col overflow-hidden">
        <!-- 顶部导航：悬浮于内容之上，让 GameUpdate 视频背景全屏 -->
        <nav class="absolute inset-x-0 top-0 z-20 border-b border-base-content/15 bg-base-100/60 backdrop-blur-sm">
            <!-- 引导线网格（装饰性，随主题明暗） -->
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
            <div class="relative flex items-center gap-1">
                <!-- 标签页：下划线指示，选中态主色；极窄下只留图标 -->
                <button
                    type="button"
                    class="flex cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors -mb-px whitespace-nowrap"
                    :class="
                        tab === 'update'
                            ? 'border-primary text-primary font-semibold'
                            : 'border-transparent text-base-content/60 hover:text-base-content'
                    "
                    @click="tab = 'update'"
                >
                    <Icon icon="ri:refresh-line" class="size-4 shrink-0" />
                    <span class="hidden sm:inline">{{ $t("game-launcher.gameUpdate") }}</span>
                </button>
                <button
                    type="button"
                    class="flex cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors -mb-px whitespace-nowrap"
                    :class="
                        tab === 'setting'
                            ? 'border-primary text-primary font-semibold'
                            : 'border-transparent text-base-content/60 hover:text-base-content'
                    "
                    @click="tab = 'setting'"
                >
                    <Icon icon="ri:settings-3-line" class="size-4 shrink-0" />
                    <span class="hidden sm:inline">{{ $t("game-launcher.gameSetting") }}</span>
                </button>
                <button
                    type="button"
                    class="flex cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors -mb-px whitespace-nowrap"
                    :class="
                        tab === 'account'
                            ? 'border-primary text-primary font-semibold'
                            : 'border-transparent text-base-content/60 hover:text-base-content'
                    "
                    @click="tab = 'account'"
                >
                    <Icon icon="ri:user-line" class="size-4 shrink-0" />
                    <span class="hidden sm:inline">{{ $t("game-launcher.accountManage") }}</span>
                </button>

                <div class="ml-auto flex items-center gap-1.5 pl-2">
                    <RouterLink
                        to="/mods"
                        class="tooltip tooltip-bottom inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-xs border border-base-content/20 text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary"
                        :data-tip="$t('game-launcher.modManager')"
                    >
                        <Icon icon="ri:puzzle-line" class="size-4" />
                    </RouterLink>
                    <button
                        type="button"
                        class="tooltip tooltip-bottom inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-xs border border-base-content/20 text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary"
                        :data-tip="$t('game-launcher.openGameDir')"
                        @click="openGameDirectory()"
                    >
                        <Icon icon="ri:folder-line" class="size-4" />
                    </button>
                    <button
                        type="button"
                        class="tooltip tooltip-bottom inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-xs border transition-colors duration-150"
                        :class="
                            cloudgame.isWindowOpen || cloudgame.opening
                                ? 'border-primary/70 bg-primary/10 text-primary'
                                : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                        "
                        :data-tip="cloudGameEntryTitle"
                        @click="openCloudGameFromLauncher()"
                    >
                        <Icon :icon="cloudgame.isBridgeConnected ? 'ri:cloud-fill' : 'ri:cloud-line'" class="size-4" />
                    </button>
                    <button
                        type="button"
                        class="tooltip tooltip-bottom inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-xs border border-base-content/20 text-base-content/60 transition-colors duration-150 hover:border-error/60 hover:text-error"
                        :data-tip="$t('game-launcher.uninstall')"
                        @click="uninstallGame()"
                    >
                        <Icon icon="ri:delete-bin-6-line" class="size-4" />
                    </button>
                    <button
                        type="button"
                        class="mx-1 inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-xs bg-primary px-3.5 text-sm font-semibold text-primary-content transition-opacity duration-150 whitespace-nowrap"
                        :class="{ 'pointer-events-none opacity-45': game.running }"
                        @click="launchGame()"
                    >
                        <Icon icon="ri:rocket-2-line" class="size-4 shrink-0" />
                        <span class="hidden sm:inline">{{ $t("game-launcher.launch") }}</span>
                    </button>
                </div>
            </div>
        </nav>

        <!-- 游戏设置 -->
        <ScrollArea v-if="tab === 'setting'" class="flex-1">
            <div class="mx-auto w-full max-w-6xl space-y-4 px-4 pb-6 pt-16">
                <!-- 启动路径 -->
                <section
                    class="animate-ef-rise motion-reduce:animate-none rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
                    style="animation-delay: 0ms"
                >
                    <SectionHeader no-animate compact kicker="LAUNCH" title="启动路径" />
                    <div class="space-y-2">
                        <div v-for="key in keys" :key="key">
                            <div class="flex flex-row flex-wrap items-center justify-between gap-2">
                                <label class="label flex cursor-pointer items-center justify-start gap-2 px-0 py-1">
                                    <input v-model="game[`${key}Enable`]" type="checkbox" class="checkbox checkbox-primary checkbox-sm" />
                                    <span class="label-text text-sm">{{ $t("game-launcher." + key) }}</span>
                                </label>
                                <div v-show="game[`${key}Enable`]" class="flex flex-1 items-center gap-2">
                                    <input
                                        type="text"
                                        disabled
                                        :value="game[key]"
                                        :placeholder="$t('game-launcher.selectPath')"
                                        class="input input-bordered input-sm w-full min-w-32 rounded-xs"
                                    />
                                    <div
                                        class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border border-base-content/20 px-2 py-1 text-[11px] text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97]"
                                        @click="selectPath(key)"
                                    >
                                        {{ $t("game-launcher.select") }}
                                    </div>
                                </div>
                            </div>
                            <!-- 启动参数（仅游戏路径开启时显示） -->
                            <div
                                v-if="key === 'path' && game.pathEnable"
                                class="flex flex-row flex-wrap items-center justify-between gap-2 border-t border-base-content/10 pt-2"
                            >
                                <label class="label flex cursor-pointer items-center justify-start gap-2 px-0 py-1">
                                    <span class="w-4 shrink-0" aria-hidden="true" />
                                    <span class="label-text text-sm">{{ $t("game-launcher.params") }}</span>
                                </label>
                                <div class="flex flex-1 items-center gap-2">
                                    <input
                                        v-model="game.pathParams"
                                        type="text"
                                        class="input input-bordered input-sm w-full min-w-32 rounded-xs"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- 游戏选项 -->
                <section
                    class="animate-ef-rise motion-reduce:animate-none rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
                    style="animation-delay: 70ms"
                >
                    <SectionHeader no-animate compact kicker="GAME" title="游戏选项" />
                    <div class="space-y-2">
                        <div class="flex flex-row flex-wrap items-center justify-between gap-2">
                            <label class="label flex cursor-pointer items-center justify-start gap-2 px-0 py-1">
                                <input v-model="game.dx11Enable" type="checkbox" class="checkbox checkbox-primary checkbox-sm" />
                                <span class="label-text text-sm">{{ $t("game-launcher.dx11Enable") }}</span>
                            </label>
                        </div>
                        <div class="flex flex-row flex-wrap items-center justify-between gap-2">
                            <label class="label flex cursor-pointer items-center justify-start gap-2 px-0 py-1">
                                <input v-model="game.modEnable" type="checkbox" class="checkbox checkbox-primary checkbox-sm" />
                                <span class="label-text text-sm">{{ $t("game-launcher.modEnable") }}</span>
                            </label>
                        </div>
                        <div
                            v-if="game.modEnable"
                            class="flex flex-row flex-wrap items-center justify-between gap-2 border-t border-base-content/10 pt-2"
                        >
                            <label class="label flex cursor-pointer items-center justify-start gap-2 px-0 py-1">
                                <span class="w-4 shrink-0" aria-hidden="true" />
                                <span class="label-text text-sm">{{ $t("game-launcher.modLoader") }}</span>
                            </label>
                            <div class="flex flex-1 items-center gap-2">
                                <label class="label tooltip cursor-pointer gap-2 px-0 py-1" data-tip="启动命令行添加-fileopenlog, 可能导致游戏卡顿">
                                    <input v-model="game.modLoader" type="radio" value="legacy" class="radio radio-primary radio-sm" />
                                    <span class="label-text text-sm">{{ $t("game-launcher.legacy") }}</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- 桌面快捷方式 -->
                <section
                    class="animate-ef-rise motion-reduce:animate-none rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
                    style="animation-delay: 140ms"
                >
                    <SectionHeader no-animate compact kicker="SHORTCUT" :title="$t('game-launcher.desktopShortcut')" />
                    <button
                        type="button"
                        class="inline-flex cursor-pointer items-center gap-1.5 rounded-xs bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-content transition-opacity duration-150"
                        :class="{ 'pointer-events-none opacity-45': !game.path }"
                        @click="createDesktopShortcut()"
                    >
                        <Icon icon="ri:file-copy-line" class="size-4" />
                        {{ $t("game-launcher.desktopShortcut") }}
                    </button>
                </section>

                <GameSetting />
            </div>
        </ScrollArea>

        <!-- 游戏更新：悬浮导航之下全屏展示（视频背景铺满窗口） -->
        <div v-if="tab === 'update'" class="h-full flex-1 overflow-hidden">
            <GameUpdate />
        </div>

        <!-- 账号管理 -->
        <ScrollArea v-if="tab === 'account'" class="flex-1">
            <div class="mx-auto w-full max-w-6xl space-y-4 px-4 pb-6 pt-16">
                <GameSessionManager />
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
                <label class="label cursor-pointer justify-start gap-2.5 rounded-xs border border-base-content/10 bg-base-content/3 p-3">
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
