---
name: build-creator
description: 给 dna-builder 里任意角色从零推一套「最优构筑」（BD）的通用方法论：读角色机制 → 辅助候选排列组合 → buff 组（含光环型海妖 / 角色专属如大冲击）→ 定计算方向 → 魔灵与潜质 → 必带 MOD → 用 autoBuild 跑一遍并剔除不合理件 → 消融实验。当需要「给某个角色配一套最优 BD」「这个角色带什么辅助/队友最强」「跑一下 XX 的最优构筑」「算这个构筑的各来源贡献」「做消融」时使用。含可直接改用的 ts 脚本骨架（example/），脚本内不含任何角色特定内容。
agent_created: true
---

# 通用最优构筑方法论

## Overview

一套 **8 步流程** + 一个可复用的脚本骨架 `example/`。脚本里**没有一个角色名** —— 所有角色相关的
东西都写在 spec（JSON）里，换角色只改 spec。

产物：一份可直接导入构筑页的 `charSettings` JSON（落 `outputs/`）+ 一张「各来源贡献 / 消融」表。

**开工前必读**本页的「内核口径」「MOD 合法性」「陷阱」三节，绝大多数返工都错在这三处。
角色机制数值口径先查 `.workbuddy/memory/topics/falu-mechanics.md`（灾厄武器 / 掉血 / 羽化 / 紊乱），
线上真实构筑复现查 `.workbuddy/skills/charbuild-dps-ablation`。

### 铁律

- 包管理与脚本一律 `bun`（`pnpm` 在本机 sandbox 下 corepack 是坏的）。
- 临时脚本、中间产物放 `.tmp/`；最终 BD 放 `outputs/`。
- **不要自己起 dev server / build**；需要看界面固定访问 `http://localhost:1420`。
- **代码不写注释**（本项目约定，AGENTS.md 那条「必须写注释」对本人发起的改动不适用）。
- 不要用 git 做实验（add/stash/commit/reset 一律别碰）。
- 数值结论必须有出处：要么是数据包里的字段，要么是线上真实构筑，**不许模型推测**。

## 8 步流程

| 步 | 做什么 | 脚本 |
|---|---|---|
| 1 | **完整阅读角色技能机制**：技能表 / 溯源 / 被动 / 专武 / 特质，以及所有能进 `customVariables` 的命名空间 | `step1-mechanics.ts` |
| 2 | **拉线上高人气/推荐构筑**拿先验与复现基线，据此**选辅助**；候选 >1 就**排列组合** | `step2-team.ts` |
| 3 | 给每个辅助**配 buff 组**（含它自己能吃的**光环型「海妖」**、角色专属如**大冲击**） | `step2-team.ts` |
| 4 | **决定构筑计算方向**：`targetFunction` + `customVariables` 表达式骨架 | `step4-mods.ts` / spec |
| 5 | **加魔灵和潜质** | `step3-pet.ts` |
| 6 | **加必带 MOD** | spec `required` |
| 7 | 用 **`autoBuild({includeTypes, preserveTypes})`** 跑一遍，**剔除不合理的部分** | `step5-autobuild.ts` |
| 8 | **消融实验**，选出最合适的辅助（buff 组） | `step6-ablation.ts` |

步骤 4/5/6 的顺序在本方法论里是「先把不变量钉死，再让搜索填空」：表达式和必带件定死，
魔灵/潜质是离散小枚举，最后才把 MOD 池交给 `autoBuild` + 自写爬山。

### 第 1 步：完整阅读角色机制

必须看清的几处（`step1-mechanics.ts` 会一次性 dump）：

- `charMap.get(id)`：`属性` / `精通` / `额外精通` / `加成` / `专武`
  （⚠️ **`专武` 字段是存在的**，值就是武器 id；社区俗称的「专武」未必等于它）。
- `char.技能[]`：每个技能的 `类型`（伤害 / 增益 / 被动 / 协战）与 `字段[]`。
  注意字段里的 **`tag`** —— tag 决定它进不进结算链路（`["近战","武器","普攻"]` 这类会；**没有 tag 的
  是「说明性字段」，`calculateTargetFunction` 不会替你算**，比如「受到来自某角色的伤害提高 62%」
  必须自己在表达式里乘进去）。
- `char.溯源[]`：6 条，逐条判断「能不能靠操作维持」（能维持就当常驻，否则按覆盖率折算或直接放弃）。
- 武器：`类型`（`[伤害类型组, 类别]`）、`伤害类型`、`加成`、`熔炼`（精炼 1~5 的文本 + 数值上下限）、
  `技能[]` 的字段与 tag。
- 找出**所有可用的表达式命名空间**：`角色::` / `近战::` / `远程::` / `技能名::字段名` / `武器名::字段名`，
  以及 `!` 取值后缀（取面板值）、`{属性:值}` 临时属性注入、`min/max/ceil/floor`。

### 第 2 步：参考线上高人气或推荐构筑

这一步给第 3~6 步准备**有出处的先验**（铁律：数值结论要么出自数据包、要么出自线上构筑），并定一份
**复现基线** —— 之后每一步的改动都跟它比。查询定义见 [api-queries.ts](src/api/gen/api-queries.ts)
的 `buildsQuery` / `buildQuery`，排序逻辑在 `server/src/db/mod/build.ts`。

- 端点 `https://api.dna-builder.cn/graphql`（`src/env.ts` 的 `apiEndpoint`），公开查询、无需登录；
  **脚本里直接 `fetch`，别 import `src/api/client.ts`**（那是 urql + Vue 的浏览器链路）。
- ⚠️ 列表查询**不含 `charSettings`**，要按 id 逐份再查详情；`sortBy` 只认 `likes` / `views`，
  其余值（含 `createdAt`）一律落回 `updateAt` 倒序；`buildsCount(charId)` 对总数（`list` 会报告 N/M）；
  另有 `recommendedBuilds` / `trendingBuilds` 可直接拿推荐与热门。
- 挑选口径：`isRecommended` / `isPinned` 优先（推荐通常就是标准答案）→ 再按 likes / views；
  时间一律看 `updateAt`（作者最后一次修改），看 `createdAt` 会把老构筑当新货；
  `desc` 带「AI 驱动生成」的单独标注，别当人肉实测引用；
  站内直链 `https://dna-builder.cn/char/<charId>/<build.id>` 可点开对照。
- 拉取分两段（上游口径：列表只给元数据，BD JSON（`charSettings`）只有单拉 `build(id)` 才有）——
  **大多数情况只跑 `list`，挑中几份再 `download`，不要一上来全量拉**：

```bash
bun .agents/skills/build-creator/scripts/fetch-online-builds.ts list <charId>           # 元数据列表（含 id），落 .tmp/online-builds/list-<charId>.json
bun .agents/skills/build-creator/scripts/fetch-online-builds.ts download <id> [id...]  # 单拉配装，charSettings 落 .tmp/online-builds/<id>.json
```

每份拿到 `charSettings`（JSON 字符串，先 `JSON.parse`）后按下述去向拆：

1. **复现基线**：先 filter 掉数据包已删的 buff（陷阱 18），老构筑引用已下架 MOD / 武器的单独跳过 →
   `normalizeCharSettings` → `createCharBuildFromSettings(charId, …).calculate()`，跟 `desc` 里作者
   手写的 DPS 对账，**偏差 >0.1% 说明 charSettings 没吃干净，先修再往下走**。作者的 DPS 都带环境口径
   （防 / 抗 / 血线 / 属克…），**连口径一起记录**；`dpsList` 公开查询返回空，DPS 数字只在 `desc` 里。
2. **`buffs` → 第 3 步的辅助候选**：按命名前缀归队友（`XXQ` / `XXE` / `XX被动` / `XX<N>溯` / `XX助战`），
   归属不明回 `buff.data.ts` 查该条目 `id` 是否等于某角色 id；多份构筑重复出现的辅助组合就是
   spec `assist` 轴 options 的首选。
3. **MOD 槽 → 第 6 步 `required` 候选 + 第 7 步搜索种子**：多份构筑都带的件大概率是机制必带；
   ⚠️ `charSettings.modVariants` 是同一批槽位的多套配置（变体键 `角色`/`近战`/`远程`/`同律` + `中枢`），
   统计「几份带了它」必须按构筑去重，逐槽累加会得出超总数的份数。
4. **`customVariables` / `targetFunction` → 第 4 步的表达式参考**：作者手写的估算式，抄结构不抄数值
   （换个角色 / 属性 / 武器就失效）。
5. 清洗后的最优线上 `charSettings` 可整体填进 `spec.base` 当起点，第 7 步爬山拿它当种子。

### 第 3 步：辅助排列组合 + buff 组

spec 里把辅助拆成若干「轴」（`assist: [{axis, options}]`），每轴选一个 option，取**笛卡尔积**。
每个 option 的 `buffs` 是 `[["buff名", 等级], ...]`。

配 buff 组时的三个易漏点：

1. **光环型 MOD（`海妖` / `百首` 这类，效果描述里含「自身及队友」）**：队友能带，写进 `buffs`
   列表就等于「假设队友携带」⇒ 主 C 直接吃这份收益。
   ⚠️ **但同一个光环不能两头算**：`buffMap` 里形如 `X(属性)` 的 BUFF（如 `羽翼·鼓舞·背水(风)`）
   **就是同名 MOD 的 `生效` 自动产生的那个 BUFF**；你把它写进 `buffs` 之后，主 C 自己
   **再装同名 MOD 就会被算成两份**（实测 `背水` 从 1.182 被算成 1.402）。
   ⇒ 用 `光环自装排除()` 从候选池剔掉这些 MOD（判据见「陷阱清单」第 10 条）。
   `海妖` 自身是 `exclusiveSeries` 成员 ⇒ 一个槽位只能带一件，别在一个 buff 组里塞两件海妖。
2. **角色专属 buff**（如某些角色 id 限定的「大冲击」）只能由该角色的助战提供，写成 buff 名 + 等级。
3. **队友自己的武器/精炼也会生成 buff**（`buff.data.ts` 里形如「XX助战」「XXE」「XX被动+1溯」），
   等级要填对版本（`charSkillLevel` 一致）。

枚举完把每个组合的 DPS 打出来排序 —— 这是「选辅助」唯一靠谱的依据，不要凭印象。

### 第 4 步：定计算方向

`targetFunction` 指向一个 `customVariables` 里的名字（也可以直接指向技能字段）。
表达式写法（**先抄 `outputs/法露茜BD-一轮连招一枪.json` 的 `customVariables` 当范式**）：

- 先写「一次循环」：段数 × 单段用时 / 攻速 → `循环用时`，再写单循环总伤害 → 除回去得 DPS。
- **加乘法分开**：加法项直接 `a+b`，乘法项写成 `(1+加成)`，别把乘法摊进加和表。
- **独立乘区要单独乘**：充盈、血量区（昂扬 × 背水）不是 `增伤` 池的一部分；但**「敌人受到伤害提高」是增伤加算池**（见陷阱 5），别当独立乘区写。
- **不要照抄别的角色的表达式**：同一条式子换个属性/武器就失效（火属性角色的 dot 式子给风属性角色用恒为 0）。
- 表达式是**逐条命名**的中间量，多写几条方便消融（消融就是删一条/改一个常数再算一次）。

### 第 5 步：魔灵与潜质

- `getPetBuffData(petId)` → `{ passive, active }`；主动 buff 按 `petCoverage`（`petAutoCoverage`）折算。
- `getPetTraits()` → 潜质目录（`{id, bid, name, r, level, buffName, petSkillLevelBonus}`）。
  **槽位存 `[bid, 等级]`（不是 `id`！）**，4 个槽、槽间不重复、等级 1~3。
  `buffName` 非空的是战斗潜质（能进属性结算），空的是功能潜质（钓鱼之类），别当收益算进去。
- 取法：在候选池里做贪心（每次加/换成边际收益最大的那一条），别手挑。

### 第 6 步：必带 MOD

写进 spec 的 `required`：`{ charMods: [id...], meleeMods: [...], rangedMods: [...] }`。
这些是**机制必带**（如灾厄流的转化件、缺了整套式子就不成立的核心件）。

还有一类也要放进来：**「钥匙型 MOD」** —— 它自己的伤害贡献很小，但提供的属性（`技能效益` /
`神智` 等）是**另一条收益的开启条件**，或者支撑高耗蓝循环。搜索器只会看到那点小伤害，
一定会把它换掉。判断方法：单件消融时 DPS 变化平平，但拿掉后**别处的收益也跟着塌**。
第 7 步要带着它们跑搜索，做法见下。

### 第 7 步：`autoBuild` + 剔除不合理

```ts
const res = build.autoBuild({
    includeTypes: ["charMods", "meleeMods", "rangedMods"],
    preserveTypes: ["charMods", "meleeMods", "rangedMods"], // ← 让「必带 MOD」当种子留下
    fixedMelee: true,
    fixedRanged: true,
    modOptions: modData.filter(...).map(m => LeveledModHelper.withCount(m, undefined, 0, 8)),
})
const nb = res.newBuild
```

- `includeTypes` = 这次要（重）构筑的槽位；不在里面的槽位原样不动。
- `preserveTypes` 里的槽位**保留当前已装备的 MOD 当起点**；不在里面的会被**清空**。
  ⇒ 想「带着必带件填空」：先把必带件放进 build 的槽位，再把该槽位同时列进 `includeTypes` 和 `preserveTypes`。
- `modOptions` 的 `count` 是**你实际持有的数量**（`LeveledModHelper.withCount(mod, undefined, 0, n)`）。
  填 8 等于假设「拥有 8 件」—— 只有 `契约者` 这类可叠件才需要调这个数，其余填 1~3 更贴近真实。
- ⚠️ **`autoBuild` 自己不做耐受上限校验**，它只保证「8 格填满 + 名称/系列互斥 + 属性/限定过滤」。
  所以 `autoBuild` 的输出**必须**再复核一遍：

```ts
for (const [key, tab] of [["charMods","角色"],["meleeMods","近战"],["rangedMods","远程"]]) {
    const cost = (nb as any).getModCostMax(tab)
    const cap  = (nb as any).getModCap(tab)
    if (cost > cap) { /* 剔除/替换最贵的非必带件，然后重跑 */ }
}
```

- `autoBuild` 是**单轮贪心**，容易被局部最优卡住。补一个自写的「爬山 + 扰动重启（ILS）」搜索，
  起点取：线上真实构筑 / `autoBuild` 结果 / 上一轮结果 / 若干随机种子，最后取最优（见 `lib.ts` 的 `optimize`）。
- 剔除「不合理」的四类：
  1. **耐受超载**（`getModCostMax > getModCap`）
  2. **属性/限定违规**（自查一遍，别信搜索器）
  3. **条件 MOD 不生效**（`build.checkModEffective(mod).isEffective === false`，白占一格）
  4. **机制冲突**（例如把「需要掉血」的件和「锁血/免伤」的件同时带上）

### 第 8 步：消融实验

对每一个「来源」删掉再算一次，按 DPS 落差排序。来源至少要覆盖三类：

- **辅助**（逐个队友 / 逐个 buff）—— 这是这一步的主目的：确认哪套 buff 组真的更强。
- **必带 MOD** 与 **单件 MOD**（逐件撤，看边际收益）。
- **机制项**（掉血、回血、易伤乘区、溯源覆盖率、手法段数）。

输出表：`来源 | 撤掉后 DPS | 落差 %`。**落差 ≈ 0 的项就是冗余项**，从 BD 里删掉。

---

## 内核口径（写脚本前必读）

| 事项 | 口径 |
|---|---|
| 造 build | `createCharBuildFromSettings(charId, normalizeCharSettings(settings))` |
| 求总 | `build.calculate()`（内部走 `settings.targetFunction`） |
| 求单项 | `build.calculateTargetFunction(undefined, "变量名")` |
| 面板 | `build.calculateWeaponAttributes()`（`充盈威力 / 生命 / 攻击 / 背水 / 增伤 / 属性穿透`…） |
| 属性表 | `getBonusSourceTable()` **查表不是遍历**；查 `O(scope)` |
| 失效 | 每个类有 `static propertiesRevision`；**新增任何「改属性」入口必须 `++propertiesRevision`**，漏了会静默返回旧表 |
| 乘法 | 不能从加和表导出（`Π(1+v) ≠ Σv`）⇒ 走 `getScopedModsMulBonus` / `getBuffsMulBonus` |
| 耐受 | `build.getModCap(tab)`（`角色 = 20 + 中枢.最大耐受 + charLevel`；武器 `= 20 + weaponLevel`）、`build.getModCostMax(tab)`（按极性方案实算，含异极性 ×1.5 惩罚） |
| 攻击力 | `基础攻击 × (1 + 攻击加成池 + 和鸣增益) × (1 + 属性攻击) + 固定攻击` |
| 和鸣增益 | `charSettings.resonanceGain`，档位只有 `0/0.5/1/1.5/2/2.5/3`（满值 3），**不是「溯源」** |
| 充盈威力 | 角色属性 = Σ 角色 MOD 词条 + Σ 各武器 `max(0, 触发率 − 100%) × 充盈转化`；`触发率 = 基础触发 × (1 + 加成池)` **允许溢出**，加成池**不含武器自身 `加成.触发`**；入口 `getWeaponFullness` / `getFullnessWeaponSources` |
| 自定义 BUFF | `buffs` 里放 `["自定义BUFF", 1]` + `customBuff: [[属性, 值]]`；`customBuff` 是**加进属性池**的。⚠️ 见第 4 条：**目标是把 `customBuff` 清空**，有出处的效果一律写 `buffs` 条目（缺定义就补数据包）；⚠️ **「敌人受到伤害提高」是增伤加算池、不是独立乘区**，写 buff 的 `增伤` 字段（见第 5 条） |
| 血量区 | `背水乘区 = 1 + 4 × 背水 × (1 − hp) × (1.5 − hp)`，**hp 钳制在 0.25~1** ⇒ `hpPercent ≤ 0.25` 收益相同 |
| 潜质槽 | 存 `[bid, 等级]`，4 槽，等级 1~3 |
| 手法 | `settings.actions` / `timelineDPS` 只影响时间轴视图；表达式法自己写用时变量 |

## MOD 合法性（最容易错的一节）

判定顺序照抄前端 `ModEditer.vue` + `CharBuild.autoBuild.getModCandidates`，**四处都要**：

1. **中枢专属系列**：`羽蛇` **就是中枢系列**（前端中枢选择器 = `modOptions.filter(o => o.ser === "羽蛇")`）。
   普通槽位（角色/近战/远程/同律）的候选池要把 `系列 === "羽蛇"` 全部滤掉，中枢槽反过来只收它。
   共 35 件：11 件无属性（通用）+ 7 个属性各 4 件。**中枢同样受属性限制** —— 给风角色装 `背水(火)`
   完全无效（实测 59.693 → 51.823 亿，等于没装）。所以「风角色可用的中枢」只有 15 件。
   中枢的 `最大耐受` 有 **17 / 30 / 55** 三档，直接决定角色槽耐受上限（`20 + 最大耐受 + 等级`）。
2. **属性**：`!m.属性 || m.属性 === char.属性`。
3. **限定**：
   - 角色槽：`typeof 限定 === "number"` → `=== char.id`；`string` → `[char.名称, char.属性].includes(限定)`
   - 近战/远程槽：`typeof 限定 === "string" && [weapon.伤害类型, weapon.类别].includes(限定)`
   - ⚠️ **`weapon.类别` 不是原始数据字段**。`LeveledWeapon` 里 `类别 = weaponData.类型[1]`
     （双刀 / 单手剑 / 太刀 / 重剑 / 长柄 / 鞭刃）。直接读 `weaponMap` 只会拿到 `undefined`
     ⇒ **会漏掉整整一类「武器类别限定」MOD**。
4. **名称互斥**：同一槽位内「名称」唯一；**`契约者` 系列豁免**（可叠 N 件）。
5. **系列互斥**：`CharBuild.exclusiveSeries = ["百首","狮鹫","中庭蛇","囚狼1","换生灵","海妖","审判者","巨鲸","金乌","焰灵","黄衣","夜使"]`。
   命中者的互斥集合来自 **`mod.excludeSeries`**：
   - `囚狼` 且 `id > 100000` → `["囚狼1"]`
   - `换生灵` / `海妖` → `["换生灵","海妖"]`（两者互相锁死）
   - 其余 → `[系列]`
   - ⚠️ **`excludeSeries` 是 `LeveledMod` 的 getter，原始 `modMap` 里没有这个键**。
     直接 `modMap.get(id).excludeSeries` 得到 `undefined` ⇒ 互斥校验会**静默全通过**，结果非法。
     自己实现时要按上面三条规则现算。
   ⇒ **没进 `exclusiveSeries` 的系列（冥犬、夜魔、囚狼、契约者…）可以随便叠**。
     线上实测（9 个角色 36 份构筑）：能叠的系列只有 `契约者 ×3~6`、`冥犬 ×2~8`、`夜魔 ×3~8`、
     `囚狼 ×2~5`、`邪龙 ×2~4` —— **全部都不在 `exclusiveSeries` 里**；
     含互斥系列（`百首` / `狮鹫` / `海妖` / `审判者` / `中庭蛇`…）的叠放出现 **0 次**。
6. **槽位数**：`ModTypeMaxSlot = {charMods: 8, meleeMods: 8, rangedMods: 8, skillMods: 4}`。
7. **中枢**：`类型 === "角色"` 且 `系列 === "羽蛇"`（两者等价：所有 `最大耐受 !== undefined` 的都是羽蛇）。
   中枢占**独立槽**，不进角色槽，也不参与角色槽的名称/系列互斥统计；但它自己受 `属性` 限制（见上）。
8. **耐受**：`getModCostMax(tab) <= getModCap(tab)`。**极性方案是按整表算的**，
   所以「单件耐受之和」只是下界，不能当判据。

## 陷阱清单

1. **`autoBuild` 不校验耐受上限**，输出必须复核 `getModCostMax(tab) ≤ getModCap(tab)`；自写搜索（爬山/随机）要自带全套合法性校验，否则产出不可用 BD。
2. **`excludeSeries` / `weapon.类别` 是派生 getter**（`LeveledMod` / `LeveledWeapon` 上），原始 `modMap` / `weaponMap` 里没有 ⇒ 直接读得 `undefined`，互斥与限定校验会**静默失效**，要按规则现算。
3. **`calculateTargetFunction` 只认有 `tag` 的字段** —— 说明性文本字段（易伤 / 减抗 / 条件）不进结算，必须自己在表达式里补。
4. **`customBuff` 是加进属性池，不是独立乘区，目标是把它清空**：凡有出处的效果一律写 `buffs` 条目（缺定义补 `src/data/d/buff.data.ts` —— 手写文件，不会被 `importdata` 覆盖）。武器 `加成`（含精炼）与熔炉技能内核已自动进表，再写就是重复（实测虚高 13.6%）。
5. **「敌人受到来自 X 的伤害提高」是增伤加算池，不是独立乘区**：不限定属性写 `增伤`，限定元素 / 物理 / 技能写 `元素增伤` / `物理增伤` / `技能伤害`（先例：主角-暗被动 → `元素增伤`、妮弗尔夫人2溯 → `技能伤害`）。技能字段**已含增伤池**，表达式绝不能 `×(1+系数)`。验证法：`customBuff` 加 `["增伤", 1.0]`，DPS 比值 ≈ `(1+池+1)/(1+池)` ⇒ 已含。**状态型加成**（「进入 X 状态时攻速/背水提高」）则写 `buffs` 条目 —— 两类混用会重复计算。
6. **溯源没有专门字段**，写成 `buffs` 条目 `<角色名><N>溯`；能否常驻要结合手法建模（需操作的按覆盖率折算）。
7. **buff 命名统一 `<角色名><技能标识>`**（`XXQ` / `XXE` / `XX被动` / `XX<N>溯` / `XX助战`），别用状态名 / 术语名；命名前回 `char.data.ts` 确认效果挂在哪个 id。
8. **数字撞车必查出处，不能只比数值**（`背水 0.2` 既可能是武器 `加成` 也可能是技能状态字段）。判重靠实测：清空 `customBuff` 再逐项加回，**面板没变化的才是重复项**。
9. **同名不同 id 的 MOD 是两个东西**（近战 `缠缚` 与远程 `缠缚` 同槽并存合法）；同 id 叠件（`契约者`）才按 `count` 控制。
10. **队友光环 BUFF 已覆盖的同名 MOD 不能再自装**（实测虚高 ~19%）。判据 = 名字去 `(属性)` 后缀 + MOD `生效`（剔除 `条件` 键、排序后）与 BUFF 属性字段 **JSON 全等**；只比数值签名会误伤中枢（同名不同槽）。用 `光环自装排除()` 剔除。
11. **条件 MOD（`生效.条件`）挑「自己的静态加成能顶开条件」的版本**（如 `56152` 自带技能效益顶开 `技能效益 >= 1.3`）；且收益随配装漂移 ⇒ **消融必须在收敛后的配装上做**。
12. **钥匙型 / 续航件**（技能效益 / 神智等，DPS 目标看不见）单撤消融接近 0 但撑起循环 ⇒ 直接放 `required`，别交给搜索器权衡。
13. **表达式每一项都要能追到机制条文**，尤其频率 / 层数 / 次数换算。核对顺序：熔炼 / 技能文本 → `tag` 是否含对应标签 → 字段是否真被结算。
14. **轴里每个真正释放的技能都占时间**，按「无技能速度基础值 ÷ (1+技能速度)」入表（同轴只用一种缩放口径）；公式里写了 `*[X]次数` 就不能把次数设 0（自相矛盾）。改轴后**瓶颈会换人、目标函数会变** ⇒ 配装与轴参数都要重跑。**技能冷却 = 技能数据的 `cd` 字段**（有就是有，没有就没有）。
15. **「供给上限」类项（武器回血）的触发次数 = 该武器命中率**，不乘异常数量；`异常数量` 只属「附加元素额外效果」类换算，多式出现时**逐式回条文确认**。武器回血不属于「治疗」，不被 [追猎]「无法受治疗」转化 ⇒ `min(掉血需求, 回血供给)` 成立。
16. **警惕二次放大**：乘数已在子式定义链里就不能外层再乘（`[射击]伤害` 已含次数）；扫轴出现**单调无回撤的发散最优**（如 s 越大越好），先疑公式再信结论。
17. **中枢 = 系列 `羽蛇` 且吃属性限制**（背水(火) 给风角色 = 0 收益）；耐受下界 `Σ ceil(耐受/2)` 只可预筛，判定一律 `getModCostMax ≤ getModCap`（按整表极性实算，含异极性 ×1.5）。
18. **工程细节**：落盘 JSON 必须回环复算（重读再算一次）；settings 用「展开基线再覆盖」构造（`normalizeCharSettings` 会归零 / 补形，手写新对象会漏键）；patch 要经 `settingsOf(spec, patch)` 合并后再读字段；线上抓的 BD 先 filter 掉数据包已删的 buff；搜索用多起点 + ILS + memo 防局部最优。

## 目录

```
example/
├── README.md              # 怎么跑
├── spec.sample.json       # 唯一需要改的文件（复制成 .tmp/build-spec.json）
├── lib.ts                 # 工具集：环境 / MOD 池与合法性 / 排列组合 / 魔灵潜质 / 搜索 / 消融
├── step1-mechanics.ts     # 第 1 步：dump 角色机制与可用命名空间
├── step2-team.ts          # 第 2、3 步：辅助排列组合 + buff 组（含海妖 / 大冲击）
├── step3-pet.ts           # 第 5 步：魔灵与潜质贪心
├── step4-mods.ts          # 第 4、6 步：表达式自检 + 必带 MOD 合法性
├── step5-autobuild.ts     # 第 7 步：autoBuild + 耐受复核 + 剔除 + 爬山
└── step6-ablation.ts      # 第 8 步：消融表 + 落盘最终 BD

scripts/
└── fetch-online-builds.ts # 第 2 步：拉线上构筑，list（元数据）/ download（单拉 charSettings → .tmp/online-builds/）两段
```

跑法（**工作目录必须是仓库根**）：

```bash
cp .agents/skills/build-creator/example/spec.sample.json .tmp/build-spec.json
# 改 .tmp/build-spec.json
bun .agents/skills/build-creator/example/step1-mechanics.ts
# …
```
