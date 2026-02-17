export function createScriptHeader(options: {
    id?: string
    name: string
    desc?: string
    author?: string
    version?: string
    category?: string
}) {
    return `// ==UserScript==
// @id ${options.id || "-"}
// @name ${options.name}
// @description ${options.desc || "-"}
// @author ${options.author || "anonymous"}
// @version ${options.version || "1.0.0"}
// @category ${options.category || "其他"}
// @date ${new Date().toLocaleString("zh-CN")}
// ==/UserScript==

`
}
export function parseScriptHeader(header: string) {
    const id = header.match(/^\/\/ *@id\s+(.*)/m)?.[1] || undefined
    const name = header.match(/^\/\/ *@name\s+(.*)/m)?.[1] || undefined
    const desc = header.match(/^\/\/ *@description\s+(.*)/m)?.[1] || undefined
    const author = header.match(/^\/\/ *@author\s+(.*)/m)?.[1] || undefined
    const version = header.match(/^\/\/ *@version\s+(.*)/m)?.[1] || undefined
    const category = header.match(/^\/\/ *@category\s+(.*)/m)?.[1] || undefined
    return { id, name, desc, author, version, category }
}

export function replaceScriptHeader(
    script: string,
    options: { id?: string; name: string; desc?: string; author?: string; version?: string; category?: string }
) {
    // 匹配 UserScript header 的正则表达式，从 // ==UserScript== 到 // ==/UserScript==
    const headerRegex = /\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/

    // 从脚本中提取现有的 header
    const existingHeaderMatch = script.match(headerRegex)

    // 如果没有找到 header，直接返回原脚本
    if (!existingHeaderMatch) {
        return createScriptHeader(options) + script
    }

    // 解析现有的 header
    const existingHeader = parseScriptHeader(existingHeaderMatch[0])

    // 合并新的 options（新的值会覆盖旧的值）
    const mergedOptions = {
        id: options.id ?? existingHeader.id,
        name: options.name ?? existingHeader.name,
        desc: options.desc ?? existingHeader.desc,
        author: options.author ?? existingHeader.author,
        version: options.version ?? existingHeader.version,
        category: options.category ?? existingHeader.category,
    }

    // 创建新的 header
    const newHeader = createScriptHeader(mergedOptions)

    // 替换脚本中的 header
    return script.replace(headerRegex, newHeader.trim())
}
