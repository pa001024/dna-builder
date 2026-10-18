# HyperFrames 口径（本仓固定写法）

框架契约以全局技能为准（`/hyperframes` → `/hyperframes-core`、`/hyperframes-cli`），本文件只写**本仓已验证、必须照抄**的部分：项目骨架、字体、双语字幕、轨道、分段渲染。

## 1. 项目骨架

模板分支 `template` 里已经备好骨架，新片只需 `./new-video.sh <slug>`，不要重新 `hyperframes init`。

```
<分支根>/
├── index.html            # 主 composition：场景 slot + 字幕轨道 + 旁白音频
├── compositions/f1-….html  # 每场一个子 composition（自带模板 <template> 与自己的 gsap 时间轴）
├── assets/               # 图片素材、fonts/、voice.wav
├── refs/                 # TTS 参考音频（旁白音色）
├── script.tsv            # 文案表：一行一句 中文<TAB>英文
├── scenes.json           # 场景表（给 parts.ts）
├── captions.css          # 双语字幕样式（captions.ts 的权威副本）
├── .tmp/                 # voice.wav / subs.json / seg/ …（git 忽略）
├── renders/              # renders/<分支名>-1080p.mp4、renders/parts/（git 忽略）
├── part-01.html …        # parts.ts 生成的分段渲染入口（可随时删掉重生成）
├── hyperframes.json      # paths.blocks/components/assets
├── BRIEF.md / frame.md   # 设计产物（见 design.md）
└── package.json          # 脚本里 pin 了 hyperframes@X.Y.Z
```

参考实例：dna-builder 的 `outputs/mihhan-release-explainer/`（做完的整片，结构、字幕、字体、动效都可对照；按旧路径产出，仅作样式参考）。

## 2. 字体：两个文件，两种角色

| 角色 | 文件 | `@font-face` 名 | 用法 |
| --- | --- | --- | --- |
| 正文 / 标题 / 数字 | `assets/fonts/NotoSerifCJKsc-Black.otf`（源自 `dna-builder/outputs/`） | `SerifSC` | 场景里所有正文、标题、大数字 |
| 字幕 / 小标签（kicker、口径小字） | `assets/fonts/blod.ttf`（源自 `dna-builder/public/fonts/`，游戏同款 HYJunHei） | `HYSub` | 字幕整块、右上角小字 |

```css
@font-face{font-family:"SerifSC";src:url("assets/fonts/NotoSerifCJKsc-Black.otf") format("opentype");font-weight:400;font-display:block}
@font-face{font-family:"HYSub";src:url("assets/fonts/blod.ttf") format("truetype");font-weight:400;font-display:block}
```

- **不子集化**：全量字体直接放 `assets/fonts/`，避免「漏字变豆腐」和子集缓存与文案不同步。文件大不影响渲染，只影响项目体积。
- `url()` 写**项目根相对路径** `assets/fonts/…`：子 composition 的 `<template>` 内容会被挂进主文档，路径按主文档解析；`index.html` 与 `part-XX.html` 都在根目录，所以两边都能命中。
- `font-display:block`：渲染时不要 `swap`，否则首帧可能抓到回退字体。
- 场景里写的字体族必须与实际加载的一致（`font-family:"SerifSC",serif`），别写 `"Noto Serif SC"` 之类没声明的名字。

## 3. 主 composition 骨架（可直接抄）

```html
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1920, height=1080" />
<title>片子名</title>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
  body{margin:0;background:#080B11}
  #root{position:relative;width:100%;height:100%;overflow:hidden;background:#080B11}
  @font-face{font-family:"SerifSC";src:url("assets/fonts/NotoSerifCJKsc-Black.otf") format("opentype");font-weight:400;font-display:block}
  @font-face{font-family:"HYSub";src:url("assets/fonts/blod.ttf") format("truetype");font-weight:400;font-display:block}
  /* ↓ captions.ts 产出的 captions.css 原样贴进来 */
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="250.2">

  <!-- 场景：一个场一个子 composition，track 1 -->
  <div id="s1" data-composition-id="f1-announce" data-composition-src="compositions/f1-announce.html"
       data-start="0" data-duration="30.16" data-track-index="1" data-width="1920" data-height="1080"></div>
  <div id="s2" data-composition-id="f2-deck" data-composition-src="compositions/f2-deck.html"
       data-start="30.16" data-duration="15.28" data-track-index="1" data-width="1920" data-height="1080"></div>

  <!-- 字幕：track 8，一条一句，data-start/duration 来自 subs.json，禁止手改 -->
  <div class="cap clip" id="cap-01" data-start="0.00" data-duration="3.01" data-track-index="8"><span>官方公告的玩法部分，有这么一条。<em>The official patch notes say one thing.</em></span></div>

  <!-- 旁白：track 9，整条音轨（分段渲染时不放进分段，见 §6） -->
  <audio id="voice" src="assets/voice.wav" data-start="0" data-duration="250.2" data-track-index="9" data-volume="1"></audio>
</div>
<script>
  const tl = gsap.timeline({ paused: true });
  window.__timelines = window.__timelines || {};
  window.__timelines["main"] = tl;
</script>
</body>
</html>
```

轨道分工（`data-track-index` 是 Studio 显示车道，渲染不读它，但统一了才好排查）：

| track | 内容 |
| --- | --- |
| 1 | 场景子 composition |
| 8 | 字幕 clip |
| 9 | 旁白音频 |

场景子 composition 的固定结构（`compositions/f1-xxx.html`）：

```html
<!doctype html>
<html lang="zh-CN">
<head><meta charset="UTF-8" /><title>f1-announce</title></head>
<body>
<template>
<style>
  @font-face{font-family:"SerifSC";src:url("assets/fonts/NotoSerifCJKsc-Black.otf") format("opentype");font-weight:400;font-display:block}
  @font-face{font-family:"HYSub";src:url("assets/fonts/blod.ttf") format("truetype");font-weight:400;font-display:block}
  #root{position:absolute;inset:0;background:#080B11;color:#E9EFF6;font-family:"SerifSC",serif;overflow:hidden}
</style>
<div id="root" data-composition-id="f1-announce" data-width="1920" data-height="1080">
  …
</div>
<script>
  const tl = gsap.timeline({ paused: true });
  tl.fromTo("#doc", {y:54, opacity:0}, {y:0, opacity:1, duration:.55, ease:"power3.out"}, 0.1)
    .to("#badge", {opacity:1, duration:.45}, 8.96);   // ← 8.96 是某句字幕的起点
  window.__timelines["f1-announce"] = tl;
</script>
</template>
</body>
</html>
```

## 4. 中英双语字幕（本仓标准）

样式（`captions.ts` 输出，别手改数值）：

```css
.cap{position:absolute;left:0;right:0;bottom:26px;display:flex;justify-content:center;pointer-events:none}
.cap span{font-family:"HYSub",sans-serif;font-size:42px;line-height:1.26;color:#F4F8FD;letter-spacing:.02em;
  background:rgba(6,9,14,.66);padding:10px 28px 12px;border-radius:6px;text-align:center;max-width:1560px;
  text-shadow:0 2px 10px rgba(0,0,0,.75)}
.cap em{display:block;font-style:normal;font-size:26px;line-height:1.3;color:#AFC0D4;
  letter-spacing:.01em;margin-top:7px;text-shadow:0 2px 8px rgba(0,0,0,.7)}
```

规则：

- **中文在上、英文在下**，同一个 `.cap span` 内用 `<em>` 断行；英文 26px 比中文小一档，低对比色（`#AFC0D4`），保证中文先被读到。
- 每条字幕**只有一句中文 + 一句英文**；中文 ≤ 24 字，英文 ≤ 中文视觉宽度 1.6 倍。超了在 `script.tsv` 拆成两条（`subs.json` 跟着变）。
- 底板 `rgba(6,9,14,.66)` + 文字阴影，是为亮画面（游戏截图/白底表）兜底，不要删。
- 贴在 `bottom:26px`：字幕块总高约 110–130px，因此**底部 160px 范围内不要再放装饰线、角标、图例**（场景里 `bottom:126px` 的发丝线是极限，再低就压字幕）。
- 两侧安全：`max-width:1560px`，1920 宽下左右各留 180px。
- 时间段严格来自 `subs.json`；`captions.ts --hold 120` 会给每条尾部加 120ms 停留，避免闪烁。

## 5. 动效与语音对齐

- **场景切点 = 某条字幕的 `start`**（或 `end`）。先有 `subs.json`，再定 `scenes.json`，再写 `compositions/*.html` 里的 `data-start`。顺序反了就要返工。
- 场景内部动画的关键帧时刻，直接写该句字幕的秒数（如 `8.96`），而不是「进场后 0.5s」——这样改文案重跑 `narrate.ts` 后一眼能看出哪些时刻需要改。
- 场景内 `window.__timelines["<id>"]` 必须是**注册过的非 paused 子时间轴**（挂在主时间轴下的子时间轴不要 paused，paused 的子时间轴不会随 seek 前进）。
- 只写确定性逻辑：不要 `Date.now()`、`Math.random()`、运行时网络请求。

## 6. 分段渲染 + 拼接（片长 > 60s 必走）

```bash
cd /e/dev/videos     # 当前分支根；BUN=/e/dev/dna-builder/.agents/skills/video-production/scripts
# scenes.json = [{"id":"f1-announce","start":0,"duration":30.16}, …]
bun $BUN/parts.ts --project . --subs .tmp/subs.json \
  --scenes scenes.json --split 90 [--run]
```

`parts.ts` 做的事：

1. 按场景边界把整片切成若干段（`--split` 是目标秒数，实际切点落在场景边界，段长 60–120s 最稳）；
2. 为每段生成根目录下的 `part-XX.html`：字体声明 + 字幕样式 + **该段范围内的场景 clip** + **该段范围内的字幕 clip**（时间全部减去段起点，跨段字幕会被裁到段内），`data-duration` = 段长；
3. 写 `renders/parts/concat.txt`；
4. 打印（`--run` 则执行）逐段渲染与拼接命令。

```bash
npx --yes hyperframes@<pin> render -c part-01.html --quality looks -o renders/parts/part-01.mp4
npx --yes hyperframes@<pin> render -c part-02.html --quality looks -o renders/parts/part-02.mp4
ffmpeg -y -f concat -safe 0 -i renders/parts/concat.txt -c copy renders/parts/joined.mp4
ffmpeg -y -i renders/parts/joined.mp4 -i assets/voice.wav -map 0:v:0 -map 1:a:0 \
  -c:v copy -c:a aac -b:a 192k -shortest renders/<slug>-1080p.mp4
```

为什么这么切：

- **分段里不放音轨**。逐段各带一段 AAC 再拼，累计采样偏差会让整片音画越走越偏；拼接后再挂**一条完整** `voice.wav`，音画零漂移。
- 逐段都用同一套 `--quality looks` / 同 fps / 同分辨率，`-c copy` 拼接才不需要重编码。
- 段长不要小于 30s：每段都有浏览器冷启动开销（约 5–15s），切太碎反而更慢。
- 某段坏了：只删那段 mp4，重跑那一条 render 命令，再重新 concat。
- 整片一次渲染只适合 <60s 的短片；`npx hyperframes render --quality draft` 可先估总量再决定。

## 7. 渲染与检查命令

```bash
npx hyperframes check                                  # lint + 运行时 + 版式 + 对比度，改完必跑
npx hyperframes snapshot --at 3.2,95.5                # 抽帧看字幕/字体是否正常
npx hyperframes snapshot --range 88:92 --frames 3
npx --yes hyperframes@<pin> render --quality draft     # 迭代期
npx --yes hyperframes@<pin> render --quality looks -o renders/<slug>-1080p.mp4   # 正式
```

- 版本走项目 `package.json` 里 pin 的 `hyperframes@X.Y.Z`（`parts.ts` 会自动读），升级用 `npx hyperframes@latest upgrade --project . --check`。
- 输出命名固定 `renders/<分支名>-1080p.mp4`（`parts.ts` 默认取当前 git 分支，`template` 上会退回目录名）；验片可先 `--quality draft` 出到 `renders/parts/`。
- 离线/无网环境要把 gsap 从 CDN 换成本地文件（`assets/vendor/gsap.min.js`），否则 `check` 会报资源加载失败。

## 8. 坑清单

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 场景卡在首帧不动 | 子 composition 的时间轴没注册或注册成 paused | 注册到 `window.__timelines[id]`，子时间轴不要 paused |
| 字幕不出现 / 全片都出现 | 少了 `class="clip"` 或 `data-start` 写成了相对时间 | 用 `captions.ts` 生成的片段，不要手写 |
| 字体回退成宋体/黑体 | `@font-face` 路径不对或字体族名不一致 | 路径写 `assets/fonts/…`，`font-family` 与声明同名 |
| 字幕被底部装饰压住 | 场景底部 160px 内有元素 | 抬高装饰线，或把字幕底板加不透明 |
| 拼接后画面闪一下黑帧 | 段首尾有额外帧 / 两段 fps 不同 | 统一 `--quality` 与 fps，段时长按 `data-duration` 精确到 3 位小数 |
| 拼接后音画不同步 | 分段里带了音轨 | 分段只渲画面，音轨只在最后一遍 ffmpeg 挂 |
| 渲染极慢 | 单个 composition 太长 / 60fps / `--quality delivery` | 分段 + `--quality looks` + 30fps |
