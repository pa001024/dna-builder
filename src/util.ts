import { computed } from "vue"
import * as clipboard from "@tauri-apps/plugin-clipboard-manager"
import { env } from "./env"

export function useState<T, N extends keyof T>(obj: T, key: N) {
    return [computed(() => obj[key]), (val: T[N]) => (obj[key] = val)] as const
}
export function format100(n100: number, di = 2) {
    return `${+(n100 * 100).toFixed(di)}%`
}
export function format100r(n100: number, di = 2) {
    return `${n100 >= 0 ? "+" : ""}${+(n100 * 100).toFixed(di)}%`
}
const numKeys = new Set(["攻击范围", "固定攻击", "神智回复", "异常数量"])
export function formatProp(prop: string, val: any): string {
    // 实现属性格式化的逻辑
    if (typeof val !== "number") return String(val)
    if (numKeys.has(prop)) return val > 0 ? `+${val}` : `${val}`
    return format100r(val, 1)
}

export async function copyText(text: string) {
    if (env.isApp) {
        await clipboard.writeText(text)
        return
    }
    if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
        return
    }
    const input = document.createElement("textarea")
    input.value = text
    input.style.position = "fixed"
    input.style.opacity = "0"
    document.body.appendChild(input)
    input.focus()
    input.select()
    const result = document.execCommand("copy")
    input.remove()
    if (!result) throw new Error("复制失败")
}

export async function pasteText() {
    if (env.isApp) {
        return await clipboard.readText()
    }
    return await navigator.clipboard.readText()
}

export function base36Pad(num: number) {
    const base36 = num.toString(36).toUpperCase()
    return base36.padStart(4, "0")
}
