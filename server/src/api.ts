import { fetch } from "bun"
import { Elysia } from "elysia"

export const apiPlugin = () => {
    const app = new Elysia({
        prefix: "/api",
    })
    app.post("/fetch", async ({ body }) => {
        const { url, ...options } = body as { url: string } & RequestInit
        const res = await fetch(url, options)
        return await res.json()
    })
    return app
}
