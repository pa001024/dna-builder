import { computed } from "vue"
import * as clipboard from "@tauri-apps/plugin-clipboard-manager"
import { env } from "./env"
import { LeveledSkillField } from "./data/leveled/LeveledSkill"

export function useState<T, N extends keyof T>(obj: T, key: N) {
    return [computed(() => obj[key]), (val: T[N]) => (obj[key] = val)] as const
}
export function format1(n1: number, di = 1) {
    return `${+n1.toFixed(di)}`
}
export function format100(n100: number, di = 2) {
    return `${+(n100 * 100).toFixed(di)}%`
}
export function format100r(n100: number, di = 2) {
    return `${n100 >= 0 ? "+" : ""}${+(n100 * 100).toFixed(di)}%`
}
const numKeys = new Set(["攻击范围", "固定攻击", "神智回复", "异常数量", "神智消耗", "基础攻击"])
export function formatProp(prop: string, val: any): string {
    // 实现属性格式化的逻辑
    if (typeof val !== "number") return String(val)
    if (numKeys.has(prop)) return val > 0 ? `+${val}` : `${val}`
    return format100r(val, 1)
}
export function formatWeaponProp(prop: string, val: any): string {
    // 实现属性格式化的逻辑
    if (typeof val !== "number") return String(val)
    if (numKeys.has(prop)) return "" + val.toFixed(2)
    return format100(val, 1)
}
const propRegex = /神智消耗|神智回复$/
export function formatSkillProp(prop: string, val: LeveledSkillField) {
    const fmt = propRegex.test(prop) ? format1 : format100
    return val.格式
        ? val.格式.replace(/\{%?\}/g, (v, i) => (v.includes("%") ? format100(i ? val.额外! : val.值) : format1(i ? val.额外! : val.值)))
        : fmt(val.值)
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
