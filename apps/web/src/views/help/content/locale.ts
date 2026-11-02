import { useTranslation } from "i18next-vue"
import { type InjectionKey, inject, onBeforeUnmount, onMounted, provide, ref } from "vue"
import type { HelpLocale, HelpText } from "./types"

export type HelpTextResolver = (text: HelpText | null | undefined) => string

export const HELP_TEXT_KEY: InjectionKey<HelpTextResolver> = Symbol("help-text")

/**
 * 把 i18next 的语言码归一到帮助内容的六语言键。
 * @param language 当前语言
 */
export function normalizeHelpLocale(language: string | undefined): HelpLocale {
    const value = (language ?? "").toLowerCase()
    if (value.startsWith("zh-tw") || value.startsWith("zh-hant") || value === "tw") return "zh-TW"
    if (value.startsWith("zh")) return "zh-CN"
    if (value.startsWith("ja")) return "ja"
    if (value.startsWith("ko")) return "ko"
    if (value.startsWith("fr")) return "fr"
    return "en"
}

/**
 * 在帮助中心根组件提供响应式的六语言文案解析器。
 * @returns 文案解析函数
 */
export function provideHelpText(): HelpTextResolver {
    const { i18next } = useTranslation()
    const locale = ref<HelpLocale>(normalizeHelpLocale(i18next.resolvedLanguage ?? i18next.language))
    const update = (language: string) => {
        locale.value = normalizeHelpLocale(language)
    }
    onMounted(() => i18next.on("languageChanged", update))
    onBeforeUnmount(() => i18next.off("languageChanged", update))
    const resolve: HelpTextResolver = text => {
        if (!text) return ""
        if (typeof text === "string") return text
        return text[locale.value] || text["zh-CN"]
    }
    provide(HELP_TEXT_KEY, resolve)
    return resolve
}

/**
 * 读取帮助中心根组件提供的文案解析器；脱离根组件时回落简体中文。
 */
export function useHelpText(): HelpTextResolver {
    return inject(HELP_TEXT_KEY, text => {
        if (!text) return ""
        if (typeof text === "string") return text
        return text["zh-CN"]
    })
}

/**
 * 把秒数格式化为 m:ss。
 * @param seconds 秒数
 */
export function formatDuration(seconds: number): string {
    const total = Math.max(0, Math.round(seconds))
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}
