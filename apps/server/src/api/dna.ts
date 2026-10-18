import { fetch } from "bun"
import { DNAAPI } from "dna-api"

/**
 * @description 读取服务端 DNA API 配置，尽量与前端持久化账号配置保持一致。
 * `USER_SERVER` / `USER_LANG` / `KF_TOKEN` 缺省时回退到国服中文环境。
 */
export const getDNAAPI = () => {
    const dnaAPI = new DNAAPI({
        dev_code: process.env.DEV_CODE!,
        token: process.env.USER_TOKEN,
        kf_token: process.env.KF_TOKEN,
        fetchFn: fetch,
        mode: "android",
        server: process.env.USER_SERVER === "global" ? "global" : "cn",
        lang: process.env.USER_LANG || "zh-Hans",
        // debug: true,
    })
    return dnaAPI
}
