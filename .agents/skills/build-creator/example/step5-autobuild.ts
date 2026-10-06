import { writeFileSync } from "node:fs"
import {
    ModTypeMap,
    ModTypeMaxSlot,
    chosenBuffs,
    dumpMods,
    legal,
    loadSpec,
    makeBuild,
    modData,
    modPool,
    overCost,
    requiredSlots,
    optimize,
    settingsOf,
    stateToPatch,
    withTeam,
    LeveledModHelper,
    亿,
    type ModTypeKey,
    type Spec,
} from "./lib"

const spec = loadSpec()
const patch = withTeam(spec, chosenBuffs())
const settings = settingsOf(spec, patch)

const includeTypes: ModTypeKey[] = ["charMods", "meleeMods", "rangedMods"]

function modOptions(types: ModTypeKey[]) {
    const set = new Set(types.map(t => ModTypeMap[t] as string))
    return modData.filter((m: any) => set.has(m.类型)).map((m: any) => LeveledModHelper.withCount(m, undefined, 0, 8))
}

console.log("=== 1) autoBuild（必带件当种子保留）===")
const seed = { ...patch, ...requiredSlots(spec) }
const build: any = makeBuild(spec, seed)
const before = build.calculate()
console.log(`autoBuild 前 ${亿(before)} 亿（已放入必带件 ${JSON.stringify(spec.required ?? {})}）`)

const res: any = build.autoBuild({
    includeTypes,
    preserveTypes: includeTypes,
    fixedMelee: true,
    fixedRanged: true,
    modOptions: modOptions(includeTypes),
    meleeOptions: [],
    rangedOptions: [],
    enableLog: true,
})
const nb: any = res.newBuild
console.log(`autoBuild 后 ${亿(nb.calculate())} 亿（迭代 ${res.iter} 次）`)
for (const key of includeTypes) console.log(`  ${key}  ${dumpMods(nb, key)}`)
console.log(`  中枢 ${nb.auraMod?.名称 ?? "空"}（最大耐受 ${nb.auraMod?.最大耐受 ?? "-"}）`)

console.log("\n=== 2) 剔除不合理：耐受复核 ===")
const over = overCost(nb)
if (!over.length) console.log("  未超载 ✓")
else for (const o of over) console.log(`  ${o.key} 超载：极化后 ${o.cost} > cap ${o.cap} ⇒ 必须剔件或换件`)
const 无效件 = includeTypes.flatMap(key =>
    (nb[key] as any[])
        .map((m, i) => ({ key, i, m }))
        .filter(x => x.m && !(nb.checkModEffective(x.m)?.isEffective ?? true))
        .map(x => `${x.key}[${x.i}] ${x.m.名称}（条件不生效）`),
)
console.log(`  条件不生效件：${无效件.join(" ") || "无 ✓"}`)
for (const key of includeTypes) {
    const 池 = modPool(spec, key === "charMods" ? "角色" : key === "meleeMods" ? "近战" : "远程")
    const 非法 = (nb[key] as any[]).filter(m => m && !池.some(c => c.id === m.id)).map(m => m.名称)
    if (非法.length) console.log(`  ${key} 属性/限定违规：${非法.join(",")}`)
}
for (const key of includeTypes) void ModTypeMaxSlot[key]

console.log("\n=== 3) 自写搜索（爬山 + 扰动重启，含耐受与合法性硬校验）===")
const autoPatch = {
    ...patch,
    charMods: (nb.charMods as any[]).map(m => (m ? [m.id, 10] : null)),
    meleeMods: (nb.meleeMods as any[]).map(m => (m ? [m.id, 10] : null)),
    rangedMods: (nb.rangedMods as any[]).map(m => (m ? [m.id, 10] : null)),
    auraMod: nb.auraMod?.id ?? settings.auraMod,
}
console.log(`  起点(autoBuild) 合法性 legal=${includeTypes.every(k => legal(从patch取池(autoPatch, k, spec)))}`)

const best = optimize(spec, patch)
if (!best.state) {
    console.log("  搜索没有找到可行解（检查 spec.required 与耐受上限）")
} else {
    const winPatch = { ...patch, ...stateToPatch(best.state) }
    const wb: any = makeBuild(spec, winPatch)
    console.log(`\n最优 ${亿(wb.calculate())} 亿`)
    for (const key of includeTypes) console.log(`  ${key}  ${dumpMods(wb, key)}`)
    console.log(`  中枢 ${best.state.aura?.名称 ?? "空"}`)
    writeFileSync(".tmp/build-win.json", JSON.stringify(stateToPatch(best.state), null, 1))
    console.log("\n已写入 .tmp/build-win.json")
}

function 从patch取池(p: any, key: ModTypeKey, s: Spec) {
    const 类型 = key === "charMods" ? "角色" : key === "meleeMods" ? "近战" : "远程"
    const 池 = modPool(s, 类型 as any)
    return (p[key] as any[]).map(x => (x ? 池.find(m => m.id === x[0]) ?? null : null))
}
