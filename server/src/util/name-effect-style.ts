import { createHash } from "node:crypto"
import { db, type schema } from "../db"

const NAME_EFFECT_CACHE_TTL_MS = 5 * 60 * 1000
const NAME_EFFECT_STYLESHEET_PATH = "/api/chat/name-effects.css"

type NameEffectStylesheetCache = {
    etag: string
    css: string
    expiresAt: number
    signature: string
}

let stylesheetCache: NameEffectStylesheetCache | null = null

/**
 * @description 返回名字特效样式表 URL，供前端以 link 方式加载。
 * @param origin 可选服务端源地址。
 * @returns 样式表绝对地址或相对地址。
 */
export function getNameEffectStylesheetUrl(origin?: string): string {
    if (!origin) return NAME_EFFECT_STYLESHEET_PATH
    return `${origin.replace(/\/$/, "")}${NAME_EFFECT_STYLESHEET_PATH}`
}

/**
 * @description 构造整份聊天装扮样式表内容。
 * @param assets 所有配置了展示 CSS 的商城资产。
 * @returns 拼接后的 CSS 文本。
 */
function buildNameEffectStylesheet(assets: Array<typeof schema.shopAssets.$inferSelect>): string {
    const header = `/* generated: dna-builder name effect stylesheet */`
    const body = assets
        .map(asset => asset.displayCss?.trim() || "")
        .filter(Boolean)
        .join("\n\n")
    return `${header}\n${body}`
}

/**
 * @description 生成当前聊天装扮资产的签名，用于缓存命中判断。
 * @returns 当前资产签名。
 */
async function buildNameEffectSignature(): Promise<string> {
    const assets = await db.query.shopAssets.findMany({
        columns: {
            id: true,
            rewardType: true,
            displayClass: true,
            displayCss: true,
            updateAt: true,
        },
    })

    return assets
        .filter(asset => (asset.displayCss?.trim() || "").length > 0)
        .map(asset => [asset.id, asset.rewardType || "", asset.displayClass || "", asset.displayCss || "", asset.updateAt || ""].join(":"))
        .sort()
        .join("|")
}

/**
 * @description 获取名字特效样式表，并基于资产签名与 TTL 做缓存。
 * @returns 包含 CSS 和 etag 的缓存结果。
 */
export async function getCachedNameEffectStylesheet() {
    const signature = await buildNameEffectSignature()
    if (stylesheetCache && stylesheetCache.signature === signature && stylesheetCache.expiresAt > Date.now()) {
        return stylesheetCache
    }

    const assets = await db.query.shopAssets.findMany({
        orderBy: (table, { asc }) => [asc(table.createdAt)],
    })
    const css = buildNameEffectStylesheet(assets)
    const etag = createHash("sha1").update(css).digest("hex")

    stylesheetCache = {
        css,
        etag,
        signature,
        expiresAt: Date.now() + NAME_EFFECT_CACHE_TTL_MS,
    }

    return stylesheetCache
}
