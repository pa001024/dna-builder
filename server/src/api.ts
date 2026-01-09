import { fetch } from "bun"
import { Elysia, t } from "elysia"
import { uploadImage } from "./upload"

export const apiPlugin = () => {
    const app = new Elysia({
        prefix: "/api",
    })
    // app.post("/fetch", async ({ body, request }) => {
    //     const contentType = request.headers.get("content-type") || ""

    //     if (contentType.includes("multipart/form-data")) {
    //         const formData = body as FormData
    //         const url = formData.get("url") as string
    //         const method = (formData.get("method") as string) || "GET"

    //         const options: RequestInit = { method }

    //         const headersStr = formData.get("headers") as string
    //         if (headersStr) {
    //             const headersArray = JSON.parse(headersStr) as [string, string][]
    //             const headers = new Headers()
    //             for (const [key, value] of headersArray) {
    //                 headers.append(key, value)
    //             }
    //             options.headers = headers
    //         }

    //         const targetFormData = new FormData()
    //         for (const [key, value] of formData.entries()) {
    //             if (key.startsWith("body_")) {
    //                 const targetKey = key.replace("body_", "")
    //                 targetFormData.append(targetKey, value as any)
    //             }
    //         }
    //         options.body = targetFormData

    //         const res = await fetch(url, options)
    //         return await res.json()
    //     } else {
    //         const { url, ...options } = body as { url: string } & RequestInit
    //         const res = await fetch(url, options)
    //         return await res.json()
    //     }
    // })
    app.post(
        "/upload/image",
        async ({ body: { file } }) => {
            try {
                if (!file) {
                    return {
                        success: false,
                        error: "文件不能为空",
                    }
                }

                const url = await uploadImage(file)
                return {
                    success: true,
                    url,
                }
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : "上传失败",
                }
            }
        },
        {
            body: t.Object({
                file: t.File(),
            }),
        },
    )
    return app
}
