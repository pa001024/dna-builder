import { Elysia, t } from "elysia"
import { db, schema } from "../db"
import { id, now } from "../db/schema"
import { eq } from "drizzle-orm"
import jwt from "jsonwebtoken"
import { jwtToken } from "../db/yoga"
import { createCanvas, loadImage } from "canvas"
import { readFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { getDNAAPI } from "./dna"

const SESSION_EXPIRE_MINUTES = 5

let cachedBaseImage: { canvas: any; width: number; height: number } | null = null

async function getBaseImage() {
    if (cachedBaseImage) {
        return cachedBaseImage
    }

    const __filename = fileURLToPath(import.meta.url)
    const __dirname = dirname(__filename)
    const imagePath = join(__dirname, "../assets/verify.png")

    const baseImage = await loadImage(readFileSync(imagePath))
    const canvas = createCanvas(baseImage.width, baseImage.height)
    const ctx = canvas.getContext("2d")
    ctx.drawImage(baseImage, 0, 0)

    cachedBaseImage = {
        canvas,
        width: baseImage.width,
        height: baseImage.height,
    }

    return cachedBaseImage
}

function generateCode(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    let result = ""
    for (let i = 0; i < 16; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
}

async function encodeCodeToImage(code: string, format: "image/png" | "image/jpeg" = "image/png"): Promise<Buffer> {
    const { canvas, width, height } = await getBaseImage()

    const imageData = canvas.getContext("2d").getImageData(0, 0, width, height)
    const data = imageData.data

    const codeBytes = Buffer.from(code, "utf-8")
    const codeLength = codeBytes.length

    const header = Buffer.alloc(4)
    header.writeUInt32BE(codeLength, 0)

    const messageData = Buffer.concat([header, codeBytes])
    const bits: number[] = []

    for (const byte of messageData) {
        for (let bit = 7; bit >= 0; bit--) {
            bits.push((byte >> bit) & 1)
        }
    }

    let bitIndex = 0
    for (let i = 0; i < data.length; i += 4) {
        if (bitIndex < bits.length) {
            const bit = bits[bitIndex++]
            data[i] = (data[i] & 0xfe) | bit
        }
    }

    canvas.getContext("2d").putImageData(imageData, 0, 0)
    return canvas.toBuffer(format)
}

async function decodeCodeFromImage(buffer: Buffer): Promise<string | null> {
    try {
        const img = await loadImage(buffer)
        const canvas = createCanvas(img.width, img.height)
        const ctx = canvas.getContext("2d")
        ctx.drawImage(img, 0, 0)

        const imageData = ctx.getImageData(0, 0, img.width, img.height)
        const data = imageData.data
        const width = img.width
        const height = img.height

        const bits: number[] = []
        let bitIndex = 0
        const maxBits = 256 * 8

        for (let y = 0; y < height && bitIndex < maxBits; y++) {
            for (let x = 0; x < width && bitIndex < maxBits; x++) {
                const idx = (y * width + x) * 4
                if (idx + 3 < data.length) {
                    const r = data[idx]
                    bits.push(r & 1)
                    bitIndex++
                }
            }
        }

        const bytes: number[] = []
        for (let i = 0; i < bits.length; i += 8) {
            if (i + 8 > bits.length) break
            let byte = 0
            for (let j = 0; j < 8; j++) {
                byte = (byte << 1) | bits[i + j]
            }
            bytes.push(byte)
        }

        if (bytes.length < 4) return null

        const length = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]

        if (length < 0 || length > bytes.length - 4) return null

        const codeBytes = bytes.slice(4, 4 + length)
        try {
            return Buffer.from(codeBytes).toString("utf-8")
        } catch {
            return null
        }
    } catch {
        return null
    }
}

function signToken(user: typeof schema.users.$inferSelect) {
    return jwt.sign({ id: user.id, email: user.email, name: user.name, qq: user.qq }, jwtToken)
}

export const dnaAuthPlugin = () => {
    const app = new Elysia({
        prefix: "/api/auth/dna",
    })

    app.post(
        "/qr",
        async ({ body: { dnaUid }, set }) => {
            if (!dnaUid) {
                set.status = 400
                return { success: false, error: "DNA UID 不能为空" }
            }

            const code = generateCode()
            // const imageBuffer = await encodeCodeToImage(code)

            const expiresAt = new Date(Date.now() + SESSION_EXPIRE_MINUTES * 60 * 1000)

            const sessionId = id()
            const imageUrl = `/api/auth/dna/session/${sessionId}/image`

            const session = (
                await db
                    .insert(schema.dnaAuthSessions)
                    .values({
                        id: sessionId,
                        code,
                        imageUrl,
                        dnaUid,
                        expiresAt: expiresAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }),
                    })
                    .returning()
            )[0]

            if (!session) {
                set.status = 500
                return { success: false, error: "创建会话失败" }
            }

            return {
                success: true,
                sessionId: session.id,
                imageUrl,
                expiresAt: session.expiresAt,
            }
        },
        {
            body: t.Object({
                dnaUid: t.String(),
            }),
        },
    )

    app.get("/session/:id/image", async ({ params: { id }, set }) => {
        const session = await db.query.dnaAuthSessions.findFirst({
            where: eq(schema.dnaAuthSessions.id, id),
        })

        if (!session) {
            set.status = 404
            return { error: "会话不存在" }
        }

        const imageBuffer = await encodeCodeToImage(session.code)

        set.headers["Content-Type"] = "image/png"
        set.headers["Cache-Control"] = "no-store"

        return imageBuffer
    })

    app.post(
        "/verify",
        async ({ body: { sessionId, imageUrl }, set }) => {
            if (!sessionId || !imageUrl || !imageUrl.startsWith("https://herobox-img.yingxiong.com/")) {
                set.status = 400
                return { success: false, error: "非法参数" }
            }

            const session = await db.query.dnaAuthSessions.findFirst({
                where: eq(schema.dnaAuthSessions.id, sessionId),
            })

            if (!session) {
                set.status = 404
                return { success: false, error: "会话不存在" }
            }

            const expiresAt = new Date(session.expiresAt)
            if (expiresAt < new Date()) {
                set.status = 400
                return { success: false, error: "会话已过期" }
            }

            try {
                const response = await fetch(imageUrl)
                if (!response.ok) {
                    set.status = 400
                    return { success: false, error: "无法获取图片" }
                }

                const imageBuffer = await response.arrayBuffer()

                const extractedCode = await decodeCodeFromImage(Buffer.from(imageBuffer))

                if (!extractedCode || extractedCode !== session.code) {
                    set.status = 400
                    return { success: false, error: "图片验证失败" }
                }

                let binding = await db.query.dnaUserBindings.findFirst({
                    where: eq(schema.dnaUserBindings.dnaUid, session.dnaUid),
                })

                let user
                if (binding) {
                    user = await db.query.users.findFirst({
                        where: eq(schema.users.id, binding.userId),
                    })
                } else {
                    const email = `dna_${session.dnaUid}@dna.user`
                    const dnaAPI = getDNAAPI()
                    const res = await dnaAPI.getOtherMine(session.dnaUid)
                    const name = res.data?.mine.userName
                    const pic = res.data?.mine.headUrl
                    if (!name) {
                        set.status = 400
                        return { success: false, error: "无法获取用户名" }
                    }
                    user = (
                        await db
                            .insert(schema.users)
                            .values({
                                email,
                                name,
                                pic,
                                uid: session.dnaUid,
                            })
                            .onConflictDoUpdate({
                                target: schema.users.email,
                                set: { uid: session.dnaUid, updateAt: now() },
                            })
                            .returning()
                    )[0]

                    if (user) {
                        await db
                            .insert(schema.dnaUserBindings)
                            .values({
                                userId: user.id,
                                dnaUid: session.dnaUid,
                            })
                            .onConflictDoNothing()
                    }
                }

                if (!user) {
                    set.status = 500
                    return { success: false, error: "用户创建失败" }
                }

                const token = signToken(user)

                await db.delete(schema.dnaAuthSessions).where(eq(schema.dnaAuthSessions.id, sessionId))

                return {
                    success: true,
                    token,
                    user: {
                        id: user.id,
                        email: user.email,
                        name: user.name,
                        qq: user.qq,
                        roles: user.roles,
                        createdAt: user.createdAt,
                        updateAt: user.updateAt,
                    },
                }
            } catch (error) {
                console.error("验证失败:", error)
                set.status = 500
                return { success: false, error: "验证失败" }
            }
        },
        {
            body: t.Object({
                sessionId: t.String(),
                imageUrl: t.String(),
            }),
        },
    )

    return app
}

export { encodeCodeToImage, decodeCodeFromImage }
