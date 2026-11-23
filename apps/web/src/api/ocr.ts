import { invoke } from "@tauri-apps/api/core"
import { env } from "@/env"

/** 一行 OCR 结果（与 Tauri `ocr_recognize_lines` 的 DTO 对齐） */
export interface OcrLineDto {
    text: string
    x: number
    y: number
    width: number
    height: number
    detScore: number
    recScore: number
}

/** 可选的 DataURL 前缀（Rust 侧只接受裸 base64） */
const DATA_URL_PREFIX = /^data:[^;,]*;base64,/

/**
 * 用桌面端本地 PaddleOCR 识别图片文字行。
 *
 * 浏览器端没有本地 OCR 引擎，这里直接拒绝；不得用 wasm / tesseract 之类的替代实现兜底。
 * @param imageBase64 图片 Base64（可带 `data:*;base64,` 前缀）
 * @returns 结构化文本行
 * @throws 非桌面端、空图片或 OCR 失败
 */
export async function recognizeOcrLines(imageBase64: string): Promise<OcrLineDto[]> {
    if (!env.isApp) {
        throw new Error("desktop only")
    }
    const payload = imageBase64.replace(DATA_URL_PREFIX, "").trim()
    if (!payload) {
        throw new Error("empty image")
    }
    return await invoke<OcrLineDto[]>("ocr_recognize_lines", { imageBase64: payload })
}
