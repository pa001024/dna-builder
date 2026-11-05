# dna-builder-skill-sim

技能行为数据流水线（U3）：把导出器的 `SkillAssetDoc` 与 `packages/data` 归一成可运行的
`SkillBehaviorIR`，并生成 manifest + 覆盖率报告；`src/runtime/`（U5）把 IR 解释成 U4 的模拟命令。
U7 已把真实 U2 产物落成 `generated/`（manifest + 覆盖表 + parity 基线），见
[`generated/README.md`](./generated/README.md)。

```text
SkillAssetDoc (导出器 monage / bytecode / lua 证据)
        │  ingest（别名归一、分片合并、版本门禁）
        ▼
   resolve（char / skill / buff / 字段对 packages/data）
        │  build（montage → phases；bytecode → native 登记表；lua 兜底；authored 覆盖）
        ▼
SkillBehaviorManifest = SkillBehaviorIR + coverage + diagnostics
        │  check（引用 / 重复 / --simulated 门禁）
        └  verify（CharBuild parity）
```

## CLI

```bash
bun tools/skill-workflow.ts ingest --input <file|dir> [--out <file>] [--overrides <file>]
bun tools/skill-workflow.ts build  --input <file|dir> --out <dir> [--strict] [--overrides <file>]
bun tools/skill-workflow.ts check  --input <dir|manifest.json> [--simulated 4101,...] [--strict]
bun tools/skill-workflow.ts verify --manifest <manifest.json> --fixtures <file> [--allow-drift]
```

- 退出码：`0` 成功 / `1` 校验或门禁失败 / `2` 用法错误；`--json` 输出机器可读结果。
- `build` 写出 `<out>/manifest.json`（完整 IR）与 `<out>/coverage.json`（覆盖率 + 诊断）。
- `check --strict` 把 `ref.*` / `gate.*` / `schema.reference` 类 warn 升级为失败；
  覆盖率提示（`build.no-actions`）与导出器新增字段（`schema.unknown-field`）不升级。
- `--simulated` 可写技能 id，也可写角色 id（展开为该角色全部技能）。
- 目录输入按 `*.json` 分片合并，文件名含 `override` 的文件会被跳过（避免把 overrides 当分片）。

## 运行时（U5）

`src/runtime/` 使用 `SkillBehaviorDoc` 驱动 U4 的 `Simulation`：不渲染、不读导出器 JSON、不 import `./data-index`。
所有无法执行的东西都进 `RuntimeDiagnostic`，不静默跳过。

```ts
import { createSimulation } from "dna-builder-skill-sim"
import { createSkillRuntime } from "dna-builder-skill-sim/runtime"

const simulation = createSimulation({ duration: 10, dt: 1 / 60, seed: 7, actors, enemies, oracle })
const runtime = createSkillRuntime({ simulation, doc, actorId: "lise", recastPolicy: "toggle-off" })
runtime.cast(410102, 0) // 校验资源 / 冷却 / 重复施放并排程；at 可晚于当前时钟（延后校验）
runtime.run()           // 内部逐帧 step，返回 SimResult
runtime.diagnostics()   // 不可执行项清单（同类去重，带 occurrences）
```

- `cast()` 的 `at` 是绝对秒数；`Phase.at/until` 相对施法开始（IR 契约），由运行时换算。
- 条件与分支谓词在**动作执行时刻**求值（经 `Simulation.scheduleCallback` 插入同刻事件，先于该刻帧采样），
  因此前面动作产生的 buff / 资源对后面的分支可见。
- `recastPolicy`：`fail`（默认，重复施放报 `active`）/ `toggle-off`（关闭旧实例，用于开关型技能）。
- 确定性：随机只用 `core/rng` 的 seeded Rng（缺省按 actor fork），不调用 `Math.random` / `Date.now`。

### IR → SimCommand 映射

| IR | 运行时行为 |
|---|---|
| `cast.time` / `cooldown` / 一次性 `costs` | 发 core `cast` 命令（core 扣资源、设冷却、发 `cast` 事件） |
| `cast.costs[].perSecond` | **不扣**，提交时记 `sustained-cost`；由 IR 的 tick 相位（`resource` 动作）建模 |
| `Phase.at/until/tick` | 展开为绝对时刻调用序列（闭区间；`count` 优先；超出时长裁剪并记 `phase-clipped`） |
| `Phase.condition` | 该次调用执行时刻求值；`opaque` → 跳过整次调用 + `opaque-condition` |
| `damage` | `damage` 命令；`hits.count × interval` 逐段结算；目标 primary/nearest/random/all/stored |
| `applyBuff` / `removeBuff` | `applyBuff` / `removeBuff` 命令；duration 缺省取 `doc.buffs` |
| `resource` | `resource` 命令 |
| `select` | `selectTargets` 命令并写入 `stored`，供后续 `{kind:"stored"}` 目标引用 |
| `branch` | 执行时刻求值；未知谓词两侧都不执行 + `opaque-condition` |
| `summon` | 生成占位实体（id/owner/duration）+ `summon` 诊断，不模拟 AI / 属性 / 阵营 |
| `native` | 只按 `provenance.nativeCalls` 记 `native` 诊断（`known/mapped`），**不假装执行** |

### 已知未建模（运行时不臆造，遇到时诊断）

- IR 无 `timeline`：取消窗 / 连段窗 / 位移窗只有 `ActiveSkill.windows` 的形状，数据侧为空；
- 无移动 / 位移动作：黎瑟 Q 的电荷吸附、目标跟随不执行；
- 无死亡钩子：目标死亡时电荷转移 / 换目标不执行；
- `TargetFilter` 无法同时排除多个 buff（黎瑟 Q 旧实现的「优先未充能目标」只能近似）；
- `RemoveWhenSpZero` 这类 Lua 终止条件不入 IR：资源为 0 后 tick 仍按 IR 继续；
- 召唤物无 AI / 阵营 / 属性，只有 `spawn` 占位；
- 多目标 `applyBuff`：按 IR 逐目标处理，不做「同一目标只挂一次」的语义去重。

性能（测试实测，3 个敌人、1s tick）：黎瑟 Q 10s ≈ 0.8ms，60s 同构负载 ≈ 5–6ms（`tests/runtime/lise-q.test.ts`）。

## 契约

| 类型 | 位置 | 说明 |
|---|---|---|
| `SkillAssetDoc` | `src/schema/asset.ts` | 导出器产物，未知字段容忍；`authored` 是 dna-builder 侧人工语义（导出器不写） |
| `SkillBehaviorDoc` | `src/schema/ir.ts` | 运行时契约（PLAN §2.2）；`Phase.at` 相对施法开始，秒 |
| `SkillBehaviorManifest` | `src/pipeline/types.ts` | `SkillBehaviorDoc + generator + diagnostics`，check 的输入 |
| `SkillDataIndex` | `src/pipeline/types.ts` | resolve/build 对 `packages/data` 的最小读取面（测试可注入合成索引） |

### Action 扩展（相对 PLAN §2.2）

- `removeBuff`：Lua `移除增益(id)` / SkillEffects `RemoveBuff` 无法用现有 union 表达，additive 补充；
- `phase.source` / `action.source` / `action.origin`：溯源（`montage` / `blueprint` / `lua` / `manual`），运行时忽略；
- `TargetFilter`：PLAN 只引用未定义，这里固定为 `nearest | random | all | primary`（可选 `count/radius/requiresBuff/excludesBuff`）；
- `branch.on` 是**不透明谓词键**：运行时登记 `random` / `hasBuff:<id>` / `resourceAtLeast:<res>:<n>` /
  `targetCountAtLeast:<n>`，未知键必须显式报错，不得默认走 `then`。

### 来源优先级

1. `authored.phases` 存在 → 整体替换派生相位（provenance 仍保留全部证据）；
2. montage notify → `Phase`（`BP_SkillEffect_C` 按 `payload.EffectId` / `NotifyName` 关联 `lua.effects`）；
3. 蓝图字节码 → `native-map.ts` 登记表翻译；未知 native 保留 `{kind:"native"}`；
4. Lua `行为` / SkillEffects → 仅在前几路都没有动作时兜底；
5. `buff.props.DotDatas`（`SpChange`）→ 被 applyBuff 的 buff 自动生成 tick 相位。

## 对 U4/U5/U7

- 入口隔离：`.` / `./pipeline` 不加载 `packages/data`（默认入口导入约 10ms）；只有 `./data-index` 会加载数据，
  仅 CLI / 迁移脚本使用。运行时（U4/U5/U6）不要 import `./data-index`。
- U4/U5 只读 `SkillBehaviorManifest`：`skills[id].phases` 已按 `at` 排序，`tick` 相位需按 `interval` 展开；
  `cast.costs` 含 `perSecond` 标记，持续消耗建模为带 `condition.hasBuff` 的 tick 相位。
- `provenance.nativeCalls` 中 `known=false` 的项**不可假装执行**；`coverage.nativeCallsUnknown` 是迁移缺口清单。
- U7 的复杂机制走 `authored`（fixture 里的黎瑟 Q 即示例）；批量 override 可用 `--overrides` 文件：
  `{ "schemaVersion": 1, "skills": { "<skillId>": AuthoredBehavior } }`。
- U7 parity 基线：真实冻结值在 `tests/parity/frozen-baselines.json` / `frozen-skill-damage.json`，
  由 `scripts/freeze-parity.ts` 生成后提交；测试只重算并比对，不现场生成 expected。

## 全角色生成（U7）

```bash
# U2 真实产物 → generated/manifest.json + coverage.json + coverage-matrix.json + COVERAGE.md
bun packages/skill-sim/scripts/build-generated.ts --input <U2>/final/skill-behavior.json

# 重新冻结 parity（仅在数据/公式有意变更后）
bun packages/skill-sim/scripts/freeze-parity.ts
bun test packages/skill-sim/tests/parity
```

- 适配器 `scripts/adapt-u2.ts` 只做形状归一与保守的 `Rate:"#N"` 解析；复杂技能用
  `fixtures/overrides/lise-saiqi.json`（authored）+ `fixtures/overrides/authored-buffs.json`。
- 覆盖表：`generated/COVERAGE.md`（人读）/ `generated/coverage-matrix.json`（机器读）。
- 已知缺口与 U8 集成说明见 `generated/README.md`。

## 测试

```bash
bun test packages/skill-sim
node node_modules/typescript/bin/tsc -p packages/skill-sim/tsconfig.json --noEmit
```

合成的 schema/pipeline 测试样本在 `fixtures/`；真实全量产物在 `generated/`（可重复生成）。
