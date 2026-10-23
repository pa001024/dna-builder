---
name: video-production
description: 把文案做成带旁白与中英双语字幕的成片：TTS（ModelVerse IndexTTS-2 逐句合成）、ASR（FunASR 验音 / faster-whisper 得时间戳）、字幕对齐、HyperFrames 分段渲染与 ffmpeg 拼接、画面设计走 victor-design。当用户要求「做个视频 / 生成视频 / 出攻略视频 / 配旁白 / 加字幕 / 口播稿转字幕 / 已有音频切时间轴 / 视频渲染太慢要分段」时使用。
---

# 视频制作流水线（文案 → 旁白 → 双语字幕 → 分段渲染 → 成片）

本技能只管**视频生产链路**：谁说哪句话（TTS）、说的到底对不对（ASR）、每句话落在第几秒（时间轴）、这句话以什么画面和双语字幕出现（HyperFrames + victor-design）、以及怎么在可接受时间内渲完（分段渲染 + 拼接）。

HyperFrames 框架本身的作者规范在全局技能 `/general-video` `/hyperframes`、`/hyperframes-core`、`/hyperframes-cli`（写 composition HTML 前必读）；本技能只补**本仓固定口径**与**已验证的脚本**。

画面设计走技能 `victor-design`

动效规则走全局技能 `/onetake` (重要)

## 0. 工作空间：一切都在 `../videos`，一部片一个分支

| 东西 | 位置 |
| --- | --- |
| 视频仓库 | `E:/dev/videos`（与 dna-builder 平级，独立 git 仓库） |
| 母版 | `template` 分支（字体、`refs/` 参考音频、`captions.css`、HyperFrames 骨架、模板 md、`new-video.sh`） |
| 一部片 | **从 `template` 开出的一个分支**，分支根目录就是项目根目录 |
| assets / .tmp / md / renders | 全部在该分支目录内，**不准写进 dna-builder 的 `outputs/`** |
| 脚本本体 | 留在 dna-builder：`.agents/skills/video-production/scripts/`（不要在 videos 里另存一份） |

```bash
cd /e/dev/videos
./new-video.sh <slug>          # = git checkout -b <slug> template
BUN=/e/dev/dna-builder/.agents/skills/video-production/scripts   # 之后所有 bun $BUN/xxx.ts 都在本目录执行
```

分支内固定结构：`assets/`（含 `fonts/`、`voice.wav`）、`refs/`、`compositions/`、`index.html`、`scenes.json`、`script.tsv`、`captions.css`、`BRIEF.md`、`frame.md`、`.tmp/`、`renders/`。
`template` 里已有：两个字体文件（不子集化）、5 条旁白参考音频、`captions.css`、`index.html` + `compositions/example.html` 骨架、`hyperframes.json` + pin 好的 `package.json`、`BRIEF.md`/`frame.md`/`script.tsv`/`scenes.json` 模板、`examples-frame.md`（合格 frame.md 样例）、`new-video.sh`、以及放了 `MODELVERSE_API_KEY` 的 `.env`（git 忽略）。

开工前先确认自己在视频分支里（`git branch --show-current`，不能是 `template`）；收工时 `git status` 必须干净（`renders/`、`.tmp/`、`part-*.html`、`.env` 都不入库）。

## 1. 两条入口，一个出口

| 入口 | 你手上有什么 | 走哪条 |
| --- | --- | --- |
| A. 自己合成旁白 | 只有文案（中文 + 英文译句） | `narrate.ts` 逐句 TTS，时间轴由「逐句时长累加」直接得到 |
| B. 已有音频 | 音频文件 + 口播稿，**没有时间轴** | `align-existing.py` 用 whisper 词级时间戳把口播稿切到音频上 |

两条路都产出**同构的 `.tmp/subs.json`**，之后的字幕、画面、渲染完全一样：

```
script.tsv (中文<TAB>英文)  ──A: narrate.ts ──┐
                                            ├─→ .tmp/subs.json ─→ captions.ts ─→ 双语字幕 clip
voice.wav + 口播稿         ──B: align-existing.py ─┘                            │
                                                                     HyperFrames 工程
                                                          parts.ts（分段渲染）→ ffmpeg 拼接 + 挂整条音轨
```

## 2. 硬性规则

1. **工作空间**：视频的 assets / .tmp / md / renders 只落在 `../videos` 的当前分支里；一部片一个分支，一律从 `template` 开。
2. **字体固定，不子集化**：正文 `assets/fonts/NotoSerifCJKsc-Black.otf`（`@font-face` 名 `SerifSC`，源 `dna-builder/outputs/NotoSerifCJKsc-Black.otf`），字幕 `assets/fonts/blod.ttf`（名 `HYSub`，源 `dna-builder/public/fonts/blod.ttf`）。模板已备好，直接用。
3. **字幕中英双语、贴底通栏**：每句一个 `class="cap clip"`，中文 42px `HYSub`，英文 26px `#AFC0D4` 放在同一 `span` 内的 `<em>` 里；`bottom:26px`、宽度上限 1560px。样式只认 `captions.ts` 产出的 `captions.css`。
4. **时间必须实测**：`data-start` / `data-duration` 只能来自 `subs.json`（TTS 句级时长或 ASR 对齐），**禁止手填、禁止平均分配**。
5. **画面必须过设计闸**：先按 `/victor-design` 出 `BRIEF.md` + `frame.md`（题材证据 → 配色/字体/版式/装饰/动效），再写 composition。见 `references/design.md`。
6. **分段渲染是默认**：片长 > 60s 一律 `parts.ts` 切段 → 逐段 render → `-c copy` 拼接 → 最后一道 ffmpeg 挂整条 `voice.wav`。逐段音频会漂移，所以分段里不放音轨。
7. **没验音不许成片**：流程 A 的每句要过 `asr-check.ts`（CER / recall / 最长丢字），未通过的句子重合成。
8. 不要跑 `pnpm dev` / `pnpm build`（见 dna-builder AGENTS.md）。

## 3. 流程 A：自己合成旁白

```bash
cd /e/dev/videos
BUN=/e/dev/dna-builder/.agents/skills/video-production/scripts

# script.tsv：一行 = 一条字幕 = 一次 TTS，格式「中文<TAB>英文」，# 注释行跳过
bun $BUN/narrate.ts   --script script.tsv --out .tmp --ref refs/story_story_1002_101002_1948E9DE.wav [--speed 1.05] [--gap 180]
bun $BUN/asr-check.ts --dir .tmp
bun $BUN/captions.ts  --dir .tmp
cp .tmp/voice.wav assets/voice.wav          # index.html 与成片用的是这一份

# 只重做改动过的句子：删掉它的 seg-XXX-*.wav 后
bun $BUN/narrate.ts --script script.tsv --out .tmp --ref <ref> --only 5,33
```
`script.tsv` 支持第三列「TTS 文本」：字幕用第一列，合成用第三列（顿号/冒号换成逗号，避免 v5 吞句）。

产物：`.tmp/voice.wav`（整条旁白）+ `.tmp/subs.json`（句级时间）+ `.tmp/captions.html` / `captions.css` / `subs.srt` + `.tmp/asr.json`（验音明细）→ `captions.css` 覆盖仓库根的同名文件，`captions.html` 内容粘进 `index.html`。
不通过的句子：删掉对应 `seg/seg-XXX-*.wav` 重跑（缓存按文本+参考+参数哈希命名，只重做改过的那句）。
`MODELVERSE_API_KEY` 在视频仓库根的 `.env`（git 忽略），Bun 从 cwd 自动加载。
细节与实测参数：`references/tts.md`。

## 4. 流程 B：已有音频 + 口播稿（没时间轴）

```bash
cd /e/dev/videos
PYTHONUTF8=1 E:/soft/GPT-SoVITS-v2/runtime/python.exe \
  /e/dev/dna-builder/.agents/skills/video-production/scripts/align-existing.py \
  --wav assets/voice.wav --script script.tsv --out .tmp/subs.json

bun $BUN/captions.ts --dir .tmp
```

字幕文字永远取口播稿原文，ASR 只负责定时间；实测中位偏差 0.04s、p90 0.44s（偏早，安全）。
稿子与音频不一致（重复句、结尾挪句、漏句）是最常见的崩点，处理办法见 `references/audio-to-subs.md`。
需要逐词高亮时再跑 `whisper-words.py` 拿 `words.json`。

## 5. 画面：HyperFrames 工程 + 设计

分支里已经有 `hyperframes.json` / `package.json`（pin 了 `hyperframes@0.8.169`）/ `index.html` / `compositions/example.html` 骨架，直接改：

- 设计：按 `references/design.md` 先写 `BRIEF.md` + `frame.md`（`examples-frame.md` 是合格样例），再逐场景写 `compositions/f*.html`。
- 结构、轨道分工（1 场景 / 8 字幕 / 9 旁白）、字体声明、时间轴写法：`references/hyperframes.md`（含可直接抄的 `index.html` 骨架）。
- 字幕 clip 由 `captions.ts` 生成，粘进 `index.html` 的字幕轨道，不要手改时间。
- `scenes.json` 与 `index.html` 的场景 slot 必须一致（场景切点落在某句字幕的 start/end 上）。

## 6. 分段渲染 + 拼接（长片必走）

```bash
cd /e/dev/videos
bun $BUN/parts.ts --project . --subs .tmp/subs.json --scenes scenes.json --split 90 [--run]
```

`scenes.json` = `[{"id":"f1-announce","start":0,"duration":30.16}, …]`（`id` 对应 `compositions/<id>.html`）。
产出 `part-01.html …`（每段自带该段场景 clip 与该段字幕 clip，无音轨）+ `renders/parts/concat.txt`，并打印/执行：

```
npx --yes hyperframes@0.8.169 render -c part-01.html --quality looks -o renders/parts/part-01.mp4
ffmpeg -y -f concat -safe 0 -i renders/parts/concat.txt -c copy renders/parts/joined.mp4
ffmpeg -y -i renders/parts/joined.mp4 -i assets/voice.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -shortest renders/<分支名>-1080p.mp4
```

切点落在场景边界上，单段 60–120s；坏一段只重渲一段。成片名默认取 git 分支名。

## 7. 交付前验收

- `npx hyperframes check` 通过；每段渲染后抽 2–3 帧看字幕与字体（`npx hyperframes snapshot --range a:b --frames 3`）。
- `ffprobe -v error -show_streams -show_format renders/<slug>-1080p.mp4`：1920×1080 / 30fps / 时长与 `subs.json` 一致（±0.2s）/ 有 AAC 音轨。
- 字幕肉眼抽查开头、中间、结尾各一处：中英两行都在、不断行、不压底部装饰。
- 旁白峰值约 -3~-6 dBFS；结尾留 300–400ms（`narrate.ts --tail`）。
- 一并交付 `subs.srt`（中英双语，B 站可外挂）。
- 分支内 `git status` 干净：`renders/`、`.tmp/`、`part-*.html`、`.env` 都不入库。

## 8. 参考

| 主题 | 文档 |
| --- | --- |
| TTS：ModelVerse / 本机 IndexTTS / GPT-SoVITS 用法、参数、参考音频挑选、断点续跑 | [references/tts.md](references/tts.md) |
| ASR：FunASR 验音、whisper 词级对齐、口播稿转字幕的坑 | [references/audio-to-subs.md](references/audio-to-subs.md) |
| HyperFrames：项目骨架、字体、双语字幕样式、轨道、分段渲染与拼接 | [references/hyperframes.md](references/hyperframes.md) |
| 画面设计：victor-design 在视频里的用法（BRIEF / frame.md → composition） | [references/design.md](references/design.md) |

脚本：`scripts/narrate.ts`、`scripts/asr-check.ts`、`scripts/align-existing.py`、`scripts/captions.ts`、`scripts/parts.ts`、`scripts/whisper-words.py`。
