import { computed, ref, watch } from "vue"
import { getGameInstall, readBinaryFile, readTextFile } from "@/api/app"
import { env } from "@/env"
import { useGameStore } from "@/store/game"
import type { AfkSpriteManifest } from "@/utils/afk-sprite"

/** 官方浮窗资源相对游戏根目录（`DNA Game/`）的路径。 */
const RUNTIME_DIR = "EM/Binaries/Win64/AFKSupport/Res/Runtime"

/** 已加载的贴图缓存：路径 → ObjectURL。 */
const imageCache = new Map<string, string>()

/**
 * 读取游戏目录里的官方浮窗资源。
 *
 * 资源不打包进应用：直接读本机游戏安装目录下的 AFKSupport/Res/Runtime，
 * 这与官方「小小狩月人」用的是同一份素材，升级游戏即同步。
 */
export function useAfkSprites() {
    const game = useGameStore()
    const manifest = ref<AfkSpriteManifest | null>(null)
    const error = ref("")

    /** 资源根目录：游戏安装目录下的官方 Runtime。 */
    const root = computed(() => {
        if (!env.isApp || !game.path) return ""
        return `${game.path.replace(/EM\.exe$/, "")}${RUNTIME_DIR}/`
    })

    /**
     * 按相对路径取贴图的 ObjectURL（带缓存）。
     * @param path 相对 Runtime 的路径
     * @returns ObjectURL；读不到时为空串
     */
    async function imageUrl(path: string) {
        const cached = imageCache.get(path)
        if (cached) return cached
        if (!root.value) return ""
        try {
            const buffer = await readBinaryFile(`${root.value}${path}`)
            const url = URL.createObjectURL(new Blob([buffer]))
            imageCache.set(path, url)
            return url
        } catch (cause) {
            error.value = String(cause)
            return ""
        }
    }

    /**
     * 补齐游戏安装目录：store 里没有时问一次 Rust 侧（读注册表）。
     */
    async function ensureGamePath() {
        if (game.path || !env.isApp) return
        const install = await getGameInstall().catch(() => "")
        if (install) game.path = install
    }

    /**
     * 读取并缓存 manifest.json。
     */
    async function loadManifest() {
        await ensureGamePath()
        if (manifest.value || !root.value) return
        try {
            const raw = await readTextFile(`${root.value}manifest.json`)
            manifest.value = JSON.parse(raw) as AfkSpriteManifest
        } catch (cause) {
            error.value = String(cause)
        }
    }

    watch(root, () => void loadManifest(), { immediate: true })
    void ensureGamePath().then(() => loadManifest())

    return { manifest, root, error, imageUrl, loadManifest }
}
