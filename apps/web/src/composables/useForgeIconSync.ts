import { useLocalStorage } from "@vueuse/core"
import { watch } from "vue"
import { useMihanNotify } from "@/store/mihan"
import { dataPackHydrationKey } from "@/utils/data-pack/data-pack-bridge"
import { FORGE_ICON_STORAGE_KEY, normalizeForgeDrafts } from "@/utils/screen-bar"

/**
 * 维护铸造产物图片缓存(`dna.forgeIcon`)。
 *
 * 只有主窗口能用数据包把产物 id 解析成图片路径,信息条浮窗不加载数据包、只读这份缓存,
 * 所以缓存必须由主窗口在游戏信息或数据包变化时刷新。数据包模块按需动态引入,避免
 * 把整包数据拖进浮窗那一侧的启动路径。
 * @returns 无
 */
export function useForgeIconSync(): void {
    const { shortNoteInfo } = useMihanNotify()
    const icons = useLocalStorage<Record<string, string>>(FORGE_ICON_STORAGE_KEY, {})

    /**
     * 按当前铸造队列重建缓存;内容没变时不写,避免每秒同步反复落盘。
     */
    async function refresh() {
        const drafts = normalizeForgeDrafts(shortNoteInfo.value)
        if (drafts.length === 0) {
            if (Object.keys(icons.value).length > 0) icons.value = {}
            return
        }
        const { buildForgeIconMap } = await import("@/utils/forge-icon")
        const next = buildForgeIconMap(drafts)
        const current = icons.value
        const keys = Object.keys(next)
        if (keys.length === Object.keys(current).length && keys.every(key => current[key] === next[key])) return
        icons.value = next
    }

    // 游戏信息整点刷新与数据包水合都会改变可解析的产物图标,两者任一变化都要重建
    watch([() => shortNoteInfo.value, dataPackHydrationKey], () => void refresh(), { deep: true, immediate: true })
}
