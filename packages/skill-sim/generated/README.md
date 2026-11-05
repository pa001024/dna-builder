# generated — U7 全角色 manifest

本目录由 `packages/skill-sim/scripts/build-generated.ts` 从 U2 导出器产物生成，**不要手工编辑**。

## 生成

```bash
# U2 真实产物（本机路径；U8 / CI 用 --input 或 SKILL_BEHAVIOR_INPUT 指向自己的产物）
bun packages/skill-sim/scripts/build-generated.ts \
  --input C:/Users/Administrator/.t3/worktrees/DuetNightAbyssData2/skill-sim-export-u2/final/skill-behavior.json
```

内部步骤：

1. `tools/skill-workflow.ts build --input <原始 U2>`：`src/pipeline/u2-adapter.ts` 在 ingest 内完成 U2 归一（顶置蓝图/AnimBP 回挂、`lua.effects[].raw.TaskEffects` 展平、notify 按 `通知名称` 展开、负 branching time clamp、槽位/归属归一、占位 `Rate:"#N"` 保守解析、authored buff 注入），无需先跑 `adapt-u2`。
2. 同一次 build 应用 `fixtures/overrides/lise-saiqi.json` → `manifest.json` + `coverage.json`。
3. `scripts/coverage-report.ts`：→ `coverage-matrix.json` + `COVERAGE.md`。

`scripts/adapt-u2.ts` 只保留为调试/审阅用的落盘包装，不是必需阶段。

同输入同输出：两次生成的 `manifest.json` SHA-256 均为 `1ce1b5adf24ed0650689af9e3f6827e1be90a1b31f78457dfd28a30ecbfda5e3`。

源 U2 产物：385 技能 / 393 passives / 341 blueprints / 34 AnimBP，12.13 MB（U2 PR #2，head `88314a00`）。

## 产物

| 文件 | 大小 | 说明 |
|---|---|---|
| `manifest.json` | 3.4 MB | 可运行 IR（385 技能 / 34 角色 / 247 buff）+ 全量诊断 |
| `coverage.json` | 319 KB | build 阶段诊断与覆盖率快照 |
| `coverage-matrix.json` | 298 KB | 角色/技能覆盖矩阵（状态、来源、逐技能 montage/BP/AnimBP 缺口、U2 对照） |
| `COVERAGE.md` | 70 KB | 人读覆盖表 |

单文件 < 20 MB，**不需要按角色分片**；Web 侧由 `apps/web/src/game/sim/manifest-source.ts` 通过 Vite
`import.meta.glob`（eager）加载，优先级高于 `web-dev-fallback`（详见 `../README.md` 的「Web 接入」）。

## 覆盖摘要

- 角色 34：**simulated 11 / data-only 0 / unsupported 23**
- 角色技能表：**169 个主技能引用**（每角色 E/Q/P 各 1，其余为共享协战/被动主技能，slot `unknown`）
- 技能 385：simulated 60 / data-only 131 / unsupported 194（`coverage.skillsWithBehavior=60`，与“至少一个非 native 的 damage/applyBuff/removeBuff”口径一致）
- manifest coverage：montage 128、blueprint 188、animBP 209、lua 370、authored 8、native 调用 2355（未知 128）
- 蓝图调用只归因事件入口可达函数，`Add_IntInt`/`ExecuteUbergraph_*`/`ReceiveBeginPlay` 等纯表达式/事件 opcode 不计入 native
- U2 对照：385 技能、128 montage、188 blueprint、209 animBP、仅 Lua 127、montage 解析 162 / 缺失 161、蓝图 341、AnimBP 34
- 新 U2 doc 新增 18 个 MOD 技能（1010201/1010202/…）；42 个技能新获得蓝图证据（含黎瑟 Q `410102` → `BP_Lise_Skill02_01`）。蓝图对 IR 的语义动作增量目前为 0：新增证据主要进入 provenance（如黎瑟 Q 的 2 次 `AddBuff`），authored 相位仍决定实际行为。

simulated 角色（E/Q 均有可执行动作）：1101 贝蕾妮卡、1201 主角-暗、1501 莉兹贝尔、1504 苏乙、3103 耶尔与奥利弗、3201 海尔法、4101 黎瑟、4102 止流、4103 黎瑟·浴火、5301 赛琪、5401 达芙涅。

完整逐角色/逐技能表见 [`COVERAGE.md`](./COVERAGE.md)；缺口原因见 `coverage-matrix.json` 的 `reasons`。

## Authored overrides

`fixtures/overrides/lise-saiqi.json`（技能）与 `fixtures/overrides/authored-buffs.json`（buff）：

| 技能 | 来源 | 理由 |
|---|---|---|
| 410101 黎瑟 E | authored + montage | `Rate:"#1"` 无法解析；按 montage 首 notify + 旧手写行为补一条冲刺伤害 |
| 410102 黎瑟 Q | U5 pilot IR + 新蓝图 | 电场爆发 → 每秒选敌/随机正负电荷 → 3s 电荷反应；U2 PR #2 新增 `BP_Lise_Skill02_01`，蓝图调用保留在 provenance（`AddBuff`×2 已映射，`Damage`/`PlayFX`/`CutToughness` 记录为 native） |
| 530101 赛琪 E | authored | U2 无 montage、Lua 行为为空，按 SkillEffects 顺序映射三个伤害字段 |
| 530102 赛琪 Q | authored + Lua | 530100 持续增益 + 每秒射击伤害 + 1.5s 延迟增益 |
| 210202 伊薇 Q | authored | 修复 buff Dot tick 窗口越界，并补召唤物 tick 伤害 |
| 220102 主角-水 Q | authored | 修复 Dot tick 窗口越界，补 3514% 伤害/持续消耗 |
| 310401 法露茜 E | authored | 修复 Dot tick 窗口越界，补 [暗影一刺]伤害 |
| 540201 莉莉蔻 Q | authored | 修复 Dot tick 窗口越界（3.2s > until） |

Authored buff：`410122` 负电荷（U2 只有正电荷 410121；410122 在 U2 是 SkillEffect id，U5 pilot 用它表示负电荷）、`150324` / `120231` / `120232` 未导出引用占位。

## Parity

### 模拟器 ↔ CharBuild（`runtime-parity*.test.ts`）

- `runtime-parity-simulated.test.ts`：11 个 simulated 角色全部实际施放 E/Q 10s，逐条 damage 事件用 CharBuild `calculateTargetFunction` 现场比对，并核对总伤害（0 漂移）。
- 其中 5 个角色（1101 / 1501 / 4101 / 4103 / 5301）产生 damage 事件；其余 6 个只有 buff 类可执行动作，断言运行时确实产生非 cast 事件（结构性 parity，不以 0 伤害冒充数值 parity）。
- `runtime-parity.test.ts` 保留黎瑟/赛琪的电荷循环、每秒射击等语义断言。

### 冻结 CharBuild 回归（`baselines.test.ts`，非模拟器 parity）

`tests/parity/frozen-baselines.json` + `frozen-skill-damage.json`，由 `scripts/freeze-parity.ts` 生成后冻结；测试只重算并比对 CharBuild 自身，不现场生成 expected，也不把冻结 runtime 结果当 expected。

| fixture | 角色 | expected | actual | drift |
|---|---|---:|---:|---:|
| lise-fire-4103 | 黎瑟·浴火（线上 liseFireBuild） | 22606928978.613377 | 22606928978.613377 | 0.000000% |
| lizbel-shard-1501 | 莉兹贝尔（线上 shardBuild1） | 5823675267.583580 | 5823675267.583580 | 0.000000% |
| lise-4101-min | 黎瑟（最小合法构筑） | 23339.281284 | 23339.281284 | 0.000000% |
| saiqi-5301-min | 赛琪（最小合法构筑） | 5016.811054 | 5016.811054 | 0.000000% |
| falu-3104-min | 法露茜（最小合法构筑） | 43502.035814 | 43502.035814 | 0.000000% |
| bern-1101-min | 贝蕾妮卡（最小合法构筑） | 17641.569918 | 17641.569918 | 0.000000% |

- 逐技能字段冻结 42 条（6 角色 × E/Q）；`tests/parity/skill-damage.test.ts` 验证 CharBuild 路径为 0 漂移。
- **线上标注锚点**：`liseFireBuild` 注释记录作者标注 `28053254998.1983`，当前数据复算 `22606928978.613377`（漂移 +19.4142%）。只作为溯源记录，测试不再断言漂移“必须存在”（避免阻止未来修复）；0.1% 门禁只对 U7 冻结值生效。
- 模拟器逐事件 0 漂移是预期结果：运行时按 PLAN D3 委托 CharBuild，检查的是字段/tag/构筑接线，而非重写公式。

## 全角色 smoke

`tests/parity/all-characters-smoke.test.ts`：34 角色 × E/Q × 5s，固定伤害 oracle（不含 CharBuild 冷启动）。

- 断言 **34 角色 / 169 个主技能引用**、全部产生 cast 事件；simulated 角色还必须产生至少一个非 cast 事件。
- 34/34 通过，总耗时 **约 24 ms**（目标 < 2s）。
- 每个角色的事件数、E/Q id 见测试日志。

## 已知缺口

1. **`Rate:"#N"`**：U2 产物丢弃了 `SkillDescValues` 公式，225 个 Damage 任务仍是 `#N`。适配器只在“唯一伤害字段 + 行为文本倍率匹配”时保守解析（15 条），其余保留并由 build 记录 `build.effect` 警告；这是 unsupported 的主要原因。
2. **未知 native**：128 个函数名未登记（`CastToCharacterBase`、`ExecutePassiveFunction`、`GetAttr_ByEnum`…）；24 个 SkillEffects Function 未建模（`HitStop`、`PlaySE`、`CreateSkillCreature` 之外的召唤/位移等）。蓝图调用的数学/事件 opcode（`Add_IntInt`、`ExecuteUbergraph_*`、`Relative`…）已过滤，不再计入 native。
3. **未匹配 notify 81 类**：相机/音效/碰撞/移动/Invincible 等非行为 notify；`BP_SkillEffect_C` 仍出现在未匹配列表是因为部分技能没有可映射的 SkillEffects。
4. **U2 缺口**：126 个 weapon/pet montage 引用未解析；AnimBP `BakedStateMachines` 不可得；召唤物无 AI；位移、死亡传递、超限护盾、生命流失未建模。
5. **数据缺口**：8 个 U2 子技能在 `packages/data` 无条目（110111、150311、310211、330112、410211、410327、510107、530105）；新 doc 的 MOD 技能（1010xxx/1020xxx…）同样无角色语义；它们保留真实 `characterId` 而不是写成 0（0 仍专指武器/MOD 等无角色语义资产）。共享协战技能（100005、110003、150003…）按 `packages/data` 索引“最后注册者”归属，U2 owner 与索引可能不一致；角色技能表按 U2 声明的 169 项保留。
6. **U3 管线问题**（未改语义，已报告）：
   - `deriveBuffTickPhases` 用父相位 `until` 作为 tick 结束，`DotDelay` 会把 `at` 推到窗口外 → 4 个技能用 authored override 规避；
   - 无证据技能 `sources: []` 触发 schema 校验 → 适配器显式标注 authored 空技能；
   - `collectCalls` 只认 `fn`/`Function`，U2 字节码写 `function` → 适配器归一；
   - native 注册表 `AddBuffToTarget` 参数顺序与真实字节码 `(target, target, buffId, …)` 不一致，导致蓝图 buff 调用多数只记录为 native；
   - `--simulated <角色 id>` 已只展开主 E/Q/P；子技能（slot `unknown`）不参与门禁；
   - 缺失数据的主技能仍是 `gate.unknown-skill` error；子技能/非角色资产只是 warn，但 `--strict` 仍会把 `ref.*` warn 升级为失败。

## U8 集成说明

- **manifest 路径**：`packages/skill-sim/generated/manifest.json`；类型 `SkillBehaviorManifest`（`SkillBehaviorDoc` + `generator` + `diagnostics`）。
- **加载**：`JSON.parse(await Bun.file(path).text())` 或 `import manifest from ".../manifest.json"`；运行时直接消费 `characters/skills/buffs`。
- **未支持清单**：以 `coverage-matrix.json` 的 `characters[].skills[].status/reasons` 为准；`unsupported` 不进入 U6 的默认可视化选择。
- **分片**：不需要（3.5 MB）。
- **oracle**：`tests/parity/charbuild-oracle.ts` 是测试侧适配器；U8 建议提升到 `src/adapters/char-build-oracle.ts` 并在 Web/worker 接线。
- **不要**在 U8 里重新生成 manifest 后手改；重新运行 `build-generated.ts` 并提交 diff。

## 开放问题（U8 / 用户确认）

1. **`Rate:"#N"` 的权威解析在哪里做？** 当前适配器只用「唯一伤害字段 + Lua 行为文本倍率」保守解析 15 条；建议 U2 直接导出 `SkillDescValues`/解析后的 Rate，或在 U3 build 里接入公式求值。否则 200+ Damage 任务只能保持 native/unsupported。
2. **非角色资产是否进 manifest？** 367 技能里约 158 个是 weapon/pet 技能。当前主技能缺数据是 error，子技能/非角色资产是 warn；`--strict` 仍会把 `ref.unknown-skill` warn 升级为失败。建议 U3/U8 明确：非角色资产只做资产证据、不参与 strict 门禁。
3. **共享协战技能归属**：U2 owner（首个角色）与 `packages/data` 索引（最后注册者）不一致（100005、110003、150003…）。当前按索引归属；需要确认权威口径。
4. **负电荷 410122**：U2 只有正电荷 buff 410121，410122 是 SkillEffect id。U5 pilot 用它表示负电荷，U7 以 authored buff 注入。是否应由导出器补出真实负电荷 buff？
5. **buff Dot tick 窗口**：U3 `deriveBuffTickPhases` 用父相位 `until` 作为 tick 结束，`DotDelay` 会让 `at` 越界。已在 4 个技能用 authored override 规避；建议修 pipeline（tick 结束取 buff 持续时间/模拟结束）。
6. **`--simulated <角色 id>` 展开口径**：已改为只展开主 E/Q/P；共享协战主技能（slot `unknown`）也不参与门禁。
7. **liseFireBuild 历史锚点漂移 19.4%**：作者标注 28.05e9 vs 当前数据 22.61e9；需要构筑作者/数据维护者确认是数据版本变化还是夹具过期。
