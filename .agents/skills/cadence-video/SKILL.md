---
name: cadence-video
description: 用 cadence 框架 做"代码渲染、音画同步"的视频：两条并列入口（脚本+TTS 实测时长 / 歌曲分析对齐）写同一份 project.json，可混合；带网页端时间线编辑器（拖拽剪辑、改字重生成语音、场景与帧特效标注）和无头 Chrome+ffmpeg 出片。当做解说类视频（如法露茜攻略视频）、要从0开始生成视频、要基于歌曲做歌词对齐的程序化动画视频，或需要在浏览器里可视化编排时间线/效果规划时，使用本技能。
---

# cadence：从0生成音画同步视频

## Overview

框架在 **`../cadence`**（bun + vite + three.js，自 pdoom-video 抽取）。核心思想：**每一帧都是时间 t 的纯函数**，预览与导出逐像素一致；**画面参数挂在数据上**（词时间/拍网格/包络），不写死秒数。

**一份中间文件 `project.json`**（资产/clip/块/标注），三条路写它、可混合：
- **脚本导入**（`tools/importScript.ts`）：`script/script.md` 每行 TTS 实测时长 → clip（未锁定，自动 ripple）。
- **歌曲导入**（`tools/importAudio.ts`）：analysis 产出的 data/lyrics.json + audio.json → 对齐歌词变成锁定 clip 铺在歌曲 bed 上，网格/包络/onset 原样带入。
- **网页编辑器**：拖拽/修剪/分割、改文本→TTS 重生成、场景与帧 fx 标注。

编译器 `tools/compile.ts` 把 project.json 变成渲染器吃的数据：`data/lyrics.json`、`data/audio.json`、`audio/voice.wav`、`data/peaks.json`、`out/plan.md`（效果规划文档）。

## When to use

- 要做解说/攻略类视频，从一段文案开始，没有现成音乐。
- 想要逐词卡拉OK、按语句切镜、随语音包络起伏的程序化画面。
- 想基于一首歌做歌词动画（歌曲模式），或在歌上叠旁白（混合模式）。
- 想在浏览器里可视化编排：拖时间线、改一句文案就重出语音、给场景/帧标 fx。

不适用：需要实拍素材剪辑、或非线性编辑软件已有的工作流。

## Workflow

1. **启动**：`bun server/index.ts` → http://localhost:5174（时间线编辑器，一切都能在网页里做）。
   或纯 CLI：`bun tools/build.ts`（脚本导入+编译）/ `--audio`（歌曲导入）/ `--append`（追加）/ `--compile`。
2. **导入素材**（编辑器 import 面板或 CLI）：
   - 脚本：`script/script.md`，`## 块` = 场景条目，每行 = 一句旁白；`@gap/@speed/@pause/@scene` 微调。
   - 歌曲：先跑 `analysis/`（uv，Python 对齐流水线）得到 data/lyrics.json + data/audio.json，再导入（bed gain 建议 0.35）。
3. **编排**：拖动/修剪/分割 clip（锁定 clip = 对齐真值，未锁定自动避让）；检查器里改文字后按
   *regenerate voice* → TTS 重合成、时长重测、后 clip 自动 ripple、项目自动重编译。
4. **标注**：clip/块上 `fx`（kind+区间+备注），播放头处打 mark——这些写入 `out/plan.md`，作为后续效果生成的规划文档。
5. **预览**：compile 后音频就是 `audio/voice.wav`，编辑器可直接播放；`frame` 按钮经真实渲染器出当前帧。
6. **写场景**：复制 `src/scenes/demo.ts` 起步；`f.t / f.beat / f.a.kick / audio.env('rms',t) / lyrics.lineAt(t)` 是全部输入；禁止 `Math.random`/`Date.now`（用种子随机）。
7. **成片**：`bun scripts/render.ts video --samples auto --shutter 0.2 --out out/video.mp4`（1080p60，`--scale 2` 真 4K）；stills/sheet 迭代单帧与节拍表。

## 本机环境事实

- **ffmpeg**：本机 PATH 的是阉割版（无 libx264）；框架已配好优先用完整版 `../GPT-SoVITS-v2/runtime/ffmpeg/bin/ffmpeg.exe`（`tools/config.ts: ffmpegSearch`，可被 `CADENCE_FFMPEG` 覆盖）。编码器自动探测 libx264 → 硬件 → mpeg4。
- **浏览器**：本机无 Chrome，自动落到 Edge（`CADENCE_BROWSER=msedge` 可强制）。
- **中文旁白**：自带字体无 CJK 字形。把 Noto Sans SC 等 ttf 放进 `public/fonts/`，并在 `public/fonts/extra.json` 里登记 `[{"family":"NotoSansSC-700","file":"NotoSansSC-700.ttf"}]`，场景里 `font('NotoSansSC-700', 88)`。
- **dev 端口 5173**（vite 默认），渲染脚本会自动拉起私服。

## References

- `../cadence/README.md` — 全貌与目录
- `../cadence/docs/EDITOR.md` — 编辑器/服务器、project.json 模型、完整 API
- `../cadence/docs/SCRIPT.md` — 脚本格式 + TTS 配置 + 中文注意
- `../cadence/docs/DATA.md` — 渲染数据契约（编译产物）
- `../cadence/src/scenes/demo.ts` — 场景样板（背景/包络线/卡拉OK/状态行）
- 歌曲模式：`../cadence/analysis/`（uv 跑 Python，对齐流水线）
