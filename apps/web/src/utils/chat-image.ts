/**
 * 对话附图（用户粘贴 / 拖入的截图）的读取与归一化。
 *
 * 图片不落外部存储，直接以 Base64 内联进请求体：资料检索 Agent 只做一次性检索，
 * 把截图传上去再临时找个地方托管，反而多一次往返和一个失效 URL 的问题。
 *
 * 归一化只做一件事：**等比缩到长边上限后重编码成 JPEG**。
 * 截图类图片（1920×1080 及以上的 PNG）原始体积动辄数 MB，Base64 后还要再涨三分之一，
 * 直接内联会把请求体撑到上游拒绝或超时；缩到长边 1568px 既能保住文字可读性，
 * 也落在主流多模态接口的图片尺寸限制内。
 */

/** 一条消息附带的一张图片。 */
export interface ChatImage {
    /** 图片 MIME 类型（归一化后恒为 image/jpeg） */
    mimeType: string
    /** 图片内容的 Base64（不含 `data:` 前缀） */
    data: string
}

/** 输入框一次提交的内容：正文 + 附图。 */
export interface ChatSubmitPayload {
    /** 正文（已 trim） */
    text: string
    /** 本次附带的图片 */
    images: ChatImage[]
}

/** 单条消息最多附带的图片张数：再多既看不过来，也会把请求体撑大 */
export const MAX_CHAT_IMAGES = 4

/** 归一化后的长边上限（px） */
const MAX_IMAGE_EDGE = 1568

/** 重编码质量：0.85 在截图文字边缘与体积之间取平衡 */
const JPEG_QUALITY = 0.85

/** 单张原图的大小上限（字节）：超过就不读，避免把整份大文件拉进内存 */
const MAX_SOURCE_BYTES = 20 * 1024 * 1024

/**
 * @description 判断一个文件是否按图片处理。
 * @param file 待判定的文件
 * @returns 是否为图片
 */
export function isImageFile(file: File): boolean {
    return file.type.startsWith("image/")
}

/**
 * @description 把图片文件解码成可绘制对象。
 *
 * 优先走 `createImageBitmap`（不依赖 DOM 插入，且能尽早失败）；
 * 环境不支持时退回 `<img>` + object URL。
 * @param file 图片文件
 * @returns 可绘制对象
 */
async function decodeImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
    if (typeof createImageBitmap === "function") {
        return await createImageBitmap(file)
    }

    const url = URL.createObjectURL(file)

    try {
        return await new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image()

            image.onload = () => resolve(image)
            image.onerror = () => reject(new Error("图片解码失败"))
            image.src = url
        })
    } finally {
        URL.revokeObjectURL(url)
    }
}

/**
 * @description 释放解码出来的图片对象（ImageBitmap 占显存，需显式关闭）。
 * @param source 解码结果
 */
function releaseImage(source: ImageBitmap | HTMLImageElement): void {
    const bitmap = source as Partial<ImageBitmap>

    if (typeof bitmap.close === "function") {
        bitmap.close()
    }
}

/**
 * @description 把图片文件读成可内联发送的附图（缩边 + JPEG 重编码）。
 * @param file 图片文件
 * @returns 归一化后的附图
 * @throws 文件过大、无法解码或画布不可用时抛错
 */
export async function fileToChatImage(file: File): Promise<ChatImage> {
    if (file.size > MAX_SOURCE_BYTES) {
        throw new Error(`图片过大（${(file.size / 1024 / 1024).toFixed(1)}MB），请压缩后再发送`)
    }

    const source = await decodeImage(file)

    try {
        // ImageBitmap 只有 width/height，<img> 的 width/height 是属性、可能还是 0，要用 naturalWidth
        const width = "naturalWidth" in source ? source.naturalWidth : source.width
        const height = "naturalHeight" in source ? source.naturalHeight : source.height

        if (!width || !height) {
            throw new Error("图片尺寸无效")
        }

        const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(width, height))
        const targetWidth = Math.max(1, Math.round(width * scale))
        const targetHeight = Math.max(1, Math.round(height * scale))

        const canvas = document.createElement("canvas")
        canvas.width = targetWidth
        canvas.height = targetHeight

        const context = canvas.getContext("2d")

        if (!context) {
            throw new Error("无法创建画布上下文")
        }

        // JPEG 没有透明通道：先铺白底，否则透明区域会被压成黑块
        context.fillStyle = "#ffffff"
        context.fillRect(0, 0, targetWidth, targetHeight)
        context.drawImage(source, 0, 0, targetWidth, targetHeight)

        const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY)

        return { mimeType: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1) }
    } finally {
        releaseImage(source)
    }
}

/**
 * @description 把附图还原成可直接用于 `<img src>` 的 DataURL。
 * @param image 附图
 * @returns DataURL
 */
export function chatImageDataUrl(image: ChatImage): string {
    return `data:${image.mimeType};base64,${image.data}`
}
