# ASR：验音与「口播稿 → 字幕时间轴」

两类活，别混：

| 目的 | 用什么 | 脚本 |
| --- | --- | --- |
| 这段音频**有没有把字念全**（TTS 产物验音） | FunASR SeACo-Paraformer（中文，抓丢字比 whisper 稳） | `tools/voice/asr.ts` + `asr_verify.py` |
| 这段话**落在第几秒**（给已有音频切字幕） | faster-whisper（有词级时间戳） | `align-existing.py` / `whisper-words.py` |

原则：**字幕文字永远用口播稿原文，ASR 只用来定时间或判丢字。**

## 1. FunASR 验音

底层 `tools/voice/asr_verify.py`：

- `--serve`：常驻模式，stdin 收 `{"id","wav","text"}` 一行一条，stdout 出 `{"id","transcript","cer","recall","missing","longest_missing"}`。模型只加载一次（约 25–30s），之后每句 ~1s。
- `--input/--output`：批量模式，一次进程处理整批 json。
- 指标：`cer` 字符错误率、`recall` 期望文本的 LCS 召回、`missing` 缺字数、`longest_missing` 最长连续缺字（**最有用**：整段丢字会立刻暴露）。
- 跑在 `E:/soft/GPT-SoVITS-v2/runtime/python.exe`（`GSTS_PYTHON` 可覆盖），模型默认 `paraformer-zh`（`VOICE_ASR_MODEL` 可覆盖）。

上层封装 `tools/voice/asr.ts`：`AsrServeSession`（常驻，失败自动重启一次）、`isQaPass()`、`readQaThresholds()`、`verifyPronunciationBatch()`。
视频里直接用 `scripts/asr-check.ts`，它读 `.tmp/subs.json`、逐句验、落 `.tmp/asr.json`、打印未通过清单。

实测：模型加载 25s + 3 句 11s 音频共 29s；100 句量级仍是分钟级，别为速度把阈值调松。

## 2. 已有音频 → 句级时间（`align-existing.py`，在视频仓库当前分支根目录执行）

原理：

1. faster-whisper（`small`，CPU int8，`word_timestamps=True`）出词级时间；
2. 把每个词的时间**按字数均摊**到字，得到「字流 + 每字起止时间」；
3. `difflib.SequenceMatcher(autojunk=False)` 把 whisper 字流对齐到口播稿字流（两边都去标点/空白）；
4. 只拿**真正匹配上的字**当锚点（`稿子字下标 → 时间`），未匹配段（ASR 漏字、多念）靠相邻锚点线性插值；
5. 每行口播稿按字符数换算成字区间，区间首尾各插值一次，就是这条字幕的 `start` / `end`。

```bash
PYTHONUTF8=1 E:/soft/GPT-SoVITS-v2/runtime/python.exe \
  /e/dev/dna-builder/.agents/skills/video-production/scripts/align-existing.py \
  --wav assets/voice.wav --script script.tsv --out .tmp/subs.json \
  [--model small] [--lang zh] [--device cpu]
```

输出与 `narrate.ts` 同构（`{voice,duration,gap,cues[]}`），下游 `captions.ts` / `parts.ts` 无差别。

实测精度（93 句真实旁白，与人工核过的字幕比）：中位偏差 0.04s，p90 0.44s，最大 0.86s；边界略偏**早**——这是想要的（字幕早到半句没感觉，晚到半句很别扭）。

速度：228s 音频，CPU `small` 约 70s；`--device cuda` 可到 10s 级（需该 python 环境有 torch cuda）。

## 3. 坑（按踩坑频率排序）

1. **稿子与音频不一致**：音频里多念/重复了一句、或某句被挪到结尾，对齐会整体串位。表现是 `subs.json` 中段某些句 `duration` 极短（<0.6s）而后半段全被压缩。处理：
   - 先跑 `whisper-words.py` 或 `narrate`-side 的 ASR 转写，通读一遍确认稿子与音频逐句一致；
   - 确实多念了一句，就在 `script.tsv` 里补上那一行；
   - 音频把结尾句挪到了最后，就把稿子里那一行也挪到最后（这是 dna-builder 的 `outputs/密函改版1.7-视频文案-v1.md` 当时的真实情况）。
2. **结尾留白**：脚本会提示「末尾 N 秒没有字幕」。要么是稿子没覆盖到结尾（补句），要么是音频尾部有音乐/静音（接受即可）。
3. **长句**：单条 > 8s 会打印 `⚠ 过长，拆成两行`。在稿子里拆成两行，别指望脚本按标点自动拆（拆了英文译文就对不上）。
4. **数字与专名**：whisper 会把「魔之楔」写成「魔之蝎」、把「1.6%」写成「百分之一点六」。不影响时间，不要拿转写文字当字幕。
5. **稿子按语义断行**，不按字数断行：一行 = 一个完整语义短语，否则中英双语会一长一短很难看。
6. **英文行**：`script.tsv` 第二列就是英文行，允许为空（空则该条只有中文）。别让英文超过中文视觉宽度的 1.6 倍，超了就把中文拆成两行、英文同步拆。

## 4. 词级时间（可选）

```bash
E:/soft/GPT-SoVITS-v2/runtime/python.exe \
  /e/dev/dna-builder/.agents/skills/video-production/scripts/whisper-words.py \
  --wav .tmp/voice.wav --out .tmp/words.json [--model small] [--lang zh]
```

用途：句内卡拉 OK 逐字高亮、逐词弹出。注意 whisper 的中文分词粒度是「字」，词边界不可靠，只按字的 `s/e` 做匀速高亮即可。
