import { getMapAPI } from "@/api/app"
import emojiJson from "@/assets/emoji.json"

export interface EmojiStyle {
    type: "local" | "remote"
    src: string
    size?: number
    position?: string
}

const emojiDict = emojiJson.dict.reduce(
    (acc, cur) => {
        acc[cur.desc] = { type: "local", src: cur.image }
        return acc
    },
    {} as Record<string, EmojiStyle>
)
let emojiDictLoaded = false

export function getEmoji(emoji: string): EmojiStyle | null {
    const result = emojiDict[emoji]
    if (!result) return null
    if (result.type === "local") {
        return { type: "local", src: result.src.startsWith("http") ? result.src : `/emojiimg/${result.src}` }
    }
    return result
}

export async function initEmojiDict() {
    if (emojiDictLoaded) return
    try {
        const api = getMapAPI()
        const res = await api.getEmojiList()
        if (res.is_success && res.data) {
            emojiDictLoaded = true
            for (const item of res.data) {
                const sizeEnum = item.size || 0
                if (sizeEnum === 1) {
                    continue
                }
                const emojiSize = 56
                const padding = 16
                const totalWidth = 2256
                const bgSize = totalWidth / 2
                const cols = 20
                const cellWidth = (bgSize - padding / 2) / cols
                for (let i = 0; i < item.content.length; i++) {
                    const content = item.content[i]
                    const key = content.startsWith("[") ? content : `[/${content}]`
                    if (emojiDict[key]) {
                        continue
                    }
                    const row = Math.floor(i / cols)
                    const col = i % cols
                    const posX = col * cellWidth + padding / 2
                    const posY = row * emojiSize + padding / 2
                    emojiDict[key] = {
                        type: "remote",
                        src: `${item.url}?x-oss-process=image/resize,w_${totalWidth}`,
                        size: bgSize,
                        position: `-${posX}px -${posY}px`,
                    }
                }
            }
        }
    } catch (e) {
        console.error("获取 Emoji 列表失败", e)
    }
}
