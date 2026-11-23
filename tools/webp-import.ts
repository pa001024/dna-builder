#!/usr/bin/env bun

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { additivePng } from "./ui-frame-alpha"
import { collectDnaSeasonImageUrls, compileFilter, matchesFilter, resolveFilterRaw, type SeasonImageSource } from "./webp-import-lib"

/**
 * webp-import
 *
 * 自动把 data 中真正引用的图片从 FModel 导出的纹理 PNG 目录转成 WebP 并复制到 public/imgs 下。
 *
 * 引用来源有两种，两者合并即为“真实引用集合”：
 *   1. 文本扫描：packages/data 里出现的 /imgs/** 字符串字面量（精确引用，如 rank 目录、占位图等）。
 *   2. 数据评估：导入实际数据层，调用 Leveled* 的 URL 生成器，
 *      枚举全部角色/武器/魔之楔/怪物/宠物/钓鱼/读物/乐谱专辑/技能等真实取值。
 *      不再用 `${icon}` 模板对源目录做通配展开，避免导入从未使用的贴图。
 *
 * 注意：形如 `/imgs/music/${icon}.webp` 的“全通配”模板无法从文本推导 basename，
 * 必须在 evaluateDataUrls 中枚举对应数据源；遗漏时脚本会按目录告警，不会静默跳过。
 *
 * PNG→WebP 使用 Bun 内置的 Bun.Image，不依赖 sharp/cwebp 等外部库。
 * 源优先用导出目录里的本地 .uasset（fmodel-cli `export-tex-file` 直读文件，不读 pak）：
 * 包路径按同名 .uasset 索引反推，产物落回导出目录（与 FModel 界面导出同布局），复跑即命中 PNG 现货。
 * 本地没有 .uasset 时才用同名 PNG 现货；两者都没有按缺失报告。
 * 旧 pak 路径（export-tex 直读、全 pak search）只在显式 `--allow-pak` 时启用，
 * 避免旧版本客户端的 pak 覆盖新客户端资产。
 * 编码规则：输出分辨率宽高均 <=256（即 256x256 以内）时用无损压缩，
 * 其余用有损编码（默认质量 90）；例外：bust/ 缩略图强制有损 q90（与现存一致）。
 * 缩放规则：
 *   bust/ 与 fashion/ 目录固定缩成 128x128 缩略图（视图只做 thumb-url，全图走 CDN）；
 *   res/ 目录下的图片按 maxHeight（默认 128）等比缩小：高度超出则缩小、不放大。
 *   命中 FULL_SIZE_RULES（按目标贴图名匹配）的 res/ 图片保持源分辨率，不参与 maxHeight 降采样，
 *   如升华装备图 T_Season_*（游戏原图 256x256，压到 128 会明显模糊）。
 *   命中 SCALE_RULES（按目标贴图名匹配）的图片按规则里的 scale 等比缩小、不放大，
 *   如拍照活动大图 T_Activity_PhotoEvent_* 按 50% 缩放。
 *   命中 FIXED_SIZE_RULES（按目标相对路径匹配）的图片固定缩到规则边长，
 *   如升华天赋图标 webp/T_Rouge_Talent_* 一律 128x128（源取 Dynamic/Image/RougeLike 512 整图）。
 *
 * 用法:
 *   bun tools/webp-import.ts                 # 增量导入缺失的 WebP
 *   bun tools/webp-import.ts --force         # 强制重新转换（覆盖已有 WebP）
 *   bun tools/webp-import.ts --dry-run       # 只统计不落盘
 *   bun tools/webp-import.ts --no-uasset     # 缺 PNG 时不调 fmodel-cli，只报缺失（旧行为）
 *   bun tools/webp-import.ts --allow-pak     # 允许 export-tex 直读 pak 与全 pak search（默认关闭）
 *   bun tools/webp-import.ts --no-uasset-first  # 回退旧行为：同名 PNG 现货优先于本地 .uasset
 *   bun tools/webp-import.ts --jobs 8        # uasset 并发导出数（默认 4）
 *   bun tools/webp-import.ts --data <dir>    # 覆盖文本扫描目录（默认 packages/data）
 *   bun tools/webp-import.ts --source <dir>  # 覆盖纹理导出目录（1.8 客户端 uasset 树，如 F:/test/EM/Content/UI/Texture）
 *   bun tools/webp-import.ts --out <dir>     # 覆盖输出目录（默认 public/imgs）
 *   bun tools/webp-import.ts --quality 90    # 覆盖 WebP 质量（默认 90）
 *   bun tools/webp-import.ts --res-max-height 128   # res 目录图片最大高度，超出等比缩小（默认 128）
 *   bun tools/webp-import.ts --filter '^res/T_Season_'   # 只处理目标相对路径匹配该正则的资源（数据源版本领先于本地 pak 时按类别导入）
 *
 * 环境变量同样生效: WEBP_IMPORT_DATA_DIR / WEBP_IMPORT_SOURCE / WEBP_IMPORT_OUT / WEBP_IMPORT_QUALITY / WEBP_IMPORT_RES_MAX_HEIGHT
 *   WEBP_IMPORT_FILTER / FMODEL_CLI / WEBP_IMPORT_JOBS
 */

type ImageRef = {
    /** 目标子目录（相对 public/imgs），如 "webp"、"rank/vx03" */
    dir: string
    /** 完整 basename（精确引用），如 "T_Head_Empty" */
    name?: string
    /** 模板引用（含 ${...}）推导出的 basename 骨架正则，如 /^T_Head_.*$/ */
    pattern?: RegExp
    /**
     * 全通配模板（占位符之外没有静态文本，如 `/imgs/music/${icon}.webp`）：
     * 既得不到精确 basename，也得不到有意义的骨架正则，只能按目标目录纳入覆盖率校验，
     * 提醒 evaluateDataUrls 必须枚举对应数据源（如乐谱专辑）。
     */
    wildcard?: boolean
    /** 引用来源描述（文件:行号） */
    source: string
}

type SourceFile = {
    /** 相对导出目录的路径 */
    relPath: string
    /** 绝对路径 */
    absPath: string
}

type ConvertTask = {
    /** 目标相对路径（相对 public/imgs），如 "webp/T_Head_1001.webp" */
    targetRelPath: string
    /** 源 PNG 绝对路径 */
    sourceAbsPath: string
    /** 源 PNG 相对导出目录的路径，用于日志 */
    sourceRelPath: string
    /** 引用了它的位置（首处） */
    referencedFrom: string
}

type UassetTask = {
    /** 目标相对路径（相对 public/imgs） */
    targetRelPath: string
    /** 游戏内包路径（不含扩展名），如 "EM/Content/UI/Texture/.../T_XXX"，供 export-tex 用 */
    uassetPkg: string
    /** 本地 .uasset 绝对路径（本地索引命中时给出；缺失时只能走 --allow-pak 的 pak 路径） */
    uassetAbsPath?: string
    /** 引用了它的位置（首处） */
    referencedFrom: string
}

type IconItem = { icon?: string }
/** 带配图的条目（调查墙线索 / 剧情回顾）：pic1、pic2 都已是完整 T_StringBoard_* 贴图名 */
type PicItem = { pic1?: string; pic2?: string }
type ClueTabLike = { pages: { clues: PicItem[] }[] }
type ReviewPageLike = { chains: { main: PicItem[]; side: PicItem[] }[] }
/** 百科大类 / 条目：大类 icon 与条目 img 都已是完整 T_Tab_* / T_Encyclopedia_* 贴图名 */
type WikiMainTypeLike = { icon?: string; subTypes: { entries: { img?: string }[] }[] }
type CharLike = IconItem & {
    属性?: string
    技能?: IconItem[]
    同律武器?: (IconItem & { 技能?: IconItem[] })[]
    /** 特质（派遣标签）：icon 已是完整 T_Dispatch_* 贴图名 */
    特质?: IconItem[]
}
type WeaponLike = IconItem & {
    类型?: string[]
    技能?: IconItem[]
    熔炉?: { 技能?: IconItem[] }[]
}
type UrlBuilder = { url: (icon?: string) => string }
type LeveledCharLike = UrlBuilder & { elementUrl: (element: string) => string }
type LeveledWeaponLike = UrlBuilder & { typeUrl: (type: string) => string }

type ResizeInfo = {
    /** 原始宽 */
    originalWidth: number
    /** 原始高 */
    originalHeight: number
    /** 缩小后宽 */
    width: number
    /** 缩小后高 */
    height: number
    /** 缩小原因（用于日志），如 "res" / "50%" */
    reason: string
}

/** 仓库根：本文件位于 `<root>/tools/` 下，与调用方 cwd 无关 */
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const args = process.argv.slice(2)
const FORCE = args.includes("--force")
const DRY_RUN = args.includes("--dry-run")
const QUALITY = Number(getArgValue("--quality") ?? process.env.WEBP_IMPORT_QUALITY ?? "90")
/** res 目录图片的最大高度：超出时等比缩小，不放大（默认 128） */
const RES_MAX_HEIGHT = Number(getArgValue("--res-max-height") ?? process.env.WEBP_IMPORT_RES_MAX_HEIGHT ?? "128")
/**
 * 目标相对路径过滤器（正则）：只处理匹配的资源。
 * 数据源版本领先于本地 pak 时，全量跑会为大量尚未落地的资源做无谓的 pak 搜索，按类别导入用它收口。
 */
const FILTER = resolveFilterRaw(getArgValue("--filter"), process.env.WEBP_IMPORT_FILTER)
const { regex: FILTER_REGEX, error: FILTER_ERROR } = compileFilter(FILTER)

/**
 * 无损压缩阈值：输出分辨率宽和高均 <= 该值时用无损 WebP（小图标经不起有损压缩的 ringing）。
 * 例外：bust/ 缩略图强制有损 q90（与现存缩略图一致，大图无损版走 CDN，不管本地）。
 */
const LOSSLESS_MAX_DIM = 256

/** bust/ 与 fashion/ 目录是 128x128 缩略图（视图里只做 thumb-url，全图走 CDN），一律缩到该尺寸 */
const THUMB_SIZE = 128

/**
 * 是否缩略图目标（相对 public/imgs 的路径以 bust/ 或 fashion/ 开头）。
 */
function isThumb(targetRelPath: string): boolean {
    return targetRelPath.startsWith("bust/") || targetRelPath.startsWith("fashion/")
}

/**
 * 按目标贴图名匹配的等比缩小规则：命中者按 scale 缩小、不放大。
 * 目前是拍照活动相机大图（2048x1024 级别展示图），50% 缩放即可。
 */
const SCALE_RULES: { pattern: RegExp; scale: number }[] = [{ pattern: /^T_Activity_PhotoEvent_\d+$/i, scale: 0.5 }]

/**
 * 固定尺寸目标（按目标相对路径匹配）：命中者一律缩到指定边长，与源分辨率无关。
 * 升华天赋图标在游戏里是 128px 图集贴图：Dynamic/Image/RougeLike 是 512 整图（字形占满画布），
 * 直接用 512 会让 24~64px 的图标位里字形偏小，必须缩到 128。
 */
const FIXED_SIZE_RULES: { pattern: RegExp; size: number; reason: string }[] = [
    { pattern: /^webp\/T_Rouge_Talent_/i, size: THUMB_SIZE, reason: "rouge天赋图标" },
]

/**
 * 升华天赋图标的源优先级（按包路径片段匹配，越靠前越优先）。
 * 游戏内图标取 Dynamic/Image/RougeLike 的 512 整图；Dynamic/Atlas/RougeLike 是 128 图集版本，
 * 字形只占画布约 40% 且内容与整图不同，只在 Image 缺失时兜底。
 */
const ROUGE_TALENT_SOURCE_ORDER = ["/dynamic/image/rougelike/", "/dynamic/atlas/rougelike/"]

/**
 * res/ 下的全尺寸例外（按目标贴图名匹配）：保持源分辨率，不参与 RES_MAX_HEIGHT 降采样。
 * 升华装备图 T_Season_* 的游戏原始贴图为 256x256，缩到 128 会明显模糊；
 * 256 仍落在无损阈值内，全尺寸导入不会增加有损风险。
 */
const FULL_SIZE_RULES: RegExp[] = [/^T_Season_/i]

const dataDir = getArgValue("--data") ?? process.env.WEBP_IMPORT_DATA_DIR ?? path.join(rootDir, "packages", "data")
const publicImgsDir = getArgValue("--out") ?? process.env.WEBP_IMPORT_OUT ?? path.join(rootDir, "apps", "web", "public", "imgs")
const sourceRoot = resolveSourceRoot(getArgValue("--source") ?? process.env.WEBP_IMPORT_SOURCE)
/** fmodel-cli 路径：本地 .uasset 解码（export-tex-file）用 */
const FMODEL_CLI = process.env.FMODEL_CLI ?? "D:/dev/fmodel-mcp/Cli/bin/publish/fmodel-cli.exe"
/** 缺 PNG 时不调 fmodel-cli，只报缺失 */
const NO_UASSET = args.includes("--no-uasset")
/** 允许读 pak：export-tex 直读与全 pak search 只在显式开启时使用（默认的本地 .uasset 解码不读 pak） */
const ALLOW_PAK = args.includes("--allow-pak")
/** 本地 .uasset 优先于同名 PNG 现货；--no-uasset-first 回退旧的 PNG 优先行为 */
const UASSET_FIRST = !args.includes("--no-uasset-first")
/** uasset 并发导出数：batch 会话是串行的，开多个会话并行 */
const JOBS = Math.max(1, Number(getArgValue("--jobs") ?? process.env.WEBP_IMPORT_JOBS ?? "4") || 4)
/**
 * 称号框贴图清单（webp 文件名 → 游戏内包路径），由 tools/import-title-frame.ts 生成。
 *
 * 称号框贴图遇到同名冲突会改写成带父目录前缀的名字，basename 与源 PNG 对不上，
 * 必须靠这份清单按“包路径”去导出目录里定位，否则会被报成 349 条缺失里的 73 条。
 */
const TITLE_FRAME_MANIFEST = path.join(rootDir, "apps", "web", "src", "utils", "title-frame", "title-frame-textures.json")

/**
 * 收集指向项目根目录的所有路径别名。
 *
 * bun 会把 cwd 的 junction/符号链接解析成物理路径（如 D:\dev\dna-builder → E:\dev\dna-builder），
 * 而同级资源目录（dna-unpack）可能只存在于链接形式的盘上。
 * 按各盘符 + 相对路径反查：realpath 回同一物理目录的路径形式都视为项目别名。
 * @param realRoot 项目根目录（bun 解析后的物理路径）
 * @returns 所有指向同一目录的绝对路径（含 realRoot 本身）
 */
function collectProjectRootAliases(realRoot: string): string[] {
    const aliases = new Set<string>([realRoot])
    if (process.platform !== "win32") {
        return [...aliases]
    }

    const rel = path.relative(path.parse(realRoot).root, realRoot)
    for (let code = 65; code <= 90; code++) {
        const candidate = path.join(`${String.fromCharCode(code)}:\\`, rel)
        if (candidate.toLowerCase() === realRoot.toLowerCase()) {
            continue
        }
        try {
            if (fs.realpathSync(candidate).toLowerCase() === realRoot.toLowerCase()) {
                aliases.add(candidate)
            }
        } catch {
            // 盘符不存在或不可访问，跳过
        }
    }
    return [...aliases]
}

/**
 * 探测纹理源目录：优先用户显式指定的 1.8 客户端 uasset 树，其次按项目根的所有路径别名
 * （junction 解析前后的形式）找同级 dna-unpack 下的 1.8 解包目录。
 * 旧的 `Fmodel/Output/Exports` 导出目录已废弃，不再作为候选。
 * @param override 用户显式指定的目录
 * @returns 存在的源目录
 */
function resolveSourceRoot(override?: string): string {
    const unpackRoots = collectProjectRootAliases(rootDir).map(alias => path.join(alias, ".."))
    const candidates = [
        override,
        ...unpackRoots.map(unpackRoot => path.join(unpackRoot, "dna-unpack", "uasset-1.8", "EM", "Content", "UI", "Texture")),
    ]

    const existing = candidates.filter((value): value is string => Boolean(value)).find(value => fs.existsSync(value))
    if (existing) {
        return existing
    }

    throw new Error(
        `未找到 1.8 客户端 uasset 纹理目录，请用 --source 指定（如 F:/test/EM/Content/UI/Texture）。已尝试:\n${candidates.map(value => `  - ${value}`).join("\n")}`
    )
}

/**
 * 解析命令行参数值。
 * @param flag 参数名
 * @returns 参数值；未提供时返回 undefined
 */
function getArgValue(flag: string): string | undefined {
    const index = args.indexOf(flag)
    return index >= 0 ? args[index + 1] : undefined
}

/**
 * 转义正则表达式中的文本字面量。
 * @param value 待转义文本
 * @returns 可用于正则表达式的字面量文本
 */
function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * 规范化相对路径为 posix 风格。
 * @param filePath 原始路径
 * @returns posix 风格相对路径
 */
function toPosix(filePath: string): string {
    return filePath.replaceAll(path.sep, "/")
}

/**
 * 递归收集目录下匹配后缀的文件。
 * @param dirPath 目录路径
 * @param suffixes 后缀列表（小写）
 * @param relDir 相对目录
 * @returns 文件绝对路径列表
 */
function walkFiles(dirPath: string, suffixes: string[], relDir = ""): string[] {
    if (!fs.existsSync(dirPath)) {
        return []
    }

    const files: string[] = []
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        // 第三方依赖里没有 /imgs/** 引用，跳过（还能避开 pnpm 那种名字以 .js 结尾的目录 symlink）
        if (entry.name === "node_modules") {
            continue
        }
        const absPath = path.join(dirPath, entry.name)
        const relPath = relDir ? path.join(relDir, entry.name) : entry.name
        // entry.isDirectory() 对 symlink 返回 false，补一次 stat 跟随链接判断
        let isDir = entry.isDirectory()
        if (!isDir && entry.isSymbolicLink()) {
            try {
                isDir = fs.statSync(absPath).isDirectory()
            } catch {
                continue
            }
        }
        if (isDir) {
            files.push(...walkFiles(absPath, suffixes, relPath))
        } else if (suffixes.some(suffix => entry.name.toLowerCase().endsWith(suffix))) {
            files.push(absPath)
        }
    }
    return files
}

/**
 * 解析单行中的 /imgs/** 引用（字面量或 ${...} 模板）。
 * @param raw 匹配到的完整引用文本，如 "/imgs/webp/T_Head_${icon}.webp"
 * @returns 引用信息；无法解析时返回 null
 */
function parseRef(raw: string): Omit<ImageRef, "source"> | null {
    const lastSlash = raw.lastIndexOf("/")
    const dir = raw.slice("/imgs/".length, lastSlash)
    const basenamePart = raw.slice(lastSlash + 1, raw.length - ".webp".length)
    if (!dir || !basenamePart) {
        return null
    }

    if (!basenamePart.includes("${")) {
        return { dir, name: basenamePart }
    }

    // 去掉 ${...} 占位符后的静态文本；为空表示全通配（如 ${icon}.webp）
    const staticText = basenamePart.replace(/\$\{[^}]*\}/g, "")
    if (!staticText) {
        // 全通配无法从文本推导 basename，精确引用只能由 evaluateDataUrls 枚举数据得到；
        // 这里仍保留目标目录，用于后续“该目录是否被数据评估覆盖”的校验，
        // 避免像 /imgs/music/${icon}.webp（乐谱封面）那样被静默丢弃、永远不产生任务。
        return { dir, wildcard: true }
    }

    // 把 ${...} 占位符替换成 .*，静态片段转义，得到 basename 骨架正则（忽略大小写以匹配源文件名）
    const patternSource = basenamePart
        .split(/\$\{[^}]*\}/)
        .map(escapeRegExp)
        .join(".*")
    return { dir, pattern: new RegExp(`^${patternSource}$`, "i") }
}

/**
 * 扫描目录，收集所有图片引用（精确 + 模板，模板仅作统计与覆盖校验）。
 * @param dirPath 扫描目录
 * @returns 引用列表
 */
function collectRefs(dirPath: string): ImageRef[] {
    const refs: ImageRef[] = []
    const imgRefRegex = /\/imgs\/[A-Za-z0-9_./${}[\]:-]+?\.webp/g
    // 测试文件里的引用是构造出来的夹具（如 /imgs/titleframe/fake.webp），不是运行时引用
    const dataFiles = walkFiles(dirPath, [".ts", ".js", ".mjs", ".vue"]).filter(filePath => !/\.test\.ts$/.test(filePath))

    for (const filePath of dataFiles) {
        const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/)
        const relFile = toPosix(path.relative(rootDir, filePath))
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            imgRefRegex.lastIndex = 0
            let match: RegExpExecArray | null
            while ((match = imgRefRegex.exec(lines[lineIndex]))) {
                const parsed = parseRef(match[0])
                if (parsed) {
                    refs.push({ ...parsed, source: `${relFile}:${lineIndex + 1}` })
                }
            }
        }
    }

    return refs
}

/**
 * 递归收集对象树中所有 icon 字符串值（用于 icon 嵌套在子节点里的数据，如子区域的传送点）。
 * @param value 待遍历的数据
 * @param out 收集结果
 */
function collectIconValues(value: unknown, out: Set<string>): void {
    if (Array.isArray(value)) {
        for (const item of value) {
            collectIconValues(item, out)
        }
        return
    }
    if (!value || typeof value !== "object") {
        return
    }

    const record = value as Record<string, unknown>
    for (const [key, child] of Object.entries(record)) {
        if (key === "icon" && typeof child === "string" && child) {
            out.add(child)
        } else {
            collectIconValues(child, out)
        }
    }
}

/**
 * 评估数据层，得到真实引用的图片 URL 集合。
 *
 * 通过导入实际数据并调用 Leveled* 的 URL 生成器，得到与运行时一致的精确引用，
 * 避免对源目录做通配展开导入未使用贴图。
 * @returns /imgs/** 完整 URL 集合
 */
async function evaluateDataUrls(): Promise<Set<string>> {
    const urls = new Set<string>()
    const appDataDir = path.join(rootDir, "packages", "data")
    const loadModule = <T>(rel: string): Promise<T> => import(pathToFileURL(path.join(appDataDir, rel)).href) as Promise<T>

    const { default: charData } = await loadModule<{ default: CharLike[] }>("d/char.data.ts")
    const { default: weaponData } = await loadModule<{ default: WeaponLike[] }>("d/weapon.data.ts")
    const { default: modData } = await loadModule<{ default: IconItem[] }>("d/mod.data.ts")
    const { default: monsterData } = await loadModule<{ default: IconItem[] }>("d/monster.data.ts")
    const { default: petData } = await loadModule<{ default: IconItem[] }>("d/pet.data.ts")
    const { fishs } = await loadModule<{ fishs: IconItem[] }>("d/fish.data.ts")
    const { booksData } = await loadModule<{ booksData: IconItem[] }>("d/book.data.ts")
    const { resourceData: resourceList } = await loadModule<{ resourceData: IconItem[] }>("d/resource.data.ts")
    const { iconticketData: iconTicketList } = await loadModule<{ iconticketData: IconItem[] }>("d/iconticket.data.ts")
    const { mountData } = await loadModule<{ mountData: IconItem[] }>("d/mount.data.ts")
    const { headSculptureData } = await loadModule<{ headSculptureData: IconItem[] }>("d/headsculpture.data.ts")
    const { charAccessoryData, weaponAccessoryData, weaponSkinData, hairData, headFrameData, skinData } = await loadModule<{
        charAccessoryData: IconItem[]
        weaponAccessoryData: IconItem[]
        weaponSkinData: IconItem[]
        hairData: IconItem[]
        headFrameData: IconItem[]
        skinData: (IconItem & { bust?: string })[]
    }>("d/accessory.data.ts")
    const { default: rewardList } = await loadModule<{ default: IconItem[] }>("d/reward.data.ts")
    const { default: reputationList } = await loadModule<{ default: IconItem[] }>("d/reputation.data.ts")
    const { questChainData } = await loadModule<{ questChainData: IconItem[] }>("d/questchain.data.ts")
    const { hardBossData } = await loadModule<{ hardBossData: IconItem[] }>("d/hardboss.data.ts")
    const { subRegionData } = await loadModule<{ subRegionData: IconItem[] }>("d/subregion.data.ts")
    const { extractionTreasureData } = await loadModule<{ extractionTreasureData: IconItem[] }>("d/solotreasure.data.ts")
    const { skinGachaTabs } = await loadModule<{ skinGachaTabs: IconItem[] }>("d/skingacha.data.ts")
    const { musicScoreData } = await loadModule<{ musicScoreData: IconItem[] }>("d/music.data.ts")
    const { eventData } = await loadModule<{
        eventData: { photoTasks?: { photoView?: string }[]; hardBossEvent?: { bosses: IconItem[] } }[]
    }>("d/event.data.ts")

    const { LeveledChar } = await loadModule<{ LeveledChar: LeveledCharLike }>("leveled/LeveledChar.ts")
    const { LeveledWeapon } = await loadModule<{ LeveledWeapon: LeveledWeaponLike }>("leveled/LeveledWeapon.ts")
    const { LeveledMod } = await loadModule<{ LeveledMod: UrlBuilder }>("leveled/LeveledMod.ts")
    const { LeveledMonster } = await loadModule<{ LeveledMonster: UrlBuilder }>("leveled/LeveledMonster.ts")
    const { LeveledPet } = await loadModule<{ LeveledPet: UrlBuilder }>("leveled/LeveledPet.ts")
    // 魔灵潜质（特质）目录：条目自带图标地址（traitIconUrl），无需在视图里拼模板
    const { getPetTraits } = await loadModule<{ getPetTraits: () => { name: string; url: string }[] }>("petTrait.ts")
    const petTraits = getPetTraits()
    const { LeveledSkill } = await loadModule<{ LeveledSkill: UrlBuilder }>("leveled/LeveledSkill.ts")
    const { LeveledSkillWeapon } = await loadModule<{ LeveledSkillWeapon: UrlBuilder }>("leveled/LeveledSkillWeapon.ts")

    // 角色: 头像 / 属性 / 技能 / 同律武器
    for (const char of charData) {
        if (char.icon) {
            urls.add(LeveledChar.url(char.icon))
        }
        if (char.属性) {
            urls.add(LeveledChar.elementUrl(char.属性))
        }
        for (const skill of char.技能 ?? []) {
            if (skill.icon) {
                urls.add(LeveledSkill.url(skill.icon))
            }
        }
        for (const skillWeapon of char.同律武器 ?? []) {
            if (skillWeapon.icon) {
                urls.add(LeveledSkillWeapon.url(skillWeapon.icon))
            }
        }
        // 特质（派遣标签）: 视图（DBCharDetailItem 特质板块）按 `/imgs/webp/${icon}.webp` 直接引用
        // （icon 已是完整 T_Dispatch_* 贴图名）
        for (const trait of char.特质 ?? []) {
            if (trait.icon) {
                urls.add(`/imgs/webp/${trait.icon}.webp`)
            }
        }
    }

    // 武器: 头像 / 类型 / 技能
    for (const weapon of weaponData) {
        if (weapon.icon) {
            urls.add(LeveledWeapon.url(weapon.icon))
        }
        for (const type of weapon.类型 ?? []) {
            urls.add(LeveledWeapon.typeUrl(type))
        }
    }

    // 魔之楔 / 怪物 / 宠物
    for (const mod of modData) {
        if (mod.icon) {
            urls.add(LeveledMod.url(mod.icon))
        }
    }
    for (const monster of monsterData) {
        if (monster.icon) {
            urls.add(LeveledMonster.url(monster.icon))
        }
    }
    for (const pet of petData) {
        if (pet.icon) {
            urls.add(LeveledPet.url(pet.icon))
        }
    }

    // 魔灵潜质（特质）: 视图（DBPetDetailItem「魔灵潜质来源」、DBPetListView 潜质页签）与
    // petTrait.traitIconUrl 统一按 `/imgs/webp/T_Armory_Pet_Attr_${icon}.webp` 引用。
    // 该引用在视图里是 ${icon} 全通配模板，文本扫描既得不到精确 basename 也得不到骨架正则，
    // 必须在此枚举特质数据才能生成真实任务（否则整批潜质图标不会导入）。
    for (const trait of petTraits) {
        urls.add(trait.url)
    }

    // 技能: 按来源区分两种渲染方式
    //  - 角色侧技能（技能/子技能/同律武器技能）: 数据里是短名，需加 T_Skill_ 前缀
    //  - 武器侧技能（武器/熔炉锻造技能）: 数据里已是完整 T_ 贴图名，直接作为 basename
    //    （对应 DBWeaponDetailItem 中 `/imgs/webp/${skill.icon}.webp` 的直接引用方式）
    // 注意: 用 collectIconValues 递归收集技能子树里的全部 icon（含 子技能 等嵌套容器）
    const charSkillIcons = new Set<string>()
    for (const char of charData) {
        for (const skill of char.技能 ?? []) {
            collectIconValues(skill, charSkillIcons)
        }
        for (const skillWeapon of char.同律武器 ?? []) {
            for (const skill of skillWeapon.技能 ?? []) {
                collectIconValues(skill, charSkillIcons)
            }
        }
    }
    for (const icon of charSkillIcons) {
        urls.add(LeveledSkill.url(icon))
    }

    const weaponSkillIcons = new Set<string>()
    for (const weapon of weaponData) {
        for (const skill of weapon.技能 ?? []) {
            collectIconValues(skill, weaponSkillIcons)
        }
        for (const forge of weapon.熔炉 ?? []) {
            for (const skill of forge.技能 ?? []) {
                collectIconValues(skill, weaponSkillIcons)
            }
        }
    }
    for (const icon of weaponSkillIcons) {
        urls.add(`/imgs/webp/${icon}.webp`)
    }

    // 钓鱼 / 读物
    for (const fish of fishs) {
        if (fish.icon) {
            urls.add(`/imgs/res/T_Fish_${fish.icon}.webp`)
        }
    }
    for (const book of booksData) {
        if (book.icon) {
            urls.add(`/imgs/res/${book.icon}.webp`)
        }
    }

    // 资源 / 深境罗盘: 视图（ResourceCostItem/DBResourceDetailItem/DBReputationDetailItem 等）
    // 统一按 `/imgs/res/${icon}.webp` 直接引用（icon 已是完整 T_ 贴图名）
    for (const resource of resourceList) {
        if (resource.icon) {
            urls.add(`/imgs/res/${resource.icon}.webp`)
        }
    }
    for (const ticket of iconTicketList) {
        if (ticket.icon) {
            urls.add(`/imgs/res/${ticket.icon}.webp`)
        }
    }

    // 坐骑: 视图（ShopItem）按 `/imgs/res/T_Icon_${icon}.webp` 引用（icon 是 Mounts_ 短名）
    for (const mount of mountData) {
        if (mount.icon) {
            urls.add(`/imgs/res/T_Icon_${mount.icon}.webp`)
        }
    }

    // 头像雕塑: 视图按 `/imgs/webp/${icon}.webp` 直接引用（icon 已是完整 T_Head_* 名）
    for (const head of headSculptureData) {
        if (head.icon) {
            urls.add(`/imgs/webp/${head.icon}.webp`)
        }
    }

    // 头像框: 视图按 `/imgs/headframe/${icon}.webp` 直接引用（icon 是 T_Head_Frame* 名）
    for (const frame of headFrameData) {
        if (frame.icon) {
            urls.add(`/imgs/headframe/${frame.icon}.webp`)
        }
    }

    // 饰品（角色/武器/武器皮肤/发型/皮肤）: 视图经 resolveSkinIconUrl 引用
    // 规则: T_Head_ 开头 → /imgs/webp/，其余 → /imgs/fashion/
    const allAccessories = [...charAccessoryData, ...weaponAccessoryData, ...weaponSkinData, ...hairData, ...skinData]
    for (const accessory of allAccessories) {
        if (accessory.icon) {
            urls.add(accessory.icon.startsWith("T_Head_") ? `/imgs/webp/${accessory.icon}.webp` : `/imgs/fashion/${accessory.icon}.webp`)
        }
    }

    // 皮肤立绘: 视图（DBCharDetailItem 经 ImagePreview）按 `/imgs/bust/${skin.bust}.webp` 直接引用
    // （bust 已是完整 T_Bust_* 贴图名，仅确有立绘资源的皮肤才有该字段）。
    // bust 在数据与视图里都不含 /imgs/ 前缀，文本扫描抓不到，必须在此枚举，
    // 否则 bust/ 目录永远没有任务（只有全通配模板警告）。
    for (const skin of skinData) {
        if (skin.bust) {
            urls.add(`/imgs/bust/${skin.bust}.webp`)
        }
    }

    // 奖励: 视图（ShopItem）按 `/imgs/res/${icon}.webp` 直接引用
    // 仅收录形如贴图名的值（含下划线），排除 "Resource" 等语义字段
    for (const reward of rewardList) {
        if (reward.icon?.includes("_")) {
            urls.add(`/imgs/res/${reward.icon}.webp`)
        }
    }

    // 声望 / 硬核首领 / 任务链: 视图统一按 `/imgs/webp/${icon}.webp` 直接引用
    for (const reputation of reputationList) {
        if (reputation.icon) {
            urls.add(`/imgs/webp/${reputation.icon}.webp`)
        }
    }
    for (const boss of hardBossData) {
        if (boss.icon) {
            urls.add(`/imgs/webp/${boss.icon}.webp`)
        }
    }
    for (const questChain of questChainData) {
        if (questChain.icon) {
            urls.add(`/imgs/webp/${questChain.icon}.webp`)
        }
    }

    // 子区域（含嵌套的传送点 icon）: 视图（MapTool）按 T_Gp_ 前缀 → /imgs/tp/，其余 → /imgs/res/
    const subRegionIcons = new Set<string>()
    collectIconValues(subRegionData, subRegionIcons)
    for (const icon of subRegionIcons) {
        urls.add(icon.startsWith("T_Gp_") ? `/imgs/tp/${icon}.webp` : `/imgs/res/${icon}.webp`)
    }

    // 孤域寻宝（提取宝藏）: 视图（DBSoloTreasureView）按 `/imgs/res/${icon}.webp` 引用
    for (const treasure of extractionTreasureData) {
        if (treasure.icon) {
            urls.add(`/imgs/res/${treasure.icon}.webp`)
        }
    }

    // 乐谱专辑封面: 视图（DBMusicListView / DBMusicDetailItem / DBResourceDetailItem 的乐谱卡片）
    // 统一按 `/imgs/music/${icon}.webp` 引用（icon 已是完整 T_Piano_Music* 贴图名）。
    // 该引用在视图里是 ${icon} 全通配模板，文本扫描既得不到精确 basename 也得不到骨架正则，
    // 必须在此枚举专辑数据才能生成真实任务。
    for (const album of musicScoreData) {
        if (album.icon) {
            urls.add(`/imgs/music/${album.icon}.webp`)
        }
    }

    // 万华（皮肤抽卡）页签 Banner: 视图（SkinGachaView 万华模拟页面）左侧卡池列表与
    // 背景回退大图统一按 `/imgs/webp/${tab.icon}.webp` 直接引用（icon 已是完整 T_Gacha_PoolBanner_* 名）。
    // 该引用在视图里是 ${icon} 模板，文本扫描只能得到骨架正则，必须在此枚举页签数据才能生成真实任务。
    for (const tab of skinGachaTabs) {
        if (tab.icon) {
            urls.add(`/imgs/webp/${tab.icon}.webp`)
        }
    }

    // 活动拍照任务目标图: 视图（DBEventDetailItem）按 `/imgs/webp/${photoView}.webp` 直接引用
    // （photoView 已是完整 T_Activity_PhotoEvent_* 贴图名）。
    // photoView 在数据与视图里都不含 /imgs/ 前缀，文本扫描抓不到，必须在此枚举活动数据。
    for (const event of eventData) {
        for (const task of event.photoTasks ?? []) {
            if (task.photoView) {
                urls.add(`/imgs/webp/${task.photoView}.webp`)
            }
        }
        // 永恒梦魇活动 Boss 头图: 视图（HardBossEventItem.getBossIcon）按 `/imgs/webp/${boss.icon}.webp` 直接引用
        // （icon 已是完整 T_Permanent_HardBoss_* 贴图名）。
        // 内联在 eventData.hardBossEvent.bosses 里，与 hardBossData 不是同一份表（如“神秘怪物”只存在于活动表），
        // 文本扫描抓不到，必须在此枚举，否则活动 Boss 头图不会导入。
        for (const boss of event.hardBossEvent?.bosses ?? []) {
            if (boss.icon) {
                urls.add(`/imgs/webp/${boss.icon}.webp`)
            }
        }
    }

    // 调查墙线索板 / 剧情回顾配图: 视图（DBClueDetailItem / DBReviewDetailItem 经 DBStringBoardPlate）
    // 按 `/imgs/webp/${pic}.webp` 直接引用（pic1/pic2 已是完整 T_StringBoard_* 贴图名）。
    // pic1/pic2 在数据与视图里都不含 /imgs/ 前缀，文本扫描抓不到，必须在此枚举数据。
    const { clueData } = await loadModule<{ clueData: ClueTabLike[] }>("d/clue.data.ts")
    const { reviewData } = await loadModule<{ reviewData: ReviewPageLike[] }>("d/review.data.ts")
    for (const tab of clueData) {
        for (const page of tab.pages) {
            for (const clue of page.clues) {
                for (const pic of [clue.pic1, clue.pic2]) {
                    if (pic) {
                        urls.add(`/imgs/webp/${pic}.webp`)
                    }
                }
            }
        }
    }
    for (const page of reviewData) {
        for (const chain of page.chains) {
            for (const review of [...chain.main, ...chain.side]) {
                for (const pic of [review.pic1, review.pic2]) {
                    if (pic) {
                        urls.add(`/imgs/webp/${pic}.webp`)
                    }
                }
            }
        }
    }

    // 游戏内百科配图与页签图标: 视图（DBWiki*）按 `/imgs/webp/${img}.webp` 直接引用
    // （img / icon 已是完整 T_Encyclopedia_* / T_Tab_* 贴图名，数据与视图里不含 /imgs/ 前缀）。
    const { wikiData } = await loadModule<{ wikiData: WikiMainTypeLike[] }>("d/wiki.data.ts")
    for (const mainType of wikiData) {
        if (mainType.icon) {
            urls.add(`/imgs/webp/${mainType.icon}.webp`)
        }

        for (const subType of mainType.subTypes) {
            for (const entry of subType.entries) {
                if (entry.img) {
                    urls.add(`/imgs/webp/${entry.img}.webp`)
                }
            }
        }
    }

    // 升华（DNASeason）资料库: DBTranscendence* 与升华构筑直接按 `/imgs/webp|res/${icon}.webp` 引用，
    // 这四张表不在上面的通用数据枚举里，文本扫描只能看到 `${icon}` 模板，必须在此枚举。
    //   赛季主图 / 委托图、掉落加成主图标与迷你图标、螺旋挑战图标 → /imgs/webp
    //   装备基础名 / 唯一装 / 生成组 → /imgs/res
    //   进度阶段 / 天赋节点 → /imgs/webp
    const { seasons: seasonList, buffTypes: seasonBuffTypes } =
        await loadModule<Pick<SeasonImageSource, "seasons" | "buffTypes">>("d/dnaseason.data.ts")
    const {
        baseNames: seasonBaseNames,
        uniqueEquips: seasonUniqueEquips,
        generateGroups: seasonGenerateGroups,
    } = await loadModule<Pick<SeasonImageSource, "baseNames" | "uniqueEquips" | "generateGroups">>("d/dnaseasonequip.data.ts")
    const { stages: seasonStages, talents: seasonTalents } =
        await loadModule<Pick<SeasonImageSource, "stages" | "talents">>("d/dnaseasonprogress.data.ts")
    const { challenges: seasonChallenges } = await loadModule<Pick<SeasonImageSource, "challenges">>("d/dnaseasonrift.data.ts")

    for (const url of collectDnaSeasonImageUrls({
        seasons: seasonList,
        buffTypes: seasonBuffTypes,
        baseNames: seasonBaseNames,
        uniqueEquips: seasonUniqueEquips,
        generateGroups: seasonGenerateGroups,
        stages: seasonStages,
        talents: seasonTalents,
        challenges: seasonChallenges,
    })) {
        urls.add(url)
    }

    // 过滤异常插值（数据缺陷导致的 undefined 等）
    for (const url of [...urls]) {
        if (url.includes("undefined") || url.includes("[object")) {
            urls.delete(url)
        }
    }

    return urls
}

/**
 * 递归扫描导出目录，建立 basename（去扩展名、小写）到源文件的索引。
 * @param sourceRoot 导出目录
 * @returns basename → 源文件列表
 */
function buildSourceIndex(sourceRoot: string): Map<string, SourceFile[]> {
    const index = new Map<string, SourceFile[]>()
    const pngFiles = walkFiles(sourceRoot, [".png"])

    for (const absPath of pngFiles) {
        const relPath = toPosix(path.relative(sourceRoot, absPath))
        const baseName = path.basename(absPath, ".png")
        const key = baseName.toLowerCase()
        const list = index.get(key) ?? []
        list.push({ relPath, absPath })
        index.set(key, list)
    }

    return index
}

/**
 * 去掉文件扩展名。
 * @param relPath 相对路径
 * @returns 去掉扩展名后的路径
 */
function stripExtension(relPath: string): string {
    const dot = relPath.lastIndexOf(".")
    return dot >= 0 ? relPath.slice(0, dot) : relPath
}

/**
 * 从纹理导出目录反推导出根目录。
 *
 * sourceRoot 形如 <导出根>/EM/Content/UI/Texture，而称号框贴图有一部分落在
 * EM/Content/UI/WBP/... 下（VX 的 Mask/Noise/Flare），不在 sourceRoot 内。
 * 有了导出根就能按包路径直接拼出这些文件的位置。
 *
 * @param sourceRoot 纹理导出目录
 * @returns 导出根目录
 */
function resolveExportRoot(sourceRoot: string): string {
    const normalized = toPosix(sourceRoot).toLowerCase()
    const marker = normalized.lastIndexOf("/em/content/")
    return marker >= 0 ? sourceRoot.slice(0, marker) : sourceRoot
}

/**
 * 读取称号框贴图清单（webp 文件名 → 游戏内包路径）；文件不存在时返回空表。
 * @returns 文件名 → 包路径
 */
function loadTitleFrameManifest(manifestPath = TITLE_FRAME_MANIFEST): Record<string, string> {
    if (!fs.existsSync(manifestPath)) {
        return {}
    }
    try {
        return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, string>
    } catch (error) {
        console.warn(`⚠️  读取称号框贴图清单失败: ${error instanceof Error ? error.message : String(error)}`)
        return {}
    }
}

/**
 * 从同名源文件列表里挑选最优者：优先路径层级最浅（FModel 默认导出层级），层级相同取字典序更靠前的。
 * @param entries 同名源文件列表
 * @returns 选中的源文件；列表为空时返回 null
 */
function pickSource(entries: SourceFile[]): SourceFile | null {
    if (!entries.length) {
        return null
    }
    return entries.reduce((best, current) => {
        const bestDepth = best.relPath.split("/").length
        const currentDepth = current.relPath.split("/").length
        if (currentDepth < bestDepth || (currentDepth === bestDepth && current.relPath < best.relPath)) {
            return current
        }
        return best
    })
}

/**
 * 递归扫描导出根目录，建立贴图 basename（小写）到游戏内包路径的索引。
 * 导出目录结构与包路径一一对应（相对路径即包路径），.uasset 在包就在，
 * 之后 export-tex 可直接读 pak 烘焙，无需 FModel 界面导出。
 * @param exportRoot 导出根目录（其下应有 EM/Content/…）
 * @returns basename → 包路径列表（不含扩展名）
 */
function buildUassetIndex(exportRoot: string): Map<string, string[]> {
    const index = new Map<string, string[]>()
    const contentDir = path.join(exportRoot, "EM", "Content")
    const scanRoot = fs.existsSync(contentDir) ? contentDir : exportRoot
    for (const absPath of walkFiles(scanRoot, [".uasset"])) {
        const relPath = toPosix(path.relative(exportRoot, absPath))
        // 只有 EM/ 开头的相对路径才能还原成合法包路径，--source 指向别处时跳过
        if (!relPath.toLowerCase().startsWith("em/")) {
            continue
        }
        const pkg = stripExtension(relPath)
        const key = path.posix.basename(pkg).toLowerCase()
        const list = index.get(key) ?? []
        list.push(pkg)
        index.set(key, list)
    }
    return index
}

/**
 * 从同名包路径里挑选最优者：规则与 pickSource 一致（层级最浅、字典序优先）。
 * @param pkgs 同名包路径列表
 * @returns 选中的包路径；列表为空时返回 null
 */
function pickUasset(pkgs: string[]): string | null {
    if (!pkgs.length) {
        return null
    }
    return pkgs.reduce((best, current) => {
        const bestDepth = best.split("/").length
        const currentDepth = current.split("/").length
        if (currentDepth < bestDepth || (currentDepth === bestDepth && current < best)) {
            return current
        }
        return best
    })
}

/**
 * 按目标类别挑选包路径：升华天赋图标按 ROUGE_TALENT_SOURCE_ORDER 优先整图，其次图集；
 * 其余目标沿用 pickUasset 的「层级最浅、字典序优先」。
 * @param targetRelPath 目标相对路径（相对 public/imgs）
 * @param pkgs 同名包路径候选
 * @returns 选中的包路径；无候选返回 null
 */
function pickPackageForTarget(targetRelPath: string, pkgs: string[]): string | null {
    if (!pkgs.length) {
        return null
    }
    if (/^webp\/T_Rouge_Talent_/i.test(targetRelPath)) {
        for (const marker of ROUGE_TALENT_SOURCE_ORDER) {
            const matched = pkgs.filter(pkg => pkg.toLowerCase().includes(marker))
            if (matched.length) {
                return pickUasset(matched)
            }
        }
    }
    return pickUasset(pkgs)
}

/**
 * 本地 .uasset 的可解码性：CUE4Parse 解码贴图需要 `.uasset` 与 `.uexp` 同时存在。
 * @param exportRoot 导出根目录
 * @param pkg 游戏内包路径（不含扩展名）
 * @returns 可用时返回 .uasset 绝对路径，否则给出缺失的文件种类
 */
function resolveLocalUasset(exportRoot: string, pkg: string): { absPath: string } | { reason: "uasset" | "uexp" } {
    const base = path.join(exportRoot, ...pkg.split("/"))
    const absPath = `${base}.uasset`
    if (!fs.existsSync(absPath)) {
        return { reason: "uasset" }
    }
    if (!fs.existsSync(`${base}.uexp`)) {
        return { reason: "uexp" }
    }
    return { absPath }
}

/**
 * 根据精确引用与评估出的 URL 集合构建转换任务。
 *
 * 解析顺序（uasset 优先）：本地 `.uasset/.uexp` 齐全 → uasset 任务；否则同名 PNG 现货 → PNG 任务；
 * 都没有 → unresolved（默认只报缺失，`--allow-pak` 才做全 pak 搜索）。
 * `--no-uasset-first` 回退旧的 PNG 优先顺序。
 * @param refs 精确引用列表
 * @param urls 数据评估产生的完整 URL 集合
 * @param index basename 源索引
 * @returns 任务列表与缺失引用
 */
function buildTasks(
    refs: ImageRef[],
    urls: Set<string>,
    index: Map<string, SourceFile[]>,
    titleFrameTextures: Record<string, string>,
    exportRoot: string,
    uassetIndex: Map<string, string[]> | null
): { tasks: ConvertTask[]; uassetTasks: UassetTask[]; unresolved: ImageRef[]; missing: ImageRef[] } {
    const tasksByTarget = new Map<string, ConvertTask>()
    const uassetByTarget = new Map<string, UassetTask>()
    const unresolved: ImageRef[] = []
    const missing: ImageRef[] = []

    const resolveUasset = (dir: string, name: string, referencedFrom: string, pkg: string, absPath?: string): void => {
        const targetRelPath = path.posix.join(dir, `${name}.webp`)
        if (!tasksByTarget.has(targetRelPath) && !uassetByTarget.has(targetRelPath)) {
            uassetByTarget.set(targetRelPath, { targetRelPath, uassetPkg: pkg, uassetAbsPath: absPath, referencedFrom })
        }
    }

    const resolveTask = (dir: string, name: string, referencedFrom: string): void => {
        const targetRelPath = path.posix.join(dir, `${name}.webp`)
        // 称号框贴图名可能带父目录前缀（同名冲突改写），basename 对不上源 PNG，
        // 改用手里的清单按「包路径后缀」在候选里挑：导出目录 = 包路径去掉 Content 前缀，
        // 所以相对路径一定是包路径的后缀。
        const mappedPackage = titleFrameTextures[targetRelPath]
        const pkgCandidates = uassetIndex
            ? (mappedPackage ?? pickPackageForTarget(targetRelPath, uassetIndex.get(name.toLowerCase()) ?? []))
            : null

        /** 本地 .uasset 可解码时建 uasset 任务；缺 .uexp 且也没有 PNG 时按缺失报出 */
        const tryLocalUasset = (): boolean => {
            if (!pkgCandidates) {
                return false
            }
            const local = resolveLocalUasset(exportRoot, pkgCandidates)
            if ("absPath" in local) {
                resolveUasset(dir, name, referencedFrom, pkgCandidates, local.absPath)
                return true
            }
            if (local.reason === "uexp") {
                console.warn(`⚠️  本地 .uasset 缺 .uexp，无法解码: ${pkgCandidates}`)
                const pngSpot = pickSource(index.get(name.toLowerCase()) ?? [])
                if (!pngSpot) {
                    missing.push({ dir, name, source: `${referencedFrom}（本地 .uasset 缺 .uexp: ${pkgCandidates}）` })
                    return true
                }
            }
            return false
        }

        if (UASSET_FIRST && tryLocalUasset()) {
            return
        }

        let source: SourceFile | null
        if (mappedPackage) {
            // 先按「导出根 + 包路径」直接定位（能覆盖 sourceRoot 之外的 WBP 贴图），
            // 找不到再退回按 basename 在索引里挑。
            const directPath = path.join(exportRoot, `${mappedPackage}.png`)
            if (fs.existsSync(directPath)) {
                source = { absPath: directPath, relPath: toPosix(path.relative(exportRoot, directPath)) }
            } else {
                const candidates = index.get(path.posix.basename(mappedPackage).toLowerCase()) ?? []
                const packageKey = mappedPackage.toLowerCase()
                source =
                    candidates.find(entry => packageKey.endsWith(stripExtension(entry.relPath).toLowerCase())) ?? pickSource(candidates)
            }
        } else {
            source = pickSource(index.get(name.toLowerCase()) ?? [])
        }
        if (!source) {
            if (!UASSET_FIRST && tryLocalUasset()) {
                return
            }
            // 目标 WebP 已存在且非 --force：无需再烘焙，避免把「已有成品、只是缺源」误报为缺失
            if (!FORCE && fs.existsSync(path.join(publicImgsDir, targetRelPath))) {
                return
            }
            // 本地无 PNG、也无本地 .uasset：默认报缺失；--allow-pak 时留给全 pak 搜索兜底
            if (pkgCandidates) {
                resolveUasset(dir, name, referencedFrom, pkgCandidates)
            } else {
                unresolved.push({ dir, name, source: referencedFrom })
            }
            return
        }
        if (!tasksByTarget.has(targetRelPath)) {
            tasksByTarget.set(targetRelPath, {
                targetRelPath,
                sourceAbsPath: source.absPath,
                sourceRelPath: source.relPath,
                referencedFrom,
            })
        }
    }

    // 精确字面量引用
    for (const ref of refs) {
        if (ref.name) {
            resolveTask(ref.dir, ref.name, ref.source)
        }
    }

    // 数据评估出的真实 URL
    for (const url of urls) {
        const lastSlash = url.lastIndexOf("/")
        const dir = url.slice("/imgs/".length, lastSlash)
        const name = url.slice(lastSlash + 1, url.length - ".webp".length)
        if (dir && name) {
            resolveTask(dir, name, "数据评估")
        }
    }

    return { tasks: [...tasksByTarget.values()], uassetTasks: [...uassetByTarget.values()], unresolved, missing }
}

/** 单次 fmodel-cli 调用的超时（毫秒）：Oodle 解压偶尔卡住，必须有兜底 */
const CLI_TIMEOUT_MS = 180_000

/**
 * 把 CLI 输出解码成字符串：正常是 UTF-8，个别环境是 GBK，按严格模式依次试。
 */
function decodeCliOutput(bytes: Uint8Array): string {
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    } catch {
        return new TextDecoder("gbk", { fatal: false }).decode(bytes)
    }
}

/**
 * 一次性 fmodel-cli 调用（非 batch）：export-tex 在 batch 会话里不稳定
 * （成功一次后会话即死，部分新贴图直接让进程崩溃、无任何输出），
 * 改走独立进程隔离，单个崩溃不影响其他任务。
 * @returns 解析后的 JSON（取最后一个 { 开头的行，容忍日志掺杂）
 */
async function runCliOneShot(commandArgs: string[]): Promise<Record<string, any>> {
    const child = Bun.spawn([FMODEL_CLI, ...commandArgs], { stdout: "pipe", stderr: "pipe" })
    const timer = setTimeout(() => {
        try {
            child.kill()
        } catch {}
    }, CLI_TIMEOUT_MS)
    try {
        const [stdout, stderr, exitCode] = await Promise.all([
            new Response(child.stdout).arrayBuffer(),
            new Response(child.stderr).text(),
            child.exited,
        ])
        const text = decodeCliOutput(new Uint8Array(stdout)).trim()
        const line = text
            .split("\n")
            .map(item => item.trim())
            .filter(item => item.startsWith("{"))
            .at(-1)
        if (exitCode !== 0 && !line) {
            throw new Error(`exit ${exitCode}: ${stderr.trim().slice(0, 200) || text.slice(0, 200)}`)
        }
        if (!line) throw new Error(`无 JSON 输出: ${text.slice(0, 200)}`)
        const parsed = JSON.parse(line) as Record<string, any>
        if (parsed.ok !== true) throw new Error(String(parsed.error ?? line).slice(0, 300))
        return parsed
    } finally {
        clearTimeout(timer)
        try {
            child.kill()
        } catch {}
    }
}

/**
 * 常驻 CLI 会话：`fmodel-cli batch` 一次建好 pak 索引，之后 stdin 逐行收命令、stdout 逐行回 JSON。
 * 会话内串行（batch 下 stdout 一行一结果，并发写会错位），并行靠开多个会话。
 */
class CliSession {
    private child: ReturnType<typeof Bun.spawn> | undefined
    private buffer = ""
    private busy = false
    private waiter: { resolve: (line: string) => void; reject: (error: Error) => void } | undefined
    private lastStderr = ""
    private exitCode: number | null = null

    /** 排空 stderr：既防管道写满卡死子进程，也留作死亡诊断 */
    private drainStderr(child: ReturnType<typeof Bun.spawn>): void {
        void (async () => {
            const reader = (child.stderr as ReadableStream<Uint8Array>).getReader()
            const decoder = new TextDecoder()
            for (;;) {
                const { done, value } = await reader.read()
                if (done) break
                this.lastStderr = (this.lastStderr + decoder.decode(value, { stream: true })).slice(-2000)
            }
        })().catch(() => {})
    }

    private ensure(): ReturnType<typeof Bun.spawn> {
        if (!this.child) {
            const child = Bun.spawn([FMODEL_CLI, "batch"], { stdin: "pipe", stdout: "pipe", stderr: "pipe" })
            this.child = child
            this.buffer = ""
            this.lastStderr = ""
            this.exitCode = null
            this.drainStderr(child)
            void child.exited.then(code => {
                if (this.child === child) {
                    this.child = undefined
                    this.exitCode = code
                }
            })
            void (async () => {
                try {
                    const reader = (child.stdout as ReadableStream<Uint8Array>).getReader()
                    const decoder = new TextDecoder()
                    for (;;) {
                        const { done, value } = await reader.read()
                        if (done) break
                        this.buffer += decoder.decode(value, { stream: true })
                        let index: number
                        while ((index = this.buffer.indexOf("\n")) >= 0) {
                            const line = this.buffer.slice(0, index).trim()
                            this.buffer = this.buffer.slice(index + 1)
                            if (!line) continue
                            // CLI 偶尔往 stdout 掺日志行：只收 JSON 响应，别的丢弃
                            if (!line.startsWith("{")) continue
                            this.waiter?.resolve(line)
                            this.waiter = undefined
                        }
                    }
                } finally {
                    if (this.child === child) this.child = undefined
                    this.waiter?.reject(
                        new Error(
                            `fmodel-cli batch 会话已结束(exit ${this.exitCode ?? "?"})${this.lastStderr ? ` stderr: ${this.lastStderr.slice(-300)}` : ""}`
                        )
                    )
                    this.waiter = undefined
                }
            })().catch(() => {})
        }
        return this.child
    }

    /** 跑一条命令，返回解析后的 JSON；超时或崩溃时重建会话并重试一次 */
    async run(commandArgs: string[]): Promise<Record<string, any>> {
        for (let attempt = 0; attempt < 2; attempt++) {
            const child = this.ensure()
            while (this.busy) await new Promise(resolve => setTimeout(resolve, 5))
            this.busy = true
            let timer: ReturnType<typeof setTimeout> | undefined
            const startTime = Date.now()
            try {
                const line = await new Promise<string>((resolve, reject) => {
                    this.waiter = { resolve, reject }
                    void (child.stdin as { write: (text: string) => void }).write(`${commandArgs.join(" ")}\n`)
                    timer = setTimeout(() => {
                        // 超时后迟到响应不能再要，否则整个会话错位：直接杀掉重建
                        if (this.child === child) {
                            try {
                                child.kill()
                            } catch {}
                            this.child = undefined
                        }
                        if (this.waiter) {
                            this.waiter = undefined
                            reject(new Error(`fmodel-cli batch 超时: ${commandArgs[0]}`))
                        }
                    }, CLI_TIMEOUT_MS)
                })
                const parsed = JSON.parse(line) as Record<string, any>
                if (parsed.ok !== true) throw new Error(String(parsed.error ?? line).slice(0, 300))
                const elapsed = Date.now() - startTime
                if (elapsed > 60_000) console.warn(`  ~ 慢命令 ${commandArgs.join(" ")} 用时 ${(elapsed / 1000).toFixed(0)}s`)
                return parsed
            } catch (error) {
                if (this.child) {
                    try {
                        this.child.kill()
                    } catch {}
                    this.child = undefined
                }
                if (attempt === 1) throw error
            } finally {
                clearTimeout(timer)
                // 定时器必须清掉：Bun 会等未到期的 timer 走完才退出进程
                this.busy = false
            }
        }
        throw new Error("unreachable")
    }

    close(): void {
        try {
            this.child?.kill()
        } catch {}
        this.child = undefined
    }
}

/**
 * 并发跑一批 CLI 任务：按 JOBS 开会话分片，失败的任务记入 errors（不中断整批）。
 */
async function runCliPool<T, R>(
    items: T[],
    worker: (session: CliSession, item: T, index: number) => Promise<R>,
    onProgress?: (done: number, total: number) => void
): Promise<{ results: R[]; errors: { item: T; error: string }[] }> {
    const sessions = Array.from({ length: Math.min(JOBS, items.length) }, () => new CliSession())
    const results: R[] = []
    const errors: { item: T; error: string }[] = []
    let done = 0
    try {
        await Promise.all(
            sessions.map((session, shard) =>
                (async () => {
                    for (let i = shard; i < items.length; i += sessions.length) {
                        try {
                            results.push(await worker(session, items[i], i))
                        } catch (error) {
                            errors.push({ item: items[i], error: error instanceof Error ? error.message : String(error) })
                        }
                        done += 1
                        onProgress?.(done, items.length)
                    }
                })()
            )
        )
    } finally {
        for (const session of sessions) session.close()
    }
    return { results, errors }
}

/**
 * search 兜底：本地 .uasset 索引没命中的名字，全 pak 按 basename 搜，优先 UI/ 下的结果。
 * 只在 `--allow-pak` 下启用：默认以本地 1.8 uasset 为唯一源，不读 pak。
 * @returns 新增的 uasset 任务与仍无解的引用
 */
async function resolveViaSearch(unresolved: ImageRef[]): Promise<{ uassetTasks: UassetTask[]; stillMissing: ImageRef[] }> {
    const seen = new Map<string, ImageRef>()
    for (const ref of unresolved) {
        const key = `${ref.dir}/${ref.name ?? ""}`
        if (ref.name && !seen.has(key)) seen.set(key, ref)
    }
    const deduped = [...seen.values()]
    if (!deduped.length) return { uassetTasks: [], stillMissing: [] }

    console.log(`本地无 .uasset 映射 ${deduped.length} 个，全 pak 搜索中…`)
    const uassetTasks: UassetTask[] = []
    const stillMissing: ImageRef[] = []
    const { results, errors } = await runCliPool(
        deduped,
        async (session, ref) => {
            const parsed = await session.run(["search", `**/${ref.name}.uasset`, "20"])
            return { ref, matches: (parsed.matches as string[] | undefined) ?? [] }
        },
        (done, total) => {
            if (done % 50 === 0 || done === total) console.log(`  搜索进度 ${done}/${total}`)
        }
    )
    for (const { ref, matches } of results) {
        const pkgs = matches.filter(m => m.endsWith(".uasset")).map(m => stripExtension(m))
        // 同名资产散落各处时优先 UI/ 贴图，其次层级最浅
        pkgs.sort((a, b) => {
            const aUI = a.includes("/UI/") ? 0 : 1
            const bUI = b.includes("/UI/") ? 0 : 1
            if (aUI !== bUI) return aUI - bUI
            const depth = a.split("/").length - b.split("/").length
            return depth !== 0 ? depth : a.localeCompare(b)
        })
        const pkg = pkgs.find(p => p.toLowerCase().startsWith("em/"))
        if (pkg && ref.name) {
            uassetTasks.push({ targetRelPath: path.posix.join(ref.dir, `${ref.name}.webp`), uassetPkg: pkg, referencedFrom: ref.source })
        } else {
            stillMissing.push(ref)
        }
    }
    for (const { item, error } of errors) {
        console.warn(`  ~ 搜索失败 ${item.dir}/${item.name}: ${error}`)
        stillMissing.push(item)
    }
    return { uassetTasks, stillMissing }
}

/**
 * 取本地 .uasset 绝对路径；缺 `.uasset` / `.uexp` 时抛出点名缺失文件的错误（不静默改读 pak）。
 * @param exportRoot 导出根目录
 * @param task uasset 任务（可带已解析好的绝对路径）
 * @returns .uasset 绝对路径
 */
function requireLocalUasset(exportRoot: string, task: UassetTask): string {
    const base = task.uassetAbsPath ? task.uassetAbsPath.replace(/\.uasset$/i, "") : path.join(exportRoot, ...task.uassetPkg.split("/"))
    if (!fs.existsSync(`${base}.uasset`)) {
        throw new Error(`本地 .uasset 缺失: ${base}.uasset${ALLOW_PAK ? "" : "（未开启 --allow-pak，不读 pak）"}`)
    }
    if (!fs.existsSync(`${base}.uexp`)) {
        throw new Error(`本地 .uexp 缺失: ${base}.uexp`)
    }
    return `${base}.uasset`
}

/**
 * 把 uasset 任务烘焙成 PNG。
 * 默认只解码本地 .uasset（`export-tex-file`，不读 pak）；
 * `--allow-pak` 时才先 `export-tex` 直读 pak，pak 里没有该资产再回退本地文件。
 * 烘焙产物落在导出目录（FModel 界面导出同布局），复跑即命中 PNG 现货。
 * @returns 烘焙成功转成的 ConvertTask 与失败的缺失引用
 */
async function exportUassetTextures(uassetTasks: UassetTask[], exportRoot: string): Promise<{ tasks: ConvertTask[]; failed: ImageRef[] }> {
    console.log(
        `uasset 烘焙 ${uassetTasks.length} 个（${JOBS} 并发独立进程，${ALLOW_PAK ? "允许读 pak：先 export-tex" : "仅本地 uasset：export-tex-file，不读 pak"}）…`
    )
    const tasks: ConvertTask[] = []
    const failed: ImageRef[] = []
    const { results, errors } = await runCliPool(
        uassetTasks,
        // 注意：故意不用 batch 会话（见 runCliOneShot），session 形参闲置
        async (_session, task) => {
            const finish = (parsed: Record<string, any>): { task: UassetTask; pngPath: string } => {
                const pngPath = String(parsed.outputPath ?? "").replaceAll("\\", "/")
                if (!pngPath || !fs.existsSync(pngPath)) throw new Error(`产物不存在: ${parsed.outputPath ?? "(空)"}`)
                return { task, pngPath }
            }
            if (ALLOW_PAK) {
                try {
                    return finish(await runCliOneShot(["export-tex", task.uassetPkg]))
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error)
                    // 本地 pak 没有该资产但导出目录有 .uasset：直接解本地文件
                    if (!message.includes("no game file")) throw error
                    return finish(await runCliOneShot(["export-tex-file", requireLocalUasset(exportRoot, task)]))
                }
            }
            return finish(await runCliOneShot(["export-tex-file", requireLocalUasset(exportRoot, task)]))
        },
        (done, total) => {
            if (done % 100 === 0 || done === total) console.log(`  烘焙进度 ${done}/${total}`)
        }
    )
    for (const { task, pngPath } of results) {
        tasks.push({
            targetRelPath: task.targetRelPath,
            sourceAbsPath: pngPath,
            sourceRelPath: `uasset:${task.uassetPkg}`,
            referencedFrom: task.referencedFrom,
        })
    }
    for (const { item, error } of errors) {
        console.warn(`  ~ 烘焙失败 ${item.targetRelPath} <- ${item.uassetPkg}: ${error}`)
        const slash = item.targetRelPath.lastIndexOf("/")
        failed.push({
            dir: item.targetRelPath.slice(0, slash),
            name: item.targetRelPath.slice(slash + 1, -`.webp`.length),
            source: `${item.referencedFrom}（uasset-cli 导出失败）`,
        })
    }
    return { tasks, failed }
}

/**
 * 计算图片的等比缩小目标尺寸（不放大，缩略图除外——固定缩到 128x128）：
 *   0. bust/、fashion/ 目录 → 固定缩略图尺寸（THUMB_SIZE）；
 *   1. 命中 SCALE_RULES（按贴图名匹配）→ 按规则 scale 缩小；
 *   2. 命中 FIXED_SIZE_RULES（按目标相对路径匹配）→ 固定缩到规则边长；
 *   3. res/ 目录 → maxHeight 限制（RES_MAX_HEIGHT），命中 FULL_SIZE_RULES 的除外（保持源分辨率）；
 *   4. 都不命中 → 不缩小。
 * @param sourceAbsPath 源 PNG 路径
 * @param targetRelPath 目标相对路径（相对 public/imgs）
 * @returns 缩小信息；无需缩小返回 null
 */
async function getResizeInfo(sourceAbsPath: string, targetRelPath: string): Promise<ResizeInfo | null> {
    const name = path.posix.basename(targetRelPath, ".webp")
    // bust/、fashion/ 下是缩略图（全图走 CDN）：固定缩到 128x128，与现存缩略图一致
    if (isThumb(targetRelPath)) {
        const meta = await new Bun.Image(sourceAbsPath).metadata()
        // 源图已经够小就不放大
        if (meta.width <= THUMB_SIZE && meta.height <= THUMB_SIZE) {
            return null
        }
        return {
            originalWidth: meta.width,
            originalHeight: meta.height,
            width: THUMB_SIZE,
            height: THUMB_SIZE,
            reason: targetRelPath.startsWith("fashion/") ? "fashion缩略图" : "bust缩略图",
        }
    }
    const scaleRule = SCALE_RULES.find(rule => rule.pattern.test(name))
    if (scaleRule) {
        const scale = Math.min(scaleRule.scale, 1)
        if (scale < 1) {
            const meta = await new Bun.Image(sourceAbsPath).metadata()
            return {
                originalWidth: meta.width,
                originalHeight: meta.height,
                width: Math.round(meta.width * scale),
                height: Math.round(meta.height * scale),
                reason: `${scale * 100}%`,
            }
        }
        return null
    }

    // 固定尺寸目标（升华天赋图标等）：不看目录与源尺寸，一律缩到规则边长（不放大）
    const fixedRule = FIXED_SIZE_RULES.find(rule => rule.pattern.test(targetRelPath))
    if (fixedRule) {
        const meta = await new Bun.Image(sourceAbsPath).metadata()
        if (meta.width <= fixedRule.size && meta.height <= fixedRule.size) {
            return null
        }
        return {
            originalWidth: meta.width,
            originalHeight: meta.height,
            width: fixedRule.size,
            height: fixedRule.size,
            reason: fixedRule.reason,
        }
    }

    if (!targetRelPath.startsWith("res/")) {
        return null
    }

    // res/ 全尺寸例外（升华装备图 T_Season_*）：保持源分辨率，其余 res/ 图片仍按 RES_MAX_HEIGHT 缩小
    if (FULL_SIZE_RULES.some(pattern => pattern.test(name))) {
        return null
    }

    const meta = await new Bun.Image(sourceAbsPath).metadata()
    if (meta.height <= RES_MAX_HEIGHT) {
        return null
    }

    const scale = RES_MAX_HEIGHT / meta.height
    return {
        originalWidth: meta.width,
        originalHeight: meta.height,
        width: Math.round(meta.width * scale),
        height: Math.round(meta.height * scale),
        reason: "res",
    }
}

/**
 * 将缩小信息格式化为日志后缀。
 * @param info 缩小信息
 * @returns 日志后缀文本
 */
function formatResizeNote(info: ResizeInfo | null): string {
    return info ? `  (缩小[${info.reason}]: ${info.originalWidth}x${info.originalHeight} -> ${info.width}x${info.height})` : ""
}

/**
 * 判断输出尺寸是否应使用无损压缩：宽高均 <=256。
 * @param width 输出宽
 * @param height 输出高
 * @returns true 表示无损
 */
function shouldUseLossless(width: number, height: number): boolean {
    return width <= LOSSLESS_MAX_DIM && height <= LOSSLESS_MAX_DIM
}

/**
 * 使用 Bun 内置的 Bun.Image 转换单张 PNG → WebP 并写入目标路径。
 * res 目录图片按传入的缩小信息先等比缩小再编码。
 * 输出宽高均 <=256 时用无损压缩，其余用有损（quality）；bust 缩略图强制有损。
 * @param sourceAbsPath 源 PNG 路径
 * @param destAbsPath 目标 WebP 路径
 * @param resizeInfo res 目录缩小信息；null 表示不缩小
 * @param quality 质量（仅有损时生效）
 * @param forceLossy 强制有损（bust 缩略图与现存一致）
 * @returns 是否使用了无损压缩
 */
async function convertWithBunImage(
    sourceAbsPath: string,
    destAbsPath: string,
    resizeInfo: ResizeInfo | null,
    quality: number,
    forceLossy = false
): Promise<boolean> {
    if (typeof Bun.Image !== "function") {
        throw new Error("当前 Bun 版本不支持 Bun.Image，请升级 Bun 后再运行")
    }

    // 已有缩小信息时输出尺寸已知；否则读一次元数据判断是否走无损
    let outputWidth = resizeInfo?.width
    let outputHeight = resizeInfo?.height
    if (outputWidth === undefined || outputHeight === undefined) {
        const meta = await new Bun.Image(sourceAbsPath).metadata()
        outputWidth = meta.width
        outputHeight = meta.height
    }
    const lossless = !forceLossy && shouldUseLossless(outputWidth, outputHeight)

    const additive = destAbsPath.replaceAll("\\", "/").includes("/headframe/dynamic/") && destAbsPath.endsWith("_additive.webp")
    const image = new Bun.Image(additive ? additivePng(fs.readFileSync(sourceAbsPath)) : sourceAbsPath)
    const webp = resizeInfo
        ? image.resize(resizeInfo.width, resizeInfo.height).webp(lossless ? { lossless: true } : { quality, lossless: false })
        : image.webp(lossless ? { lossless: true } : { quality, lossless: false })
    fs.mkdirSync(path.dirname(destAbsPath), { recursive: true })
    await webp.write(destAbsPath)
    return lossless
}

/**
 * 转换单个任务：PNG → WebP 写入 public。
 * @param task 转换任务
 * @returns 转换状态与缩小信息
 */
async function convertTask(
    task: ConvertTask
): Promise<{ status: "converted" | "skipped" | "dry-run"; resizeInfo: ResizeInfo | null; lossless: boolean | null }> {
    const destAbsPath = path.join(publicImgsDir, task.targetRelPath)
    if (!FORCE && fs.existsSync(destAbsPath)) {
        return { status: "skipped", resizeInfo: null, lossless: null }
    }

    const resizeInfo = await getResizeInfo(task.sourceAbsPath, task.targetRelPath)
    // bust 缩略图强制有损 q90，与现存 40 个缩略图一致（大图无损版走 CDN，不管本地）；
    // fashion 缩略图走默认无损（与现存 fashion 缩略图一致）
    const forceLossy = task.targetRelPath.startsWith("bust/")

    if (DRY_RUN) {
        return { status: "dry-run", resizeInfo, lossless: await isLosslessOutput(task.sourceAbsPath, resizeInfo, forceLossy) }
    }

    const lossless = await convertWithBunImage(task.sourceAbsPath, destAbsPath, resizeInfo, QUALITY, forceLossy)

    return { status: "converted", resizeInfo, lossless }
}

/**
 * 预判输出是否走无损（dry-run 日志用）：有缩小信息直接用输出尺寸，否则读源图元数据。
 */
async function isLosslessOutput(sourceAbsPath: string, resizeInfo: ResizeInfo | null, forceLossy = false): Promise<boolean> {
    if (forceLossy) {
        return false
    }
    if (resizeInfo) {
        return shouldUseLossless(resizeInfo.width, resizeInfo.height)
    }
    const meta = await new Bun.Image(sourceAbsPath).metadata()
    return shouldUseLossless(meta.width, meta.height)
}

/**
 * 主流程。
 */
async function main(): Promise<void> {
    if (FILTER_ERROR) {
        throw new Error(`--filter 正则无效: ${FILTER}\n${FILTER_ERROR}`)
    }
    if (!Number.isFinite(QUALITY) || QUALITY < 1 || QUALITY > 100) {
        throw new Error(`无效的 WebP 质量: ${QUALITY}`)
    }

    console.log(`扫描数据目录: ${dataDir}`)
    console.log(`纹理导出目录: ${sourceRoot}`)
    console.log(`输出目录: ${publicImgsDir}${FORCE ? "（--force 全量重做）" : ""}`)

    // 文本扫描: 默认覆盖数据包 + 前端 src（数据/组件/工具/视图里的静态字面量引用，如
    // /imgs/webp/T_Icon_Random_Title.webp、/imgs/tp/T_Gp_MainMission.webp）；
    // 传 --data（或 WEBP_IMPORT_DATA_DIR）时仅扫描指定目录
    const dataDirOverridden = getArgValue("--data") !== undefined || process.env.WEBP_IMPORT_DATA_DIR !== undefined
    const defaultScanDirs = [path.join(rootDir, "packages", "data"), path.join(rootDir, "apps", "web", "src")]
    const refs = (dataDirOverridden ? [dataDir] : defaultScanDirs).flatMap(dir => collectRefs(dir))
    const exactRefs = refs.filter(ref => Boolean(ref.name))
    const templateRefs = refs.filter(ref => Boolean(ref.pattern))
    const wildcardRefs = refs.filter(ref => ref.wildcard)
    console.log(`文本引用 ${refs.length} 处（精确 ${exactRefs.length}，模板 ${templateRefs.length}，全通配 ${wildcardRefs.length}）`)

    const urls = await evaluateDataUrls()
    console.log(`数据评估引用 ${urls.size} 个 URL`)

    // 校验模板是否都被数据评估覆盖（发现新模板但枚举不到时提醒）。
    // --filter 只跑局部类别，模板/通配校验是全局口径，跳过避免无关告警。
    if (FILTER_REGEX) {
        console.log("已设置 --filter，跳过全局模板/通配校验")
    } else {
        for (const ref of templateRefs) {
            const matched = [...urls].some(url => {
                const lastSlash = url.lastIndexOf("/")
                return ref.pattern?.test(url.slice(lastSlash + 1, url.length - ".webp".length)) ?? false
            })
            if (!matched) {
                console.warn(`⚠️  模板 ${ref.dir}/${ref.pattern?.source} 未在数据评估中产生任何引用，可能枚举不完整 (${ref.source})`)
            }
        }

        // 校验全通配模板所在目录是否被数据评估覆盖。
        // 这类引用（如 /imgs/music/${icon}.webp 乐谱封面）无法从文本推导 basename，
        // 一旦 evaluateDataUrls 漏枚举对应数据源，就会完全没有任务且毫无提示，因此按目录校验。
        const coveredDirs = new Set<string>()
        for (const url of urls) {
            coveredDirs.add(url.slice("/imgs/".length, url.lastIndexOf("/")))
        }
        const warnedWildcardDirs = new Set<string>()
        for (const ref of wildcardRefs) {
            // 目录名本身含 ${...}（如 `/imgs/${targetDir}/${icon}.webp`）时无法确定真实目录，跳过校验
            if (ref.dir.includes("${")) {
                continue
            }
            if (!coveredDirs.has(ref.dir) && !warnedWildcardDirs.has(ref.dir)) {
                warnedWildcardDirs.add(ref.dir)
                console.warn(`⚠️  目录 ${ref.dir}/ 只有全通配模板引用，但数据评估未产生该目录下任何 URL，可能漏了对应数据源 (${ref.source})`)
            }
        }
    }

    const exportRoot = resolveExportRoot(sourceRoot)
    const index = buildSourceIndex(sourceRoot)
    console.log(`索引到源 PNG ${index.size} 个`)

    const headFrameManifest = path.join(rootDir, "apps", "web", "src", "utils", "head-frame", "head-frame-textures.json")
    const titleFrameTextures = Object.fromEntries([
        ...Object.entries(loadTitleFrameManifest()).map(([name, pkg]) => [`titleframe/${name}`, pkg]),
        ...Object.entries(loadTitleFrameManifest(headFrameManifest)).map(([name, pkg]) => [`headframe/dynamic/${name}`, pkg]),
    ])
    for (const target of Object.keys(titleFrameTextures)) urls.add(`/imgs/${target}`)
    if (Object.keys(titleFrameTextures).length) {
        console.log(`动态框贴图清单 ${Object.keys(titleFrameTextures).length} 条`)
    }

    // 缺 PNG 时走 uasset-cli 烘焙：先按导出目录里的 .uasset 反推包路径
    const cliAvailable = !NO_UASSET && fs.existsSync(FMODEL_CLI)
    if (NO_UASSET) {
        console.log("已指定 --no-uasset：缺 PNG 时只报缺失，不调 fmodel-cli")
    } else if (!cliAvailable) {
        console.warn(`⚠️  未找到 fmodel-cli（${FMODEL_CLI}），缺 PNG 时只报缺失`)
    } else {
        console.log(
            `uasset 解析：${UASSET_FIRST ? "本地 .uasset 优先" : "PNG 现货优先（--no-uasset-first）"}；` +
                `${ALLOW_PAK ? "允许读 pak（export-tex / 全 pak 搜索）" : "不读 pak（仅 export-tex-file 解本地文件）"}`
        )
    }
    let uassetIndex: Map<string, string[]> | null = null
    if (cliAvailable) {
        uassetIndex = buildUassetIndex(exportRoot)
        console.log(`索引到 .uasset 包路径 ${[...uassetIndex.values()].reduce((sum, list) => sum + list.length, 0)} 个`)
    }

    const {
        tasks: rawTasks,
        uassetTasks: rawUassetTasks,
        unresolved: rawUnresolved,
        missing: rawMissing,
    } = buildTasks(refs, urls, index, titleFrameTextures, exportRoot, uassetIndex)
    // --filter 只保留匹配目标相对路径的资源；数据评估与 pak 搜索仍可能命中其它类别，在这里统一切掉
    const tasks = rawTasks.filter(task => matchesFilter(FILTER_REGEX, task.targetRelPath))
    const uassetTasks = rawUassetTasks.filter(task => matchesFilter(FILTER_REGEX, task.targetRelPath))
    const unresolved = rawUnresolved.filter(ref => !ref.name || matchesFilter(FILTER_REGEX, path.posix.join(ref.dir, `${ref.name}.webp`)))
    const missing = rawMissing.filter(ref => !ref.name || matchesFilter(FILTER_REGEX, path.posix.join(ref.dir, `${ref.name}.webp`)))
    if (FILTER_REGEX) {
        console.log(`过滤器 ${FILTER} 命中 ${tasks.length} 个 PNG 现货任务 / ${uassetTasks.length} 个 uasset 任务`)
        if (!tasks.length && !uassetTasks.length && !unresolved.length) {
            console.warn(`⚠️  过滤器 ${FILTER} 未命中任何资源，请检查正则或类别是否写错`)
        }
    }
    const allUassetTasks = [...uassetTasks]
    const allMissing = [...missing]

    // 本地推不出包路径的，只有 --allow-pak 才做全 pak 搜索；默认不读 pak，按缺失报告
    if (!ALLOW_PAK) {
        allMissing.push(...unresolved)
        if (unresolved.length) {
            console.log(`本地无 .uasset 映射 ${unresolved.length} 个：未开启 --allow-pak，跳过全 pak 搜索，按缺失报告`)
        }
    } else if (cliAvailable && unresolved.length) {
        const { uassetTasks: searched, stillMissing } = await resolveViaSearch(unresolved)
        allUassetTasks.push(...searched)
        allMissing.push(...stillMissing)
    } else {
        allMissing.push(...unresolved)
    }
    console.log(`待处理任务 ${tasks.length} 个（PNG 现货） + ${allUassetTasks.length} 个（uasset 解码）`)

    let converted = 0
    let skipped = 0
    let dryRunCount = 0
    /** 转换一批任务：单张失败只记缺失，不中断整批 */
    const convertAndReport = async (batch: ConvertTask[]): Promise<void> => {
        for (const task of batch) {
            let status: string
            let resizeInfo: ResizeInfo | null = null
            let lossless: boolean | null = null
            try {
                ;({ status, resizeInfo, lossless } = await convertTask(task))
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                console.warn(`  ~ 转换失败 ${task.targetRelPath} <- ${task.sourceRelPath}: ${message}`)
                const slash = task.targetRelPath.lastIndexOf("/")
                allMissing.push({
                    dir: task.targetRelPath.slice(0, slash),
                    name: task.targetRelPath.slice(slash + 1, -`.webp`.length),
                    source: `${task.referencedFrom}（WebP 转换失败）`,
                })
                continue
            }
            const note = formatResizeNote(resizeInfo) + (lossless ? "  [无损]" : "")
            if (status === "converted") {
                converted += 1
                console.log(`  ✅ ${task.targetRelPath}  <- ${task.sourceRelPath}${note}`)
            } else if (status === "skipped") {
                skipped += 1
            } else {
                dryRunCount += 1
                console.log(`  [dry-run] ${task.targetRelPath}  <- ${task.sourceRelPath}${note}`)
            }
        }
    }

    // 目标 WebP 已存在的无需烘焙（--force 时全量重做）
    const pendingUasset = FORCE
        ? allUassetTasks
        : allUassetTasks.filter(task => !fs.existsSync(path.join(publicImgsDir, task.targetRelPath)))
    console.log(`其中目标已存在、跳过烘焙 ${allUassetTasks.length - pendingUasset.length} 个`)

    if (DRY_RUN) {
        for (const task of pendingUasset) {
            const localPath = task.uassetAbsPath ?? path.join(exportRoot, ...task.uassetPkg.split("/"))
            console.log(
                `  [dry-run uasset] ${task.targetRelPath}  <- ${ALLOW_PAK ? `export-tex ${task.uassetPkg}` : `export-tex-file ${localPath}`}`
            )
        }
        await convertAndReport(tasks)
    } else {
        // 烘焙完一块就转一块：public/imgs 里持续落盘，中断也不白跑
        const CHUNK_SIZE = 100
        await convertAndReport(tasks)
        for (let begin = 0; begin < pendingUasset.length; begin += CHUNK_SIZE) {
            const chunk = pendingUasset.slice(begin, begin + CHUNK_SIZE)
            console.log(`\n--- 烘焙 ${begin + 1}-${begin + chunk.length}/${pendingUasset.length} ---`)
            const { tasks: baked, failed } = await exportUassetTextures(chunk, exportRoot)
            allMissing.push(...failed)
            await convertAndReport(baked)
        }
    }

    if (allMissing.length) {
        console.warn(`\n⚠️  有 ${allMissing.length} 个引用既无可用本地 uasset 也无 PNG 现货:`)
        const seen = new Set<string>()
        for (const ref of allMissing) {
            const key = `${ref.dir}/${ref.name ?? ""}`
            if (seen.has(key)) {
                continue
            }
            seen.add(key)
            console.warn(`  - ${ref.dir}/${ref.name}  (来自 ${ref.source})`)
        }
    }

    if (!tasks.length && !allUassetTasks.length) {
        console.log("没有需要转换的图片")
        return
    }

    if (DRY_RUN) {
        console.log(`\n演练完成: 将转换 ${dryRunCount} 个（PNG 现货） + ${pendingUasset.length} 个（uasset 烘焙）, 已存在 ${skipped} 个`)
    } else {
        console.log(`\n完成: 转换 ${converted} 个, 已存在跳过 ${skipped} 个`)
    }
}

if (import.meta.main) {
    main().catch(error => {
        console.error(error instanceof Error ? error.message : String(error))
        process.exit(1)
    })
}
