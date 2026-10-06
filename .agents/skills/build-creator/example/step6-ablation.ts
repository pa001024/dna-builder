import { existsSync, readFileSync } from "node:fs"
import { chosenBuffs, dumpMods, evaluate, loadSpec, makeBuild, modMap, printAblation, settingsOf, withTeam, writeBuild, 亿 } from "./lib"

const spec = loadSpec()
const patch = withTeam(spec, chosenBuffs())
const win = existsSync(".tmp/build-win.json") ? JSON.parse(readFileSync(".tmp/build-win.json", "utf8")) : {}
const finalPatch = { ...patch, ...win }
const finalSettings = settingsOf(spec, finalPatch)

console.log("=== 最终 BD ===")
const b: any = makeBuild(spec, finalPatch)
const dps = b.calculate()
console.log(`综合 DPS ${亿(dps)} 亿`)
for (const key of ["charMods", "meleeMods", "rangedMods"] as const) console.log(`  ${key} ${dumpMods(b, key)}`)
console.log(`  中枢 ${b.auraMod?.名称 ?? "空"}`)
console.log(`  buffs ${(finalSettings.buffs ?? []).map((x: any) => `${x[0]}+${x[1]}`).join(" · ")}`)
console.log(`  customBuff ${JSON.stringify(finalSettings.customBuff)}`)
console.log(`  petId ${finalSettings.petId}  潜质 ${JSON.stringify(finalSettings.traits)}`)

const items: { label: string; patch: Record<string, any> }[] = []

for (const [name, lv] of chosenBuffs()) {
    items.push({
        label: `辅助 ${name}+${lv}`,
        patch: { buffs: (finalSettings.buffs ?? []).filter((x: any) => !(x[0] === name && x[1] === lv)) },
    })
}

for (const key of ["charMods", "meleeMods", "rangedMods"] as const) {
    const list = (finalSettings[key] ?? []) as any[]
    list.forEach((x: any, i: number) => {
        if (!x) return
        const next = list.slice()
        next[i] = null
        items.push({ label: `MOD ${(modMap.get(x[0]) as any)?.名称 ?? x[0]} (${key})`, patch: { [key]: next } })
    })
}

if (finalSettings.petId) items.push({ label: "魔灵 被动+主动", patch: { petId: 0 } })
if ((finalSettings.traits ?? []).some(Boolean)) items.push({ label: "全部潜质", patch: { traits: [null, null, null, null] } })
for (const [attr] of (finalSettings.customBuff ?? []) as [string, number][]) {
    items.push({ label: `customBuff ${attr}`, patch: { customBuff: (finalSettings.customBuff as any[]).filter(x => x[0] !== attr) } })
}
for (const it of spec.ablate ?? []) items.push(it)
if (finalSettings.targetFunction) items.push({ label: "targetFunction 归零（哨兵项，应 −100%）", patch: { targetFunction: "" } })

const base = evaluate(spec, finalPatch)
const rows = items
    .map(it => {
        const v = evaluate(spec, { ...finalPatch, ...it.patch })
        return { label: it.label, v, delta: Number.isFinite(v) && base > 0 ? (v - base) / base : Number.NaN }
    })
    .filter(r => Number.isFinite(r.delta))
    .sort((a, b) => a.delta - b.delta)

printAblation("消融（撤掉后跌幅越大越关键）", { base, rows })

const 关键 = rows.filter(r => r.delta <= -0.05).map(r => r.label)
const 冗余 = rows.filter(r => r.delta >= -0.005).map(r => r.label)
console.log(`\n关键（跌幅 > 5%）：${关键.join(" · ") || "无"}`)
console.log(`冗余（跌幅 < 0.5%，考虑删掉）：${冗余.join(" · ") || "无"}`)

writeBuild("outputs/build-creator-result.json", finalSettings)
const back: any = JSON.parse(readFileSync("outputs/build-creator-result.json", "utf8"))
const again = evaluate(spec, back)
console.log(`回环校验 ${亿(again)} 亿 ${Math.abs(again - base) < 1e-6 ? "✓ 一致" : "✗ 不一致（settings 构造漏字段）"}`)
