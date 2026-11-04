/**
 * @file 配置类异常与模型默认值。
 * 配置问题在 CI 里只跳过发布并留痕，不让 release 步骤变红。
 */

export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com"
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-flash"

export class ConfigError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "ConfigError"
    }
}
