import { invoke } from "@tauri-apps/api/core"
import { DNAAPI } from "dna-api"
import { env } from "../env"

export const MATERIALS = ["None", "Blur", "Acrylic", "Mica", "Mica_Dark", "Mica_Tabbed", "Mica_Tabbed_Dark"] as const
export async function applyMaterial(material: (typeof MATERIALS)[number]) {
    return (await invoke("apply_material", { material })) as string
}

export async function getOSVersion() {
    return await invoke<string>("get_os_version")
}

export async function getGameInstall() {
    return await invoke<string>("get_game_install")
}

export async function isGameRunning(isRun: boolean) {
    return await invoke<string>("is_game_running", { isRun })
}

export async function launchExe(path: string, params: string) {
    return await invoke<string>("launch_exe", { path, params })
}

export async function openExplorer(dir: string) {
    return await invoke<string>("launch_exe", { path: "explorer.exe", params: dir })
}

export async function importMod(gamebase: string, paths: string[]) {
    const data = await invoke<string>("import_mod", { gamebase, paths })
    return JSON.parse(data) as [string, number][]
}

export async function enableMod(srcdir: string, dstdir: string, files: string[]) {
    return await invoke<string>("enable_mod", { srcdir, dstdir, files })
}

export async function importPic(path: string) {
    return await invoke<string>("import_pic", { path })
}

export async function exportJsonFile(filePath: string, jsonContent: string) {
    return await invoke<string>("export_json_file", { filePath, jsonContent })
}

/**
 * 启动心跳
 * @param url The url of the websocket server
 * @param token The token of the user
 * @param userId The userId of the user
 */
export async function startHeartbeat(url: string, token: string, userId: string) {
    return await invoke<string>("start_heartbeat", {
        url,
        token,
        userId,
        interval: 10, // 10秒间隔
    })
}

/**
 * 停止心跳
 */
export async function stopHeartbeat() {
    return await invoke("stop_heartbeat")
}

/**
 * 导出二进制文件到指定路径
 * @param filePath 文件路径
 * @param binaryContent 二进制内容
 * @returns 成功消息
 */
export async function exportBinaryFile(filePath: string, binaryContent: Uint8Array) {
    return await invoke<string>("export_binary_file", { filePath, binaryContent })
}
/**
 * 获取本地登录的QQ号
 * @param port The port of the local QQ
 * @example 4301 4303 4305 ...
 * @returns JSON
 */
export async function getLocalQQ(port: number) {
    return JSON.parse(await invoke<string>("get_local_qq", { port })) as {
        uin: number
        face_index: number
        gender: number
        nickname: string
        client_type: number
        uin_flag: number
        account: number
    }[]
}

// 自定义Headers类，解决浏览器默认Headers无法添加自定义headers的问题
class TauriHeaders {
    private headers: Record<string, string[]>

    constructor(init?: HeadersInit) {
        this.headers = {}
        if (init) {
            if (Array.isArray(init)) {
                // 处理[[name1, value1], [name2, value2]]格式
                for (const [name, value] of init) {
                    this.append(name, value)
                }
            } else if (typeof init === "object" && init !== null) {
                try {
                    // 尝试处理Headers对象格式
                    const headersObj = init as Headers
                    for (const [name, value] of headersObj.entries()) {
                        this.append(name, value)
                    }
                } catch {
                    // 处理{name1: value1, name2: value2}格式
                    for (const [name, value] of Object.entries(init)) {
                        this.append(name, value)
                    }
                }
            }
        }
    }

    append(name: string, value: string): void {
        const lowerName = name.toLowerCase()
        if (!this.headers[lowerName]) {
            this.headers[lowerName] = []
        }
        this.headers[lowerName].push(value)
    }

    delete(name: string): void {
        const lowerName = name.toLowerCase()
        delete this.headers[lowerName]
    }

    get(name: string): string | null {
        const lowerName = name.toLowerCase()
        const values = this.headers[lowerName]
        return values ? values[0] : null
    }

    has(name: string): boolean {
        const lowerName = name.toLowerCase()
        return lowerName in this.headers
    }

    set(name: string, value: string): void {
        const lowerName = name.toLowerCase()
        this.headers[lowerName] = [value]
    }

    getSetCookie(): string[] {
        const setCookie = this.headers["set-cookie"]
        return setCookie || []
    }

    forEach(callbackfn: (value: string, key: string, parent: any) => void, thisArg?: any): void {
        for (const [lowerName, values] of Object.entries(this.headers)) {
            for (const value of values) {
                callbackfn.call(thisArg, value, lowerName, this)
            }
        }
    }

    entries(): any {
        const entries: [string, string][] = []
        for (const [lowerName, values] of Object.entries(this.headers)) {
            for (const value of values) {
                entries.push([lowerName, value])
            }
        }
        return entries[Symbol.iterator]()
    }

    keys(): any {
        const keys: string[] = []
        for (const lowerName of Object.keys(this.headers)) {
            keys.push(lowerName)
        }
        return keys[Symbol.iterator]()
    }

    values(): any {
        const values: string[] = []
        for (const valuesList of Object.values(this.headers)) {
            for (const value of valuesList) {
                values.push(value)
            }
        }
        return values[Symbol.iterator]()
    }

    [Symbol.iterator](): any {
        return this.entries()
    }
}

class TauriResponse {
    readonly status: number
    readonly statusText: string
    readonly headers: TauriHeaders
    readonly ok: boolean
    readonly redirected: boolean
    readonly type: ResponseType
    readonly url: string
    readonly body: ReadableStream | null = null
    readonly bodyUsed: boolean = false
    private bodyText: string

    constructor(status: number, body: string, headers: [string, string][]) {
        this.status = status
        this.statusText = status >= 200 && status < 300 ? "OK" : "Error"
        this.headers = new TauriHeaders(headers)
        this.ok = status >= 200 && status < 300
        this.redirected = false
        this.type = "basic"
        this.url = ""
        this.bodyText = body
    }

    async json(): Promise<any> {
        return JSON.parse(this.bodyText)
    }

    async text(): Promise<string> {
        return this.bodyText
    }

    async blob(): Promise<Blob> {
        throw new Error("blob() not implemented")
    }

    async formData(): Promise<FormData> {
        throw new Error("formData() not implemented")
    }

    async arrayBuffer(): Promise<ArrayBuffer> {
        const encoder = new TextEncoder()
        return encoder.encode(this.bodyText).buffer
    }

    async bytes(): Promise<Uint8Array<ArrayBuffer>> {
        const encoder = new TextEncoder()
        return encoder.encode(this.bodyText)
    }

    clone(): TauriResponse {
        // 将当前headers转换为数组格式传递给新实例
        const headersArray: [string, string][] = []
        for (const [name, value] of this.headers.entries()) {
            headersArray.push([name, value])
        }
        return new TauriResponse(this.status, this.bodyText, headersArray)
    }
}

export async function tauriFetch(url: RequestInfo | URL, options?: RequestInit): Promise<Response> {
    if (!env.isApp) {
        throw new Error("网页不给用了, 请下载APP")
    }
    const method = options?.method ?? "GET"

    let body: string | undefined
    let multipart: [string, string | { filename: string; data: number[]; mime?: string }][] | undefined

    if (options?.body instanceof FormData) {
        multipart = []
        for (const [key, value] of options.body.entries()) {
            if (value instanceof File) {
                const arrayBuffer = await value.arrayBuffer()
                const data = Array.from(new Uint8Array(arrayBuffer))
                multipart.push([
                    key,
                    {
                        filename: value.name,
                        data,
                        mime: value.type || undefined,
                    },
                ])
            } else {
                multipart.push([key, value as string])
            }
        }
    } else {
        body = typeof options?.body === "string" ? options.body : options?.body?.toString()
    }

    const headers = options?.headers ? Object.entries(options.headers as Record<string, string>) : undefined
    const result = await invoke<{ status: number; body: string; headers: [string, string][] }>("fetch", {
        url: url.toString(),
        method,
        body,
        headers,
        multipart,
    })
    return new TauriResponse(result.status, result.body, result.headers)
}

export const getMapAPI = () => {
    return new DNAAPI({ fetchFn: tauriFetch })
}
