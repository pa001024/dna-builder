# buildhub-core：可自描述机制的可执行规则内核

> 类型：**方案规格**（to-be）。面向实现 agent。
> 基线：2026-10-25 工作区。
> 定位：**引擎不认识任何游戏概念**。每个游戏用本规格定义的语言写自己的规则模块，声明自己的
> 数据形状、装配结构（槽位/预算/图/孔连线/拼图）、属性含义、堆叠方式、暴击算法、伤害公式、
> 时间模型与搜索策略。引擎只提供「编译 → 执行 → 缓存 → 解释 → ABI」。
>
> 本仓库现有的构筑计算**不是设计起点，也不是移植目标**；它只是第一个校验语料（§13）。
> 引擎不认识「角色/魔之楔/暴击/深渊」中的任何一个词，也不认识「孔/连线/天赋树/拼图/队友」。
>
> 与最初「`dob-calc-core` 的超集」这一提法的关系：**能力上是超集**（任何它能算的，BHL 都能表达），
> **设计上不继承**（不抄它的类型、阶段划分、池语义）。判据不是"能复现它"，
> 而是"换一个连暴击公式和装备结构都不同的游戏，仍不需要改引擎"。

## 0. 泛化对象：三类差异

规格要同时吸收三类正交差异，任何一类被当成"配置项"就会失败：

| # | 差异 | 样本 | 抽象位置 |
|---|---|---|---|
| 1 | **数值语义** | 暴击 4 种、减伤 3 种、堆叠 4+ 种、收敛 4 种 | §1、§7.1–7.5 |
| 2 | **装配结构** | 定长槽位、容量预算、图（天赋树）、孔+连线、拼图、随机词条、多形态 | §4.4、§7.6–7.9 |
| 3 | **跨界生效** | 光环（全队）、队友交叉、条件生效、技能移植（覆盖） | §7.10 |
| 4 | **结果形状** | 单值（期望）/ 分布（暴击档位、多段独立触发、稀有度掉落） | §9.8 |

第 4 类与前三类不同：前三类决定"算什么"，第 4 类决定"输出什么形状"。因此它是**模式**，
不是语义——同一份公式在 `expect` 与 `tree` 两种模式下必须给出同一个根值（§9.8.11）。

第 2 类在两个方向上都会失败：
- 若引擎提供 `Slot`/`Socket`/`Grid`，就只能覆盖其中一两种；
- 若引擎什么都不提供、把装配完全交给 pack，pack 就得自己重写"合法性检查"的每个细节——
  这是**允许**的，也是本规格的选择（§4.4 只给四段式签名，不给实现）。

## 1. 为什么任何内置词汇都是错的

用户提出的核心约束：不同游戏的数据、属性、甚至伤害结算方式都不同，**连暴击都不同**。
这不是"配置差异"，而是**语义差异**。下面四组反例说明：只要引擎里出现一个业务名词，
就等于替所有游戏做了一个它可能不承认的决定。

### 1.1 「属性」不是同一种东西

| 游戏 | 「攻击」的含义 | 叠加方式 | 上限 |
|---|---|---|---|
| A（百分比加成制） | 一个百分比加成，最终乘在基础值上 | 加算池 `Σ` | 无 |
| B（绝对点数制） | 一个绝对值，与基础值直接相加 | 加算后乘倍率 | 有 |
| C（档位制） | 整数档 0~5，查表得系数 | 取最高档 | 档位上限 5 |
| D（因子制） | 已经是乘数，1.0 起步 | 连乘 | 无 |

引擎若规定 `stat { default: 0, fold: sum }`，A 可用、B 勉强、C/D 不可用。
引擎若规定 `fold` 只能在 `sum/product/diminish` 里选，C 的「取最高档」就得靠特例。
→ **引擎不能有 `stat` 这个词**。

### 1.2 「暴击」的四种口径（同语言、不同算法）

```
# A 期望值口径：溢出部分浪费
fn crit_a(rate: Num, dmg: Num) -> Num = 1.0 + min(rate, 1.0) * (dmg - 1.0)

# B 档位量化：暴击率按 10% 一档取整后参与
fn crit_b(rate: Num, dmg: Num) -> Num =
  let tier = floor(rate * 10.0)
  in 1.0 + tier / 10.0 * (dmg - 1.0)

# C 溢出转化：超过 100% 的部分转成暴伤
fn crit_c(rate: Num, dmg: Num) -> Num =
  let r = min(rate, 1.0)
  in let over = max(rate - 1.0, 0.0)
  in 1.0 + r * (dmg + over - 1.0)

# D 上下界口径：分别算「必不暴击」与「必暴击」两档
fn crit_bounds(rate: Num, dmg: Num) -> (Num, Num) =
  ((dmg - 1.0) * floor(rate) + 1.0, (dmg - 1.0) * ceil(rate) + 1.0)
```

四个游戏，四段代码，同一引擎。引擎若内置 `crit(rate, dmg) = 1 + rate*(dmg-1)`，
B/C/D 全部错。→ **引擎不能有 `crit` 这个词**。

### 1.3 「减伤/防御」的三种口径

```
# A 比例减伤（可叠乘）
fn mitigation_ratio(defense: Num) -> Num = 1.0 - defense / (300.0 + defense)

# B 减法减伤（下限钳 0，可被穿透）
fn mitigation_subtractive(attack: Num, armor: Num, pen: Num) -> Num =
  max(attack - max(armor - pen, 0.0), attack * 0.1)

# C 等级差修正（同抗性在不同等级差下曲线不同）
fn mitigation_level(level: Num, target_level: Num) -> Num =
  let d = clamp(target_level - level, 0.0, 20.0)
  in 1.0 - d * 0.02
```

### 1.4 「什么时候算完」也是游戏特有的

| 游戏 | 求值语义 |
|---|---|
| A | 单趟：基础 → 加成 → 伤害，无回环 |
| B | 定点：某加成依赖自身结果，迭代到稳定（上限轮数） |
| C | 优先级覆盖：后者直接替换前者，不累加 |
| D | 仿真：按时间推进状态，输出是积分 |

→ **引擎不能有 `stage` 顺序、不能有 `fixpoint` 默认策略、不能有 `stat` 生命周期**。

### 1.5 结论

引擎的词汇必须**严格小于任何游戏的词汇**。凡是「所有游戏都有一个 X」的直觉，都在下一次
接入时被证伪。因此本规格给出的不是"配置化的计算器"，而是**一门语言 + 一个执行内核**。

### 1.6 每个反例对应一项语言能力（泛化的可检验形式）

| 反例（§1.1–1.4） | 若做成"配置项"会怎样 | 语言里的解法 | 引擎是否需要知道 |
|---|---|---|---|
| 属性叠加有 4 种以上语义 | 加一个 `fold` 枚举值，第 5 种就不够 | `fold(xs, init, f)`，`f` 是 pack 的函数 | 否 |
| 属性上限有时是硬顶、有时是软衰减 | 配置 `cap` 只能表达硬顶 | 在公式里写 `min` 或任意曲线函数 | 否 |
| 暴击有 4 种算法 | 内置 `crit()` 就锁死一种 | pack 写 `crit_*` 函数，可多个并存 | 否 |
| 减伤有比例/减法/等级差 | 三种都得内置 | pack 写一个 `mitigation(...)` | 否 |
| 求值可能单趟/定点/覆盖/仿真 | 内置 `stage` 顺序 | 单趟=普通函数；定点=`fix`；覆盖=`first_by_priority`；仿真=`simulate` | 否 |
| 数据形状各异（扁平/嵌套/字典/混排） | 固定 `Entity` 结构 | `schema` 声明 + `[[data]]` 绑定 | 否 |
| 缺省值不同 | 引擎默认值 | `get_or(field, default)`，default 写在 pack | 否 |
| 浮点口径不同（求和顺序/舍入） | 引擎选一种 | 列表顺序 + 显式 `round*` 指令 | 否 |
| 需要"最优配置" | 内置搜索算法 | `lib/search.bhl`（可替换） | 否 |
| 需要"逐条数据带逻辑" | 内嵌脚本引擎 | 数据存名字，pack 里 `match` 分派 | 否 |
| 装配是槽位/图/拼图/预算（§4.4） | 内置 `Slot` + `Socket` | pack 的 `Layout` + `legal` + `contribute` + `resolve` | 否 |
| 存档格式每游戏不同（§4.4.1） | 引擎解析存档 | pack 导出 `import_*` 函数，引擎只做 JSON→值 | 否 |
| 随机词条有给定/期望/上界三种需求（§4.4.2） | 引擎掷骰 | 值 / 权重求和 / 搜索；seed 是普通字段 | 否 |
| 队友交叉与光环（§7.10） | 内置 `team1/team2` 字段 | `Party` 列表 + `targets` 谓词 | 否 |
| 数值含概率、结果需要分布（§9.8） | 引擎内置"暴击期望"公式 | `choice(cases)` 原语 + `expect`/`tree` 模式 | 否（只认识加权备择） |

这张表的最后一列全部是「否」，就是「完全泛化」的可操作定义。
它也是 code review 的判据：任何把最后一列变成「是」的改动都是错的。

## 2. 语义下限：引擎只认识这些

### 2.1 引擎知道（不可再少）

| # | 原语 | 说明 |
|---|---|---|
| 1 | `Num` = IEEE-754 binary64 | 唯一数值类型；整数语义靠显式取整函数 |
| 2 | `Bool` | 仅编译期存在，lower 后是 0/1 |
| 3 | `Sym` = 驻留符号 | 由数据或字面量产生，可比较、可 `match`；不能参与算术 |
| 4 | `Record` = 开放结构体 | 字段由 pack 的 schema 描述；缺字段有显式缺省策略 |
| 5 | `List<T>` / 元组 | 有序、不可变 |
| 6 | 纯函数（含高阶） | 无副作用；闭包只捕获不可变值 |
| 7 | 有界递归与有界迭代 | `fix` / 递归调用受 `fuel` 与 `depth` 约束 |
| 8 | 有序归约 | `fold` 的**顺序 = 列表顺序**，由 pack 决定；引擎不得重排 |
| 9 | 结构化哈希 + 值记忆化 | 缓存键是「函数 + 参数值」，不需要任何声明 |
| 10 | 加权备择 `choice` | 「按概率在若干值里挑一个」是数学结构，不是业务概念；正常模式直接退化为期望值 |

### 2.2 引擎不知道（全部在库里）

```
stat 属性 加成 池 作用域 槽位 覆盖率 层数 品质 暴击 暴伤 触发 抗性 穿透
减伤 增伤 独立增伤 伤害 治疗 护盾 生命 防御 速度 技能 装备 套装 词条
阶段 回合 tick 时间轴 收益 敏感度 配装 最优解
孔 插槽 连线 宝石 天赋 树 拼图 网格 旋转 预算 容量 词缀 随机 队友 光环 形态
```

`tests/no_domain_leak.rs` 把这张表做成 CI 门禁：`crates/buildhub-core/src/**` 命中即失败
（黑名单本身放在 `tests/`，避免误伤文档与注释）。

注意第二行：**`孔`/`连线`/`天赋`/`拼图`/`预算`/`队友`/`光环` 与 `暴击` 同级**——它们同样是
某些游戏的机制名词，同样只允许出现在 pack 里（§4.4、§7.6–7.10）。

### 2.3 为什么 `fold` 足够表达「任意堆叠」

任意堆叠语义都是「把一组贡献按某顺序归约成值」，而 `fold` 是最一般的归约形式；
不同的只是**初始值、元素顺序、二元函数**。三者都由 pack 给出，引擎不参与决定。

- 加算：`fold(xs, 0, |a,b| a+b)`
- 乘算：`fold(xs, 1, |a,b| a*(1+b))`
- 净增量：上一个再 `-1`
- 递减：`1 - fold(xs, 1, |a,b| a*(1-b))`
- 取最高档：`fold(xs, 0, |a,b| max(a,b))`
- 优先级覆盖：先 `sort_by(priority)` 再 `first`
- 只吃前 N 件：先 `sort_by(desc)` 再 `take(n)` 再 sum
- 任意自定义：pack 自己写二元函数

**顺序是结果的一部分**：浮点求和顺序会改变末位。因此 `fold` 的顺序定义为入参列表顺序，
列表由 pack 用 `sort_by`（键显式）或数据原序构造。引擎没有权限重排，编译器也不得把
`fold` 改写成树形归约或并行归约（§9.3）。

## 3. 语言：BHL

文件后缀 `.bhl`。UTF-8，无注释嵌套问题，缩进不敏感。

### 3.1 类型

```
Num  Bool  Sym  Unit
List<T>  (A, B, ...)                 # 元组类型
Record{ field: T, ..., ..open }     # ..open 表示允许额外字段
Option<T>  Result<T, E>             # 代数类型，match 穷尽检查
Fn(A, B) -> C                        # 一等函数（不可变捕获）
```

- **没有字符串类型进算术**。文本只做展示与数据键；需要比较的用 `Sym`（编译期/装载期 intern）。
- **没有整数类型**。需要整数语义时用 `round/floor/ceil/trunc`，显式且可审计。
- 记录是结构化的：`schema` 给出字段名→类型；未声明字段在 `..open` 下仍可读（返回 `Option`）。
- **泛型只在函数签名层**：`fn hill_climb<C>(...)` 里的 `C` 是类型参数，由调用点推导。
  不做泛型特化、不做类型类；需要"能不能比较/相加"由函数参数（比较器、二元函数）显式传入。
  `schema` 不能是泛型的——数据形状不需要它。

### 3.2 求值语义

- **纯**：没有可变状态、没有全局变量、没有 I/O、没有异常。
- **严格**（call-by-value）、**确定**（同输入同输出，与 target 无关）。
- **全函数**：没有 `panic`。可能失败的操作返回 `Option`/`Result`，由 pack 决定缺省。
  引擎级失败（fuel 耗尽、深度超限）在边界以错误码返回，不中断进程。
- **有界**：每次求值有 `fuel`；递归/迭代有 `depth`；列表有 `len_limit`。

### 3.3 语法（完整列表）

```
decl   := schemaDecl | typeDecl | fnDecl | constDecl | moduleDecl | importDecl

schemaDecl := 'schema' Name '{' schemaFields '}'
schemaFields := (Name ':' TypeExpr (',' Name ':' TypeExpr)*)? (',' '..open')?
typeDecl   := 'type' Name '=' TypeExpr
fnDecl     := 'fn' Name typeParams? '(' params ')' ('->' TypeExpr)? ('=' Expr | Block)
typeParams := '<' Name (',' Name)* '>'
constDecl  := 'const' Name ':' TypeExpr '=' Expr
moduleDecl := 'module' Name
importDecl := 'import' Name 'from' String ('@' Version)?

params := (Name ':' TypeExpr | pattern) (',' ...)*

expr   := literal | ident | '(' expr ')'
        | expr op expr | '-' expr | 'not' expr
        | expr '.' field | expr '[' index ']'
        | expr '(' args ')' | lambda
        | 'if' expr 'then' expr 'else' expr
        | 'match' expr '{' arms '}'
        | 'let' pattern '=' expr 'in' expr
        | recordLit | listLit | tupleLit | schemaLit

literal := number | 'true' | 'false'
        | symLit        # sym"name"  → Sym 字面量
        | stringLit     # 仅 show 用，不进算术

pattern := Name | '_' | tuplePat | recordPat | 'some' '(' pattern ')' | 'none'
         | 'ok' '(' pattern ')' | 'err' '(' pattern ')'

recordLit  := '{' (Name ':' expr) (',' ...)* '}'
schemaLit  := Name '{' (Name ':' expr) (',' ...)* '}'
listLit    := '[' (expr (',' ...)*)? ']'
tupleLit   := '(' expr ',' expr (',' ...)* ')'

lambda := '|' params '|' expr
op     := + - * / // % == != < <= > >= && ||
```

`schemaLit`（`Config { slots: [...] }`）与 `recordLit` 的区别：前者按声明的 `schema` 校验字段名
与类型，后者是开放记录。`update(x, { f: v })` 里用 `recordLit`（只改指定字段）。

控制流**只有** `if` / `match` / 递归 / `fold`。没有 `while`、没有 `break`、没有 `goto`。
「循环」一律表达为 `fold`（有界，长度由列表给出）或 `fix`（有界，轮数上限显式）。

内建函数（全部与业务无关；下列 39 个）＋ 2 个常量（`inf` `nan`）：

```
# 数值
min max clamp abs floor ceil round trunc
round_js      # half-up 向 +∞（JS Math.round 口径）
to_fixed      # 精确二进制十进制展开后 half-up
sqrt pow log  # 走 libm（可配 host，见 §9.4）
safe_div      # 除零返回缺省，而不是 inf

# 列表（顺序语义显式）
len at slice concat concat_map map filter fold sort_by take drop zip find any all count
# 记录
field get_or has update
# 构造
sym_of num_of
# 有界递归
fix(init, step: |T| T, done: |T| Bool, max: Num) -> T

# 加权备择（§9.8）：支撑集传播，出口才投影
choice(cases: List<(Num, T)>) -> T     # 权重不必归一；负权/零总权 = 编译期错误

# 显式塌缩（§9.8.12.4）：把分布立刻折成期望；引擎从不隐式调用它
expected(x: T) -> T

# 常量（不是函数）
inf nan
```

> 这 39 个名字里没有一个是业务概念；连 `sum`/`avg` 都在标准库里用 `fold` 写。

### 3.4 模块与包

```
# lib/stack.bhl
module stack

import num from "lib/num.bhl" @1

fn additive(xs: List<Num>, init: Num) -> Num = fold(xs, init, |a, b| a + b)
fn multiplicative(xs: List<Num>, init: Num) -> Num = fold(xs, init, |a, b| a * (1.0 + b))
fn diminishing(xs: List<Num>) -> Num = 1.0 - fold(xs, 1.0, |a, b| a * (1.0 - b))
fn top_k(xs: List<Num>, k: Num) -> Num =
  additive(take(sort_by(xs, |x| -x), k), 0.0)
```

- 模块名唯一；`import ... @version` 固定主版本，解析到包内 `lib/` 或已声明的依赖。
- **禁止循环 import**（编译期报错）；依赖图是 DAG。
- 模块是**源码级**复用：两个 pack 可以各自 vendor 同一份 `stack.bhl`，互不影响版本。

### 3.5 程序入口

pack 用 `pack.toml` 声明哪些函数/值对外（§4.2 的 `[[entries]]`，与 `[[data]]` 同处一个文件）。其余 `fn` 只是内部实现。

## 4. 数据与绑定

### 4.1 数据是 JSON，形状由 pack 描述

游戏数据五花八门：扁平记录、嵌套对象、对象数组、以名字为键的字典、以及"同一张表里混多种形状"。
BHL 不预设任何一种，只要求宿主把数据以 **JSON 值** 交进来，pack 用 schema 描述它关心的部分。

```
# 任何 .bhl 模块里都可以声明 schema；pack.toml 按名字引用
schema Item {
  id: Num
  name: Sym
  base: Num
  quality: Sym
  tags: List<Sym>
  bonus: Record{ ..open }        # 嵌套对象，开放字段
  ..open                          # 表本身允许新增字段（游戏更新加列不破坏校验）
}
```

校验策略（`pack.toml` 的 `schema_check`）：`strict`（未知字段报错）/ `open`（默认，忽略）/ `warn`。

### 4.2 绑定

```toml
# pack.toml
[[data]]
name    = "items"
dataset = "modules/item.data"     # 数据包里的模块键
schema  = "Item"
key     = "id"                    # 主键字段；缺省 = 数组下标
index   = true                    # 有 key 时默认 true；生成 by_id 索引

[[data]]
name    = "rules"
dataset = "modules/rule.data"
schema  = "Rule"
key     = "name"
```

生成的 API（编译期固定，无运行期字符串查找）：

```
data.items.all()            -> List<Item>
data.items.by_id(id: Num)   -> Option<Item>
data.items.len()            -> Num
data.rules.by_key(s: Sym)   -> Option<Rule>
```

- 数据版本 = 该数据集内容哈希；作为记忆化键的一部分，数据换了自动失效。
- 绑定是纯映射，不许计算（计算写在规则里），保证「数据 → 实例」可缓存。

同一份 `pack.toml` 里再用 `[[entries]]` 声明对外函数（完整例子见 §8.0）：

```toml
[[entries]]
name = "damage"
fn   = "damage"
args = ["Config"]          # 仅供宿主/CLI 校验与生成绑定，不参与计算
```

未出现在 `[[entries]]` 里的 `fn` 只是 pack 内部实现，不可被外部调用。

### 4.3 配置

宿主传入的 JSON（构建配置、模拟参数、搜索输入）。pack 声明它的 schema：

```
schema Config {
  slots: List<Option<Num>>
  target: Sym
  level: Num
  ..open
}
```

**配置不是全局变量**：它是普通值，作为参数传进被调用的函数（`fn damage(cfg: Config) -> Num`）。
`pack.toml` 的 `[[entries]]` 只声明导出哪些函数、参数顺序如何，不声明任何"当前配置"。
这样：

- 同一进程可以同时持有多份配置，无需会话状态；
- 敏感度/搜索可以自由构造新配置并复用缓存（纯函数 + 值记忆化的直接结果）；
- 引擎里没有 `set_config` 这类 API，也就没有"什么时候该失效"的问题。

JSON → `Config` 的转换在装载/调用边界完成（`bhub_json_to_value`），转换错误带字段路径。

缺字段取 `Option`，由 pack 用 `get_or` 给缺省——**缺省值属于游戏，不属于引擎**。

### 4.4 装配不是「槽位表」

上一版的 `slots: List<Option<N>>` 是**本仓库那一个游戏**的形状。真实情况是：

| 游戏 | 装配的实际结构 |
|---|---|
| 本仓库 | 4 个定长列表（角色/近战/远程/同律）+ 1 个中枢 + 随机潜质 |
| 原神 | 5 件圣遗物，每件 1 主词条 + 4 副词条（随机滚值），2 件/4 件套 |
| Warframe | 战甲 + 主/副/近战各 8 槽，**容量预算**随等级与光环变化；光环占独立槽；赋能独立；Helminth 技能移植会**替换**某个技能；灵化让同一武器有多个形态 |
| PoE | 天赋树是**图**（1200+ 节点，连通性约束），树上有**珠宝孔**，珠宝自带范围/条件；技能宝石装在**带颜色与连线**的孔里，连线构成**组** |
| 火炬之光：无限 | 天赋是**六边形拼图**，形状块平移/旋转放置，不重叠；另有技能链接 |
| 异环 | 套装 + 小型拼图块 |

这六种结构的差别不在"字段多少"，而在**候选集合、合法性、贡献归约**三件事全都不同。
因此「装配」不能是引擎的数据结构，只能是一个 **pack 定义的布局值 + 三个 pack 函数**：

```
# 布局是 pack 自己的类型（List / Record / 索引集 / 邻接表，随便）
schema Layout { ..open }

# 1) 候选：参与装配的东西（来自 data，或宿主传入）
                                              # 无需引擎支持

# 2) 合法性：这个放置是否允许（重叠 / 越界 / 预算 / 颜色 / 连通 / 前置）
fn legal(lay: Layout, p: Placement) -> Bool

# 3) 贡献：一次放置产生 0..n 条贡献（一件装备可影响多个目标/多个属性）
fn contribute(lay: Layout, p: Placement) -> List<Contribution>

# 4) 归约：把所有贡献合成属性表（顺序由 pack 决定）
fn resolve(lay: Layout) -> Stats =
  fold(concat_map(placements_of(lay), |p|
         if legal(lay, p) then contribute(lay, p) else []),
       empty_stats(),
       apply_contribution)
```

`Placement` / `Contribution` / `Stats` / `Layout` **全部由 pack 声明**，引擎只看见
`List`、`Record`、`Sym` 与 `fold`。引擎里没有 `slot`、没有 `socket`、没有 `tree`、没有 `grid`。

这条式子的四段正好对应六种结构的差异：

| 结构 | 候选集合 | 合法性 | 贡献 |
|---|---|---|---|
| 定长槽位 | 每个槽的 `Option<Item>` | 槽类型匹配 | 直接取属性 |
| 随机词条（圣遗物） | 物品 + `List<Affix>` | 词条数 ≤ 上限、不重复 | 主词条 + 各副词条，按列表顺序 |
| 容量预算（Warframe） | 物品 + 各自消耗 | `fold(消耗, 0, +) ≤ capacity(cfg)` | 属性 + 光环额外容量 |
| 图（PoE 树） | 已分配的节点索引集 | 从根 BFS 可达 + 点数预算 | 节点自身 + 珠宝孔内珠宝（带范围条件） |
| 孔 + 连线（宝石） | `(孔, 宝石, 颜色)` | 同组颜色计数匹配 + 组内至多 1 主动技 | 组内技能 + 辅助宝石对它的修饰 |
| 拼图（TLI/异环） | `(块, 旋转, 平移)` | 覆盖格全在界内且互不重叠 | 每格效果，按格序归约 |

**未通过 `legal` 的放置不是错误，是被忽略**——这样搜索可以先产生非法候选再筛掉，
不需要引擎提供"事务/回滚"。需要把非法当错误时，pack 自己返回 `Result`。

#### 4.4.1 序列化：存档格式不是引擎的事

不同游戏、同游戏不同版本的存档形状都不同（原神的圣遗物是 `{setName, mainStat, subStats[]}`，
Warframe 是 `{modId, rank, polarity}`，PoE 是 base64 的角色串）。引擎只做一件事：
**JSON → `Value` 的机械转换**。语义层映射由 pack 写：

```
# pack 提供导入器：把宿主给的原始存档（形状任意）规范化成 Config
fn import_save(raw: Record{..open}) -> Result<Config, Sym> =
  match field(raw, sym"buildSlots") {
    none => err(sym"missing_buildSlots"),
    some(v) => ok(normalize(v))
  }
```

- 导入器是**普通 pack 函数**，可被 `entry` 导出、被 `pack test` 覆盖。
- 一个 pack 可以有多个导入器（版本 A / 版本 B / 第三方工具格式），互不干扰。
- 引擎**不解析**任何存档格式，也不认识"词条""精炼""极性"。
- 无法映射时返回 `err(Sym)`，由宿主决定提示文案——引擎不生成用户文案。

#### 4.4.2 随机性

引擎**没有** RNG，也不掷骰。三种需求三种写法：

| 需求 | 写法 |
|---|---|
| 给定随机结果（导入真实存档 / 用户手填） | 就是普通值，随机性已在数据里 |
| 求期望值 | pack 用权重求和：`fold(affixes, 0, \|a, x\| a + x.value * x.weight)` |
| 求上界 / 最好情况 | pack 用 `max` 或搜索；"最好的词条组合"是搜索问题，不是概率问题 |
| 需要可复现采样 | `host("rng.splitmix", seed)`，seed 是 `Config` 的普通字段 |

**"随机"不是引擎概念**：引擎的确定性来自纯函数，与是否"随机"无关——同一个 seed 同一个结果。

## 5. 标准库（DSL 源码，可替换）

标准库不是引擎的一部分。它提供"常见写法"，任一 pack 可以不用、或 vendor 一份改过的。

| 模块 | 内容 | 谁用得上 |
|---|---|---|
| `lib/num.bhl` | `lerp` `pwl`（分段线性）`step` `almost_eq` `percent` `range(from, to, step)` | 几乎所有 |
| `lib/list.bhl` | `sum` `prod` `avg` `max_of` `min_of` `group_by` `count_if` `sort_desc` | 几乎所有 |
| `lib/stack.bhl` | `additive` `multiplicative` `net` `diminishing` `top_k` `first_by_priority` | 有"堆叠"概念的游戏 |
| `lib/diff.bhl` | `delta(a, b)` `relative(a, b)` `sensitivity(cfg, setter, score)` | 需要收益/敏感度 |
| `lib/sim.bhl` | `simulate`（= `trace` 的薄封装）`window(from,to,dt)` `events_to_steps` `quantile` `prefix_sum` | 有时间推进 / 需要曲线 |
| `lib/search.bhl` | `hill_climb` `beam` `exhaustive` `enumerate_slots` | 需要求最优配置 |

每个函数的实现都是 `fold`/`map`/`fix` 的组合，**引擎不特化它们**。

示例（`lib/sim.bhl`）：

```
fn simulate(s0: S, steps: List<Step>, step: |S, Step| S) -> S = fold(steps, s0, step)

fn window(from: Num, to: Num, dt: Num) -> List<Num> =
  fix([], |acc| concat(acc, [len(acc) * dt + from]),
      |acc| len(acc) > 0 && at(acc, len(acc) - 1) + dt > to,
      100000)
```

## 6. 引擎能力（Rust 侧的全部内容）

```
crates/buildhub-core/
  src/lexer/      词法
  src/parser/     语法 → AST（带 span）
  src/check/      类型检查、模块解析、穷尽性、有界性
  src/ir/         AST → SSA；常量折叠 / 内联 / DCE（只做保位级变换）
  src/emit/       发射器（两个，共用 IR）
    bytecode.rs   SSA → CodeImage（路径 B）
    wasm.rs       SSA → wasm 模块（路径 W）
  src/vm/         执行（tree 与 bytecode 双实现，位级一致）
  src/rt/         运行时（堆 / 值表示 / NaN 规范化 / memo / fuel）；B 与 W 共用
  src/memo/       结构化哈希 + 值记忆化 + fuel
  src/data/       JSON → 记录视图 + 数据版本
  src/explain/    调用树与数值来源记录
  src/abi/        C ABI
  src/cli/        pack check / build / test / eval / explain / parity
```

**没有** `src/stats.rs`、`src/damage.rs`、`src/dyn.rs`、`src/schedule.rs` 之类的东西。
任何"机制"都不该出现在这里。

**`src/emit/` 两个发射器不构成"两份实现"**：它们消费同一份 SSA、引用同一张
`Instruction` 语义表（§9.6.2）。新增一条指令必须同时在两个发射器里落地，由 G4/G5 守住。

### 6.1 记忆化：值键，零声明

```
memo_key = hash(fn_id, args)        # args 递归结构化哈希，记录共享时哈希可缓存
```

- 纯函数 → 同参必同值，因此安全性不需要任何声明（不需要 `reads`）。
- 增量来自**按窄参数切分函数**，这是函数式程序的基本纪律，不是引擎策略：

```
# 差：整份配置进缓存键，改一个槽位全失效
fn score(cfg: Config) -> Num = ...

# 好：每个槽位的贡献单独成函数，未变的槽位命中缓存
fn slot_bonus(slot: SlotState) -> Num = ...
fn total(cfg: Config) -> Num =
  stack.additive(map(cfg.slots, |s| slot_bonus(s)), 0.0)
```

- 引擎提供 `hash` 的结构共享优化（列表/记录沿用父级哈希），使窄参数的成本可忽略。
- 记忆化是**可选开关**：`pack.toml` 可关掉（用于对照调试），结果必须一致。

### 6.2 解释（explain）

因为求值是一棵纯调用树，解释可以是"重放一遍并记录"，不影响正常路径：

```
explain("total")
total(cfg) = 4.82
├─ slot_bonus(slot#0) = 1.20      [调用]
├─ slot_bonus(slot#1) = 1.20      [调用]
├─ slot_bonus(slot#2) = 2.42      [调用]
└─ stack.additive([...], 0) = 4.82
   └─ fold step 3 : 2.42 → 4.82   [fold 第 3 次归约]
```

记录粒度可配置（仅顶层 / 含 fold 步骤 / 全量），默认仅顶层。

### 6.3 失败与诊断

| 情形 | 行为 |
|---|---|
| 类型错误 / 未知字段 / 未知模块 | 编译期，`BHC-E1xx` + `file:line:col` |
| 数据不符合 schema（`strict`） | 装载期，`BHC-E2xx` + 数据集/记录键 |
| fuel / depth / len 超限 | 求值期，`BHC-E3xx`，返回 `Result` 不 panic |
| 除零（未用 `safe_div`） | 返回 `inf/NaN` 并按 IEEE 传播（由 pack 自己负责） |
| 未知 host capability | 装载期，`BHC-E4xx` |

所有诊断可序列化为 JSON（供 CLI、IDE、CI 共用）。

## 7. 用同一引擎表达九类完全不同的机制

以下全部是**纯 pack 代码**，无引擎改动。片段假设已 `import` 标准库（`lib/stack.bhl`、`lib/sim.bhl`、
`lib/search.bhl`）；标准库本身也是 BHL，可被替换（§5）。

§7.1–7.5 是**数值语义**的差异（属性、暴击、减伤、收敛、时间、搜索）；
§7.6–7.10 是**装配结构**的差异（图、孔连线、拼图、预算、跨角色）；
两组差异互不相关，都必须由 pack 表达。装配的抽象只有四段式（§4.4）：
`Layout` / `legal` / `contribute` / `resolve`。

### 7.1 单趟流水线（无回环）

```
# 每个槽位对该属性的加成；槽位为空时返回 0
fn bonus_of(s: Option<Num>) -> Num =
  match s {
    some(v) => v,
    none    => 0.0
  }

fn attack(c: Config, it: Item) -> Num =
  let base  = it.base
  in let bonus = stack.additive(map(c.slots, |s| bonus_of(s)), 0.0)
  in base * (1.0 + bonus)

fn damage(c: Config, it: Item) -> Num =
  let a = attack(c, it)
  in a * crit_a(c.crit_rate, c.crit_dmg) * mitigation_ratio(c.target_armor)
```

`crit_a` / `mitigation_ratio` 就是 §1.2 / §1.3 里 pack 自己定义的函数——引擎不提供它们。

### 7.2 依赖收敛（加成依赖自身结果）

```
fn settle(c: Config, it: Item) -> Stats =
  fix(initial_stats(c, it),
      |s| step_stats(c, it, s),          # 一轮：用 s 算下一轮
      |s| close_enough(s, step_stats(c, it, s)),
      16)
```

`fix` 的语义：`s₀ = init`；若 `done(sₙ)` 为真则返回 `sₙ`，否则 `sₙ₊₁ = step(sₙ)`，最多 `max` 轮。
`done` 里重复调用的 `step` 由记忆化命中（同参同值），不会真的算两遍——**除非 pack 关掉了 memo**，
那时语义不变、只是变慢。

注意 `done` 在 `step` **之前**求值：上面的 `settle` 判的是"`s` 与 `step(s)` 是否足够接近"，
因此第一轮就是"初始 → 一轮后"的比较，不会白跑一轮。

需要「相对上一轮」的语义时，把上一轮一起放进状态（`fix` 的状态可以是元组/记录）：

```
fn settle2(c: Config, it: Item) -> Stats =
  fix((initial_stats(c, it), initial_stats(c, it)),
      |(s, _)|    (step_stats(c, it, s), s),
      |(s, prev)| close_enough(s, prev),
      16)
```

至少跑满 `n` 轮再判收敛，也是把轮数放进状态，不用加引擎参数：

```
fn settle_min(c: Config, it: Item, n: Num) -> Stats =
  let (s, _) =
    fix((initial_stats(c, it), 0.0),
        |(s, round)| (step_stats(c, it, s), round + 1.0),
        |(s, round)| round >= n && close_enough(s, step_stats(c, it, s)),
        64)
  in s
```

注意：`fix` 不保证收敛。pack 必须自己决定 `max` 与 `done`；引擎只在超限时返回错误码
（`BHC-E3xx`），不会替 pack 猜一个"差不多"的值。

### 7.3 优先级覆盖（不累加，后者胜）

```
fn effective(slots: List<Option<SlotState>>) -> Option<SlotState> =
  first_by_priority(concat_map(slots, |s| match s {
      some(x) => [x],
      none    => []
    }), |x| priority_of(x))
```

### 7.4 时间推进与事件

```
fn run_day(c: Config) -> DayState =
  simulate(seed_state(c), steps_of_day(c, 24.0), |s, t|
    let d = demand(t, s) in
    update(s, {
      charge:    s.charge + output(c, s) * 1.0 - d,
      heat:      s.heat + heat_of(c, s) - cooling(s),
      delivered: s.delivered + min(s.charge, d)
    }))

# 时间网格只是普通列表：步长、变速、事件边界都由 pack 自己拼
fn steps_of_day(c: Config, horizon: Num) -> List<Num> = window(0.0, horizon, 1.0)
fn steps_with_peaks(base: List<Num>, peaks: List<Num>) -> List<Num> =
  concat(base, peaks)                       # 事件边界插入额外采样点
```

「事件」不是引擎概念：一个事件只是「往时间网格里多插一个采样点，并让 `demand` 在区间内取另一条分支」。
没有 `event` 语句、没有 `on_tick` 钩子、没有时间轴对象。

### 7.5 搜索与敏感度

```
fn score(c: Config) -> Num = run_day(c).delivered

fn best(cands: List<Item>, base: Config) -> Config =
  hill_climb(base, slots_of(base),
             |cfg, slot, item| with_slot(cfg, slot, item),
             cands, score, 20)

fn sensitivity(base: Config, set: |Config| Config) -> Num =
  let a = score(base) in
  let b = score(set(base)) in
  (b - a) / max(abs(a), 1e-9)
```

`hill_climb` 在 `lib/search.bhl` 里，用 `fix` + `fold` 写：

```
fn hill_climb<C>(base: C, slots: List<Num>, place: |C, Num, Item| C,
              cands: List<Item>, score: |C| Num, rounds: Num) -> C =
  fix(base,
      |cfg| fold(slots, cfg, |acc, slot|
              fold(cands, acc, |best, it|
                if score(place(best, slot, it)) > score(best)
                then place(best, slot, it)
                else best)),
      |cfg| false,                      # done: 由 max 轮数控制
      rounds)
```

搜索的全部语义（接受条件、并列取舍、种子）都在这个函数里；换策略 = 换函数，不改引擎。

### 7.6 图：天赋树 + 珠宝孔（PoE 型）

```
schema Tree  { nodes: List<Node>, edges: List<Edge>, root: Num, budget: Num }
schema Node  { id: Num, kind: Sym }
schema Jewel { id: Num, mods: List<Affix>, radius: Num, condition: Sym }

# 状态 = (已访问, 当前前沿)；done 只看状态本身，因此"前沿空"就是收敛判据
fn reachable(tree: Tree, allocated: List<Num>) -> List<Num> =
  let (seen, _) =
    fix(([tree.root], [tree.root]),
        |(seen, frontier)|
          let next = filter(concat_map(frontier, |n| neighbors(n, tree)),
                            |m| any(allocated, |a| a == m)
                                && not(any(seen, |s| s == m)))
          in (concat(seen, next), next),
        |(_, frontier)| len(frontier) == 0,
        4096)
  in seen

fn legal(lay: Layout, p: Placement) -> Bool =
  any(reachable(lay.tree, lay.allocated), |s| s == p.node)
  && len(lay.allocated) <= lay.tree.budget

# 珠宝只影响半径内节点：范围是 pack 的谓词，不是引擎的
fn contribute(lay: Layout, p: Placement) -> List<Contribution> =
  let base = node_contrib(p) in
  match socket_at(lay, p) {
    none    => base,
    some(j) => concat(base,
                 concat_map(filter(lay.tree.nodes, |n| within(n, j, lay)),
                            |n| jewel_mod(j, n)))
  }
```

- `fix` 的 `done` 只看当前状态，因此**收敛判据必须写进状态**（这里把前沿一起带着，
  `frontier` 空了就停）。这是 pack 的责任，引擎不猜。
- `neighbors` / `within` / `socket_at` 都是 pack 里的普通函数；邻接表就是 `List<Edge>`。
- `bfs_defined_on(tree, allocated)` 是偏应用后的 `step` 闭包——闭包只捕获不可变值。
- 可达性检查每次 `legal` 都会重算，靠记忆化（§6.1）摊平；`tree` 在 `Layout` 里保持不变，
  哈希可复用。

### 7.7 孔 + 连线：技能宝石组

```
schema Socket { idx: Num, color: Sym }
schema Link { sockets: List<Num> }          # 连成一组的孔序列
schema Gem { id: Num, kind: Sym, color: Sym, level: Num }

# 一组内：颜色计数必须匹配；主动技至多一个；辅助宝石修饰它
fn group_contrib(cfg: Config, g: Link, gems: List<Gem>) -> List<Contribution> =
  let in_group = filter(gems, |gem| any(g.sockets, |s| s == gem.socket))
  in if not fit_colors(g, in_group) then []
     else match filter(in_group, |gem| gem.kind == sym"active") {
       []      => [],
       [act]   => map(filter(in_group, |gem| gem.kind == sym"support"),
                      |sup| support_mod(sup, act)),
       _       => []                        # 多个主动技 -> 整组失效
     }
```

**连线决定"谁修饰谁"**，而连线是数据（`Link.sockets`），不是引擎的邻接表。
"颜色不匹配就无效"也只是 `fit_colors` 返回 `Bool`。

### 7.8 拼图：形状块 + 旋转/平移

```
schema Block { id: Num, cells: List<(Num, Num)>, rotatable: Bool }
schema Placement { block: Num, rot: Num, ox: Num, oy: Num }

fn cells_at(b: Block, p: Placement) -> List<(Num, Num)> =
  map(b.cells, |(x, y)| rotate(p.rot, x + p.ox, y + p.oy))

fn legal(lay: Layout, p: Placement) -> Bool =
  let cs = cells_at(block_of(lay, p), p)
  in all(cs, |c| in_bounds(c, lay)) && not(overlaps_any(cs, lay.placements))

fn resolve(lay: Layout) -> Stats =
  fold(concat_map(filter(lay.placements, |p| legal(lay, p)),
                  |p| map(cells_at(block_of(lay, p), p), |c| cell_effect(c, lay))),
       empty_stats(),
       apply_contribution)
```

"旋转"是 `rotate(rot, x, y)` 这个 pack 函数；引擎只看到 `Num` 与 `List`。
拼图、六边形网格、异环的小拼图都是同一形态，差别只在 `cells_at` 与 `in_bounds`。

### 7.9 容量预算 + 多形态（Warframe 型）

```
schema Ecu { id: Num, drain: Num, slots: List<Num>, forms: List<Form> }

# 容量 = 基础 + 光环加成 - 消耗；超了不是错误，是"放不下"（legal=false）
fn capacity(cfg: Config) -> Num = cfg.base_capacity + cfg.aura_capacity

fn used(lay: Layout) -> Num =
  fold(concat_map(lay.equipped, |e| [e.drain]),
       0.0, |a, b| a + b)

fn legal(lay: Layout, p: Placement) -> Bool =
  used(lay) + drain_of(lay, p) <= capacity(lay.cfg)

# 灵化：同一武器有多个形态，形态切换是"选择哪个 Form"
fn weapon_stats(w: Ecu, form: Sym) -> Stats =
  fold(w.forms, empty_stats(), |acc, f|
    if f.name == form then merge(acc, f.stats) else acc)
```

"技能移植"同理：它是一个**覆盖**而不是新增——`resolve` 里后出现的 `Placement` 用
`first_by_priority` 或显式替换把原技能条目去掉；引擎不知道"技能"是什么。

### 7.10 队友交叉与光环

队友不是引擎概念，是**多个配置值一起参与求值**：

```
schema Party { members: List<Config> }

# 每个成员的属性 = 自己 + 全队施加给他的贡献（含他自己施加给自己的）
fn party_stat(party: Party, who: Num, key: Sym) -> Num =
  fold(party.members, 0.0, |acc, m|
    acc + contribution_to(m, who, key))

# 光环：持有者的一条贡献以"全队"为目标；目标集合是 pack 的谓词
fn contribution_to(src: Config, who: Num, key: Sym) -> Num =
  fold(src.sources, 0.0, |acc, s|
    if targets(s, who) then acc + value_of(s, key) else acc)
```

三种交叉关系都落在这一个函数上：

| 关系 | `targets` 的写法 |
|---|---|
| 全队（光环） | `true` |
| 仅他人（不叠加自己） | `who != src.owner` |
| 指定成员（队友 1/2） | `any(s.targets, \|t\| t == who)` |
| 条件（同元素/同武器类型） | `same_attr(src, party, who)` |

「本次仓库的 `team1`/`team2` 固定两槽」在 BHL 里就是 `members` 列表，长度不限，也不再需要
引擎支持"第 N 个队友"这种字段。

### 7.11 小结

| 游戏差异 | 表达位置 |
|---|---|
| 数据形状 | `schema` + `pack.toml` 的 `[[data]]` |
| 属性含义 | pack 自己定的类型与函数（没有 `stat` 概念） |
| 堆叠方式 | pack 的 `fold` 调用或 `lib/stack.bhl` |
| 暴击/伤害 | pack 的函数（§1.2 / §1.3 的四种写法） |
| 求值顺序 | pack 的函数调用结构 |
| 收敛策略 | `fix` 的 `done` 与 `max` |
| 时间模型 | `simulate` + `steps` 构造 |
| 最优配置 | `search` 库 + pack 的 `score` |
| 装配结构 | `Layout` + `legal` + `contribute` + `resolve`（§4.4） |
| 存档格式 | pack 的 `import_*` 函数（§4.4.1） |
| 随机词条 | 普通值 / 权重求和 / 搜索（§4.4.2） |
| 图 / 孔 / 拼图 | 邻接表、`Link`、`cells_at`（§7.6–7.8） |
| 预算 / 形态 | `legal` 里的容量判定、`Form` 列表（§7.9） |
| 队友交叉 | `Party` 列表 + `targets` 谓词（§7.10） |

## 8. 五个差异极大的 pack（同一引擎）

用于证明泛化，不只是"能跑"，而是"跑的是完全不同的数学"。

### 8.0 一个完整 pack 的全貌（约 40 行）

先看最小的完整形状：数据 + schema + 公式 + 入口 + 测试。这就是「新增一个游戏」的全部工作量。

```
packs/tabular/
  pack.toml
  lib/            # 从 stdlib vendor 来的 num.bhl / list.bhl / stack.bhl
  src/main.bhl
  tests/basic.jsonl
```

```toml
# pack.toml
id      = "tabular"
version = "0.1.0"
engine  = ">=1.0 <2"
numeric = "strict"

[[data]]
name = "items"
dataset = "modules/item.data"
schema = "Item"
key = "id"

[[data]]
name = "traits"
dataset = "modules/trait.data"
schema = "Trait"
key = "name"

[[entries]]
name = "damage"                  # 对外名字（ABI/CLI 用这个）
fn   = "damage"                  # 内部函数
args = ["Config"]                # 参数类型（供宿主与 CLI 校验，不参与计算）

[[entries]]
name = "crit_a"
fn   = "crit_a"
args = ["Num", "Num"]

[[entries]]
name = "sensitivity"
fn   = "sensitivity"
args = ["Config"]
```

```
# src/main.bhl
import stack from "lib/stack.bhl"
import num   from "lib/num.bhl"

schema Item  { id: Num, base: Num, quality: Sym, ..open }
schema Trait { name: Sym, bonus: Num, slot: Num, ..open }
schema Config { slots: List<Option<Num>>, crit_rate: Num, crit_dmg: Num, armor: Num, ..open }

# 所有函数都接收 cfg（纯函数，可直接被记忆化与敏感度复用）
fn item_at(cfg: Config, i: Num) -> Option<Item> =
  match at(cfg.slots, i) {
    some(id) => data.items.by_id(id),
    none     => none
  }

# 槽位贡献 = 装备自带加成 + 装在该槽位的词条加成，按列表顺序折叠
fn slot_bonus(cfg: Config, i: Num) -> Num =
  match item_at(cfg, i) {
    some(it) => stack.additive(
        concat([it.base],
               map(filter(data.traits.all(), |tr| tr.slot == i),
                   |tr| tr.bonus)),
        0.0),
    none => 0.0
  }

fn total_bonus(cfg: Config) -> Num =
  stack.additive(map(num.range(0.0, 6.0, 1.0), |i| slot_bonus(cfg, i)), 0.0)

# 暴击/减伤是本 pack 的语义，不属于引擎（换游戏就换这两个函数）
# 口径：暴击率超过 100% 的部分不产生额外收益
fn crit_a(rate: Num, dmg: Num) -> Num =
  1.0 + min(rate, 1.0) * (dmg - 1.0)

fn crit_multiplier(cfg: Config) -> Num = crit_a(cfg.crit_rate, cfg.crit_dmg)

fn mitigation(cfg: Config) -> Num =
  1.0 / (1.0 + cfg.armor / 300.0)

fn damage(cfg: Config) -> Num =
  let atk = 100.0 * (1.0 + total_bonus(cfg)) in
  atk * crit_multiplier(cfg) * mitigation(cfg)

fn sensitivity(cfg: Config) -> Num =
  let a     = damage(cfg) in
  let bumped = update(cfg, { crit_rate: cfg.crit_rate + 0.01 }) in
  (damage(bumped) - a) / max(abs(a), 1e-9)
```

```jsonl
# tests/basic.jsonl（假定 fixture 里 item#1021 的 base 为 0.5）
{"name":"no gear","config":{"slots":[null,null,null,null,null,null],"crit_rate":0.2,"crit_dmg":2.0,"armor":0},"call":["damage"],"expect":120.0}
{"name":"one item","config":{"slots":[1021,null,null,null,null,null],"crit_rate":0.2,"crit_dmg":2.0,"armor":300},"call":["damage"],"expect":90.0}
```

注意：这份 pack 里**没有任何引擎词**。`Item`/`Trait`/`slot`/`crit` 全部由 pack 命名；
换一个游戏，这些名字、字段、公式、甚至"有没有暴击"都换掉，引擎一行不改。
`cfg` 由宿主按 `entries` 的参数顺序传入（CLI 的 `--config`、ABI 的 `args`）。

### 8.1 五个 pack 的对照

| pack | 领域 | 装配结构 | 属性 | 结算 | 求值 | 额外 |
|---|---|---|---|---|---|---|
| `tabular` | 回合制 RPG | 定长 6 槽 | 百分比加成（加算池） | 乘法暴击 + 比例减伤 | 单趟 | — |
| `tiered` | 档位制卡牌 | 嵌套对象 + 稀有度分档 | 整数档 0~5，取最高 | 减法护甲 + 暴击溢出转暴伤 | 优先级覆盖 | — |
| `grid` | 能源网格（非游戏） | 拼图块（旋转/平移/不重叠） | 效率（乘算，递减衰减） | 无 | 24 步仿真 | 搜索最优部件组合 |
| `arboreal` | 天赋树 RPG | 图（可达性 + 点数预算）+ 珠宝孔 | 小节点加成，按分配顺序 | 比例减伤 | 单趟 | 珠宝范围条件 |
| `linked` | 孔连线的 ARPG | 孔 → 颜色 → 连线分组 | 组内辅助修饰主动技 | 暴击期望 | 单趟 | 组失效判定 |

每个 pack 的核心代码不超过 ~200 行 BHL。验收要求：

- **五个 pack 之间不得 `import` 对方的模块**（共享的只有 `lib/` 里与领域无关的部分）；
- 五种装配结构必须**全部不同**：定长 / 分档 / 拼图 / 图 / 连线；
- `arboreal` 与 `linked` 必须各自带一个 `import_from_*` 导入器（§4.4.1），
  用两份真实形状的存档 JSON 做 `pack test` 输入。

## 9. 编译与执行

### 9.1 流水线

```
.bhl 源
  ├─ lex/parse      → AST（每节点带 span）
  ├─ resolve        → 模块图、类型、schema 字段 id、符号 intern
  ├─ check          → 类型/穷尽性/有界性/无循环 import/无未声明 host
  ├─ lower          → SSA
  ├─ opt            → 常量折叠、内联、DCE（§9.3 的白名单）
  ├─ verify         → 寄存器越界、跳转目标、栈深、fuel 常量合法性
  └─ emit ─┬→ CodeImage（sections + crc32 + spans）   → 解释执行（路径 B）
           └→ pack.wasm（wasm 模块 + 数据段）          → 原生执行（路径 W）
```

`buildhub build` 在作者机/CI 产出产物；`buildhub check` 只跑前四步。
**emit 只有一个前端**：两种产物来自同一份 SSA，共用同一张 `Instruction` 语义表（§9.6.2）。

### 9.2 指令集（与业务无关的机器原语）

| 组 | 指令 |
|---|---|
| 常量/移动 | `const` `mov` `sym` |
| 算术 | `add sub mul div floor_div rem neg` |
| 数值 | `min max clamp abs floor ceil round trunc round_js to_fixed sqrt pow log safe_div` |
| 比较/逻辑 | `eq ne lt le gt ge and or not` |
| 记录 | `field get_or has update mkrec` |
| 列表 | `mklist len at slice concat` |
| 调用 | `call call_clo ret` |
| 控制 | `jump jump_if_zero` |
| 边界 | `fuel` `depth_check` |
| 概率 | `choice_begin(n) choice_case(i) choice_end`（正常模式下退化，§9.8） |
| 宿主 | `host_call(cap_id, fn_id, argc)` |

没有 `query_stat`、没有 `fold_sum`、没有 `crit`。
`fold` 是**内建高阶函数**（不是专用指令）：lowering 把它展开成 `call` + `jump_if_zero` 的循环骨架，
因此字节码层不存在"折叠"这个概念，只有函数调用与跳转。

### 9.3 允许 / 禁止的变换

| 允许 | 禁止 | 原因 |
|---|---|---|
| 常量折叠（纯字面量） | 代数重结合 / 分配律 / `fma` | 改变舍入 |
| 纯函数内联（单用途） | 把 `fold` 改写成树形或并行归约 | 改变求和顺序 |
| 死代码消除 | `min/max` 交换、`a/b` 变 `a*(1/b)` | 改变位值 |
| 符号比较 → 整数比较 | 用 `f32` / fast-math / 近似超越函数 | 位级不符 |
| 记录字段 id 化 | 把 `to_fixed` 展开成乘除 | 丢舍入点 |
| 记忆化（值键，含 `fix` 内同参命中） | 假设相邻轮次状态相同而跳过 `step` 调用 | 轮次间状态不同，跳过就是错 |
| `choice` 在 `expect` 模式下的期望折叠 | 把 `choice` 的结果当常量、跨求值点复用 | 破坏"一次求值一次抽样"，相关性丢失 |
| `choice` 的 case 顺序保留 | 重排/去重 case、合并等权分支 | 改变树的形状与 label 顺序（值是等价的，但输出不稳定） |

### 9.4 数值确定性

- IEEE-754 binary64，禁用乘加融合与 fast-math；`wasm32` 与 native 位级一致。
- 超越函数默认 `libm`（跨 target 一致）；`pack.toml` 可选 `numeric = "host"` 使用平台实现，
  **仅用于与既有实现逐位对齐**。该选择写进 `CodeImage` / `pack.wasm` 头，装载期校验。
- 舍入是一等指令（`round/floor/ceil/trunc/round_js/to_fixed`），pack 显式写在公式里。
- 求和顺序由列表顺序决定（§2.3），引擎不得改动。
- **位级参考实现是路径 W**（§9.6.4）：wasm 规范要求 f64 四则运算正确舍入且不得收缩成 FMA，
  因此"跨 target 一致"在 W 上是规范保证，在 T/B 上是实现义务。
- `min` / `max` 取 **wasm 语义**（NaN 传播）；`clamp` 定义为 `min(max(x, lo), hi)`，
  NaN 同样传播。这与 Rust `f64::min` 的"返回非 NaN 操作数"不同，是实现时必须显式写的点。

### 9.5 三条执行路径

最初的提法是「输入 DSL，动态编译成可执行代码（JIT）」。在 wasm 里这件事做不到（§9.5.3 给了三条硬约束），
但 **JIT 想达到的目标**——"DSL 改动后不用改引擎、且跑得快"——可以用别的方式达成，而且更稳：

- 核心执行器是自有字节码解释器（T/B），解释本身就是"装载即可跑"；
- 再加一条**按 pack 预编译成 wasm** 的后端（W），把解释开销彻底去掉。

因此本规格里「JIT」不是一条路径，而是三选一的结果。

| 路径 | 输入 | 谁用 | 编译发生在 | 结果 |
|---|---|---|---|---|
| T | `.bhl` 源 | CLI、测试、开发 | 每次装载 | tree-walk 求值 |
| B | `.bhl` 源 → `CodeImage` | 浏览器、服务端 | 一次（作者机/CI/后端） | 字节码 VM 解释 |
| W | `.bhl` 源 → `pack.wasm` | 浏览器（性能/体积敏感） | 一次（后端） | 原生 wasm，无解释器 |

三条路径**语义必须完全一致**：对同一 pack 的同一批调用，`to_bits` 相等。
`tests/parity_backends.rs` 用五个 pack 的全语料 + 随机表达式语料跑三路交叉比对。

#### 9.5.1 什么时候用哪条

| 条件 | 选择 |
|---|---|
| 需要在浏览器里跑**多个**游戏的规则，且不愿为每个游戏发一份 wasm | B（一份引擎 wasm + 多个 `CodeImage`） |
| 单游戏、追求调用吞吐（大量搜索/敏感度） | W |
| 需要在不重新发版的前提下换规则（A/B、热修） | B（只换数据包或 `CodeImage`） |
| 需要 `buildhub explain` / `pack check` / 诊断 | T 或 B（引擎侧工具，本来就在 native） |
| 单个 wasm 内需要**装载任意新 pack**（用户自定义规则） | B；W 做不到（编译在 native 侧） |

两条浏览器路径可以并存：W 用于内置游戏，B 用于用户自带规则。选择发生在宿主集成层，
不在 DSL 里——`pack.toml` 不需要声明自己走哪条路径。

#### 9.5.2 编译不在 wasm 里发生

`W` 的编译器（解析/检查/SSA/wasm 发射）**只跑在 native**：CLI、CI 或后端服务。
wasm 里只有运行时（堆分配、值表示、JSON 边界、memo、fuel），没有 lexer/parser/checker。

这条边界是刻意的：把编译器编进 wasm 会让产物翻倍、且无法在浏览器里做真正的机器码编译
（`wasm-unsafe-eval` 只允许实例化 wasm，不允许运行时生成机器码）。既然动态编译这条路
本身走不通，"后端预编译每个游戏"就是正确解法，而不是退让。

#### 9.5.3 为什么"放宽 JIT"没有代价

最初的提法是「在 wasm 里把 DSL 动态编译成可执行代码」。它执行不了，原因是三个硬约束，
与工程量无关：

| 约束 | 事实 | 后果 |
|---|---|---|
| wasm 无 JIT | 浏览器只允许"实例化已有的 wasm 模块"（`wasm-unsafe-eval`），不允许生成机器码 | 运行时只能解释，不能编译 |
| wasm 无内存可执行权 | 线性内存不可执行；没有 `mprotect` 等价物 | 连"把字节码变成机器码再跳过去"都不成立 |
| `wasm32-unknown-unknown` 无宿主 | 无 FS / 无网络 / 无线程 / 无时间 | 装载期无法读取、无法编译外部源码 |

因此路径 B（解释）本来就是 wasm 端的性能上限；想要更快只有两条路——**预编译成 wasm**（路径 W）
或换宿主。规格选择前者。

放宽之后得到的**净收益**（不是妥协）：

| 项 | 动态编译（原设想） | 预编译 wasm（本规格） |
|---|---|---|
| 浏览器可执行性 | 不可能 | 原生 wasm，接近手写代码 |
| 确定性 | 依赖自定义 JIT 的正确性 | wasm 规范保证 f64 运算正确舍入、不收缩 FMA（§9.6.4） |
| 体积 | 需要把编译器编进 wasm（翻倍） | 只编 pack 可达函数，DCE 后典型 ≤ 80 KB |
| 调试 | 生成的机器码难以对应源码 | 有 span 可映射；`wasm-tools` 可直接看 |
| 安全边界 | 自生成代码需自建沙箱 | wasm 验证器提供沙箱 |
| 发布 | 运行时编译，冷启动不可控 | CI 预编译，冷启动是实例化（毫秒级） |

唯一代价是**发布流程**：改规则要重跑 CI 并重新分发 wasm。这不构成问题，因为
§9.5.1 保留了路径 B——需要热修或用户自带规则时走 B，只换 `CodeImage` 或数据包，不用发版。

### 9.6 wasm 后端（路径 W）

#### 9.6.1 编译范围

```
pack.wasm = 运行时（堆/值/JSON/memo/fuel）
          + 该 pack 的全部模块（含 vendor 的 lib/*.bhl）
          + 从 [[entries]] 出发做可达性裁剪后的函数
```

- **只编规则，不编数据**：JSON 数据在运行期传入（§4.2），数据更新不需要重新发 wasm。
- 从 `[[entries]]` 做 DCE：未被导出的函数、未被用到的 schema 字段访问器全部剔除，
  因此体积随 pack 代码量增长，与引擎规模无关。
- 多个 pack 可 `--bundle` 链进同一模块共享运行时（见 §9.6.5）。

#### 9.6.2 从 CodeImage 发射，不重新写一遍前端

wasm 后端复用 B 路径的全部前端（lex/parse/resolve/check/lower/opt/verify），
只在最后一步换成 wasm 发射：

```
AST → SSA → (opt) → verify ─┬→ bytecode 发射 → CodeImage   （路径 B）
                            └→ wasm 发射     → pack.wasm   （路径 W）
```

两种发射共享同一份 `Instruction` 语义表，因此"同源同义"是结构上保证的，不靠人工对齐。

#### 9.6.3 值表示与内存

```wat
;; 值 = i64：f64 位模式原样存；指针独占"负 NaN"空间
;;   数值 NaN 一律规范化为 0x7ff8_0000_0000_0000（sign=0, qNaN）——见 §9.6.4 的规范化义务
;;   指针  = 0xfff8_0000_0000_0000 | (tag << 48) | heap_index   （sign=1, qNaN）
;;   tag 1=Record 2=List 3=Sym 4=Tuple 5=Closure 6=Unit
;;   判定：sign=1 且 exp 全 1 → 指针；否则当作 f64
;;   因为所有 NaN 都被规范化成 sign=0，负 NaN 空间对数值而言永远为空，指针不与数值混淆
(memory 1)                                  ;; 运行时堆：bump 分配 + 结构共享
(func $bhub_alloc (param i32) (result i32))                 ;; 返回堆偏移
(func $bhub_call  (param i32 i32 i32 i32) (result i32))     ;; fn_id, args_ptr, args_len, out_ptr
(export "memory" (memory 0))
(export "bhub_alloc" (func $bhub_alloc))
(export "bhub_call"  (func $bhub_call))
```

- **数值运算直接映射到 wasm f64 指令**：`f64.add/sub/mul/div/neg/abs/floor/ceil/trunc/sqrt`。
  没有中间表示、没有装箱拆箱，`f64` 位模式在所有 wasm 引擎上一致。
- **NaN-boxing 必须无损**：所有会把数值写成 NaN 的路径（`0/0`、`inf - inf`、显式 `nan`）
  产出的必须是 wasm 默认的**安静 NaN**（`0x7ff8_0000_0000_0000` 为典型形式），不得携带指针 tag；
  反之，任何指针值都必须落在 NaN 空间中**不与安静 NaN 混淆**的位上。实现时必须用 §12 G10
  的往返语料验证（`nan` 值 → 存进记录 → 读回 → `to_bits` 不变）。
- `pow`/`log` 编译成**内联的 `libm` 实现**（不是 import），保证跨引擎一致（§9.4）。
- 记录/列表是不可变堆对象，`update` 产生新对象、未改字段共享——这也是 memo 哈希便宜的前提（§6.1）。
- `imports` 为空（除非 pack 声明了 host capability，§11）。
- **不用宿主栈递归**：帧是堆上的显式数组，`call` 只增帧指针；`depth` 用栈深计数检查，
  因此 wasm 的栈上限不会成为语义的一部分。

#### 9.6.4 为什么 wasm 适合做「参考目标」

| 性质 | wasm 规范 | native Rust |
|---|---|---|
| f64 四则运算 | 必须正确舍入，不得收缩为 FMA | LLVM 可能收缩（需 `-ffp-contract=off` 等） |
| f64 运算的结果位 | **数值确定，NaN 载荷不确定** | 依平台 |
| f64 → f64 函数调用 | 位级可复现 | 依赖 target 的 libm |
| 越界访问 | 必陷（trap 可捕获），不会 UB | UB |

**NaN 是唯一需要额外处理的地方**，且有两个独立问题：

1. **载荷不确定**。wasm 只规定"结果是一个 NaN"，不规定是哪一种 NaN：引擎可以返回规范 NaN
   （`0x7ff8_0000_0000_0000`）或任一算术 NaN（保留输入载荷）。因此 `0.0/0.0` 在两个浏览器里
   可能得到不同位模式。→ **规格要求：每个可能产生 NaN 的指令之后都要规范化**
   （`if (f64.ne(v, v)) then 0x7ff8_0000_0000_0000 else v`），把 NaN 收敛成唯一表示。
   代价是一次比较 + 选择，插入点为 `div`、`rem`、`sqrt`、`log`、`pow`、`min`、`max`、`clamp`、
   `to_fixed`，以及 `add`/`sub`（`inf + (-inf)`、`inf - inf` 会产生 NaN）。
   `mul` 同理（`0 × inf` 为 NaN）。**只有 `neg`/`abs` 与常量装载不需要**（不产生新 NaN）。
   这条规则同时是 NaN-boxing 的前提：指针占负 NaN 空间，只有数值 NaN 全被规范成 sign=0，
   两者才不会混淆。
2. **`min`/`max` 的语义分歧**。wasm 的 `f64.min`/`f64.max` 在 NaN 时**传播 NaN**，
   Rust 的 `f64::min` 返回**非 NaN 操作数**。规格取 wasm 语义（`clamp = min(max(x,lo),hi)`），
   B/T 内建必须显式实现同一规则，不能用 `f64::min`。
3. **舍入指令的边界**。`floor`/`ceil`/`trunc`/`round` 作用于 NaN 时返回该 NaN（wasm 已规定），
   经规范化后即为规范 NaN；`to_fixed` 在 `|x| ≥ 2^53` 或为 NaN/±inf 时必须返回 `x` 本身
   （不得尝试十进制展开），否则会与 JS 行为分叉。
4. **`-0.0` 必须保留**。`-0.0` 不是 NaN，其指数位为 0，所以「sign=1 且 exp 全 1」的指针判定
   **不会**把它误判成指针（实测：`0x8000_0000_0000_0000` 不符判据）。真实风险在别处：
   - 常量折叠时手写 `0.0` 覆盖字面量 `-0.0`；`-0.0` 与 `0.0` 在 `==` 下相等，用判等做折叠会丢符号；
   - `to_bits` 比对时 `-0.0` 与 `0.0` 位不同，golden 会因此分叉；
   - `1/(-0.0) = -inf`，若某个 pack 依赖这个符号（如符号化的加减速），丢符号就是错结果。
   因此折叠与规范化都不得用 `x == 0` 之类的判等去改写零值。

规范化之后，三路（T/B/W）在 `to_bits` 上可比；不规范化则连 W 与 W 之间都可能不等。
`§12 G10` 用"含 NaN 与 `-0` 的语料"专门守这四点。

#### 9.6.5 打包与体积

| 产物 | 内容 | 目标体积 |
|---|---|---|
| `engine.wasm`（路径 B） | lexer+parser+checker+IR+VM+data+ABI | ≤ 700 KB |
| `pack.wasm`（路径 W） | 运行时 + 单个 pack | ≤ 350 KB（典型 pack ≤ 80 KB） |
| `bundle.wasm`（路径 W，多 pack） | 运行时 + N 个 pack 共享 | ≤ 运行时 + Σpack |

`--bundle` 的价值：五个 pack 各发一份会把运行时复制五遍；链成一个模块后共享堆、memo 与 ABI，
浏览器只需实例化一次。

#### 9.6.6 边界不变

两条路径对宿主暴露的是**同一个 C ABI**（§10.2）：都是"JSON 进、JSON 出、句柄绑定线程"。
差别只在装载方式：

```js
// 路径 B：一次装载引擎，多次装载规则
const engine = await WebAssembly.instantiateStreaming(fetch("engine.wasm"));
const pkg = engine.exports.bhub_pkg_load(codeImagePtr, len);

// 路径 W：装载即含规则
const mod = await WebAssembly.instantiateStreaming(fetch("tabular.wasm"));
const out = mod.exports.bhub_call(fnId, argsPtr, argsLen, outPtr);
```

宿主侧的解码、错误码、schema 校验代码**完全共用**，不需要为两条路径写两套调用层。

### 9.7 体积与边界

| 项 | 约束 |
|---|---|
| 内核 wasm（`wasm-opt -Oz`，路径 B） | ≤ 700 KB（不含任何 pack） |
| 单 pack `CodeImage` | ≤ 2 MB；超出多半是把数据当代码 |
| 单 pack `pack.wasm` | ≤ 350 KB（含运行时） |
| `fuel` 默认 | 2,000,000 / 次顶层求值 |
| `depth` 默认 | 64 |
| `len_limit` 默认 | 65,536（列表） |
| 栈 | 无宿主栈递归；VM 用显式帧栈，wasm 侧用显式帧数组（不用宿主栈递归） |

### 9.8 概率展开（outcome tree）

#### 9.8.1 问题

数值里含概率时（暴击是否触发、Warframe 的「暴击后再升一档」），一次求值的结果不是单值而是**分布**。
现有三种做法都不够：

| 做法 | 缺陷 |
|---|---|
| 只算期望值 | 丢弃形状；用户看不到「暴击 3 档」的尾部 |
| 枚举全部组合 | 两段伤害各自暴击 → 组合爆炸；且**丢掉了相关性**（同一暴击事件被拆成两次独立抽样） |
| 只做蒙特卡洛 | 结果不确定，无法 golden 比对 |

本规格的做法：**默认算期望，可选展开成树**，并且用一条语义规则保证树不会因为相关性而爆炸。

#### 9.8.2 语义：一次求值 = 一次抽样

`choice(cases)` 的求值结果是一个**带分布的值**，不是"先挑一个值再往下算"：

- **每个分支点只抽样一次**（`choice` 的 identity 是求值位置，不是取值）；
- 同一次求值内所有引用它的地方**共享**同一次抽样；
- 下游一切运算都在**分布**上进行，不是在其期望上进行。

第二条是本功能的核心。等价说法：`choice` 像 `let`，不像函数调用。

```
# 两段伤害共用同一次暴击判定（正确：2 个叶子）
fn hit(c: Config) -> Num =
  let crit = choice([(1.0 - c.crit_rate, 1.0), (c.crit_rate, c.crit_dmg)]) in
  c.base * crit + c.base * crit

# 两次独立判定（正确：4 个叶子）
fn two_hits(c: Config) -> Num =
  c.base * choice([(1.0 - c.crit_rate, 1.0), (c.crit_rate, c.crit_dmg)])
  + c.base * choice([(1.0 - c.crit_rate, 1.0), (c.crit_rate, c.crit_dmg)])
```

两个函数长得几乎一样，但语义完全不同——这是**pack 写法的责任**，引擎不做猜测。

#### 9.8.2.1 `expect` 模式什么时候是精确的（关键）

若把 `expect` 定义为"`choice` 直接返回期望值、下游按标量算"，那么它**只在一个条件下精确**：

> **结果对每个分支点变量分别是仿射的**（affine in each branch variable separately）：
> 任何分支点变量的出现都不与另一个分支点变量相乘，也不与自身相乘。

等价地说：结果形如 `A + Σᵢ cᵢ·xᵢ`，其中 `xᵢ` 是分支点的指示变量、`A`/`cᵢ` 与 `xᵢ` 无关。
此时 `E[f] = f(E[x])`，标量代入与精确枚举给出**同一个数**（`to_bits` 相等）。

反例（同一份告警必须触发）：

```
# 乘两次 -> 二次 -> 标量代入错
let crit = choice([(0.5, 1.0), (0.35, 2.0), (0.15, 3.0)]) in
c.base * crit * crit
```

| 量 | 值 |
|---|---|
| 精确 `E[crit²]` | **3.25** |
| 标量代入 `(E[crit])²` | **2.7225** |

差 0.5275，不是浮点误差。**因此本规格的 `expect` 不是标量代入**（见 §9.8.2.2）。

#### 9.8.2.2 `expect` 的定义：支撑点传播 + 按值合并

```
Value ::= Support { (p: Num, v: Value) }     # 归一化，Σp = 1
```

- `choice` 产生一个支撑集（support）；运算在支撑集上**逐点**进行，边的概率相乘；
- **写进记录/列表的值同样携带支撑**，不是被塌缩成期望；
- `expect` 模式在**顶层出口**才求 `Σ p·v`；
- 关键优化：**按值合并**。若两个支撑点 `v` 相等，概率相加。

合并是精确的，因为求值是纯函数：**未来只取决于值本身**，不取决于怎么到达这个值。
因此合并不会改变任何结果，只是把"路径数"压成"不同取值数"。

这直接决定了有状态机制的成本（§9.8.13、§9.8.12.2）：

| 机制 | 路径数 | 合并后支撑点数 |
|---|---|---|
| 5 次暴击判定，暴击后暴击率重置 | 32 | **6** |

#### 9.8.2.3 什么时候会真的爆炸

合并帮不上忙的形状是**状态维度高且互相耦合**：支撑点数按状态组合数增长，
而不是按路径数。举例：

| 状态 | 路径数 | 合并后支撑点 |
|---|---|---|
| 单变量 `rate`（5 步） | 32 | 6 |
| `(rate, total)`（5 步） | 32 | 16 |

按 `(rate, total)` 合并仍然远小于路径数（16 < 32），因为值重复多。
真正危险的是**连续状态**（每步都把浮点累加进状态且步数多），此时几乎每个路径值都不同，
支撑点数趋近路径数——直到 `max_support` 触发尾部合并。

处置顺序：先按 §9.8.12.3 考虑能否把"输出累积量"从状态里拆出（需要因果上不回流）；
不能拆就用 `max_support` 兜底；仍不可行则由 pack 显式改用近似（`expected`）。
引擎不自动重写求和顺序，也不自动做代数重组（§9.3）。

#### 9.8.2.4 非线性环节与相关性

若下游有非线性环节（`min` 上限、档位取整、乘算叠加），共享与独立的**期望值也会分叉**。
可执行对照语料（`crit_rate=0.5, crit_dmg=2, base=1`，两段伤害之和过 `min(·, 2.5)`）：

| 写法 | 支撑点数 | 期望 |
|---|---|---|
| 共享一次 `choice` | 2（值 `2.0` / `2.5`） | **2.25** |
| 两次独立 `choice` | 4（值 `2.0`×1 / `2.5`×3） | **2.375** |

在线性相加时两者期望恰好相同（都是 `3`），所以"根值对不对"**测不出**相关性错误——
必须用支撑点数/叶子数（拓扑）测。G13 就是为此设计的。

#### 9.8.3 展开算法（与 `expect` 共用求值器）

只有**一份**求值器：它在支撑集上运算。模式只影响"出口怎么投影"和"是否记录结构"。

```
eval(expr, env):
  case choice(cases):
      ws = Σ wᵢ                       # 编译期已保证 > 0
      return Support{ (wᵢ/ws, eval(vᵢ, env)) for each case }
  case prim(a, b):
      return Support{ (pa·pb, f(va, vb)) for (pa,va) in a, (pb,vb) in b }
  case field/at/update ...:            # 结构运算逐点传播
      return Support{ (p, structop(v)) for (p, v) in inner }

normalize(s) = 按值合并: {(p₁+p₂, v) if v₁ == v₂}     # 精确，因为求值纯
```

- **`expect` 出口**：`Σ p·v`，一次。
- **`tree` 出口**：不重新求值；把求值过程中记录的 `choice` 结构按支撑路径展开成树。
- 支撑集在每一步后归一化（按值合并），因此有状态循环不会按路径数爆炸（§9.8.12.2）。

树的形状由 `choice` 的**嵌套结构**自然决定，不是二叉的：

```
# Warframe 型：暴击后再有概率升一档
fn crit_tier(c: Config) -> Num =
  choice([
    (1.0 - c.crit_rate,          1.0),
    (c.crit_rate * (1.0 - c.up), 2.0),
    (c.crit_rate * c.up,         3.0)      # 三叉，不是二叉
  ])
```

展开结果（`crit_rate=0.5, up=0.3`）：

```
crit_tier = 1.65   (期望)
├─ 1.0  p=0.500  ████████████████████
├─ 2.0  p=0.350  ██████████████
└─ 3.0  p=0.150  ██████
```

若 `choice` 出现在 `fold` 里，则每一步都产生新分支点；**但支撑点按值合并**，
所以树宽不等于路径数（§9.8.12.2 的 32 路径 → 6 支撑点）。仍然需要预算兜底。

#### 9.8.4 预算与退化

| 模式 | 求值 | 输出 |
|---|---|---|
| `expect`（默认） | 支撑集传播 + 按值合并 | 单个 `Num`（`Σ p·v`） |
| `tree(max_support)` | 同上 | 树，超预算合并尾部 |
| `tree_exact` | 同上 | 树，超预算报错 |

- **预算作用于支撑集**（`max_support`，默认 256），不是树节点数：支撑集是内存成本的真变量。
- **尾部合并**：超出预算的支撑点合并成一个 `rest` 节点，值 = 条件期望、概率 = 剩余概率和。
  用户始终拿到可渲染的树，且同层概率和恰为 1。
- `truncated: true` 标记发生合并，不静默截断。
- **`expect` 模式下无 `choice` 时零开销**：编译器证明支撑恒为 1，`Support` 退化为裸 `Num`
  （G16）。有 `choice` 时成本 = 支撑点数 × 运算数，与是否展开无关。

#### 9.8.5 输出格式

树是**值 + 边概率**，节点可带路径标签（哪个分支点走了哪支）：

```json
{
  "ok": true,
  "mode": "tree",
  "root": {
    "label": "crit_tier",
    "value": 1.65,
    "truncated": false,
    "children": [
      { "edge": 0.500, "label": "no_crit",   "value": 1.0, "children": [] },
      { "edge": 0.350, "label": "crit_t2",   "value": 2.0, "children": [] },
      { "edge": 0.150, "label": "crit_t3",   "value": 3.0, "children": [] }
    ]
  }
}
```

- `children` 是**列表**，不是 `left`/`right`——三叉、N 叉都是同一种形状。
- `edge` 是**归一化后的概率**，同一层的 `edge` 之和为 1（含 `rest`）。
- `label` 来自 `choice` 的 case 名（见 §9.8.6），缺省为序号。
- **`value` 的口径必须显式标出**（`value_kind` 字段），三选一：
  - `leaf`：叶子节点的确定值（无子节点）。
  - `cond`：该节点在其父边条件下的期望 = `Σ(子.edge × 子.value)`。
  - `uncond`：该节点的无条件期望 = `prob × cond`。

  示例中根用 `uncond`（= `expect` 模式的返回值 1.65），叶子用 `leaf`。
  内部非根节点用 `cond`，渲染层若要"贡献值"再乘 `prob`。
  不加区分会让"该显示哪个数"变成实现者的猜测。

```json
{
  "ok": true,
  "mode": "tree",
  "max_support": 256,
  "root": {
    "label": "crit_tier",
    "value": 1.65,
    "value_kind": "uncond",
    "prob": 1.0,
    "truncated": false,
    "children": [
      { "edge": 0.500, "prob": 0.500, "label": "no_crit", "value": 1.0, "value_kind": "leaf", "children": [] },
      { "edge": 0.350, "prob": 0.350, "label": "crit_t2", "value": 2.0, "value_kind": "leaf", "children": [] },
      { "edge": 0.150, "prob": 0.150, "label": "crit_t3", "value": 3.0, "value_kind": "leaf", "children": [] }
    ]
  }
}
```

- `edge` = 相对父节点的条件概率；`prob` = 从根到该节点的**累积**概率（`父.prob × edge`）。
  两个都给，避免渲染层做乘法时出错或漏乘。
- 根节点的 `value` 恒等于 `expect` 模式的返回值（G12）。

#### 9.8.6 给分支命名

`choice` 的 case 可以带名字，只影响展示，不影响计算：

```
choice([
  (1.0 - c.crit_rate,          named"no_crit", 1.0),
  (c.crit_rate * (1.0 - c.up), named"crit_t2", 2.0),
  (c.crit_rate * c.up,         named"crit_t3", 3.0)
])
```

`named"x"` 是 `Sym` 字面量的同族语法糖，只在 `choice` 里有意义。
不带名字时用 `#0`/`#1`/`#2` 作 label；引擎不生成任何人类语言文案。

#### 9.8.7 与 memo 的交互

- `choice` 的**求值位置**决定分支 identity。memo 键必须包含"当前已选分支的赋值"，
  否则不同分支会命中同一缓存条目而丢失差异。
- 具体做法：memo 键 = `hash(fn_id, args, branch_env_digest)`，其中 `branch_env_digest`
  只包含该函数**可达**的分支点赋值（按 roots 顺序取相关子集）。
- `expect` 模式下 `branch_env_digest` 恒为空，memo 与不启用本功能时完全一致（G7 仍然成立）。
- **不能**把 `choice` 的结果当常量折叠掉：那会把"每次求值一次抽样"退化成"永远同一支"。

#### 9.8.8 不是蒙特卡洛

本功能是**精确枚举**（受预算约束），不是采样：同一输入同一树，可 golden 比对。
需要采样时（例如分支点上千个，超出任何合理预算），走 `host("rng.splitmix", seed)` 自己写循环，
把结果作为普通数值返回——那是 pack 的事，不是引擎的模式。

#### 9.8.9 拒绝的设计

| 备选 | 为什么不做 |
|---|---|
| **把 `expect` 实现成"`choice` 返回期望、下游按标量算"** | 只在仿射时精确；`crit` 相乘两次就错（3.25 vs 2.7225，§9.8.2.1） |
| 让 `choice` 每次调用都独立抽样 | 相关性丢失；两段伤害会算成独立事件，树规模爆炸且结果错误 |
| 隐式把中间量折成期望（"顺手优化"） | 与上一条同源：一旦塌缩，下游非线性立刻错，且错误不可见 |
| 只支持二叉 | Warframe 的暴击档位、多档稀有度天然是三叉以上 |
| 用浮点权重自动归一 | 归一化放在读取时做一次，避免长链上累积误差；且零总权必须是错误而非 NaN |
| 展开时禁用 memo | 最简单但最慢；`branch_env_digest` 方案只按可达分支切分，命中率仍然很高 |
| 把树放进正常返回信封 | 正常路径零开销是硬要求；展开走独立入口（§10.2 的 `bhub_call_tree`） |
| 引擎自动把状态与输出拆开以省支撑点 | 需要代数重写，破坏 §9.3；且拆分的合法性依赖因果（§9.8.12.3），引擎无从判断 |

#### 9.8.10 在 `fold` / `simulate` 里展开

分支点出现在循环里时，每个元素是**独立**的分支点：

```
# 10 次独立触发判定：路径数 2^10
fn ten_procs(c: Config) -> Num =
  fold(range(0.0, 10.0, 1.0), 0.0,
       |acc, _| acc + choice([(1.0 - c.rate, 0.0), (c.rate, c.dmg)]))
```

若语义上**整段只判定一次**（例如"这个 debuff 整场战斗只触发一次"），
就把 `choice` 提到循环外：

```
fn ten_procs_shared(c: Config) -> Num =
  let proc = choice([(1.0 - c.rate, 0.0), (c.rate, c.dmg)]) in
  fold(range(0.0, 10.0, 1.0), 0.0, |acc, _| acc + proc)
```

两者都只写一次 `choice`，语义不同，**但支撑点都不爆炸**：
`ten_procs` 的累积量是"触发次数 × `c.dmg`"，不同路径的取值只有 11 种，
按值合并后是 11 个支撑点（不是 `2^10`）；`ten_procs_shared` 是 2 个。
**路径数与支撑点数是两个概念**（§9.8.2.2）——这正是支撑集传播相对"枚举路径"的价值。

`simulate`（§7.4）同理：`choice` 在 `step` 里 = 每步独立；提到 `simulate` 外 = 整场一次。
但在 `simulate` 里状态往往是多维的，合并效果取决于状态空间大小，必须靠 `max_support` 兜底。

#### 9.8.11 与 `expect` 模式的一致性要求

`expect` 是**同一分布的一次投影**，不是"另一套算法"：

```
expect(f, args) = 支撑点上的 Σ(p × v)          # 顶层出口处求一次
```

两条路径必须位级相同（G12）。实现上**必须只写一份求值器**：

- 求值器在**支撑集**上运算（§9.8.2.2），`choice` 产生支撑、运算逐点传播、按值合并；
- `expect` 模式在**顶层出口**做一次 `Σ p·v`，不做别的；
- `tree` 模式在**同一个求值器**上额外记录分支树，不重新求值。

因此不存在"两种求和顺序"，G12 是结构保证而非事后对齐。
`tree` 节点的 `cond`（条件期望）由子树按 `p` 加权求得，可能与非出口路径的舍入略有差异，
所以 G12 只约束 `root.value` 与 `call` 相同——**`cond` 不参与位级比对**。

#### 9.8.12 有状态的条件加成（"未暴击则加暴击率、暴击后清空"）

这是最容易被写错的一类机制，而且它**即使不展开概率也必须正确**。规格的处置分三种情形。

##### 9.8.12.1 形态一：条件加成，结果仿射 → `expect` 精确

"暴击时才生效的加成"是 `x` 的一次函数，所以标量代入精确：

```
fn damage(c: Config) -> Num =
  let crit = choice([(1.0 - c.rate, 0.0), (c.rate, 1.0)]) in
  c.base * (1.0 + crit * (c.crit_dmg - 1.0)) + crit * c.on_crit_bonus
```

验算（`base=1, crit_dmg=2, on_crit_bonus=0.5, rate=0.5`）：精确 `E = 1.75`，与标量代入一致。
**这类机制用 §9.8.2.2 的支撑集传播自然正确，不需要 `tree`。**

##### 9.8.12.2 形态二：状态随结果改变（重置/累积）→ 必须按状态合并

"未暴击时暴击率 +10%，暴击后清空"是 **Markov 状态**：下一步的概率依赖上一步的结果。

```
fn hit_chain(c: Config, n: Num) -> Num =
  fold(range(0.0, n, 1.0), (c.base_rate, 0.0), |(rate, dmg), _|
    let crit = choice([(1.0 - rate, 0.0), (rate, 1.0)]) in
    (if crit == 1.0 then c.base_rate else min(rate + c.step, 1.0),
     dmg + c.base * (1.0 + crit * (c.crit_dmg - 1.0))))
  |> at(1)
```

关键点：**状态（`rate`）必须作为 `fold` 的累积量**，不能作为外部变量。
否则"每步独立"与"状态继承"会混淆（§9.8.2 的位置即语义）。

验算（`base_rate=0.5, step=0.1, cap=1.0, n=5, 命中伤害 未暴击=1/暴击=2`）：

| 算法 | 结果 |
|---|---|
| 精确（支撑集 + 按状态合并） | **7.74455** |
| 路径数（不合并） | 32 |
| 合并后支撑点数 | **6** |
| 均场近似（用 `E[rate]` 推进） | 7.76367（**错**，差 0.0191） |

均场近似错在 `E[f(state)] ≠ f(E[state])`——因为 `rate` 与结果相关。
**这是"把状态和累积量混在一起"的反例，也是 G15 的语料。**

##### 9.8.12.3 形态三：累积量也随路径不同 → 拆开

若把每步伤害累加进**同一个支撑值**（状态和输出混在一个元组里），支撑点会按累积伤害分裂。
实测 5 步：路径 32、按 `(rate,total)` 合并后仍是 **16** 个支撑点。

拆成两层就精确且便宜——**状态留在支撑里，输出量靠期望线性累加**：

```
# 慢：状态与输出同在一个支撑值里，合并后仍按 total 分裂
fn chain_coupled(c: Config, n: Num) -> Num =
  fold(range(0.0, n, 1.0), (c.base_rate, 0.0), |(rate, total), _|
    let crit = choice([(1.0 - rate, 0.0), (rate, 1.0)]) in
    (if crit == 1.0 then c.base_rate else min(rate + c.step, 1.0),
     total + c.base * (1.0 + crit * (c.crit_dmg - 1.0))))
  |> at(1)

# 快：状态仍在支撑里（rate 是分布），但把"本次的期望伤害"提前塌缩成标量
fn chain_split(c: Config, n: Num) -> Num =
  let (_, total) =
    fold(range(0.0, n, 1.0), (c.base_rate, 0.0), |(rate, total), _|
      let m    = 1.0 + rate * (c.crit_dmg - 1.0) in
      let next = if rate >= 1.0 then c.base_rate      # 必定暴击 -> 清空
                 else c.base_rate * rate               # 暴击 -> 清空
                      + min(rate + c.step, 1.0) * (1.0 - rate)   # 未暴击 -> +step
      in (next, total + c.base * m))
  in total
```

`chain_split` 把 `rate` 的**转移**写成对分布的显式加权（`next` 是下一轮 `rate` 的期望），
因此它其实是在做均场——实测与精确值 `7.74455` 差 `0.0191`，**不是精确解**。
正确的拆法必须让 `rate` 留在支撑里，只把 `total` 移出支撑，而这需要引擎支持
"支撑值中只含部分字段"（`Support` 内层按字段投影），本规格**不提供**该优化。

因此结论是：**形态三没有免费的精确解**。可选只有三条——

| 选择 | 代价 |
|---|---|
| 保持耦合（`chain_coupled`） | 精确，支撑点按输出量分裂；预算截断 |
| 均场近似（`chain_split`） | 快，但偏差可测（本例 0.0191）；必须在 pack 里显式标注 |
| 二分：状态支撑 + 输出分段线性 | 仅在输出对状态线性时精确；需要 pack 自己推导 |

引擎不自动做第三种——那需要代数重写，与 §9.3 的禁止项冲突。

##### 9.8.12.4 pack 契约

| 要求 | 原因 |
|---|---|
| 状态（会改变后续概率的量）必须是 `fold`/`fix` 的累积量 | 否则语义变成"每步独立"，状态继承丢失 |
| **不要**为了省事把状态换成它的期望 | 均场近似有可测偏差（本例 0.0191） |
| 累积输出量与状态量尽量分开 | 耦合时支撑点按输出分裂（32 路径 → 16 点）；拆开才能只按状态合并（→ 6 点） |
| 需要"精确但便宜"时，先把耦合版跑对再优化 | 优化前后必须用 `expect` 对账（G15③） |
| 显式近似用 `expected(x)` 包一层 | 引擎从不隐式塌缩；这样近似在源码里可见、可审计 |

`expected(x)` 是"我确实只要期望、并且知道自己在做近似"的**显式**逃生口。
引擎永远不隐式调用它——隐式塌缩正是 §9.8.2.1 反例失败的根源。

#### 9.8.13 性能

| 模式 | 成本 |
|---|---|
| `expect` | 支撑点数 × 每步运算；**按值合并后**通常是个位数 |
| `expect`，无 `choice` | 与不使用本功能完全一致（编译器可证明支撑恒为 1） |
| `tree`，k 个互不嵌套的分支点、每个 b 支 | `O(b^k)`，受 `max_support` 截断 |
| `tree`，`fold` 内 n 个独立分支点 | 同上，`b^n`；唯一的爆炸形状 |

“无 `choice` 时零开销”是硬要求：静态可判定时，`Support` 类型在 IR 里退化为裸 `Num`，
不产生任何装箱或概率乘法（G16）。

### 9.9 时序仿真与 trace

#### 9.9.1 为什么 `simulate` 不够

§7.4 的 `simulate` 只产出**终态**（`fold` 的最后一项）。要做"每时刻输出曲线 + 区间上下界"，
需要的是**逐帧记录**，不是终态。两者不能互相替代：

| 需求 | 终态 `simulate` | `trace` |
|---|---|---|
| 总输出 | ✅ | ✅（`summary`） |
| 每帧输出曲线 | ❌ | ✅（`strip`） |
| 累计曲线 / DPS | ❌ | ✅（`cumulative`） |
| 上下界带 | ❌ | ✅（`bounds`） |
| 维度拆分 | 可手搓但会污染状态 | ✅（`per_dim`） |

因此 `trace` 是**求值器上的一层观察**，不是新语义：它按 pack 给定的时间网格推进状态，
每步把"要记录的量"取出来，其余计算与普通 `fold` 完全一致。

#### 9.9.2 定义

```
trace(s0,       # 初始 SimState（pack 定义）
      steps,    # 时间网格 List<Num>（pack 构造，§9.9.13）
      step,     # |SimState, Num| SimState
      probe,    # |SimState| Sample
      opts)     # mode / max_support / split / quantile
```

- `step` 推进状态，与 `simulate` 的 `step` 签名相同（可直接复用）；
- `probe` 抽取"要向用户展示的量"，与状态分离——**状态里有什么由 pack 决定，展示什么也由 pack 决定**；
- 引擎不认识 `hp`、`armor`、`dot`、`crit`；它只知道"按列表推进 + 每步取一个 `Sample`"。

`probe` 返回的 `Sample` 是一个**由 pack 声明的记录**：

```
schema Sample {
  total:   Num                  # 本步总输出（必填）
  per_dim: Record{..open}       # 维度 → 本步输出（§9.9.9）
  state:   Record{..open}       # 想画在副轴上的状态量（hp、层数、倒地剩余）
  ..open
}
```

#### 9.9.3 三种模式

| 模式 | 每帧输出 | 用途 |
|---|---|---|
| `expect`（默认） | 每帧一个确定值 | 快速数值对比 |
| `trace`（分布） | 每帧 `mean` + `lo`/`hi` | 图表带宽 |
| `trace_tree` | 上述 + `branches` 统计 | 需要知道"是否可能是极值" |

三者在同一个求值器上跑（§9.8.11），差别只在"每帧怎么投影"。
`trace` 不产生完整树——完整树在 §9.8 是单次求值的产物，跨 `frames` 帧会变成
`frames × leaves`，既无法渲染也无法传输（§9.9.15）。

#### 9.9.4 怪物状态由 pack 定义（不是单一数值）

"怪物"不是引擎概念，更不是"一个 hp 数字"。真实游戏的怪物状态是一张**pack 定义的记录**，
不同游戏字段完全不同：

| 游戏 | 怪物状态字段 | 交互 |
|---|---|---|
| 本仓库 | `hp` `shield` | 护盾优先扣血、破盾后打血 |
| Warframe | `hp` `shield` `armor` `status_procs[]` | 腐蚀扣护甲、病毒放大直伤、护甲减伤曲线 |
| 原神 | `hp` `resistance{}` `elemental_aura` `poise` | 元素附着、反应消耗、韧性条 |
| 通用 ARPG | `hp` `resist{}` `cc_remaining` `knocked` | 控制时长、倒地增伤 |

因此规格只要求一件事：**怪物状态是 `SimState` 里的一个 pack 定义字段**，
且**可写**（每步都可能被自己的效果改写）。

```
schema Target {
  level:    Num                 # 等级（等级减伤/等级差修正都要它）
  hp:       Num
  shield:   Num
  def:      Num                 # 防御；本仓库是 def，Warframe 叫 armor
  resist:   Record{..open}      # 元素/类型 → 抗性
  procs:    List<Proc>          # 状态异常层数与剩余时间
  cc:       Num                 # 控制剩余时长
  knocked:  Bool                # 是否倒地（处决条件）
  ..open                        # 韧性、元素附着、护盾类型……都由 pack 加
}
```

`level` 必须进状态：本仓库的减伤同时依赖**怪物等级**（≥200 的高等级乘区）与**等级差**
（`clamp(min(80,enemy) - char, 0, 20)`），两者都不在 `hp`/`def` 里。

`Target` 完全由 pack 声明，引擎只当普通记录（§4.1 的 `schema`）。要有多少属性、
哪些属性参与减伤，全部写在 pack 的 `mitigation` / `apply_status` 里。

同一份引擎，三个 pack 的 `Target` 可以毫无共同字段：

```
# Warframe 风格：护甲 + 状态异常层数
schema Target { hp: Num, shield: Num, armor: Num, procs: List<Proc> }
schema Proc  { kind: Sym, stacks: Num, remaining: Num }
fn mitigation(t: Target) -> Num = t.armor / (t.armor + 300.0)
fn apply_status(t: Target, p: Proc) -> Target =
  update(t, { procs: upsert_proc(t.procs, p) })       # 叠层/刷新由 pack 决定

# 原神风格：元素附着 + 抗性 + 韧性
schema Target { hp: Num, res: Record{..open}, aura: Option<Sym>, poise: Num }
schema Aura  { element: Sym, gauge: Num }
fn mitigation(t: Target, elem: Sym) -> Num = get_or(field(t.res, elem), 0.1)
fn react(t: Target, elem: Sym) -> Target =
  match t.aura {
    none            => update(t, { aura: some(Aura{element: elem, gauge: 1.0}) }),
    some(a) => if a.element == elem
               then update(t, { aura: some(update(a, { gauge: min(a.gauge + 1.0, 2.0) })) })
               else update(t, { aura: none })            # 反应消耗附着
  }

# 本仓库风格：hp + shield，无护甲
schema Target { hp: Num, shield: Num }
fn mitigation(t: Target) -> Num = 0.0
```

三者共享的只有 `hp` 这个名字，且连它都不是强制的——引擎不读任何字段（§2.2）。

#### 9.9.4.1 为什么不能在引擎里建模

若引擎提供 `Target { hp, armor, resist }`，原神的"元素附着计时"、Warframe 的
"异常层数独立衰减"、"韧性条分段"就都得靠特例往外挂。而这些恰恰是**决定伤害曲线形状**的量，
不是可选装饰。因此：**属性集合 = pack 数据，交互 = pack 函数**，与 §4.4 的装配同构。

#### 9.9.5 双向交互

仿真不是"角色 → 怪物"单向的。四类交互都必须能表达：

| 方向 | 例子 | 写法 |
|---|---|---|
| 角色 → 怪物 | 扣血、削甲、上状态 | `step` 里改写 `target` |
| 怪物 → 角色 | 反弹、抗性影响输出 | `probe`/`step` 读 `target.resist` |
| 怪物 → 怪物 | DoT tick、状态扩散 | 在 `pending` 里排程（§9.9.11） |
| 状态 → 概率 | 暴击率被 debuff 改变 | `rate` 是 `SimState` 的字段，`choice` 读它（§9.8.12） |

最后一行是关键：**状态可以影响概率**。因此 `target` 与 `actor` 必须与支撑集一起推进
（§9.9.7），不能先算概率再算状态。

#### 9.9.6 引擎侧只有 `trace` 一个原语

```
trace(s0, steps, step, probe, opts) -> TraceResult
```

与 `simulate` 的关系：`simulate(s0, steps, step)` **等价于**
`trace(s0, steps, step, |s| s, expect).last.state`。引擎可以只实现 `trace`，
把 `simulate` 作为库函数写在 `lib/sim.bhl`（§5）——它不需要独立语义。

#### 9.9.7 与 `choice` / 支撑集的交互

`trace` 与 §9.8 **共用同一个求值器**，因此：

| 组合 | 行为 |
|---|---|
| 无 `choice` 的 pack | 每帧一个确定值，`p10/p90 = value`，零额外开销（G17 仍成立） |
| `expect` + 有 `choice` | 每帧给出**支撑集**（或已投影的均值，取决于 `detail`） |
| `tree` + 有 `choice` | 每帧支撑点对应树叶子；`branches` 给出总路径数，支撑点数给出合并后规模 |
| 跨帧相关 | 支撑集**跨帧保留**，第 2 帧的概率是"第 1 帧分支下的条件概率"，不是重新抽样 |

跨帧相关这条是必须的：暴击率被 debuff 改变后，第 2 帧的分布依赖第 1 帧走过哪条路。
若每帧重新独立抽样，`cumulative` 的期望会与该 pack 的标量版本不一致（G19 检测）。

#### 9.9.8 上下界与期望的关系

对同一维度、同一帧：

```
lo(quantile) ≤ value ≤ hi(quantile)          # 支撑集的最小/最大值
lo(quantile) ≤ mean ≤ hi(quantile)           # 均值必在支撑区间内
lo ≤ hi                                      # 单调性
```

`quantile` 模式给出的是**分布的分位**，不是"最坏情况"：`p10` 表示"有 10% 的路径低于它"。
"绝对最坏"用 `min`/`max`（`quantile: none` 时同时给 `min`/`max` 字段）。

三者的用途不同：

| 字段 | 用途 |
|---|---|
| `mean` | 数值对比、DPS 计算 |
| `lo`/`hi`（分位） | 图表带宽、置信区间 |
| `min`/`max` | 极值检查（"是否可能一击必杀"） |

#### 9.9.9 维度拆分

`dimensions` 是 pack 定义的维度名列表，每个 `Sample` 必须为每个维度给出一个值。
典型拆分（顺序固定，保证图表横轴一致）：

| 维度 | 含义 | 例子 |
|---|---|---|
| `direct` | 直击（命中当次） | 普攻、技能直伤 |
| `dot` | 持续伤害 | 燃烧/流血/腐蚀 DoT |
| `reaction` | 机制伤害 | 元素反应、爆炸 |
| `execute` | 即死/处决 | 倒地加成、斩杀 |
| `other` | 兜底 | 未分类 |

- 维度名由 pack 声明，引擎只当 `Sym`；
- **同一步可同时计入多个维度**（如"处决"既是 `execute` 又是 `direct`），
  `per_dim` 不要求和等于 `total`；若要严格分区，pack 自己保证；
- 缺失维度必须显式写 `0`，不允许省略——否则图表会出现空洞。

这份口径必须**声明式**写进 `pack.toml`，不能靠约定：

```toml
[dimensions]
names     = ["direct", "dot", "reaction", "execute"]
partition = false          # false = 允许重叠；true = 各项之和必须 == total
```

| `partition` | `pack check` 的行为 |
|---|---|
| `true` | 静态可判定时检查各维度互斥；运行期 `trace` 断言 `Σ per_dim == total`（相对容差 `1e-9`） |
| `false` | 不检查求和，但要求 `probe` 显式给出每个维度的值（含 `0`） |

`false` 是默认值——大多数游戏的"处决""反应"与"直击""DoT"是交叉分类，强行要求分区会逼出
假的维度。要严格分区时把 `partition = true`，让 `pack check` 帮你守住。

#### 9.9.10 `SimState` 的完整形状

把 §9.9.4 的 `Target` 与角色侧放进同一个状态，由 `step` 一起更新：

```
schema SimState {
  t:       Num              # 时刻
  actor:   Record{..open}   # 角色侧（buff、层数、冷却）
  target:  Target           # 怪物侧（§9.9.4，pack 定义）
  pending: List<Event>      # 未来事件（DoT tick、buff 到期、控制结束）
  total:   Record{..open}   # 累积输出（分维度）
  ..open
}
```

具体计算（减伤、削甲、处决、即死）都是 `step` 里 pack 写的普通函数。下面用**本仓库的真实口径**做示例
（`packages/data/CharBuild.ts:2342-2366`、`crates/dob-calc-core/src/damage.rs:142-185`），
它恰好说明"为什么这些公式必须写在 pack 里"——里面有护盾特判、等级差钳制、高等级乘区三层分支：

```
# 高等级减伤乘区：怪物等级 ≥ 200 才生效
fn level_reduce_rate(enemy_level: Num) -> Num =
  if enemy_level < 200.0 then 1.0
  else 1.0 / (1.0 + (enemy_level - 190.0) * 0.05)

# 防御乘区：注意"有护盾时直接跳过防御减伤"这一特判
fn defense_multiplier(s: SimState, is_skill: Bool) -> Num =
  if s.target.shield > 0.0 then level_reduce_rate(s.target.level)
  else
    let level_diff = clamp(s.target.level.min(80.0) - s.actor.level, 0.0, 20.0) in
    let ignore = if is_skill
                 then s.actor.ignore_def + s.actor.skill_ignore_def
                 else s.actor.ignore_def in
    let def  = s.target.def * (1.0 - ignore) in
    let red  = def / (300.0 + def - level_diff * 10.0) in
    clamp((1.0 - red) * level_reduce_rate(s.target.level), 0.0, 1.0)

fn hit(s: SimState, raw: Num, is_skill: Bool) -> SimState =
  let base = raw * defense_multiplier(s, is_skill) in
  let dmg  = if s.target.knocked then base * s.actor.execute_mult else base in
  let dmg  = min(dmg, s.target.hp)                 # 即死/溢出处理
  in update(s, {
       target: update(s.target, { hp: s.target.hp - dmg }),
       total:  add_dim(s.total, dim_of(s), dmg)
     })

fn decay(s: SimState) -> SimState =
  update(s, { target: update(s.target, {
    def:   max(s.target.def * (1.0 - s.actor.shred), 0.0),
    procs: fold(s.target.procs, [], |acc, p|
             if p.remaining <= 0.0 then acc else [update(p, { remaining: p.remaining - 1.0 })] ++ acc)
  })})
```

关键点，全部是 pack 的责任而非引擎的：

| 细节 | 为什么必须由 pack 写 |
|---|---|
| **护盾 > 0 时跳过防御减伤** | 本仓库特判（`CharBuild.ts:2357`）；别的游戏没有护盾概念 |
| `level_diff` 三重钳制 `clamp(min(80,enemy) - char, 0, 20)` | 任意曲线，别的游戏完全可能不同 |
| 高等级乘区 `1/(1+(L-190)*0.05)` 且 `L<200` 时恒 1 | 阈值与斜率都是游戏私有 |
| `ignore_def` 与 `skill_ignore_def` 分开 | 技能与普攻的无视防御口径不同 |
| 最终 `clamp(·, 0, 1)` | 防止负数或超过 1 的乘区 |

**两个"减伤"必须分清**（这是容易写错的地方）：

| 名称 | 作用对象 | 本仓库用法 |
|---|---|---|
| **防御乘区** (`def/(300+def-level_diff*10)`) + **高等级乘区** | **怪物**，削减我方输出 | 进 `hit` 的伤害公式（本节上例） |
| 角色属性 `减伤` | **角色**，只用于自身 `有效生命` | `EHP = (生命/(1-防御/(300+防御)) + 护盾)/(1-减伤)`，**不参与对怪输出** |

后者在 `CharBuild.ts:1530` 只出现在有效生命里。若把它误加进输出公式，DPS 会偏低。
二者的名字都叫"减伤"，所以这一条必须由 pack 显式写清——引擎无从分辨。

**`def` 是可写状态**：`decay` 每步削减它，因此后续帧的减伤随之变化（G20）。
"倒地"既是 `Bool`（是否加成）也可能带时长，由 pack 决定怎么建模；
即死/处决的判定与计数都是 pack 的 `if` 与 `add_dim`，引擎不提供"处决"概念。

#### 9.9.11 DoT 的排程语义

DoT 不能写成"每步固定加一笔"，必须显式排程，否则会被"加速/延长/刷新"类机制打乱：

```
# 施加：往 pending 塞 tick 事件（间隔、次数、层数）
fn apply_dot(s: SimState, d: DotSpec) -> SimState =
  update(s, { pending: concat(s.pending, ticks_of(d, s.t)) })

# 每步：消费所有 t == 当前时刻的事件
fn consume(s: SimState) -> SimState =
  fold(filter(s.pending, |e| e.at <= s.t), s, |acc, e|
    let t = tick_damage(acc, e) in
    update(acc, {
      target: update(acc.target, { hp: acc.target.hp - t.dmg }),
      total:  add_dim(acc.total, sym"dot", t.dmg),
      pending: filter(acc.pending, |x| x != e)
    }))
```

- **刷新 vs 叠加**：由 `ticks_of` 与 `consume` 决定（覆盖同 id / 追加新层 / 延长到期），引擎不提供"刷新"概念；
- **加速/延长**：改 `pending` 里的 `at` 或 `count`，是普通列表操作；
- **多种 DoT 并存**：`pending` 是列表，各自独立；
- **DoT 的暴击/快照**：若游戏支持"DoT 继承施加时的暴击"，就在事件里存施加时的快照值
  （`DotSpec.snapshot`）；若不继承，`tick_damage` 用当前值。这是 pack 的选择。

#### 9.9.12 树模式的输出（区间 + 分支）

`trace` 的树模式不是"把每一帧的树都吐出来"（那是 `frames × leaves`，无法渲染）。
输出分三层。示例：`base=100`、`crit_rate=0.5`、`crit_dmg=2`，每帧 `100` 或 `200` 各半，
共 3 帧（路径数 `2³ = 8`，按值合并后支撑点 `4`：`300/400/500/600`）。

```json
{
  "ok": true,
  "mode": "trace_tree",
  "frames": 3,
  "dt": 1.0,
  "dimensions": ["direct", "dot", "reaction", "execute"],
  "partition": false,
  "summary": { "total": { "mean": 450.0, "lo": 300.0, "hi": 600.0, "min": 300.0, "max": 600.0 } },
  "strip": [
    { "t": 1.0,
      "total": { "mean": 150.0, "lo": 100.0, "hi": 200.0 },
      "per_dim": { "direct": { "mean": 150.0, "lo": 100.0, "hi": 200.0 },
                   "dot":    { "mean": 0.0, "lo": 0.0, "hi": 0.0 },
                   "reaction": { "mean": 0.0, "lo": 0.0, "hi": 0.0 },
                   "execute":  { "mean": 0.0, "lo": 0.0, "hi": 0.0 } } },
    { "t": 2.0, "total": { "mean": 150.0, "lo": 100.0, "hi": 200.0 } },
    { "t": 3.0, "total": { "mean": 150.0, "lo": 100.0, "hi": 200.0 } }
  ],
  "cumulative": [
    { "t": 1.0, "total": { "mean": 150.0, "lo": 100.0, "hi": 200.0 } },
    { "t": 2.0, "total": { "mean": 300.0, "lo": 200.0, "hi": 400.0 } },
    { "t": 3.0, "total": { "mean": 450.0, "lo": 300.0, "hi": 600.0 } }
  ],
  "bounds":  { "total": { "lo": 300.0, "hi": 600.0 } },
  "states": { "hp": { "mean": 550.0, "lo": 400.0, "hi": 700.0 } },
  "branches": { "paths": 8, "support": 4, "truncated": false }
}
```

自洽性检查（进 G21）：`cumulative` 末项 `mean` = `summary.mean` = `450`；
每帧 `lo ≤ mean ≤ hi`；`cumulative` 单调不减；`min/max` 包住所有分位。

三层的分工：

| 层 | 内容 | 图表用途 |
|---|---|---|
| `strip` | 每帧的**当帧**输出分布 | 折线图 + 每帧误差带 |
| `cumulative` | 到该帧为止的**累计**输出 | DPS 曲线、总量收敛 |
| `bounds` | 整个区间的极值 | "最坏/最好情况"标注 |
| `branches` | 路径数与合并后支撑点数 | 判断结果可信度（`truncated` 表示被预算截断） |

`per_dim` 只在请求时展开（`split: true`），否则只给 `total`——否则输出体积会按维度数倍增。

#### 9.9.13 时间网格

网格由 pack 构造（§7.4），引擎不固定步长：

```
fn steps(c: Config, horizon: Num, dt: Num) -> List<Num> = window(0.0, horizon, dt)
fn steps_with_events(base: List<Num>, events: List<Num>) -> List<Num> =
  sort_by(concat(base, events), |t| t)        # 事件边界插入采样点，保序
```

- **事件边界必须落在网格上**，否则 DoT tick 会被量化误差吞掉或重复；
- `dt` 不是常数时（变速），`strip` 的 `t` 字段就是真实时刻，图表按 `t` 而不是下标；
- 引擎只保证"按给定列表顺序推进"，不插值、不重采样。

#### 9.9.14 成本

| 模式 | 成本 |
|---|---|
| `expect`，无 `choice` | `O(frames × states_per_frame)`，与普通 `fold` 同级 |
| `expect`，有 `choice` | 支撑点数 × frames；按值合并后通常很小 |
| `tree`，`split: false` | 同上 + 每帧一次分位统计 |
| `tree`，`split: true` | × 维度数（统计成本，不是求值成本） |

分位数不要求排序整个支撑集：支撑点通常只有几十个，直接排序即可；
若 `max_support` 被调到很大，用 `quickselect`。

`trace` 不重新求值来实现 `cumulative`——它由 `strip` 前缀和得到，避免 `O(frames²)`。

#### 9.9.15 拒绝的设计

| 备选 | 为什么不做 |
|---|---|
| 让 pack 自己 `map` 出每帧状态再聚合 | 丢跨帧相关性（每帧独立求值）；且无法支持 `choice` 的树 |
| 把怪物状态当只读常量（只算角色面板） | 护甲削减、倒地时长、debuff 到期都会影响后续伤害，面板无法表达 |
| 固定 `dt` 与固定维度列表 | 变速时间轴、不同游戏的伤害分类都不同；只能是 pack 数据 |
| 只输出 mean | 图表需要带宽；且"是否有必杀可能"只能从 `max` 看出 |
| 每帧都吐完整树 | `frames × leaves` 无法渲染也无法传输；必须投影成 strip + bounds |
| 用 `O(frames²)` 重算 cumulative | 前缀和即可，且重算会引入不同的舍入 |

## 10. 接口

### 10.1 Rust API

```rust
// 装载一次；同一 Package 可被多线程共享（只读），值缓存在每次 Call 内
let pkg = buildhub::Package::load(include_bytes!("../packs/tabular/out/tabular.bhub"))?;

// 宿主 JSON → pack 声明的 Config（按 schema 校验，错误带字段路径）
let cfg = pkg.value("Config", host_json)?;

// 调用导出的函数：参数按 entries 声明的位置顺序给出
let dmg: f64 = pkg.call("damage", args![cfg.clone()])?;
let sen: f64 = pkg.call("sensitivity", args![cfg.clone()])?;

// 解释：独立求值路径，可复用同一调用内的 memo
let trace = pkg.explain("damage", args![cfg], ExplainLevel::Top)?;

// 概率展开：默认 expect 模式即 call；要形状时显式要树
let outcome = pkg.tree("crit_tier", args![cfg], TreeOptions { max_support: 256 })?;
assert_eq!(outcome.root.value, pkg.call::<f64>("crit_tier", args![cfg])?);  // G12
for child in &outcome.root.children {
    println!("{:.3}  <- {}", child.edge, child.value);
}
```

`args!` 只是 `&[Value]` 的语法便利；`call` 在运行时按 `entries` 里记录的类型签名做一次校验，
不匹配返回 `BHC-E1xx`（类型错误），不做隐式转换。

`tree` 与 `call` 共享同一份 `memo` 与同一套 `Config` 校验。两者共用同一个求值器
（§9.8.11），差别只在 `tree` 额外记录分支结构；因此 `tree` 的结果与 `call` 的根值必然一致。
**不含 `choice` 的 pack 在 `expect` 模式下零开销**（`Support` 退化为裸 `Num`，G16）。

### 10.2 C ABI（wasm / cdylib）

两条路径（§9.5）暴露**同一组导出名与同一信封**，宿主只写一份调用层：

| 导出 | 路径 B（`engine.wasm`） | 路径 W（`pack.wasm`） |
|---|---|---|
| `bhub_pkg_load(ptr,len)` | 装载 `CodeImage`，返回包句柄 | 不需要（规则已编入模块，返回固定句柄 1） |
| `bhub_pkg_info(pkg,out_len)` | 元信息 + 入口 + schema | 元信息 + 入口（schema 编进模块） |
| `bhub_json_to_value(pkg,schema,ptr,len,out_len)` | 按 schema 转 | 同左（schema id 编进模块） |
| `bhub_call(pkg,fn,args,out_len)` | 解释执行 | 原生执行 |
| `bhub_explain(pkg,fn,args,out_len)` | 记录式重放 | 同左（走同一份插桩路径） |
| `bhub_call_tree(pkg,fn,args,max_support,out_len)` | 概率展开，返回树 JSON | 同左 |
| `bhub_trace(pkg,fn,args,opts_json,out_len)` | 时序 trace，返回 §9.9.12 的 JSON | 同左 |
| `bhub_close(handle)` | 释放包 | 空操作（模块内只有一份） |

```
bhub_pkg_load(ptr, len) -> u64                 // 0 = 失败
bhub_pkg_info(pkg, out_len) -> *mut u8
bhub_json_to_value(pkg, schema_ptr, len, out_len) -> *mut u8
bhub_call(pkg, fn_ptr, args_ptr, len, out_len) -> *mut u8
bhub_explain(pkg, fn_ptr, args_ptr, len, out_len) -> *mut u8
bhub_call_tree(pkg, fn_ptr, args_ptr, len, max_support, out_len) -> *mut u8
bhub_trace(pkg, fn_ptr, args_ptr, len, opts_ptr, opts_len, out_len) -> *mut u8
bhub_close(handle)
```

`bhub_trace` 的 `opts` 是 JSON：

```json
{"mode":"trace","max_support":256,"split":true,"quantile":0.1,"states":["hp","armor"]}
```

- `mode`：`expect` / `trace` / `trace_tree`（§9.9.3）；
- `states`：额外要回传的状态量名（来自 `probe` 的 `state` 记录）；
- `split`：是否展开 `per_dim`（§9.9.9）；
- 返回体见 §9.9.12，体积与 `frames × dimensions` 成正比，**不返回完整树**。

- 统一信封 `{"ok":true,"result":…}` / `{"ok":false,"error":"…","code":"BHC-Exxx"}`。
- `out_len` 为 `*mut usize`。
- 句柄绑定创建线程（VM 内部用 `Rc`，非 `Send`）；跨线程返回错误码而非 UB。
- wasm 侧：空 imports（除 §11 声明的 capability）、无 FS/网络/线程/时间；`memory` 导出。
- **`to_bits` 不走 JSON**：JSON 无法精确表示 NaN/`-0`，位级比对通过独立的
  `bhub_call_bits(...) -> *mut u64` 返回 8 字节原始位模式，仅供测试与 golden 比对。

### 10.3 CLI

```bash
buildhub check  packs/tabular                 # 类型/模块/schema 校验 + 诊断
buildhub build  packs/tabular -o out/         # 编译 CodeImage（路径 B）
buildhub build  packs/tabular --target wasm -o out/   # 编译 pack.wasm（路径 W）
buildhub build  packs/* --target wasm --bundle out/bundle.wasm
buildhub test   packs/tabular                 # 跑 pack 内 tests/*.jsonl
buildhub eval   out/tabular.bhub --config c.json --fn damage
buildhub eval   out/tabular.wasm --config c.json --fn damage   # 同一命令跑两种产物
buildhub eval   out/tabular.bhub --config c.json --fn crit_a --args '[0.5, 2.0]'
buildhub explain out/tabular.bhub --config c.json --fn damage
buildhub tree    out/tabular.bhub --config c.json --fn crit_tier --max-support 256
buildhub tree    out/tabular.bhub --config c.json --fn crit_tier --format dot > t.dot
buildhub sim     out/tabular.bhub --config c.json --fn run --horizon 30 --dt 0.5
buildhub sim     out/tabular.bhub --config c.json --fn run --mode trace --split --states hp,armor
buildhub sim     out/tabular.bhub --config c.json --fn run --mode trace --format csv > d.csv
buildhub parity packs/tabular                 # 三路交叉比对（T/B/W）
buildhub fmt    packs/tabular
```

`buildhub tree` 支持 `--format json|dot|text`（`text` 即 §9.8.3 那种缩进 + 概率条）。
`buildhub sim` 支持 `--format json|csv|text`（`text` 是 §9.9.12 那种按帧对齐的表格），
`--horizon`/`--dt` 构造时间网格（§9.9.13），`--states` 指定要回传的状态量。

`--config` 提供的 JSON 按 `[[entries]]` 里该函数的第一个 `Config` 参数绑定；
`--args` 提供其余参数（JSON 数组，按下标对应剩余参数）。两者都不做隐式转换。

`tests/*.jsonl` 是 pack 自测语料（`call` 只列 `--args` 部分，`config` 单独给）：

```jsonl
{"name": "no gear",   "config": {"slots": [null,null,null,null,null,null], "crit_rate": 0.2, "crit_dmg": 2.0, "armor": 0},   "call": ["damage"], "expect": 120.0}
{"name": "one item",  "config": {"slots": [1021,null,null,null,null,null], "crit_rate": 0.2, "crit_dmg": 2.0, "armor": 300}, "call": ["damage"], "expect": 90.0}
{"name": "crit pure", "call": ["crit_a", 0.5, 2.0], "expect": 1.5}
```

容差由 pack 声明（`tol: {abs, rel}`），默认 `1e-9` 绝对。没有 `config` 的用例仅用于纯函数。

## 11. 扩展点

DSL 不可能表达一切（图算法、线性代数、外部服务）。出口只有两个，都显式：

```toml
[capabilities]
host = ["rng.splitmix", "graph.dijkstra"]
```

- 签名固定为纯函数：`fn(&[Value]) -> Result<Value, HostError>`，无 I/O、无全局状态。
- pack 里用 `host("graph.dijkstra", a, b)` 调用；未声明 → **装载期**报错。
- 引擎内置能力只有 `rng.splitmix`（确定性 PRNG）。
- 加能力的门槛：必须同时被两个 pack 需要，且无法用 20 行 BHL 表达。

## 12. 验收

| # | 门禁 | 判据 |
|---|---|---|
| G1 | 内核零业务词 | `src/**` 扫描 §2.2 黑名单（含 `孔/连线/天赋/拼图/预算/队友/光环`），零命中 |
| G2 | 五 pack 同引擎 | `tabular`/`tiered`/`grid`/`arboreal`/`linked` 全部通过各自 `pack test`，且互不 import |
| G2b | **装配结构互不相同** | 五个 pack 的 `Layout`/`legal` 结构两两不同（定长/分档/拼图/图/连线）；若某个 pack 的 `legal` 退化成"恒真"，说明它没在测装配抽象 |
| G2c | 导入器被覆盖 | `arboreal`/`linked` 各含 ≥1 个 `import_from_*`，用真实形状存档 JSON 跑通，错误路径（缺字段）返回 `err(Sym)` 而非 panic |
| G3 | **新游戏零 Rust 改动** | 第五至第六个 pack 的 PR 只含 `packs/**`；CI 断言 `src/**` diff 为 0 行 |
| G4 | 三路位级一致 | 随机表达式语料 + 五个 pack 全语料，T（tree）/B（字节码）/W（wasm）`to_bits` 两两相等 |
| G5 | **前后端同源** | 同一源码的 `CodeImage` 与 `pack.wasm` 由同一份 SSA 产出：`--dump-ssa` 逐字节相同；两者覆盖的 `Instruction` 集合相同 |
| G6 | 跨引擎一致 | 至少两个 wasm 运行时（V8 + Wasmtime）跑同一 `pack.wasm`，`to_bits` 相等 |
| G7 | 记忆化不改结果 | `memo=on` 与 `memo=off` 结果全等（含 fold 顺序） |
| G8 | 有界性 | 死循环风格的 pack 在 `fuel` 内返回 `BHC-E3xx`，不挂起、不 panic |
| G9 | 诊断可机读 | 编译错误全部带 `file:line:col` 与错误码，JSON 可解析 |
| G10 | **NaN 与 `-0` 不丢位** | 含 `0/0`、`inf-inf`、`0*inf`、`nan` 常量、`-0.0` 的语料：三路 `to_bits` 相等；`nan` 经记录存取后 `to_bits` 不变（NaN-boxing 往返）；`-0.0` 的符号位保持 |
| G11 | wasm 体积 | `pack.wasm`（含运行时）≤ 350 KB；五个 pack 全部达标，`--bundle` 后 ≤ 运行时 + Σpack |
| G12 | **展开与期望自洽** | 任意含 `choice` 的 pack：`tree` 根节点 `value` 与 `expect` 模式返回值 `to_bits` 相等；同层 `edge` 之和 = 1（含 `rest`） |
| G13 | **相关性正确** | 两段伤害共用一次 `choice` → 叶子数 = 2；写成两次独立 `choice` → 叶子数 = 4。两者都必须与解析式手算一致（G12 的根值同时验证） |
| G14 | **N 叉与预算** | `crit_tier` 型三叉不塌缩成二叉；`max_support` 触发时 `truncated=true` 且 `rest` 的条件期望正确 |
| G15 | **有状态条件加成** | ①仿射条件加成（暴击时加成）：`expect` 与精确枚举位级一致（1.75）；②重置型状态：5 步精确值 `7.74455`，支撑点 6（非 32）；③均场近似必须与精确值可区分（差 0.0191），且不得被引擎静默采用 |
| G16 | **非线性下 `expect` 仍精确** | `crit` 相乘两次的语料：`expect` 必须给 `3.25`（精确）而非 `2.7225`（标量代入）。这是支撑集传播与"裸标量代入"的分界线 |
| G17 | **无 `choice` 零开销** | 不含 `choice` 的 pack：产物中不出现 `Support` 相关指令；二进制与未实现本功能时逐字节相同 |
| G18 | **trace 与 simulate 自洽** | `trace(...,expect).last.state` 与 `simulate(...)` 逐位相等；`cumulative` 末项 = `summary.total.mean` 的加权约定（§9.9.8） |
| G19 | **跨帧相关性** | 第 2 帧的概率必须是"第 1 帧分支下的条件概率"：把同一 pack 的标量版（无 `choice`）与 `trace` 版对齐，均值逐帧相等；若实现错误地每帧独立重抽，G19 失败 |
| G20 | **怪物状态可写** | 用 §9.9.10 的真实口径语料（L80、`def=300`、`raw=100`、每步削 20%）：乘区 `0.5 → 0.555556 → 0.609756`，伤害 `50 → 55.555556 → 60.975610`，`hp` 末值 `1833.468835`。若 `def` 只读，三帧伤害会全是 50 |
| G21 | **上下界性质** | 每帧 `lo ≤ mean ≤ hi`、`lo ≤ hi`、`cumulative` 单调不减；`min ≤ lo`、`hi ≤ max`；分位模式下 `p10 ≤ p50 ≤ p90` |
| G22 | **维度拆分** | `split: true` 时每个请求的维度都必须出现（缺失写 `0`，不是省略）；`per_dim` 各项之和与 `total` 的关系符合 pack 声明（允许重叠时显式标注） |
| G23 | **DoT 排程** | 加速/延长/刷新三种操作后，tick 次数与总量符合手算；tick 边界必须落在网格上（§9.9.13） |
| G24 | **减伤口径保真** | 本仓库 `pack` 的 `defense_multiplier` 必须复现 §9.9.10 的精确值：`(L80, def=300, 无盾)` → `0.5`；`(同上, 有盾)` → `1.0`；`(L80, def=300, 无视防御 30%)` → `0.588235`；`(L200, 无盾)` → `0.333333`；`(L200, 有盾)` → `0.666667`；`(L80 vs 角色 L60)` → `0.25`；`(def=0)` → `1.0`。七项全对才算通过；另外角色侧 `减伤` 不得出现在输出公式里（只影响 EHP） |

G3 是本方案的核心判据：**如果加一个游戏要改 `src/`，说明语言不够通用，回到 §2 补原语，
而不是在 `src/` 里加特例。**

## 13. 与既有实现的关系

- `crates/dob-calc-core` **不是**本 crate 的超集对象，也不被依赖。它是 17.5k 行的
  "一个游戏的规则以 Rust 编写"的样本。
- 它的价值只在两处：
  1. **反例清单**：附录 A 列出它必须硬编码的机制点，用来检验 BHL 是否足够；
  2. **语料**：其夹具可作为 `packs/dna`（可选、非验收必需）的测试输入。
- 明确**不要求**数值逐位一致：那是 `packs/dna` 若存在时的 pack 级目标，与引擎无关。
- 现有 crate 继续作为线上 wasm 的提供者，替换与否是独立决策。

## 14. 实施顺序与风险

引擎是几万行的工程，必须按「每个阶段结束时有一个 pack 能跑」切片，而不是按模块切片。

| 阶段 | 交付 | 退出判据（可执行） |
|---|---|---|
| P0 | lexer/parser/AST + span + 诊断 | 解析五个 pack 的全部源码；错误带 `file:line:col` |
| P1 | tree-walking 求值 + 内建 + `fold`/`fix` | `tabular` 的 jsonl 全绿 |
| P2 | schema + `[[data]]` 绑定 + JSON→值 | `tabular` 读真实数据集；`strict` 报错可复现 |
| P3 | 类型检查 + `Option`/`Result` + 穷尽性 | 故意写错的 20 个负例全部报错且定位正确 |
| P4 | 记忆化 + fuel/depth/len | `tiered` 全绿；`memo=off` 结果一致（G7） |
| P5 | 字节码 VM + `CodeImage` 序列化 | G4 的 T/B 两路一致 |
| P6 | 装配四段式落地验证 | `grid`（拼图）+ `arboreal`（图）跑通，`legal` 非恒真（G2b） |
| P7 | 导入器 + `Party` | `linked` 全绿；两份真实存档导入 + 错误路径（G2c） |
| P8 | 引擎 wasm 构建 + C ABI | `engine.wasm` ≤ 700 KB；宿主可装载 `CodeImage` 并调用 |
| P9 | **wasm 后端（路径 W）** | `pack.wasm` ≤ 350 KB；G4 三路一致、G5 同源、G6 跨引擎、G10 NaN/`-0`、G11 体积 |
| P10 | **概率（支撑集 + 展开）** | `Support` 求值器与按值合并；G12 自洽、G13 相关性、G14 N 叉/预算、G15 有状态条件加成、G16 非线性精确、G17 零开销 |
| P11 | **时序 trace** | 每帧 `strip`/`cumulative`/`bounds`；G18–G24 全绿；减伤口径与既有实现逐项对齐；怪物状态可写 |
| P12 | explain + CLI | `buildhub explain` 输出调用树；`buildhub tree` / `buildhub sim` 三种格式；`buildhub parity` 一键跑三路比对 |

风险与处置：

| 风险 | 触发信号 | 处置 |
|---|---|---|
| **Vue/TS 侧嵌入成本被低估** | 宿主需要在 JS 里做大量值搬运 | 只暴露 JSON 边界（§10.2）；批量调用一次传数组，不逐字段过界 |
| **记忆化命中率低** | `grid` 搜索慢于预期 | 先按 §6.1 的窄参数纪律改 pack；仍不够再加键的哈希缓存，不加业务特化 |
| **`legal` 每次重算图** | `arboreal` 在搜索中大 O 爆炸 | 图不可变部分（`tree`）单独成参数，靠 memo；必要时 pack 缓存"已算过的可达集"为显式参数 |
| **数值与既有实现不一致** | 与 `dob-calc-core` 夹具对不上 | 不是目标（§13）；若需要，写 `packs/dna` 并显式指定 `numeric = "host"` 与舍入指令 |
| **语言不够用，作者要求加内建** | 出现"必须有 X 才能写" | 先写 20 行库函数；跨两个 pack 才考虑进 `lib/`；进 `src/` 需要 §12 G3 的反向证明 |
| **字节码 VM 与 tree 分叉** | G4 出现末位差异 | 双实现共享同一 `Instruction` 语义表；差异用例进回归语料 |
| **两个后端语义漂移** | G5 的 SSA dump 不同，或某指令只在一个后端实现 | SSA 是唯一真源，后端只做发射；`Instruction` 语义表由两边共同引用，新增指令必须同时实现并被 G4 覆盖 |
| **NaN 位模式在不同浏览器不同** | G6 在 V8 与 Wasmtime 上结果不一致 | 按 §9.6.4 在每个可能产生 NaN 的指令后规范化；`bhub_call_bits` 只返回规范位 |
| **NaN-boxing 与 `-0`/指针混淆** | 数值被当成指针（trap）或指针被当成 NaN | 指针独占负 NaN 空间，数值 NaN 规范化成 sign=0；判定同时检查 sign 与 exp；G10 往返语料守 |
| **`pack.wasm` 体积失控** | 超过 350 KB | 从 `[[entries]]` 做 DCE；不把数据编进代码（§9.6.1）；多 pack 用 `--bundle` 共享运行时 |
| **后端预编译带来发布负担** | 每次改规则都要重跑 CI 并重新分发 wasm | 内置游戏用 W（发布频率低）；用户自带/热修规则走 B（只换 `CodeImage`/数据包），两条路径并存（§9.5.1） |
| **树规模爆炸** | `tree` 在 `fold` 里出现 n 个独立分支点，路径数 `b^n` | 先确认支撑点是否已按值合并（线性累积通常只有 `O(n)` 个点，§9.8.10）；仍超预算再用 `max_support` + 尾部合并（`rest`） |
| **相关性被写错** | 用户报告"独立触发算成了共享"或反之 | 这是 pack 写法问题，不是引擎 bug：`choice` 的位置就是语义（§9.8.2）；用 G13 的两种写法做对照语料 |
| **`expect` 与 `tree` 根值不一致** | G12 失败 | 二者共用同一求值器，只在出口投影（§9.8.11）；不存在两套求和顺序 |
| **实现把 `expect` 写成标量代入** | G16 失败（`crit` 相乘得到 2.7225 而非 3.25） | 必须实现支撑集传播；这是唯一允许的 `expect` 定义（§9.8.2.2） |
| **支撑点随状态维度爆炸** | `simulate` 里多维状态，`max_support` 频繁触发 | 提示作者区分 Markov 状态与累积输出（§9.8.12.3）；仍不可行时显式改用近似并标注 |
| **trace 每帧独立重抽** | G19 失败：均值逐帧对不上标量版 | 支撑集必须**跨帧保留**，`choice` 的分支一旦展开就沿路径推进（§9.9.7） |
| **DoT tick 被量化吞掉** | 总量少于手算 | 事件边界必须进网格（§9.9.13）；`t` 用真实时刻而非下标 |
| **怪物状态被当成只读** | 削甲后伤害不变（G20 失败） | `target` 必须在 `SimState` 里可写；面板是快照，仿真是状态机（§9.9.10） |
| **`per_dim` 口径漂移** | 各维度之和大于 `total` 但没声明 | `pack.toml` 声明 `dims_partition`，`pack check` 校验（Q21） |
| **trace 输出体积失控** | `frames × dimensions` 过大 | 默认 `split: false` 只给 `total`；`strip` 可降采样（`--every N`），但 `cumulative` 末项必须精确 |

## 15. 未决问题

| # | 问题 | 备选 | 倾向 |
|---|---|---|---|
| Q1 | 是否允许 pack 定义宏/语法糖 | 不允许 / 受限宏 | 不允许（宏会让诊断与优化失真）；用 `fn` + 内联解决 |
| Q2 | Option/Result 是否进 VM 还是纯编译期 | 编译期 / 运行期 | 运行期（`Option<T>` 用 NaN 或标记位，`Result` 用 sum type 指针） |
| Q3 | 记录是否持久化（结构共享） | 是 / 否 | 是；记忆化哈希依赖它 |
| Q4 | 是否允许 pack 之间共享 `lib/` 而不 vendor | 允许 / vendor | vendor（版本可独立，避免一处改动掀翻所有 pack） |
| Q5 | `numeric = host` 是否允许出现在 AOT 产物 | 允许 / 禁止 | 允许但需显式声明；跨 target 一致性由 G6 排除该类 pack |
| Q6 | 解释记录是否影响性能 | 关闭零成本 / 有固定开销 | 关闭零成本：`explain` 走独立求值路径，复用 memo 结果 |
| Q7 | `legal` 恒真时是否跳过它 | 跳过 / 总调用 | 总调用（`resolve` 里显式 `filter`）；跳过会让"有装配约束"的 pack 走上不同代码路径 |
| Q8 | 装配布局是否要引擎提供索引（格子→块） | 引擎建索引 / pack 自己 `filter` | pack 自己写（§7.8 的 `overlaps_any`）；引擎建索引就得知道"格"是什么 |
| Q9 | 队友交叉是否要引擎做多配置联立 | 引擎联立 / pack 传 `Party` | pack 传列表（§7.10）；引擎联立就得知道"谁是队友" |
| Q10 | 存档导入器是否允许有副作用（读文件） | 允许 / 禁止 | 禁止：宿主读字节、pack 只做值映射，保持纯函数 |
| Q11 | 是否长期保留路径 B | 保留 / 只留 W | 保留：用户自带与热修规则必须能在不发版的情况下装载（§9.5.1） |
| Q12 | `pack.wasm` 是否共享同一运行时实例（而非 `--bundle` 链模块） | 链模块 / 共享实例 | 链模块（`--bundle`）：wasm 没有跨模块共享内存的标准方式，链模块最简单 |
| Q13 | 是否对 `pack.wasm` 做 `wasm-opt` 的激进优化（如重排浮点） | 允许 / 只用 `-Oz` | 只用 `-Oz` 之类的体积优化；任何改变浮点求值顺序的 pass 一律禁用（§9.3） |
| Q14 | 是否需要在 W 里支持 `explain` | 支持 / 仅 B 支持 | 支持，但走同一份插桩路径；若体积超标，改为"W 只返回结果，explain 回退到 B" |
| Q15 | `choice` 是否允许零权 case | 允许（忽略）/ 禁止 | 禁止：零权 case 在 `tree` 里是无意义的边，且会让"权重全零"这个错误更隐蔽 |
| Q16 | 预算上限按支撑点数还是树节点数计 | 支撑点数 / 树节点数 | 支撑点数（`max_support`）：它才是内存与求值成本的真变量；树节点只是它的投影 |
| Q17 | 是否支持"给定分支赋值"求单条路径（不展开） | 支持 / 不支持 | 支持：支撑集求值器已能按 env 求值，暴露为 `call_with_env` 可让宿主点选一条路径看明细 |
| Q18 | `expect` 与 `tree` 的求和顺序是否需一致 | 需要 / 不需要 | 不需要，而且**不可能不一致**：二者共用同一求值器（§9.8.11），只在出口投影 |
| Q19 | `trace` 是否独立于 `simulate` | 独立原语 / `simulate` 的观察层 | 观察层：`trace` 是唯一原语，`simulate` 在 `lib/sim.bhl` 里用 `trace` 实现（§9.9.6） |
| Q20 | 每帧是否允许 `max_support` 独立于单次调用 | 独立 / 共用 | 共用全局预算，但每帧各自可截断；`branches.truncated` 只要有一帧截断就为真 |
| Q21 | `per_dim` 各项之和是否必须等于 `total` | 必须 / 允许重叠 | 允许重叠（处决既是 `execute` 也是 `direct`），但 pack 必须声明 `dims_partition: true\|false`，由 `pack check` 校验口径 |
| Q22 | 状态量是否也做上下界 | 只给均值 / 也给区间 | 也给区间：怪物护甲被削的程度本身有分布，图表需要能画出状态带宽 |
| Q23 | 是否支持"事件驱动"而非固定网格推进 | 固定网格 / 事件优先队列 | 固定网格 + 事件边界插入（§9.9.13）；不引入优先队列，避免非确定性 |

## 附录 A：检验清单（来自一个真实游戏的硬编码点）

这些不是要"移植"的东西，而是**语言表达力的样本**：每一条都必须在纯 pack 层表达，
若必须改 `src/` 才做得到，说明 §2 的原语不足。

| 机制形态 | 现实现位置 | 需要的 BHL 能力 |
|---|---|---|
| 三种堆叠池并存 | `context.rs:742`、`:1007`、`:973` | `fold` + 自定义二元函数 |
| 同一属性在不同调用点用不同池语义 | `models.rs:231` vs `attributes.rs:222-227` | 池由调用方显式传列表，而非全局谓词 |
| 5 个作用域桶 + 前缀分派 | `context.rs:51`、`:66` | 由 pack 定义自己的 tag 类型 + `filter` |
| 7 项"可穿透"名单 | `context.rs:817-821` | `filter` + `concat` |
| "共享池"特例 | `context.rs:784`、`:1018` | 显式参数，而非隐式开关 |
| 上限 / 钳制散落各处 | `attributes.rs:312-315`、`:1101`、`:317-319` | `clamp` / `min` 直接写在公式里 |
| 等级曲线含分支取整 | `models.rs:1318-1322`、`:1445-1478` | 函数 + `if` |
| 条件改写 + 定点 | `context.rs:1506-1560` | `fix` |
| 逐条数据附带的代码片段 | `dynamic.rs`（1103 行 JS 子集） | 数据驱动的函数表 + `match`（见下） |
| 时间轴每事件重建状态 | `timeline.rs:1-20` | `simulate`（fold） |
| 收益 / 自动配装 | `income.rs:91-99`、`autobuild.rs:302`、`:524` | `lib/diff.bhl`、`lib/search.bhl` |
| 属性名排序影响求和末位 | `attrmap.rs:1-3`、`:169-171` | 显式 `sort_by` 决定顺序 |
| 槽位是枚举（4 个固定角色/近战/远程/同律） | `income.rs:38-41` `ModSlotKey` | `Layout` 由 pack 定义，槽是它的字段/索引（§4.4） |
| 同律槽按 `inherit` 重定向到近战/远程 | `income.rs:48-55` `resolve` | `placements_of` 里的映射函数，不是枚举分支 |
| 光环占独立槽且不占普通槽 | `config.rs:26` `aura`、`:66` `aura_mod`、`autobuild.rs:321` | 额外 `Placement` 来源；"不占普通槽"是 `legal` 的判定（§7.9） |
| 配置 A/B/C 变体各带一套槽位 | `config.rs:24-31` `ModVariant` | `List<Layout>`，选哪一份是 pack 的 `score` 决定的 |
| 固定两个队友槽 + 各自武器 | `config.rs:83-86` | `Party.members: List<Config>`（§7.10），长度不限 |
| 特效等级用 `m:` / `w:` 字符串前缀查表 | `config.rs:474`、`:483` | 键就是 `Sym`，`match` 分派；不需要前缀字符串拼接 |
| 概率被压成"覆盖率"标量，形状丢失 | `ast_eval.rs:850`、`:877`、`capi.rs:374` | `choice` + `expect` 模式；要形状时 `tree`（§9.8） |
| BUFF 覆盖率作为独立字段 | `config.rs:75`（`Option<f64>`） | 贡献值 = `value * coverage`，覆盖率是普通 `Num` 字段 |
| 护盾 > 0 时跳过防御减伤 | `CharBuild.ts:2357`、`damage.rs:157` | `if` 分支写在 `defense_multiplier` 里（§9.9.10） |
| 等级差三重钳制 | `damage.rs:169`、`CharBuild.ts:2361` | `clamp` 组合，三处边界都要显式 |
| 高等级减伤乘区（L≥200） | `damage.rs:142-148`、`CharBuild.ts:2342-2348` | `if` + 除法，阈值进 pack |
| 技能与普攻的无视防御分开 | `damage.rs:171-176` | 参数化的 `ignore`，不是两个内置开关 |
| 角色 `减伤` 只用于 EHP，不进输出 | `attributes.rs:361-363`、`CharBuild.ts:1530` | 两个同名量必须在 pack 里分开命名（§9.9.10） |
| 场景状态与事件流（每事件重建） | `timeline.rs:1-20`、`:251` | `trace` 的 `SimState` 与 `pending`（§9.9.10、§9.9.11） |
| 潜质槽位定长（`TraitSlot` 列表） | `config.rs:20-21` | `List<Placement>`，容量由 `legal` 判 |

关于"逐条数据附带逻辑"这一形态（原实现用 JS 片段）：BHL 的解法不是内嵌脚本，而是
**数据驱动的函数表**：

```
# 数据里存 "hook": "crit_overflow"，pack 里提供同名函数
fn apply_hook(name: Sym, x: Num) -> Num =
  match name {
    sym"crit_overflow" => x,
    sym"flat_bonus"    => x + 10.0,
    _                  => x              # 未知 hook：编译期可列出全部取值并强制穷尽
  }
```

`match` 对 `Sym` 的支配性检查由编译器完成：`Sym` 的取值集合在装载期从数据里 intern 得到
（`pack.toml` 可声明 `sym_domain = "from_data"`），因此能检查是否穷尽；
缺分支在 `pack check` 报错（可配置为警告）。运行期遇到未声明取值时走 `_` 分支并记一条诊断。
这比"执行数据里的代码"更安全、更可审计，也仍然支持"新增一条数据就带新逻辑"——
在 pack 里加一个分支，不进核心。

## 附录 B：术语

| 术语 | 含义 |
|---|---|
| pack | 一个游戏/领域的完整规则包（schema + data 绑定 + 模块 + 入口 + 测试） |
| CodeImage | 编译产物：字节码 + 常量 + schema 表 + spans，可序列化 |
| module | 一组函数与类型的命名空间，可 `import`，无循环 |
| schema | 数据形状（结构类型），只描述"长什么样"，不含语义 |
| entry | 对外暴露的函数/值（`pack.toml` 声明） |
| memo | 纯函数的值级缓存，键 = 函数 id + 参数结构哈希 |
| fuel | 求值预算，防不可信 pack 挂死 |
| explain | 记录式重放，展示调用树与 fold 步骤 |
| Layout | pack 定义的装配结构（列表 / 索引集 / 邻接表 / 格子占用），引擎只当普通值 |
| Placement | 一次放置（哪个候选、放到哪、带什么参数），由 pack 定义 |
| Contribution | 一次放置产生的效果条目，由 pack 定义；`resolve` 负责归约 |
| `legal` | pack 函数 `(Layout, Placement) -> Bool`；false = 忽略该放置，非错误 |
| `resolve` | pack 函数 `Layout -> Stats`；`filter(legal)` + `concat_map(contribute)` + `fold` |
| `import_*` | pack 导出的存档映射函数；引擎只做 JSON→值，不解析存档格式 |
| Party | 多份配置的列表；队友/光环交叉由 pack 的 `targets` 谓词决定 |
| `choice` | 内建「加权备择」；`expect` 模式返回期望，`tree` 模式产生分支点 |
| branch point | 一次 `choice` 求值位置；同一次求值内只抽样一次，之后共享 |
| `expect` | 默认模式：`choice` 立即折成期望，正常路径零额外开销 |
| `tree` | 展开模式：枚举分支点赋值，输出「值 + 边概率」的树（N 叉） |
| `edge` / `prob` | 边概率（相对父节点）/ 累积概率（相对根） |
| `rest` | 超预算时合并的尾节点，值为剩余部分的条件期望 |
| support / 支撑集 | `{ (p, v) }`，`Σp = 1`；`choice` 产生它，运算在它上面逐点传播 |
| 按值合并 | 两个支撑点值相等时概率相加；因为求值纯，所以精确 |
| 路径数 vs 支撑点数 | 前者是枚举组合数，后者是不同取值数；后者决定成本（§9.8.2.2） |
| 仿射（affine） | 结果对每个分支变量分别线性；只有这种情形下"标量代入"才等于精确期望 |
| `expected(x)` | 显式把分布塌缩成期望；引擎从不隐式做 |
| Markov 状态 | 影响后续概率的累积量；必须放在 `fold`/`fix` 的累积位置（§9.8.12） |
| `trace` | 时序推进入口：按 pack 给的时间网格推进状态，每帧采一个 `Sample` |
| `SimState` | pack 定义的全量仿真状态（角色 + 怪物 + 待办事件 + 累积输出） |
| `probe` | pack 函数 `SimState -> Sample`，决定每帧展示什么 |
| `Target` | pack 定义的怪物状态记录（hp/护盾/护甲/抗性/异常层数/韧性…由游戏决定） |
| `strip` | 每帧的当帧输出分布（图表折线 + 误差带） |
| `cumulative` | 到该帧为止的累计输出（前缀和，不重算） |
| `bounds` | 整个区间的极值（`min`/`max`/分位） |
| `dimensions` | pack 声明的伤害维度（直击/DoT/机制/即死…） |
| `per_dim` | 按维度拆分的每帧输出；允许重叠，由 `dims_partition` 声明口径 |
| `truncated` | 树被预算截断的标记；不静默丢弃 |
