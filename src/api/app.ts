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

export async function launchNormal(path: string, params: string) {
    return await invoke<string>("launch_normal", { path, params })
}

export async function runAsAdmin() {
    return await invoke<string>("run_as_admin", {})
}

export async function openExplorer(dir: string) {
    return await invoke<string>("launch_normal", { path: "explorer.exe", params: dir })
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
 * 读取文本文件内容
 * @param filePath 文件路径
 * @returns 文件内容
 */
export async function readTextFile(filePath: string) {
    return await invoke<string>("read_text_file", { filePath })
}

/**
 * 写入文本文件内容
 * @param filePath 文件路径
 * @param content 文件内容
 * @returns 成功消息
 */
export async function writeTextFile(filePath: string, content: string) {
    return await invoke<string>("write_text_file", { filePath, content })
}

/**
 * 列出指定目录下的所有 JS 文件
 * @param dirPath 目录路径
 * @returns 文件名列表
 */
export async function listScriptFiles(dirPath: string) {
    return await invoke<string[]>("list_script_files", { dirPath })
}

/**
 * 列出指定目录下的所有文件
 * @param dirPath 目录路径
 * @returns 文件名列表
 */
export async function listFiles(dirPath: string) {
    return await invoke<string[]>("list_files", { dirPath })
}

/**
 * 提取游戏资产
 * @param zipPath 压缩包路径
 * @param targetDir 目标目录
 * @returns 成功消息
 */
export async function extractGameAssets(zipPath: string, targetDir: string) {
    return await invoke<string>("extract_game_assets", { zipPath, targetDir })
}

/**
 * 重命名文件
 * @param oldPath 原文件路径
 * @param newPath 新文件路径
 * @returns 成功消息
 */
export async function renameFile(oldPath: string, newPath: string) {
    return await invoke<string>("rename_file", { oldPath, newPath })
}

/**
 * 删除文件
 * @param filePath 文件路径
 * @returns 成功消息
 */
export async function deleteFile(filePath: string) {
    return await invoke<string>("delete_file", { filePath })
}

/**
 * 监听文件变化
 * @param filePath 文件路径
 * @returns 成功消息
 */
export async function watchFile(filePath: string) {
    return await invoke<string>("watch_file", { filePath })
}

/**
 * 取消监听文件
 * @param filePath 文件路径
 * @returns 成功消息
 */
export async function unwatchFile(filePath: string) {
    return await invoke<string>("unwatch_file", { filePath })
}

/**
 * 运行指定的脚本文件
 * @param filePath 脚本文件路径
 * @returns 脚本返回值字符串（无返回值时为空字符串）
 */
export async function runScript(scriptPath: string) {
    return await invoke<string>("run_script", { scriptPath })
}

/**
 * 响应脚本配置读取请求
 * @param requestId 请求 ID
 * @param value 配置值（string/number/boolean/string[]）
 * @returns 成功消息
 */
export async function resolveScriptConfigRequest(requestId: string, value: string | number | boolean | string[]) {
    return await invoke<string>("resolve_script_config_request", { requestId, value })
}

/**
 * 停止当前运行的脚本
 * @returns 成功消息
 */
export async function stopScript() {
    return await invoke<string>("stop_script")
}

/**
 * 停止指定脚本路径对应的运行实例。
 * @param scriptPath 脚本完整路径
 * @returns 成功消息
 */
export async function stopScriptByPath(scriptPath: string) {
    return await invoke<string>("stop_script_by_path", { scriptPath })
}

/**
 * 获取脚本运行状态（用于页面刷新后恢复运行态显示）。
 * @returns 是否存在正在运行的脚本
 */
export async function getScriptRunningState() {
    return await invoke<boolean>("get_script_running_state")
}

/**
 * 脚本运行信息。
 */
export interface ScriptRuntimeInfo {
    running: boolean
    scriptPaths: string[]
    runningCount: number
}

/**
 * 脚本热键绑定。
 */
export interface ScriptHotkeyBinding {
    scriptPath: string
    hotkey: string
    hotIfWinActive?: string
    holdToLoop?: boolean
}

/**
 * 获取脚本运行信息（用于页面刷新后恢复运行脚本上下文）。
 * @returns 脚本运行信息
 */
export async function getScriptRuntimeInfo() {
    return await invoke<ScriptRuntimeInfo>("get_script_runtime_info")
}

/**
 * 同步脚本热键绑定。
 * @param bindings 完整绑定列表（会覆盖后端当前配置）
 * @returns 成功消息
 */
export async function syncScriptHotkeyBindings(bindings: ScriptHotkeyBinding[]) {
    return await invoke<string>("sync_script_hotkey_bindings", { bindings })
}

/**
 * 读取后端当前已生效的热键绑定。
 * @returns 热键绑定列表
 */
export async function getScriptHotkeyBindings() {
    return await invoke<ScriptHotkeyBinding[]>("get_script_hotkey_bindings")
}

/**
 * 获取文档目录路径
 * @returns 文档目录路径
 */
export async function getDocumentsDir() {
    return await invoke<string>("get_documents_dir")
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

/**
 * 获取文件大小
 * @param filePath 文件路径
 * @returns 文件大小（字节），如果文件不存在返回0
 */
export async function getFileSize(filePath: string) {
    return await invoke<number>("get_file_size", { filePath })
}

/**
 * 清理临时目录
 * @param tempDir 临时目录路径
 * @returns 清理结果消息
 */
export async function cleanupTempDir(tempDir: string) {
    return await invoke<string>("cleanup_temp_dir", { tempDir })
}

export const getMapAPI = () => {
    return new DNAAPI({ fetchFn: tauriFetch })
}
