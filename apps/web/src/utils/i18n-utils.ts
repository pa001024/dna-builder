/**
 * 数据枚举值展示名工具（转引）。
 *
 * 实现已下沉到数据层（`data/enum-text.ts`）——映射的键值是数据包里的原始枚举，
 * 与数据本身同源且 MCP 服务端也要用；此处仅保留转引，供前端按 utils 路径引用。
 */
export { getDropModeText, getRewardTypeText } from "@/data/enum-text"
