import { computed, onMounted, onUnmounted, ref } from "vue"
import * as clipboard from "@tauri-apps/plugin-clipboard-manager"
import { env } from "./env"
import { LeveledSkillField } from "./data/leveled/LeveledSkill"
import { getMapAPI } from "./api/app"

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
const numKeys = new Set([
    "有效生命",
    "基础攻击",
    "基础生命",
    "基础护盾",
    "基础防御",
    "攻击范围",
    "固定攻击",
    "神智回复",
    "异常数量",
    "神智消耗",
    "最大耐受",
    "基础装填",
    "基础弹匣",
    "装填",
    "弹匣",
    "连击持续时间",
])
export function formatProp(prop: string, val: any): string {
    // 实现属性格式化的逻辑
    if (typeof val !== "number") return String(val)
    if (numKeys.has(prop)) return val > 0 && !prop.startsWith("基础") ? `+${val}` : `${val}`
    return prop.startsWith("基础") ? format100(val, 1) : format100r(val, 1)
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
        ? val.格式.replace(/\{%?\}/g, (v, i) =>
              v.includes("%") ? format100(i ? (val.值2 || val.段数)! : val.值) : format1(i ? (val.值2 || val.段数)! : val.值),
          )
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

export function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

import emojiJson from "./assets/emoji.json"

export interface EmojiStyle {
    type: "local" | "remote"
    src: string
    size?: number
    position?: string
}

const emojiDict = emojiJson.dict.reduce(
    (acc, cur) => {
        acc[cur.desc] = { type: "local", src: cur.image }
        return acc
    },
    {} as Record<string, EmojiStyle>,
)
let emojiDictLoaded = false

export function getEmoji(emoji: string): EmojiStyle | null {
    const result = emojiDict[emoji]
    if (!result) return null
    if (result.type === "local") {
        return { type: "local", src: result.src.startsWith("http") ? result.src : `/emojiimg/${result.src}` }
    }
    return result
}

export async function initEmojiDict() {
    if (emojiDictLoaded) return
    try {
        const api = getMapAPI()
        const res = await api.getEmojiList()
        if (res.is_success && res.data) {
            emojiDictLoaded = true
            for (const item of res.data) {
                const sizeEnum = item.size || 0
                if (sizeEnum === 1) {
                    continue
                }
                const emojiSize = 56
                const padding = 16
                const totalWidth = 2256
                const bgSize = totalWidth / 2
                const cols = 20
                const cellWidth = (bgSize - padding / 2) / cols
                for (let i = 0; i < item.content.length; i++) {
                    const content = item.content[i]
                    const key = content.startsWith("[") ? content : `[/${content}]`
                    if (emojiDict[key]) {
                        continue
                    }
                    const row = Math.floor(i / cols)
                    const col = i % cols
                    const posX = col * cellWidth + padding / 2
                    const posY = row * emojiSize + padding / 2
                    emojiDict[key] = {
                        type: "remote",
                        src: `${item.url}?x-oss-process=image/resize,w_${totalWidth}`,
                        size: bgSize,
                        position: `-${posX}px -${posY}px`,
                    }
                }
            }
        }
    } catch (e) {
        console.error("获取 Emoji 列表失败", e)
    }
}

/**
 * 将毫秒转换为天、时、分、秒格式
 * @param ms 毫秒数
 * @returns 格式化后的时间字符串
 */
export function timeStr(ms: number) {
    // 返回3时42分18秒格式
    const d = ~~(ms / 864e5)
    const h = ~~(ms / 36e5) % 24
    const m = ~~((ms % 36e5) / 6e4)
    const s = ~~((ms % 6e4) / 1e3)
    function p(n: number) {
        return n < 10 ? `0${n}` : n
    }
    if (d) {
        return `${d}:${p(h)}:${p(m)}:${p(s)}`
    }
    if (h) {
        return `${p(h)}:${p(m)}:${p(s)}`
    }
    if (m) {
        return `${p(m)}:${p(s)}`
    }
    return `00:${p(s)}`
}
export function useGameTimer() {
    /**
     * 将当前UTC时间以指定时间间隔为单位向上取整，并返回与当前时间的差值（毫秒）
     * @param interval 时间间隔，单位天
     * @param offset 偏移量，单位天
     */
    function getIntervalDayTime(interval: number = 3, offset: number = 0): number {
        // 获取当前UTC时间戳
        const now = new Date().getTime()

        // 3天的毫秒数：3 * 24小时 * 60分钟 * 60秒 * 1000毫秒
        const oneDay = 24 * 60 * 60 * 1000
        const oneHour = 60 * 60 * 1000
        offset = offset * oneDay + 3 * oneHour // 5点
        // 计算向上取整后的时间戳
        const next3DayTimestamp = Math.ceil((now + offset) / (interval * oneDay)) * (interval * oneDay) - offset

        // 返回差值
        return next3DayTimestamp - now
    }

    function getIntervalHourTime(interval: number = 3, offset: number = 0): number {
        // 获取当前UTC时间戳
        const now = new Date().getTime()

        // 3天的毫秒数：3 * 24小时 * 60分钟 * 60秒 * 1000毫秒
        const oneHour = 60 * 60 * 1000
        offset = offset * oneHour
        // 计算向上取整后的时间戳
        const next3DayTimestamp = Math.ceil((now + offset) / (interval * oneHour)) * (interval * oneHour) - offset

        // 返回差值
        return next3DayTimestamp - now
    }

    // 倒计时剩余毫秒
    const moling = ref(getIntervalDayTime(3, 1))
    const zhouben = ref(getIntervalDayTime(7, 3))
    const mihan = ref(getIntervalHourTime(1))

    let timer: number | null = null

    onMounted(() => {
        // 每秒更新一次
        timer = window.setInterval(() => {
            moling.value = getIntervalDayTime(3, 1)
            zhouben.value = getIntervalDayTime(7, 3)
            mihan.value = getIntervalHourTime(1)
        }, 1000)
    })

    onUnmounted(() => {
        if (timer) {
            clearInterval(timer)
        }
    })
    return {
        moling,
        zhouben,
        mihan,
    }
}
