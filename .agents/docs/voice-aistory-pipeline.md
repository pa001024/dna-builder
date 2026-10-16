# 剧情 AI 补语音流水线（aistory）

`quest.data.ts` 约 19863 条对白中 ~7630 条没有 `voice`（可说 ~7474 条）。
本流水线用**真实 BERT**做情绪分类，按「角色 + 情绪」挑 `charvoice.data.ts` 参考语音，
喂给本机 **GPT-SoVITS-v2** 合成，产物进 `dna-voice-dataset/<lang>/aistory`，
前端经 `extvoice.data.ts` 回退播放并打 AI 标识。全链已实测跑通。

## 情绪分类：真实 BERT（非关键词）

- 模型：`Johnson8187/Chinese-Emotion-Small`（mDeBERTa-v3-base 微调，中文多情绪对话数据），
  本地目录 `.tmp/voice-models/chinese-emotion-small`（1.12G，首次运行已下载）。
- LABEL 标定（探针实测，非猜测）：0 neutral / 1 concerned→tender / 2 happy / 3 angry /
  4 sad / 5 questioning→neutral / 6 surprise / 7 disgusted→angry；top 置信度 < 0.35 回 neutral。
- 推理环境：`E:/soft/GPT-SoVITS-v2/runtime/python.exe`（torch 2.0 cu118 + transformers 4.36，
  RTX 3080 上 12 条约 11s，含模型一次性加载；7474 条整批一次加载）。
- 注意：模型无 fear 标签，恐惧文本会被归到最接近的 sad/angry/surprise。

## TTS：本机 GPT-SoVITS-v2

```powershell
cd E:/soft/GPT-SoVITS-v2
./runtime/python.exe api_v2.py   # v2 预训练权重 + cuda half，端口 9880，接口挂在 /（非 /tts）
```

- `tools/voice/gpt-sovits.ts`：`GSTS_API_URL`（默认 `http://127.0.0.1:9880`），
  `GSTS_ENDPOINT`（默认 `/`，老版 api.py 才用 `/tts`）。`ref_audio_path` 必填，
  故无参考语音（旁白/未映射 npc）的条目会被跳过；`media_type` 只取 wav，
  ogg（opus 64k）由 `ffmpeg.exe` 本地转（转码命令见下）。
- 参考音频：`resolve-ref-audio.ts` 按 `char` 口径从 modelscope CDN 下载参考 ogg，
  缓存 `.tmp/voice-ref-audio` 并转 32k 单声道 wav 后喂给 TTS。

## 数据口径

- `src/data/d/extvoice.data.ts`：对话 id → AI 语音映射（`voice: "aistory/<对话id>"`），
  由 `synthesize.ts` 输出的 `extvoice.fragment.ts` 合并而成，已纳入数据包改写名单。
- 文件命名：`voice_<lang>_aistory_<对话id>[_m|_f].ogg`，与 `buildDialogueVoiceUrl` 的
  `<lang>/<folder>/voice_<lang>_<folder>_<rest>` 规则对齐（folder=`aistory`）。
- 性别：中文同音词（他/她）只出一版；有实际发音差异的语言出 `_m` / `_f` 两版。
- 昵称：合成前删除 `{nickname}` / `{nickname2}` 占位符（见 `text-prep.ts`）。

## 运行顺序

```bash
pnpm voice:scan --speakable-only            # .tmp/voice-missing.json + voice-npc-char.json
pnpm voice:ref-index                        # .tmp/voice-ref-index.json（角色×情绪→参考语音+原文）
pnpm voice:story-index                      # .tmp/voice-story-index.json（中文名→已有剧情语音声纹）
pnpm voice:synth --lang zh-CN --limit 50 --dry-run   # 预演：只写 extvoice.fragment.ts
pnpm voice:synth --lang zh-CN --limit 0             # 全量：--limit 0 = 不限；后台跑 + 断点续跑
ffmpeg.exe -y -i in.wav -c:a libopus -b:a 64k voice_ch_aistory_<id>.ogg
pnpm voice:upload --lang ch --write             # 拷入 ../dna-voice-dataset/ch/aistory
```

全量说明：`synthesize.ts` 默认合成后直转 ogg（opus 64k，wav 删档，`--keep-wav` 保留）；
已落盘的 ogg 自动跳过（断点续跑）；单条失败只记 `failed` 日志不中断；每 20 条打一次进度。
7474 条可说对白按参考来源自动分流（每条取第一条命中的）：

| 参考来源 | 规模 | 说明 |
|---|---|---|
| npc→charId 直连角色声纹 | ~1073 | 主角占位 NPC 等 |
| 同 npc 已有剧情语音（情绪匹配） | ~455 | 如 10012703 的 `_m`/`_f` 实录 |
| 中文名直连角色声纹 | ~694 | 如 黎瑟→4101（`char_Lise_*`），只做兜底 |
| 中文名匹配已有剧情语音 | ~777 | 如 白→其 906 条实录；`speakerName` 为 `???` 等占位时强制回退 npc 名，禁止按占位符匹配 |
| 真无声纹（跳过） | ~4475 | 如 蕾伊/克罗格/罗连特：无角色、无任何实录，待定音色方案 |

环境变量：`GSTS_API_URL` / `GSTS_ENDPOINT` / `GSTS_TIMEOUT_MS` / `GSTS_RETRIES`、
`VOICE_EMOTION_MODEL_DIR`、`VOICE_DATASET_ROOT`、`FFMPEG_PATH`、`HF_TOKEN` +
`VOICE_EMOTION_MODEL`（改走 HuggingFace API 时，`--emotion hf-api`）。

主角 `_m` 必须用男声参考：`--male-ref <男声wav绝对路径或char res>`（或 `VOICE_MALE_REF`）。
未配置时 `_m` 直接跳过，绝不拿女声凑数；同文本多变体只合成一次后转拷。

## 参考语音两路来源

- 可玩角色：npc→charId→`charvoice.data.ts`（情绪匹配，`refVoice` 字段）。
- 剧情 NPC：中文名→已有剧情语音声纹（`voice-story-index.json`，340 个名字/1983 候选，`refStoryVoice` 字段）。
  参考音频从 modelscope 按 `_f` / `_m` / 无后缀依次试下，prompt 用原台词。故事参考不做情绪对齐（同声纹优先），
  有 404 的 key 会记 `failed` 跳过。

## 前端

- `src/utils/ext-voice.ts`：原生 voice 优先，无则回退 `extVoiceMap`，返回 `{url, ai}`。
- `DBQuestStoryNodes.vue` + `DBDialogueCard.vue`（`voiceAi` prop）：AI 语音显示
  `db-quest-story-nodes.ai_voice` 角标，悬停见 `ai_voice_tip` 说明。
