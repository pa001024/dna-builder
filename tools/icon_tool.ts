#!/usr/bin/env bun

import { readdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { format } from "prettier"

const ICON_FILE = "src/components/Icon.vue"
const REMIXICON_GLYPH_FILE = "node_modules/remixicon/fonts/remixicon.glyph.json"
const PROJECT_DIR = "src"
const IGNORE_LIST_FILE = "tools/.icon_ignore"

type IconData = {
    path: string[]
    unicode: string
    glyph: string
    horizAdvX: string
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

async function addIcon(iconName: string): Promise<void> {
    console.log(`正在添加图标: ${iconName}`)

    // 处理 radix-icons 前缀
    if (iconName.startsWith("radix-icons:")) {
        const radixIconName = iconName.replace("radix-icons:", "")
        const iconVueData = await loadIconVueData()

        // 检查图标是否已存在
        if (iconVueData[iconName]) {
            console.log(`⚠️  图标 ${iconName} 已存在于 Icon.vue 中`)
            return
        }

        // 从 radix-icons 目录读取 SVG 文件
        const svgPath = join(__dirname, "radix-icons", `${radixIconName}.svg`)

        try {
            const svgContent = await readFile(svgPath, "utf-8")

            // 提取 path 数据
            const pathMatch = svgContent.match(/<path[^>]*d="([^"]*)"[^>]*>/)
            if (!pathMatch) {
                console.error(`❌ 无法从 ${svgPath} 中提取 path 数据`)
                return
            }

            const pathData = pathMatch[1]
            // radix-icons 的 size 固定为 15
            iconVueData[iconName] = [pathData, 15]
            await saveIconVueData(iconVueData)

            console.log(`✅ 成功添加图标: ${iconName}`)
        } catch (error) {
            console.error(`❌ 无法读取 radix-icons 文件: ${svgPath}`)
            console.error(error)
            return
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
        console.log("示例: bun tools/icon_tool.ts list subtract")
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
        console.log("  bun tools/icon_tool.ts add <icon-name>   - 添加 Remixicon 图标到 Icon.vue")
        console.log("  bun tools/icon_tool.ts check             - 检查图标使用情况，标记未使用的图标")
        console.log("  bun tools/icon_tool.ts clean             - 删除 Icon.vue 中未使用的图标")
        console.log("  bun tools/icon_tool.ts ignore <icon>     - 将图标添加到忽略列表（不清除）")
        console.log("  bun tools/icon_tool.ts unignore <icon>   - 从忽略列表中移除图标")
        console.log("  bun tools/icon_tool.ts ignored            - 列出所有被忽略的图标")
        console.log("  bun tools/icon_tool.ts list [pattern]     - 列出可用的 Remixicon 图标")
        console.log("  bun tools/icon_tool.ts use [pattern]     - 查询当前使用的图标")
        console.log("")
        console.log("示例:")
        console.log("  bun tools/icon_tool.ts add subtract-line  # 添加 ri:subtract-line")
        console.log("  bun tools/icon_tool.ts check              # 检查使用情况")
        console.log("  bun tools/icon_tool.ts clean              # 清理未使用的图标")
        console.log("  bun tools/icon_tool.ts ignore ri:user-line  # 忽略 user-line 图标")
        console.log("  bun tools/icon_tool.ts list subtract     # 搜索包含 subtract 的图标")
        console.log("  bun tools/icon_tool.ts use subtract      # 查询当前使用的包含 subtract 的图标")
        process.exit(0)
    }

    try {
        if (command === "add") {
            const iconName = args[1]
            if (!iconName) {
                console.error("❌ 请指定要添加的图标名称")
                console.log("示例: bun tools/icon_tool.ts add subtract-line")
                process.exit(1)
            }
            await addIcon(iconName)
        } else if (command === "check") {
            await checkIcons()
        } else if (command === "clean") {
            await cleanIcons()
        } else if (command === "ignore") {
            const iconName = args[1]
            if (!iconName) {
                console.error("❌ 请指定要忽略的图标")
                console.log("示例: bun tools/icon_tool.ts ignore ri:user-line")
                process.exit(1)
            }
            await ignoreIcon(iconName)
        } else if (command === "unignore") {
            const iconName = args[1]
            if (!iconName) {
                console.error("❌ 请指定要移除忽略的图标")
                console.log("示例: bun tools/icon_tool.ts unignore ri:user-line")
                process.exit(1)
            }
            await unignoreIcon(iconName)
        } else if (command === "ignored") {
            await listIgnoredIcons()
        } else if (command === "list") {
            await listAvailableIcons(args[1])
        } else if (command === "use") {
            await useIcon(args[1])
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
