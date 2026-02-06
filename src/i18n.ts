import i18next from "i18next"
import Backend, { type HttpBackendOptions } from "i18next-http-backend"
export const i18nLanguages = [
    {
        name: "English",
        code: "en",
    },
    {
        name: "中文（简体）",
        code: "zh-CN",
        alias: ["zh", "zh-Hans", "zh-Hans-CN"],
    },
    {
        name: "中文（繁體）",
        code: "zh-TW",
        alias: ["zh-Hant", "zh-Hant-TW"],
    },
    {
        name: "日本語",
        code: "ja",
        alias: ["ja-JP"],
    },
    {
        name: "한국어",
        code: "ko",
        alias: ["ko-KR"],
    },
    {
        name: "Français",
        code: "fr",
        alias: ["fr-FR"],
    },
]

export function changeLanguage(language: string) {
    i18next.changeLanguage(language)
}

export async function initI18n(selectedLanguage: string) {
    const lngCodes = i18nLanguages.map(l => l.code)
    return i18next.use(Backend).init<HttpBackendOptions>({
        backend: {
            loadPath: "/i18n/{{lng}}/{{ns}}.json",
        },
        preload: [selectedLanguage],
        supportedLngs: [...lngCodes, "dev"],
        fallbackLng: "zh-CN",
        debug: import.meta.env.TAURI_DEBUG,
        lng: selectedLanguage,

        interpolation: {
            escapeValue: false,
        },
    })
}

/**
 * 等待i18next语言包初始加载完成（适配25.x，替代废弃的waitForInitialLoad）
 * @param {Object} options 配置项
 * @param {string} [options.lng=i18next.language] 要检查的语言（默认当前语言）
 * @param {string|string[]} [options.ns='translation'] 要检查的命名空间（默认translation）
 * @param {number} [options.timeout=10000] 超时时间（ms），默认10秒
 * @returns {Promise<void>} 加载完成resolve，超时/reject则reject
 */
export async function waitForInitialLoad({
    lng = localStorage.getItem("setting_lang") || navigator.language,
    ns = "translation",
    timeout = 10000,
}: {
    lng?: string
    ns?: string | string[]
    timeout?: number
} = {}): Promise<void> {
    // 第一步：先检查——若资源已加载，直接resolve，无需等待事件
    const nsList = Array.isArray(ns) ? ns : [ns]
    const isAllLoaded = i18next.isInitialized && nsList.every(namespace => i18next.hasResourceBundle(lng, namespace))
    if (isAllLoaded) {
        return
    }

    // 第二步：封装loaded事件为Promise + 超时保护
    return new Promise((resolve, reject) => {
        // 超时处理
        const timeoutTimer = setTimeout(() => {
            i18next.off("loaded", handleLoaded) // 清理事件监听
            reject(new Error(`语言包加载超时（${timeout}ms），语言：${lng}，命名空间：${nsList.join(",")}`))
        }, timeout)

        // loaded事件处理
        const handleLoaded = () => {
            // 二次校验：确保指定语言/命名空间真的加载完成（避免事件误触发）
            const isLoadedAfterEvent = nsList.every(namespace => i18next.hasResourceBundle(lng, namespace))
            if (isLoadedAfterEvent) {
                clearTimeout(timeoutTimer) // 清除超时器
                i18next.off("loaded", handleLoaded) // 清理事件监听
                resolve()
            }
        }

        // 绑定loaded事件
        i18next.on("loaded", handleLoaded)
    })
}
