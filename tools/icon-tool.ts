#!/usr/bin/env bun

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { join, relative } from "node:path"
import { format } from "prettier"

const ICON_FILE = "src/components/Icon.vue"
const REMIXICON_GLYPH_FILE = "node_modules/remixicon/fonts/remixicon.glyph.json"
const PROJECT_DIR = "src"
const IGNORE_LIST_FILE = "tools/.icon_ignore"
// radix 图标缓存目录（被 .gitignore 忽略，丢失时由本工具自动重建）
const RADIX_ICONS_DIR = join(__dirname, "radix-icons")
const RADIX_ICON_PREFIX = "radix-icons:"
// radix-icons 的 viewBox 与 Icon.vue 中登记的 size 均为 15
const RADIX_ICON_SIZE = 15
// radix 图标上游数据源：iconify 的 radix-icons 集合。锁 1.2.1 —— 该版几何与 Icon.vue 中已有 radix 图标同源
// （例如 chevron-down 的 d 完全一致），上游 1.4 重绘过图标，不锁定会让新老图标风格不一致
const RADIX_ICONS_URLS = [
    "https://unpkg.com/@iconify-json/radix-icons@1.2.1/icons.json",
    "https://cdn.jsdelivr.net/npm/@iconify-json/radix-icons@1.2.1/icons.json",
]

type IconData = {
    path: string[]
    unicode: string
    glyph: string
    horizAdvX: string
}

type IconifyCollection = {
    width?: number
    height?: number
    icons?: Record<string, { body?: string }>
    aliases?: Record<string, { parent?: string }>
}

// type IconDataEntry = [string, number] | [string, number, Record<string, any>]

async function loadIgnoreList(): Promise<Set<string>> {
    try {
        const content = await readFile(IGNORE_LIST_FILE, "utf-8")
        return new Set(content.split("\n").filter(line => line.trim() && !line.startsWith("#")))
    } catch {
        return new Set()
    }
}

async function saveIgnoreList(icons: Set<string>): Promise<void> {
    const content = `${Array.from(icons).sort().join("\n")}\n`
    await writeFile(IGNORE_LIST_FILE, content, "utf-8")
}

async function loadRemixiconData(): Promise<Record<string, IconData>> {
    const content = await readFile(REMIXICON_GLYPH_FILE, "utf-8")
    return JSON.parse(content)
}

async function loadIconVueData(): Promise<Record<string, any>> {
    const content = await readFile(ICON_FILE, "utf-8")

    const dataMatch = content.match(/const data = \{([\s\S]*?)\} satisfies/)
    if (!dataMatch) {
        throw new Error("无法找到 Icon.vue 中的 data 对象")
    }

    const dataContent = `{${dataMatch[1]}}`
    // biome-ignore lint/security/noGlobalEval: false positive
    return eval(`(${dataContent})`)
}

async function saveIconVueData(data: Record<string, any>): Promise<void> {
    const content = await readFile(ICON_FILE, "utf-8")

    const dataEntries = Object.entries(data)
        .map(([key, value]) => {
            const [path, size, attrs] = value
            if (attrs && Object.keys(attrs).length > 0) {
                const attrsStr = JSON.stringify(attrs)
                return `    "${key}": [\n        "${path}",\n        ${size ?? 24},\n        ${attrsStr},\n    ],`
            } else if (size !== undefined) {
                return `    "${key}": [\n        "${path}",\n        ${size},\n    ],`
            } else {
                return `    "${key}": [\n        "${path}",\n    ],`
            }
        })
        .join("\n")

    const newDataContent = `const data = {\n${dataEntries}\n} satisfies { [key: string]: [string, number?, Partial<SVGAttributes>?] }`
    const newContent = content.replace(/const data = \{[\s\S]*?\} satisfies \{[\s\S]*?\}/, newDataContent)

    const formattedContent = await format(newContent, {
        parser: "vue",
        filepath: ICON_FILE,
        tabWidth: 4,
        useTabs: false,
        semi: false,
        printWidth: 140,
    })

    await writeFile(ICON_FILE, formattedContent, "utf-8")
}

/** 上游 radix 图标集合的内存缓存，避免同一次运行内重复下载 */
let radixCollectionCache: IconifyCollection | null = null

/**
 * 归一化图标名：只保留小写字母与数字，用于兼容 cross2 / cross-2 / Cross2Icon 等不同书写方式。
 * @param name 图标名
 * @returns 归一化后的名称
 */
function normalizeIconName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, "")
}

/**
 * 从 SVG 文本中提取全部 path 的 d 数据并拼接成一条。
 * Icon.vue 只渲染单个 <path fill-rule="evenodd">，多段子路径拼接后渲染结果与原始多 path 一致。
 * @param svgContent SVG 文件内容
 * @returns 拼接后的 path 数据；未找到 path 时返回 null
 */
function extractSvgPathData(svgContent: string): string | null {
    const paths = [...svgContent.matchAll(/<path\b[^>]*?\bd="([^"]*)"/g)].map(match => match[1])
    if (paths.length === 0) {
        return null
    }
    return paths.join("")
}

/**
 * 在缓存目录中按归一化名称查找已缓存的 SVG 文件（兼容 cross2.svg / cross-2.svg / Cross2Icon.svg 等命名）。
 * @param radixIconName 图标名（不含 radix-icons: 前缀）
 * @returns 命中的 SVG 内容与文件绝对路径；未命中返回 null
 */
async function readCachedRadixIcon(radixIconName: string): Promise<{ svg: string; file: string } | null> {
    let entries: string[]
    try {
        entries = await readdir(RADIX_ICONS_DIR)
    } catch {
        return null
    }

    const target = normalizeIconName(radixIconName)
    const hit = entries.find(entry => entry.toLowerCase().endsWith(".svg") && normalizeIconName(entry.slice(0, -4)) === target)
    if (!hit) {
        return null
    }

    const file = join(RADIX_ICONS_DIR, hit)
    return { svg: await readFile(file, "utf-8"), file }
}

/**
 * 下载并解析 iconify 的 radix-icons 集合（多镜像依次尝试，结果在进程内缓存）。
 * @returns iconify 的 radix-icons 集合数据
 * @throws 所有镜像都不可用时抛出错误
 */
async function loadRadixCollection(): Promise<IconifyCollection> {
    if (radixCollectionCache) {
        return radixCollectionCache
    }

    const errors: string[] = []
    for (const url of RADIX_ICONS_URLS) {
        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
            if (!response.ok) {
                errors.push(`${url} -> HTTP ${response.status}`)
                continue
            }
            radixCollectionCache = (await response.json()) as IconifyCollection
            return radixCollectionCache
        } catch (error) {
            errors.push(`${url} -> ${error instanceof Error ? error.message : String(error)}`)
        }
    }

    throw new Error(`无法下载 radix 图标数据（需要网络）：\n  ${errors.join("\n  ")}`)
}

/**
 * 在 iconify 集合中解析图标名：支持精确名、别名与归一化名称（如 cross2 → cross-2）。
 * @param collection iconify 集合数据
 * @param radixIconName 待解析的图标名
 * @returns 集合中登记的名字与 path body；未找到返回 null
 */
function resolveRadixIcon(collection: IconifyCollection, radixIconName: string): { name: string; body: string } | null {
    const icons = collection.icons ?? {}
    const aliases = collection.aliases ?? {}
    const target = normalizeIconName(radixIconName)

    let resolved: string | undefined = icons[radixIconName] ? radixIconName : aliases[radixIconName]?.parent
    if (!resolved) {
        resolved = Object.keys(icons).find(name => normalizeIconName(name) === target)
    }
    if (!resolved) {
        const aliasHit = Object.keys(aliases).find(name => normalizeIconName(name) === target)
        resolved = aliasHit ? aliases[aliasHit]?.parent : undefined
    }
    if (!resolved) {
        return null
    }

    // 跟随别名链（当前上游只有一级，仍做环形保护）
    const visited = new Set<string>()
    while (!icons[resolved] && aliases[resolved]?.parent && !visited.has(resolved)) {
        visited.add(resolved)
        resolved = aliases[resolved]?.parent as string
    }

    const body = icons[resolved]?.body
    return body ? { name: resolved, body } : null
}

/**
 * 获取 radix 图标 SVG：优先读本地缓存 tools/radix-icons/，缺失时从 iconify 下载并写入缓存（目录会自动创建）。
 * @param radixIconName 图标名（不含 radix-icons: 前缀）
 * @returns SVG 内容
 * @throws 图标名不存在或下载失败时抛出错误
 */
async function loadRadixIconSvg(radixIconName: string): Promise<string> {
    const cached = await readCachedRadixIcon(radixIconName)
    if (cached) {
        console.log(`📦 使用缓存图标: ${relative(process.cwd(), cached.file)}`)
        return cached.svg
    }

    const collection = await loadRadixCollection()
    const icon = resolveRadixIcon(collection, radixIconName)
    if (!icon) {
        const target = normalizeIconName(radixIconName)
        const suggestions = Object.keys(collection.icons ?? {})
            .filter(name => normalizeIconName(name).includes(target))
            .slice(0, 10)
        const hint = suggestions.length > 0 ? `\n  相近的图标: ${suggestions.join(", ")}` : ""
        throw new Error(`iconify 的 radix-icons 集合中不存在图标 "${radixIconName}"${hint}`)
    }

    const width = collection.width ?? RADIX_ICON_SIZE
    const height = collection.height ?? width
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${icon.body}</svg>\n`

    await mkdir(RADIX_ICONS_DIR, { recursive: true })
    const file = join(RADIX_ICONS_DIR, `${icon.name}.svg`)
    await writeFile(file, svg, "utf-8")
    console.log(`⬇️  已下载并缓存 radix 图标: ${relative(process.cwd(), file)}`)
    return svg
}

/**
 * 补齐 radix 图标缓存目录：把 Icon.vue 中已登记的 radix 图标（外加命令行指定的名字）下载到 tools/radix-icons/。
 * 目录被清理或全新克隆后可随时用它重建。
 * @param extraNames 额外需要缓存的图标名（可带 radix-icons: 前缀）
 */
async function syncRadixCache(extraNames: string[]): Promise<void> {
    console.log("正在补齐 radix 图标缓存...")

    const iconVueData = await loadIconVueData()
    const names = new Set<string>(
        Object.keys(iconVueData)
            .filter(key => key.startsWith(RADIX_ICON_PREFIX))
            .map(key => key.slice(RADIX_ICON_PREFIX.length))
    )
    for (const name of extraNames) {
        names.add(name.startsWith(RADIX_ICON_PREFIX) ? name.slice(RADIX_ICON_PREFIX.length) : name)
    }

    let ok = 0
    let failed = 0
    for (const name of [...names].sort()) {
        const cached = await readCachedRadixIcon(name)
        if (cached) {
            console.log(`✔️  已有缓存: ${relative(process.cwd(), cached.file)}`)
            ok++
            continue
        }
        try {
            await loadRadixIconSvg(name)
            ok++
        } catch (error) {
            failed++
            console.error(`❌ ${name}: ${error instanceof Error ? error.message : error}`)
        }
    }

    console.log(
        `\n共 ${names.size} 个 radix 图标，可用 ${ok} 个，失败 ${failed} 个（缓存目录: ${relative(process.cwd(), RADIX_ICONS_DIR)}）`
    )
    if (failed > 0) {
        process.exitCode = 1
    }
}

async function addIcon(iconName: string): Promise<void> {
    console.log(`正在添加图标: ${iconName}`)

    // 处理 radix-icons 前缀：SVG 来自 iconify，tools/radix-icons/ 仅作本地缓存
    if (iconName.startsWith(RADIX_ICON_PREFIX)) {
        const radixIconName = iconName.slice(RADIX_ICON_PREFIX.length)
        const iconVueData = await loadIconVueData()

        // 检查图标是否已存在
        if (iconVueData[iconName]) {
            console.log(`⚠️  图标 ${iconName} 已存在于 Icon.vue 中`)
            return
        }

        try {
            const svgContent = await loadRadixIconSvg(radixIconName)

            // 提取 path 数据
            const pathData = extractSvgPathData(svgContent)
            if (!pathData) {
                console.error(`❌ 无法从 radix 图标中提取 path 数据: ${radixIconName}`)
                return
            }

            iconVueData[iconName] = [pathData, RADIX_ICON_SIZE]
            await saveIconVueData(iconVueData)

            console.log(`✅ 成功添加图标: ${iconName}`)
        } catch (error) {
            console.error(`❌ 无法获取 radix-icons 图标: ${radixIconName}`)
            console.error(error instanceof Error ? error.message : error)
        }
        return
    }

    // 原有的 remixicon 处理逻辑
    const remixiconData = await loadRemixiconData()
    const iconData = remixiconData[iconName]

    if (!iconData) {
        console.error(`❌ 在 remixicon 包中未找到图标: ${iconName}`)
        console.log(`🔍 正在搜索包含 "${iconName}" 的图标...`)
        for (const part of iconName.split("-")) {
            if (["line", "fill"].includes(part)) continue
            await listAvailableIcons(part)
        }
        return
    }

    const iconVueData = await loadIconVueData()
    const key = `ri:${iconName}`

    if (iconVueData[key]) {
        console.log(`⚠️  图标 ${key} 已存在于 Icon.vue 中`)
        return
    }

    iconVueData[key] = [iconData.path.join("")]
    await saveIconVueData(iconVueData)

    console.log(`✅ 成功添加图标: ${key}`)
}

async function findUsedIcons(): Promise<Set<string>> {
    const usedIcons = new Set<string>()

    interface VariableInfo {
        name: string
        possibleValues: string[]
        isDynamic: boolean
    }

    const variableMap = new Map<string, VariableInfo>()

    function analyzeVariableBindings(content: string): void {
        const bindings = content.matchAll(/:icon\s*=\s*["']([^"']+)["']/g)

        for (const match of bindings) {
            const expression = match[1].trim()

            if (expression.startsWith("'") || expression.startsWith('"')) {
                const icon = expression.slice(1, -1)
                usedIcons.add(icon)
            } else {
                const varName = expression.split(".")[0].split("[")[0]
                if (!variableMap.has(varName)) {
                    variableMap.set(varName, {
                        name: varName,
                        possibleValues: [],
                        isDynamic: true,
                    })
                }
            }
        }
    }

    function findVariableDefinitions(content: string): void {
        const lines = content.split("\n")

        for (const line of lines) {
            const trimmedLine = line.trim()

            const constAssignment = trimmedLine.match(/const\s+(\w+)\s*[:=]\s*["']([^"']+)["']/)
            if (constAssignment) {
                const varName = constAssignment[1]
                const icon = constAssignment[2]
                usedIcons.add(icon)

                const info = variableMap.get(varName)
                if (info) {
                    info.possibleValues.push(icon)
                    info.isDynamic = false
                }
                continue
            }

            const constObjectAssignment = trimmedLine.match(/const\s+(\w+)\s*[=:]\s*\{[^}]*icon\s*:\s*["']([^"']+)["']/)
            if (constObjectAssignment) {
                const icon = constObjectAssignment[2]
                usedIcons.add(icon)
                continue
            }

            const computedIcon = trimmedLine.match(/const\s+(\w+)\s*=\s*computed\s*\([^)]*\)\s*=>\s*["']([^"']+)["']/)
            if (computedIcon) {
                const varName = computedIcon[1]
                const icon = computedIcon[2]
                usedIcons.add(icon)

                const info = variableMap.get(varName)
                if (info) {
                    info.possibleValues.push(icon)
                    info.isDynamic = false
                }
                continue
            }

            const returnIcon = trimmedLine.match(/return\s*\{[^}]*icon\s*:\s*["']([^"']+)["']/)
            if (returnIcon) {
                const icon = returnIcon[1]
                usedIcons.add(icon)
            }

            const iconAssignment = trimmedLine.match(/\w+\.icon\s*=\s*["']([^"']+)["']/)
            if (iconAssignment) {
                const icon = iconAssignment[1]
                usedIcons.add(icon)
            }

            const stringTemplateIcon = trimmedLine.match(/icon:\s*`([^`]+)`/)
            if (stringTemplateIcon) {
                const template = stringTemplateIcon[1]
                const staticParts = template.split(/\$\{.*?\}/).filter(p => p)
                staticParts.forEach(part => {
                    if (part.includes("'") || part.includes('"')) {
                        const matches = part.match(/["']([^"']+)["']/g)
                        if (matches) {
                            matches.forEach(m => {
                                const icon = m.slice(1, -1)
                                if (icon.includes(":")) {
                                    usedIcons.add(icon)
                                }
                            })
                        }
                    }
                })
            }

            const stringLiteralIcon = trimmedLine.match(/["']([^"']+?)["']/)
            if (stringLiteralIcon) {
                const value = stringLiteralIcon[1]
                if (
                    value.startsWith("ri:") ||
                    value.startsWith("la:") ||
                    value.startsWith("radix-icons:") ||
                    value.startsWith("tabler:") ||
                    value.startsWith("codicon:")
                ) {
                    usedIcons.add(value)
                }
            }
        }
    }

    function findConditionalIcons(content: string): void {
        const conditionalMatches = content.matchAll(/icon\s*[?:].*?["']([^"']+)["']/g)
        for (const match of conditionalMatches) {
            const icon = match[1]
            if (icon.includes(":")) {
                usedIcons.add(icon)
            }
        }

        // 匹配模板中的三元表达式，如 :icon="guide.isLiked ? 'ri:heart-fill' : 'ri:heart-line'"
        // 处理嵌套引号：外层是双引号，内层是单引号
        const ternaryMatches = content.matchAll(/:icon\s*=\s*"[^"]*?\?[^"]*?['"]([^'"]+)['"][^"]*?:[^"]*?['"]([^'"]+)['"][^"]*?"/g)
        for (const match of ternaryMatches) {
            // match[1] 是第一个分支（? 后面的值）
            // match[2] 是第二个分支（: 后面的值）
            if (match[1]?.includes(":")) {
                usedIcons.add(match[1])
            }
            if (match[2]?.includes(":")) {
                usedIcons.add(match[2])
            }
        }
    }

    function findLoopIcons(content: string): void {
        const vForMatches = content.matchAll(/v-for=".*?in\s+(\w+)"/g)
        const itemVars = new Set<string>()
        for (const match of vForMatches) {
            itemVars.add(match[1])
        }

        const propAccess = content.matchAll(/:icon\s*=\s*item\.\w+/g)
        for (const match of propAccess) {
            const propName = match[0].match(/\.(\w+)/)?.[1]
            if (propName) {
                const iconCandidates = content.matchAll(/icon:\s*["']([^"']+)["']/g)
                for (const candidate of iconCandidates) {
                    if (candidate[1].includes(":")) {
                        usedIcons.add(candidate[1])
                    }
                }
            }
        }
    }

    function findTemplateStringIcons(content: string): void {
        const templateStringMatches = content.matchAll(/:icon\s*=\s*`([^`]+)`/g)

        for (const match of templateStringMatches) {
            const template = match[1]

            const poPattern = template.match(/po-\$\{[^}]+\}/)
            if (poPattern) {
                usedIcons.add("po-A")
                usedIcons.add("po-D")
                usedIcons.add("po-V")
                usedIcons.add("po-O")
                continue
            }

            const patternMatch = template.match(/([a-z]+)-\$\{[^}]+\}/i)
            if (patternMatch) {
                const prefix = patternMatch[1]
                const potentialIcons = content.matchAll(new RegExp(`${prefix}-\\s*["']([A-Za-z0-9-]+)["']`, "gi"))
                for (const icon of potentialIcons) {
                    const iconName = `${prefix}-${icon[1]}`
                    if (iconName.includes(":")) {
                        usedIcons.add(iconName)
                    } else {
                        usedIcons.add(iconName)
                    }
                }
            }
        }
    }

    function findTypeAnnotationIcons(content: string): void {
        const polarityValues = ["A", "D", "V", "O"]

        for (const polarity of polarityValues) {
            const regex = new RegExp(`['"]\\s*${polarity}['"]\\s*\\|`, "g")
            const matches = content.matchAll(regex)
            for (const _match of matches) {
                usedIcons.add(`po-${polarity}`)
            }
        }
    }

    function findConditionalValueIcons(content: string): void {
        const polarityValues = ["A", "D", "V", "O"]

        for (const polarity of polarityValues) {
            const polarityPattern = new RegExp(`['"](${polarity})['"]\\s*[|\\}]`, "g")
            const matches = content.matchAll(polarityPattern)
            for (const match of matches) {
                if (match[1]) {
                    usedIcons.add(`po-${match[1]}`)
                }
            }
        }
    }

    async function scanDirectory(dir: string): Promise<void> {
        const files = await readdir(dir, { withFileTypes: true })

        for (const file of files) {
            const fullPath = join(dir, file.name)

            if (file.isDirectory()) {
                await scanDirectory(fullPath)
            } else if (
                (file.name.endsWith(".vue") || file.name.endsWith(".ts") || file.name.endsWith(".tsx")) &&
                file.name !== "Icon.vue"
            ) {
                const content = await readFile(fullPath, "utf-8")

                const iconMatches = content.matchAll(/icon\s*=\s*["']([^"']+)["']/g)
                for (const match of iconMatches) {
                    usedIcons.add(match[1])
                }

                analyzeVariableBindings(content)
                findVariableDefinitions(content)
                findConditionalIcons(content)
                findLoopIcons(content)
                findTemplateStringIcons(content)
                findTypeAnnotationIcons(content)
                findConditionalValueIcons(content)

                const dynamicIconPatterns = content.matchAll(/:\s*icon:\s*["']([^"']+)["']/g)
                for (const match of dynamicIconPatterns) {
                    usedIcons.add(match[1])
                }
            }
        }
    }

    await scanDirectory(PROJECT_DIR)

    const inferredIcons = new Set<string>()
    for (const info of variableMap.values()) {
        if (!info.isDynamic && info.possibleValues.length > 0) {
            info.possibleValues.forEach(icon => void inferredIcons.add(icon))
        }
    }

    inferredIcons.forEach(icon => void usedIcons.add(icon))

    return usedIcons
}

async function checkIcons(): Promise<void> {
    console.log("正在检查图标使用情况...")

    const iconVueData = await loadIconVueData()
    const usedIcons = await findUsedIcons()
    const ignoredIcons = await loadIgnoreList()

    const unusedIcons: string[] = []
    const remixiconIcons: string[] = []
    const otherIcons: string[] = []
    const ignoredIconsList: string[] = []

    for (const iconKey of Object.keys(iconVueData)) {
        if (usedIcons.has(iconKey) || ignoredIcons.has(iconKey)) {
            if (ignoredIcons.has(iconKey)) {
                ignoredIconsList.push(iconKey)
            }
            continue
        }

        if (iconKey.startsWith("ri:")) {
            remixiconIcons.push(iconKey)
        } else {
            otherIcons.push(iconKey)
        }
        unusedIcons.push(iconKey)
    }

    console.log("\n统计信息:")
    console.log(`- Icon.vue 中定义的图标总数: ${Object.keys(iconVueData).length}`)
    console.log(`- 项目中使用的图标总数: ${usedIcons.size}`)
    console.log(`- 已忽略的图标总数: ${ignoredIconsList.length}`)
    console.log(`- 未使用的图标总数: ${unusedIcons.length}`)

    if (remixiconIcons.length > 0) {
        console.log(`\n未使用的 Remixicon 图标 (${remixiconIcons.length} 个):`)
        remixiconIcons.sort().forEach(icon => console.log(`  - ${icon}`))
    }

    if (otherIcons.length > 0) {
        console.log(`\n未使用的其他图标 (${otherIcons.length} 个):`)
        otherIcons.sort().forEach(icon => console.log(`  - ${icon}`))
    }

    if (ignoredIconsList.length > 0) {
        console.log(`\n已忽略的图标 (${ignoredIconsList.length} 个):`)
        ignoredIconsList.sort().forEach(icon => console.log(`  - ${icon}`))
    }

    if (unusedIcons.length === 0) {
        console.log("\n✅ 所有图标都在使用中或已被忽略")
    } else {
        console.log("\n⚠️  存在未使用的图标，使用 clean 命令删除它们，或使用 ignore 命令忽略特定图标")
    }
}

async function cleanIcons(): Promise<void> {
    console.log("正在清理未使用的图标...")

    const iconVueData = await loadIconVueData()
    const usedIcons = await findUsedIcons()
    const ignoredIcons = await loadIgnoreList()

    let deletedCount = 0
    const deletedIcons: string[] = []

    for (const iconKey of Object.keys(iconVueData)) {
        if (!usedIcons.has(iconKey) && !ignoredIcons.has(iconKey)) {
            delete iconVueData[iconKey]
            deletedCount++
            deletedIcons.push(iconKey)
        }
    }

    if (deletedCount === 0) {
        console.log("✅ 没有未使用的图标需要清理")
        return
    }

    await saveIconVueData(iconVueData)

    console.log(`✅ 已删除 ${deletedCount} 个未使用的图标:`)
    deletedIcons.sort().forEach(icon => console.log(`  - ${icon}`))
}

async function ignoreIcon(iconName: string): Promise<void> {
    const ignoredIcons = await loadIgnoreList()

    if (ignoredIcons.has(iconName)) {
        console.log(`⚠️  图标 ${iconName} 已经在忽略列表中`)
        return
    }

    ignoredIcons.add(iconName)
    await saveIgnoreList(ignoredIcons)

    console.log(`✅ 已将图标 ${iconName} 添加到忽略列表`)
}

async function unignoreIcon(iconName: string): Promise<void> {
    const ignoredIcons = await loadIgnoreList()

    if (!ignoredIcons.has(iconName)) {
        console.log(`⚠️  图标 ${iconName} 不在忽略列表中`)
        return
    }

    ignoredIcons.delete(iconName)
    await saveIgnoreList(ignoredIcons)

    console.log(`✅ 已将图标 ${iconName} 从忽略列表中移除`)
}

async function listIgnoredIcons(): Promise<void> {
    const ignoredIcons = await loadIgnoreList()

    if (ignoredIcons.size === 0) {
        console.log("忽略列表为空")
        return
    }

    console.log(`忽略列表 (${ignoredIcons.size} 个图标):`)
    Array.from(ignoredIcons)
        .sort()
        .forEach(icon => console.log(`  - ${icon}`))
}

async function listAvailableIcons(pattern?: string): Promise<void> {
    const remixiconData = await loadRemixiconData()
    const icons = Object.keys(remixiconData)

    if (pattern) {
        const filtered = icons.filter(icon => icon.includes(pattern))
        console.log(`匹配 "${pattern}" 的图标 (${filtered.length} 个):`)
        filtered
            .sort()
            .slice(0, 20)
            .forEach(icon => console.log(`  - ${icon}`))
        if (filtered.length > 20) {
            console.log(`  ... 还有 ${filtered.length - 20} 个图标`)
        }
    } else {
        console.log(`可用的 Remixicon 图标总数: ${icons.length}`)
        console.log("使用 list <pattern> 搜索特定图标")
        console.log("示例: bun tools/icon-tool.ts list subtract")
    }
}

async function useIcon(pattern?: string): Promise<void> {
    const usedIcons = await findUsedIcons()
    const iconList = Array.from(usedIcons).sort()

    if (pattern) {
        const filtered = iconList.filter(icon => icon.includes(pattern))
        console.log(`当前使用的匹配 "${pattern}" 的图标 (${filtered.length} 个):`)
        filtered.forEach(icon => console.log(`  - ${icon}`))
    } else {
        console.log(`当前使用的图标总数: ${iconList.length}`)
        iconList.forEach(icon => console.log(`  - ${icon}`))
    }
}

async function main(): Promise<void> {
    const args = process.argv.slice(2)
    const command = args[0]

    if (!command || command === "help") {
        console.log("图标管理工具 - 用法:")
        console.log("  bun tools/icon-tool.ts add <icon-name> [icon-name ...] - 添加图标到 Icon.vue（remixicon 名或 radix-icons:xxx）")
        console.log("  bun tools/icon-tool.ts check             - 检查图标使用情况，标记未使用的图标")
        console.log("  bun tools/icon-tool.ts clean             - 删除 Icon.vue 中未使用的图标")
        console.log("  bun tools/icon-tool.ts ignore <icon>     - 将图标添加到忽略列表（不清除）")
        console.log("  bun tools/icon-tool.ts unignore <icon>   - 从忽略列表中移除图标")
        console.log("  bun tools/icon-tool.ts ignored            - 列出所有被忽略的图标")
        console.log("  bun tools/icon-tool.ts list [pattern]     - 列出可用的 Remixicon 图标")
        console.log("  bun tools/icon-tool.ts use [pattern]     - 查询当前使用的图标")
        console.log("  bun tools/icon-tool.ts radix-sync [icon ...] - 补齐 tools/radix-icons/ 缓存（目录丢失/全新克隆后重建）")
        console.log("")
        console.log("示例:")
        console.log("  bun tools/icon-tool.ts add subtract-line user-line  # 添加多个图标")
        console.log("  bun tools/icon-tool.ts add radix-icons:check        # 添加 radix 图标（缓存缺失时自动从 iconify 下载）")
        console.log("  bun tools/icon-tool.ts check              # 检查使用情况")
        console.log("  bun tools/icon-tool.ts clean              # 清理未使用的图标")
        console.log("  bun tools/icon-tool.ts ignore ri:user-line  # 忽略 user-line 图标")
        console.log("  bun tools/icon-tool.ts list subtract     # 搜索包含 subtract 的图标")
        console.log("  bun tools/icon-tool.ts use subtract      # 查询当前使用的包含 subtract 的图标")
        console.log("  bun tools/icon-tool.ts radix-sync        # 重新下载 tools/radix-icons/ 里已用到的图标")
        process.exit(0)
    }

    try {
        if (command === "add") {
            const iconNames = args.slice(1)
            if (iconNames.length === 0) {
                console.error("❌ 请指定要添加的图标名称")
                console.log("示例: bun tools/icon-tool.ts add subtract-line")
                process.exit(1)
            }
            for (const iconName of iconNames) {
                await addIcon(iconName)
            }
        } else if (command === "check") {
            await checkIcons()
        } else if (command === "clean") {
            await cleanIcons()
        } else if (command === "ignore") {
            const iconName = args[1]
            if (!iconName) {
                console.error("❌ 请指定要忽略的图标")
                console.log("示例: bun tools/icon-tool.ts ignore ri:user-line")
                process.exit(1)
            }
            await ignoreIcon(iconName)
        } else if (command === "unignore") {
            const iconName = args[1]
            if (!iconName) {
                console.error("❌ 请指定要移除忽略的图标")
                console.log("示例: bun tools/icon-tool.ts unignore ri:user-line")
                process.exit(1)
            }
            await unignoreIcon(iconName)
        } else if (command === "ignored") {
            await listIgnoredIcons()
        } else if (command === "list") {
            await listAvailableIcons(args[1])
        } else if (command === "use") {
            await useIcon(args[1])
        } else if (command === "radix-sync") {
            await syncRadixCache(args.slice(1))
        } else {
            console.error(`❌ 未知命令: ${command}`)
            console.log("使用 help 查看帮助信息")
            process.exit(1)
        }
    } catch (error) {
        console.error("❌ 执行失败:", error)
        process.exit(1)
    }
}
main()
