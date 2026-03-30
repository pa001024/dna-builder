# src/data/

游戏数据层，包含角色构建系统的核心计算逻辑和游戏数据。

## 目录结构

```
data/
├── d/                    # 静态数据文件
│   ├── abyss.data.ts     # 深渊副本和增益数据
│   ├── achievement.data.ts # 成就数据
│   ├── base.data.ts      # 基础数据
│   ├── buff.data.ts      # 增益数据
│   ├── char.data.ts      # 角色数据
│   ├── draft.data.ts     # 抽卡数据
│   ├── dungeon.data.ts   # 副本数据
│   ├── effect.data.ts    # 效果数据
│   ├── fish.data.ts      # 钓鱼数据
│   ├── map.data.ts       # 地图数据
│   ├── mod.data.ts       # MOD 数据
│   ├── monster.data.ts   # 怪物数据
│   ├── pet.data.ts       # 宠物数据
│   ├── reward.data.ts    # 奖励数据
│   └── walnut.data.ts    # 胡桃数据
├── leveled/              # 带等级的游戏对象类
│   ├── LeveledBuff.ts    # 带等级的增益
│   ├── LeveledChar.ts    # 带等级的角色
│   ├── LeveledMod.ts     # 带等级的 MOD
│   ├── LeveledMonster.ts # 带等级的怪物
│   ├── LeveledPet.ts     # 带等级的宠物
│   ├── LeveledSkill.ts   # 带等级的技能
│   ├── LeveledSkillWeapon.ts # 带等级的同律武器
│   ├── LeveledWeapon.ts  # 带等级的武器
│   └── index.ts          # 导出和升级倍率表
├── tests/                # 单元测试
│   ├── CharBuild.test.ts
│   ├── data-types.test.ts
│   ├── evaluateAST.test.ts
│   ├── leveled.test.ts
│   └── index.test.ts
├── ast.ts               # AST（抽象语法树）解析器
├── CharBuild.ts         # 角色构建核心类
├── data-types.ts        # 数据类型定义
├── index.ts            # 导出入口
├── package.json        # 包配置
├── tsconfig.json       # TypeScript 配置
└── vitest.config.ts    # 测试配置
```

## 核心模块

### CharBuild.ts

角色构建系统的核心类，负责计算角色属性和伤害。

**主要功能：**

- **属性计算**：计算角色基础属性（攻击、生命、护盾、防御、神智）和其他属性（技能威力、耐久、效益、范围等）
- **武器属性计算**：计算近战武器、远程武器、同律武器的属性
- **伤害计算**：
    - 技能伤害计算（考虑属性穿透、昂扬、背水、增伤、独立增伤、失衡易伤等乘区）
    - 武器伤害计算（考虑暴击、触发、攻速、多重等）
    - 防御乘区计算
- **AST 表达式求值**：支持自定义目标函数表达式，如 `伤害`、`DPS`、`每神智DPS` 等
- **时间线模拟**：支持技能释放时间线的 DPS 模拟

**关键类和方法：**

```typescript
class CharBuild {
    // 静态宏定义，用于 AST 表达式的快捷替换
    static macros: Record<string, string>

    // 计算角色所有属性
    calculateAttributes(): CharAttr

    // 计算武器属性
    calculateWeaponAttributes(weapon): CharAttr & { weapon?: WeaponAttr }

    // 计算技能伤害
    calculateSkillDamage(attrs): DamageResult

    // 计算武器伤害
    calculateWeaponDamage(attrs, weapon): DamageResult

    // 计算 AST 目标函数
    evaluateAST(astInput, attrs): number

    // 验证 AST 表达式
    validateAST(astInput): string | undefined

    // 计算随机伤害（用于模拟）
    calculateRandomDamage(baseWithTarget, enemy?): number
}
```

### data-types.ts

所有数据类型的接口定义和枚举。

**主要接口：**

- `Char`：角色数据结构
- `Weapon`：武器数据结构
- `Skill`：技能数据结构
- `Mod`：MOD 数据结构
- `Monster`：怪物数据结构
- `Buff`：增益数据结构
- `SkillField`：技能字段
- `SkillEffect`：技能效果
- `SkillBuff`：技能增益

**主要枚举：**

- `Elem`：元素类型（光、暗、水、火、雷、风）
- `WeaponCategory`：武器类别（单手剑、长柄、重剑、双刀、鞭刃、太刀、手枪、双枪、榴炮、霰弹枪、突击枪、弓）
- `WeaponSkillType`：武器技能类型（普通攻击、蓄力攻击、下落攻击、滑行攻击、射击）
- `HpType`：生命值类型（生命、护盾、战姿）
- `DmgType`：伤害类型（切割、贯穿、震荡）
- `SkillType`：技能类型（伤害、召唤、增益、治疗、被动、防御）
- `Faction`：阵营
- `Quality`：MOD 品质（白、紫、绿、蓝、金）
- `ModType`：MOD 类型（角色、近战、远程、同律近战、同律远程）
- `ModSeries`：MOD 系列（不死鸟、中庭蛇、人面狮、冥犬、囚狼、夜使、夜魔、契约者等）

### leveled/

带等级的游戏对象类，根据等级倍率表计算属性。

**CommonLevelUp**：角色/武器 1-80 级的升级倍率表。

**主要类：**

- `LeveledChar`：带等级的角色，计算基础属性和技能等级
- `LeveledWeapon`：带等级的武器，计算基础属性和武器技能
- `LeveledSkillWeapon`：带等级的同律武器
- `LeveledMod`：带等级的 MOD，计算属性加成
- `LeveledBuff`：带等级的增益
- `LeveledSkill`：带等级的技能，计算技能字段值
- `LeveledMonster`：带等级的怪物，计算属性和当前状态
- `LeveledPet`：带等级的宠物

### ast.ts

AST（抽象语法树）解析器和求值器。

**功能：**

- **词法分析**：将表达式字符串转换为 Token 流
- **语法分析**：将 Token 流转换为 AST
- **宏替换**：支持宏定义的快捷替换（如 `DPS` → `or(攻速,1+技能速度)*or(多重,1)*伤害`）
- **支持的表达式特性**：
    - 基本运算：`+`、`-`、`*`、`/`、`//`（整数除法）、`%`（取模）
    - 属性访问：`攻击`、`伤害`、`[幻象]伤害`
    - 函数调用：`max(a, b)`、`or(a, b)`
    - 命名空间访问：`Q::伤害`（技能 Q 的伤害）
    - 成员访问：`伤害.N`（伤害的不考虑血量版本）

**AST 节点类型：**

- `binary`：二元运算（`a + b`）
- `unary`：一元运算（`-a`、`+a`）
- `property`：属性（`攻击`）
- `function`：函数调用（`max(a, b)`）
- `member_access`：成员访问（`伤害.N`）
- `number`：数字字面量

### d/

静态游戏数据文件，包含所有角色的技能、武器、MOD、怪物等数据。

**主要数据文件：**

- `char.data.ts`：角色数据（基础属性、技能、同律武器）
- `weapon.data.ts`：武器数据（基础属性、武器技能）
- `mod.data.ts`：MOD 数据（系列、品质、属性加成）
- `monster.data.ts`：怪物数据（属性、阵营）
- `buff.data.ts`：增益数据
- `achievement.data.ts`：成就数据
- `abyss.data.ts`：深渊副本数据
- `dungeon.data.ts`：副本数据
- `fish.data.ts`：钓鱼数据
- `walnut.data.ts`：胡桃数据

### tests/

单元测试，使用 Vitest 框架。

**测试文件：**

- `CharBuild.test.ts`：角色构建功能测试
- `data-types.test.ts`：数据类型测试
- `evaluateAST.test.ts`：AST 求值测试
- `leveled.test.ts`：带等级对象测试
- `index.test.ts`：导出测试

## 伤害计算公式

### 技能伤害计算

```
伤害 = 基础伤害 × 属性穿透 × 增伤 × 独立增伤 × 失衡易伤 × 血量乘区 × 防御乘区
```

**乘区说明：**

- **属性穿透**：`max(0, (1 - 敌方抗性) × (1 + 属性穿透))`
- **增伤**：`1 + 增伤 + 技能伤害`
- **独立增伤**：`1 + 独立增伤`（乘法叠加）
- **失衡易伤**：`失衡状态 ? (1 + 失衡易伤 + 1.5) : 1`
- **血量乘区**：
    - **昂扬乘区**：`1 + 昂扬 × 当前血量百分比`
    - **背水乘区**：`1 + 4 × 背水 × (1 - hp%) × (1.5 - hp%)`
- **防御乘区**：`1 - 防御 / (300 + 防御 - 等级差 × 10)`

### 武器伤害计算

```
期望伤害 = (物理部分 × 物理倍率 + 元素部分 × 元素倍率 × 抗性) × 暴击期望 × 增伤 × 独立增伤 × 追加伤害 × 失衡易伤 × 血量乘区 × 抗性穿透
```

**暴击期望计算：**

```
暴击期望 = 1 + 暴击率 × (暴击伤害 - 1)
```

**触发伤害期望：**

```
触发期望 = 触发率 × 触发倍率
```

## AST 目标函数

系统支持自定义目标函数，使用 AST 表达式语法。

### 预定义宏

- `DPS`：`or(攻速,1+技能速度)*or(多重,1)*伤害`
- `总伤`：`max(1,召唤物攻击次数)*伤害`
- `暴击伤害`：`伤害.暴击`
- `每神智DPH`：`1/神智消耗*伤害`
- `每神智DPS`：`or(攻速,1+技能速度)/神智消耗*伤害`
- `范围收益`：`技能范围*伤害`
- `耐久收益`：`技能耐久*伤害`
- `效益收益`：`技能效益*伤害`

### 表达式示例

```javascript
// 基础伤害
"伤害"

// DPS
"DPS"

// 考虑技能效益和神智消耗
"技能效益*伤害/神智消耗"

// 技能 Q 的伤害
"Q::伤害"

// 考虑暴击和触发的期望伤害
"伤害.N * 暴击伤害.暴击 * (1 + 触发伤害)"

// 技能范围和效益的加权平均
"0.5*技能范围*伤害 + 0.5*技能效益*伤害"
```

## 使用示例

### 创建角色构建

```typescript
import { CharBuild, LeveledChar, LeveledWeapon, LeveledMod, LeveledBuff } from "dna-builder-data"

const charBuild = new CharBuild({
    char: new LeveledChar("黎瑟", 80),
    melee: new LeveledWeapon("铸铁者"),
    ranged: new LeveledWeapon("烈焰孤沙"),
    charMods: [new LeveledMod(41324)],
    buffs: [new LeveledBuff("黎瑟E")],
    hpPercent: 1,
    resonanceGain: 0,
    baseName: "普通攻击",
    targetFunction: "DPS",
    enemyId: 130,
    enemyLevel: 80,
    skillLevel: 10,
})

// 计算伤害
const damage = charBuild.calculate()
```

### 自定义目标函数

```typescript
const charBuild = new CharBuild({...})

// 设置自定义目标函数
charBuild.targetFunction = "技能范围*伤害 + 技能效益*伤害/神智消耗"

// 验证表达式
const error = charBuild.validateAST(charBuild.targetFunction)
if (error) {
    console.error("表达式错误:", error)
} else {
    const result = charBuild.calculate()
    console.log("目标函数值:", result)
}
```

### 计算所有伤害

```typescript
import { WeaponSkillType } from "./data-types"

// 计算所有技能的伤害
const skills = charBuild.charSkills
skills.forEach(skill => {
    const [attrs, damage] = charBuild.calculateByBasename(skill.名称)
    console.log(`${skill.名称}: ${damage.expectedDamage}`)
})

// 计算所有武器技能的伤害
const weaponSkills = charBuild.weaponSkills
weaponSkills.forEach(skill => {
    const [attrs, damage] = charBuild.calculateByBasename(skill.名称)
    console.log(`${skill.名称}: ${damage.expectedDamage}`)
})
```

## 运行测试

```bash
# 运行所有测试
pnpm test

# 运行特定测试文件
pnpm test src/data/tests/CharBuild.test.ts

# 运行测试并生成覆盖率报告
pnpm coverage
```

## MCP 服务（npx 直连 stdio）

`src/data` 子包提供了可直接通过 `npx` 启动的 MCP stdio 服务器，包含两个核心能力：

1. 本地数据查询：在 `d/*.data.ts` 中用 `fuse.js` 执行模糊搜索
2. 在线数据查询：连接 GraphQL 后端查询实时密函（missionsIngame）

本地数据工具设计参考 Context7 的两步流程：

1. `resolve-data-module`：先解析本地模块（返回 `/local/<dataset>`）
2. `query-data-module`：再基于 `moduleId` 做单模块查询（支持 `fields` 字段白名单降噪）

密函查询为独立工具：

1. `query-missions`：默认查询 `missionsIngame(server: "cn")`
2. 返回结果将二维数组转换为结构化字段：`角色` / `武器` / `魔之楔`

### 发布后启动示例

```bash
npx -y dna-builder-data
```

### 配置 GraphQL 端点

默认端点：`https://api.dna-builder.cn/graphql`

可通过环境变量覆盖：

```bash
DNA_MCP_GRAPHQL_ENDPOINT=http://127.0.0.1:8887/graphql npx -y dna-builder-data
```

也可通过命令行参数覆盖：

```bash
npx -y dna-builder-data --graphql-endpoint http://127.0.0.1:8887/graphql
```

## 注意事项

1. **等级系统**：所有带等级的对象都使用 `CommonLevelUp` 数组计算属性倍率
2. **MOD 限制**：MOD 有系列限制和极性限制，同一系列的 MOD 最多装备 1 个
3. **属性上限**：某些属性有上限（如技能效益上限 175%，技能范围上限 280%）
4. **AST 缓存**：AST 解析结果会被缓存以提高性能
5. **动态增益**：支持带 `code` 属性的动态增益，可以在运行时修改属性

## 扩展指南

### 添加新数据类型

1. 在 `data-types.ts` 中定义接口
2. 在 `d/` 目录下创建数据文件
3. 在 `index.ts` 中导出

### 添加新等级对象

1. 在 `leveled/` 目录下创建新文件
2. 实现 `getLevelValue` 方法使用 `CommonLevelUp` 计算属性
3. 在 `leveled/index.ts` 中导出

### 添加新 AST 函数

1. 在 `ast.ts` 中的 `evaluateIdentity` 函数中添加处理逻辑
2. 在 `CharBuild.macros` 中添加宏定义（可选）

## 相关文档

- [../AGENTS.md](../AGENTS.md) - AI 助手指南
- [../../README.md](../../README.md) - 项目总览
- [d/AI.md](d/AI.md) - 系统文档
