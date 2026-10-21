import i18next from "i18next"
import { translationsEn, translationsFr, translationsJa, translationsKo, translationsTc } from "@/data/d/translations.data"
import { registerDataPackHydrationCallback } from "./data-pack-bridge"

/**
 * 数据包承载的游戏文案对照表。
 *
 * 数据源就是 `packages/data/d/translations.data.ts`：开发环境（`DISABLE_REWRITE=1`）按源码原样加载，
 * 构建时由数据包重写插件换成「空壳 + 绑定注册」，真实数据在数据包激活时回填到这些绑定上。
 *
 * 所以这里只做**静态 import**、不自己去读数据包——读包的职责归重写插件。
 * 两者一旦混用，关掉重写插件时文案仍会被包内内容覆盖。
 */

/** 打包语言（数据语言写法） */
export type PackTranslationLocale = "tc" | "en" | "jp" | "kr" | "fr"

/** 打包语言 → i18next 语言代码（与 packages/data/d/story-locale.ts 的口径一致） */
const I18N_LANGUAGE_BY_LOCALE: Record<PackTranslationLocale, string> = {
    tc: "zh-TW",
    en: "en",
    jp: "ja",
    kr: "ko",
    fr: "fr",
}

const SUPPORTED_LOCALES = Object.keys(I18N_LANGUAGE_BY_LOCALE) as PackTranslationLocale[]

/** 已注入 i18next 的语言 */
const injectedLocales = new Set<PackTranslationLocale>()

/** 对照表失效时的通知回调（检索层的反向索引缓存等据此重建） */
const invalidationCallbacks = new Set<() => void>()

/**
 * 注册对照表失效回调。
 * @param callback 失效时的回调
 */
export function registerPackTranslationInvalidation(callback: () => void): void {
    invalidationCallbacks.add(callback)
}

/**
 * 判断目标语言是否需要从数据包取对照表。
 *
 * 简体中文是 fallbackLng 且键与值同形，永远走 public/i18n，不进数据包。
 * @param locale 数据语言
 * @returns 是否为数据包承载的语言
 */
export function isPackTranslationLocale(locale: string): locale is PackTranslationLocale {
    return SUPPORTED_LOCALES.includes(locale as PackTranslationLocale)
}

/**
 * 取指定语言的对照表（简体中文原文 → 译文）。
 *
 * 每次都读 import 绑定而不是预先归拢成一张表：重写后的壳模块是**可变导出**，
 * 数据包激活时会被整体替换；缓存成常量对象就会永远停在首次导入的空值上。
 *
 * 数据包未安装 / 尚未回填时导出为空对象，此时返回空表，
 * 调用方应退回 public/i18n 的资源包，而不是把界面文案清空。
 * @param locale 数据语言
 * @returns 对照表
 */
export function getPackTranslationTable(locale: PackTranslationLocale): Record<string, string> {
    switch (locale) {
        case "tc":
            return translationsTc
        case "en":
            return translationsEn
        case "jp":
            return translationsJa
        case "kr":
            return translationsKo
        case "fr":
            return translationsFr
    }
}

/** 等待主应用真实初始化的最长毫秒数：import 阶段的水合重注只比 initI18n 早几毫秒 */
const INIT_WAIT_TIMEOUT_MS = 10000

/**
 * 等待 i18next 的 initialized 事件。
 * @param timeoutMs 超时毫秒数
 * @returns 是否等到（或等待期间已就绪）
 */
function waitForI18nInitialized(timeoutMs: number): Promise<boolean> {
    if (i18next.isInitialized) {
        return Promise.resolve(true)
    }

    if (typeof i18next.on !== "function" || typeof i18next.off !== "function") {
        return Promise.resolve(false)
    }

    return new Promise<boolean>(resolve => {
        const timer = setTimeout(() => {
            i18next.off("initialized", onInitialized)
            resolve(i18next.isInitialized === true)
        }, timeoutMs)
        // Node 侧（SSR/单测）别让这个兜底计时器拖住进程退出
        const maybeUnref = timer as unknown as { unref?: () => void }
        maybeUnref.unref?.()

        function onInitialized(): void {
            clearTimeout(timer)
            i18next.off("initialized", onInitialized)
            resolve(true)
        }

        i18next.on("initialized", onInitialized)
    })
}

/**
 * 确保 i18next 已初始化；未初始化时等待主应用的真实初始化完成。
 *
 * 数据包初始化与 i18next 初始化是两条独立启动路径，注入资源前必须保证语言包已就绪，
 * 否则 addResourceBundle 会落到一个尚未 init 的实例上被丢弃。
 *
 * 注意：这里绝不能抢在主应用的 initI18n() 之前 bare init()——真实初始化会新建
 * ResourceStore 并清空之前注入的对照表，而 injectedLocales 却还记着“已注入”，
 * 之后就再也不会重注，数据包翻译彻底失效（rewrite 下水合发生在 import 阶段时必现）。
 * 因此只等主应用的 initialized 事件；等不到（无 init 的旁路场景）才退回 bare init。
 * @returns 是否已就绪
 */
async function ensureI18nReady(): Promise<boolean> {
    if (i18next.isInitialized) {
        return true
    }

    if (await waitForI18nInitialized(INIT_WAIT_TIMEOUT_MS)) {
        return true
    }

    try {
        await i18next.init()
        return i18next.isInitialized
    } catch (error) {
        console.warn("[translations-pack] i18next 未就绪，跳过文案注入", error)
        return false
    }
}

/**
 * 把游戏文案对照表注入 i18next。
 *
 * 注入后 `t("<简体中文原文>")` 即可在对应语言下取到译文。i18next 的查找顺序是
 * 「当前语言资源包 → 注入的对照表 → fallbackLng(zh-CN) → 原文键」，
 * 所以 public/i18n 里仍未迁移的条目（界面文案命名空间、属性说明等）照常生效。
 *
 * 同一语言只注入一次；重复注入相同内容会被 i18next 去重，但会白跑一遍合并。
 * @param locale 数据语言
 * @param force 是否强制重新注入（数据包换入后必须重来一次）
 */
export async function applyPackTranslations(locale: PackTranslationLocale, force = false): Promise<void> {
    if (!force && injectedLocales.has(locale)) {
        return
    }

    const table = getPackTranslationTable(locale)

    if (Object.keys(table).length === 0) {
        return
    }

    if (!(await ensureI18nReady())) {
        return
    }

    i18next.addResourceBundle(I18N_LANGUAGE_BY_LOCALE[locale], "translation", table, true, true)
    injectedLocales.add(locale)
}

/**
 * 把全部语言的对照表一次注入 i18next。
 *
 * 表体积不大，一次全部注入可以让语言切换不再有等待，
 * 也保证检索层反查译文时任何语言都已就绪。
 * @param force 是否强制重新注入
 */
export async function applyAllPackTranslations(force = false): Promise<void> {
    await Promise.all(SUPPORTED_LOCALES.map(locale => applyPackTranslations(locale, force)))
}

/**
 * 数据包换入后重新注入并把下游缓存判为失效。
 *
 * 重写插件生成的壳会在激活时把新包内容写回 `translations.data.ts` 的导出，
 * 因此这里必须清掉「已注入」标记重跑一遍，否则界面会一直停在旧版本的文案上。
 */
function reapplyAfterHydration(): void {
    injectedLocales.clear()
    for (const callback of invalidationCallbacks) {
        callback()
    }
    void applyAllPackTranslations(true)
}

// 数据包完成水合时重注入，把壳模块里新回填的对照表换上
registerDataPackHydrationCallback(reapplyAfterHydration)

// 真实（重）初始化会新建 ResourceStore 并清空已注入的对照表，而注入标记还记着旧状态。
// 每次 initialized 都清标记强制重注：水合先于页面初始化完成时翻译也不会丢失。
if (typeof i18next.on === "function") {
    i18next.on("initialized", () => {
        injectedLocales.clear()
        void applyAllPackTranslations(true)
    })
}
