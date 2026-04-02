/**
 * 计算字符串的 SHA-256。
 * @param input 输入字符串。
 * @returns 十六进制摘要。
 */
import forge from "node-forge"

export function sha256(input: string): string {
    const md = forge.md.sha256.create()
    md.update(input, "utf8")
    return md.digest().toHex()
}
