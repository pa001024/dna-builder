# TTS：把文案变成旁白

三个后端都在 `tools/voice/`，都能直接 `import` 复用；视频旁白默认用 ModelVerse（云端、按次传参考、不用起服务）。

## 1. 三个后端怎么选

| 后端 | 文件 | 何时用 | 关键约束 |
| --- | --- | --- | --- |
| ModelVerse IndexTTS-2（**默认**） | `tools/voice/modelverse-client.ts` | 视频旁白、任何需要稳定批量、可断点续跑的场合 | 需要 `MODELVERSE_API_KEY`；每次请求传参考音频；有人均限流 |
| 本机 IndexTTS 服务 | `tools/voice/index-client.ts` | 没有外网 / 想本地跑 | 需先起 `http://127.0.0.1:8849`（`POST /tts`）；服务端落盘中转 |
| 本机 GPT-SoVITS-v5 | `tools/voice/gpt-sovits.ts` | 已有角色声线（`charvoice` 参考 + prompt 文本） | `ref_audio_path` 与 `prompt_text` 都必填；跑 `api_v2.py`（端口 9880，接口 `/tts`，需 `GSTS_ENDPOINT=/tts`） |

游戏语音补全流水线（`synthesize.ts` + `pnpm voice:*`）是另一套东西，见 `.agents/docs/voice-aistory-pipeline.md`；做视频不要走那条，直接调 client。

## 2. ModelVerse 用法

```ts
import { modelverseInferOnce, readModelverseConfig } from "../../tools/voice/modelverse-client"

const audio = await modelverseInferOnce(readModelverseConfig(), {
    text: "新增金色魔之楔本体掉落。",
    refAudioPath: "refs/story_story_1002_101002_1948E9DE.wav",
    sampleRate: 32000,      // 视频统一 32000 单声道
    speed: 1.05,            // 0.9–1.1，中文一般 1.0–1.08
    // emoAudioPath: 参考情绪音频；不给则 emo_control_method=0
    // emoControlMethod: 0|1|2|3，给 emo 音频时默认 1
    // emoAlpha: 0.5–0.8 情绪别过火
})
await Bun.write(".tmp/x.wav", new Uint8Array(audio))
```

环境变量（**视频仓库根**的 `.env`，Bun 从 cwd 自动加载；模板里已放好 `MODELVERSE_API_KEY`）：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `MODELVERSE_API_KEY` | — | 必填，缺失直接抛错；不要打印 |
| `MODELVERSE_BASE_URL` | `https://api.modelverse.cn` | 走代理时改这里 |
| `MODELVERSE_MODEL` | `IndexTeam/IndexTTS-2` | |
| `MODELVERSE_TIMEOUT_MS` | `300000` | 单次请求超时 |

**限流**：`modelverseInferOnce` 内建 429 退避（20s × 次数，最多 5 次）。所以批量时**串行**最稳；`narrate.ts` 默认串行。

## 3. 参考音频（决定音色，比模型版本更重要）

- 长度 3–15s、单声道、无背景音、无 BGM；太短（<1s）音色不稳，太长变慢。
- 视频仓库 `refs/` 里已备 5 条旁白参考（见 `refs/README.md`），`story_story_1002_101002_1948E9DE.wav`（15.8s）实测最稳，是默认值。
- 要更多参考：从 dna-builder 的 `.tmp/voice-ref-audio/` 拷（`resolve-ref-audio.ts` 下载并转 32k wav 的缓存）。`story_story_*.wav` 11–19s 像口播；`char_<角色>_vo_*.wav` 多是 0.5–10s 短台词，适合角色台词不适合整片旁白。
- 指定情绪参考（同一角色有情绪位）见 `male-ref.ts` 的 `NANZHU_LIGHT_EMOTION_REF`。
- 想换音色：换参考 wav 即可，其余参数不动。

## 4. 逐句合成是硬要求

字幕时间来自「每句音频的真实时长」。所以：

- **一句一次请求**，不要整段一次合成（那样只能靠 ASR 反推时间，白丢精度）。
- 每句合成后**裁掉首尾静音**（`narrate.ts` 用 `silenceremove` @ -50dB + `areverse`），否则字幕看起来比声音早/晚 0.2–0.5s。
- 句间留 `--gap 180`（毫秒）呼吸；结尾 `--tail 400` 给收尾留白。
- 一条字幕的语音时长控制在 1.5–6s（≈5–25 中文字）。超过 8s 就拆成两行文案，别靠脚本硬拆。
- **第三列只给 TTS**：`中文<TAB>英文<TAB>TTS 文本`。字幕仍用第一列，合成用第三列。实测顿号「、」会让 v5 吞掉后半句，冒号「：」后面接列举也容易直接收尾——第三列把这些换成逗号即可，字幕保留正确标点。
- **只重合成改动过的句子**：`narrate.ts` 本身按缓存命中复用，改哪句只重做哪句。要强制重做某句，删掉它的 `seg/seg-XXX-*.wav` 后加 `--only 5,18,33` 跑一次（其余句子必须命中缓存，缺了会报序号）；换模型/参数时用 `--tag v5dev` 给缓存加盐，别整目录删。

`narrate.ts` 的缓存命名是 `seg-<序号>-<text|ref|speed|rate|emo 的 sha1 前 8 位>.wav`：改一句只重跑那句；`--force` 全量重做。

## 5. 语速自检

用 `subs.json` 里每句的 `duration` 除以汉字数：

- 3.5–5.5 字/秒：正常口播；
- > 6 字/秒：听着赶，降 `speed` 或拆句；
- < 2.5 字/秒：拖，查参考音频是否拖腔或句子里有太多标点。

## 6. 验音（必跑）

```bash
bun $BUN/asr-check.ts --dir .tmp          # 在视频仓库目录下执行
```

阈值见 `tools/voice/asr.ts` 的 `readQaThresholds()`（环境变量 `VOICE_QA_*` 可覆盖）：`CER≤0.6`、`recall≥0.8`、`longest_missing<8`，短句（≤12 字）另有放宽规则。判定逻辑是「专名听错可以放过，**成段丢字绝不放过**」。

不通过时：删 `seg/seg-XXX-*.wav` 重跑；连续 2–3 次都丢同一句，多半是句子太长或含模型不认识的自造词，改写文案或加标点断句。

FunASR 细节、模型加载耗时、与 whisper 的分工见 [audio-to-subs.md](audio-to-subs.md)。

## 7. 本机 GPT-SoVITS-v5 用法

起服务（cwd 必须是 `E:/soft/GPT-SoVITS-v5`；认 yaml 的 `custom` 段：根目录 `tts_infer_v5.yaml` 的 `custom` 是 v5turbo（蒸馏版、快），默认 `GPT_SoVITS/configs/tts_infer.yaml` 的 `custom` 还是 v2，别用错）：

```bash
cd E:/soft/GPT-SoVITS-v5
E:/soft/GPT-SoVITS-v5/runtime/python.exe api_v2.py -a 127.0.0.1 -p 9880 -c tts_infer_v5.yaml
```

用 v5 底下的 `runtime/`（从 `F:/dl/GPT-SoVITS-v2pro-20250604.7z` 解出来的便携环境，自带 ffmpeg/ffprobe），不要包 `conda run`。`api_v2.py` 头部已把 `sys.path` 修到 `tools` 导入之前，便携 python 不自动加脚本目录，顺序错了就 `No module named 'tools'`。

调法（`tools/voice/gpt-sovits.ts`，走 GET `/tts`；默认 `endpoint: "/"` 是旧 v1 `api.py` 口径，连 v5 必须设 `GSTS_ENDPOINT=/tts`）：

```ts
import { synthesizeOnce, readGptSoVitsConfig } from "../../tools/voice/gpt-sovits"

const audio = await synthesizeOnce(readGptSoVitsConfig(), {
    text: "新增金色魔之楔本体掉落。",
    textLang: "zh",
    refAudioPath: "refs/story_story_1002_101002_1948E9DE.wav",
    promptText: "参考音频的原文（必须与音频一致）",
    promptLang: "zh",
})
await Bun.write(".tmp/x.wav", new Uint8Array(audio))
```

环境变量：`GSTS_API_URL`（默认 `http://127.0.0.1:9880`）、`GSTS_ENDPOINT`（v5 填 `/tts`）、`GSTS_TIMEOUT_MS`（默认 120000）、`GSTS_RETRIES`（默认 2）。

注意：

- 模型版本：`custom.version=v5turbo` 是蒸馏版（快，默认）；满血版是 `v5dev`（`s2Gv5dev.pth`，本地已有），把 `custom` 的 `version` / `vits_weights_path` 改成 v5dev 那段的值后重启。旁白批量跑用 turbo 即可，追求质量再换 dev。
- 参考音频必须 3~10s（服务端硬校验，超了直接 400 `参考音频在3~10秒范围外`）；`refs/` 里 11~19s 的旁白参考先用 ffmpeg 截一段再当 v5 的 ref。
- `prompt_text` 必须与参考音频内容一致（对不上会吐 0.5s 级的短垃圾音频）；不知道内容就拿 FunASR 先听写一遍。
- `text_lang` / `prompt_lang` 中文填 `zh`；
- 长句切分走服务端 `text_split_method=cut5`（默认），client 没透出该参数，8s 以上的句子仍按第 4 节拆文案。
- 换微调声线（`SoVITS_weights_v5turbo` 下的 LoRA）：调 `/set_gpt_weights` + `/set_sovits_weights` 切换，无需重启。
