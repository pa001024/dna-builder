const LOG_ANALYSIS_PARAMS = ["-EnableShippingLog", "-LogTimes", "-LogFiles"]

/**
 * 追加实时日志分析所需的启动参数，已存在于用户自定义参数中的项不重复追加。
 * @param params 用户原始启动参数
 */
export function appendLogAnalysisParams(params: string) {
    const present = new Set(
        params
            .split(/\s+/)
            .filter(Boolean)
            .map(arg => arg.toLowerCase())
    )
    const missing = LOG_ANALYSIS_PARAMS.filter(arg => !present.has(arg.toLowerCase()))
    if (!missing.length) return params
    return `${params}${params.trim() ? " " : ""}${missing.join(" ")}`
}

/** 会影响 EM.exe 启动参数的设置项。 */
export interface GameLaunchOptions {
    pathParams: string
    modEnable: boolean
    modLoader: string
    dx11Enable: boolean
    logAnalysisEnable: boolean
}

/**
 * 生成启动游戏时传给 EM.exe 的参数；启动游戏与创建桌面快捷方式共用同一口径。
 * @param options 游戏设置
 * @returns 启动参数字符串（可能为空）
 */
export function buildGameLaunchParams(options: GameLaunchOptions): string {
    let params = options.pathParams
    if (options.modEnable && options.modLoader === "legacy") params += `${params.trim() ? " " : ""}-fileopenlog`
    if (options.dx11Enable) params += `${params.trim() ? " " : ""}-dx11`
    return options.logAnalysisEnable ? appendLogAnalysisParams(params) : params
}
