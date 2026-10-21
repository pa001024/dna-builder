import { draftMap, iconticketMap, modMap, resourceMap, weaponMap } from "@/data/d"
import { charAccessoryData, hairData, weaponAccessoryData, weaponSkinData } from "@/data/d/accessory.data"
import { resolveSkinIconUrl } from "@/utils/accessory-utils"
import { EMPTY_REWARD_ICON } from "@/utils/reward-icon"
import type { ScreenBarForgeDraft } from "@/utils/screen-bar"

/**
 * 铸造产物图片的解析。
 *
 * 屏幕信息条是独立 WebviewWindow,启动时不加载数据包(否则窗口要等最重的那段开销,
 * 失去"秒开"的意义),所以产物图片不能在那里现查现算:由主窗口用数据包把
 * `产物 id → 图片路径` 解析好写进 `dna.forgeIcon` 缓存,浮窗只读缓存渲染。
 */

/**
 * 按产物 id 解析产物图片路径。
 *
 * 口径取自「游戏信息」铸造卡片的产物图片(魔之楔 → 武器 → 资源),并补上饰件与深境罗盘分支,
 * 保证整张铸造表都能出图。
 * @param productId 产物 id
 * @returns 图片路径;查不到时返回缺省图
 */
function resolveForgeIcon(productId: number): string {
    for (const draft of draftMap.values()) {
        if (draft.p !== productId) continue
        if (draft.t === "Mod") {
            const icon = modMap.get(productId)?.icon
            return icon ? `/imgs/webp/T_Mod_${icon}.webp` : EMPTY_REWARD_ICON
        }
        if (draft.t === "Weapon") {
            const icon = weaponMap.get(productId)?.icon
            return icon ? `/imgs/webp/T_Head_${icon}.webp` : EMPTY_REWARD_ICON
        }
        if (draft.t === "Resource") {
            const resource = resourceMap.get(draft.n || productId)
            return resource?.icon ? `/imgs/res/${resource.icon}.webp` : EMPTY_REWARD_ICON
        }
        break
    }

    const ticketIcon = iconticketMap.get(productId)?.icon
    if (ticketIcon) return `/imgs/res/${ticketIcon}.webp`

    const accessory =
        charAccessoryData.find(item => item.id === productId) ??
        weaponAccessoryData.find(item => item.id === productId) ??
        weaponSkinData.find(item => item.id === productId) ??
        hairData.find(item => item.id === productId)
    return accessory?.icon ? resolveSkinIconUrl(accessory.icon) : EMPTY_REWARD_ICON
}

/**
 * 把当前铸造队列用到的产物图片解析成 `产物 id → 图片路径`。
 *
 * 只包含本条队列里的产物,队列换掉后旧产物自然被清理。
 * @param drafts 当前铸造队列(已归一化)
 * @returns 产物 id 到图片路径的映射
 */
export function buildForgeIconMap(drafts: ScreenBarForgeDraft[]): Record<string, string> {
    const result: Record<string, string> = {}
    for (const draft of drafts) {
        if (draft.productId === null) continue
        result[String(draft.productId)] = resolveForgeIcon(draft.productId)
    }
    return result
}
