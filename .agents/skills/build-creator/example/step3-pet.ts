import { chosenBuffs, loadSpec, petActiveInfo, petCandidates, traitGreedy, withTeam, 亿 } from "./lib"

const spec = loadSpec()
const patch = withTeam(spec, chosenBuffs())

if (!spec.pets?.length) {
    console.log("spec.pets 为空，跳过魔灵遍历。把候选魔灵 id 填进去即可。")
} else {
    const { rows, best } = petCandidates(spec, patch, 5)
    console.log("=== 魔灵候选 ===")
    for (const r of rows) {
        const info = petActiveInfo(r.petId)
        console.log(`${String(r.petId).padEnd(8)} ${亿(r.v).padStart(10)} 亿   被动=${info.passive ?? "-"} 主动=${info.active ?? "-"}`)
    }
    const top = best[0]
    if (top) {
        console.log(`\n最优魔灵 ${top.petId}`)
        console.log(`提示：主动技覆盖率用 petCoverage / petAutoCoverage 控制（自动模式按 持续/冷却 折算）。`)
    }
}

const petId = spec.pets?.length ? petCandidates(spec, patch, 1).best[0]?.petId ?? 0 : spec.base.petId ?? 0
const { traits, v } = traitGreedy(spec, { ...patch, petId })
console.log(`\n=== 潜质贪心（魔灵 ${petId}）===\n最终 ${亿(v)} 亿`)
console.log(`traits = ${JSON.stringify(traits)}   ← 槽位存 [基础潜质 id(bid), 等级]，4 槽互不相同`)
console.log(`提示：只有 buffName 非空的「战斗潜质」会进属性结算；功能潜质不参与收益。`)
console.log(`把上面这行 traits 与 petId 写回 spec.base。`)
