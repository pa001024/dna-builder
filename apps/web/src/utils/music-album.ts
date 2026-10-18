import { type Music, musicData, musicScoreData } from "@/data/d/music.data"

/** 乐谱在所属专辑中的位置。 */
export interface MusicAlbumPosition {
    /** 专辑内序号（从 1 起） */
    index: number
    /** 专辑曲目总数 */
    total: number
}

/**
 * 按专辑 ID 取该专辑的完整曲目表（顺序与数据源一致）。
 * @param scoreId 专辑 ID。
 * @returns 该专辑的乐谱列表；专辑不存在时返回空数组。
 */
export function getAlbumTracks(scoreId: number): Music[] {
    if (!musicScoreData.some(score => score.id === scoreId)) {
        return []
    }

    return musicData.filter(sheet => sheet.scoreId === scoreId)
}

/** 乐谱 ID → 专辑内位置。按完整曲目表预先计算，避免检索过滤后序号漂移。 */
const albumPositionMap = new Map<number, MusicAlbumPosition>(
    musicScoreData.flatMap(score => {
        const tracks = getAlbumTracks(score.id)
        return tracks.map((track, index) => [track.id, { index: index + 1, total: tracks.length }] as const)
    })
)

/**
 * 取乐谱在所属专辑中的位置。
 * @param musicId 乐谱 ID。
 * @returns 专辑内位置；未被专辑收录时返回 null。
 */
export function getMusicAlbumPosition(musicId: number): MusicAlbumPosition | null {
    return albumPositionMap.get(musicId) ?? null
}

/**
 * 取音频路径中的文件名（展示用，如 `0161_scene_train_station`）。
 * @param music 乐谱数据中的音频路径，如 `/bgm/1_4/musicbox/0161_scene_train_station`。
 * @returns 路径末段的文件名。
 */
export function getMusicAudioFileName(music: string): string {
    return music.split("/").filter(Boolean).pop() ?? music
}

/**
 * 取音频路径中的目录（展示用，如 `/bgm/1_4/musicbox`）。
 * @param music 乐谱数据中的音频路径。
 * @returns 去掉文件名后的目录；无目录时返回 `/`。
 */
export function getMusicAudioDirectory(music: string): string {
    const segments = music.split("/").filter(Boolean)
    segments.pop()
    return segments.length ? `/${segments.join("/")}` : "/"
}

/**
 * 把序号格式化为两位数字，用于档案序号展示。
 * @param value 序号（从 1 起）。
 * @returns 两位数字字符串，如 `01`。
 */
export function formatSequenceNumber(value: number): string {
    return String(value).padStart(2, "0")
}
