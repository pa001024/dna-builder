/**
 * 将自定义变量格式化为逐行的 `变量名=表达式` 文本。
 * @param variables 自定义变量列表
 * @returns 可写入剪贴板的文本
 */
export function formatCustomVariablesClipboardText(variables: [string, string][]): string {
    return variables
        .filter(([key, value]) => key.length > 0 || value.length > 0)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n")
}

/**
 * 从逐行的 `变量名=表达式` 文本解析自定义变量。
 * @param text 剪贴板文本
 * @returns 自定义变量列表
 * @throws 非空行缺少等号时抛出错误
 */
export function parseCustomVariablesClipboardText(text: string): [string, string][] {
    return text.split(/\r?\n/).flatMap((line, index) => {
        if (!line.trim()) return []

        const separatorIndex = line.indexOf("=")
        if (separatorIndex < 0) {
            throw new Error(`第 ${index + 1} 行格式错误，应为 变量名=表达式`)
        }

        return [[line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim()] as [string, string]]
    })
}
