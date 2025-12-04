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
        fallbackLng: lngCodes[0] || "en",
        debug: import.meta.env.TAURI_DEBUG,
        lng: selectedLanguage,

        interpolation: {
            escapeValue: false,
        },
    })
}
