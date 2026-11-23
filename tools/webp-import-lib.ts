#!/usr/bin/env bun

/**
 * webp-import 的纯函数部分（无顶层副作用，供脚本与单测共用）。
 *
 * 折叠到独立文件的原因：`webp-import.ts` 顶层会解析项目外的 FModel 导出目录，
 * 单测直接 import 会因缺少外部目录而失败；这里只保留可独立验证的枚举与过滤逻辑。
 */

/** 带单图标的条目（装备基础名 / 唯一装 / 生成组 / 天赋节点等） */
export type IconItemLike = { icon?: string }

/** 升华赛季主表：主图与委托副本图由页面按 `/imgs/webp/${image}.webp` 直接引用 */
export type SeasonLike = { image?: string; commissions?: { image?: string }[] }

/** 升华掉落加成类型：主图标与迷你图标都在 /imgs/webp 下 */
export type SeasonBuffTypeLike = IconItemLike & { smallIcon?: string }

/** 升华（DNASeason）资料库四张表中参与图片枚举的字段集合 */
export type SeasonImageSource = {
    seasons: SeasonLike[]
    buffTypes: SeasonBuffTypeLike[]
    baseNames: IconItemLike[]
    uniqueEquips: IconItemLike[]
    generateGroups: IconItemLike[]
    stages: IconItemLike[]
    talents: IconItemLike[]
    challenges: IconItemLike[]
}

/**
 * 枚举升华资料库引用的全部图片 URL。
 *
 * 口径与 DBTranscendence* 页面一致：赛季主图 / 委托图 / 掉落加成 / 挑战图标 / 阶段与天赋节点走
 * `/imgs/webp`，装备基础名 / 唯一装 / 生成组走 `/imgs/res`。返回数组保持固定类别顺序，调用方用 Set 去重。
 * @param source 四张表的图标字段集合
 * @returns `/imgs/**` 完整 URL 列表
 */
export function collectDnaSeasonImageUrls(source: SeasonImageSource): string[] {
    const urls: string[] = []
    const push = (dir: "res" | "webp", icon: string | undefined): void => {
        if (icon) {
            urls.push(`/imgs/${dir}/${icon}.webp`)
        }
    }

    for (const season of source.seasons) {
        push("webp", season.image)
        for (const commission of season.commissions ?? []) {
            push("webp", commission.image)
        }
    }
    for (const type of source.buffTypes) {
        push("webp", type.icon)
        push("webp", type.smallIcon)
    }
    for (const equip of [...source.baseNames, ...source.uniqueEquips, ...source.generateGroups]) {
        push("res", equip.icon)
    }
    for (const item of [...source.stages, ...source.talents, ...source.challenges]) {
        push("webp", item.icon)
    }

    return urls
}

/**
 * 解析过滤器原始值：命令行优先于环境变量。
 * @param cliValue `--filter` 的值
 * @param envValue `WEBP_IMPORT_FILTER` 的值
 * @returns 生效的过滤器文本；都未提供时 undefined
 */
export function resolveFilterRaw(cliValue: string | undefined, envValue: string | undefined): string | undefined {
    return cliValue ?? envValue
}

/**
 * 编译过滤器正则，非法表达式不抛栈。
 * @param raw 过滤器文本
 * @returns 正则或错误信息（合法时 error 为 null）
 */
export function compileFilter(raw: string | undefined): { regex: RegExp | null; error: string | null } {
    if (!raw) {
        return { regex: null, error: null }
    }

    try {
        return { regex: new RegExp(raw, "i"), error: null }
    } catch (error) {
        return { regex: null, error: error instanceof Error ? error.message : String(error) }
    }
}

/**
 * 目标相对路径是否命中过滤器；未设置过滤器时全部命中。
 * @param regex 已编译的过滤器
 * @param targetRelPath 相对 `public/imgs` 的目标路径，如 `res/T_Season_DG_0901.webp`
 * @returns 是否命中
 */
export function matchesFilter(regex: RegExp | null, targetRelPath: string): boolean {
    return !regex || regex.test(targetRelPath)
}
