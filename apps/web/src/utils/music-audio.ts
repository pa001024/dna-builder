const MUSIC_DATASET_BASE_URL = "https://modelscope.cn/datasets/pa001024/dna-voice-dataset/resolve/master"

/**
 * 根据乐谱音频路径生成数据集中的音频地址。
 * @param music 乐谱数据中的音频路径。
 * @returns 可供播放器使用的音频地址。
 */
export function buildMusicAudioUrl(music: string): string {
    return `${MUSIC_DATASET_BASE_URL}${music}.ogg`
}
