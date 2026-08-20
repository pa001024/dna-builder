import { t } from "i18next"
import { ref } from "vue"
import type { GameMod, GameModVersion } from "@/api/gen/api-types"
import { downloadGameMod, downloadGameModVersion } from "@/api/modShare"
import { env } from "@/env"
import { STANDALONE_ENTITY } from "@/store/db"
import { useGameStore } from "@/store/game"
import { useUIStore } from "@/store/ui"
import { useUserStore } from "@/store/user"

/**
 * MOD 一键下载安装逻辑（分享卡片快速安装与详情页共用）。
 * @param onInstalled 安装成功后的回调，参数为安装目标实体名。
 */
export function useModInstall(onInstalled?: (targetEntity: string) => void) {
    const ui = useUIStore()
    const game = useGameStore()
    const user = useUserStore()

    /** 正在安装的 MOD（最新版用 id，指定版本用 `${id}:${versionId}`）。 */
    const installing = ref<string | null>(null)

    /**
     * @description 将已下载的压缩包字节安装到对应分类（一键下载安装的公共逻辑）。
     * @param mod 分享的 MOD
     * @param bytes 压缩包字节
     * @param name 安装后的本地 MOD 名称
     * @returns 安装成功时返回目标实体名，失败返回 null
     */
    async function installDownloadedMod(mod: GameMod, bytes: ArrayBuffer, name: string): Promise<string | null> {
        if (!game.path) {
            ui.showErrorMessage(t("game-launcher.selectGameFileFirst"))
            return null
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
            return null
        }
        ui.showSuccessMessage(t("game-launcher.modDownloadSuccess"))
        onInstalled?.(targetEntity)
        return targetEntity
    }

    /**
     * @description 一键下载并安装分享的 MOD 最新版本到对应分类。
     * web 端拦截：下载安装依赖本地游戏目录，仅桌面客户端可用。
     * @param mod 分享的 MOD
     */
    async function installSharedMod(mod: GameMod) {
        if (!env.isApp) {
            ui.showErrorMessage(t("game-launcher.appOnlyDownload"))
            return
        }
        if (!user.jwtToken) {
            ui.showErrorMessage(t("game-launcher.loginToDownload"))
            return
        }
        installing.value = mod.id
        try {
            const bytes = await downloadGameMod(mod.id, user.jwtToken)
            await installDownloadedMod(mod, bytes, mod.name)
        } catch (error) {
            console.error("下载安装 MOD 失败:", error)
            ui.showErrorMessage(t("game-launcher.modDownloadFailed", { error: error instanceof Error ? error.message : String(error) }))
        } finally {
            installing.value = null
        }
    }

    /**
     * @description 下载并安装分享 MOD 的指定版本。
     * web 端拦截：下载安装依赖本地游戏目录，仅桌面客户端可用。
     * @param mod 分享的 MOD
     * @param version 目标版本
     */
    async function installSharedVersion(mod: GameMod, version: GameModVersion) {
        if (!env.isApp) {
            ui.showErrorMessage(t("game-launcher.appOnlyDownload"))
            return
        }
        if (!user.jwtToken) {
            ui.showErrorMessage(t("game-launcher.loginToDownload"))
            return
        }
        installing.value = `${mod.id}:${version.id}`
        try {
            const bytes = await downloadGameModVersion(mod.id, version.id, user.jwtToken)
            await installDownloadedMod(mod, bytes, `${mod.name} v${version.version}`)
        } catch (error) {
            console.error("下载安装 MOD 版本失败:", error)
            ui.showErrorMessage(t("game-launcher.modDownloadFailed", { error: error instanceof Error ? error.message : String(error) }))
        } finally {
            installing.value = null
        }
    }

    return { installing, installSharedMod, installSharedVersion }
}
