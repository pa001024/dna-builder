import { useTranslation } from "i18next-vue"

/** 属性说明在翻译文件中的命名空间（由 tools/import-attr-i18n.ts 从上游 AttrConfig 导入） */
const ATTR_DESC_NAMESPACE = "attrDesc"

/**
 * 上游属性名与属性说明的读取器，供角色属性面板、武器面板与装配预览共用。
 *
 * 文案由 tools/import-attr-i18n.ts 一次性导入 public/i18n/<locale>/translation.json：
 * 属性名落在根命名空间，属性说明落在 `attrDesc` 命名空间，两者的键都是属性在 zh-CN 下的展示名
 * （如「火属性攻击」「暴击」），所以这里传的是属性名而不是翻译键。
 * @returns 属性名与属性说明的查询方法
 */
export function useAttrI18n() {
    const { t, i18next } = useTranslation()

    /**
     * 取属性的 zh-CN 展示名，它同时是属性名的翻译键与 `attrDesc` 命名空间的键。
     * 攻击行按元素/伤害类型前缀拼出「火属性攻击」「切割攻击」（与上游 `Attr_ATK_*_Name` 的中文名一致），
     * 其余属性直接使用属性键，因此调用方对两种属性可以走同一条路径。
     * @param key 属性键名（CharAttr / WeaponAttr 的键）
     * @param attackPrefix 攻击行的前缀：元素（含「属性」后缀，如「火属性」）或武器伤害类型（如「切割」）
     * @returns 属性的 zh-CN 展示名
     */
    function getAttrName(key: string, attackPrefix = ""): string {
        return key === "攻击" ? `${attackPrefix}攻击` : key
    }

    /**
     * 读取属性的上游说明文案。
     * @param name 属性的 zh-CN 展示名（即 getAttrName 的返回值）
     * @returns 已本地化的说明文案；该属性在上游没有说明时返回空串
     */
    function getAttrDesc(name: string): string {
        const key = `${ATTR_DESC_NAMESPACE}.${name}`
        // 用 exists 兜底：上游未配置说明的属性不能把翻译键原样渲染出来
        return i18next.exists(key) ? t(key) : ""
    }

    return { getAttrName, getAttrDesc }
}
