import { musicData } from "@/data/d/music.data"
import { buildMusicAudioUrl } from "@/utils/music-audio"

const bgmResourceToMusicPathCache = new Map<string, string>()

/**
 * 根据乐谱数据集路径的末段名称定位完整乐谱路径。
 *
 * 剧情 BGM 节点（PlayOrStopBGMNode）的 resource 是乐谱文件基名
 * （如 `0002_story_shahai`），而数据集内完整路径带版本目录
 * （如 `/bgm/cbt01/musicbox/0002_story_shahai`），这里通过
 * `musicData` 的路径末段做一次反查补齐版本目录。
 * @param resource BGM 资源键
 * @returns 匹配到的完整乐谱路径；无匹配返回空字符串
 */
function resolveBgmResourceMusicPath(resource: string): string {
    if (!resource) {
        return ""
    }

    const cachedPath = bgmResourceToMusicPathCache.get(resource)
    if (cachedPath !== undefined) {
        return cachedPath
    }

    let matchedPath = ""
    for (const music of musicData) {
        const musicPath = music.music
        const basename = musicPath.slice(musicPath.lastIndexOf("/") + 1)
        if (basename === resource) {
            matchedPath = musicPath
            break
        }
    }

    bgmResourceToMusicPathCache.set(resource, matchedPath)
    return matchedPath
}

/**
 * 将剧情 BGM 节点资源键解析为可播放的 CDN 音频地址。
 *
 * 支持三种形态：
 * - 空值或 `mute` 等无声控制键 → 返回空字符串（无音频可播）；
 * - 完整的 http(s) 直链 → 原样返回（供数据字段直接携带 URL）；
 * - 乐谱基名 → 通过 musicData 反查完整路径后拼装数据集地址。
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

    const musicPath = resolveBgmResourceMusicPath(trimmedResource)
    if (!musicPath) {
        return ""
    }

    return buildMusicAudioUrl(musicPath)
}

/**
 * 判断剧情 BGM 节点是否携带可播放的 CDN 音频。
 * @param resource BGM 资源键
 * @returns 是否存在可播放地址
 */
export function isQuestBgmPlayable(resource: string | undefined): boolean {
    return buildQuestBgmUrl(resource) !== ""
}
