import { appDataFile, listDirectories, listFiles, pathExists, readTextFile, tauriFetch, writeTextFile } from "@/api/app"
import { env } from "@/env"
import type { ActionContext, AutomationEvent } from "./types"

/** 注入给动作插件的运行库：网络 + 磁盘读写（桌面端走 Tauri，浏览器仅 fetch 可用）。
 * 只提供原语，组合逻辑（如登录态存储）由各插件自己实现。 */
export interface AutomationRuntime {
    fetch: typeof fetch
    readTextFile(path: string): Promise<string>
    writeTextFile(path: string, content: string): Promise<string>
    listFiles(dir: string): Promise<string[]>
    listDirectories(dir: string): Promise<string[]>
    pathExists(path: string): Promise<boolean>
    appDataFile(...segments: string[]): Promise<string>
}

function desktopOnly(name: string): Promise<never> {
    return Promise.reject(new Error(`${name} 仅桌面端可用`))
}

let cached: AutomationRuntime | null = null

/** 测试用 action 上下文：手动事件 + 超时信号 + 当前运行库。 */
export function testContext(partial?: Partial<AutomationEvent>): ActionContext {
    return {
        event: { source: "manual", kind: "test", at: 0, label: "", data: {}, ...partial },
        signal: AbortSignal.timeout(1000),
        runtime: getRuntime(),
    }
}

/** 取插件运行库（单例）：桌面端注入 tauriFetch 与磁盘命令，浏览器回退全局 fetch。 */
export function getRuntime(): AutomationRuntime {
    if (!cached) {
        cached = env.isApp
            ? {
                  fetch: tauriFetch as typeof fetch,
                  readTextFile,
                  writeTextFile,
                  listFiles,
                  listDirectories,
                  pathExists,
                  appDataFile,
              }
            : {
                  fetch,
                  readTextFile: () => desktopOnly("readTextFile"),
                  writeTextFile: () => desktopOnly("writeTextFile"),
                  listFiles: () => desktopOnly("listFiles"),
                  listDirectories: () => desktopOnly("listDirectories"),
                  pathExists: () => desktopOnly("pathExists"),
                  appDataFile: () => desktopOnly("appDataFile"),
              }
    }
    return cached
}
