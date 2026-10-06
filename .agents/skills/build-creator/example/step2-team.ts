import { assistMatrix, evaluate, loadSpec, saveChosenBuffs, 亿 } from "./lib"

const spec = loadSpec()
const 组合 = assistMatrix(spec)

console.log(`辅助维度 ${spec.assist?.length ?? 0} 轴，组合数 ${组合.length}`)
console.log("（buff 组 = 各轴 buffs 的并集；光环型海妖 / 角色专属 buff 直接写在 option.buffs 里）\n")

const rows = 组合.map(c => ({
    label: c.label || "（无辅助）",
    buffs: c.buffs,
    v: evaluate(spec, { buffs: [...(spec.base.buffs ?? []), ...c.buffs] }),
}))

rows.sort((a, b) => b.v - a.v)

const 最优 = rows[0]
for (const r of rows) {
    const 相对 = 最优?.v > 0 && Number.isFinite(r.v) ? `  (${((r.v / 最优.v - 1) * 100).toFixed(2)}%)` : ""
    console.log(`${r.label.padEnd(36)} ${亿(r.v).padStart(10)} 亿${相对}`)
}

console.log(`\n最优 buff 组：${最优?.label}`)
console.log(`  ${(最优?.buffs ?? []).map(b => `${b[0]}+${b[1]}`).join(" · ") || "（空）"}`)
if (最优) saveChosenBuffs(最优.label, 最优.buffs)
console.log(`\n提示：最优组合已落盘，后续步骤会通过 chosenBuffs() 自动读取。`)
