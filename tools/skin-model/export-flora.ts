import { existsSync } from "node:fs"
import { mkdir, stat } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { deflateSync } from "node:zlib"
import { appendAccessors, appendBinary, mergeGlbs, readAccessorBytes, readGlb, writeGlb } from "../../apps/web/src/utils/skin-model-glb"
import { appendUeAnimation, readUeAnim } from "./anim"
import { characterDirectory, readSkinCatalog, type SkinCatalogEntry } from "./catalog"
import { cutoutBaseNames, isMaskTexture, optimizeGlb } from "./optimize"
import { attachEffectRoots, bindToSkeleton } from "./rebind"
import { pickTintRow } from "./tint-row"
import { mapVertexColors, readUeModelSkeleton, readUeModelVertexColors, type UeModelBone } from "./uemodel"

/**
 * 导出可染色的 3D 皮肤模型（GLB）。
 *
 * 支持两种模式：
 * - 单个：`--skin 110201` 或 `--out <path>`
 * - 批量：`--all`（默认），按 `Skin.lua` 里所有带 `SkinTag` 的皮肤逐个导出到 `models-src/<skinId>.glb`
 *
 * 皮肤 → 网格 → 材质的映射全部来自游戏数据表（见 `catalog.ts`），不再硬编码单个角色。
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
/** 效果生物网格（翅膀）挂接的骨骼：上背，翅膀根通常就在这里。 */
const EFFECT_ATTACH_BONE = "spine_03"
const options = new Map<string, string>()
const flags = new Set<string>()
for (let index = 2; index < process.argv.length; index++) {
    const value = process.argv[index]
    if (!value.startsWith("--")) continue
    const next = process.argv[index + 1]
    if (next && !next.startsWith("--")) {
        options.set(value.slice(2), next)
        index++
    } else flags.add(value.slice(2))
}
if (flags.has("help")) {
    console.log(`用法: bun tools/skin-model/export-flora.ts [选项]

  --all                 导出全部带 SkinTag 的皮肤（默认）
  --skin <id>           只导出指定皮肤，可重复
  --out <path>          单皮肤模式下的输出路径
  --assets <dir>        解包资产目录（默认 F:/test/EM）
  --paks <dir>          游戏 pak 目录
  --lua <dir>           游戏 Script 目录
  --cli <exe>           fmodel-cli 路径
  --mappings <usmap>    UE 映射文件
  --simplify <ratio>    全局网格简化比例（默认 1，即不简化）
  --texture-quality <n> 贴图编码质量（默认 95）
  --keep-tangent        保留切线属性
  --skip-existing       已存在输出的皮肤跳过（批量增量用）`)
    process.exit(0)
}

const assets = resolve(options.get("assets") ?? "F:/test/EM")
const paks = resolve(options.get("paks") ?? assets)
const lua = resolve(options.get("lua") ?? "E:/dev/DuetNightAbyssData2/Script")
const cli = resolve(options.get("cli") ?? "D:/dev/fmodel-mcp/Cli/bin/publish/fmodel-cli.exe")
const mappings = resolve(
    options.get("mappings") ?? "D:/dev/dna-unpack/4.27.2-0+++UE4+Release-4.27-EM/Mappings/4.27.2-0+++UE4+Release-4.27-EM.usmap"
)
const outputDir = resolve(options.get("dir") ?? join(root, "models-src"))
const work = options.has("cache") ? resolve(options.get("cache")!) : join(root, ".tmp/flora-export", "cache")

/** 引擎内置纯色贴图（/Engine/EngineResources/*）的颜色，避免为一格纯色去解引擎 pak。 */
const ENGINE_COLORS: Record<string, [number, number, number, number]> = {
    Black: [0, 0, 0, 255],
    White: [255, 255, 255, 255],
    Gray: [128, 128, 128, 255],
    DefaultWhiteGrid: [255, 255, 255, 255],
}

function encodeSolidPng([r, g, b, a]: [number, number, number, number]): Uint8Array {
    const raw = new Uint8Array(2 * (2 * 4 + 1))
    for (let y = 0; y < 2; y++) {
        const row = y * 9
        raw[row] = 0
        for (let x = 0; x < 2; x++) raw.set([r, g, b, a], row + 1 + x * 4)
    }
    const table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
        let c = n
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        table[n] = c >>> 0
    }
    const crc = (bytes: Uint8Array) => {
        let c = 0xffffffff
        for (const byte of bytes) c = table[(c ^ byte) & 0xff] ^ (c >>> 8)
        return (c ^ 0xffffffff) >>> 0
    }
    const chunk = (type: string, data: Uint8Array) => {
        const out = new Uint8Array(12 + data.length)
        const view = new DataView(out.buffer)
        view.setUint32(0, data.length)
        for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
        out.set(data, 8)
        view.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)))
        return out
    }
    const ihdr = new Uint8Array(13)
    const header = new DataView(ihdr.buffer)
    header.setUint32(0, 2)
    header.setUint32(4, 2)
    ihdr[8] = 8
    ihdr[9] = 6
    const idat = new Uint8Array(deflateSync(raw).buffer)
    const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
    const parts = [signature, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))]
    const total = parts.reduce((sum, part) => sum + part.length, 0)
    const png = new Uint8Array(total)
    let offset = 0
    for (const part of parts) {
        png.set(part, offset)
        offset += part.length
    }
    return png
}
const simplifyRatio = Number(options.get("simplify") ?? 1)
const simplifyRatios = options.has("simplify-ratios") ? (JSON.parse(options.get("simplify-ratios")!) as Record<string, number>) : undefined
const textureQuality = Number(options.get("texture-quality") ?? 95)
const skipExisting = flags.has("skip-existing")
const requestedSkins = process.argv.flatMap((value, index) => (value === "--skin" ? [Number(process.argv[index + 1])] : []))

if (!work.startsWith(`${join(root, ".tmp")}\\`) && !work.startsWith(`${join(root, ".tmp")}/`))
    throw new Error("Cache must stay inside .tmp")
await mkdir(work, { recursive: true })
for (const path of [cli, mappings, join(lua, "Datas/Swatch.lua"), join(assets, "Content/BluePrints/Char/DT_ShopskinTint.uasset")]) {
    if (!(await Bun.file(path).exists())) throw new Error(`Required input is missing: ${path}`)
}
if (!(await stat(paks).catch(() => undefined))?.isDirectory()) throw new Error(`Required pak directory is missing: ${paks}`)
const config = join(work, "config.json")
await Bun.write(
    config,
    JSON.stringify({
        PaksDir: paks,
        OutputDir: work,
        UeVersion: "GAME_UE4_27",
        MappingsFile: mappings,
        MountPoint: "EM",
        AesKey: options.get("aes") ?? "0x5B82ACB93E4F7133BE70A989539A8529EB487F59D7F0356D4C40438206158AB2",
        PatchPaksDirs: options.get("patches")?.split(";") ?? [],
    })
)

/** 单次 fmodel 调用的超时（毫秒）。CLI 偶尔会卡在 Oodle 解压上不退出，必须有兜底。 */
const INVOKE_TIMEOUT_MS = Number(options.get("invoke-timeout") ?? 180_000)

/**
 * 常驻 CLI 会话：`fmodel-cli batch` 一次建好 pak 索引（约 13 秒），
 * 之后从 stdin 逐行收命令、stdout 逐行回 JSON。逐次启动会把这份开销乘以几百倍，
 * 一个皮肤 30 多次调用就要多花 7 分钟。
 */
class CliSession {
    private child: ReturnType<typeof Bun.spawn> | undefined
    private pending: string[] = []
    private buffer = ""
    private waiting: { resolve: (line: string) => void; reject: (error: Error) => void } | undefined

    /** 取当前会话；子进程已退出时重建（CLI 崩溃不该让整批导出失败）。 */
    private async ensure(): Promise<ReturnType<typeof Bun.spawn>> {
        if (this.child) return this.child
        const child = Bun.spawn([cli, "batch"], {
            cwd: work,
            env: { ...process.env, FMODEL_MCP_CONFIG: config },
            stdin: "pipe",
            stdout: "pipe",
            stderr: "pipe",
        })
        this.child = child
        this.buffer = ""
        // 读循环：按行切分，交给等待中的调用方
        void (async () => {
            const reader = (child.stdout as ReadableStream<Uint8Array>).getReader()
            const decoder = new TextDecoder()
            for (;;) {
                const { done, value } = await reader.read()
                if (done) break
                this.buffer += decoder.decode(value, { stream: true })
                let index: number
                while ((index = this.buffer.indexOf("\n")) >= 0) {
                    const line = this.buffer.slice(0, index)
                    this.buffer = this.buffer.slice(index + 1)
                    this.waiting?.resolve(line)
                    this.waiting = undefined
                }
            }
            this.child = undefined
            this.waiting?.reject(new Error("fmodel-cli batch session ended"))
            this.waiting = undefined
        })()
        return child
    }

    /** 在常驻会话里跑一条命令，返回 CLI 输出的那一行 JSON。 */
    async run(args: string[]): Promise<{ stdout: Uint8Array; stderr: string; code: number }> {
        const child = await this.ensure()
        const line = args.join(" ")
        // 串行化：batch 模式下 stdout 是一行一结果，并发写会错位
        while (this.pending.length) await new Promise(resolve => setTimeout(resolve, 5))
        this.pending.push(line)
        let timer: ReturnType<typeof setTimeout> | undefined
        const waiter = {
            resolve: undefined as ((line: string) => void) | undefined,
            reject: undefined as ((error: Error) => void) | undefined,
        }
        try {
            const response = await new Promise<string>((resolve, reject) => {
                waiter.resolve = resolve
                waiter.reject = reject
                this.waiting = { resolve, reject }
                void (child.stdin as { write: (text: string) => void }).write(`${line}\n`)
                // 定时器必须在返回时清掉：Bun 会等未到期的 timer 走完才退出进程，
                // 漏清会让每条命令都把进程多留 3 分钟。
                timer = setTimeout(() => {
                    // 超时后这条命令的响应不会再回来，必须摘掉等待者，
                    // 否则下一条命令会拿到这条迟到的结果，整个会话就此错位。
                    if (this.waiting?.resolve === waiter.resolve) this.waiting = undefined
                    reject(new Error(`fmodel-cli batch timeout: ${args[0]}`))
                }, INVOKE_TIMEOUT_MS)
            })
            return { stdout: new TextEncoder().encode(response), stderr: "", code: 0 }
        } finally {
            clearTimeout(timer)
            if (this.waiting?.resolve === waiter.resolve) this.waiting = undefined
            this.pending.pop()
        }
    }

    /** 关掉常驻会话。 */
    close(): void {
        try {
            this.child?.kill()
        } catch {}
        this.child = undefined
    }
}

const session = new CliSession()

/** 跑一次 fmodel-cli；常驻会话失败时退回一次性进程（保证单条命令仍能成功）。 */
async function runCli(args: string[]): Promise<{ stdout: Uint8Array; stderr: string; code: number }> {
    if (!flags.has("no-batch")) {
        try {
            return await session.run(args)
        } catch {
            session.close()
        }
    }
    const child = Bun.spawn([cli, ...args], {
        cwd: work,
        env: { ...process.env, FMODEL_MCP_CONFIG: config },
        stdout: "pipe",
        stderr: "pipe",
    })
    const timer = setTimeout(() => {
        // 卡住的 CLI 必须杀掉，否则整个批量导出会被一个文件拖死
        try {
            child.kill("SIGKILL")
        } catch {}
    }, INVOKE_TIMEOUT_MS)
    try {
        const [stdout, stderr, code] = await Promise.all([
            new Response(child.stdout).arrayBuffer(),
            new Response(child.stderr).text(),
            child.exited,
        ])
        return { stdout: new Uint8Array(stdout), stderr, code }
    } finally {
        clearTimeout(timer)
    }
}

/** 把 CLI 输出解码成字符串：正常情况下是 UTF-8，个别环境下是 GBK，按严格模式依次试。 */
function decodeOutput(bytes: Uint8Array): string {
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    } catch {
        return new TextDecoder("gbk", { fatal: false }).decode(bytes)
    }
}

const CACHED_EXTENSIONS: Record<string, string> = {
    "export-tex": ".png",
    "export-mesh-gltf": ".glb",
    "export-mesh-uf": ".uemodel",
    "export-anim": ".ueanim",
}

/** 查导出缓存：磁盘上平铺与嵌套两种形态都可能出现，都要认。 */
function cachedExport(command: string, path: string): string | undefined {
    const extension = CACHED_EXTENSIONS[command]
    if (!extension) return undefined
    const relative = path.replace(/^\/Game\//, "EM/Content/")
    // 嵌套形态：导出器以资产所在目录为根再拼一次完整包路径
    for (const candidate of [join(work, relative + extension), join(work, dirname(relative), relative + extension)]) {
        if (existsSync(candidate)) return candidate
    }
    return undefined
}

async function invoke(command: string, path: string) {
    const cached = cachedExport(command, path)
    if (cached) return { ok: true, outputPath: cached }
    let lastError = ""
    // 卡死或崩溃各重试一次：这类失败多为 CLI 内部瞬时问题，重跑通常就好
    for (let attempt = 0; attempt < 2; attempt++) {
        const { stdout, stderr, code } = await runCli([command, path])
        const text = decodeOutput(stdout)
        const result = JSON.parse(text.trim().split("\n").at(-1) || "{}")
        if (!code && result.ok) {
            if (result.outputPath) result.outputPath = unwrapOutput(result.outputPath)
            if (result.savedPath) result.savedPath = unwrapOutput(result.savedPath)
            return result
        }
        lastError = result.error ?? stderr.trim() ?? `exit ${code}`
    }
    throw new Error(`${command} ${path}: ${lastError}`)
}

/** CLI 以 OutputDir 为根再拼一次完整包路径，取最后一段 EM/Content 归一化。 */
function unwrapOutput(path: string) {
    const normalized = path.replace(/\\/g, "/")
    const candidates = [...normalized.matchAll(/\/EM\/Content\//g)].map(match => join(work, normalized.slice(match.index! + 1)))
    // 资源导出器会再拼一层包路径；优先选磁盘上真实存在的那一份。
    for (const candidate of candidates.reverse()) if (existsSync(candidate)) return candidate
    return candidates.at(-1) ?? path
}

/** 游戏数据表读取（输出是 GBK，统一转成字符串）。 */
async function readTable(path: string): Promise<Record<string, any>> {
    const { stdout, stderr, code } = await runCli(["read", path.replace(/^\/Game\//, "EM/Content/")])
    if (code) throw new Error(`read ${path}: ${stderr}`)
    const result = JSON.parse(decodeOutput(stdout).trim().split("\n").at(-1) ?? "{}")
    if (!result.ok) throw new Error(`read ${path}: ${result.error}`)
    return result.objects[0].Rows ?? {}
}

/** 用 glob 搜索资产，返回第一个匹配的 `/Game/...` 包路径。 */
/** 按 glob 搜资产：优先匹配角色目录的结果，避免同名材质撞到别的角色。 */
async function searchAsset(pattern: string, preferDir?: string): Promise<string | undefined> {
    const { stdout, code } = await runCli(["search", pattern, "50"])
    if (code) return undefined
    const result = JSON.parse(decodeOutput(stdout).trim().split("\n").at(-1) ?? "{}")
    const matches = (result.matches ?? []).filter((path: string) => path.endsWith(".uasset"))
    // 同名材质在不同角色下都存在，先挑落在当前角色目录里的那个
    const match = (preferDir && matches.find((path: string) => path.includes(`/${preferDir}/`))) || matches[0]
    return match ? `/${match.replace(/^EM\/Content\//, "Game/").replace(/\.uasset$/, "")}` : undefined
}

/**
 * 在角色目录下找展示待机动画：命名不统一、个别压缩格式 CLI 解不了，
 * 必须按优先级返回全部候选逐个试导出，而不是只取第一个搜到的。
 */
async function findArmoryIdle(entry: SkinCatalogEntry): Promise<string[]> {
    const dir = characterDirectory(entry)
    if (!dir) return []
    const folder = dir.split("/").at(-1)
    const candidates: string[] = []
    for (const pattern of ["*Armory_Idle", "*Armory_Turn90_Idle", "*Armory_Turn180_Idle", "*Armory_Turn90_Start"]) {
        const found = await searchAsset(`**/${folder}/Animation/Sequence/Armory/Show/${pattern}.uasset`)
        if (found && !candidates.includes(found)) candidates.push(found)
    }
    return candidates
}

interface SkinExportInput {
    entry: SkinCatalogEntry
    output: string
    shopskinTint: Record<string, any>
    hairTint: Record<string, any>
}

/**
 * 数据表里的部件路径不一定存在于当前游戏版本：个别体型的公共路径没有打包，
 * 按网格名前缀在角色目录里搜出全部同类部件；找不到替代时原样返回。
 */
async function resolveMeshPaths(path: string, entry: SkinCatalogEntry): Promise<string[]> {
    const name = path.split("/").at(-1) ?? ""
    const found = await searchAsset(`**/${name}.*`, characterDirectory(entry)?.split("/").at(-1))
    if (found) return [found]
    // 名字形如 `QNF_SP17_Body_SM`：退到同前缀的 `QNF_SP17_Part*_SM`
    const prefix = name.replace(/Body_SM$/, "")
    if (prefix === name) return [path]
    const { stdout, code } = await runCli(["search", `**/${prefix}Part*_SM.uasset`, "50"])
    if (code) return [path]
    const result = JSON.parse(decodeOutput(stdout).trim().split("\n").at(-1) ?? "{}")
    const folder = characterDirectory(entry)?.split("/").at(-1)
    const matches = (result.matches ?? [])
        .filter((item: string) => item.endsWith(".uasset") && (!folder || item.includes(`/${folder}/`)))
        .map((item: string) => `/${item.replace(/^EM\/Content\//, "Game/").replace(/\.uasset$/, "")}`)
    return matches.length ? matches : [path]
}

/** 导出单个皮肤。返回写出的路径。 */
async function exportSkin({ entry, output, shopskinTint, hairTint }: SkinExportInput): Promise<string> {
    console.log(`\n=== ${entry.skinId} (${entry.tag}) ===`)
    // 身体部件 + 脸。脸部网格决定骨架，所以放最后合并也无妨；顺序稳定便于复现。
    const meshes = [...entry.partMeshes]
    if (entry.faceMesh) meshes.push(entry.faceMesh)
    // 皮肤品阶效果生物（翅膀等）：独立骨架，合并后挂到脊柱骨骼上。
    const effectMeshes = new Set(entry.effectMeshes)
    meshes.push(...entry.effectMeshes)
    const documents = []
    const skeletons: UeModelBone[] = []
    const effectRoots: string[] = []
    for (const declared of meshes) {
        const paths = await resolveMeshPaths(declared, entry)
        for (const path of paths) await exportMesh(path, declared === path ? undefined : declared)
    }

    async function exportMesh(path: string, declared?: string) {
        console.log(`Exporting ${path}${declared ? `（数据表为 ${declared}）` : ""}`)
        const effect = effectMeshes.has(path) || (declared !== undefined && effectMeshes.has(declared))
        const exported = await invoke("export-mesh-gltf", path)
        const document = readGlb(new Uint8Array(await Bun.file(exported.outputPath).arrayBuffer()))
        // glTF2 导出会把顶点色全写成 0；同一网格的 UEFormat 导出保留完整顶点色，按位置回填。
        const uf = await invoke("export-mesh-uf", path)
        const ufBytes = new Uint8Array(await Bun.file(uf.outputPath).arrayBuffer())
        const bones = readUeModelSkeleton(ufBytes)
        // 效果网格有两种骨架：自带的独立骨架（翅膀，绑定姿态绕自身原点）和角色共享的
        // Biped 骨架（蒙皮到身体骨骼，合并后自然跟随）。只有前者的根节点需要改名后挂脊柱；
        // 后者根节点就是角色 `Root`，改名会把整副骨架从角色上拆下来。
        const sharedSkeleton = bones.some(bone => bone.name === "pelvis")
        const rootBone = bones.find(bone => bone.parent < 0)
        const effectRoot = effect && !sharedSkeleton && rootBone ? `${path.split("/").at(-1)}_Root` : undefined
        if (effectRoot && rootBone) {
            // 各角色骨架的根名称不统一（`Root` / `root`）：按骨骼表里的实际名字改节点，两边必须一致
            const sourceName = rootBone.name
            rootBone.name = effectRoot
            for (const node of document.json.nodes ?? []) if (node.name === sourceName && node.mesh === undefined) node.name = effectRoot
            effectRoots.push(effectRoot)
            console.log(`  effect mesh: skeleton root ${sourceName} renamed to ${effectRoot}`)
        } else if (effect) {
            console.log("  effect mesh uses the shared character skeleton; merged as a normal part")
        }
        skeletons.push(...bones)
        const vertexColors = readUeModelVertexColors(ufBytes)
        if (vertexColors.length) {
            let matched = 0
            let total = 0
            for (const mesh of document.json.meshes ?? []) {
                for (const primitive of mesh.primitives) {
                    const position = primitive.attributes.POSITION
                    if (position === undefined) continue
                    const data = readAccessorBytes(document, position)
                    const positions = new Float32Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
                    const mapped = mapVertexColors(vertexColors, positions)
                    matched += mapped.matched
                    total += mapped.total
                    if (mapped.matched === 0) continue
                    const [accessor] = appendAccessors(document, [
                        {
                            data: mapped.colors,
                            type: "VEC4",
                            componentType: 5121,
                            normalized: true,
                            count: mapped.total,
                            target: 34962,
                        },
                    ])
                    primitive.attributes.COLOR_0 = accessor
                }
            }
            console.log(`  vertex colors: ${matched}/${total} vertices matched`)
        }
        for (const material of document.json.materials) material.extras = { dnaRole: "character" }
        for (const node of document.json.nodes) if (node.mesh !== undefined) node.extras = { dnaRole: "character" }
        documents.push(document)
    }
    const model = mergeGlbs(documents)
    // 导出骨架是共享骨架的 T-pose、网格顶点是 A-pose，必须换成网格自带的绑定姿态；
    // 之后再写动画，静止且与绑定一致的轨道才能被正确省略。
    const bound = bindToSkeleton(model, skeletons)
    console.log(`Bound ${bound.skins} skins / ${bound.joints} joints / ${bound.nodes} nodes to the mesh reference pose`)
    // 效果网格（翅膀）是独立骨架：绑定后再整体挂到脊柱，跟着角色动作走。
    if (effectRoots.length) {
        const attached = attachEffectRoots(model, effectRoots, EFFECT_ATTACH_BONE)
        console.log(`Attached ${attached} effect mesh root(s) to ${EFFECT_ATTACH_BONE}`)
    }

    const animationCandidates = await findArmoryIdle(entry)
    // 逐个候选试导出：搜得到不代表解得了（个别动画的压缩格式 CLI 不支持），
    // 一个失败就换下一个，别让整只皮肤丢掉动画。
    for (const animationPath of animationCandidates) {
        console.log(`Exporting ${animationPath}`)
        try {
            const exported = await invoke("export-anim", animationPath)
            const animation = readUeAnim(new Uint8Array(await Bun.file(exported.outputPath).arrayBuffer()))
            const result = appendUeAnimation(model, animation)
            if (!result.channels) console.warn(`  animation does not target any exported bone: ${animationPath}`)
            else
                console.log(
                    `Animation ${animation.name}: ${result.channels} channels, ${result.keys} keys, ${result.skipped} tracks without a matching node`
                )
            break
        } catch (error) {
            // 个别角色没有展示动作，模型本身仍可用
            console.warn(`  animation unavailable: ${(error as Error).message}`)
        }
    }

    const embedded = new Map<string, number>()
    /** 贴图导出失败返回 undefined：缺一张图不该让整只皮肤作废。 */
    async function embed(path: string): Promise<number | undefined> {
        const normalized = path.replace(/\.\d+$/, "").replace(/^EM\/Content\//, "/Game/")
        const cached = embedded.get(normalized)
        if (cached !== undefined) return cached
        // /Engine/EngineResources/* 是引擎内置贴图（Black/White/Gray），打包在引擎 pak 里，
        // 不在游戏内容 pak 中，导出会直接报「no game file」。按名字合成一张纯色即可。
        const builtin = engineColor(normalized)
        if (builtin) return builtin()
        console.log(`Texture ${normalized}`)
        let bytes: Uint8Array
        try {
            const exported = await invoke("export-tex", normalized)
            bytes = new Uint8Array(await Bun.file(exported.outputPath).arrayBuffer())
        } catch (error) {
            // 环境贴图、HDR 之类不是 UTexture2D，导出必然失败；材质侧缺这一槽仍可渲染
            console.warn(`  texture unavailable: ${normalized} (${(error as Error).message})`)
            return undefined
        }
        const byteOffset = appendBinary(model, bytes)
        const bufferView = model.json.bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.length }) - 1
        const image = model.json.images.push({ bufferView, mimeType: "image/png", name: normalized.split("/").at(-1) }) - 1
        const texture = model.json.textures.push({ source: image }) - 1
        embedded.set(normalized, texture)
        return texture
    }

    /** 引擎内置纯色贴图：按资产名返回 2x2 PNG，避免为一张纯色去解引擎 pak。 */
    function engineColor(path: string): (() => number) | undefined {
        const name = path.split("/").at(-1)
        const rgba = ENGINE_COLORS[name ?? ""]
        if (!path.startsWith("/Engine/") || !rgba) return undefined
        return () => {
            const cached = embedded.get(path)
            if (cached !== undefined) return cached
            const png = encodeSolidPng(rgba)
            const byteOffset = appendBinary(model, png)
            const bufferView = model.json.bufferViews.push({ buffer: 0, byteOffset, byteLength: png.length }) - 1
            const image = model.json.images.push({ bufferView, mimeType: "image/png", name: name ?? "builtin" }) - 1
            const texture = model.json.textures.push({ source: image }) - 1
            embedded.set(path, texture)
            return texture
        }
    }

    // 默认染色值按「套装码 + 体型」对齐（材质名与表里的网格名写法不同）：
    // 只取首段会让所有同体型套装共用 SP01 那一行，颜色全错。
    const tintRowFor = (meshName: string) => pickTintRow(shopskinTint, meshName)
    const hairRowFor = (meshName: string) => pickTintRow(hairTint, meshName)

    for (const material of model.json.materials) {
        // 眼影是纯半透明黑，没有贴图也没有染色参数，各版本共用一套固定值（V10/V14…）。
        // 名字有 `M_EyeShadow_V10` 与 `MI_EyeShadow_V10` 两种写法。
        if (/^M_?I?_?EyeShadow_V\d+$/i.test(material.name)) {
            material.pbrMetallicRoughness = { baseColorFactor: [0, 0, 0, 0.2], metallicFactor: 0, roughnessFactor: 1 }
            material.alphaMode = "BLEND"
            material.extras = {
                dnaColorize: {
                    version: 1,
                    kind: "shadow",
                    role: "character",
                    parent: `/Game/Asset/TA/Char/Materials/Player/Face/${material.name}`,
                    vectors: {},
                    scalars: {},
                    textures: {},
                },
            }
            continue
        }
        // 材质资产名与网格里的引用可能差前缀（网格写 `Lilikou_SP01_Hair`，资产是 `MI_Lilikou_SP01_Hair`），
        // 也可能差大小写（MI_FuLuo vs MI_Fuluo），且不一定与网格同目录：直接按名字搜资产再逐个试。
        // 每个部件网格的 Materials 目录都要试：身体材质躺在身体网格旁，不在头发网格旁。
        const meshDirs = [...new Set(entry.partMeshes.map(mesh => mesh.split("/Mesh/")[0]))]
        const names = [material.name, material.name.replace(/^MI_/, ""), `MI_${material.name.replace(/^MI_/, "")}`]
        const uniqueNames = [...new Set(names)]
        const candidates = [
            material.extras?.dnaMaterialPath,
            ...uniqueNames.flatMap(name => [
                `${characterDirectory(entry)}/Materials/${name}`,
                ...meshDirs.map(dir => `${dir}/Materials/${name}`),
                `/Game/Asset/TA/Char/Materials/Player/Body/${name}`,
                `/Game/Asset/TA/Char/Materials/Player/Face/${name}`,
            ]),
        ].filter(Boolean) as string[]
        let inspected: any
        for (const candidate of candidates) {
            try {
                inspected = (await invoke("inspect", candidate)).objects[0]
                break
            } catch {
                // 继续尝试下一个候选路径
            }
        }
        if (!inspected) {
            // 兜底：按材质名全局搜（角色材质可能挂到公共 Suit 目录下），
            // 同名时优先角色自己的目录，避免撞到别的角色的同号材质
            let found: string | undefined
            for (const name of uniqueNames) {
                found = await searchAsset(`**/${name}.*`, characterDirectory(entry)?.split("/").at(-1))
                if (found) break
            }
            if (found) {
                try {
                    inspected = (await invoke("inspect", found)).objects[0]
                } catch {
                    inspected = undefined
                }
            }
        }
        if (!inspected) {
            // 材质缺失也必须留一份元数据：渲染器按元数据逐材质重建，缺一个就整只模型不渲染。
            // 退化成不染色的扁平色，材质本身仍可见。
            console.warn(`  material not found, using flat color: ${material.name}`)
            material.pbrMetallicRoughness = { baseColorFactor: [0.8, 0.8, 0.8, 1], metallicFactor: 0, roughnessFactor: 0.8 }
            material.extras = {
                dnaColorize: { version: 1, kind: "base", role: "character", parent: "", vectors: {}, scalars: {}, textures: {} },
            }
            continue
        }
        const vectors = Object.fromEntries(inspected.vectors.map((v: any) => [v.name, [v.r, v.g, v.b]]))
        const scalars = Object.fromEntries(inspected.scalars.map((v: any) => [v.name, v.value]))
        const textures: Record<string, number> = {}
        for (const texture of inspected.textures) {
            const index = await embed(texture.objectPath)
            if (index !== undefined) textures[texture.name] = index
        }
        const parent = inspected.parent ?? ""
        const kind = parent.includes("ShopSkin")
            ? "packed"
            : parent.includes("M_Player_Skin")
              ? "stocking"
              : parent.includes("Hair_Tint")
                ? "hair"
                : parent.includes("HairPart")
                  ? "hairPart"
                  : "base"
        // 默认染色：材质实例自己的参数就是游戏里的默认外观，**优先保留**；
        // 数据表只补材质没写的槽（如 `暗部颜色`、部分 `自发光颜色`）。
        // 反过来用表覆盖会把材质精心调过的颜色冲掉，整只皮肤配色失真。
        const meshHint = material.name.replace(/^MI_/, "").replace(/^Com_/, "")
        const fillFromRow = (row: Record<string, any> | undefined) => {
            for (const [name, value] of Object.entries(row ?? {})) {
                if (name === "菲涅尔指数") {
                    if (scalars[name] === undefined) scalars[name] = value as number
                    continue
                }
                if (!value || typeof value !== "object" || !("R" in value)) continue
                const key = name === "染色7" ? "自发光颜色" : name.split("_")[0]
                if (vectors[key] !== undefined) continue
                const color = value as { R: number; G: number; B: number }
                vectors[key] = [color.R, color.G, color.B]
            }
        }
        if (kind === "packed" || kind === "stocking") fillFromRow(tintRowFor(meshHint))
        if (kind === "hair" || kind === "hairPart") fillFromRow(hairRowFor(meshHint))
        const base = textures.时装BaseClor ?? textures.颜色贴图
        if (base === undefined) {
            // 同样不能留空元数据，否则渲染器逐材质重建时整只模型失败
            console.warn(`  material has no base texture, using flat color: ${material.name}`)
            material.pbrMetallicRoughness = { baseColorFactor: [0.8, 0.8, 0.8, 1], metallicFactor: 0, roughnessFactor: 0.75 }
            material.extras = {
                dnaColorize: { version: 1, kind: "base", role: "character", parent, vectors, scalars, textures: {} },
            }
            continue
        }
        material.pbrMetallicRoughness = { baseColorTexture: { index: base }, metallicFactor: 0, roughnessFactor: 0.75 }
        material.alphaMode = inspected.blendMode === "BLEND_Translucent" ? "BLEND" : "MASK"
        material.alphaCutoff = inspected.opacityMaskClipValue ?? 0.3333
        material.doubleSided = inspected.twoSided ?? false
        material.extras = { dnaColorize: { version: 1, kind, role: "character", parent, vectors, scalars, textures } }
    }

    // 效果网格（翅膀）里的水面/能量类材质没有染色底图，渲染器只能退化成不透明纯色，
    // 会整片糊在翅膀上；这类贴片不进模型，只保留能染色的部分。
    const effectMeshNames = new Set(entry.effectMeshes.map(path => path.split("/").at(-1)))
    for (const mesh of model.json.meshes ?? []) {
        if (!effectMeshNames.has(mesh.name)) continue
        const kept = mesh.primitives.filter(primitive => {
            const material = primitive.material === undefined ? undefined : model.json.materials[primitive.material]
            const data = material?.extras?.dnaColorize
            return data?.textures?.时装BaseClor !== undefined || data?.textures?.颜色贴图 !== undefined
        })
        if (kept.length !== mesh.primitives.length)
            console.log(`  effect mesh ${mesh.name}: dropped ${mesh.primitives.length - kept.length} untextured primitive(s)`)
        mesh.primitives = kept
    }

    // 色板表不进模型：它是全局数据，已随数据包下发（`skin-colorize.data.ts`），
    // 每个 GLB 存一份会让 202 个皮肤各带同一份 2.5KB 色表。
    model.json.extras = {
        dnaColorize: {
            version: 1,
            skinId: entry.skinId,
            charId: entry.charId,
            hairId: 0,
            allowedStockingIds: [1022, 1023, 1024, 1025, 1026, 1027],
            parts: ["染色1", "染色2", "染色3", "染色4", "染色5", "染色6", "自发光颜色", "暗部颜色", "WeaponColor"],
            captureVerified: false,
        },
    }
    const cutoutBases = cutoutBaseNames(model)
    const optimization = await optimizeGlb(model, {
        textureQuality,
        lossless: name => isMaskTexture(name) || cutoutBases.has(name),
        simplifyRatio,
        simplifyRatios,
        simplifyError: Number(options.get("simplify-error") ?? 0.002),
        // 羽片是薄卡片，切线决定法线贴图的朝向；需要与游戏观感对拍时保留 TANGENT。
        dropTangent: !flags.has("keep-tangent"),
        // Wing 着色器的染色分区取自 2U 遮罩的 UV1（G=色号、R=权重），丢掉 UV1 就等于丢掉分区。
        dropExtraUvs: false,
    })
    console.log(
        `Optimized textures ${(optimization.textures.reduce((sum, row) => sum + row.before, 0) / 1048576).toFixed(2)} MiB -> ${(
            optimization.textures.reduce((sum, row) => sum + row.after, 0) / 1048576
        ).toFixed(2)} MiB`
    )
    await mkdir(dirname(output), { recursive: true })
    await Bun.write(output, writeGlb(model))
    console.log(
        `Wrote ${output} (${model.json.materials.length} materials, ${embedded.size} embedded textures, ${model.json.animations?.length ?? 0} animations)`
    )
    return output
}

const catalog = readSkinCatalog(lua)
console.log(`Found ${catalog.length} dyeable skins in the game data`)
const shopskinTint = await readTable("/Game/BluePrints/Char/DT_ShopskinTint")
const hairTint = await readTable("/Game/BluePrints/Char/DT_HairTint")

const targets = requestedSkins.length ? catalog.filter(entry => requestedSkins.includes(entry.skinId)) : catalog
if (!targets.length) throw new Error(`No matching skin: ${requestedSkins.join(", ") || "(empty catalog)"}`)

const failures: { skinId: number; error: string }[] = []
for (const entry of targets) {
    const single = options.get("out")
    const output = resolve(single ?? join(outputDir, `${entry.skinId}.glb`))
    if (single && targets.length > 1) throw new Error("--out 只能和单个 --skin 一起用")
    if (skipExisting && !single && existsSync(output)) {
        console.log(`\n=== ${entry.skinId} (${entry.tag}) === 已存在，跳过`)
        continue
    }
    try {
        await exportSkin({ entry, output, shopskinTint, hairTint })
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`导出失败 ${entry.skinId}: ${message}`)
        failures.push({ skinId: entry.skinId, error: message })
    }
}

session.close()

if (failures.length) {
    console.error(`\n${failures.length}/${targets.length} 个皮肤导出失败`)
    process.exit(1)
}
console.log(`\n完成：${targets.length} 个皮肤`)
