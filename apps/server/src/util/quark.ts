import { createHash, randomUUID } from "node:crypto"
import { Sha1 } from "./sha1"

/**
 * 夸克网盘开放平台 HTTP 客户端
 *
 * 只用原生 fetch + node:crypto，不引入第三方 SDK：
 * 鉴权为 `x-pan-*` 请求签名，上传走 预上传 → 补哈希 → 取地址 → 直传 → 完成确认 五步流程，
 * 解锁密码压缩包这类 KB 级小文件只会产生单个分片。
 */

export const QUARK_API_BASE = "https://open-api-drive.quark.cn"

/** 统一响应包络：status === 0 且 data 存在视为成功。 */
export interface QuarkEnvelope<T> {
    status: number
    errno: number
    error_info: string
    agent_msg?: string
    req_id?: string
    data?: T
}

/** 夸克客户端配置，密钥类字段全部来自环境变量。 */
export interface QuarkConfig {
    clientId: string
    signKey: string
    deviceId: string
    deviceName: string
    accessToken: string
    refreshToken: string
}

/** 分片上传地址项。 */
export interface QuarkUploadUrl {
    part_number: number
    upload_url: string
    signature_info: { signature: string }
}

/** 分片并行校验上下文：part_number > 1 的分片取地址时需携带此前全部字节的 SHA1 链接值。 */
export interface QuarkParallelSha1Ctx {
    part_offset: number
    h: [number, number, number, number, number]
}

/** 预上传 / 补哈希 / 完成上传共用的任务回执。 */
export interface QuarkUploadTask {
    task_id: string
    part_size?: number
    finish?: number
    fid?: string
    upload_urls?: QuarkUploadUrl[]
    /** 分片直传必须携带的公共头（服务端下发，如 X-Oss-Content-Sha256 / X-Oss-Date） */
    common_headers?: Record<string, string>
}

/** 上传完成后的文件标识。 */
export interface QuarkUploadResult {
    fid: string
    fileName: string
    size: number
}

/** 分享创建回执。 */
export interface QuarkShareResult {
    share_url: string
    passcode: string
    title: string
}

/** 分享内的文件条目（转存用 share_fid_token，展示用 filename/size）。 */
export interface QuarkShareFileItem {
    fid: string
    filename: string
    size: number
    file_type: number
    share_fid_token: string
}

type FetchFn = typeof fetch

/**
 * 读取夸克配置。client / 签名密钥 / 设备号有 wild 模式默认值，
 * 但 access_token 为空时视为未配置（需先走 OAuth 授权拿到令牌）。
 */
export function readQuarkConfig(env: NodeJS.ProcessEnv = process.env): QuarkConfig {
    return {
        clientId: env.QUARK_CLIENT_ID || "third_party_agent",
        signKey: env.QUARK_SIGN_KEY || "cf134812e2de4032bd1cb7c3727e84b3",
        deviceId: env.QUARK_DEVICE_ID || "wild_claw",
        deviceName: env.QUARK_DEVICE_NAME || "DNABuilder",
        accessToken: env.QUARK_ACCESS_TOKEN || "",
        refreshToken: env.QUARK_REFRESH_TOKEN || "",
    }
}

/** 是否具备调用夸克接口的最小条件（有访问令牌）。 */
export function isQuarkConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
    return Boolean(env.QUARK_ACCESS_TOKEN)
}

/**
 * 计算 `x-pan-token` 请求签名：SHA256_hex("{METHOD}&{PATH}&{TM}&{SIGN_KEY}")。
 * @param method 大写 HTTP 方法
 * @param path 仅 URL 路径（不含域名与查询串）
 * @param tm 毫秒时间戳字符串（与 x-pan-tm 头一致）
 * @param signKey 签名密钥
 */
export function signQuarkRequest(method: string, path: string, tm: string, signKey: string): string {
    return createHash("sha256").update(`${method}&${path}&${tm}&${signKey}`).digest("hex")
}

/**
 * 把目录配置解析为 fid：空 / "0" 即根目录；32 位 hex 视为 fid 直用；其余视为路径
 * （经 createDir 幂等创建多级目录后拿 fid）。
 * @param client 夸克客户端
 * @param dir 目录配置原文
 * @returns 目标目录 fid
 */
export async function resolveDirFid(client: QuarkClient, dir: string): Promise<string> {
    const trimmed = (dir || "").trim()
    if (!trimmed || trimmed === "0") {
        return "0"
    }
    if (/^[0-9a-f]{32}$/i.test(trimmed)) {
        return trimmed
    }
    const created = await client.createDir(trimmed.replace(/^\/+/, ""))
    return created.fid
}

/** token 失效类 errno：11001（Access Token 无效）/ 31001（invalid token）。 */
function isTokenExpiredErrno(errno: number): boolean {
    return errno === 11001 || errno === 31001
}

export class QuarkClient {
    private refreshed = false

    constructor(
        private readonly config: QuarkConfig = readQuarkConfig(),
        private readonly fetchFn: FetchFn = fetch
    ) {}

    /**
     * 发起一次带 `x-pan-*` 签名的 JSON 请求，自动处理包络校验与一次 token 刷新重试。
     * @param method HTTP 方法
     * @param path 接口路径
     * @param body 请求体（GET 时省略）
     * @param query 追加的 URL 查询参数（如文件详情的 fid）
     */
    async request<T>(method: "GET" | "POST", path: string, body?: unknown, query?: Record<string, string>): Promise<T> {
        const data = await this.requestRaw<T>(method, path, body, query)
        return data
    }

    private async requestRaw<T>(method: "GET" | "POST", path: string, body?: unknown, query?: Record<string, string>): Promise<T> {
        const tm = String(Date.now())
        const reqId = randomUUID()
        const params = new URLSearchParams({ req_id: reqId, access_token: this.config.accessToken, device_id: this.config.deviceId })
        for (const [key, value] of Object.entries(query ?? {})) {
            params.set(key, value)
        }
        const url = `${QUARK_API_BASE}${path}?${params.toString()}`
        const response = await this.fetchFn(url, {
            method,
            headers: {
                "x-pan-client-id": this.config.clientId,
                "x-pan-tm": tm,
                "x-pan-token": signQuarkRequest(method, path, tm, this.config.signKey),
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        })
        const envelope = (await response.json()) as QuarkEnvelope<T>
        if (envelope.status === 0 && envelope.data !== undefined) {
            return envelope.data
        }
        if (isTokenExpiredErrno(envelope.errno) && !this.refreshed) {
            await this.rotateAccessToken()
            this.refreshed = true
            return this.requestRaw<T>(method, path, body, query)
        }
        throw new Error(
            `夸克接口失败 ${path}（errno=${envelope.errno}，req_id=${reqId}）：${envelope.error_info || envelope.agent_msg || "未知错误"}`
        )
    }

    /**
     * 用 refresh_token 轮换访问令牌，成功后同步回内存配置与进程环境。
     */
    async rotateAccessToken(): Promise<void> {
        if (!this.config.refreshToken) {
            throw new Error("夸克 refresh_token 缺失，无法刷新访问令牌（需重新走 OAuth 授权）")
        }
        const tm = String(Date.now())
        const path = "/agent/v1/oauth/access_token/rotate"
        const response = await this.fetchFn(`${QUARK_API_BASE}${path}?req_id=${randomUUID()}`, {
            method: "POST",
            headers: {
                "x-pan-client-id": this.config.clientId,
                "x-pan-tm": tm,
                "x-pan-token": signQuarkRequest("POST", path, tm, this.config.signKey),
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify({ refresh_token: this.config.refreshToken, device_id: this.config.deviceId }),
        })
        const envelope = (await response.json()) as QuarkEnvelope<{
            access_token: string
            refresh_token: string
            device_id: string
        }>
        if (envelope.status !== 0 || !envelope.data?.access_token) {
            throw new Error(`夸克令牌刷新失败（errno=${envelope.errno}）：${envelope.error_info || "未知错误"}`)
        }
        this.config.accessToken = envelope.data.access_token
        if (envelope.data.refresh_token) {
            this.config.refreshToken = envelope.data.refresh_token
            process.env.QUARK_REFRESH_TOKEN = envelope.data.refresh_token
        }
        if (envelope.data.device_id) {
            this.config.deviceId = envelope.data.device_id
            process.env.QUARK_DEVICE_ID = envelope.data.device_id
        }
        process.env.QUARK_ACCESS_TOKEN = envelope.data.access_token
    }

    /** 查询当前账号信息，用于启动时校验令牌有效性。 */
    async getUserInfo(): Promise<{ user_id: string; nickname: string }> {
        return this.request("GET", "/open/v1/user/info")
    }

    /**
     * 上传内存中的完整文件（秒传判定 → 补哈希 → 取分片地址 → 直传 → 完成确认）。
     * @param fileName 网盘内文件名
     * @param data 文件字节
     * @param pdirFid 目标目录 fid，默认 "0"（根目录）
     */
    async uploadBuffer(fileName: string, data: Uint8Array, pdirFid = "0"): Promise<QuarkUploadResult> {
        if (!data.length) {
            throw new Error("上传内容不能为空")
        }
        const size = data.length
        const sha1 = createHash("sha1").update(data).digest("hex")
        const md5 = createHash("md5").update(data).digest("hex")
        const now = Date.now()
        const ext = fileName.includes(".") ? (fileName.split(".").pop() ?? "") : ""

        // 预上传兼秒传判定：小文件命中则直接返回，大文件顺带拿服务端的真实 part_size。
        const pre = await this.request<QuarkUploadTask>("POST", "/open/v1/file/upload_pre", {
            file_name: fileName,
            size,
            sha1,
            md5,
            pdir_fid: pdirFid,
            format_type: ext,
            l_created_at: now,
            l_updated_at: now,
            same_path_file_reuse: true,
            parallel_upload: true,
            hash_update: false,
            device_id: this.config.deviceId,
            device_name: this.config.deviceName,
            part_info_list: [{ part_number: 1, part_size: size }],
        })
        if (pre.finish === 1 && pre.fid) {
            return { fid: pre.fid, fileName, size }
        }

        const partSize = pre.part_size && pre.part_size > 0 ? pre.part_size : size
        if (size > partSize) {
            // 大文件走标准多分片链路（预上传 hash_update → 补哈希 → 取地址带并行校验 → 直传 → 完成确认），
            // 缺补哈希或分片校验时取地址会被后端拒绝（get_upload_urls 报 43001 ccp error）。
            return this.uploadMultipart(fileName, data, pdirFid)
        }

        const partInfoList = [{ part_number: 1, part_size: size }]
        let uploadUrls = pre.upload_urls ?? []
        let commonHeaders = pre.common_headers ?? {}
        if (uploadUrls.length < partInfoList.length) {
            const urls = await this.request<{ upload_urls: QuarkUploadUrl[]; common_headers?: Record<string, string> }>(
                "POST",
                "/open/v1/file/get_upload_urls",
                {
                    task_id: pre.task_id,
                    part_info_list: partInfoList,
                }
            )
            uploadUrls = urls.upload_urls
            commonHeaders = urls.common_headers ?? commonHeaders
        }
        return this.putPartsAndFinish(pre.task_id, data, size, partInfoList, uploadUrls, commonHeaders, fileName)
    }

    /**
     * 大文件多分片上传：开新任务走 hash_update 预上传 → update/hash 补哈希（可再次秒传）→
     * 分批取地址（第 2 片起携带此前字节的 SHA1 链接值）→ 分片直传 → 完成确认。
     * @param fileName 网盘内文件名
     * @param data 文件字节
     * @param pdirFid 目标目录 fid
     */
    private async uploadMultipart(fileName: string, data: Uint8Array, pdirFid: string): Promise<QuarkUploadResult> {
        const size = data.length
        const now = Date.now()
        const ext = fileName.includes(".") ? (fileName.split(".").pop() ?? "") : ""
        const pre = await this.request<QuarkUploadTask>("POST", "/open/v1/file/upload_pre", {
            file_name: fileName,
            size,
            sha1: "",
            pdir_fid: pdirFid,
            format_type: ext,
            l_created_at: now,
            l_updated_at: now,
            same_path_file_reuse: true,
            parallel_upload: true,
            hash_update: true,
            device_id: this.config.deviceId,
            device_name: this.config.deviceName,
        })
        if (pre.finish === 1 && pre.fid) {
            return { fid: pre.fid, fileName, size }
        }
        const partSize = pre.part_size && pre.part_size > 0 ? pre.part_size : 4 * 1024 * 1024
        if (partSize % 64 !== 0) {
            throw new Error(`夸克分片大小异常（part_size=${partSize} 非 64 字节对齐，无法计算分片校验）`)
        }
        const partCount = Math.max(1, Math.ceil(size / partSize))

        // 单遍哈希：全量 sha1/md5 + 每个分片起始处的 SHA1 链接值（分片边界必为 64 字节对齐）。
        const sha = new Sha1()
        const md5 = createHash("md5")
        const states = new Map<number, [number, number, number, number, number]>()
        for (let partNumber = 1; partNumber <= partCount; partNumber++) {
            const start = (partNumber - 1) * partSize
            const end = Math.min(start + partSize, size)
            if (partNumber > 1) {
                states.set(partNumber, sha.snapshot())
            }
            const chunk = data.slice(start, end)
            sha.update(chunk)
            md5.update(chunk)
        }
        const reported = await this.request<QuarkUploadTask>("POST", "/open/v1/file/update/hash", {
            task_id: pre.task_id,
            sha1: sha.digest(),
            md5: md5.digest("hex"),
        })
        if (reported.finish === 1 && reported.fid) {
            return { fid: reported.fid, fileName, size }
        }

        const partInfoList = Array.from({ length: partCount }, (_, index) => {
            const partNumber = index + 1
            const start = index * partSize
            return {
                part_number: partNumber,
                part_size: Math.min(partSize, size - start),
                ...(partNumber > 1 ? { parallel_sha1_ctx: { part_offset: start, h: states.get(partNumber)! } } : {}),
            }
        })
        const uploadUrls: QuarkUploadUrl[] = []
        let commonHeaders = pre.common_headers ?? {}
        for (let batch = 0; batch < partInfoList.length; batch += 100) {
            const urls = await this.request<{ upload_urls: QuarkUploadUrl[]; common_headers?: Record<string, string> }>(
                "POST",
                "/open/v1/file/get_upload_urls",
                {
                    task_id: pre.task_id,
                    part_info_list: partInfoList.slice(batch, batch + 100),
                }
            )
            uploadUrls.push(...urls.upload_urls)
            commonHeaders = urls.common_headers ?? commonHeaders
        }
        return this.putPartsAndFinish(pre.task_id, data, partSize, partInfoList, uploadUrls, commonHeaders, fileName)
    }

    /**
     * 分片直传并完成确认：按分片逐片 PUT（公共头 + 地址签名），收集 ETag 后调 upload_finish。
     * @param taskId 上传任务 id
     * @param data 文件字节
     * @param partSize 均匀分片大小（用于定位每片偏移，末片以 part_size 为准）
     * @param partInfoList 分片划分
     * @param uploadUrls 分片上传地址
     * @param commonHeaders 直传公共头
     * @param fileName 网盘内文件名（仅用于回执）
     */
    private async putPartsAndFinish(
        taskId: string,
        data: Uint8Array,
        partSize: number,
        partInfoList: Array<{ part_number: number; part_size: number }>,
        uploadUrls: QuarkUploadUrl[],
        commonHeaders: Record<string, string>,
        fileName: string
    ): Promise<QuarkUploadResult> {
        const size = data.length
        if (uploadUrls.length < partInfoList.length) {
            throw new Error(`夸克分片地址不足（需要 ${partInfoList.length} 片，拿到 ${uploadUrls.length} 片，task_id=${taskId}）`)
        }

        const etags: { part_number: number; etag: string }[] = []
        for (const item of partInfoList) {
            const target = uploadUrls.find(entry => entry.part_number === item.part_number)
            if (!target) {
                throw new Error(`缺失第 ${item.part_number} 片的上传地址`)
            }
            const offset = (item.part_number - 1) * partSize
            const slice = data.slice(offset, offset + item.part_size)
            const putResponse = await this.fetchFn(target.upload_url, {
                method: "PUT",
                headers: { ...commonHeaders, Authorization: target.signature_info.signature },
                body: slice as BodyInit,
            })
            if (!putResponse.ok) {
                throw new Error(`第 ${item.part_number} 片上传失败（HTTP ${putResponse.status}）`)
            }
            // ETag 必须原样回传（含两侧引号，官方 SDK 同样不做剥离）
            const etag = (putResponse.headers.get("ETag") ?? "").trim()
            if (!etag) {
                throw new Error(`第 ${item.part_number} 片上传无 ETag 回执`)
            }
            etags.push({ part_number: item.part_number, etag })
        }

        const finish = await this.request<QuarkUploadTask>("POST", "/open/v1/file/upload_finish", {
            task_id: taskId,
            part_info_list: etags,
        })
        if (!finish.fid) {
            throw new Error("夸克上传完成确认未返回文件 fid")
        }
        return { fid: finish.fid, fileName, size }
    }

    /**
     * 创建分享链接（默认永久公开，他人凭链接下载解锁密码压缩包）。
     * @param fidList 待分享的文件 fid 列表
     * @param title 分享标题
     */
    async createShare(fidList: string[], title: string): Promise<QuarkShareResult> {
        return this.request<QuarkShareResult>("POST", "/agent/v1/share/create", {
            fid_list: fidList,
            title,
            url_type: 1,
            expired_type: 1,
        })
    }

    /** 获取单个文件的下载直链（管理端自检用，下载需带 Cookie，此处只取地址）。 */
    async getDownloadUrl(fid: string): Promise<{ download_url: string; file_name: string; size: number }> {
        return this.request("POST", "/open/v1/file/get_download_url", { fid })
    }

    /**
     * 创建文件夹（嵌套路径自动创建，同名重复创建幂等返回已有目录）。
     * @param dirPath 文件夹名称或路径，如 "dna-builder/safe-mode"
     * @param pdirFid 父目录 fid，默认 "0"（根目录）
     * @returns 目录 fid 与完整路径
     */
    async createDir(dirPath: string, pdirFid = "0"): Promise<{ fid: string; full_path: string }> {
        return this.request("POST", "/open/v1/dir", { dir_path: dirPath, pdir_fid: pdirFid })
    }

    /**
     * 取分享详情首屏（顺带拿到分享令牌 stoken 与文件列表）。
     * @param pwdId 分享链接 s/ 后的 id
     * @param passcode 私密链接提取码，公开链接省略
     */
    async getShareDetail(
        pwdId: string,
        passcode?: string
    ): Promise<{ token_info: { title: string; stoken: string }; list: QuarkShareFileItem[] }> {
        return this.request("POST", "/open/v1/share/detail", {
            pwd_id: pwdId,
            ...(passcode ? { passcode } : {}),
            page: 1,
            size: 200,
            force: 0,
        })
    }

    /**
     * 取文件详情（fetch_full_path=1 时带完整路径，用于确认既有文件的位置）。
     * @param fid 文件 fid
     */
    async getFileInfo(fid: string): Promise<{ fid: string; filename: string; full_path: unknown; pdir_fid: string }> {
        return this.request("GET", "/open/v1/file/info", undefined, { fid, fetch_full_path: "1" })
    }

    /**
     * 移动文件到目标目录（同步移动）。
     * @param fidList 文件 fid 列表（≤100）
     * @param toPdirFid 目标目录 fid
     * @returns finish=1 即完成，否则用 task_id 轮询任务
     */
    async moveFiles(fidList: string[], toPdirFid: string): Promise<{ finish: number; task_id: string }> {
        return this.request("POST", "/open/v1/file/move", { fid_list: fidList, to_pdir_fid: toPdirFid, action_type: 1 })
    }

    /**
     * 查询异步任务状态：0 待处理 1 处理中 2 完成 3 失败 4 暂停。
     * @param taskId 任务 id
     */
    async queryTaskStatus(taskId: string): Promise<number> {
        const data = await this.request<{ status: number }>("POST", "/open/v1/task/query", { task_id: taskId })
        return data.status
    }

    /**
     * 移动文件并等待异步任务终态（finish=1 直接返回，否则轮询）。
     * @param fidList 文件 fid 列表
     * @param toPdirFid 目标目录 fid
     * @param timeoutMs 轮询超时（毫秒），默认 60 秒
     */
    async moveFilesAndWait(fidList: string[], toPdirFid: string, timeoutMs = 60_000): Promise<void> {
        const { finish, task_id } = await this.moveFiles(fidList, toPdirFid)
        if (finish === 1) {
            return
        }
        const startedAt = Date.now()
        for (;;) {
            await new Promise(resolve => setTimeout(resolve, 2000))
            const status = await this.queryTaskStatus(task_id)
            if (status === 2) {
                return
            }
            if (status === 3 || status === 4) {
                throw new Error(`夸克移动文件任务失败（status=${status}，task_id=${task_id}）`)
            }
            if (Date.now() - startedAt > timeoutMs) {
                throw new Error(`夸克移动文件任务超时（task_id=${task_id}）`)
            }
        }
    }

    /**
     * 删除文件（移入回收站）。实测 open 接口要求 `action_type: 1`，缺失报 14001 actionType is null。
     * @param fidList 文件 fid 列表（≤100，32-hex 与 open `xxx|stable` 形态均可）
     * @returns finish=1 即完成，否则用 task_id 轮询任务
     */
    async deleteFiles(fidList: string[]): Promise<{ finish: number; task_id: string }> {
        return this.request("POST", "/open/v1/file/delete", { fid_list: fidList, action_type: 1 })
    }

    /**
     * 删除文件并等待异步任务终态（finish=1 直接返回，否则轮询）。
     * @param fidList 文件 fid 列表
     * @param timeoutMs 轮询超时（毫秒），默认 60 秒
     */
    async deleteFilesAndWait(fidList: string[], timeoutMs = 60_000): Promise<void> {
        const { finish, task_id } = await this.deleteFiles(fidList)
        if (finish === 1) {
            return
        }
        const startedAt = Date.now()
        for (;;) {
            await new Promise(resolve => setTimeout(resolve, 2000))
            const status = await this.queryTaskStatus(task_id)
            if (status === 2) {
                return
            }
            if (status === 3 || status === 4) {
                throw new Error(`夸克删除文件任务失败（status=${status}，task_id=${task_id}）`)
            }
            if (Date.now() - startedAt > timeoutMs) {
                throw new Error(`夸克删除文件任务超时（task_id=${task_id}）`)
            }
        }
    }

    /**
     * 按关键词搜索网盘文件（混合语义搜索，调用方按文件名精确过滤）。
     * @param keyword 关键词（≤50 字符，如完整文件名）
     * @param size 返回条数，默认 10
     */
    async searchFiles(
        keyword: string,
        size = 10
    ): Promise<Array<{ fid: string; filename: string; parent_fid: string; file_type: number; size: number; full_path?: unknown }>> {
        const data = await this.request<{
            file_list: Array<{
                fid: string
                filename: string
                parent_fid: string
                file_type: number | string
                size: number
                full_path?: unknown
            }>
        }>("POST", "/agent/v1/file/search", { search_type: "mix", keyword, size })
        return (data.file_list ?? []).map(item => ({ ...item, file_type: Number(item.file_type) }))
    }

    /**
     * 下载文件字节（小文件直接进内存；下载直链必须带 Cookie 鉴权）。
     * @param fid 文件 fid
     */
    async downloadFile(fid: string): Promise<Uint8Array> {
        const { download_url } = await this.getDownloadUrl(fid)
        const response = await this.fetchFn(download_url, {
            headers: {
                Cookie: `x_pan_client_id=${this.config.clientId}; x_pan_access_token=${this.config.accessToken}`,
            },
        })
        if (!response.ok) {
            throw new Error(`夸克文件下载失败（HTTP ${response.status}）`)
        }
        return new Uint8Array(await response.arrayBuffer())
    }
}
