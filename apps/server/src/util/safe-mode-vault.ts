import { createHash, randomBytes } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { compare, hash } from "bcrypt"
import { isQuarkConfigured, QuarkClient, resolveDirFid } from "./quark"

/** 解锁密码压缩包的默认文件名（同名覆盖，固定分享链接长期有效）。 */
export const DEFAULT_VAULT_FILE_NAME = "密码.zip"
/** 压缩包内的密码文件名。 */
export const VAULT_PASSWORD_ENTRY = "safe-mode-password.txt"
/** 解锁密码长度（不含分组短横线）。 */
export const VAULT_PASSWORD_LENGTH = 16

/** 解锁密码压缩包的上传目标（目录 + 文件名，全部可在环境变量配置）。 */
export interface VaultTarget {
    /** 目标目录 fid（"0" 为根目录） */
    dirFid: string
    /** 网盘内文件名 */
    fileName: string
}

/**
 * 读取上传目标配置。
 * @param env 环境变量（默认进程环境）
 * @returns 目录配置原文与文件名
 */
export function readVaultTargetConfig(env: NodeJS.ProcessEnv = process.env): { dir: string; fileName: string } {
    return {
        dir: (env.SAFE_MODE_PASSWORD_DIR || "").trim(),
        fileName: (env.SAFE_MODE_PASSWORD_FILE || "").trim() || DEFAULT_VAULT_FILE_NAME,
    }
}

/**
 * 把目录配置解析为 fid（薄封装，逻辑在 quark.ts 的 resolveDirFid，保留此名兼容已有调用）。
 * @param client 夸克客户端
 * @param dir 目录配置原文
 * @returns 目标目录 fid
 */
export async function resolveVaultDirFid(client: QuarkClient, dir: string): Promise<string> {
    return resolveDirFid(client, dir)
}

/** 解锁密码状态落盘路径（server/data，与 data.db 同级目录，不走数据库迁移）。 */
export const VAULT_STATE_PATH = resolve(import.meta.dir, "../../data/safe-mode-vault.json")

/** 对外暴露的解锁密码状态（不含任何密码明文与哈希）。 */
export interface VaultStatus {
    fileName: string
    fid: string
    size: number
    sha256: string
    uploadedAt: number
    /** 上次一致性校验时间（毫秒，未校验过时缺失） */
    lastCheckedAt?: number
    /** 上次一致性校验是否通过 */
    consistent?: boolean
}

/** 落盘的完整状态（含密码 bcrypt 哈希，用于服务端校验）。 */
interface VaultState extends VaultStatus {
    passwordHash: string
    /** 上次一致性校验时间（毫秒，未校验过时缺失） */
    lastCheckedAt?: number
    /** 上次一致性校验是否通过 */
    consistent?: boolean
}

/** 解锁密码字符集（剔除 0/O/1/l，避免抄写混淆）。 */
const PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

/**
 * 生成可抄写的分组解锁密码，如 `K7QW-9M2X-6TFA-8HBD`（80 bit 熵）。
 */
export function generateVaultPassword(length: number = VAULT_PASSWORD_LENGTH): string {
    const bytes = randomBytes(length)
    const chars = Array.from(bytes, byte => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length])
    const groups: string[] = []
    for (let index = 0; index < chars.length; index += 4) {
        groups.push(chars.slice(index, index + 4).join(""))
    }
    return groups.join("-")
}

/** CRC32 表（stored 压缩包头需要，zip 不做压缩时仍要校验值）。 */
const CRC_TABLE = (() => {
    const table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
        let c = n
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        }
        table[n] = c
    }
    return table
})()

/** 计算字节序列的 CRC32（无符号）。 */
export function crc32(data: Uint8Array): number {
    let crc = 0xffffffff
    for (const byte of data) {
        crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
    }
    return (crc ^ 0xffffffff) >>> 0
}

const textEncoder = new TextEncoder()

/** 写小端 16 位整数。 */
function writeU16(view: DataView, offset: number, value: number): void {
    view.setUint16(offset, value, true)
}

/** 写小端 32 位整数。 */
function writeU32(view: DataView, offset: number, value: number): void {
    view.setUint32(offset, value, true)
}

/**
 * 把当前时间编码为 DOS 日期时间（zip 头用）。
 * @param date 时间
 * @returns DOS 时间与日期
 */
function dosDateTime(date: Date): { time: number; date: number } {
    const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f)
    const dosDate = (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f)
    return { time, date: dosDate }
}

export interface ZipEntry {
    name: string
    data: Uint8Array
}

/**
 * 生成 stored（不压缩）zip：零依赖，Windows 资源管理器 / macOS 归档工具均可直接打开。
 * 密码压缩包只有几百字节，压缩收益为零，用 stored 还能避免引入压缩库。
 * @param entries 文件条目
 */
export function createStoredZip(entries: ZipEntry[]): Uint8Array {
    const encoded = entries.map(entry => ({ name: textEncoder.encode(entry.name), data: entry.data }))
    const { time, date } = dosDateTime(new Date())

    let total = 0
    for (const entry of encoded) {
        total += 30 + entry.name.length + entry.data.length + 46 + entry.name.length
    }
    total += 22

    const buffer = new Uint8Array(total)
    const view = new DataView(buffer.buffer)
    let offset = 0
    const centralOffsets: number[] = []

    for (const entry of encoded) {
        centralOffsets.push(offset)
        const crc = crc32(entry.data)
        writeU32(view, offset, 0x04034b50)
        writeU16(view, offset + 4, 20)
        writeU16(view, offset + 6, 0x0800)
        writeU16(view, offset + 8, 0)
        writeU16(view, offset + 10, time)
        writeU16(view, offset + 12, date)
        writeU32(view, offset + 14, crc)
        writeU32(view, offset + 18, entry.data.length)
        writeU32(view, offset + 22, entry.data.length)
        writeU16(view, offset + 26, entry.name.length)
        writeU16(view, offset + 28, 0)
        offset += 30
        buffer.set(entry.name, offset)
        offset += entry.name.length
        buffer.set(entry.data, offset)
        offset += entry.data.length
    }

    const centralStart = offset
    encoded.forEach((entry, index) => {
        const crc = crc32(entry.data)
        writeU32(view, offset, 0x02014b50)
        writeU16(view, offset + 4, 20)
        writeU16(view, offset + 6, 20)
        writeU16(view, offset + 8, 0x0800)
        writeU16(view, offset + 10, 0)
        writeU16(view, offset + 12, time)
        writeU16(view, offset + 14, date)
        writeU32(view, offset + 16, crc)
        writeU32(view, offset + 20, entry.data.length)
        writeU32(view, offset + 24, entry.data.length)
        writeU16(view, offset + 28, entry.name.length)
        writeU16(view, offset + 30, 0)
        writeU16(view, offset + 32, 0)
        writeU16(view, offset + 34, 0)
        writeU16(view, offset + 36, 0)
        writeU32(view, offset + 38, 0)
        writeU32(view, offset + 42, centralOffsets[index])
        offset += 46
        buffer.set(entry.name, offset)
        offset += entry.name.length
    })

    const centralSize = offset - centralStart
    writeU32(view, offset, 0x06054b50)
    writeU16(view, offset + 4, 0)
    writeU16(view, offset + 6, 0)
    writeU16(view, offset + 8, encoded.length)
    writeU16(view, offset + 10, encoded.length)
    writeU32(view, offset + 12, centralSize)
    writeU32(view, offset + 16, centralStart)
    writeU16(view, offset + 20, 0)

    return buffer
}

/**
 * 组装解锁密码压缩包：单个 txt 写明密码与生成时间，解压即得。
 * @param password 本次轮换的解锁密码
 * @param uploadedAt 生成时间（毫秒）
 */
export function buildVaultZip(password: string, uploadedAt: number): Uint8Array {
    const body = [
        "DNA Builder 安全模式解锁密码",
        "================================",
        `password=${password}`,
        `generated_at=${new Date(uploadedAt).toISOString()}`,
        "",
        "在「设置 → 安全模式」弹窗下方输入该密码（连同答题一起通过）即可关闭安全模式。",
        "请妥善保管，不要转发给他人。",
        "",
    ].join("\n")
    return createStoredZip([{ name: VAULT_PASSWORD_ENTRY, data: textEncoder.encode(body) }])
}

/** 读取落盘状态，无状态时返回 null。 */
export async function readVaultState(statePath: string = VAULT_STATE_PATH): Promise<VaultState | null> {
    try {
        const raw = await readFile(statePath, "utf-8")
        const state = JSON.parse(raw) as VaultState
        if (!state.passwordHash || !state.fid) {
            return null
        }
        return state
    } catch {
        return null
    }
}

/** 对外状态（剥离密码哈希）。 */
export function toVaultStatus(state: VaultState): VaultStatus {
    const { passwordHash: _omitted, ...status } = state
    void _omitted
    return status
}

/**
 * 校验用户提交的解锁密码（bcrypt 比对，只返回对错）。
 * @param password 用户输入
 * @param statePath 状态文件路径
 */
export async function verifyVaultPassword(password: string, statePath: string = VAULT_STATE_PATH): Promise<boolean> {
    const state = await readVaultState(statePath)
    if (!state || !password) {
        return false
    }
    return compare(password.trim(), state.passwordHash)
}

/**
 * 解析本次上传目标（目录配置 → fid，文件名取配置或默认值）。
 * @param client 夸克客户端
 * @param env 环境变量（默认进程环境）
 */
export async function resolveVaultTarget(client: QuarkClient, env: NodeJS.ProcessEnv = process.env): Promise<VaultTarget> {
    const config = readVaultTargetConfig(env)
    return { dirFid: await resolveVaultDirFid(client, config.dir), fileName: config.fileName }
}

/**
 * 判定网盘文件名是否为上传目标的同名旧件（含夸克自动改名的 `stem(N).ext` 副本）。
 * @param fileName 网盘实际文件名
 * @param targetFileName 本次上传目标文件名
 */
export function isVaultDuplicateName(fileName: string, targetFileName: string): boolean {
    if (fileName === targetFileName) {
        return true
    }
    const dot = targetFileName.lastIndexOf(".")
    const stem = dot < 0 ? targetFileName : targetFileName.slice(0, dot)
    const ext = dot < 0 ? "" : targetFileName.slice(dot)
    if (!fileName.startsWith(`${stem}(`) || !fileName.endsWith(`)${ext}`)) {
        return false
    }
    const serial = fileName.slice(stem.length + 1, fileName.length - ext.length - 1)
    return serial.length > 0 && /^\d+$/.test(serial)
}

/**
 * 判定网盘文件是否落在上传目标目录内（根目录 fid "0" 严格匹配 parent "0"，不再沿用“根目录匹配全盘”的宽松口径）。
 * @param parentFid 文件的父目录 fid
 * @param dirFid 目标目录 fid
 */
export function isInVaultDir(parentFid: unknown, dirFid: string): boolean {
    const parent = String(parentFid ?? "")
    if (dirFid === "0") {
        return parent === "0" || parent === ""
    }
    return parent === dirFid
}

/**
 * 取 fid 的稳定身份键：open 命名空间的 fid 形如 `xxx|stable`（`|` 前为单次请求令牌，
 * 每次接口返回都不同），只取 `|` 后段；32-hex 等传统 fid 原样小写比对。
 * 2026-10 实测：同一文件的 search / getFileInfo / delete 返回 fid 前段各不相同、后段一致。
 * @param fid 网盘 fid（任意命名空间）
 */
export function fidIdentityKey(fid: unknown): string {
    const raw = String(fid ?? "")
    const bar = raw.lastIndexOf("|")
    return (bar >= 0 ? raw.slice(bar + 1) : raw).trim().toLowerCase()
}

/** 上传目标目录的跨命名空间身份：32-hex 与 open 两套 fid 体系并存，必须同时携带才能命中。 */
export interface VaultDirIdentity {
    dirFid: string
    dirName: string
    openKey: string
}

/** 参与目录归属判定的网盘文件最小形状。 */
export interface VaultDirFileItem {
    parent_fid: unknown
    full_path?: unknown
}

/**
 * 解析目标目录的跨命名空间身份：目录名经 getFileInfo 读取，open 后缀键经按名搜索目录条目拿取。
 * 任一步失败都降级（空字符串），不中断轮换，调用方按“能命中的信号”逐级判定。
 * @param client 夸克客户端
 * @param dirFid 目标目录 fid（32-hex / open / "0" 均可）
 */
export async function resolveVaultDirIdentity(client: QuarkClient, dirFid: string): Promise<VaultDirIdentity> {
    if (!dirFid || dirFid === "0") {
        return { dirFid: "0", dirName: "", openKey: "" }
    }
    let dirName = ""
    try {
        dirName = (await client.getFileInfo(dirFid)).filename ?? ""
    } catch {
        dirName = ""
    }
    let openKey = ""
    if (dirFid.includes("|")) {
        openKey = fidIdentityKey(dirFid)
    } else if (dirName !== "") {
        try {
            const hits = await client.searchFiles(dirName, 20)
            const dir = hits.find(item => Number(item.file_type) === 0 && item.filename === dirName)
            if (dir) {
                openKey = fidIdentityKey(dir.fid)
            }
        } catch {
            // 目录解析失败时降级为目录名兜底，不中断轮换
        }
    }
    return { dirFid, dirName, openKey }
}

/**
 * 判定网盘文件是否落在上传目标目录内（跨命名空间版，替代裸 `parent === dirFid` 比对）。
 * 命中顺序：同命名空间原文相等 → open 后缀键相等 → 根目录宽容（parent "0"/空或无路径）→
 * full_path 文本含目录名。任一命中即视为同目录，避免误删其他目录的同名文件。
 * @param item 网盘文件条目（需 parent_fid，full_path 有则更准）
 * @param identity 目标目录身份
 */
export function isVaultFileInDir(item: VaultDirFileItem, identity: VaultDirIdentity): boolean {
    const parent = String(item.parent_fid ?? "")
    if (parent !== "" && parent === identity.dirFid) {
        return true
    }
    if (identity.openKey !== "" && fidIdentityKey(parent) === identity.openKey) {
        return true
    }
    if (identity.dirFid === "0") {
        if (parent === "" || parent === "0") {
            return true
        }
        try {
            const fullPath = item.full_path as Array<unknown> | undefined
            if (Array.isArray(fullPath) && fullPath.length === 0) {
                return true
            }
        } catch {
            // 忽略，下面返回 false
        }
        return false
    }
    if (identity.dirName !== "") {
        try {
            if (JSON.stringify(item.full_path ?? "").includes(identity.dirName)) {
                return true
            }
        } catch {
            // 忽略，下面返回 false
        }
    }
    return false
}

/** 去掉扩展名取搜索词干（`密码.zip` → `密码`），用于兜底搜出 `(N)` 改名副本。 */
function vaultSearchStem(fileName: string): string {
    const dot = fileName.lastIndexOf(".")
    return (dot <= 0 ? fileName : fileName.slice(0, dot)).trim() || fileName
}

export type VaultDupeFile = Awaited<ReturnType<QuarkClient["searchFiles"]>>[number]

/**
 * 搜集目标目录内的全部同名旧件：精确同名 + `密码(1).zip` 类自动改名副本。
 * 用文件名与词干各搜一次取并集（按稳定身份键去重），再经目录身份过滤，
 * 避免“搜不到改名副本删不掉 → 上传又被改名”的滚雪球。
 * 搜索失败只记日志不抛错（兜底仍走覆盖上传，由上传后校验托底）。
 * @param client 夸克客户端
 * @param target 上传目标（目录 fid + 文件名）
 * @param identity 目标目录身份
 */
export async function collectVaultDupeFiles(
    client: QuarkClient,
    target: VaultTarget,
    identity: VaultDirIdentity
): Promise<VaultDupeFile[]> {
    const seen = new Map<string, VaultDupeFile>()
    const keywords = [...new Set([target.fileName, vaultSearchStem(target.fileName)])]
    for (const keyword of keywords) {
        let hits: VaultDupeFile[]
        try {
            hits = await client.searchFiles(keyword, 100)
        } catch (error) {
            console.warn(`[safe-mode-vault] 搜索旧文件失败（跳过关键词${keyword}）：`, error instanceof Error ? error.message : error)
            continue
        }
        for (const item of hits) {
            if (!isVaultDuplicateName(item.filename, target.fileName)) {
                continue
            }
            if (!isVaultFileInDir(item, identity)) {
                continue
            }
            const key = fidIdentityKey(item.fid)
            if (!seen.has(key)) {
                seen.set(key, item)
            }
        }
    }
    return [...seen.values()]
}

/**
 * 等待删除在网盘侧实际生效：删完即传仍可能因旧名未释放被改名，轮询确认后再传。
 * getFileInfo 取不到即视为已删；超时返回 false（不抛错，由上传后校验托底）。
 * @param client 夸克客户端
 * @param fids 待确认的 fid 列表
 * @param timeoutMs 轮询超时（毫秒），默认 20 秒
 */
async function waitUntilVaultFilesGone(client: QuarkClient, fids: string[], timeoutMs = 20_000): Promise<boolean> {
    const startedAt = Date.now()
    for (;;) {
        let remaining = 0
        for (const fid of fids) {
            try {
                await client.getFileInfo(fid)
                remaining++
            } catch {
                // 取不到即视为已删（21001）或请求失败；后者由上传后校验托底
            }
        }
        if (remaining === 0) {
            return true
        }
        if (Date.now() - startedAt > timeoutMs) {
            return false
        }
        await new Promise(resolve => setTimeout(resolve, 2000))
    }
}

/**
 * 删除目标目录下的同名旧文件（含 `密码(1).zip` 类自动改名副本），避免上传时网盘自动改名。
 * 跨命名空间匹配（见 resolveVaultDirIdentity），删后轮询确认旧名释放再由调用方上传。
 * 搜索失败只记日志不中断（兜底仍走同名覆盖上传）；删除失败则抛错阻止上传，
 * 防止新旧并存导致一致性校验命中旧包。
 * @param client 夸克客户端
 * @param target 上传目标（目录 fid + 文件名）
 */
export async function removeExistingVaultFile(client: QuarkClient, target: VaultTarget): Promise<void> {
    const identity = await resolveVaultDirIdentity(client, target.dirFid)
    const dupes = await collectVaultDupeFiles(client, target, identity)
    if (dupes.length === 0) {
        return
    }
    const fids = [...new Set(dupes.map(item => item.fid))]
    await client.deleteFilesAndWait(fids)
    await waitUntilVaultFilesGone(client, fids)
}

/** 轮换串行锁：cron / 启动自检 / 手动三入口并发会产生 `(N)` 副本，必须串行。 */
let vaultRotateQueue: Promise<void> = Promise.resolve()

/** 把任务排进轮换串行队列，前一个轮换完成（无论成败）后才执行。 */
function withVaultRotateLock<T>(task: () => Promise<T>): Promise<T> {
    const previous = vaultRotateQueue
    let release!: () => void
    vaultRotateQueue = new Promise<void>(resolve => {
        release = resolve
    })
    return (async () => {
        await previous
        try {
            return await task()
        } finally {
            release()
        }
    })()
}

/**
 * 轮换解锁密码并上传到夸克网盘：生成新密码 → 打包 zip → 上传到配置目录 →
 * 只存 bcrypt 哈希与文件信息落盘（明文密码仅此次返回）。
 * 先删同名旧文件再上传（网盘同名不会自动覆盖，会改名为 `密码(1).zip`），
 * 文件落在固定分享覆盖的目录里，无需另建分享。
 * @param client 夸克客户端（缺省按环境变量创建）
 * @param statePath 状态文件路径
 */
export async function rotateVault(
    client: QuarkClient = new QuarkClient(),
    statePath: string = VAULT_STATE_PATH
): Promise<{ password: string; status: VaultStatus }> {
    return withVaultRotateLock(async () => {
        const password = generateVaultPassword()
        const uploadedAt = Date.now()
        const zip = buildVaultZip(password, uploadedAt)
        const sha256 = createHash("sha256").update(zip).digest("hex")
        const target = await resolveVaultTarget(client)
        const identity = await resolveVaultDirIdentity(client, target.dirFid)

        const persist = async (uploaded: { fid: string; size: number }): Promise<{ password: string; status: VaultStatus }> => {
            const state: VaultState = {
                passwordHash: await hash(password, 10),
                fileName: target.fileName,
                fid: uploaded.fid,
                size: zip.length,
                sha256,
                uploadedAt,
            }
            await mkdir(dirname(statePath), { recursive: true })
            await writeFile(statePath, JSON.stringify(state, null, 2), "utf-8")
            return { password, status: toVaultStatus(state) }
        }

        let lastUpload: { fid: string; size: number } | null = null
        for (let attempt = 1; attempt <= 3; attempt++) {
            // 先删目标目录内的全部同名旧件（精确同名 + `(N)` 改名副本），删后确认旧名释放再传，
            // 否则网盘会静默改名（如 `密码(1).zip`），分享目录越堆越多。
            const dupes = await collectVaultDupeFiles(client, target, identity)
            if (dupes.length > 0) {
                const fids = [...new Set(dupes.map(item => item.fid))]
                try {
                    await client.deleteFilesAndWait(fids)
                    await waitUntilVaultFilesGone(client, fids)
                } catch (error) {
                    console.warn(
                        `[safe-mode-vault] 删除旧件失败（第 ${attempt} 次，仍尝试上传）：`,
                        error instanceof Error ? error.message : error
                    )
                }
            }
            const uploaded = await client.uploadBuffer(target.fileName, zip, target.dirFid)
            lastUpload = uploaded
            // 上传后确认网盘实际文件名：若同名旧件没清干净，夸克会静默改名为 `密码(N).zip`。
            // 命中则删掉本次刚传的改名件后重试；落盘 fid 永远指向新包，不会被旧包带偏。
            let actual = target.fileName
            if (typeof client.getFileInfo === "function") {
                try {
                    actual = (await client.getFileInfo(uploaded.fid)).filename
                } catch (error) {
                    console.warn("[safe-mode-vault] 上传后校验文件名失败：", error instanceof Error ? error.message : error)
                }
            }
            if (actual === target.fileName) {
                return persist(uploaded)
            }
            console.warn(`[safe-mode-vault] 网盘实际文件名与预期不一致（${actual}，第 ${attempt} 次），疑似残留同名旧件`)
            if (attempt < 3) {
                try {
                    await client.deleteFilesAndWait([uploaded.fid])
                    await waitUntilVaultFilesGone(client, [uploaded.fid])
                } catch {
                    // 下一轮删旧件时会一并处理
                }
            }
        }
        // 三次仍被改名：保留最后一次的包并强告警（fid 仍指向新包，一致性校验以密码哈希为准，
        // 不受旧包干扰；历史残留的异目录旧包需手动清理一次）。
        console.error(`[safe-mode-vault] 上传 3 次均被改名，请手动清理目标目录内的 ${target.fileName} 同名旧件`)
        return persist(lastUpload as { fid: string; size: number })
    })
}

/**
 * 从 stored-zip 首个本地文件头解出指定条目（含 CRC 校验；仅支持 method 0）。
 * @param zip 压缩包字节
 * @param name 期望的条目名
 */
export function extractStoredZipEntry(zip: Uint8Array, name: string): Uint8Array {
    if (zip.length < 30) {
        throw new Error("压缩包过小")
    }
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
    if (view.getUint32(0, true) !== 0x04034b50) {
        throw new Error("非 zip 本地文件头")
    }
    const method = view.getUint16(8, true)
    if (method !== 0) {
        throw new Error(`不支持的压缩方法 ${method}`)
    }
    const crc = view.getUint32(14, true)
    const size = view.getUint32(18, true)
    const nameLength = view.getUint16(26, true)
    const extraLength = view.getUint16(28, true)
    const entryName = new TextDecoder().decode(zip.slice(30, 30 + nameLength))
    if (entryName !== name) {
        throw new Error(`包内文件不匹配：${entryName}`)
    }
    const start = 30 + nameLength + extraLength
    const data = zip.slice(start, start + size)
    if (data.length !== size || crc32(data) !== crc) {
        throw new Error("包内容校验失败")
    }
    return data
}

/**
 * 从密码 txt 文本中解析 `password=` 行。
 * @param body txt 字节
 */
export function parseVaultPasswordText(body: Uint8Array): string {
    const line = new TextDecoder()
        .decode(body)
        .split("\n")
        .find(item => item.startsWith("password="))
    const password = (line ?? "").slice("password=".length).trim()
    if (!password) {
        throw new Error("包内缺少 password 行")
    }
    return password
}

/** 一致性校验结论。 */
export type VaultCheckReason = "ok" | "no-local-state" | "missing-remote" | "bad-zip" | "password-mismatch" | "content-drift"

/** 一致性校验结果。 */
export interface VaultCheckResult {
    ok: boolean
    reason: VaultCheckReason
    checkedAt: number
}

/** 写回落盘状态（保留密码哈希，仅更新校验结论；兜底命中时可附带 patch 修正 fid/sha 等指向）。 */
async function writeVaultCheckResult(
    statePath: string,
    state: VaultState,
    result: VaultCheckResult,
    patch?: Partial<VaultState>
): Promise<VaultCheckResult> {
    await mkdir(dirname(statePath), { recursive: true })
    await writeFile(
        statePath,
        JSON.stringify({ ...state, ...patch, lastCheckedAt: result.checkedAt, consistent: result.ok }, null, 2),
        "utf-8"
    )
    return result
}

/**
 * 一致性校验：优先按落盘 fid 直下本次轮换的密码包，解密比对本地哈希。
 * 全盘全文搜索只做兜底（fid 文件被删/被移走时），且兜底会逐个下载同名候选、
 * 以“密码对得上”而非“搜索排第一”判定，避免命中历史旧包导致每次启动误轮换。
 * 网络/API 异常直接抛错（调用方视为“未知”，不触发自动修复）；
 * 包缺失/解包失败/密码对不上则返回明确结论（调用方可自动重传修复）。
 * @param client 夸克客户端（缺省按环境变量创建）
 * @param statePath 状态文件路径
 */
export async function checkVaultConsistency(
    client: QuarkClient = new QuarkClient(),
    statePath: string = VAULT_STATE_PATH
): Promise<VaultCheckResult> {
    const checkedAt = Date.now()
    const state = await readVaultState(statePath)
    if (!state) {
        return { ok: false, reason: "no-local-state", checkedAt }
    }
    const fail = (reason: VaultCheckReason): Promise<VaultCheckResult> =>
        writeVaultCheckResult(statePath, state, { ok: false, reason, checkedAt })
    const target = await resolveVaultTarget(client)

    let direct: Uint8Array | null = null
    try {
        direct = await client.downloadFile(state.fid)
    } catch {
        direct = null
    }
    if (direct) {
        let password: string
        try {
            password = parseVaultPasswordText(extractStoredZipEntry(direct, VAULT_PASSWORD_ENTRY))
        } catch {
            return fail("bad-zip")
        }
        if (!(await compare(password, state.passwordHash))) {
            return fail("password-mismatch")
        }
        if (createHash("sha256").update(direct).digest("hex") !== state.sha256) {
            return fail("content-drift")
        }
        return writeVaultCheckResult(statePath, state, { ok: true, reason: "ok", checkedAt })
    }

    const candidates = await client.searchFiles(target.fileName, 50)
    const identity = await resolveVaultDirIdentity(client, target.dirFid)
    // 兜底候选含 `(N)` 改名副本（目录内同名旧件都可能是本次包），逐个下载以密码哈希判定，
    // 目录内优先，避免异目录同名文件干扰判定顺序。
    const exact = candidates
        .filter(item => isVaultDuplicateName(item.filename, target.fileName))
        .sort((a, b) => Number(isVaultFileInDir(b, identity)) - Number(isVaultFileInDir(a, identity)))
    if (exact.length === 0) {
        return fail("missing-remote")
    }
    let sawMismatch = false
    let sawBadZip = false
    let lastError: unknown = null
    for (const item of exact) {
        let bytes: Uint8Array
        try {
            bytes = await client.downloadFile(item.fid)
        } catch (error) {
            lastError = error
            continue
        }
        let password: string
        try {
            password = parseVaultPasswordText(extractStoredZipEntry(bytes, VAULT_PASSWORD_ENTRY))
        } catch {
            sawBadZip = true
            continue
        }
        if (!(await compare(password, state.passwordHash))) {
            sawMismatch = true
            continue
        }
        return writeVaultCheckResult(
            statePath,
            state,
            { ok: true, reason: "ok", checkedAt },
            {
                fid: item.fid,
                size: bytes.length,
                sha256: createHash("sha256").update(bytes).digest("hex"),
            }
        )
    }
    if (sawMismatch) {
        return fail("password-mismatch")
    }
    if (sawBadZip) {
        return fail("bad-zip")
    }
    if (lastError) {
        throw lastError
    }
    return fail("missing-remote")
}

/** 定时任务入口：未配置夸克令牌时跳过（只记日志，不抛错中断 cron）。 */
export async function syncVaultScheduled(): Promise<void> {
    if (!isQuarkConfigured()) {
        console.log("[safe-mode-vault] 未配置 QUARK_ACCESS_TOKEN，跳过本次上传")
        return
    }
    try {
        const { status } = await rotateVault()
        console.log(`[safe-mode-vault] 解锁密码已上传：${status.fileName}（fid=${status.fid}）`)
    } catch (error) {
        console.error("[safe-mode-vault] 定时上传失败：", error instanceof Error ? error.message : error)
    }
}
