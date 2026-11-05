# dna-builder-skill-sim

技能行为数据流水线（U3）：把导出器的 `SkillAssetDoc` 与 `packages/data` 归一成可运行的
`SkillBehaviorIR`，并生成 manifest + 覆盖率报告。**不含运行时**（U4/U5）与全量数据（U7）。

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
- U7 parity 基线：`fixtures/parity-smoke.ts` 目前是自比对 smoke（漂移恒 0），冻结基线时把 `expectedDps`
  换成固定数字，并对 `verifyParity` 传入 `requireCharacter: true`。

## 测试

```bash
bun test packages/skill-sim
node node_modules/typescript/bin/tsc -p packages/skill-sim/tsconfig.json --noEmit
```

fixtures 为合成样本（`fixtures/skill-asset-sample.json`），真实全量产物不进 git。
