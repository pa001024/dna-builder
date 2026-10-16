import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
export type ExtVoiceEmotion = "neutral" | "happy" | "sad" | "angry" | "fear" | "surprise" | "tender"

export const EXT_VOICE_EMOTIONS: ExtVoiceEmotion[] = ["neutral", "happy", "sad", "angry", "fear", "surprise", "tender"]

export type EmotionBackend = "bert-local" | "hf-api" | "heuristic"

const DEFAULT_MODEL_DIR = path.resolve(process.env.VOICE_EMOTION_MODEL_DIR || ".tmp/voice-models/chinese-emotion-small")

const GSTS_PYTHON = path.resolve(process.env.GSTS_PYTHON || "E:/soft/GPT-SoVITS-v2/runtime/python.exe")

const THIS_DIR = typeof import.meta.dir === "string" ? import.meta.dir : path.dirname(fileURLToPath(import.meta.url))

interface BertClassifyResult {
    id: number
    emotion: ExtVoiceEmotion
    raw: number
    score: number
}

/**
 * 本地真实 BERT 批量分类：拉起 GPT-SoVITS 自带 runtime python（torch CUDA），
 * 模型只加载一次，整批推理后返回与输入等长的情绪标签。
 * @param texts 待分类文本
 * @param modelDir 本地模型目录
 * @returns 情绪标签
 */
export async function classifyEmotionsViaBert(texts: string[], modelDir = DEFAULT_MODEL_DIR): Promise<ExtVoiceEmotion[]> {
    const workDir = mkdtempSync(path.join(tmpdir(), "voice-emotion-"))
    try {
        const inputPath = path.join(workDir, "input.json")
        const outputPath = path.join(workDir, "output.json")
        writeFileSync(inputPath, JSON.stringify(texts.map((text, index) => ({ id: index, text }))))
        const script = path.resolve(THIS_DIR, "emotion_bert.py")
        const result = spawnSync(GSTS_PYTHON, [script, "--input", inputPath, "--output", outputPath, "--model", modelDir], {
            encoding: "utf-8",
        })
        if (result.status !== 0) {
            throw new Error(`BERT 分类进程退出 ${result.status}: ${String(result.stderr).slice(-500)}`)
        }
        const results = JSON.parse(readFileSync(outputPath, "utf-8")) as BertClassifyResult[]
        return results.sort((a, b) => a.id - b.id).map(result => result.emotion)
    } finally {
        rmSync(workDir, { recursive: true, force: true })
    }
}

/**
 * 经 HuggingFace Inference API 分类（需 HF_TOKEN），失败抛错由上层回退。
 * @param text 待分类文本
 * @param model 模型 id
 * @returns 情绪标签与置信度
 */
export async function classifyEmotionViaHfApi(text: string, model: string): Promise<ExtVoiceEmotion> {
    const token = process.env.HF_TOKEN
    if (!token) throw new Error("缺少 HF_TOKEN")
    const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: text.slice(0, 256) }),
    })
    if (!response.ok) throw new Error(`HF API ${response.status}`)
    const result = (await response.json()) as Array<Array<{ label: string; score: number }>>
    const top = result?.[0]?.[0]
    if (!top) throw new Error("HF API 返回为空")
    return mapBertLabelToEmotion(top.label, top.score)
}

function mapBertLabelToEmotion(label: string, score: number): ExtVoiceEmotion {
    if (score < 0.35) return "neutral"
    const normalized = label.trim().toLowerCase()
    if (/^(0|neutral)/.test(normalized) || normalized === "label_0") return "neutral"
    if (/^(1|concern)/.test(normalized) || normalized === "label_1") return "tender"
    if (/^(2|happy|joy|positive)/.test(normalized) || normalized === "label_2") return "happy"
    if (/^(3|anger|angry)/.test(normalized) || normalized === "label_3") return "angry"
    if (/^(4|sad)/.test(normalized) || normalized === "label_4") return "sad"
    if (/^(6|surprise)/.test(normalized) || normalized === "label_6") return "surprise"
    if (/^(7|disgust)/.test(normalized) || normalized === "label_7") return "angry"
    return "neutral"
}

/**
 * 离线关键词回退：仅在 BERT 不可用时使用，结果不可靠，需人工复核。
 * @param text 待分类文本
 * @returns 情绪标签
 */
export function classifyEmotionHeuristic(text: string): ExtVoiceEmotion {
    if (/嘻嘻|哈哈|开心|高兴|快乐|生日快乐|喜欢|最喜欢|笑|太好了|好耶/.test(text)) return "happy"
    if (/对不起|抱歉|难过|哭|呜呜|眼泪|孤单|失去|离别|永别|遗憾|难受/.test(text)) return "sad"
    if (/可恶|混蛋|滚|闭嘴|打爆|惹怒|自找|绝不宽恕|烦死|愤怒|生气/.test(text)) return "angry"
    if (/害怕|恐惧|救命|不要过来|快跑|危险|颤抖|好可怕/.test(text)) return "fear"
    if (/什么[？?！!]|真的假|怎么会|不会吧|竟然|居然|真的吗|哇/.test(text)) return "surprise"
    if (/晚安|睡吧|歇息|靠着我|温柔|抱抱|辛苦|好好休息|别担心|有我在/.test(text)) return "tender"
    return "neutral"
}

/**
 * 按所选后端批量分类情绪，默认走本地真实 BERT。
 * @param texts 待分类文本
 * @param backend 后端选择
 * @param model HF 模型 id（hf-api 后端使用）
 * @returns 与输入等长的情绪标签
 */
export async function classifyEmotionsBatch(
    texts: string[],
    backend: EmotionBackend = "bert-local",
    model = process.env.VOICE_EMOTION_MODEL || "Johnson8187/Chinese-Emotion-Small"
): Promise<ExtVoiceEmotion[]> {
    if (backend === "bert-local") return classifyEmotionsViaBert(texts)
    if (backend === "hf-api") {
        const results: ExtVoiceEmotion[] = []
        for (const text of texts) results.push(await classifyEmotionViaHfApi(text, model))
        return results
    }
    return texts.map(classifyEmotionHeuristic)
}
