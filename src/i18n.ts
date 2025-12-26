import i18next from "i18next"
import Backend, { HttpBackendOptions } from "i18next-http-backend"
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
]

export function changeLanguage(language: string) {
    i18next.changeLanguage(language)
}

export async function initI18n(selectedLanguage: string) {
    const lngCodes = i18nLanguages.map((l) => l.code)
    return i18next.use(Backend).init<HttpBackendOptions>({
        backend: {
            loadPath: "/i18n/{{lng}}/{{ns}}.json",
        },
        preload: [...lngCodes, selectedLanguage],
        supportedLngs: [...lngCodes, "dev"],
        fallbackLng: "zh-CN",
        debug: import.meta.env.TAURI_DEBUG,
        lng: selectedLanguage,

        interpolation: {
            escapeValue: false,
        },
    })
}
