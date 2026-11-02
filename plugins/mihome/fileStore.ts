import { env, getRuntime, type TokenStore } from "@dob/host"

const BROWSER_KEY = "mihome.auth"

/** 文件 TokenStore：读走内存缓存，写透缓存并串行落盘。 */
export interface ReadyTokenStore extends TokenStore {
    ready: Promise<void>
}

function browserStore(): ReadyTokenStore {
    return {
        ready: Promise.resolve(),
        load: () => {
            try {
                return typeof localStorage === "undefined" ? null : localStorage.getItem(BROWSER_KEY)
            } catch {
                return null
            }
        },
        save: raw => {
            try {
                localStorage.setItem(BROWSER_KEY, raw)
            } catch {
                // 隐私模式等不可写存储：保持内存登录态即可
            }
        },
        clear: () => {
            try {
                localStorage.removeItem(BROWSER_KEY)
            } catch {
                // ignore
            }
        },
    }
}

function fileStore(): ReadyTokenStore {
    const runtime = getRuntime()
    let cache: string | null | undefined
    let tail = Promise.resolve()
    let filePath = ""

    const ready = (async () => {
        filePath = await runtime.appDataFile("mihome", "auth.json")
        try {
            cache = await runtime.readTextFile(filePath)
            return
        } catch {
            // 新路径缺失：尝试继承历史登录态
        }
        try {
            const legacyPath = await runtime.appDataFile("mijia", "auth.json")
            const legacy = await runtime.readTextFile(legacyPath)
            cache = legacy
            await runtime.writeTextFile(filePath, legacy)
        } catch {
            cache = null
        }
    })()

    return {
        ready,
        load: () => cache ?? null,
        save: raw => {
            cache = raw
            tail = tail
                .then(async () => {
                    await runtime.writeTextFile(filePath, raw)
                })
                .catch(() => {})
        },
        clear: () => {
            cache = null
            tail = tail
                .then(async () => {
                    await runtime.writeTextFile(filePath, "")
                })
                .catch(() => {})
        },
    }
}

let singleton: ReadyTokenStore | null = null

/** 米家登录态存储（插件自带）：桌面端落盘（与原版同路径），浏览器回退 localStorage。 */
export function getMihomeStore(): ReadyTokenStore {
    if (!singleton) singleton = env.isApp ? fileStore() : browserStore()
    return singleton
}
