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
 *
 * 增量分两层：本地层按内容哈希跳过重压（省 CPU），上传层按远端清单决定传哪些（防漏传）。
 * 先 build 后 upload 的两段式跑法下远端一定滞后，所以上传不能看本地清单。
 * `--check` 只对比本地与远端，不构建不上传。
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { readGlb, writeGlb } from "../apps/web/src/utils/skin-model-glb"
import { extractAnimation, meshNames, splitMesh } from "../apps/web/src/utils/skin-model-parts"
import type { ModelManifest, ModelPartEntry, SkinEntry } from "../apps/web/src/utils/skin-model-runtime"
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

export type PartManifestEntry = ModelPartEntry
export type SkinManifestEntry = SkinEntry
export type { ModelManifest }

/** 递归收集源目录下的 GLB。 */
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

/** 找出源目录里重复的模型 id：清单以 id 为键，重复会导致条目互相覆盖。 */
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

/** 计算内容哈希（FNV-1a），用来判断模型是否变化。 */
export function hashBytes(bytes: Uint8Array): string {
    let hash = 2166136261
    for (const byte of bytes) {
        hash ^= byte
        hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0).toString(16).padStart(8, "0")
}

/** 读取已有清单；不存在或是旧版单文件清单时返回空清单。 */
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

/** 判断部件是否需要重新发布（本地与远端共用同一口径：哈希或体积变了才传）。 */
export function needsPublish(entry: Pick<PartManifestEntry, "hash" | "bytes">, existing?: PartManifestEntry): boolean {
    return !existing || existing.hash !== entry.hash || existing.bytes !== entry.bytes
}

/**
 * 拉取远端清单（主端 CDN 公开地址）：`--upload` 时以它为准决定传哪些文件。
 * 本地清单只管省 CPU（跳过重压），不代表远端状态——先 build 后 upload 的两段式跑法下
 * 远端一定滞后，按本地清单决定上传会漏传。拉取失败返回 null，调用方按全量上传处理。
 */
export async function readRemoteManifest(): Promise<ModelManifest | null> {
    const url = getPublicUrl(`${REMOTE_PREFIX}/manifest.json`)
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
        if (!response.ok) return null
        const raw = (await response.json()) as ModelManifest
        if (!Array.isArray(raw?.parts) || !Array.isArray(raw?.skins)) return null
        return raw
    } catch {
        return null
    }
}

/**
 * 算出本地相对远端的待上传差异：部件按内容哈希+体积，动画按文件名+哈希+体积。
 * 远端缺失（首发或拉取失败）视为全量上传；远端多余的条目不管（只增不减，随清单切换）。
 */
export function diffRemote(local: ModelManifest, remote: ModelManifest | null): { parts: string[]; anims: string[] } {
    const remoteParts = new Map((remote?.parts ?? []).map(part => [part.name, part]))
    const remoteSkins = new Map((remote?.skins ?? []).map(skin => [skin.id, skin]))
    const parts: string[] = []
    for (const part of local.parts) {
        if (needsPublish(part, remoteParts.get(part.name))) parts.push(part.file)
    }
    const anims: string[] = []
    for (const skin of local.skins) {
        if (!skin.animation) continue
        const existing = remoteSkins.get(skin.id)
        if (
            existing?.animation !== skin.animation ||
            existing?.animationHash !== skin.animationHash ||
            existing?.animationBytes !== skin.animationBytes
        ) {
            anims.push(skin.animation)
        }
    }
    return { parts, anims }
}

/** `--check`：只对比本地清单/源目录与远端清单，不构建不上传。 */
async function printRemoteDiff(models: { relPath: string }[]): Promise<void> {
    const local = readManifest()
    const remote = await readRemoteManifest()
    if (!remote) console.warn("远端清单拉取失败（首发或网络问题），按远端为空对比")
    const diff = diffRemote(local, remote)
    console.log(
        `本地 ${local.parts.length} 部件 / ${local.skins.length} 皮肤；远端 ${remote?.parts.length ?? 0} 部件 / ${remote?.skins.length ?? 0} 皮肤`
    )
    console.log(`待上传部件 ${diff.parts.length} 个${diff.parts.length ? `：${diff.parts.join("、")}` : ""}`)
    console.log(`待上传动画 ${diff.anims.length} 个${diff.anims.length ? `：${diff.anims.join("、")}` : ""}`)
    const built = new Set(local.skins.map(skin => skin.id))
    const unbuilt = models
        .map(model => path.basename(model.relPath, ".glb"))
        .filter(id => !built.has(id))
        .sort()
    if (unbuilt.length) console.log(`源目录有、本地清单缺（需先 build）：${unbuilt.length} 个：${unbuilt.join("、")}`)
    if (!diff.parts.length && !diff.anims.length && !unbuilt.length) console.log("远端已是最新，无需同步")
}

/** 命令行参数：`--key value` 收进 options，裸 `--flag` 收进 flags。 */
export function parseArgs(argv: string[]) {
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

/** 解析贴图预算覆盖参数（`--texture cutout=0.75:lossless,mask=0.5:lossless`）。 */
export function parseTextureBudget(value: string | undefined): TextureBudget {
    const budget: TextureBudget = { ...DEFAULT_TEXTURE_BUDGET }
    if (!value) return budget
    for (const part of value.split(",")) {
        const [slot, spec] = part.split("=")
        if (!slot || !spec || !(slot in budget)) continue
        const [scale, quality] = spec.split(":")
        const parsed = Number(scale)
        if (!Number.isFinite(parsed)) continue
        budget[slot as keyof TextureBudget] =
            quality === "lossless" ? { scale: parsed, lossless: true } : { scale: parsed, quality: Number(quality ?? 90) }
    }
    return budget
}

/** 默认目标体积上限：5 MiB。皮肤之间贴图张数差别大，靠固定档位压不进这个范围。 */
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024

/** 解析体积上限参数（MiB）；缺省或非法时用默认值。 */
export function parseMaxBytes(value: string | undefined): number {
    const mib = Number(value ?? 0)
    return Number.isFinite(mib) && mib > 0 ? mib * 1024 * 1024 : DEFAULT_MAX_BYTES
}

/** 一次拆分的产物：某个皮肤由哪些部件组成。 */
type SkinParts = { id: string; parts: string[]; meta?: Record<string, unknown>; animation?: Uint8Array }

/**
 * 把全部源模型拆成「皮肤 → 部件」并收集唯一的部件二进制。
 * 皮肤级染色元数据从部件里摘出来随皮肤清单存一份；展示动画单独抽成文件。
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
        const meta = document.json.extras?.dnaColorize as Record<string, unknown> | undefined
        delete document.json.extras
        // 动画绑定的是骨骼节点，拆分后每个部件只剩自己那套索引，必须单独抽出来
        const animation = extractAnimation(document)
        const produced = new Set<string>()
        for (const name of names) {
            // 部件已拆过（公共体型被几十个皮肤共用）就跳过——拆分要整文档克隆再重打包，
            // 结果又会被丢弃，是这个循环里最贵的一步
            if (parts.has(name)) {
                produced.add(name)
                continue
            }
            const part = splitMesh(document, name)
            if (!part) continue
            delete part.json.extras
            parts.set(name, writeGlb(part))
            produced.add(name)
        }
        skins.push({
            id,
            parts: names.filter(name => produced.has(name)),
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
    if (flags.has("check")) {
        await printRemoteDiff(models)
        return
    }
    // 上传看远端：本地清单新不代表 CDN 上有，两段式跑法下远端一定滞后。
    // 拉取失败按全量上传处理，宁可多传也不漏传（传完清单才切版本，多传无害）。
    const remoteManifest = upload ? await readRemoteManifest() : null
    if (upload && !remoteManifest) console.warn("远端清单拉取失败，本次按全量上传处理")
    const remoteParts = new Map((remoteManifest?.parts ?? []).map(entry => [entry.name, entry]))
    const remoteSkins = new Map((remoteManifest?.skins ?? []).map(entry => [entry.id, entry]))
    fs.mkdirSync(mockModelsDir, { recursive: true })

    const { skins, parts } = collectParts(models)
    console.log(`拆出 ${skins.length} 个皮肤 / ${parts.size} 个唯一部件`)

    const entries: PartManifestEntry[] = []
    const uploads: Promise<void>[] = []
    let published = 0
    let savedBytes = 0
    let uploadedParts = 0
    let uploadedAnims = 0
    const queueUpload = (file: string, localPath: string): void => {
        const key = `${REMOTE_PREFIX}/${file}`
        uploads.push(putFile(key, localPath).then(() => console.log(`  已上传 ${key} -> ${getPublicUrl(key)}`)))
    }
    for (const [name, source] of parts) {
        const previous = existingParts.get(name)
        const remote = remoteParts.get(name)
        if (only && !skins.some(skin => skin.id === only && skin.parts.includes(name))) {
            if (previous) entries.push(previous)
            continue
        }
        const localPath = path.join(mockModelsDir, `${name}.glb`)
        if (!force && previous && fs.existsSync(localPath)) {
            const current = new Uint8Array(fs.readFileSync(localPath))
            // 本地增量只省 CPU（压缩是最慢的一步）：内容没变就不重压。
            // 传不传另看远端，下面补传分支会处理本地新、远端旧的情况。
            if (previous.hash === hashBytes(current) && previous.bytes === current.length) {
                entries.push(previous)
                savedBytes += current.length
                if (upload && (force || needsPublish(previous, remote))) {
                    queueUpload(previous.file, localPath)
                    uploadedParts++
                }
                continue
            }
        }
        const { glb, report } = await compressGlb(source, { texture: budget, maxBytes })
        const hash = hashBytes(glb)
        const entry: PartManifestEntry = { name, file: `${name}.glb`, bytes: glb.length, hash, builtAt: new Date().toISOString() }
        if (force || needsPublish(entry, previous)) {
            published++
            console.log(
                `  ${name}: ${(report.before / 1048576).toFixed(2)} -> ${(glb.length / 1048576).toFixed(2)} MiB` +
                    `（贴图 ${(report.textures.reduce((sum, item) => sum + item.after, 0) / 1048576).toFixed(2)} MiB，` +
                    `几何 ${(report.geometry.after / 1048576).toFixed(2)} MiB）`
            )
        } else {
            console.log(`  ${name}: 未变化，跳过（${(glb.length / 1048576).toFixed(2)} MiB）`)
        }
        // 本地回填：缺失或过期都写回，保证「清单 entry ↔ 本地文件」一致，
        // 远端补传时一定有文件可传（旧逻辑未变化时不写，缺文件会传失败）。
        if (!fs.existsSync(localPath) || hashBytes(new Uint8Array(fs.readFileSync(localPath))) !== hash) {
            fs.writeFileSync(localPath, glb)
        }
        savedBytes += glb.length
        entries.push(entry)
        if (upload && (force || needsPublish(entry, remote))) {
            queueUpload(entry.file, localPath)
            uploadedParts++
        }
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
            const animPath = path.join(mockModelsDir, file)
            fs.writeFileSync(animPath, skin.animation)
            const animationHash = hashBytes(skin.animation)
            if (upload) {
                // 动画同样按远端去重：219 个全量重传约百 MB，没变就不传
                const remoteSkin = remoteSkins.get(skin.id)
                const same =
                    !force &&
                    remoteSkin?.animation === file &&
                    remoteSkin?.animationHash === animationHash &&
                    remoteSkin?.animationBytes === skin.animation.length
                if (!same) {
                    queueUpload(file, animPath)
                    uploadedAnims++
                }
            }
            skinEntries.push({ ...entry, animation: file, animationBytes: skin.animation.length, animationHash })
        } else skinEntries.push(entry)
    }
    const next: ModelManifest = { builtAt: new Date().toISOString(), parts: entries, skins: skinEntries }
    fs.writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`)
    const naive = skins.reduce((sum, skin) => sum + skin.parts.reduce((inner, name) => inner + (parts.get(name)?.length ?? 0), 0), 0)
    console.log(
        `清单已写入 ${path.relative(rootDir, manifestPath)}（${entries.length} 个部件 / ${skinEntries.length} 个皮肤，` +
            `本地变更 ${published} 个部件${upload ? `，上传 ${uploadedParts} 个部件 / ${uploadedAnims} 个动画` : ""}；部件化后 ${(savedBytes / 1048576).toFixed(1)} MiB，` +
            `按皮肤各存一份则是 ${(naive / 1048576).toFixed(1)} MiB）`
    )

    if (upload) {
        // 部件/动画上传攒成一批并发跑，最后再传清单
        await Promise.all(uploads)
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
