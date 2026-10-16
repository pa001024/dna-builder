import type { ExtVoiceEmotion } from "./emotion"

/** 男主（NanzhuLight）参考语音：数据集 `ch/char` 实有 47 个，情绪位齐全，女声侧无对应 */
export const NANZHU_LIGHT_EMOTION_REF: Record<ExtVoiceEmotion, string> = {
    neutral: "char_NanzhuLight_vo_emotion_reply_01",
    happy: "char_NanzhuLight_vo_emotion_happy_01",
    sad: "char_NanzhuLight_vo_emotion_sigh_01",
    angry: "char_NanzhuLight_vo_emotion_refute_01",
    fear: "char_NanzhuLight_vo_emotion_hesitate_01",
    surprise: "char_NanzhuLight_vo_emotion_amaze_01",
    tender: "char_NanzhuLight_vo_emotion_thank_01",
}

/**
 * 取男声参考的 prompt 文本：同名女声台词大概率同稿（appear/lvup 等），否则回空由上层回退。
 * @param maleRes 男声 res
 * @param promptTextByRes 女声 res 到原文的映射
 * @returns prompt 文本或空字符串
 */
export function resolveMalePromptText(maleRes: string, promptTextByRes: Record<string, string>): string {
    const twinRes = maleRes.replace("NanzhuLight", "NvzhuLight")
    return promptTextByRes[twinRes] ?? ""
}
