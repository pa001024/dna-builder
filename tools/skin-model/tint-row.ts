/**
 * 默认染色表（`DT_ShopskinTint` / `DT_HairTint`）按网格名取行。
 *
 * 表里的 key 是网格名（`QNF_SP14_Body_SM`），材质名是另一套写法
 * （`MI_QNF01_SP14_BodyUP`），两者既不同名也不同目录。早期实现只比对首段
 * （`QNF01`），结果所有同体型套装都命中 SP01 那一行，整只皮肤套用了别人的配色。
 * 正确口径是先按套装码（`SP14` / `TP03`）分组，再按体型前缀收窄。
 */

/** 从网格名里取套装码，如 `QNF01_SP14_BodyUP` → `SP14`。 */
export function suitCode(name: string): string | undefined {
    return name.match(/(?:SP|TP)\d+/)?.[0]
}

/** 取体型前缀，如 `QNF01_SP14_BodyUP` → `QNF01`。 */
function bodyType(name: string): string {
    return name.split("_")[0]
}

/** 在染色表里按材质名找默认行；无法唯一确定时返回 undefined（调用方保留材质自带默认值）。 */
export function pickTintRow<T>(table: Record<string, T>, materialName: string): T | undefined {
    if (table[materialName]) return table[materialName]
    const code = suitCode(materialName)
    if (!code) return undefined
    const candidates = Object.keys(table).filter(key => suitCode(key) === code)
    return (
        candidates.find(key => bodyType(key) === bodyType(materialName)) ??
        // 套装码唯一时不必再比体型：`QNF01_SP14_BodyUP` 只可能对上 `QNF_SP14_Body_SM`
        (candidates.length === 1 ? table[candidates[0]] : undefined)
    )
}
