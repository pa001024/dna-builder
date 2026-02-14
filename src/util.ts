import * as clipboard from "@tauri-apps/plugin-clipboard-manager"
import i18next from "i18next"
import { computed, onMounted, onUnmounted, ref } from "vue"
import type { LeveledSkillField } from "@/data"
import { env } from "./env"

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
export function format1000(n: number, di = 0) {
    return `${n.toLocaleString("en-US", { minimumFractionDigits: di, maximumFractionDigits: di })}`
}

// 返回10K,10M,10B格式的大数字
export function formatBigNumber(n: number) {
    if (i18next.language.startsWith("zh")) {
        if (n >= 1e8) return `${+(n / 1e8).toFixed(3)}E`
        if (n >= 1e5) return `${+(n / 1e4).toFixed(3)}W`
    } else {
        if (n >= 1e9) return `${+(n / 1e9).toFixed(3)}B`
        if (n >= 1e6) return `${+(n / 1e6).toFixed(3)}M`
        // if (n >= 1e3) return `${+(n / 1e3).toFixed(2)}K`
    }
    return `${+n.toFixed(2)}`
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
    "弹匣",
    "装填",
    "连击持续时间",
    "子弹爆炸范围",
])
export function formatProp(prop: string, val: any): string {
    // 实现属性格式化的逻辑
    if (typeof val !== "number") return String(val)
    if (numKeys.has(prop)) return val > 0 && !prop.startsWith("基础") ? `+${+val.toFixed(2)}` : `${+val.toFixed(2)}`
    return prop.startsWith("基础") ? format100(val, 1) : format100r(val, 1)
}
export function formatWeaponProp(prop: string, val: any): string {
    // 实现属性格式化的逻辑
    if (typeof val !== "number") return String(val)
    if (numKeys.has(prop)) return `${+val.toFixed(2)}`
    return format100(val, 1)
}
const propRegex = /神智消耗|神智回复$/
export function formatSkillProp(prop: string, val: LeveledSkillField) {
    const fmt = propRegex.test(prop) ? format1 : format100
    return val.格式
        ? val.格式.replace(/\{%?\}/g, (v, i) => (v.includes("%") ? format100(i ? val.值2! : val.值) : format1(i ? val.值2! : val.值)))
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
    return new Promise(resolve => setTimeout(resolve, ms))
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
        const now = Date.now()

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
        const now = Date.now()

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

/**
 * Base62 编码字符集 (0-9, a-z, A-Z)
 */
const BASE62_CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

/**
 * 将数字编码为 base62 字符串
 */
export function encodeBase62(num: number): string {
    if (num === 0) return "0"
    let result = ""
    let n = Math.abs(num)
    while (n > 0) {
        result = BASE62_CHARS[n % 62] + result
        n = Math.floor(n / 62)
    }
    return num < 0 ? `-${result}` : result
}

/**
 * 将 base62 字符串解码为数字
 */
export function decodeBase62(str: string): number {
    const isNegative = str.startsWith("-")
    const s = isNegative ? str.slice(1) : str
    let result = 0
    for (let i = 0; i < s.length; i++) {
        const charIndex = BASE62_CHARS.indexOf(s[i])
        if (charIndex === -1) {
            throw new Error(`Invalid base62 character: ${s[i]}`)
        }
        result = result * 62 + charIndex
    }
    return isNegative ? -result : result
}

/**
 * 将 DataURL 转换为 File 对象
 * @param {string} dataUrl - 标准 DataURL（如 data:image/png;base64,iVBORw0KGgo...）
 * @param {string} filename - 生成 File 的文件名（如 "avatar.png"）
 * @returns {File | null} 转换后的 File 对象，失败返回 null
 */
export function dataUrlToFile(dataUrl: string, filename: string): File | null {
    const dataUrlRegex = /^data:([^;]+);base64,/
    const match = dataUrl.match(dataUrlRegex)

    if (!match) {
        console.error("无效的 DataURL 格式")
        return null
    }

    const mimeType = match[1] // 如 "image/png"
    const base64Data = dataUrl.split(",")[1]

    try {
        const binaryStr = atob(base64Data)
        const len = binaryStr.length
        const uint8Array = new Uint8Array(len)

        for (let i = 0; i < len; i++) {
            uint8Array[i] = binaryStr.charCodeAt(i)
        }

        const blob = new Blob([uint8Array], { type: mimeType })
        return new File([blob], filename, { type: mimeType })
    } catch (error) {
        console.error("Base64 解码或 File 生成失败:", error)
        return null
    }
}
