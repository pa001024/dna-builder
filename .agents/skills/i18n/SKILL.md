---
name: i18n
description: 管理 dna-builder 的翻译文件（public/i18n/<locale>/translation.json）。当需要新增/覆盖/删除某条界面文案的翻译、按语言批量插键、查询某个 i18n 键在各语言下的值、导出与导入缺失翻译、或扫描代码里引用了但翻译文件缺失的键时使用本技能。触发场景：新增界面文案要补多语言、报「键名泄漏/界面还是中文」、i18n 检查、语言包漏翻、给某个 key 加 jp/kr/fr 译文。
---

# dna-builder i18n 工具

## Overview

所有翻译文件操作统一走 `bun i18n`（= `bun tools/i18n.ts`），取代旧的 `tools/i18n-tool.ts` 与
`tools/i18n-check.ts`。**不要**手改 `public/i18n/*/translation.json`：该文件必须整体按
`localeCompare` 排序，手工插入极易破坏顺序并在 commit 时被 hook 重排。

翻译文件共 6 个语言目录：`en` `fr` `ja` `ko` `zh-CN` `zh-TW`（`zh-CN` 是 fallbackLng）。

## When to use

- 新增界面文案，需要为多个语言补译文 / 覆盖已有译文（**默认补齐全部 6 语言、各语言书写**）。
- 查询某个 i18n 键在 6 种语言下现有值（确认是否已翻、值是否对）；可用 `--lang cn,en` 只看部分。
- 删除某个废弃键。
- 导出缺失翻译表格交给翻译、翻好后导回。
- 排查「代码里 `t("x")` 引用了但文件里没有」的漏配键。

## Commands

### add — 插入 / 覆盖（核心）

**默认一次补齐全部 6 种语言，且每种语言用该语言本身书写**（不要 6 个语言参数都塞中文原文，
否则模型会加漏或理解错意思）：

```bash
# 例：新增「生成式AI」这条文案
bun i18n add setting.generative_ai \
  -cn "生成式AI" -tw "生成式AI" -en "Generative AI" -jp "生成AI" -kr "생성형 AI" -fr "IA générative"
```

- **语言参数**用单横线短名，支持别名：`-cn/-zh` → zh-CN、`-en` → en、`-jp/-ja` → ja、
  `-kr/-ko` → ko、`-fr` → fr、`-tw/-tc` → zh-TW。也接受双横线与目录名（`--zh-CN`），
  以及 `-en=Value` 内联写法。完整别名表见 `bun i18n langs`。
- **未指定的语言不写入**，运行期由 i18next 的 `fallbackLng(zh-CN)` 回落。
- **⚠ 完整度 warning（按实际文件内容判断）**：命令结束后检查该键在 6 个语言文件里是否都有值，
  只要有一门缺就输出 `⚠ warning: 键「x」缺少 N 种语言的译文：…`。
  **只改一门语言的译文、但该键在文件里本就 6 门齐全的情况下不会告警**——所以
  「只想改中文」直接 `-cn "新值"` 即可，不会误报。
- 已存在且值相同 → 报「未变化」，不写文件；已存在但值不同 → 覆盖。
- `--dry-run` 只预览（也做完整性检查）不落盘；`--flat` 强制写顶层扁平键。

### 其他子命令

```bash
bun i18n get <key> [--lang cn,en] [--json]
                                 # 打印该键的值，默认全部 6 种语言；--lang 逗号过滤（别名可用）
bun i18n rm <key>                # 从所有语言删除该键（会清理因此变空的父命名空间）
bun i18n langs                   # 列出语言目录与全部别名
bun i18n export                  # 导出「zh-CN 有值、其它语言缺值」的键 → tools/i18n-diff.json
bun i18n import                  # 把 tools/i18n-diff.json 的译文写回并删除该文件
bun i18n check [--json] [--locale-gap]   # 扫描代码静态引用但 zh-CN 未配置的键
```

## 键的两种形式（决定 add 怎么写）

翻译文件里同时存在两类键，`add` 按 key 是否含 `.` 自动判定：

1. **顶层扁平键（中文原文）**：`"编辑": "Edit"`。游戏数据术语、属性名等。无点号 ⇒ 自动写顶层。
2. **命名空间键（英文点号）**：`char-build.*`、`database.*`、`common.*` 等界面文案。
   含 `.` ⇒ 自动按嵌套结构写入（`char-build.foo` → `{"char-build":{"foo":...}}`）。

⚠️ **新键一律优先用命名空间键**（`<模块>.snake_case`）。理由：`$t("库名.键名")` 形式会与顶层点号
扁平键冲突；纯中文原文键仅用于「游戏数据术语」这类本就以原文为键的场景。

顶层扁平键场景（前端自造展示名，直接中文做 key），**同样补齐 6 门、各语言书写**：

```bash
# 例：补「限时任务」这类上游没有、前端自己维护的展示名
bun i18n add "限时任务" \
  -cn "限时任务" -tw "限時任務" -en "Limited-time Quest" -jp "期間限定クエスト" -kr "기간 한정 퀘스트" -fr "Quête à durée limitée"
```

> ⚠️ 游戏术语（角色名 / 物品名 / 副本名等）已随数据包下发，**不要**用本工具往 `public/i18n` 塞；
> 本工具只处理界面文案命名空间键与「前端自造展示名」这两类。

## Hard rules / 坑

- **新增文案默认补齐 6 种语言，且每种用自己的语言书写**（不要 6 个参数都填中文原文）。
  漏了没关系：`add` 结束会按**实际文件内容**报 `⚠ warning` 指出缺哪几门。
- **落盘顺序 = 全文件递归 `localeCompare` 排序 + 4 空格缩进 + 结尾换行**，与
  `.husky/update-version.js` 的 `sortJson` 一致。工具已保证；**不要手工编辑该文件**。
- **不要自己拼 `writeFile`** 写翻译文件，直接用 `bun i18n add`，否则会打乱排序。
- **验证必须真跑**：`bun i18n get <key>` 看到值、`bun i18n check` 无缺失，才算完成。
- 数据包术语（角色名 / 物品名 / 副本名等）已由 `src/data/d/translations.data.ts` 随包下发，
  **不要**往 `public/i18n` 塞这类中文键（见 `.agents/docs/dev-tools.md` 的「游戏文本包」）；
  只有「上游没有的前端自造展示名」才补进来（走 `tools/import-i18n-data.ts` 的
  `SUPPLEMENTAL_TRANSLATIONS` 或直接 `bun i18n add` 顶层中文键）。
- 带插值的文案保留 `{{var}}` 占位符，`add` 会原样写入，不做转义。
- 属性名 / 属性说明由 `pnpm iattr`（`tools/import-attr-i18n.ts`）维护，不走本工具。

## 典型流程

**新增一条界面文案（6 语言都填，推荐）**

```bash
bun i18n add setting.generative_ai \
  -cn "生成式AI" -tw "生成式AI" -en "Generative AI" -jp "生成AI" -kr "생성형 AI" -fr "IA générative"
bun i18n get setting.generative_ai   # 确认 6 门都到位，无 warning
```

**只改一门语言的已有译文**（其余门保持不动，**不会 warning**，因为文件里本就齐全）

```bash
# 假如要把 setting.ai 的中文再修订一版，只给 -cn 即可，其余 5 门不受影响
bun i18n add setting.ai -cn "AI 助手"
bun i18n get setting.ai --lang cn,en # 只看关心的语言
```

**新增时只先填部分语言**（会 warning，属有意为之）

```bash
bun i18n add some-module.tip -cn "提示" -en "Tip"
# ⚠ warning: 键「some-module.tip」缺少 4 种语言的译文：fr, ja, ko, zh-TW
```

**翻译外包：导出 → 翻 → 导回**

```bash
bun i18n export                      # 得到 tools/i18n-diff.json（键 → {en,fr,ja,ko,zh-CN,zh-TW}）
# 交给翻译填值
bun i18n import                      # 写回并删除 diff 文件
```

**排查键名泄漏**

```bash
bun i18n check --locale-gap          # 主检测缺失键 + 各语言相对 zh-CN 的缺失计数
```
