import { env } from "../env"

/**
 * 安全模式解锁密码的 REST 接口封装（服务端见 `server/src/api/safe-mode.ts`）。
 *
 * 解锁密码由服务端定时打进 zip 上传到夸克网盘，前端凭用户从压缩包里抄来的
 * 密码调 verify 接口，服务端只做 bcrypt 对错比对。
 */

/** 解锁密码对外状态（不含密码明文与哈希）。 */
export interface SafeModeVaultStatus {
    fileName: string
    fid: string
    size: number
    sha256: string
    uploadedAt: number
    /** 上次一致性校验时间（毫秒，未校验过时缺失） */
    lastCheckedAt?: number
    /** 上次一致性校验是否通过 */
    consistent?: boolean
}

const BASE_URL = `${env.apiEndpoint.replace(/\/$/, "")}/api/safe-mode/vault`

/** 查询解锁密码状态：是否可用、分享信息、上次上传时间。 */
export async function getSafeModeVaultStatus(): Promise<{ configured: boolean; status: SafeModeVaultStatus | null }> {
    const response = await fetch(`${BASE_URL}/status`)
    if (!response.ok) {
        throw new Error(`请求失败（HTTP ${response.status}）`)
    }
    return (await response.json()) as { configured: boolean; status: SafeModeVaultStatus | null }
}

/**
 * 提交解锁密码，正确返回 true，错误返回 false（网络异常时抛错）。
 * @param password 用户从密码压缩包中抄来的密码
 */
export async function verifySafeModeVaultPassword(password: string): Promise<boolean> {
    const response = await fetch(`${BASE_URL}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
    })
    if (response.status === 401) {
        return false
    }
    if (!response.ok) {
        throw new Error(`请求失败（HTTP ${response.status}）`)
    }
    const payload = (await response.json()) as { success: boolean }
    return payload.success === true
}
