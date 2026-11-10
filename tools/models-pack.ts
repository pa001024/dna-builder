#!/usr/bin/env bun

/**
 * 3D 皮肤模型发布：把源模型（默认 `models-src`）拆成**部件**再压缩发布。
 *
 * 游戏里的皮肤是「公共体型 + 角色头发/脸」拼出来的：202 个皮肤只用到 176 个唯一网格，
 * 其中公共体型被 219 次复用。若每个皮肤各存一份完整模型，公共体型会被重复打包几十次。
 * 因此按网格拆成部件、各自去重发布，清单只记录「这个皮肤由哪几个部件组成」，
 * 运行期再按 `PartModelsId` 的顺序拼回去。
 *
 * 与 `imgs-pack` 的差别：模型体积大、按角色精确取用，不做 zip 打包，
 * 每个部件独立成对象，前端按皮肤清单只下载缺的那几个部件。
 * 源模型不进 `public/`，也不随前端打包。
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { readGlb, writeGlb } from "../apps/web/src/utils/skin-model-glb"
import { extractAnimation, meshNames, splitMesh } from "../apps/web/src/utils/skin-model-parts"
import { assertStorageConfig, getPublicUrl, putFile } from "./object-storage"
import { compressGlb, DEFAULT_TEXTURE_BUDGET, type TextureBudget } from "./skin-model/compress"

/** 仓库根：本文件位于 `<root>/tools/` 下，与调用方 cwd 无关 */
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const webDir = path.resolve(rootDir, "apps", "web")
const sourceModelsDir = path.resolve(rootDir, "models-src")
const mockModelsDir = path.resolve(webDir, "mock", "models")
const manifestPath = path.resolve(mockModelsDir, "manifest.json")

/** 远端前缀：与前端 `buildCdnUrl("models/...")` 对应 */
const REMOTE_PREFIX = "models"

export type PartManifestEntry = {
    /** 部件名（网格名，例如 `QNF00_TP01_SM`），也是文件名 */
    name: string
    /** 远端对象 key，相对 `models/` 前缀 */
    file: string
    /** 压缩后字节数 */
    bytes: number
    /** 压缩后内容哈希：变了才需要重新下载 */
    hash: string
    builtAt: string
}

export type SkinManifestEntry = {
    /** 皮肤 id */
    id: string
    /** 组成该皮肤的部件名，顺序与游戏里的 `PartModelsId` 一致（体型在前、脸在后） */
    parts: string[]
    /**
     * 皮肤级染色元数据（部件名、丝袜白名单…）。
     * 每个部件都带着同一份，若留在部件里会被重复打包 N 次，这里提到清单只存一份。
     * 色板表不在这里：它来自数据包（`skin-colorize.data.ts`），各皮肤完全一致。
     */
    meta?: Record<string, any>
    /** 展示待机动画文件名；动画绑定骨骼名，合并完成后再绑回节点 */
    animation?: string
    /** 动画文件字节数 */
    animationBytes?: number
}

export type ModelManifest = {
    builtAt: string
    /** 部件表：按名字索引，多个皮肤共用 */
    parts: PartManifestEntry[]
    /** 皮肤 → 部件组合 */
    skins: SkinManifestEntry[]
}

/**
 * @description 递归收集源目录下的 GLB。
 * @param dir 源目录
 * @returns 绝对路径与相对路径列表
 */
function collectModels(dir = sourceModelsDir): { absPath: string; relPath: string }[] {
    const files: { absPath: string; relPath: string }[] = []
    if (!fs.existsSync(dir)) return files
    const walk = (dirPath: string, relativeDir: string) => {
        for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
            const absPath = path.join(dirPath, entry.name)
            const relPath = relativeDir ? path.posix.join(relativeDir, entry.name) : entry.name
            if (entry.isDirectory()) walk(absPath, relPath)
            else if (entry.name.endsWith(".glb")) files.push({ absPath, relPath })
        }
    }
    walk(dir, "")
    return files.sort((a, b) => a.relPath.localeCompare(b.relPath))
}

/**
 * @description 找出源目录里重复的模型 id。清单以 id 为键，重复会导致条目互相覆盖。
 * @param models 收集到的源文件
 * @returns 第一个重复的 id 及其所有相对路径；没有重复时 undefined
 */
export function findDuplicateId(models: { relPath: string }[]): { id: string; paths: string[] } | undefined {
    const groups = new Map<string, string[]>()
    for (const model of models) {
        const id = path.basename(model.relPath, ".glb")
        const paths = groups.get(id)
        if (paths) paths.push(model.relPath)
        else groups.set(id, [model.relPath])
    }
    for (const [id, paths] of groups) {
        if (paths.length > 1) return { id, paths }
    }
    return undefined
}

/**
 * @description 计算内容哈希（FNV-1a），用来判断模型是否变化。
 * @param bytes 内容
 * @returns 8 位十六进制哈希
 */
export function hashBytes(bytes: Uint8Array): string {
    let hash = 2166136261
    for (const byte of bytes) {
        hash ^= byte
        hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0).toString(16).padStart(8, "0")
}

/**
 * @description 读取已有清单。
 * @returns 清单；不存在或是旧版单文件清单时返回空清单
 */
export function readManifest(): ModelManifest {
    const empty: ModelManifest = { builtAt: new Date(0).toISOString(), parts: [], skins: [] }
    if (!fs.existsSync(manifestPath)) return empty
    try {
        const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as ModelManifest
        if (!Array.isArray(raw?.parts) || !Array.isArray(raw?.skins)) return empty
        return { builtAt: raw.builtAt ?? empty.builtAt, parts: raw.parts, skins: raw.skins }
    } catch {
        return empty
    }
}

/**
 * @description 判断部件是否需要重新发布。
 * @param entry 新条目
 * @param existing 已有条目
 * @returns 是否需要发布
 */
export function needsPublish(entry: Pick<PartManifestEntry, "hash" | "bytes">, existing?: PartManifestEntry): boolean {
    return !existing || existing.hash !== entry.hash || existing.bytes !== entry.bytes
}

/** 命令行参数 */
function parseArgs(argv: string[]) {
    const options = new Map<string, string>()
    const flags = new Set<string>()
    for (let index = 0; index < argv.length; index++) {
        const value = argv[index]
        if (!value.startsWith("--")) continue
        const next = argv[index + 1]
        if (next && !next.startsWith("--")) {
            options.set(value.slice(2), next)
            index++
        } else flags.add(value.slice(2))
    }
    return { options, flags }
}

/**
 * @description 解析贴图预算覆盖参数（`--texture cutout=0.75:lossless,mask=0.5:lossless`）。
 * @param value 参数值
 * @returns 覆盖后的预算
 */
export function parseTextureBudget(value: string | undefined): TextureBudget {
    const budget: TextureBudget = { ...DEFAULT_TEXTURE_BUDGET }
    if (!value) return budget
    for (const part of value.split(",")) {
        const [slot, spec] = part.split("=")
        if (!slot || !spec || !(slot in budget)) continue
        const [scale, quality] = spec.split(":")
        const parsed = Number(scale)
        if (!Number.isFinite(parsed)) continue
        const target = budget[slot as keyof TextureBudget]
        budget[slot as keyof TextureBudget] =
            quality === "lossless" ? { scale: parsed, lossless: true } : { scale: parsed, quality: Number(quality ?? 90) }
        void target
    }
    return budget
}

/** 默认目标体积上限：5 MiB。皮肤之间贴图张数差别大，靠固定档位压不进这个范围。 */
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024

/**
 * @description 解析体积上限参数（MiB）。
 * @param value 参数值；缺省或非法时用默认值
 * @returns 字节数
 */
export function parseMaxBytes(value: string | undefined): number {
    const mib = Number(value ?? 0)
    return Number.isFinite(mib) && mib > 0 ? mib * 1024 * 1024 : DEFAULT_MAX_BYTES
}

/** 一次拆分的产物：某个皮肤由哪些部件组成。 */
type SkinParts = { id: string; parts: string[]; glbs: Map<string, Uint8Array>; meta?: Record<string, any>; animation?: Uint8Array }

/**
 * @description 把全部源模型拆成「皮肤 → 部件」并收集唯一的部件二进制。
 * 同一部件（同一网格）在多个皮肤里只保留一份，这就是去重的来源。
 * 皮肤级染色元数据（色板表等）从部件里摘出来，随皮肤清单存一份；展示动画单独抽成文件。
 * @param models 源文件列表
 * @returns 每个皮肤的部件清单与元数据，以及部件名 → 原始 GLB
 */
function collectParts(models: { absPath: string; relPath: string }[]): {
    skins: SkinParts[]
    parts: Map<string, Uint8Array>
} {
    const skins: SkinParts[] = []
    const parts = new Map<string, Uint8Array>()
    for (const model of models) {
        const id = path.basename(model.relPath, ".glb")
        const document = readGlb(new Uint8Array(fs.readFileSync(model.absPath)))
        const names = meshNames(document)
        if (!names.length) {
            console.warn(`  ${id}: 没有可拆分的网格，跳过`)
            continue
        }
        // 皮肤级元数据每个部件都带同一份，摘出来只留一份，部件里删掉
        const meta = document.json.extras?.dnaColorize
        delete document.json.extras
        // 动画绑定的是骨骼节点，拆分后每个部件只剩自己那套索引，必须单独抽出来
        const animation = extractAnimation(document)
        const glbs = new Map<string, Uint8Array>()
        for (const name of names) {
            const part = splitMesh(document, name)
            if (!part) continue
            delete part.json.extras
            glbs.set(name, writeGlb(part))
            if (!parts.has(name)) parts.set(name, glbs.get(name)!)
        }
        skins.push({
            id,
            parts: names.filter(name => glbs.has(name)),
            glbs,
            meta,
            animation: animation ? writeGlb(animation) : undefined,
        })
    }
    return { skins, parts }
}

async function main(): Promise<void> {
    const { options, flags } = parseArgs(process.argv.slice(2))
    // parseArgs 存的是去掉 `--` 的键，这里统一按无前缀取
    const models = collectModels(options.get("src"))
    if (!models.length) {
        console.log("源目录下没有 GLB，跳过")
        return
    }
    // 清单按 id 索引，同一个 id 出现两次会让后写的条目覆盖前一条的文件，
    // 清单里的 bytes 与实际文件对不上。宁可提前报错，让人清掉残留。
    const duplicate = findDuplicateId(models)
    if (duplicate) {
        console.error(`源目录里 ${duplicate.id} 出现了两次：${duplicate.paths.join(" 与 ")}`)
        console.error("models-src 只应保留平铺的 <id>.glb，请删掉多余的那份。")
        process.exit(1)
    }
    const budget = parseTextureBudget(options.get("texture"))
    const maxBytes = parseMaxBytes(options.get("max-size"))
    const only = options.get("only")
    const manifest = readManifest()
    const existingParts = new Map(manifest.parts.map(entry => [entry.name, entry]))
    const upload = flags.has("upload")
    const force = flags.has("force")
    if (upload) assertStorageConfig()
    fs.mkdirSync(mockModelsDir, { recursive: true })

    const { skins, parts } = collectParts(models)
    console.log(`拆出 ${skins.length} 个皮肤 / ${parts.size} 个唯一部件`)

    const entries: PartManifestEntry[] = []
    let published = 0
    let savedBytes = 0
    for (const [name, source] of parts) {
        const previous = existingParts.get(name)
        if (only && !skins.some(skin => skin.id === only && skin.parts.includes(name))) {
            if (previous) entries.push(previous)
            continue
        }
        const localPath = path.join(mockModelsDir, `${name}.glb`)
        if (!force && previous && fs.existsSync(localPath)) {
            const current = new Uint8Array(fs.readFileSync(localPath))
            // 部件级增量：内容哈希没变就不用重压（压缩是这条流水线最慢的一步）
            if (previous.hash === hashBytes(current) && previous.bytes === current.length) {
                entries.push(previous)
                savedBytes += current.length
                continue
            }
        }
        const { glb, report } = await compressGlb(source, { texture: budget, maxBytes })
        const hash = hashBytes(glb)
        const entry: PartManifestEntry = { name, file: `${name}.glb`, bytes: glb.length, hash, builtAt: new Date().toISOString() }
        if (force || needsPublish(entry, previous)) {
            fs.writeFileSync(localPath, glb)
            if (upload) {
                const key = `${REMOTE_PREFIX}/${entry.file}`
                await putFile(key, localPath)
                console.log(`  已上传 ${key} -> ${getPublicUrl(key)}`)
            }
            published++
            console.log(
                `  ${name}: ${(report.before / 1048576).toFixed(2)} -> ${(glb.length / 1048576).toFixed(2)} MiB` +
                    `（贴图 ${(report.textures.reduce((sum, item) => sum + item.after, 0) / 1048576).toFixed(2)} MiB，` +
                    `几何 ${(report.geometry.after / 1048576).toFixed(2)} MiB）`
            )
        } else {
            console.log(`  ${name}: 未变化，跳过（${(glb.length / 1048576).toFixed(2)} MiB）`)
        }
        savedBytes += glb.length
        entries.push(entry)
    }

    // 皮肤清单只记部件名：运行期按这个顺序拼回完整模型
    const skinEntries: SkinManifestEntry[] = []
    for (const skin of skins) {
        // 色板表来自数据包，清单里不重复存
        const meta = skin.meta ? { ...skin.meta } : undefined
        if (meta) delete meta.swatches
        const entry: SkinManifestEntry = { id: skin.id, parts: skin.parts, ...(meta && Object.keys(meta).length ? { meta } : {}) }
        if (skin.animation) {
            const file = `${skin.id}.anim.glb`
            fs.writeFileSync(path.join(mockModelsDir, file), skin.animation)
            if (upload) {
                const key = `${REMOTE_PREFIX}/${file}`
                await putFile(key, path.join(mockModelsDir, file))
            }
            skinEntries.push({ ...entry, animation: file, animationBytes: skin.animation.length })
        } else skinEntries.push(entry)
    }
    const next: ModelManifest = { builtAt: new Date().toISOString(), parts: entries, skins: skinEntries }
    fs.writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`)
    const naive = skins.reduce((sum, skin) => sum + skin.parts.reduce((inner, name) => inner + (skin.glbs.get(name)?.length ?? 0), 0), 0)
    console.log(
        `清单已写入 ${path.relative(rootDir, manifestPath)}（${entries.length} 个部件 / ${skinEntries.length} 个皮肤，` +
            `本次发布 ${published} 个部件；部件化后 ${(savedBytes / 1048576).toFixed(1)} MiB，` +
            `按皮肤各存一份则是 ${(naive / 1048576).toFixed(1)} MiB）`
    )

    if (upload) {
        const key = `${REMOTE_PREFIX}/manifest.json`
        await putFile(key, manifestPath)
        console.log(`已上传 ${key} -> ${getPublicUrl(key)}`)
    }
}

if (import.meta.main) {
    main().catch(error => {
        console.error(error)
        process.exit(1)
    })
}
