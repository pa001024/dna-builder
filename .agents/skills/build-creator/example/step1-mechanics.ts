import { charMap, weaponMap, modMap } from "./lib"

const charId = Number(process.argv[2] ?? 0)
if (!charId) {
    console.log("用法：bun .agents/skills/build-creator/example/step1-mechanics.ts <角色id>")
    process.exit(0)
}

const c: any = charMap.get(charId)
if (!c) {
    console.log(`角色 ${charId} 不在数据包里`)
    process.exit(1)
}

console.log(`=== ${c.名称}（${c.id}） ===`)
console.log("属性", c.属性, "| 精通", JSON.stringify(c.精通), "| 额外精通", JSON.stringify(c.额外精通))
console.log("基础攻击/生命/防御/护盾/神智", c.基础攻击, c.基础生命, c.基础防御, c.基础护盾, c.基础神智)
console.log("角色加成", JSON.stringify(c.加成))
console.log("专武字段", c.专武 ?? "（无）", c.专武 ? (weaponMap.get(c.专武) as any)?.名称 : "")

console.log("\n--- 技能 ---")
for (const s of c.技能 as any[]) {
    console.log(`[${s.id}] ${s.名称} | ${s.类型}`)
    if (s.描述) console.log("   描述:", String(s.描述).replace(/\n/g, " / "))
    for (const f of s.字段 ?? []) {
        const tag = f.tag ? ` tag=${JSON.stringify(f.tag)}` : " tag=（无 tag，说明性字段，表达式要自己补）"
        console.log(`     · ${f.名称} = ${JSON.stringify(f.值)}${tag}`)
    }
}

console.log("\n--- 溯源 ---")
;(c.溯源 as string[] | undefined)?.forEach((t, i) => console.log(`  ${i + 1}溯: ${t}`))

console.log("\n--- 可用的表达式命名空间 ---")
console.log("角色:: / 近战:: / 远程:: 前缀 + 以下技能名::字段名（表达式里用 `!` 取面板值）")
for (const s of c.技能 as any[]) console.log(`  ${s.名称}::${(s.字段 ?? []).map((f: any) => f.名称).join(" / ")}`)

const meleeId = (c.专武 && (weaponMap.get(c.专武) as any)?.类型?.includes("近战")) ? c.专武 : undefined
if (meleeId) dumpWeapon(meleeId)
const 关键字 = process.env.WEAPON_KEYWORD || "灾厄"
for (const w of weaponMap.values() as any) {
    const blob = JSON.stringify([w.技能, w.熔炼])
    if (blob.includes(关键字)) console.log(`（提示）武器正文含「${关键字}」：${w.id} ${w.名称}`)
}

function dumpWeapon(id: number) {
    const w: any = weaponMap.get(id)
    if (!w) return
    console.log(`\n--- 武器 ${id} ${w.名称} ---`)
    console.log("类型", JSON.stringify(w.类型), "| 伤害类型", w.伤害类型, "| 加成", JSON.stringify(w.加成))
    console.log("熔炼（精炼文本 + 数值上下限）", JSON.stringify(w.熔炼))
    for (const s of w.技能 ?? []) {
        console.log(`  ${s.名称}`)
        for (const f of s.字段 ?? []) console.log(`     · ${f.名称} = ${JSON.stringify(f.值)} tag=${JSON.stringify(f.tag ?? null)}`)
    }
}

const 有最大耐受 = [...modMap.values()].filter((m: any) => m.最大耐受 !== undefined).length
console.log(`\n（环境自检）MOD ${modMap.size} 件，其中中枢候选 ${有最大耐受} 件`)
