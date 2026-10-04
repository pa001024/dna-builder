/**
 * Agent 运行配置的统一解析入口。
 *
 * 资料检索 Agent 与配装 Agent 共用同一套凭证策略：
 * 设置页开启了自定义模型且填了密钥 → 用自己的密钥直连；
 * 否则只要已登录 → 走服务端反代（`${apiEndpoint}/api/v1`，凭证为登录令牌，按账号计费）。
 *
 * 放在这里而不是各 Agent 内部，是为了避免两个入口各自演化出不同的优先级与不同的代理地址。
 */

import { watch } from "vue"
import { type AgentUpstreamConfig, buildProxyAgentConfig } from "@/api/agent/config"
import { env } from "@/env"
import { useSettingStore } from "@/store/setting"
import { useUserStore } from "@/store/user"

/**
 * @description 解析当前可用的 Agent 上游配置。
 *
 * 自定义模型开关是总闸：只有开关打开且填了密钥才直连用户自己的上游，
 * 其余情况（开关关闭、或开了但没填密钥）一律回退服务端反代。
 * @returns 可用配置；既没有密钥又未登录时返回 null
 */
export function resolveSharedAgentUpstream(): Partial<AgentUpstreamConfig> | null {
    const setting = useSettingStore()
    const user = useUserStore()

    if (setting.aiCustomModel && setting.aiApiKey?.trim()) {
        return setting.getOpenAIConfig()
    }

    if (!user.jwtToken) {
        return null
    }

    return buildProxyAgentConfig(env.apiEndpoint, user.jwtToken, {
        default_max_tokens: setting.aiMaxTokens,
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
        () => [setting.aiCustomModel, setting.aiApiKey, setting.aiBaseUrl, setting.aiModelName, setting.aiMaxTokens, user.jwtToken],
        () => apply(resolveSharedAgentUpstream() ?? { api_key: "" })
    )
}
