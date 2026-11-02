/**
 * 插件宿主 API：插件只能从 `@dob/host`（类型 + 运行值）、`vue` 系
 * 与自身目录内文件导入，打包时除此之外一律按非法处理，运行时由加载器注入。
 */

export { launchExe, launchNormal } from "@/api/app"
/** 插件界面显式导入的宿主组件（沙箱无全局注册，必须 import）。 */
export { default as QrCodeStyled } from "@/components/QrCodeStyled.vue"
export { default as Select } from "@/components/select/Select.vue"
export { default as SelectItem } from "@/components/select/SelectItem.vue"
export { env } from "@/env"
export { useUIStore } from "@/store/ui"
export type { MiHomeScene, TokenStore } from "../../../../packages/mihome-api/src/index"
export { MiHomeClient } from "../../../../packages/mihome-api/src/index"
export { readPluginGlobalConfig, writePluginGlobalConfig } from "./pluginConfig"
export { getRuntime } from "./runtime"
export type {
    ActionContext,
    ActionDef,
    ActionField,
    ActionResult,
    AutomationEvent,
    AutomationRule,
    MatchCond,
    Matcher,
    MatchOp,
    PluginAccount,
} from "./types"
