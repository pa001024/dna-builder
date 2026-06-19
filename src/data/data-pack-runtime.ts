import {
    bootstrapDataPack,
    getLoadedDataPackImgsManifest,
    loadDataPackExport,
    loadDataPackModule,
    syncDataPackModuleBindings,
} from "./data-pack"

const DATA_PACK_MODULES = [
    "char.data",
    "mod.data",
    "weapon.data",
    "monster.data",
    "buff.data",
    "effect.data",
    "event.data",
    "abyss.data",
    "forge.data",
    "ironsurvival.data",
    "achievement.data",
    "accessory.data",
    "book.data",
    "backpackpuzzle.data",
    "autochess.data",
    "charext.data",
    "charext.en.data",
    "charext.fr.data",
    "charext.jp.data",
    "charext.kr.data",
    "charext.tc.data",
    "charvoice.data",
    "charvoice.en.data",
    "charvoice.jp.data",
    "charvoice.kr.data",
    "convert.data",
    "draft.data",
    "dungeon.data",
    "effect.data",
    "fish.data",
    "headsculpture.data",
    "iconticket.data",
    "jargon.data",
    "levelup.data",
    "limitedprize.data",
    "map.data",
    "mount.data",
    "monstertag.data",
    "npc.data",
    "optreward.data",
    "pet.data",
    "player.data",
    "reputation.data",
    "resource.data",
    "reward.data",
    "cutoff.data",
    "shop.data",
    "solotreasure.data",
    "subregion.data",
    "title.data",
    "walnut.data",
    "partytopic.data",
    "partytopic.en.data",
    "partytopic.fr.data",
    "partytopic.jp.data",
    "partytopic.kr.data",
    "partytopic.tc.data",
    "quest.data",
    "quest.en.data",
    "quest.fr.data",
    "quest.jp.data",
    "quest.kr.data",
    "quest.tc.data",
    "questchain.data",
    "raid.data",
    "region.data",
    "dynquest.data",
    "hardboss.data",
] as const

export { bootstrapDataPack, getLoadedDataPackImgsManifest }

/**
 * 判断模块是否应从数据包读取。
 * @param moduleKey 模块键
 * @returns 是否启用包加载
 */
export function isDataPackModule(moduleKey: string): boolean {
    return DATA_PACK_MODULES.includes(moduleKey as (typeof DATA_PACK_MODULES)[number])
}

/**
 * 读取数据包中的默认导出。
 * @param moduleKey 模块键
 * @returns 默认导出
 */
export async function loadDataPackDefault<T>(moduleKey: string): Promise<T> {
    const value = await loadDataPackExport<T>(moduleKey, "default")
    syncDataPackModuleBindings(moduleKey)
    if (value !== undefined) {
        return value
    }

    return [] as T
}

/**
 * 读取数据包中的命名导出。
 * @param moduleKey 模块键
 * @param exportName 导出名
 * @param fallbackCode 空包回退代码
 * @returns 导出值
 */
export async function loadDataPackNamed<T>(moduleKey: string, exportName: string, fallbackCode?: string): Promise<T> {
    const value = await loadDataPackExport<T>(moduleKey, exportName)
    syncDataPackModuleBindings(moduleKey)
    if (value !== undefined) {
        return value
    }

    if (fallbackCode === "[]") {
        return [] as T
    }

    if (fallbackCode === "new Map()") {
        return new Map() as T
    }

    if (fallbackCode === "{}") {
        return {} as T
    }

    return undefined as T
}

/**
 * 读取整个数据包模块。
 * @param moduleKey 模块键
 * @returns 模块导出集合
 */
export async function loadDataPackWhole(moduleKey: string) {
    const moduleRecord = await loadDataPackModule(moduleKey)
    syncDataPackModuleBindings(moduleKey)
    return moduleRecord
}
