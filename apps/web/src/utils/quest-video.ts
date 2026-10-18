const VIDEO_DATASET_BASE_URL = "https://modelscope.cn/datasets/pa001024/dna-voice-dataset/resolve/master"

/**
 * 将剧情节点携带的视频资源键解析为可播放的 CDN 视频地址。
 *
 * 与剧情 BGM 同库同源（modelscope `dna-voice-dataset`）：视频文件统一平铺在
 * 数据集的 `video/` 目录下、以「资源键 + .mp4」命名（如 `SQ_OBT0100_SC018` →
 * `…/video/SQ_OBT0100_SC018.mp4`），无需像 BGM 那样反查版本目录。
 * 相对 BGM 地址（`/bgm/<路径>.ogg`）只需把目录 `bgm` 换成 `video`、后缀 `.ogg`
 * 换成 `.mp4`。
 * @param video 剧情视频资源键（可为完整 http(s) 直链）
 * @returns 视频 URL；无资源键时返回空字符串
 */
export function buildQuestVideoUrl(video: string | undefined): string {
    if (!video) {
        return ""
    }

    const trimmedVideo = video.trim()
    if (!trimmedVideo) {
        return ""
    }

    if (/^https?:\/\//i.test(trimmedVideo)) {
        return trimmedVideo
    }

    return `${VIDEO_DATASET_BASE_URL}/video/${trimmedVideo}.mp4`
}

/**
 * 判断剧情节点是否携带可播放的 CDN 视频地址。
 * @param video 剧情视频资源键
 * @returns 是否存在可播放地址
 */
export function isQuestVideoPlayable(video: string | undefined): boolean {
    return buildQuestVideoUrl(video) !== ""
}
