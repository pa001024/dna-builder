import * as forge from "node-forge"
import { rand_str2 } from "./utils"

export const GAME_ID_OC = "159"
export const PROJECT_ID = "10456"
export const FB_APP_ID = "1969162350523490"
export const FB_CLIENT_TOKEN = "e1efe6e74f2ae46f87231bb519d3a304"
export const TWITTER_KEY = "HJgwHbASKFT9P9WeGVZhaHi5V"
export const TWITTER_SECRET = "VmqVoGcCRsUggpXrEQpbttkTLftuIJveD3okOVWpcOEc5vDc13"
export const PRODUCT_CODE = "459"
export const PRODUCT_KEY = "la3nh98r46032fn90tzl"

/**
 * email 密码加密
 * @param password 原始密码
 * @returns 加密后的密码
 */
export function hashPassword(password: string) {
    // md5后base64
    const md5 = forge.md5.create().update(password).digest()
    return forge.util.encode64(md5.toHex().toLowerCase())
}

/**
 * 生成 UltraSDK 签名
 * @param productKey 产品密钥
 * @param params 参数数组，格式为 [key1, value1, key2, value2, ...]
 * @returns MD5 签名字符串
 */
export function markSign(...params: string[]): string {
    // 构建参数 Map
    const paramMap = new Map<string, string>()

    // 将参数数组转换为 Map（奇数位置为 key，偶数位置为 value）
    for (let i = 0; i < params.length - 1; i += 2) {
        const key = params[i]
        const value = params[i + 1]
        if (key && value) {
            paramMap.set(key, value)
        }
    }

    // 获取所有 key 并排序（排除 "sign"）
    const sortedKeys = Array.from(paramMap.keys())
        .filter(key => key !== "sign")
        .sort()

    // 构建签名字符串：key=value&key=value&...
    const signParts: string[] = []
    for (const key of sortedKeys) {
        const value = paramMap.get(key)
        if (value && value.length > 0) {
            signParts.push(`${key}=${value}`)
        }
    }

    // 追加 productKey
    signParts.push(PRODUCT_KEY)

    // 拼接所有部分
    const signString = signParts.join("&")

    // MD5 加密
    const md5 = forge.md.md5.create()
    md5.update(signString)
    return md5.digest().toHex()
}
function base64_11(str: string) {
    const utf8Bytes = forge.util.encodeUtf8(str)
    const standardBase64 = forge.util.encode64(utf8Bytes)
    const urlSafeNoPaddingBase64 = standardBase64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "") // 匹配末尾一个或多个=，并移除
    return urlSafeNoPaddingBase64
}
/**
 * 生成 sendVerifyCode API 的 data 参数
 * @param params 参数对象
 * @returns 编码后的 data 字符串
 */
export function generateDataParam(params: Record<string, any>): string {
    const jsonString = JSON.stringify(params)
    // 5. Base64 编码
    const base64String = base64_11(jsonString)

    // 6. 如果长度 > 51，进行字符替换混淆
    if (base64String.length > 51) {
        return changeArray(base64String)
    }

    return base64String
}

/**
 * UltraSDK data 参数字符位置交换（只对长度 > 51 的字符串生效）
 * 交换位置: 1↔33, 10↔42, 18↔50, 19↔51
 * @param str Base64 编码后的字符串
 * @returns 混淆后的字符串
 */
export function changeArray(str: string): string {
    const chars = str.split("")
    const swaps = [
        [1, 33],
        [10, 42],
        [18, 50],
        [19, 51],
    ]
    for (const [i, j] of swaps) {
        if (i < chars.length && j < chars.length) {
            ;[chars[i], chars[j]] = [chars[j], chars[i]]
        }
    }
    return chars.join("")
}

/**
 * 解析 sendVerifyCode API 的 data 参数
 * @param encodedData 编码后的 data 字符串
 * @returns 解析后的参数对象
 */
export function parseDataParam(encodedData: string): Record<string, any> | null {
    try {
        let data = encodedData

        // 1. 如果长度 > 51，进行反向字符位置交换
        if (data.length > 51) {
            data = changeArray(data)
        }

        // 2. Base64 解码
        const base64Bytes = Buffer.from(data, "base64")

        // 3. UTF-8 解码
        const jsonString = base64Bytes.toString("utf-8")

        // 4. 解析 JSON
        const jsonObject = JSON.parse(jsonString)
        return jsonObject
    } catch (error) {
        console.error("解析 data 参数失败", error)
        return null
    }
}

export function uuid(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
        const r = Math.floor(Math.random() * 16)
        const v = c === "x" ? r : (r & 0x3) | 0x8
        return v.toString(16)
    })
}

/**
 * 生成 emailVerify 接口的请求参数
 * @param customParams 自定义参数对象
 * @returns URL 查询字符串
 */
export function generateEmailVerifyParams(customParams: Record<string, any>): string {
    // 基础参数（从 Java ConnectionUtils.baseParam 复制）
    const baseParams: Record<string, any> = {
        gid: GAME_ID_OC,
        osh: "1280",
        gaid: uuid(), //"618d30f2-e96e-4d4d-bd04-130b6580ef3e",
        nt: "1",
        dn: uuid(), // "dc2f1a21-4d24-35cc-8b5c-933f782dc963",
        imsi: "",
        osw: "720",
        apiVersion: "1",
        osVersion: "9",
        gfsid: rand_str2(16), //"3fb1d6f434dbb4c3",
        deviceMode: "NX627J",
        plat: "0",
        lang: "zh_CN",
        vc: "5",
        svc: "50008",
        af_version: "",
        ov: "9",
        svn: "5.0.0.08",
        afid: "",
        oriDev: "0",
        tsid: rand_str2(32), //"posuiihel48dbpshccuoncbnqy5ojpz2",
        tusid: "0",
        tcsid: "0",
        vn: "1.1.1",
        imei: "",
        upv: "0",
        pk: "com.herodna.oversea",
        projectId: PROJECT_ID,
        tdn: uuid(), //"21fcf615-7162-469d-92a5-b692e660d76a",
    }

    // 合并自定义参数
    const allParams = { ...baseParams, ...customParams }

    // 生成 data 参数（JSON -> Base64 -> 可选混淆）
    const data = generateDataParam(allParams)

    // 生成时间戳
    const timestamp = Math.floor(Date.now() / 1000).toString()

    const sign = markSign("pcode", PRODUCT_CODE, "data", data, "timestamp", timestamp)

    // 构建最终参数
    const finalParams = new URLSearchParams({
        pcode: PRODUCT_CODE,
        data,
        sign,
        timestamp,
    })

    return finalParams.toString()
}
