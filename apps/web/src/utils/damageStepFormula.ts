/** 步骤定义中与公式文案相关的最小字段 */
export interface FormulaStepDefinition<TInput> {
    /** 静态公式文案（伤害机制索引逐字比对这份原文） */
    formula: string
    /** 动态公式文案（随输入变化，如角色元素）；存在时优先 */
    formulaOf?: (input: TInput) => string
}

/**
 * 解析步骤的展示公式：有动态文案时优先，否则回退静态文案。
 * @param definition 步骤定义
 * @param input 当前输入
 * @returns 展示用公式文案
 */
export function resolveStepFormula<TInput>(definition: FormulaStepDefinition<TInput>, input: TInput): string {
    return definition.formulaOf?.(input) ?? definition.formula
}
