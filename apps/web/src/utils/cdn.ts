import { env } from "@/env"

/**
 * 静态资源双源选择：**按带宽测速选优**，而不是「主源挂了才切兜底」。
 *
 * 背景：同一份资源同时存在于 OSS 与 R2 两个桶，两者互为冗余。哪一端更快取决于用户网络
 * 到各机房的链路，无法预先假定，因此启动时对两端各做一次一次性测速，之后整体使用较快的那端。
 *
 * 测速口径：对固定的靶子对象发一次 Range 请求（只取前 256KB），用「实际读到字节数 / 耗时」
 * 算吞吐。按带宽而非延迟判定——延迟低不代表下载快，而资源下载关心的是吞吐。
 * 两端靶子内容一致，因此比较是公平的。
 */

/** 测速靶子：7MB 的启动器背景视频，两端都有且稳定 */
const PROBE_PATH = "bg.mp4"

/** 单次测速取样字节数：足以抵消连接建立与首包延迟噪声，又不拖慢启动 */
const PROBE_BYTES = 256 * 1024

/** 单端测速超时（毫秒）：超时即判该端不可用 */
const PROBE_TIMEOUT_MS = 8000

/** 判定「更快」所需的最小领先比例：差距小于它视为打平，保持主源，避免抖动来回切 */
const SPEED_MARGIN_RATIO = 1.15

/** 基址末尾斜杠裁剪 */
function trimSlash(value: string): string {
    return value.replace(/\/+$/, "")
}

/** 两端基址标识 */
export type CdnSide = "oss" | "r2"

/** 测速结果 */
export type CdnProbeResult = {
    /** 选定的较快一端 */
    side: CdnSide
    /** 选定基址 */
    base: string
    /** 各端实测吞吐（字节/秒）；失败的一端为 null */
    speeds: { oss: number | null; r2: number | null }
}

/** 两端基址 */
const BASES: Record<CdnSide, string> = {
    oss: trimSlash(env.cdn),
    r2: trimSlash(env.cdnBackup),
}

/** 本次会话的测速结果；null 表示还没测过 */
let probeResult: CdnProbeResult | null = null
/** 进行中的测速任务，保证并发调用只测一次 */
let probePromise: Promise<CdnProbeResult> | null = null
/** 选定的一端；null 表示测速尚未出结果，此时按主源处理 */
let activeSide: CdnSide | null = null

/**
 * @description 取当前选定的 CDN 基址。测速未出结果时先返回主源，避免阻塞渲染。
 * @returns 当前基址
 */
export function getActiveCdnBase(): string {
    return BASES[activeSide ?? "oss"]
}

/**
 * @description 取当前选定的一端。
 * @returns 选定端；测速未完成时为主源
 */
export function getActiveCdnSide(): CdnSide {
    return activeSide ?? "oss"
}

/**
 * @description 取另一端的基址。
 * @returns 另一端基址
 */
export function getOtherCdnBase(): string {
    return BASES[activeSide === "r2" ? "oss" : "r2"]
}

/**
 * @description 按当前选定的快源拼出资源绝对地址。
 * @param path 资源相对路径，允许带前导斜杠
 * @returns 绝对地址
 */
export function buildCdnUrl(path: string): string {
    return `${getActiveCdnBase()}/${path.replace(/^\/+/, "")}`
}

/**
 * @description 生成主 / 兜底两个源的绝对地址（固定口径，供需要同时持有两端的场景使用）。
 * @param path 资源相对路径，允许带前导斜杠
 * @returns 两个源的绝对地址
 */
export function resolveCdnUrls(path: string): { primary: string; backup: string } {
    const relative = path.replace(/^\/+/, "")
    return {
        primary: `${BASES.oss}/${relative}`,
        backup: `${BASES.r2}/${relative}`,
    }
}

/**
 * @description 把某个源的绝对地址换到另一端。
 * 用于图片 `onerror` 这类只能拿到最终 URL、拿不到原始相对路径的场景。
 * @param url 当前地址
 * @returns 另一端的等价地址；该地址不在任一 CDN 基址下时返回 null
 */
export function swapCdnBase(url: string): string | null {
    if (!url) {
        return null
    }
    for (const side of ["oss", "r2"] as const) {
        const prefix = `${BASES[side]}/`
        if (url.startsWith(prefix)) {
            const other = side === "oss" ? BASES.r2 : BASES.oss
            return `${other}/${url.slice(prefix.length)}`
        }
    }
    return null
}

/**
 * @description 对单端做一次 Range 测速，返回实测吞吐。
 * 用 Range 只取前若干字节，避免为了测速下载整个大文件。
 * @param side 目标端
 * @returns 吞吐（字节/秒）；失败或超时返回 null
 */
async function measureSpeed(side: CdnSide): Promise<number | null> {
    const url = `${BASES[side]}/${PROBE_PATH}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
    const startedAt = performance.now()

    try {
        const response = await fetch(url, {
            cache: "no-store",
            signal: controller.signal,
            headers: { Range: `bytes=0-${PROBE_BYTES - 1}` },
        })
        if (!response.ok) {
            return null
        }

        const reader = response.body?.getReader()
        if (!reader) {
            const bytes = await response.arrayBuffer()
            const elapsed = (performance.now() - startedAt) / 1000
            return elapsed > 0 && bytes.byteLength > 0 ? bytes.byteLength / elapsed : null
        }

        // 逐块读取：收满样本量再停，避免只算到首包就得出虚高的速度
        let received = 0
        for (;;) {
            const { done, value } = await reader.read()
            if (done) {
                break
            }
            received += value?.byteLength ?? 0
            if (received >= PROBE_BYTES) {
                break
            }
        }
        // 收满样本即停：剩余字节不再消费，直接取消
        void reader.cancel().catch(() => {})

        const elapsed = (performance.now() - startedAt) / 1000
        if (received <= 0 || elapsed <= 0) {
            return null
        }
        return received / elapsed
    } catch {
        return null
    } finally {
        clearTimeout(timer)
    }
}

/**
 * @description 对两端各做一次测速，选出较快的一端并固定下来。并发调用会复用同一次测速。
 * @returns 测速结果
 */
export async function probeCdnSpeed(): Promise<CdnProbeResult> {
    if (probeResult) {
        return probeResult
    }
    if (probePromise) {
        return probePromise
    }

    probePromise = (async () => {
        const [ossSpeed, r2Speed] = await Promise.all([measureSpeed("oss"), measureSpeed("r2")])

        // 按带宽判定：只有兜底端实测吞吐明显领先才改用它，否则保持主源
        const side: CdnSide = r2Speed !== null && (ossSpeed === null || r2Speed > ossSpeed * SPEED_MARGIN_RATIO) ? "r2" : "oss"

        const result: CdnProbeResult = {
            side,
            base: BASES[side],
            speeds: { oss: ossSpeed, r2: r2Speed },
        }
        probeResult = result
        activeSide = side
        return result
    })()

    try {
        return await probePromise
    } finally {
        probePromise = null
    }
}

/**
 * @description 重置测速结果，让下次访问重新测速（网络环境变化时用）。
 */
export function resetCdnProbe(): void {
    probeResult = null
    activeSide = null
}

/**
 * @description 请求资源：**先打选定的快源**，失败时才回退另一端。
 * 快源由启动测速决定，因此「回退」只用于兜住单端故障，不是常规路径。
 * @param path 资源相对路径
 * @param init fetch 参数
 * @returns 响应
 * @throws 两个源都失败时抛出最后一个错误
 */
export async function fetchWithCdnFallback(path: string, init?: RequestInit): Promise<Response> {
    const preferred = buildCdnUrl(path)
    const fallback = `${getOtherCdnBase()}/${path.replace(/^\/+/, "")}`

    let lastError: unknown = null
    for (const url of [preferred, fallback]) {
        // 调用方主动中止（如超时）时不重试另一端：整体已判定失败，重试没有意义
        if (init?.signal?.aborted) {
            throw lastError instanceof Error ? lastError : new Error("请求已中止")
        }

        try {
            const response = await fetch(url, init)
            if (response.ok) {
                return response
            }
            // 保留非 2xx 的信息：另一端也失败时交给调用方判断
            lastError = new Error(`HTTP ${response.status}: ${url}`)
        } catch (error) {
            lastError = error
        }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError))
}
