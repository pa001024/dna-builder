import { chosenBuffs, dumpMods, legal, loadSpec, makeBuild, modPool, modMap, overCost, panel, settingsOf, withTeam, 亿 } from "./lib"

const spec = loadSpec()
const patch = withTeam(spec, chosenBuffs())
const settings = settingsOf(spec, patch)
const build: any = makeBuild(spec, patch)

console.log("=== 表达式自检（逐条求值）===")
const 变量: [string, string][] = (settings.customVariables ?? []).map((v: any) => [v[0], v[1]])
if (!变量.length) console.log("（customVariables 为空 —— 先把表达式写进 spec.base.customVariables）")
for (const [name, expr] of 变量) {
    let v: number
    let err = ""
    try {
        v = build.calculateTargetFunction(undefined, name)
    } catch (e: any) {
        v = Number.NaN
        err = String(e?.message ?? e).slice(0, 60)
    }
    const flag = err ? `  ← 抛异常：${err}` : Number.isFinite(v) ? (v === 0 ? "  ← 恒为 0，检查命名空间/字段名是否存在" : "") : "  ← NaN"
    const shown = Number.isFinite(v) ? (Math.abs(v) > 1e4 ? `${亿(v)} 亿` : v.toFixed(4)) : "NaN"
    console.log(`  ${name.padEnd(18)} ${shown.padStart(14)}${flag}   ${String(expr).slice(0, 60)}`)
}
const target = settings.targetFunction
console.log(`\ntargetFunction = ${target}  →  ${亿(build.calculate())} 亿`)
if (变量.length && !变量.some(([n]) => n === target)) console.log("（提示）targetFunction 不是 customVariables 的键，应指向一个已存在的技能字段或变量名。")

console.log("\n=== 面板 ===")
console.log(JSON.stringify(panel(build), null, 1))

console.log("\n=== 必带 MOD 合法性 ===")
for (const [key, 类型] of [["charMods", "角色"], ["meleeMods", "近战"], ["rangedMods", "远程"]] as const) {
    const ids = (spec.required as any)?.[key] ?? []
    if (!ids.length) {
        console.log(`  ${key}: 未指定必带件`)
        continue
    }
    const 池 = modPool(spec, 类型)
    const 槽 = ids.map((id: number) => 池.find(m => m.id === id) ?? null)
    const 缺 = ids.filter((id: number) => !池.some(m => m.id === id)).map((id: number) => `${id}(${(modMap.get(id) as any)?.名称 ?? "不存在"})`)
    console.log(`  ${key}: ${ids.length} 件，名称互斥+系列互斥 = ${legal(槽) ? "✓" : "✗ 违规"}，池外件 ${缺.join(",") || "无"}`)
    console.log(`     ${槽.map(m => (m ? `${m.名称}(${m.系列}/${m.极性 ?? "无"}/${m.耐受})` : "✗")).join("  ")}`)
}

const 必带 = {
    ...patch,
    charMods: 补空((spec.required as any)?.charMods ?? [], 8),
    meleeMods: 补空((spec.required as any)?.meleeMods ?? [], 8),
    rangedMods: 补空((spec.required as any)?.rangedMods ?? [], 8),
}
try {
    const b2: any = makeBuild(spec, 必带)
    const over = overCost(b2)
    console.log(`\n必带件单独占格时：${over.length ? `超载 ${over.map(o => `${o.key} ${o.cost}/${o.cap}`).join(" ")}` : "未超载"}`)
    console.log(`DPS（仅必带件） ${亿(b2.calculate())} 亿`)
    for (const key of ["charMods", "meleeMods", "rangedMods"] as const) console.log(`  ${key}  ${dumpMods(b2, key)}`)
} catch (e: any) {
    console.log(`仅必带件无法构筑：${String(e?.message ?? e).slice(0, 120)}`)
}

function 补空(ids: number[], n: number) {
    const out: any[] = ids.slice(0, n).map(id => [id, 10])
    while (out.length < n) out.push(null)
    return out
}
