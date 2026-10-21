import { nestCssLayers } from "../functions/nestCssLayers.js"
import components from "./components.js"
import tokens from "./tokens.js"

/**
 * 注册 db-style 覆写层。
 *
 * 组件差异统一进自定义子层 `@layer dob`：该子层在 daisyUI 全部子层之后首次声明，
 * 层序天然高于 `daisyui.l1.*`，因此无需依赖规则写入顺序，也不受上游变体排序影响。
 * 设计令牌写进 base 层（与主题变量同层、后写入）。
 * @param 插件 API 子集（addBase / addComponents）
 */
export default ({ addBase, addComponents }) => {
    addBase(tokens)
    addComponents(nestCssLayers({ "@layer dob": components }))
}
