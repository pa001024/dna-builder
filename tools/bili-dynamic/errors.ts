/**
 * @file 配置类异常：缺 Key、凭据无效、找不到浏览器等。
 * CI 里遇到它只跳过发布并留痕，不让 release 步骤变红。
 */

export class ConfigError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "ConfigError"
    }
}
