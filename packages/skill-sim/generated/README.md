# generated — U7 全角色 manifest

本目录由 `packages/skill-sim/scripts/build-generated.ts` 从 U2 导出器产物生成，**不要手工编辑**。

## 生成

```bash
# U2 真实产物（本机路径；U8 / CI 用 --input 或 SKILL_BEHAVIOR_INPUT 指向自己的产物）
bun packages/skill-sim/scripts/build-generated.ts \
  --input C:/Users/Administrator/.t3/worktrees/DuetNightAbyssData2/skill-sim-export-u2/final/skill-behavior.json
```

内部步骤：

1. `scripts/adapt-u2.ts`：U2 形状 → U3 `SkillAssetDoc`（顶置蓝图/AnimBP 回挂、SkillEffects 展平、notify 按 `通知名称` 展开、槽位/归属归一、占位 `Rate:"#N"` 保守解析、authored buff 注入）。
2. `tools/skill-workflow.ts build`：+ `fixtures/overrides/lise-saiqi.json` → `manifest.json` + `coverage.json`。
3. `scripts/coverage-report.ts`：→ `coverage-matrix.json` + `COVERAGE.md`。

同输入同输出：两次生成的 `manifest.json` SHA-256 均为 `bd32328772ad980cf4ac7d44872cb29cd083a0082195cd59721155a1662908a4`。

## 产物

| 文件 | 大小 | 说明 |
|---|---|---|
| `manifest.json` | 3.5 MB | 可运行 IR（367 技能 / 34 角色 / 250 buff）+ 全量诊断 |
| `coverage.json` | 254 KB | build 阶段诊断与覆盖率快照 |
| `coverage-matrix.json` | 281 KB | 角色/技能覆盖矩阵（状态、来源、缺口、U2 对照） |
| `COVERAGE.md` | 67 KB | 人读覆盖表 |

单文件 < 20 MB，**不需要按角色分片**；U8 直接加载 `manifest.json` 即可。

## 覆盖摘要

- 角色 34：**simulated 11 / data-only 0 / unsupported 23**
- 技能 367：simulated 61 / data-only 95 / unsupported 211
- manifest coverage：montage 128、blueprint 136、animBP 209、有行为 272、authored 8、native 调用 2872（未知 292）
- U2 对照：367 技能、128 montage、136 blueprint、209 animBP、仅 Lua 121、montage 解析 162 / 缺失 126、蓝图 332、AnimBP 34

simulated 角色（E/Q 均有可执行动作）：1101 贝蕾妮卡、1201 主角-暗、1501 莉兹贝尔、1504 苏乙、3103 耶尔与奥利弗、3201 海尔法、4101 黎瑟、4102 止流、4103 黎瑟·浴火、5301 赛琪、5401 达芙涅。

完整逐角色/逐技能表见 [`COVERAGE.md`](./COVERAGE.md)；缺口原因见 `coverage-matrix.json` 的 `reasons`。

## Authored overrides

`fixtures/overrides/lise-saiqi.json`（技能）与 `fixtures/overrides/authored-buffs.json`（buff）：

| 技能 | 来源 | 理由 |
|---|---|---|
| 410101 黎瑟 E | authored + montage | `Rate:"#1"` 无法解析；按 montage 首 notify + 旧手写行为补一条冲刺伤害 |
| 410102 黎瑟 Q | U5 pilot IR | 电场爆发 → 每秒选敌/随机正负电荷 → 3s 电荷反应 |
| 530101 赛琪 E | authored | U2 无 montage、Lua 行为为空，按 SkillEffects 顺序映射三个伤害字段 |
| 530102 赛琪 Q | authored + Lua | 530100 持续增益 + 每秒射击伤害 + 1.5s 延迟增益 |
| 210202 伊薇 Q | authored | 修复 buff Dot tick 窗口越界，并补召唤物 tick 伤害 |
| 220102 主角-水 Q | authored | 修复 Dot tick 窗口越界，补 3514% 伤害/持续消耗 |
| 310401 法露茜 E | authored | 修复 Dot tick 窗口越界，补 [暗影一刺]伤害 |
| 540201 莉莉蔻 Q | authored | 修复 Dot tick 窗口越界（3.2s > until） |

Authored buff：`410122` 负电荷（U2 只有正电荷 410121；410122 在 U2 是 SkillEffect id，U5 pilot 用它表示负电荷）、`150324` / `120231` / `120232` 未导出引用占位。

## Parity（冻结 CharBuild 基线）

`tests/parity/frozen-baselines.json` + `frozen-skill-damage.json`，由 `scripts/freeze-parity.ts` 生成后冻结；测试只重算并比对，不现场生成 expected。

| fixture | 角色 | expected | actual | drift |
|---|---|---:|---:|---:|
| lise-fire-4103 | 黎瑟·浴火（线上 liseFireBuild） | 22606928978.613377 | 22606928978.613377 | 0.000000% |
| lizbel-shard-1501 | 莉兹贝尔（线上 shardBuild1） | 5823675267.583580 | 5823675267.583580 | 0.000000% |
| lise-4101-min | 黎瑟（最小合法构筑） | 23339.281284 | 23339.281284 | 0.000000% |
| saiqi-5301-min | 赛琪（最小合法构筑） | 5016.811054 | 5016.811054 | 0.000000% |
| falu-3104-min | 法露茜（最小合法构筑） | 43502.035814 | 43502.035814 | 0.000000% |
| bern-1101-min | 贝蕾妮卡（最小合法构筑） | 17641.569918 | 17641.569918 | 0.000000% |

- 逐技能字段冻结 42 条（6 角色 × E/Q）；`tests/parity/skill-damage.test.ts` 与 `runtime-parity.test.ts` 验证 CharBuild 路径与 runtime oracle 路径均为 0 漂移。
- **线上标注锚点漂移**：`liseFireBuild` 注释记录作者标注 `28053254998.1983`，当前数据复算 `22606928978.613377`，漂移 **+19.4142%**。这是数据版本变化（gameVersion `v1.7.227.1`）导致的历史标注漂移，已记录而非静默改写；0.1% 门禁只对 U7 冻结值生效。
- 逐事件 parity 的 0 漂移是预期结果：运行时按 PLAN D3 委托 CharBuild，检查的是字段/tag/构筑接线，而非重写公式。

## 全角色 smoke

`tests/parity/all-characters-smoke.test.ts`：34 角色 × E/Q × 5s，固定伤害 oracle（不含 CharBuild 冷启动）。

- 34/34 通过，全部产生 cast 事件；总耗时 **约 24 ms**（目标 < 2s；最近一次 23.5 ms）。
- 每个角色的事件数、E/Q id 见测试日志。

## 已知缺口

1. **`Rate:"#N"`**：U2 产物丢弃了 `SkillDescValues` 公式，225 个 Damage 任务仍是 `#N`。适配器只在“唯一伤害字段 + 行为文本倍率匹配”时保守解析（15 条），其余保留并由 build 记录 `build.effect` 警告；这是 unsupported 的主要原因。
2. **未知 native**：292 个函数名未登记（`CastToCharacterBase`、`ExecutePassiveFunction`、`GetAttr_ByEnum`…）；24 个 SkillEffects Function 未建模（`HitStop`、`PlaySE`、`CreateSkillCreature` 之外的召唤/位移等）。
3. **未匹配 notify 81 类**：相机/音效/碰撞/移动/Invincible 等非行为 notify；`BP_SkillEffect_C` 仍出现在未匹配列表是因为部分技能没有可映射的 SkillEffects。
4. **U2 缺口**：126 个 weapon/pet montage 引用未解析；AnimBP `BakedStateMachines` 不可得；召唤物无 AI；位移、死亡传递、超限护盾、生命流失未建模。
5. **数据缺口**：8 个 U2 子技能在 `packages/data` 无条目（110111、150311、310211、330112、410211、410327、510107、530105）；共享协战技能（100005、110003、150003…）按 `packages/data` 索引“最后注册者”归属，U2 owner 与索引可能不一致。
6. **U3 管线问题**（未改语义，已报告）：
   - `deriveBuffTickPhases` 用父相位 `until` 作为 tick 结束，`DotDelay` 会把 `at` 推到窗口外 → 4 个技能用 authored override 规避；
   - 无证据技能 `sources: []` 触发 schema 校验 → 适配器显式标注 authored 空技能；
   - `collectCalls` 只认 `fn`/`Function`，U2 字节码写 `function` → 适配器归一；
   - native 注册表 `AddBuffToTarget` 参数顺序与真实字节码 `(target, target, buffId, …)` 不一致，导致蓝图 buff 调用多数只记录为 native；
   - `--simulated <角色 id>` 会展开该角色全部技能（含子技能），18 个无动作子技能使全角色 check 失败；`--strict` 还会把 166 条非角色资产的 `ref.unknown-skill` 升级为失败（重复计 `gate.unknown-skill` 共 332 条 strict failure）。

## U8 集成说明

- **manifest 路径**：`packages/skill-sim/generated/manifest.json`；类型 `SkillBehaviorManifest`（`SkillBehaviorDoc` + `generator` + `diagnostics`）。
- **加载**：`JSON.parse(await Bun.file(path).text())` 或 `import manifest from ".../manifest.json"`；运行时直接消费 `characters/skills/buffs`。
- **未支持清单**：以 `coverage-matrix.json` 的 `characters[].skills[].status/reasons` 为准；`unsupported` 不进入 U6 的默认可视化选择。
- **分片**：不需要（3.5 MB）。
- **oracle**：`tests/parity/charbuild-oracle.ts` 是测试侧适配器；U8 建议提升到 `src/adapters/char-build-oracle.ts` 并在 Web/worker 接线。
- **不要**在 U8 里重新生成 manifest 后手改；重新运行 `build-generated.ts` 并提交 diff。

## 开放问题（U8 / 用户确认）

1. **`Rate:"#N"` 的权威解析在哪里做？** 当前适配器只用「唯一伤害字段 + Lua 行为文本倍率」保守解析 15 条；建议 U2 直接导出 `SkillDescValues`/解析后的 Rate，或在 U3 build 里接入公式求值。否则 200+ Damage 任务只能保持 native/unsupported。
2. **非角色资产是否进 manifest？** 367 技能里 158 个是 weapon/pet 技能，U3 `ref.unknown-skill` 对 `characterId=0` 仍是 `--strict` 致命项（166 条 warn × 2 口径 = 332 strict failure）。建议 U3/U8 明确：非角色资产只做资产证据、不参与 strict 门禁。
3. **共享协战技能归属**：U2 owner（首个角色）与 `packages/data` 索引（最后注册者）不一致（100005、110003、150003…）。当前按索引归属；需要确认权威口径。
4. **负电荷 410122**：U2 只有正电荷 buff 410121，410122 是 SkillEffect id。U5 pilot 用它表示负电荷，U7 以 authored buff 注入。是否应由导出器补出真实负电荷 buff？
5. **buff Dot tick 窗口**：U3 `deriveBuffTickPhases` 用父相位 `until` 作为 tick 结束，`DotDelay` 会让 `at` 越界。已在 4 个技能用 authored override 规避；建议修 pipeline（tick 结束取 buff 持续时间/模拟结束）。
6. **`--simulated <角色 id>` 展开口径**：当前展开全部技能（含子技能），18 个无动作子技能使全角色 check 失败。是否只展开主 E/Q/P？
7. **liseFireBuild 历史锚点漂移 19.4%**：作者标注 28.05e9 vs 当前数据 22.61e9；需要构筑作者/数据维护者确认是数据版本变化还是夹具过期。
