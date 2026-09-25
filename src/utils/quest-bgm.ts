import { buildMusicAudioUrl } from "@/utils/music-audio"

/**
 * 将剧情 BGM 节点的资源键解析为可播放的 CDN 音频地址。
 *
 * 数据里的 resource 已是数据集内的完整相对路径（如 `bgm/1_1/0110_story_fushu_theme`），
 * 与数据集目录结构一致，因此直接拼装地址即可，无需再按基名反查乐谱表。
 *
 * 支持三种形态：
 * - 空值或 `mute` 等无声控制键 → 返回空字符串（无音频可播）；
 * - 完整的 http(s) 直链 → 原样返回（供数据字段直接携带 URL）；
 * - 数据集相对路径 → 归一化后拼装数据集地址。
 * @param resource BGM 资源键（可为直链）
 * @returns 音频 URL；不可播放时返回空字符串
 */
export function buildQuestBgmUrl(resource: string | undefined): string {
    if (!resource) {
        return ""
    }

    const trimmedResource = resource.trim()
    if (!trimmedResource || trimmedResource === "mute") {
        return ""
    }

    if (/^https?:\/\//i.test(trimmedResource)) {
        return trimmedResource
    }

    const normalizedPath = trimmedResource.replace(/\\/g, "/").replace(/^\/+/, "")
    if (!normalizedPath) {
        return ""
    }

    return buildMusicAudioUrl(`/${normalizedPath}`)
}

/**
 * 判断剧情 BGM 节点是否携带可播放的 CDN 音频。
 * @param resource BGM 资源键
 * @returns 是否存在可播放地址
 */
export function isQuestBgmPlayable(resource: string | undefined): boolean {
    return buildQuestBgmUrl(resource) !== ""
}
