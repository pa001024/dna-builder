---
name: dob-skill-creator
description: 创建 / 修改 dna-builder 的**远端下发技能**（`server/skills/<技能名>/SKILL.md`，由服务端实时打包下发给资料检索 Agent 与配装助手）。当需要新增一个给 Agent 用的领域技能（黑话表、机制读法、检索口径、判据清单…）、调整已有技能正文、或排查「技能不生效 / 描述没更新 / 下发被跳过」时使用。注意：`server/skills/`（下发库）与 `.agents/skills/`（本机 agent 技能）是两套东西，别混。
---

# 创建「远端下发技能」

## Overview

dna-builder 里有**两套技能**，职责完全不同 —— 动手前先确认你要改哪一套：

| | **下发技能**（本技能管这套） | 本机 agent 技能 |
|---|---|---|
| 位置 | `server/skills/<技能名>/SKILL.md` | `.agents/skills/<名>/SKILL.md` |
| 给谁看 | **资料检索 Agent / 配装助手**（线上模型） | 你（本机编码 agent） |
| 怎么分发 | 服务端实时打包 zip → 客户端落盘 → 模型用 `skill` 加载 | 本地直接读 |
| 内容形态 | 面向**模型**的领域知识与检索口径 | 面向**编码 agent** 的操作手册（可含脚本、命令） |
| 版本管理 | 主仓 git，改文件即改技能 | 同左 |

**判断依据**：内容主要是「跑脚本 / 执行命令 / 改仓库代码 / 访问文件系统」这类**你（本机 agent）的操作步骤**
→ 那是 `.agents/skills/`。内容主要是「一份对照表 / 一段口径 / 一套读法 / 一批判据」这类**给模型的知识**
→ 才是 `server/skills/`。

⚠️ 注意 `server/skills/` 的技能会**同时下发给两个能力面不同的 Agent**（见铁律 1）：
配装助手有 `run_code` 沙盒，资料检索 Agent 没有 —— 写正文前先想清楚这条内容服务谁。

机制细节见 `.agents/docs/agent-skills.md`；库自带说明见 `server/skills/README.md`。

---

## 三条铁律（写之前先读）

### 1. 受众是两个能力面不同的模型

下发技能同时服务**两个 Agent**，工具面**不一样**：| Agent | 独有 | 共同没有 |
|---|---|---|
| **资料检索 Agent** | 检索工具（`read_entry` / `query_module_entries` / `search_data` / `explain_damage` / `search_story` / `read_story` / `list_*` / `ask_user`，+`rag_search`） | 真实文件系统、网络 |
| **配装助手** | 检索工具 **＋ `run_code`（build 沙盒，可读当前构筑 / 查数据 / 跑计算）＋ 配装页 UI 工具** | 真实文件系统、网络 |

⇒ **一个技能要在两种能力面下都不出错。** 判断分两种：

- 内容对**两者都成立**（机制读法、口径、字段落点、对照表）→ 直接写，这是绝大多数技能该有的形态。
- 内容**只有配装助手做得到**（如「用 `run_code` 跑一段代码比较方案」）→ **必须显式限定适用方**
  （在正文里写清「这条仅适用于配装助手，资料检索 Agent 请改用 X」），否则资料检索 Agent 拿到会照做、然后失败。

⚠️ 反过来说也一样：**不要替配装助手说「你没有算力」** —— 它有 `run_code`。
技能的正文会被两个 Agent 都读到，任何「你没有 X」式的断言，只要对其中一方不成立，就是错误信息，
会干扰它对自己能力的判断。**能写的是「该用哪个工具 / 读哪个字段」，不是「你有没有某种能力」。**

自检一句话：**这条指令，两个 Agent 各自用手上的工具能完成吗？** 只有一方能 → 标明适用方。

### 2. 技能里的事实必须可验证

技能里的每个数值 / 术语 / id / 路径，都要有**明确的取数来源**——否则模型会把它当"已知事实"复述给用户，
而用户一去页面核对就对不上。

- 要引用倍率 → 指明来自 `read_entry` 的 `技能字段`（值本身必须与数据包一致）。
- 要引用机制术语 → 必须是 `技能术语解释` 的原文。
- 要引用 id / 路径 → 必须与 `query_module_entries` 返回的 `path` 一致（如 `/db/char/1101`）。
- **不要照抄 `outputs/` 里的脚本或旧稿** —— 脚本可能有错、口径可能已改，必须用下面这个工具复现一遍，
  必要时再回数据包（`src/data/d/*.data.ts`）核对。

**权威取数工具：`bun tools/agent-exec.ts`**（仓库自带，不接模型、不花 token、不联网）。
它跑的就是**线上 Agent 的工具实现** —— 同一份 `createDbRetrievalTools` 装配、同一份检索层，
所以它打印出来的就是模型会看到的那份结果。核对事实、确认字段名与工具名、判断两个 Agent 的工具面，**都以它为准**：

```bash
bun tools/agent-exec.ts --list                                             # 模型能看到哪些工具、参数叫什么
bun tools/agent-exec.ts read_entry '{"module":"mod","name":"充盈·巧力"}'   # 核对倍率 / 术语 / 投影字段名（= 模型看到的 fields）
bun tools/agent-exec.ts read_entry '{"module":"weapon","name":"血染织羽"}' # 尾部 selectableFields = fields 没覆盖、但能用 select 查的字段
bun tools/agent-exec.ts query_module_entries '{"module":"mod","keyword":"技能威力","mode":"grep"}'  # 按字段找条目
bun tools/agent-exec.ts explain_damage '{"keyword":"充盈"}'                # 机制术语与结算步骤原文
bun tools/agent-exec.ts list_data_modules --profile db     # 资料检索 Agent 的模块面（默认）
bun tools/agent-exec.ts list_data_modules --profile build  # 配装助手的检索子集（6 个模块）
```

- **技能里要写「去读 X 字段 / 用 Y 工具」之前，先用它跑一遍**，确认字段名与工具名真实存在：
  模型只能按投影读（`read_entry` 的 `fields`），`--list` 与 `selectableFields` 才是可写进技能的名字来源。
- **它读的是检索层投影，不是 `src/data/d/*.data.ts` 的原始结构**：技能里指路要写投影里的字段名
  （例：魔之楔写 `词条属性（满级）` / `效果（满级）` / `效果（1级）`，而不是数据包内部结构名）。
- **判断「这条内容服务谁」也用它**：`--profile build` 里少掉的模块（剧情、读物、NPC…）就是配装助手查不到的，
  涉及这些模块的指令必须限定适用方（见铁律 1）。
- 其他开关：`--json` 出原文便于管道（`| jq`）；`--lang en|jp|kr|fr|tc` 核对多语言口径；`--max <n>` 只截默认输出；
  `--script <file.json>` 批量、无参数进交互模式。完整用法见 `--help`。
- ⚠️ **改过 `src/utils/db-search.ts` / `src/api/agent/tools/*` 之后更要跑它** —— 技能里写的取数路径一旦失效，
  线上模型是**静默查错**的（把查不到当成没有），本地跑一遍才能发现。

### 3. 只写模型**读不到 / 推不出**的东西

技能的价值 = 它补上了模型靠自己拿不到的部分。**分两类，别写错方向**：

- **原文复述 = 冗余**（`read_entry` 直接能读）→ ❌ 不要抄进技能。
  例：机制名词的官方定义、溯源数组原文、灾厄熔炼的逐档文案、技能描述 —— 让模型自己用工具读。
  抄进技能只会：① 占上下文；② 与数据包产生**第二份事实**，版本更新后两边打架。
- **推导 / 换算 / 口径 = 该写**（工具只给散点原文，给不出结论）→ ✅ 这才是技能的主体。
  例：把「执行者掉血 5%/5 秒/30% 地板」+「`衰朽` 每 1.0 秒 10%」两条散点原文，
  **换算成「掉血上限 14%/s + 10%/s = 24%/s」** —— 数据包里没有 24 这个数，只有散点。
- **字段落点**（要拿 X 去读哪个字段）。
- **口径陷阱**（例：基础描述「每隔 3 秒」是 0 溯口径，1 溯原文「间隔降低 50%」⇒ 实际 1.5 秒该怎么算）。
- **易混淆对照**（例：专武是「无声的嘶吼」，别和常用的远程灾厄武器「血染织羽」搞混）。
- **边界**（例：资料库里没有的坐标 / 版本外的数据 → 如实说查不到，别编）。

自检一句话：**这条内容，模型用工具读得到吗？读得到就别抄；读不到的推导就留。**

---

## 创建流程

### 第 1 步 · 定名与定位

- 目录名 = **技能名**：小写 kebab-case，`^[a-z0-9][a-z0-9-]*$`，≤64 字符。
  `frontmatter` 里的 `name` 只为阅读，**清单与下发的 id 用目录名**。
- 先用一句话写下「模型什么时候该加载它」。写不出来说明还不需要单独成技能。

### 第 2 步 · 建目录与 SKILL.md

```
server/skills/<技能名>/
├── SKILL.md          # 必需，且在根级
└── references/       # 可选，按需加载的补充资料（正文里用路径引用）
```

> **索引型技能**（覆盖一大批同类条目时用，例：全角色攻略、每种武器的口径、每张地图的路线）：
> 把 `SKILL.md` 写成**索引表**（条目 → 关键字段 → 文件路径 + 「什么时候读它」），
> 细节拆进 `references/<条目名>.md`，每个条目一个文件。
> ⚠️ **文件数上限 50（含 SKILL.md）**——条目再多也要按主题合并，或把 references 也做成一层索引。
> ⚠️ 每条 references 正文里保留同一套小节标题，模型才能横向对比；条目名与 `query_module_entries` 的 `path` / `名称` 对齐，别用自己起的简称。

`SKILL.md` 的 frontmatter（**服务端只认 `---` 包裹的扁平静态键值**，不解析嵌套 / 多行块）：

```markdown
---
name: <技能名，与目录名一致便于阅读>
description: <必填，≤1024 字。写清「干什么 + 什么时候用 + 触发关键词」。这一段是模型唯一的触发依据。>
whenToUse: <可选，补充触发场景>
version: <可选，信息性版本号>
enabled: <可选，false 时清单与下载都不出>
sortOrder: <可选，数字，小者靠前>
---

# 标题

正文……
```

> ⚠️ **`description` 是触发开关**：模型就是靠它决定要不要 `skill` 加载。写含糊了技能等于不存在。
> 建议句式：「<这是什么>。当<什么场景>、<什么提问>时使用。触发词：<词1>、<词2>。」
> frontmatter 在注入模型前**会被剥掉**，所以元数据别在正文里重复描述。

### 第 3 步 · 写正文

推荐骨架（按需删减，别硬凑）：

1. **开场一句**：这个技能解决什么问题、服务于哪类提问。
2. **字段 / 工具落点**：要拿到某个信息该读哪个字段、用哪个工具（写具体名，不写「有没有能力」）。
3. **核心对照表 / 判据表**：技能的主体，越具体越好（字段名、原文、路径都写实）。
4. **常见提问 → 处理路径**：把「用户怎么问」映射到「该怎么查 / 该读哪个字段」。
5. **边界与诚实**：查不到的怎么说、不许编什么。

写作纪律：
- **术语走游戏原文**（`战技` / `终结技` / `普攻` / `武器输出` / `技能输出`），不要「E 技能 / 大招 / 平A」。
- **事实带出处口径**（哪个字段、什么等级、什么版本），别给裸数字。
- 简洁优先：模型上下文有限，一条一句能说清就别写一段。

### 第 4 步 · 校验（必做）

用**服务端同一份逻辑**跑，确保目录合法、能打包、`description` 不超限。
写到项目根 `.tmp/verify-skill.ts` 再 `bun` 跑（临时文件放 `.tmp`）：

```ts
import { readdir, readFile, stat } from "node:fs/promises"
import { join, relative } from "node:path"
import { deriveSkillMeta } from "../server/src/util/skill-source"

const ROOT = join(import.meta.dir, "..", "server", "skills")
for (const dir of await readdir(ROOT, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    const base = join(ROOT, dir.name)
    const entries: Array<{ path: string; size: number; content: Uint8Array }> = []
    const walk = async (cur: string) => {
        for (const e of await readdir(cur, { withFileTypes: true })) {
            const abs = join(cur, e.name)
            if (e.isDirectory()) { await walk(abs); continue }
            entries.push({ path: relative(base, abs).replace(/\\/g, "/"), size: (await stat(abs)).size, content: await readFile(abs) })
        }
    }
    await walk(base)
    const r = deriveSkillMeta(dir.name, entries, Date.now())
    console.log("error" in r ? `❌ ${dir.name}: ${r.error}` : `✅ ${dir.name} size=${r.meta.packageSize}B desc=${r.meta.description.length}字`)
}
```

另外必须**核对技能里的事实**：每一个数值 / id / 术语 / 路径，先用 `bun tools/agent-exec.ts` 跑一遍
（见铁律 2 的权威取数工具），确认「模型用工具确实读得到、且与你写的一致」；投影没覆盖的底层结构
再回数据包（`src/data/d/*.data.ts`）对一遍。**这是最容易省掉、也最不该省的一步**（见铁律 2）。

### 第 5 步 · 更新 README

`server/skills/README.md` 的「当前技能」表加一行（技能名 + 一句话说明）。

---

## 约束速查（`server/src/util/skill-source.ts` 的 `deriveSkillMeta`）

| 项 | 限制 |
|---|---|
| 技能名（目录名） | `^[a-z0-9][a-z0-9-]*$`，≤64 字符 |
| 描述 | **必填**，≤1024 字符 |
| 文件数 | ≤50 |
| 单文件 | ≤1MB |
| 全部文件合计 | ≤8MB |
| 根级入口 | **必须有 `SKILL.md`** |
| 忽略 | 隐藏文件（`.` 开头）、`__MACOSX` |

不合法的目录**只告警并跳过**，不影响其它技能 —— 所以「技能没出现」时，
先按上表查目录名 / `description` / 入口文件。

## 常见故障

| 现象 | 原因 |
|---|---|
| 技能不在清单里 | 目录名非法 / 缺根级 `SKILL.md` / `description` 缺失或超 1024 字 / `enabled: false` |
| 改了描述但清单没变 | 库层缓存键是「路径+大小+mtime」**指纹**，正常改文件会失效；若没生效先确认保存了文件 |
| 模型不加载技能 | `description` 没写触发场景与关键词，模型判断不出该用它 |
| 模型照做却报错 | 技能里写的指令只有另一方能做到、又没标明适用方（见铁律 1） |
| 用户核对不上数值 | 技能里的事实没回数据包核对，或抄了过期的旧稿（见铁律 2） |
| 技能里的字段名 / 工具名模型用不了 | 照着数据包原始结构或旧稿写的，没先用 `bun tools/agent-exec.ts` 校对投影里的真实名字（见铁律 2） |
| 目录内容变了但拿到的还是旧包 | 客户端按清单 `sha` 内容寻址缓存；确认服务端已重扫（改文件即时生效），必要时让客户端重新拉清单 |

## 反例（别这么写）

```
❌ 先跑 .tmp/recalc.ts 复现线上构筑，逐项消融后交付可导入 BD JSON。
   → 这条只有配装助手（有 run_code）做得到；没标明适用方，资料检索 Agent 会照做然后失败。

❌ 你没有代码执行能力，不要算数值。
   → 对配装助手不成立（它有 run_code）。技能正文两个 Agent 都读，别写这种「你没有 X」的断言。

❌ [执行者]状态中，[潜入夜色]替换为[暗影奔袭]，每隔 3 秒转化攻击力……
   → 原文复述：read_entry 的「技能术语解释」直接能读到，抄进技能只是多一份会过期的事实。

❌ 角色强度 T0，属克下 66 亿，建议抽取。
   → 裸结论：数值会随版本失效，且没有取数来源可核对。

❌ 详细步骤见 charbuild-dps-ablation 技能。
   → 那是本机 agent 技能，不在下发给模型的库里面，模型根本读不到。

❌ 「魔之楔的 `词条属性` 里能查到充盈威力 +300%」
   → 字段名凭印象写的。先用 bun tools/agent-exec.ts read_entry '{"module":"mod","name":"充盈·巧力"}' 核对：
     投影里的名字是 `词条属性（满级）`（带等级后缀），另外 `selectableFields` 里才出现 `充盈威力`。

```
