import type { ASTBinary, ASTFunction, ASTMemberAccess, ASTNode, ASTProperty, ASTTemporaryAttributes, ASTUnary } from "../packages/data/ast"
import { CharBuild } from "../packages/data/CharBuild"
import { LeveledBuff, LeveledChar, LeveledMod, LeveledWeapon } from "../packages/data/leveled"

/** P0 AST 单测向量清单：evaluateAST.test.ts 的 P0 子集（全文件共 142 个 it，本文件只收录进 parity 的向量）。 */
export const AST_VECTOR_NAMES = [
    "数字节点",
    "负数",
    "加法",
    "临时属性",
    "成员分支",
    "召唤物临时",
    "武器关键词",
    "固定攻击",
    "固定生命",
    "负触发不归零",
    "暴击溢出",
    "触发封顶",
    "充盈转化",
    "转属逆",
    "转属克",
    "除零",
    "循环引用",
    "DPS宏",
    "DPH宏",
] as const

/** 构造 evaluateAST.test.ts beforeEach 同源构筑。 */
export function createAstBuild(): CharBuild {
    return new CharBuild({
        char: new LeveledChar("黎瑟"),
        hpPercent: 0.5,
        resonanceGain: 2,
        charMods: [new LeveledMod(41324), new LeveledMod(51313)],
        buffs: [new LeveledBuff("黎瑟E")],
        melee: new LeveledWeapon(10302),
        ranged: new LeveledWeapon(20601),
        baseName: "快速出击",
        enemyId: 130,
        enemyLevel: 80,
        enemyResistance: 0.5,
        targetFunction: "伤害",
    })
}

/** P0 AST 目标函数向量（evaluate_build 只跑 targetFunction 整值；逐表达式向量见 extract 脚本的 evaluateAST 记录）。 */
export const AST_VECTORS: { file: string; name: string; targetFunction: string }[] = [
    { file: "evaluateAST.test.ts", name: "数字节点", targetFunction: "100" },
    { file: "evaluateAST.test.ts", name: "负数", targetFunction: "-50" },
    { file: "evaluateAST.test.ts", name: "加法", targetFunction: "10 + 20" },
    { file: "evaluateAST.test.ts", name: "减法", targetFunction: "10 - 4" },
    { file: "evaluateAST.test.ts", name: "乘法", targetFunction: "6 * 7" },
    { file: "evaluateAST.test.ts", name: "除法", targetFunction: "20 / 4" },
    { file: "evaluateAST.test.ts", name: "取模", targetFunction: "10 % 3" },
    { file: "evaluateAST.test.ts", name: "整数除法", targetFunction: "7 // 2" },
    { file: "evaluateAST.test.ts", name: "除零", targetFunction: "1 / 0" },
    { file: "evaluateAST.test.ts", name: "复杂表达式", targetFunction: "(10 + 4) * 2 - 6 / 3" },
    { file: "evaluateAST.test.ts", name: "min函数", targetFunction: "min(3, 7)" },
    { file: "evaluateAST.test.ts", name: "max函数", targetFunction: "max(3, 7)" },
    { file: "evaluateAST.test.ts", name: "floor函数", targetFunction: "floor(3.7)" },
    { file: "evaluateAST.test.ts", name: "ceil函数", targetFunction: "ceil(3.2)" },
    { file: "evaluateAST.test.ts", name: "or函数", targetFunction: "or(0, 5)" },
    { file: "evaluateAST.test.ts", name: "攻击属性", targetFunction: "[攻击]" },
    { file: "evaluateAST.test.ts", name: "生命属性", targetFunction: "[生命]" },
    { file: "evaluateAST.test.ts", name: "增伤属性", targetFunction: "[增伤]" },
    { file: "evaluateAST.test.ts", name: "成员访问", targetFunction: "[攻击].暴击" },
    { file: "evaluateAST.test.ts", name: "伤害目标", targetFunction: "伤害" },
    { file: "evaluateAST.test.ts", name: "DPS宏", targetFunction: "DPS" },
    { file: "evaluateAST.test.ts", name: "循环引用", targetFunction: "10 + [循环]" },
]

/** 抽取脚本运行期自检用（vitest 外可调用）：逐向量求值有限即通过。 */
export function assertAstVectorsFinite(): string[] {
    const build = createAstBuild()
    const attrs = build.calculateWeaponAttributes()
    const bad: string[] = []
    for (const vector of AST_VECTORS) {
        if (!Number.isFinite(build.evaluateAST(vector.targetFunction, attrs))) bad.push(vector.name)
    }
    const node = undefined as unknown as ASTNode
    void (node as ASTBinary | ASTFunction | ASTMemberAccess | ASTProperty | ASTTemporaryAttributes | ASTUnary)
    return bad
}
