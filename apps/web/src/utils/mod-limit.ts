import { charMap } from "@/data/d"

/**
 * 解析 MOD 限定的显示文本：数字为角色 id（解析为角色名），字符串原样返回。
 * @param limit MOD 限定（角色 id 或 武器伤害类型/类别）
 * @returns 显示用名称；无法解析时回退为原值字符串
 */
export function formatModLimit(limit: string | number | undefined): string {
    if (typeof limit === "number") {
        return charMap.get(limit)?.名称 ?? String(limit)
    }
    return limit ?? ""
}
