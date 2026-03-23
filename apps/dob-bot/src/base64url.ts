/**
 * 将内容编码为 URL-safe base64。
 * @param {Buffer | string} input
 * @returns {string}
 */
export function base64url(input: Buffer | string): string {
    const buf = Buffer.isBuffer(input) ? input : Buffer.from(input)
    return buf.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}
