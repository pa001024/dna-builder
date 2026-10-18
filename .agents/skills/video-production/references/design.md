# 画面设计：用 victor-design 管视频的视觉

画面不是「写几个 CSS 动画」，而是一次有证据的视觉设计。**动笔写 composition 之前**先过 `/victor-design`（dna-builder 的 `.agents/skills/victor-design/SKILL.md`），产出 `BRIEF.md` 与 `frame.md` 到**视频仓库当前分支根目录**（模板已放好骨架，填内容即可）。

## 1. 两个前置文件

**`BRIEF.md`** —— 决定这片子是什么（frontmatter + 简短正文）：

```yaml
---
workflow: general-video
flow: automation          # 全自动产出；co-create 用 companion
storyboard: no
message: "一句话结论（观众只记住这一句）"
destination: bilibili
aspect: 1920x1080
language: zh
audience: 二重螺旋玩家
length: 229s
angle: data-explainer
---
```

正文只写四段：`## Intent`（为什么做、切入角度）、`## Assets`（本地素材清单，逐条写清是什么，并注明来源/口径）、`## Customizations`（用户明确要求或明确禁止的东西）、`## Notes`（口径、易误解点、不许出现的内容）。

**`frame.md`** —— 决定这片子长什么样：

| 章节 | 必须回答 |
| --- | --- |
| `## Concept` | 整片用一个什么隐喻/阅读方式（例：「帐要对上」= 观众在读对账单） |
| `## Palette` | 每色一个 token + hex + **语义**（金 = 新/收益，钢灰 = 旧/作废，alarm = 代价） |
| `## Type` | 中文/数字各自用哪个字体、字号层级、字重、字距（正文下限 22px @1080p） |
| `## Layout` | 画布、安全边距（本仓 96px）、每帧的分区策略 |
| `## Decoratives` | 每帧 2–3 个装饰，各带缓慢呼吸，写清动因 |
| `## Motion` | 每个节拍的进入方式与时长 |

合格样例：视频仓库 `template` 分支的 `examples-frame.md`（密函改版对账：配色语义、字号层级、分区、装饰、动效都写死了，9 个场景全部服从它）。

## 2. 视频语境下的硬约束

- **一屏一个论点**。观众只有 2–6s 看一帧，一帧塞两个论点等于零个。
- **字号下限**：正文 ≥ 22px、说明小字 ≥ 20px（1080p 下手机端仍可读）；主数字 120–200px。
- **数字用等宽数字**：`font-variant-numeric:tabular-nums`，动画数字跳动时不会左右抖。
- **颜色有语义且全片不变**：金永远是「新/收益」，钢灰永远是「旧/作废」；不许中途换色。
- **装饰必须带因果**（为什么有这道分线、为什么有这个光斑），不能只是「看起来高级」。禁止无脑六边形网格、霓虹赛博、紫蓝渐变 slop。
- **动效对齐语音**：进场/强调的时刻直接引用句级时间（见 `hyperframes.md` §5），不要写「进场后 0.5s」。
- **安全区**：底部 160px 留给字幕（`hyperframes.md` §4），重要信息避开。

## 3. 从 frame.md 落到 composition

1. `frame.md` 的 palette token 直接写成场景 `<style>` 里的变量，别在各场景里散落硬编码 hex。
2. 一个场景 = 一次「读账」：进场（0.4–0.7s，`power3.out`）→ 主信息落位 → 强调（与某句字幕同刻）→ 退场（0.4–0.6s）。
3. 装饰单独建一层，用 `sine.inOut` + `yoyo:true` 长周期呼吸（8–12s），避免与信息动效抢注意力。
4. 场景之间保持同一套 kicker（序号 `01 / 08`）、同一套脚注位，让整片像同一份文档翻页。

## 4. 设计闸（做完自查）

- 去掉所有装饰后，画面还能讲清这一帧的论点吗？（不能 → 信息层级有问题）
- 每一帧的颜色都来自 `frame.md` 的 token 吗？（有例外 → 写进 `Notes` 并说明动因）
- 字幕出现的那 2–4s 里，画面有没有和字幕打架的元素？（有 → 挪开或压低对比）
- 换掉文案后，这套版式还成立吗？（不成立 → 版式在迁就文字，而不是在承载论点）
