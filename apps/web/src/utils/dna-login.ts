/** 登录态探测响应的最小形状（兼容 dna-api 的 TimeBasicResponse，避免耦合具体类）。 */
export interface DnaLoginProbe {
    code: number
    msg?: string
    data?: unknown
    is_success: boolean
}

/**
 * 登录态探测响应是否说明 token 已失效（需要走 refreshToken 续期）。
 * token 失效时服务端未必在 msg 里写“失效/过期”，可能只返回非成功 code 或空 data，这两种都必须视为失效。
 */
export function isDnaLoginInvalid(res: DnaLoginProbe | null | undefined): boolean {
    if (!res) return true
    // 客户端本地失败（网络超时/重试耗尽/解析异常）：无法判定服务端登录态，不触发续期，避免离线时误吊销账号
    if (res.code === -999) return false
    const msg = res.msg ?? ""
    if (/失效|过期|未登录|重新登录|请登录|登录失败|鉴权|token|unauthorized|unauthenticated|invalid|expir/i.test(msg)) return true
    if (!res.is_success) return true
    const data = res.data
    if (data === null || data === undefined) return true
    if (typeof data === "string" && data.trim() === "") return true
    if (typeof data === "object" && !Array.isArray(data) && Object.keys(data).length === 0) return true
    return false
}
