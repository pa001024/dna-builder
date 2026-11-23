/**
 * Agent 运行配置的统一解析入口。
 *
 * 资料检索 Agent 与配装 Agent 共用同一套凭证策略：
 * 设置页开启了自定义模型且填了密钥（或基址指向本机网关）→ 直连自己的上游；
 * 否则只要已登录 → 走服务端反代（`${apiEndpoint}/api/v1`，凭证为登录令牌，按账号计费）。
 *
 * 放在这里而不是各 Agent 内部，是为了避免两个入口各自演化出不同的优先级与不同的代理地址。
 */

import { watch } from "vue"
import { type AgentUpstreamConfig, buildProxyAgentConfig } from "@/api/agent/config"
import { isLocalGatewayBaseUrl } from "@/api/agent/wire"
import { env } from "@/env"
import { useSettingStore } from "@/store/setting"
import { useUserStore } from "@/store/user"
import { parseTokenCount, resolveAiMaxTokens } from "@/utils/ai-config"

/**
 * @description 判断设置页是否配置了可直连的自定义上游。
 * @param aiCustomModel 自定义模型开关
 * @param apiKey 自定义密钥
 * @param baseUrl 自定义基址
 * @returns 开关打开且填写了密钥（或指向本机网关）时返回 true
 */
function hasCustomUpstream(aiCustomModel: boolean, apiKey: string, baseUrl: string): boolean {
    return Boolean(aiCustomModel && (apiKey?.trim() || isLocalGatewayBaseUrl(baseUrl)))
}

/**
 * @description 当前是否直连用户自己的模型上游（自定义模型开关打开且填写了密钥，或指向本机网关）。
 * 该上游的单价未知，前端无法按服务端反代的 DeepSeek-Flash 口径计费。
 * @returns 使用自定义上游时返回 true
 */
export function isCustomAgentUpstream(): boolean {
    const setting = useSettingStore()

    return hasCustomUpstream(setting.aiCustomModel, setting.aiApiKey, setting.aiBaseUrl)
}

/**
 * @description 解析当前可用的 Agent 上游配置。
 *
 * 自定义模型开关是总闸：开关打开且填了密钥（本机网关可不填）才直连用户自己的上游，
 * 其余情况（开关关闭、或开了但没填密钥）一律回退服务端反代。
 * @returns 可用配置；既没有密钥又未登录时返回 null
 */
export function resolveSharedAgentUpstream(): Partial<AgentUpstreamConfig> | null {
    const setting = useSettingStore()
    const user = useUserStore()

    if (hasCustomUpstream(setting.aiCustomModel, setting.aiApiKey, setting.aiBaseUrl)) {
        return setting.getOpenAIConfig()
    }

    if (!user.jwtToken) {
        return null
    }

    // 反代模型固定（deepseek-flash），上下文窗口默认按模型名启发式解析：
    // 只有用户填写了可解析的值才覆盖，空值与乱填都保持启发式，避免把 1M 窗口误压到 256K 默认。
    const contextOverride = parseTokenCount(setting.aiContextWindow)
    return buildProxyAgentConfig(env.apiEndpoint, user.jwtToken, {
        default_max_tokens: resolveAiMaxTokens(setting.aiMaxTokens),
        ...(contextOverride != null ? { default_context_window: contextOverride } : {}),
    })
}

/**
 * @description 监听会影响 Agent 配置的设置项，变化即回写。
 *
 * 自定义模型开关 / 密钥 / 基址 / 模型 / 输出上限 / 登录态任一变动都要重建传输：
 * 传输实例持有 URL 与超时，配置换了不重建就会继续打到旧端点。
 * @param apply 回写回调，拿到一份新的配置
 */
export function watchAgentUpstream(apply: (config: Partial<AgentUpstreamConfig>) => void): void {
    const setting = useSettingStore()
    const user = useUserStore()

    watch(
        () => [
            setting.aiCustomModel,
            setting.aiApiKey,
            setting.aiBaseUrl,
            setting.aiModelName,
            setting.aiMaxTokens,
            setting.aiContextWindow,
            setting.aiModelMaxTokens,
            setting.aiModelContextWindow,
            setting.aiReasoningEffort,
            user.jwtToken,
        ],
        () => apply(resolveSharedAgentUpstream() ?? { api_key: "" })
    )
}
