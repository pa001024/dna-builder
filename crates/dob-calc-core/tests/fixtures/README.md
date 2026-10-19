# dob-calc-core parity 夹具说明

`dob-app/_check/fixtures/*.json` 作为第二语料直接导入；与当前 TS 冲突时
**当前 TS 赢**（dob-app 夹具可能过期），冲突逐条记录。

## 导入清单（`tools/extract-calc-fixtures.ts#extractDobApp` 产出）

| 本仓库夹具 | dob-app 来源 | charId | target | 口径结论 |
|---|---|---|---|---|
| `dobapp_shardBuild1.json` | `fixture_shardBuild1.json` | 1501 莉兹贝尔 | `[若华纯蓄]DPS` | 一致：`dobTotal=5823675267.58358`，当前 TS 重算相对差 0 |
| `dobapp_vy.json` | `fixture_vy.json` | 2102 薇 | `总和DPS` | 一致：`dobTotal=1767082952.0447142`，相对差 0（含 26 probes，settings 46 键全解析） |
| `dobapp_lieseBathfire1.json` | `fixture_lieseBathfire1.json` | 4103 黎瑟 | `综合DPS` | 一致：`dobTotal=27281810428.826473`，相对差 0（settings 为 JSON 字符串，已解析；无 tables，本仓库以当前 TS 重算为准） |
| `dobapp_OkdnBN3OlC.json` | `fixture_OkdnBN3OlC.json` | 1504 | `[取消剑]DPS` | 一致：`dobTotal=1123660945.245696`，相对差 0 |

## 冲突记录

无冲突（2026-10-19 `bun tools/check-dob-conflicts.ts` 全绿，4/4 相对差 0）。
若日后 dob-app 夹具过期：以本仓库 `expected.calculate`（当前 TS 值）为准，
在此追加「日期 + 夹具 + 旧值 + 新值 + 原因」条目。

## 形态差异（非冲突，记录备查）

- dob-app `settings` 有时是 JSON 字符串（liese），有时是对象（其余三份）：
  抽取脚本统一 `typeof === "string" ? JSON.parse : identity` 后走 `normalizeCharSettings`。
- dob-app `tables` 键为 `{char, mods, modEffects, weapons, weaponEffects, monster,
  buffs, commonLevelUp, mobLevelUp, pets, petTraits}`（单角色子集表）；
  本仓库 parity 短期用存档断言，全量建表接线后 `request.settings` 可直接喂
  `TableBuilder::build(&ModulesJson)`（键名映射见 `session.rs#ModulesJson`）。
- dob-app `expected` 含 `probes`（vy 26 个中间表达式）：本仓库暂不逐项入库，
  目标函数总量一致即视为通过；需细查时以 `evaluate_expressions` 批量跑 probes。

## op 级 JSON 存档（无 Rust 落点，CorePort 已确认）

`modExclusionGroup/collectModOccupancy/isModSlotCompatible/isAuraCompatible/`
`isModEquipable/filterEquipableMods` 在 dob-app seed（`build/*.rs`）中无移植，
CorePort 不建 Rust 入口。`mod_equip.json` 的 op 级值仅作 TS 侧存档断言，
待 Main 排期决定内核归属后再转求值断言。
