/**
 * 技能 zip 包的解包与摘要：fflate 异步解压并转成「路径 → 文本」表。
 * 路径安全与大小上限已由服务端校验（见 `server/src/util/zip.ts`），这里不做二次校验。
 */

import { unzip } from "fflate"

/** 解压技能 zip 包；返回文件表（剔除目录、`__MACOSX` 与隐藏条目，键统一正斜杠）。 */
export async function unpackSkillPackage(bytes: Uint8Array): Promise<Map<string, string>> {
    const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
        unzip(bytes, (error, data) => {
            if (error) {
                reject(error)
            } else {
                resolve(data)
            }
        })
    })

    const files = new Map<string, string>()
    const decoder = new TextDecoder()

    for (const [path, content] of Object.entries(entries)) {
        // 目录条目以 `/` 结尾；macOS 打包的元数据与隐藏文件对技能无意义
        if (path.endsWith("/") || path.split("/").some(segment => segment === "__MACOSX" || segment.startsWith("."))) {
            continue
        }

        files.set(path, decoder.decode(content))
    }

    return files
}

/** 计算 zip 包的 sha256（hex），与服务端清单里的摘要比对做完整性校验。 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer)

    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("")
}
