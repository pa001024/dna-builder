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
 * 轮换解锁密码并上传到夸克网盘：生成新密码 → 打包 zip → 上传到配置目录 →
 * 只存 bcrypt 哈希与文件信息落盘（明文密码仅此次返回）。
 * 同名覆盖上传，文件落在固定分享覆盖的目录里，无需另建分享。
 * @param client 夸克客户端（缺省按环境变量创建）
 * @param statePath 状态文件路径
 */
export async function rotateVault(
    client: QuarkClient = new QuarkClient(),
    statePath: string = VAULT_STATE_PATH
): Promise<{ password: string; status: VaultStatus }> {
    const password = generateVaultPassword()
    const uploadedAt = Date.now()
    const zip = buildVaultZip(password, uploadedAt)
    const sha256 = createHash("sha256").update(zip).digest("hex")
    const target = await resolveVaultTarget(client)

    const uploaded = await client.uploadBuffer(target.fileName, zip, target.dirFid)

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

/** 写回落盘状态（保留密码哈希，仅更新校验结论）。 */
async function writeVaultCheckResult(statePath: string, state: VaultState, result: VaultCheckResult): Promise<VaultCheckResult> {
    await mkdir(dirname(statePath), { recursive: true })
    await writeFile(statePath, JSON.stringify({ ...state, lastCheckedAt: result.checkedAt, consistent: result.ok }, null, 2), "utf-8")
    return result
}

/**
 * 一致性校验：按配置找到网盘上的密码压缩包，下载解出密码与本地哈希比对。
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
    const candidates = await client.searchFiles(target.fileName)
    const remote =
        candidates.find(item => item.filename === target.fileName && (target.dirFid === "0" || item.parent_fid === target.dirFid)) ??
        candidates.find(item => item.filename === target.fileName)
    if (!remote) {
        return fail("missing-remote")
    }
    const bytes = await client.downloadFile(remote.fid)
    let password: string
    try {
        password = parseVaultPasswordText(extractStoredZipEntry(bytes, VAULT_PASSWORD_ENTRY))
    } catch {
        return fail("bad-zip")
    }
    if (!(await compare(password, state.passwordHash))) {
        return fail("password-mismatch")
    }
    if (createHash("sha256").update(bytes).digest("hex") !== state.sha256) {
        return fail("content-drift")
    }
    return writeVaultCheckResult(statePath, state, { ok: true, reason: "ok", checkedAt })
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
