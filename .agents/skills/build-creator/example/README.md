# example —— 通用最优构筑脚本骨架

这里**没有任何角色特定内容**。所有角色相关的东西都在 spec 里，换角色只改 spec。

## 跑法

工作目录必须是**仓库根**（`E:/dev/dna-builder`），包管理一律 `bun`。

```bash
cp .agents/skills/build-creator/example/spec.sample.json .tmp/build-spec.json
# 编辑 .tmp/build-spec.json：charId / base.meleeWeapon / base.rangedWeapon / customVariables …

bun .agents/skills/build-creator/example/step1-mechanics.ts <角色id>   # 1. 读机制（直接把 id 传参）
bun .agents/skills/build-creator/example/step2-team.ts                 # 2、3. 辅助排列组合 + buff 组
bun .agents/skills/build-creator/example/step3-pet.ts                  # 5. 魔灵 + 潜质
bun .agents/skills/build-creator/example/step4-mods.ts                 # 4、6. 表达式自检 + 必带 MOD
bun .agents/skills/build-creator/example/step5-autobuild.ts            # 7. autoBuild + 剔除 + 爬山
bun .agents/skills/build-creator/example/step6-ablation.ts             # 8. 消融 + 落盘
```

spec 路径可以用环境变量覆盖：`BUILD_SPEC=.tmp/other.json bun …`。

## 中间产物

| 文件 | 谁写 | 内容 |
|---|---|---|
| `.tmp/build-assist.json` | step2 | 选中的辅助 buff 组（后续步骤用 `chosenBuffs()` 自动读取） |
| `.tmp/build-win.json` | step5 | 最优 MOD 配置 |
| `outputs/build-creator-result.json` | step6 | 最终 BD（可直接导入构筑页，`targetFunction` 已指向你的表达式） |

## spec 字段

```jsonc
{
  "charId": 0,                 // 必填：角色 id
  "base": { … },               // 必填：charSettings 覆盖项（其余走 createDefaultCharSettings）
  "assist": [                  // 辅助排列组合：每轴选 1 个 option，取笛卡尔积
    { "axis": "队友1", "options": [ { "label": "不带", "buffs": [] }, … ] }
  ],
  "pets": [ 4251, … ],         // 魔灵候选 id（step3 遍历取最优）
  "required": {                // 必带 MOD（机制核心件），step5 会当作种子保留
    "charMods": [], "meleeMods": [], "rangedMods": []
  },
  "ablate": [                  // 自定义消融项（step6 追加到消融表）
    { "label": "撤掉某机制", "patch": { "hpPercent": 1 } }
  ]
}
```

## 几个必须注意的点（详细解释见 `../SKILL.md`）

- `base.buffs` 里要放 `["自定义BUFF", 1]`，否则 `base.customBuff` 不生效。
- **易伤 / 充盈这类独立乘区写进 `customVariables` 表达式**，不要塞 `customBuff`（那是加进属性池的）。
- `base.meleeWeapon` / `base.rangedWeapon` 决定 MOD 池（武器类别限定靠它算），先填对再跑 step5。
- `thresholds`：`lib.overCost()` 用 `getModCostMax <= getModCap` 做硬校验，`autoBuild` 自己**不校验**。
- 表达式写完先跑 step4 自检：恒为 0 的变量说明命名空间/字段名不存在。
