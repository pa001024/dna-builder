#!/usr/bin/env bun
/**
 * import-attr-i18n.ts — 把上游属性表里的属性名与属性说明文本导入前端翻译文件。
 *
 * 上游数据（<upstream>/out）：
 *   AttrConfig.json   属性表：Id（如 ATK_Fire）、Name（属性名文本 key）、AttrDesc（说明文本 key）
 *   TextMap_I18n.json 多语言文本表：一条记录同时带 CN/EN/FR/JP/KR/TC 文本
 *
 * 输出 public/i18n/<locale>/translation.json：
 *   1. 属性名（Attr_*_Name）——补进根命名空间，键为属性在 zh-CN 下的展示名。
 *      已存在译文的键不覆盖（避免踩掉人工译名），与键同名的条目按 zh-CN 既有惯例省略，
 *      因此 en/ja/ko/fr 能拿到「Pyro ATK」「切断攻撃」这类上游成品译名，
 *      两个组件不必再用「元素 + 攻击」拼串（拼串在部分语言下词序/空格是错的）。
 *   2. 属性说明（AttrDesc → ATTR_DESC_*）——写入 `attrDesc` 命名空间，键同上。
 *      读取入口：src/composables/useAttrDesc.ts。
 *
 * 键名与组件拼法（CharAttrShow / WeaponTab）保持一致：
 *   - 攻击行按元素/伤害类型区分，如「火属性攻击」（角色属性 + 属性攻击）与「切割攻击」（武器伤害类型 + 攻击）
 *   - 其余属性直接用属性键，个别键与上游中文名不同（见 ATTR_KEY_OVERRIDES）
 *
 * 用法:
 *   bun tools/import-attr-i18n.ts                     # 按默认上游路径导入
 *   bun tools/import-attr-i18n.ts --upstream <dir>    # 指定上游仓库根目录
 *   bun tools/import-attr-i18n.ts --check             # 只检查差异，不写文件（有差异时退出码 1）
 */

import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

/** 翻译文件目录 */
const I18N_DIR = path.resolve("public", "i18n")
/** 属性说明写入的命名空间 */
const NAMESPACE = "attrDesc"
/**
 * 上游仓库默认候选路径：
 * 优先与 import-i18n-data.ts 保持一致的同级目录，其次 D 盘正式副本
 * （同级副本可能缺少 out/TextMap_I18n.json，缺失时自动跳到下一个候选）。
 */
const UPSTREAM_CANDIDATES = [path.resolve("..", "DuetNightAbyssData2"), "D:/dev/DuetNightAbyssData2"]
/** 上游必需文件（相对上游根目录），用于判定候选路径是否有效 */
const REQUIRED_FILES = ["out/AttrConfig.json", "out/TextMap_I18n.json"]

/** 应用语言 → 上游文本表字段 */
const LOCALE_FIELDS = [
    { locale: "zh-CN", field: "TextMapContent" },
    { locale: "zh-TW", field: "ContentTC" },
    { locale: "en", field: "ContentEN" },
    { locale: "ja", field: "ContentJP" },
    { locale: "ko", field: "ContentKR" },
    { locale: "fr", field: "ContentFR" },
] as const

type LocaleField = (typeof LOCALE_FIELDS)[number]["field"]

/**
 * AttrConfig.Id → 翻译键覆盖表。
 * 仅在「前端属性键」与「上游属性中文名」不一致时需要覆盖；
 * 未列出的属性一律用上游中文名作键（攻击类属性即「火属性攻击」「切割攻击」这类展示名）。
 */
const ATTR_KEY_OVERRIDES: Record<string, string> = {
    // 上游 Attr_CRI_Name = 暴击率，前端 CharAttr/WeaponAttr 键为 暴击
    CRI: "暴击",
    // 上游 Attr_MultiShoot_Name = 多重射击，前端 WeaponAttr 键为 多重
    MultiShoot: "多重",
    // 上游 Attr_TriggerProbability_Name = 触发概率，前端 WeaponAttr 键为 触发
    TriggerProbability: "触发",
}

/**
 * 前端可能拿来做属性名/属性说明查询的属性名集合。
 * 与 src/data/CharBuild.ts 的 CharAttr / WeaponAttr 键保持一致，
 * 外加两个组件攻击行拼出的展示名（角色元素 + 属性攻击、武器伤害类型 + 攻击）。
 * 不在此集合内的上游属性不会写入翻译文件，仅打印提示，避免留下永不展示的死文案。
 */
const FRONTEND_ATTR_NAMES = new Set<string>([
    // CharAttr
    "攻击",
    "生命",
    "护盾",
    "防御",
    "神智",
    "技能威力",
    "技能耐久",
    "技能效益",
    "技能范围",
    "昂扬",
    "背水",
    "增伤",
    "元素增伤",
    "物理增伤",
    "武器伤害",
    "技能伤害",
    "独立增伤",
    "属性穿透",
    "无视防御",
    "技能无视防御",
    "技能速度",
    "失衡易伤",
    "技能倍率加数",
    "技能倍率乘数",
    "技能倍率赋值",
    "召唤物属性继承比例",
    "召唤物攻击速度",
    "召唤物范围",
    "召唤物伤害",
    "召唤物独立增伤",
    "减伤",
    "有效生命",
    "转切割",
    "转贯穿",
    "转震荡",
    "转灾厄",
    "转充盈",
    "转属克",
    "转属逆",
    "充盈威力",
    "技能触发",
    "异常数量",
    // WeaponAttr
    "暴击",
    "暴伤",
    "触发",
    "攻速",
    "多重",
    "装填",
    "弹匣",
    "弹药",
    "追加伤害",
    "武器倍率",
    "充盈转化",
    "召唤物攻击速度转化",
    "召唤物范围转化",
    // 攻击行展示名：角色元素（CharAttrShow / 同律继承攻击）+ 武器伤害类型（WeaponTab）
    "火属性攻击",
    "水属性攻击",
    "雷属性攻击",
    "风属性攻击",
    "光属性攻击",
    "暗属性攻击",
    "切割攻击",
    "贯穿攻击",
    "震荡攻击",
    "灾厄攻击",
])

/** 上游属性表行 */
type AttrConfigRow = {
    /** 属性 ID，如 ATK_Fire */
    Id?: string
    /** 属性名文本 key，如 Attr_ATK_Fire_Name */
    Name?: string
    /** 属性说明文本 key，如 ATTR_DESC_ATK_Fire；缺失表示该属性没有说明 */
    AttrDesc?: string
}

/** 上游多语言文本表行（只取用得到的字段） */
type TextMapRow = Partial<Record<LocaleField | "TextMapId", string>>

/** 解析后的单条属性 */
type AttrEntry = {
    /** 上游属性 ID */
    id: string
    /** 翻译键（= 属性在 zh-CN 下的展示名） */
    name: string
    /** 各语言的属性名（缺失语言不下发，运行时回落到 zh-CN） */
    nameTexts: Partial<Record<string, string>>
    /** 各语言的属性说明（同上） */
    descTexts: Partial<Record<string, string>>
}

/** 命令行参数 */
type CliOptions = {
    /** 显式指定的上游仓库根目录 */
    upstream?: string
    /** 只检查差异，不写文件 */
    check: boolean
}

/**
 * 解析命令行参数。
 * @returns 命令行选项
 */
function parseArgs(): CliOptions {
    const options: CliOptions = { check: false }
    const argv = Bun.argv.slice(2)
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index] ?? ""
        if (arg === "--check") {
            options.check = true
        } else if (arg === "--upstream") {
            const value = argv[index + 1]
            if (!value) {
                throw new Error("--upstream 需要一个上游仓库根目录参数")
            }
            options.upstream = value
            index++
        } else if (arg.startsWith("--upstream=")) {
            options.upstream = arg.slice("--upstream=".length)
        } else if (arg === "-h" || arg === "--help") {
            console.log("用法: bun tools/import-attr-i18n.ts [--upstream <dir>] [--check]")
            process.exit(0)
        } else {
            throw new Error(`未知参数：${arg}`)
        }
    }
    return options
}

/**
 * 判断候选目录是否包含全部必需上游文件。
 * @param root 候选上游根目录
 * @returns 是否为可用的上游目录
 */
async function isUsableUpstream(root: string): Promise<boolean> {
    for (const relativePath of REQUIRED_FILES) {
        try {
            await readFile(path.join(root, relativePath), "utf-8")
        } catch {
            return false
        }
    }
    return true
}

/**
 * 解析上游仓库根目录：命令行 > 环境变量 DNA_UPSTREAM > 默认候选列表。
 * @param explicit 命令行显式指定的目录
 * @returns 可用的上游根目录绝对路径
 */
async function resolveUpstreamRoot(explicit?: string): Promise<string> {
    // 显式指定（命令行/环境变量）时不做候选回退，直接校验，避免静默读到别的版本
    const specified = explicit ?? process.env.DNA_UPSTREAM
    if (specified) {
        const root = path.resolve(specified)
        if (!(await isUsableUpstream(root))) {
            throw new Error(`上游目录缺少必需文件（${REQUIRED_FILES.join(", ")}）：${root}`)
        }
        return root
    }

    for (const candidate of UPSTREAM_CANDIDATES) {
        if (await isUsableUpstream(candidate)) {
            return candidate
        }
    }

    throw new Error(
        `找不到可用的上游数据目录，已尝试：\n${UPSTREAM_CANDIDATES.map(item => `  - ${item}`).join("\n")}\n` +
            "请用 --upstream <dir> 或环境变量 DNA_UPSTREAM 指定 DuetNightAbyssData2 仓库根目录。"
    )
}

/**
 * 读取并解析 JSON 文件。
 * @param filePath 文件绝对路径
 * @returns 解析后的 JSON 值
 */
async function readJson<T>(filePath: string): Promise<T> {
    const text = await readFile(filePath, "utf-8")
    return JSON.parse(text) as T
}

/**
 * 按语言抽取文本表行里的多语言字段。
 * @param row 上游文本表行
 * @returns 语言 → 文案（空串/缺失不下发）
 */
function pickLocaleTexts(row: TextMapRow): Partial<Record<string, string>> {
    const texts: Partial<Record<string, string>> = {}
    for (const { locale, field } of LOCALE_FIELDS) {
        const text = row[field]?.trim()
        if (text) {
            texts[locale] = text
        }
    }
    return texts
}

/**
 * 收集上游属性名与属性说明，换算成可直接写入翻译文件的条目。
 * @param attrConfigs 上游属性表
 * @param textMap 上游多语言文本表
 * @returns 属性条目列表
 */
function collectAttrEntries(attrConfigs: Record<string, AttrConfigRow>, textMap: Record<string, TextMapRow>): AttrEntry[] {
    const entries: AttrEntry[] = []
    const skipped: string[] = []
    const missingTextMap: string[] = []

    for (const [id, row] of Object.entries(attrConfigs)) {
        const descKey = row.AttrDesc
        if (!descKey) {
            // 上游没配说明的属性直接跳过（如 ATK / 暴伤 / 生命 等）
            continue
        }

        const descRow = textMap[descKey]
        if (!descRow) {
            missingTextMap.push(`${id}(${descKey})`)
            continue
        }

        // 键名：优先覆盖表，其次上游中文属性名（攻击类属性即「火属性攻击」这类前端展示名）
        const name = (ATTR_KEY_OVERRIDES[id] ?? textMap[row.Name ?? ""]?.TextMapContent ?? "").trim()
        if (!name) {
            missingTextMap.push(`${id}(${row.Name ?? "?"} 无中文名)`)
            continue
        }
        if (/[.:]/.test(name)) {
            throw new Error(`属性名 ${JSON.stringify(name)}（${id}）包含 i18next 键分隔符 . 或 :，需要改用显式的翻译键`)
        }

        if (!FRONTEND_ATTR_NAMES.has(name)) {
            skipped.push(`${id} → ${name}`)
            continue
        }

        const nameRow = textMap[row.Name ?? ""]
        const descTexts = pickLocaleTexts(descRow)
        if (Object.keys(descTexts).length === 0) {
            missingTextMap.push(`${id}(${descKey} 无任何语言文本)`)
            continue
        }

        entries.push({
            id,
            name,
            // 属性名缺失时退回中文名，保证属性名键在各语言下都有值
            nameTexts: nameRow ? { "zh-CN": name, ...pickLocaleTexts(nameRow) } : { "zh-CN": name },
            descTexts,
        })
    }

    // 同键冲突会让后写入的属性覆盖前一个，属于上游/映射表问题，直接报错
    const byName = new Map<string, string>()
    for (const entry of entries) {
        const exist = byName.get(entry.name)
        if (exist) {
            throw new Error(`属性名 ${entry.name} 被 ${exist} 与 ${entry.id} 同时占用，请在 ATTR_KEY_OVERRIDES 中区分`)
        }
        byName.set(entry.name, entry.id)
    }

    entries.sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN"))

    if (missingTextMap.length > 0) {
        console.warn(`[warn] ${missingTextMap.length} 条属性在上游文本表中缺失，已跳过：${missingTextMap.join(", ")}`)
    }
    if (skipped.length > 0) {
        console.log(`[info] ${skipped.length} 条上游属性未被前端属性面板引用，未写入翻译文件：${skipped.join(", ")}`)
    }

    return entries
}

/**
 * 按语言生成 attrDesc 命名空间对象。
 * @param entries 属性条目
 * @param locale 应用语言
 * @returns 该语言的 attrDesc 对象
 */
function buildDescNamespace(entries: AttrEntry[], locale: string): Record<string, string> {
    const namespace: Record<string, string> = {}
    for (const entry of entries) {
        const text = entry.descTexts[locale]
        // 缺失语言不下发，运行时由 i18next 的 fallbackLng(zh-CN) 回落
        if (text) {
            namespace[entry.name] = text
        }
    }
    return namespace
}

/**
 * 校验说明文案不会与 i18next 插值/嵌套语法冲突（{{ }} 与 $t()）。
 * @param entries 属性条目
 */
function validateTexts(entries: AttrEntry[]): void {
    const conflicts: string[] = []
    for (const entry of entries) {
        for (const [locale, text] of Object.entries(entry.descTexts)) {
            // 缺失语言不会下发，这里只需校验确实存在文案的条目
            if (!text) {
                continue
            }
            if (text.includes("{{") || text.includes("$t(")) {
                conflicts.push(`${entry.name}(${locale})`)
            }
        }
    }
    if (conflicts.length > 0) {
        throw new Error(`以下说明文案含 i18next 插值语法，需要转义后再导入：${conflicts.join(", ")}`)
    }
}

/**
 * 仅对本次实际写入的文件执行 Biome 格式化，避免全仓库扫描。
 * @param files 本次变更文件的相对路径列表
 */
async function formatWithBiome(files: string[]): Promise<void> {
    if (files.length === 0) {
        return
    }
    // 通过 process.execPath（即当前 bun 可执行文件）调用 `bun x biome`，规避 Windows 下 .cmd 垫片问题
    const proc = Bun.spawn([process.execPath, "x", "biome", "check", "--write", "--linter-enabled=false", ...files], {
        stdout: "inherit",
        stderr: "inherit",
        stdin: "inherit",
    })
    const exitCode = await proc.exited
    if (exitCode !== 0) {
        throw new Error(`Biome 格式化失败，退出码 ${exitCode}`)
    }
}

/**
 * 执行导入。
 */
async function main() {
    const options = parseArgs()
    const upstreamRoot = await resolveUpstreamRoot(options.upstream)
    console.log(`上游目录：${upstreamRoot}`)

    const [attrConfigs, textMap] = await Promise.all([
        readJson<Record<string, AttrConfigRow>>(path.join(upstreamRoot, "out", "AttrConfig.json")),
        readJson<Record<string, TextMapRow>>(path.join(upstreamRoot, "out", "TextMap_I18n.json")),
    ])

    const entries = collectAttrEntries(attrConfigs, textMap)
    validateTexts(entries)
    console.log(`上游属性：${entries.length} 条（含属性名与属性说明）`)

    const changedFiles: string[] = []
    let addedNameCount = 0
    let updatedDescCount = 0

    for (const { locale } of LOCALE_FIELDS) {
        const filePath = path.join(I18N_DIR, locale, "translation.json")
        const originalText = await readFile(filePath, "utf-8")
        const translations = JSON.parse(originalText) as Record<string, unknown>

        // 1) 属性名：只补齐缺失的键，绝不覆盖已有译名；与键同名的条目按 zh-CN 既有惯例省略
        let mutated = false
        for (const entry of entries) {
            const nameText = entry.nameTexts[locale]
            if (!nameText || nameText === entry.name) {
                continue
            }
            if (typeof translations[entry.name] === "string") {
                continue
            }
            translations[entry.name] = nameText
            addedNameCount++
            mutated = true
        }

        // 2) 属性说明：整体替换 attrDesc 命名空间，上游删掉的属性同步清理
        const nextDesc = buildDescNamespace(entries, locale)
        if (JSON.stringify(translations[NAMESPACE]) !== JSON.stringify(nextDesc)) {
            translations[NAMESPACE] = nextDesc
            updatedDescCount++
            mutated = true
        }

        if (!mutated) {
            continue
        }

        if (options.check) {
            changedFiles.push(path.relative(process.cwd(), filePath))
            continue
        }

        await writeFile(filePath, `${JSON.stringify(translations, null, 4)}\n`, "utf-8")
        changedFiles.push(path.relative(process.cwd(), filePath))
    }

    if (options.check) {
        if (changedFiles.length === 0) {
            console.log("✓ 翻译文件已是最新，无需更新")
            return
        }
        console.log(`✗ 有 ${changedFiles.length} 个翻译文件需要更新：`)
        for (const file of changedFiles) {
            console.log(`- ${file}`)
        }
        process.exit(1)
    }

    console.log(`已更新 ${changedFiles.length} 个文件（新增属性名 ${addedNameCount} 条，重写说明命名空间 ${updatedDescCount} 次）`)
    for (const file of changedFiles) {
        console.log(`- ${file}`)
    }

    await formatWithBiome(changedFiles)
}

main().catch(error => {
    console.error(error)
    process.exit(1)
})
