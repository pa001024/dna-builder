// dob-calc-core 一键 smoke：真实 wasm 上跑 ≥1 夹具端到端并比对 targetValue。
//
// 用法：
//   bun tools/smoke-dob-calc-core.ts <modules.json> <request.json> [expectedTargetValue]
//   bun tools/smoke-dob-calc-core.ts <modules.json> --elements
//   bun tools/smoke-dob-calc-core.ts <modules.json> --team
//   bun tools/smoke-dob-calc-core.ts <modules.json> --income
//
// <modules.json>：模块 JSON（7 记录模块 + petTraits，见 ModulesJson）。
// <request.json>：求值请求 JSON（{charId, settings, seed?, timeline?}）。
// [expectedTargetValue]：可选，期望 targetValue；给出则按 §6.3 容差比对，不给只打印。
// `--elements`：U61 六元素增伤逐元素 parity + U62 元素限定键不进通用桶
// （锚点与 `tests/parity_charbuild.rs` 的 `element_damage_zone` / `element_damage_mod_weight` 同源，
// 均为 TS 实跑值，按相对 1e-9 比对；U62 场景额外注入合成 MOD 并断言 attributes）。
// `--team`：U89d2 协战命名空间端到端（`扶疏::技能威力` 等；锚点为 TS 归一化实跑值）。
// `--income`：U112 追伤分池收益 parity——同一构筑（含 customBuff 追伤分量）+ 同一 BUFF，
// TS `calcIncome` 与 wasm `dobcc_income` 逐值一致且非零（TS 侧现算，不用静态锚点）。
// wasm 路径：`$DOBCC_WASM` 或默认 `apps/web/public/wasm/dob_calc_core.wasm`。

import { statSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createCharBuildFromSettings } from "../packages/data/CharBuildHelper"
import { type CharSettings, createDefaultCharSettings, normalizeCharSettings } from "../packages/data/charSettings"
import { buffMap } from "../packages/data/index"
import { LeveledBuff } from "../packages/data/leveled/LeveledBuff"

const root = fileURLToPath(new URL("..", import.meta.url))
const wasmPath = process.env.DOBCC_WASM ?? resolve(root, "apps/web/public/wasm/dob_calc_core.wasm")

const [modulesPath, requestPath, expectedRaw] = process.argv.slice(2)
const elementMode = requestPath === "--elements"
const teamMode = requestPath === "--team"
const incomeMode = requestPath === "--income"
if (!modulesPath || (!elementMode && !teamMode && !incomeMode && !requestPath)) {
    console.error("用法：bun tools/smoke-dob-calc-core.ts <modules.json> <request.json> [expectedTargetValue]")
    console.error("      bun tools/smoke-dob-calc-core.ts <modules.json> --elements")
    console.error("      bun tools/smoke-dob-calc-core.ts <modules.json> --team")
    console.error("      bun tools/smoke-dob-calc-core.ts <modules.json> --income")
    process.exit(2)
}

const wasmBytes = await readFile(wasmPath)
const { instance } = await WebAssembly.instantiate(wasmBytes, {})
const wasm = instance.exports as {
    memory: WebAssembly.Memory
    dobcc_alloc(size: number): number
    dobcc_dealloc(ptr: number, size: number): void
    dobcc_open_session(ptr: number, len: number): bigint | number
    dobcc_evaluate(session: bigint | number, reqPtr: number, reqLen: number, outLenPtr: number): number
    dobcc_income(session: bigint | number, reqPtr: number, reqLen: number, outLenPtr: number): number
    dobcc_close_session(session: bigint | number): void
}

const decoder = new TextDecoder()
const encoder = new TextEncoder()
type Envelope = {
    ok: boolean
    result?: {
        targetValue?: number
        attributes?: Record<string, number>
        base?: number
        values?: Record<string, number>
        error?: string | null
    }
    error?: string
}

function copyIn(bytes: Uint8Array): number {
    const ptr = wasm.dobcc_alloc(bytes.length)
    new Uint8Array(wasm.memory.buffer).set(bytes, ptr)
    return ptr
}

// U62：合成 MOD（狮鹫系列 / 角色槽），仅 `--elements` 注入，与 TS/Rust 测试同一记录。
// `加成` 用单元素数组，取值与等级无关（TS/Rust 数组按下标取绝对值），避免浮点缩放误差。
const U62_MODS: [number, Record<string, number[]>][] = [
    [990001, {}],
    [990002, { 雷属性增伤: [0.3] }],
    [990003, { 火属性增伤: [0.3] }],
    [990004, { 元素增伤: [0.2], 雷属性增伤: [0.3] }],
    [990005, { 元素增伤: [0.2] }],
    [990006, { 光属性增伤: [0.3] }],
    [990007, { 元素增伤: [0.2], 光属性增伤: [0.3] }],
]

let modulesBytes: Uint8Array = await readFile(resolve(modulesPath))
if (elementMode) {
    const root = JSON.parse(decoder.decode(modulesBytes)) as Record<string, unknown>
    const mods = root["mod.data"] as Record<string, unknown>[]
    for (const [id, bonus] of U62_MODS) {
        mods.push({ id, 名称: "U62测试", 系列: "狮鹫", 品质: "金", 耐受: 0, 类型: "角色", 加成: bonus })
    }
    modulesBytes = encoder.encode(JSON.stringify(root))
}
const modulesPtr = copyIn(modulesBytes)
const session = wasm.dobcc_open_session(modulesPtr, modulesBytes.length)
wasm.dobcc_dealloc(modulesPtr, modulesBytes.length)
if (!session) {
    console.error("open_session 失败（返回 0）")
    process.exit(1)
}

/** 在已打开的会话上求值一份请求 JSON。 */
function evaluate(requestJson: string): Envelope {
    const reqBytes = encoder.encode(requestJson)
    const reqPtr = copyIn(reqBytes)
    const lenPtr = wasm.dobcc_alloc(8)
    new Uint8Array(wasm.memory.buffer).fill(0, lenPtr, lenPtr + 8)
    const outPtr = wasm.dobcc_evaluate(session, reqPtr, reqBytes.length, lenPtr)
    const outLen = new DataView(wasm.memory.buffer).getUint32(lenPtr, true)
    const outBytes = new Uint8Array(wasm.memory.buffer).slice(outPtr, outPtr + outLen)
    wasm.dobcc_dealloc(reqPtr, reqBytes.length)
    wasm.dobcc_dealloc(lenPtr, 8)
    if (outPtr) wasm.dobcc_dealloc(outPtr, outLen)
    return JSON.parse(decoder.decode(outBytes)) as Envelope
}

/** 在已打开的会话上求值一份收益请求 JSON。 */
function evaluateIncome(requestJson: string): Envelope {
    const reqBytes = encoder.encode(requestJson)
    const reqPtr = copyIn(reqBytes)
    const lenPtr = wasm.dobcc_alloc(8)
    new Uint8Array(wasm.memory.buffer).fill(0, lenPtr, lenPtr + 8)
    const outPtr = wasm.dobcc_income(session, reqPtr, reqBytes.length, lenPtr)
    const outLen = new DataView(wasm.memory.buffer).getUint32(lenPtr, true)
    const outBytes = new Uint8Array(wasm.memory.buffer).slice(outPtr, outPtr + outLen)
    wasm.dobcc_dealloc(reqPtr, reqBytes.length)
    wasm.dobcc_dealloc(lenPtr, 8)
    if (outPtr) wasm.dobcc_dealloc(outPtr, outLen)
    return JSON.parse(decoder.decode(outBytes)) as Envelope
}

function sizeText(): string {
    try {
        return ` wasm ${(statSync(wasmPath).size / 1024).toFixed(1)} KiB`
    } catch {
        return ""
    }
}

if (!elementMode && !teamMode && !incomeMode) {
    const requestJson = await readFile(resolve(requestPath))
    const envelope = evaluate(requestJson.toString())
    console.log(JSON.stringify(envelope).slice(0, 400))
    wasm.dobcc_close_session(session)

    if (!envelope.ok) {
        console.error(`smoke 失败：${envelope.error}`)
        process.exit(1)
    }

    if (expectedRaw !== undefined) {
        const expected = Number(expectedRaw)
        const actual = (envelope.result?.targetValue ?? NaN) as number
        const tolerance = Math.abs(expected) < 1e-9 ? 1e-9 : Math.max(Math.abs(expected) * 1e-6, 1e-9)
        if (!(Math.abs(actual - expected) <= tolerance)) {
            console.error(`smoke 失败：targetValue ${actual} 与期望 ${expected} 差值超容差 ${tolerance}`)
            process.exit(1)
        }
    }
    console.log(`smoke 通过${sizeText()}`)
} else if (incomeMode) {
    // U112：同一构筑（customBuff 火属性追伤 0.3 → 武器池 Σ 因子）+ 同一 BUFF，
    // TS `calcIncome` 与 wasm `dobcc_income` 逐值一致且非零。
    const BUFF = "羽翼·鼓舞·昂扬(雷)"
    const settings = normalizeCharSettings({
        ...createDefaultCharSettings(),
        charLevel: 80,
        charSkillLevel: [10, 10, 10] as never,
        hpPercent: 0.5,
        resonanceGain: 2,
        meleeWeapon: 10302,
        rangedWeapon: 10302,
        auraMod: 0,
        baseName: "普通攻击",
        enemyId: 130,
        enemyLevel: 80,
        enemyResistance: 0,
        buffs: [["自定义BUFF", 1]],
        customBuff: [["火属性追伤", 0.3]],
        targetFunction: "一段伤害",
    } as Partial<CharSettings>)
    const charId = 4101
    const build = createCharBuildFromSettings(charId, settings)
    const base = build.calculate()
    const raw = buffMap.get(BUFF)
    if (!raw) {
        console.error(`smoke 失败：找不到 BUFF ${BUFF}`)
        wasm.dobcc_close_session(session)
        process.exit(1)
    }
    const tsIncome = build.calcIncome(new LeveledBuff(raw, 10), false, base)
    const envelope = evaluateIncome(
        JSON.stringify({
            base: { charId, settings },
            items: [{ key: BUFF, kind: "buff_add", name: BUFF, level: 10 }],
        })
    )
    wasm.dobcc_close_session(session)
    if (!envelope.ok) {
        console.error(`smoke 失败：${envelope.error}`)
        process.exit(1)
    }
    const wasmBase = envelope.result?.base ?? NaN
    const wasmIncome = envelope.result?.values?.[BUFF] ?? NaN
    const close = (actual: number, expected: number) => {
        const tolerance = Math.max(Math.abs(expected), 1) * 1e-9
        return Math.abs(actual - expected) <= tolerance
    }
    const ok = close(wasmBase, base) && close(wasmIncome, tsIncome) && Math.abs(tsIncome) > 1e-6
    console.log(`${ok ? "PASS" : "FAIL"} ${BUFF}\tbase wasm ${wasmBase} / TS ${base}\tincome wasm ${wasmIncome} / TS ${tsIncome}`)
    if (!ok) {
        console.error("smoke 失败：收益与 TS 不一致（或为 0）")
        process.exit(1)
    }
    console.log(`smoke 通过：收益 parity${sizeText()}`)
} else if (teamMode) {
    // U89d2：协战命名空间端到端。锚点为 TS `normalizeCharSettings` 后实跑值
    // （`.tmp/u89d2-baseline.ts`：扶疏面板 技能威力 = 2.1）。
    const modules = JSON.parse(decoder.decode(modulesBytes)) as {
        "char.data": { id: number; 名称: string; 技能?: { 名称?: string }[] }[]
    }
    const chars = modules["char.data"]
    const main = chars.find(char => char.名称 === "黎瑟")
    const assist = chars.find(char => char.名称 === "扶疏")
    if (!main || !assist) {
        console.error("smoke 失败：modules.json 缺少 黎瑟 / 扶疏")
        wasm.dobcc_close_session(session)
        process.exit(1)
    }
    const baseSettings = {
        baseName: main.技能?.[1]?.名称 ?? "",
        charSkillLevel: [10, 10, 10],
        meleeWeapon: 10302,
        rangedWeapon: 20601,
        team1: assist.id,
        team1Weapon: 10302,
        assist1: {
            charLevel: 80,
            charSkillLevel: [10, 10, 10],
            baseName: assist.技能?.[0]?.名称 ?? "",
            charMods: [[41001, 10]],
            buffs: [["菲娜4溯", 10]],
        },
    }
    const cases: {
        label: string
        settings: Record<string, unknown>
        target: string
        expected: number
        errorContains?: string
    }[] = [
        { label: "扶疏::技能威力", settings: baseSettings, target: "扶疏::技能威力", expected: 2.1 },
        { label: "协战1::技能威力", settings: baseSettings, target: "协战1::技能威力", expected: 2.1 },
        { label: "扶疏::[攻击]", settings: baseSettings, target: "扶疏::[攻击]", expected: 0 },
        { label: "扶疏::DOT伤害", settings: baseSettings, target: "扶疏::DOT伤害", expected: 0 },
        {
            label: "扶疏::min(1) 团队函数",
            settings: baseSettings,
            target: "扶疏::min(1)",
            expected: 0,
            errorContains: "团队命名空间不支持函数",
        },
        {
            label: "未配置角色名",
            settings: baseSettings,
            target: "不存在的角色::技能威力",
            expected: 0,
            errorContains: "无效命名空间",
        },
        { label: "协战2::技能威力", settings: baseSettings, target: "协战2::技能威力", expected: 0 },
        {
            label: "数字字符串 team1 按未配置",
            settings: { ...baseSettings, team1: String(assist.id), team1Weapon: "10302" },
            target: "扶疏::技能威力",
            expected: 0,
            errorContains: "无效命名空间",
        },
        {
            label: "分数 team1/team1Weapon 取整",
            settings: { ...baseSettings, team1: assist.id + 0.4, team1Weapon: 10302.4 },
            target: "扶疏::技能威力",
            expected: 2.1,
        },
        {
            label: "停用协战仍可查询",
            settings: { ...baseSettings, assist1: { ...baseSettings.assist1, enabled: false } },
            target: "扶疏::技能威力",
            expected: 2.1,
        },
        {
            label: "协战缺武器查询为 0",
            settings: { ...baseSettings, team1Weapon: "-" },
            target: "扶疏::技能威力",
            expected: 0,
        },
    ]
    let failed = 0
    for (const item of cases) {
        const envelope = evaluate(JSON.stringify({ charId: main.id, settings: { ...item.settings, targetFunction: item.target } }))
        if (!envelope.ok) {
            console.error(`FAIL ${item.label}：${envelope.error}`)
            failed++
            continue
        }
        const actual = envelope.result?.targetValue ?? NaN
        const errorText = envelope.result?.error ?? ""
        const tolerance = Math.max(Math.abs(item.expected), 1) * 1e-9
        const delta = actual - item.expected
        const errorOk = item.errorContains ? errorText.includes(item.errorContains) : errorText.length === 0
        const ok = Math.abs(delta) <= tolerance && errorOk
        console.log(`${ok ? "PASS" : "FAIL"} ${item.label}\twasm ${actual}\tTS ${item.expected}\tdelta ${delta}\terror ${errorText || "-"}`)
        if (!ok) failed++
    }
    wasm.dobcc_close_session(session)
    if (failed > 0) {
        console.error(`smoke 失败：${failed}/${cases.length} 项超差`)
        process.exit(1)
    }
    console.log(`smoke 通过：协战 ${cases.length}/${cases.length}${sizeText()}`)
} else {
    // U61：六元素 `*属性增伤` 逐元素 parity。settings 基座 = `dobapp_OkdnBN3OlC` 夹具，
    // 仅替换 charId / customBuff / targetFunction；锚点为 TS 实跑值（`.tmp/u61-anchors.ts`）。
    // U112 追伤分池后，元素限定键不再作用于追伤（整段 Σ 因子），错配键目标值 = 基线。
    const fixturePath = resolve(root, "crates/dob-calc-core/tests/fixtures/dobapp_OkdnBN3OlC.json")
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as {
        request: { settings: Record<string, unknown> }
    }
    const ELEMENTS: [string, number][] = [
        ["火", 3101],
        ["水", 2101],
        ["雷", 4101],
        ["风", 5101],
        ["光", 1504],
        ["暗", 1101],
    ]
    const TS_REMOTE_BASE = [
        394196.71130158554, 488584.44065064553, 378470.38952747936, 246555.45037374197, 826821.31751830759, 347005.55285091547,
    ]
    const TS_REMOTE_HIT = [
        460635.00423439825, 571111.73219960171, 442212.74158473086, 287346.06354837451, 967286.52125468198, 405353.93290647032,
    ]
    // 相邻元素键（U112：追伤整段只进 Σ 因子，错配键不影响目标 → 等于基线）
    const TS_REMOTE_MISS = TS_REMOTE_BASE
    const TS_REMOTE_LEGACY = 967286.52125468198
    const TS_REMOTE_STACK = 1060929.9904122648
    const TS_REMOTE_MULTI = 967286.52125468198
    const TS_REMOTE_AST_MISS = 826821.31751830759
    const TS_DAMAGE_BASE = 253470358.58469152
    const TS_DAMAGE_HIT = 278120613.8931094
    const TS_DAMAGE_STACK = 294554117.4320547
    const TS_DOT_BASE = 26046437.57793317

    function request(
        charId: number,
        customBuff: [string, number][],
        target: string,
        extra = 0,
        dot?: Record<string, number>,
        modId?: number
    ): string {
        const settings = structuredClone(fixture.request.settings) as Record<string, unknown>
        settings.customBuff = customBuff
        settings.targetFunction = target
        if (dot) settings.dotSettings = dot
        // U62：只保留一个合成角色槽 MOD（元素系列），原夹具 MOD 槽整体替换
        if (modId !== undefined) settings.charMods = [[modId, 10]]
        const buffs = settings.buffs as [string, number][]
        if (!buffs.some(item => item[0] === "自定义BUFF")) buffs.push(["自定义BUFF", 1])
        for (let index = 0; index < extra; index++) buffs.push(["自定义BUFF", 1])
        return JSON.stringify({ charId, settings })
    }

    const DOT = { skill: 0, melee: 1, ranged: 0, skillweapon: 0 }
    const scenarios: {
        label: string
        request: string
        expected: number
        attrs?: [string, number][]
        absent?: string[]
    }[] = []

    for (let index = 0; index < ELEMENTS.length; index++) {
        const [element, charId] = ELEMENTS[index]
        const other = ELEMENTS[(index + 1) % ELEMENTS.length][0]
        scenarios.push(
            { label: `${element} 基线(${charId})`, request: request(charId, [], "[远程]"), expected: TS_REMOTE_BASE[index] },
            {
                label: `${element} +${element}属性增伤0.3`,
                request: request(charId, [[`${element}属性增伤`, 0.3]], "[远程]"),
                expected: TS_REMOTE_HIT[index],
            },
            {
                label: `${element} +${other}属性增伤0.3(相邻元素)`,
                request: request(charId, [[`${other}属性增伤`, 0.3]], "[远程]"),
                expected: TS_REMOTE_MISS[index],
            }
        )
    }
    scenarios.push(
        { label: "旧路径 元素增伤0.3", request: request(1504, [["元素增伤", 0.3]], "[远程]"), expected: TS_REMOTE_LEGACY },
        {
            label: "叠加 元素增伤0.2+光属性增伤0.3",
            request: request(
                1504,
                [
                    ["元素增伤", 0.2],
                    ["光属性增伤", 0.3],
                ],
                "[远程]"
            ),
            expected: TS_REMOTE_STACK,
        },
        { label: "多来源 光属性增伤0.15×2", request: request(1504, [["光属性增伤", 0.15]], "[远程]", 1), expected: TS_REMOTE_MULTI },
        { label: "技能池 基线", request: request(1504, [], "伤害"), expected: TS_DAMAGE_BASE },
        { label: "技能池 +光属性增伤0.3", request: request(1504, [["光属性增伤", 0.3]], "伤害"), expected: TS_DAMAGE_HIT },
        { label: "技能池 +火属性增伤0.3(不匹配)", request: request(1504, [["火属性增伤", 0.3]], "伤害"), expected: TS_DAMAGE_BASE },
        {
            label: "技能池 叠加",
            request: request(
                1504,
                [
                    ["元素增伤", 0.2],
                    ["光属性增伤", 0.3],
                ],
                "伤害"
            ),
            expected: TS_DAMAGE_STACK,
        },
        // U112：追伤只进 Σ 因子，元素键不再作用于追伤；错配键 = 基线
        { label: "AST [远程]{光属性增伤:0.3}", request: request(1504, [], "[远程]{光属性增伤:0.3}"), expected: TS_REMOTE_MULTI },
        {
            label: "AST [远程]{火属性增伤:0.3}(相邻元素)",
            request: request(1504, [], "[远程]{火属性增伤:0.3}"),
            expected: TS_REMOTE_AST_MISS,
        },
        {
            label: "AST [远程]{元素增伤:0.2,光属性增伤:0.3}",
            request: request(1504, [], "[远程]{元素增伤:0.2,光属性增伤:0.3}"),
            expected: TS_REMOTE_STACK,
        },
        { label: "DOT 基线", request: request(1504, [], "melee::DOT伤害", 0, DOT), expected: TS_DOT_BASE },
        { label: "DOT +光属性增伤0.3", request: request(1504, [["光属性增伤", 0.3]], "melee::DOT伤害", 0, DOT), expected: TS_DOT_BASE }
    )

    // U62：元素限定键不得并入通用 `元素增伤`（MOD属性加权只落同名键）。
    // 目标值无法区分新旧口径（池总和相同），因此这些场景同时断言 attributes。
    const U62_MOD_ATTR_A: [string, number][] = [["雷MOD属性", 0.5]]
    const U62_MOD_ATTR_B: [string, number][] = [["光MOD属性", 0.5]]
    scenarios.push(
        {
            label: "U62-A 基线(MOD空)",
            request: request(4101, U62_MOD_ATTR_A, "[远程]", 0, undefined, 990001),
            expected: 125130.09040148987,
        },
        {
            label: "U62-A MOD雷属性增伤0.3",
            request: request(4101, U62_MOD_ATTR_A, "[远程]", 0, undefined, 990002),
            expected: 156247.80897416227,
            attrs: [
                ["元素增伤", 0],
                ["雷属性增伤", 0.44999999999999996],
            ],
        },
        {
            label: "U62-A MOD火属性增伤0.3(相邻元素)",
            request: request(4101, U62_MOD_ATTR_A, "[远程]", 0, undefined, 990003),
            expected: 125130.09040148987,
            attrs: [
                ["元素增伤", 0],
                ["火属性增伤", 0.44999999999999996],
            ],
        },
        {
            label: "U62-A 叠加 MOD元素0.2+雷0.3",
            request: request(4101, U62_MOD_ATTR_A, "[远程]", 0, undefined, 990004),
            expected: 176992.95468927716,
            attrs: [
                ["元素增伤", 0.30000000000000004],
                ["雷属性增伤", 0.44999999999999996],
            ],
        },
        {
            label: "U62-A MOD仅元素增伤0.2(旧路径)",
            request: request(4101, U62_MOD_ATTR_A, "[远程]", 0, undefined, 990005),
            expected: 145875.23611660476,
            attrs: [
                ["元素增伤", 0.30000000000000004],
                ["雷属性增伤", 0],
            ],
        },
        {
            label: "U62-A BUFF元素0.2+雷0.3(不加权)",
            request: request(
                4101,
                [
                    ["雷MOD属性", 0.5],
                    ["元素增伤", 0.2],
                    ["雷属性增伤", 0.3],
                ],
                "[远程]",
                0,
                undefined,
                990001
            ),
            expected: 159705.33326001471,
            attrs: [
                ["元素增伤", 0.2],
                ["雷属性增伤", 0.3],
            ],
        },
        {
            label: "U62-A DOT 基线",
            request: request(4101, U62_MOD_ATTR_A, "melee::DOT伤害", 0, DOT, 990001),
            expected: 8359132.467952507,
        },
        {
            label: "U62-A DOT +MOD雷",
            request: request(4101, U62_MOD_ATTR_A, "melee::DOT伤害", 0, DOT, 990002),
            expected: 8359132.467952507,
        },
        { label: "U62-B 基线(MOD空)", request: request(1504, U62_MOD_ATTR_B, "伤害", 0, undefined, 990001), expected: 26661135.540486883 },
        {
            label: "U62-B MOD光属性增伤0.3",
            request: request(1504, U62_MOD_ATTR_B, "伤害", 0, undefined, 990006),
            expected: 31167727.483459506,
            attrs: [
                ["元素增伤", 0],
                ["光属性增伤", 0.47159999999999996],
            ],
        },
        {
            label: "U62-B MOD雷属性增伤0.3(不匹配)",
            request: request(1504, U62_MOD_ATTR_B, "伤害", 0, undefined, 990002),
            expected: 26661135.540486883,
            attrs: [
                ["元素增伤", 0],
                ["雷属性增伤", 0.47159999999999996],
            ],
        },
        {
            label: "U62-B 叠加 MOD元素0.2+光0.3",
            request: request(1504, U62_MOD_ATTR_B, "伤害", 0, undefined, 990007),
            expected: 34172122.11210791,
            attrs: [
                ["元素增伤", 0.3144],
                ["光属性增伤", 0.47159999999999996],
            ],
        },
        {
            label: "U62-B MOD仅元素增伤0.2(旧路径)",
            request: request(1504, U62_MOD_ATTR_B, "伤害", 0, undefined, 990005),
            expected: 29665530.169135295,
            attrs: [
                ["元素增伤", 0.3144],
                ["雷属性增伤", 0],
            ],
        }
    )

    // U112：追伤分池——角色属性不持有追伤；武器池吃面板 Σ 因子，技能池只吃 `技能追伤`。
    // 锚点同 `tests/parity_additional_damage.rs`（`.tmp/u112-anchors.ts`）。
    const CHASE_KEYS = ["火属性追伤", "水属性追伤", "雷属性追伤", "风属性追伤", "光属性追伤", "暗属性追伤", "自属性追伤", "追加伤害"]
    const chaseRequest = (customBuff: [string, number][], target: string, baseName = "普通攻击") =>
        JSON.stringify({
            charId: 4101,
            settings: {
                charLevel: 80,
                charSkillLevel: [10, 10, 10],
                hpPercent: 0.5,
                resonanceGain: 2,
                meleeWeapon: 10302,
                rangedWeapon: 10302,
                auraMod: 0,
                baseName,
                enemyId: 130,
                enemyLevel: 80,
                enemyResistance: 0,
                buffs: [["自定义BUFF", 1]],
                customBuff,
                targetFunction: target,
            },
        })
    scenarios.push(
        { label: "U112 追伤武器池 基线", request: chaseRequest([], "一段伤害"), expected: 1417.640818604651, absent: CHASE_KEYS },
        {
            label: "U112 面板火追伤0.5",
            request: chaseRequest([["火属性追伤", 0.5]], "一段伤害"),
            expected: 2126.4612279069765,
            absent: CHASE_KEYS,
        },
        {
            label: "U112 六元素+自属性0.7",
            request: chaseRequest(
                [
                    ["火属性追伤", 0.1],
                    ["水属性追伤", 0.1],
                    ["雷属性追伤", 0.1],
                    ["风属性追伤", 0.1],
                    ["光属性追伤", 0.1],
                    ["暗属性追伤", 0.1],
                    ["自属性追伤", 0.1],
                ],
                "一段伤害"
            ),
            expected: 2409.9893916279066,
        },
        {
            label: "U112 火追伤-2 钳 0",
            request: chaseRequest([["火属性追伤", -2]], "一段伤害"),
            expected: 0,
        },
        {
            label: "U112 火追伤0.5+火弱点0.54（弱点不放大追伤）",
            request: chaseRequest(
                [
                    ["火属性追伤", 0.5],
                    ["火属性弱点", 0.54],
                ],
                "一段伤害"
            ),
            expected: 2126.4612279069765,
        },
        {
            label: "U112 技能池 技能追伤0.5",
            request: chaseRequest([["技能追伤", 0.5]], "伤害", "涡旋电场"),
            expected: 12643.430232558141,
        },
        {
            label: "U112 技能池 武器追伤0.5（不交叉）",
            request: chaseRequest([["火属性追伤", 0.5]], "伤害", "涡旋电场"),
            expected: 8428.953488372093,
        }
    )

    let failed = 0
    for (const scenario of scenarios) {
        const envelope = evaluate(scenario.request)
        if (!envelope.ok) {
            console.error(`FAIL ${scenario.label}：${envelope.error}`)
            failed++
            continue
        }
        const actual = (envelope.result?.targetValue ?? NaN) as number
        const tolerance = Math.max(Math.abs(scenario.expected), 1) * 1e-9
        const delta = actual - scenario.expected
        let ok = Math.abs(delta) <= tolerance
        let attrText = ""
        for (const [key, expected] of scenario.attrs ?? []) {
            const value = envelope.result?.attributes?.[key] ?? NaN
            const attrTolerance = Math.max(Math.abs(expected), 1) * 1e-9
            const attrDelta = value - expected
            attrText += `\t${key} ${value}(期望 ${expected}, delta ${attrDelta})`
            if (!(Math.abs(attrDelta) <= attrTolerance)) ok = false
        }
        for (const key of scenario.absent ?? []) {
            if (envelope.result?.attributes?.[key] !== undefined) {
                attrText += `\t${key} 不应出现在角色属性`
                ok = false
            }
        }
        console.log(`${ok ? "PASS" : "FAIL"} ${scenario.label}\twasm ${actual}\tTS ${scenario.expected}\tdelta ${delta}${attrText}`)
        if (!ok) failed++
    }
    wasm.dobcc_close_session(session)
    if (failed > 0) {
        console.error(`smoke 失败：${failed}/${scenarios.length} 项超差`)
        process.exit(1)
    }
    console.log(`smoke 通过：逐元素 ${scenarios.length}/${scenarios.length}${sizeText()}`)
}
