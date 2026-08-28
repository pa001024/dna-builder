#!/usr/bin/env bun

import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

/**
 * webp-import
 *
 * 自动把 data 中真正引用的图片从 FModel 导出的纹理 PNG 目录转成 WebP 并复制到 public/imgs 下。
 *
 * 引用来源有两种，两者合并即为“真实引用集合”：
 *   1. 文本扫描：src/data 里出现的 /imgs/** 字符串字面量（精确引用，如 rank 目录、占位图等）。
 *   2. 数据评估：导入实际数据层，调用 Leveled* 的 URL 生成器，
 *      枚举全部角色/武器/模组/怪物/宠物/钓鱼/读物/技能等真实取值。
 *      不再用 `${icon}` 模板对源目录做通配展开，避免导入从未使用的贴图。
 *
 * PNG→WebP 使用 Bun 内置的 Bun.Image，不依赖 sharp/cwebp 等外部库。
 * res/ 目录下的图片按 maxHeight（默认 128）等比缩小：高度超出则缩小、不放大。
 *
 * 用法:
 *   bun tools/webp-import.ts                 # 增量导入缺失的 WebP
 *   bun tools/webp-import.ts --force         # 强制重新转换（覆盖已有 WebP）
 *   bun tools/webp-import.ts --dry-run       # 只统计不落盘
 *   bun tools/webp-import.ts --data <dir>    # 覆盖文本扫描目录（默认 src/data）
 *   bun tools/webp-import.ts --source <dir>  # 覆盖 FModel 纹理导出目录
 *   bun tools/webp-import.ts --out <dir>     # 覆盖输出目录（默认 public/imgs）
 *   bun tools/webp-import.ts --quality 90    # 覆盖 WebP 质量（默认 90）
 *   bun tools/webp-import.ts --res-max-height 128   # res 目录图片最大高度，超出等比缩小（默认 128）
 *
 * 环境变量同样生效: WEBP_IMPORT_DATA_DIR / WEBP_IMPORT_SOURCE / WEBP_IMPORT_OUT / WEBP_IMPORT_QUALITY / WEBP_IMPORT_RES_MAX_HEIGHT
 */

type ImageRef = {
    /** 目标子目录（相对 public/imgs），如 "webp"、"rank/vx03" */
    dir: string
    /** 完整 basename（精确引用），如 "T_Head_Empty" */
    name?: string
    /** 模板引用（含 ${...}）推导出的 basename 骨架正则，如 /^T_Head_.*$/ */
    pattern?: RegExp
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

type IconItem = { icon?: string }
type CharLike = IconItem & {
    属性?: string
    技能?: IconItem[]
    同律武器?: (IconItem & { 技能?: IconItem[] })[]
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
}

const rootDir = path.resolve(".")
const args = process.argv.slice(2)
const FORCE = args.includes("--force")
const DRY_RUN = args.includes("--dry-run")
const QUALITY = Number(getArgValue("--quality") ?? process.env.WEBP_IMPORT_QUALITY ?? "90")
/** res 目录图片的最大高度：超出时等比缩小，不放大（默认 128） */
const RES_MAX_HEIGHT = Number(getArgValue("--res-max-height") ?? process.env.WEBP_IMPORT_RES_MAX_HEIGHT ?? "128")

const dataDir = getArgValue("--data") ?? process.env.WEBP_IMPORT_DATA_DIR ?? path.join(rootDir, "src", "data")
const publicImgsDir = getArgValue("--out") ?? process.env.WEBP_IMPORT_OUT ?? path.join(rootDir, "public", "imgs")
const sourceRoot = resolveSourceRoot(getArgValue("--source") ?? process.env.WEBP_IMPORT_SOURCE)

/**
 * 探测 FModel 纹理导出目录：优先 DNA 解包目录（dna-unpack），兼顾用户给定路径与常见拼写变体。
 * @param override 用户显式指定的目录
 * @returns 存在的源目录
 */
function resolveSourceRoot(override?: string): string {
    const candidates = [
        override,
        path.join(rootDir, "..", "dna-unpack", "Fmodel", "Output", "Exports", "EM", "Content", "UI", "Texture"),
        path.join(rootDir, "..", "dna-unpack", "Fmodel", "Output", "Exports", "EM", "Content", "Texture"),
        path.join(rootDir, "..", "Fmodel", "Output", "Exports", "EM", "Conten", "U", "Texture"),
        path.join(rootDir, "..", "Fmodel", "Output", "Exports", "EM", "Content", "UI", "Texture"),
        path.join(rootDir, "..", "Fmodel", "Output", "Exports", "EM", "Content", "Texture"),
    ].filter((value): value is string => Boolean(value))

    const existing = candidates.find(value => fs.existsSync(value))
    if (existing) {
        return existing
    }

    throw new Error(`未找到 FModel 纹理导出目录，请用 --source 指定。已尝试:\n${candidates.map(value => `  - ${value}`).join("\n")}`)
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
        const absPath = path.join(dirPath, entry.name)
        const relPath = relDir ? path.join(relDir, entry.name) : entry.name
        if (entry.isDirectory()) {
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

    // 去掉 ${...} 占位符后的静态文本；为空表示全通配（如 ${icon}.webp），无枚举意义
    const staticText = basenamePart.replace(/\$\{[^}]*\}/g, "")
    if (!staticText) {
        return null
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
    const dataFiles = walkFiles(dirPath, [".ts", ".js", ".mjs", ".vue"])

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
    const appDataDir = path.join(rootDir, "src", "data")
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
        skinData: IconItem[]
    }>("d/accessory.data.ts")
    const { default: rewardList } = await loadModule<{ default: IconItem[] }>("d/reward.data.ts")
    const { default: reputationList } = await loadModule<{ default: IconItem[] }>("d/reputation.data.ts")
    const { questChainData } = await loadModule<{ questChainData: IconItem[] }>("d/questchain.data.ts")
    const { hardBossMap } = await loadModule<{ hardBossMap: Map<number, IconItem> }>("d/hardboss.data.ts")
    const { subRegionData } = await loadModule<{ subRegionData: IconItem[] }>("d/subregion.data.ts")
    const { extractionTreasureData } = await loadModule<{ extractionTreasureData: IconItem[] }>("d/solotreasure.data.ts")

    const { LeveledChar } = await loadModule<{ LeveledChar: LeveledCharLike }>("leveled/LeveledChar.ts")
    const { LeveledWeapon } = await loadModule<{ LeveledWeapon: LeveledWeaponLike }>("leveled/LeveledWeapon.ts")
    const { LeveledMod } = await loadModule<{ LeveledMod: UrlBuilder }>("leveled/LeveledMod.ts")
    const { LeveledMonster } = await loadModule<{ LeveledMonster: UrlBuilder }>("leveled/LeveledMonster.ts")
    const { LeveledPet } = await loadModule<{ LeveledPet: UrlBuilder }>("leveled/LeveledPet.ts")
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

    // 模组 / 怪物 / 宠物
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
    for (const boss of hardBossMap.values()) {
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
 * 根据精确引用与评估出的 URL 集合构建转换任务。
 * @param refs 精确引用列表
 * @param urls 数据评估产生的完整 URL 集合
 * @param index basename 源索引
 * @returns 任务列表与缺失引用
 */
function buildTasks(refs: ImageRef[], urls: Set<string>, index: Map<string, SourceFile[]>): { tasks: ConvertTask[]; missing: ImageRef[] } {
    const tasksByTarget = new Map<string, ConvertTask>()
    const missing: ImageRef[] = []

    const resolveTask = (dir: string, name: string, referencedFrom: string): void => {
        const targetRelPath = path.posix.join(dir, `${name}.webp`)
        const sourceEntries = index.get(name.toLowerCase())
        const source = pickSource(sourceEntries ?? [])
        if (!source) {
            missing.push({ dir, name, source: referencedFrom })
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

    return { tasks: [...tasksByTarget.values()], missing }
}

/**
 * 计算 res 目录图片的等比缩小目标尺寸（maxHeight 限制：超出缩小、不放大）。
 * 非 res 目录或高度未超限时返回 null。
 * @param sourceAbsPath 源 PNG 路径
 * @param targetRelPath 目标相对路径（相对 public/imgs）
 * @returns 缩小信息；无需缩小返回 null
 */
async function getResizeInfo(sourceAbsPath: string, targetRelPath: string): Promise<ResizeInfo | null> {
    if (!targetRelPath.startsWith("res/")) {
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
    }
}

/**
 * 将缩小信息格式化为日志后缀。
 * @param info 缩小信息
 * @returns 日志后缀文本
 */
function formatResizeNote(info: ResizeInfo | null): string {
    return info ? `  (res 缩小: ${info.originalWidth}x${info.originalHeight} -> ${info.width}x${info.height})` : ""
}

/**
 * 使用 Bun 内置的 Bun.Image 转换单张 PNG → WebP 并写入目标路径。
 * res 目录图片按传入的缩小信息先等比缩小再编码。
 * @param sourceAbsPath 源 PNG 路径
 * @param destAbsPath 目标 WebP 路径
 * @param resizeInfo res 目录缩小信息；null 表示不缩小
 * @param quality 质量
 */
async function convertWithBunImage(
    sourceAbsPath: string,
    destAbsPath: string,
    resizeInfo: ResizeInfo | null,
    quality: number
): Promise<void> {
    if (typeof Bun.Image !== "function") {
        throw new Error("当前 Bun 版本不支持 Bun.Image，请升级 Bun 后再运行")
    }

    const image = new Bun.Image(sourceAbsPath)
    const webp = resizeInfo
        ? image.resize(resizeInfo.width, resizeInfo.height).webp({ quality, lossless: false })
        : image.webp({ quality, lossless: false })
    fs.mkdirSync(path.dirname(destAbsPath), { recursive: true })
    await webp.write(destAbsPath)
}

/**
 * 转换单个任务：PNG → WebP 写入 public。
 * @param task 转换任务
 * @returns 转换状态与缩小信息
 */
async function convertTask(task: ConvertTask): Promise<{ status: "converted" | "skipped" | "dry-run"; resizeInfo: ResizeInfo | null }> {
    const destAbsPath = path.join(publicImgsDir, task.targetRelPath)
    if (!FORCE && fs.existsSync(destAbsPath)) {
        return { status: "skipped", resizeInfo: null }
    }

    const resizeInfo = await getResizeInfo(task.sourceAbsPath, task.targetRelPath)

    if (DRY_RUN) {
        return { status: "dry-run", resizeInfo }
    }

    await convertWithBunImage(task.sourceAbsPath, destAbsPath, resizeInfo, QUALITY)

    return { status: "converted", resizeInfo }
}

/**
 * 主流程。
 */
async function main(): Promise<void> {
    if (!Number.isFinite(QUALITY) || QUALITY < 1 || QUALITY > 100) {
        throw new Error(`无效的 WebP 质量: ${QUALITY}`)
    }

    console.log(`扫描数据目录: ${dataDir}`)
    console.log(`纹理导出目录: ${sourceRoot}`)
    console.log(`输出目录: ${publicImgsDir}`)

    // 文本扫描: 默认覆盖整个 src（data/components/utils/views），静态字面量引用（如
    // /imgs/webp/T_Icon_Random_Title.webp、/imgs/tp/T_Gp_MainMission.webp）都在视图层；
    // 传 --data 时仅扫描指定目录
    const defaultScanDirs = [
        path.join(rootDir, "src", "data"),
        path.join(rootDir, "src", "components"),
        path.join(rootDir, "src", "utils"),
        path.join(rootDir, "src", "views"),
    ]
    const refs = (dataDir !== path.join(rootDir, "src", "data") ? [dataDir] : defaultScanDirs).flatMap(dir => collectRefs(dir))
    const exactRefs = refs.filter(ref => Boolean(ref.name))
    const templateRefs = refs.filter(ref => Boolean(ref.pattern))
    console.log(`文本引用 ${refs.length} 处（精确 ${exactRefs.length}，模板 ${templateRefs.length}）`)

    const urls = await evaluateDataUrls()
    console.log(`数据评估引用 ${urls.size} 个 URL`)

    // 校验模板是否都被数据评估覆盖（发现新模板但枚举不到时提醒）
    for (const ref of templateRefs) {
        const matched = [...urls].some(url => {
            const lastSlash = url.lastIndexOf("/")
            return ref.pattern?.test(url.slice(lastSlash + 1, url.length - ".webp".length)) ?? false
        })
        if (!matched) {
            console.warn(`⚠️  模板 ${ref.dir}/${ref.pattern?.source} 未在数据评估中产生任何引用，可能枚举不完整 (${ref.source})`)
        }
    }

    const index = buildSourceIndex(sourceRoot)
    console.log(`索引到源 PNG ${index.size} 个`)

    const { tasks, missing } = buildTasks(refs, urls, index)
    console.log(`待处理任务 ${tasks.length} 个`)

    if (missing.length) {
        console.warn(`\n⚠️  有 ${missing.length} 个引用未在导出目录中找到 PNG:`)
        const seen = new Set<string>()
        for (const ref of missing) {
            const key = `${ref.dir}/${ref.name ?? ""}`
            if (seen.has(key)) {
                continue
            }
            seen.add(key)
            console.warn(`  - ${ref.dir}/${ref.name}  (来自 ${ref.source})`)
        }
    }

    if (!tasks.length) {
        console.log("没有需要转换的图片")
        return
    }

    let converted = 0
    let skipped = 0
    let dryRun = 0
    for (const task of tasks) {
        const { status, resizeInfo } = await convertTask(task)
        const note = formatResizeNote(resizeInfo)
        if (status === "converted") {
            converted += 1
            console.log(`  ✅ ${task.targetRelPath}  <- ${task.sourceRelPath}${note}`)
        } else if (status === "skipped") {
            skipped += 1
        } else {
            dryRun += 1
            console.log(`  [dry-run] ${task.targetRelPath}  <- ${task.sourceRelPath}${note}`)
        }
    }

    if (DRY_RUN) {
        console.log(`\n演练完成: 将转换 ${dryRun} 个, 已存在 ${skipped} 个`)
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
