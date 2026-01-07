import OSS from "ali-oss"
import { nanoid } from "nanoid"

const OSS_CONFIG = {
    region: process.env.OSS_REGION || process.env.OSS_ENDPOINT?.replace(".aliyuncs.com", "") || "oss-cn-hongkong",
    endpoint: process.env.OSS_ENDPOINT || "",
    bucket: process.env.OSS_BUCKET || "",
    accessKeyId: process.env.OSS_ACCESS_KEY_ID || "",
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || "",
}

const MAX_FILE_SIZE = 3 * 1024 * 1024

function getOssClient() {
    return new OSS({
        region: OSS_CONFIG.region,
        accessKeyId: OSS_CONFIG.accessKeyId,
        accessKeySecret: OSS_CONFIG.accessKeySecret,
        bucket: OSS_CONFIG.bucket,
    })
}

export async function uploadImage(file: File): Promise<string> {
    if (!file) {
        throw new Error("文件不能为空")
    }

    if (!file.type.startsWith("image/")) {
        throw new Error("只支持图片格式")
    }

    if (file.size > MAX_FILE_SIZE) {
        throw new Error("图片大小不能超过 3MB")
    }

    const ext = file.name.split(".").pop() || "jpg"
    const fileName = `${nanoid()}.${ext}`
    const ossKey = `img/${fileName}`

    try {
        const client = getOssClient()
        const buffer = Buffer.from(await file.arrayBuffer())
        await client.put(ossKey, buffer)

        const url = `https://${OSS_CONFIG.bucket}.${OSS_CONFIG.endpoint}/${ossKey}`
        return url
    } catch (error) {
        console.error("上传图片到 OSS 失败:", error)
        throw new Error("图片上传失败")
    }
}
