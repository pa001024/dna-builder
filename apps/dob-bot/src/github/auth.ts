import crypto from "node:crypto"
import { base64url } from "../base64url.ts"

/**
 * 生成 GitHub App JWT，用于访问 /app/* 接口。
 * @param {{ appId: number, privateKeyPem: string, nowMs?: number }} params
 * @returns {string}
 */
export function createAppJwt({ appId, privateKeyPem, nowMs }: { appId: number; privateKeyPem: string; nowMs?: number }): string {
    const now = Math.floor((nowMs ?? Date.now()) / 1000)
    const header = { alg: "RS256", typ: "JWT" }
    const payload = {
        iat: now - 5,
        exp: now + 9 * 60,
        iss: String(appId),
    }

    const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`
    const signer = crypto.createSign("RSA-SHA256")
    signer.update(signingInput)
    signer.end()
    const signature = signer.sign(privateKeyPem)
    return `${signingInput}.${base64url(signature)}`
}
