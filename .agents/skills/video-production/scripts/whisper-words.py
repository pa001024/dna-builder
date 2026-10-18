#!/usr/bin/env python3
"""词级时间戳（faster-whisper，CPU int8），两个用途：

1. 句内卡拉OK高亮 / 逐词弹出：拿到每个词的 start/end；
2. 独立核对：把 whisper 的分句边界和 narrate.ts 的句级时间对一遍，偏差 > 0.3s 说明文案或音频有问题。

用法：
  E:/soft/GPT-SoVITS-v2/runtime/python.exe .agents/skills/video-production/scripts/whisper-words.py \
    --wav .tmp/voice.wav --out .tmp/words.json [--model small] [--lang zh]
"""

import argparse
import json


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--wav", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--model", default="small")
    parser.add_argument("--lang", default="zh")
    parser.add_argument("--device", default="cpu")
    args = parser.parse_args()

    from faster_whisper import WhisperModel

    model = WhisperModel(args.model, device=args.device, compute_type="int8")
    segments, _ = model.transcribe(
        args.wav,
        language=args.lang,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=250),
        condition_on_previous_text=False,
        word_timestamps=True,
    )
    out = []
    for seg in segments:
        out.append({
            "start": round(seg.start, 3),
            "end": round(seg.end, 3),
            "text": seg.text.strip(),
            "words": [{"w": w.word, "s": round(w.start, 3), "e": round(w.end, 3)} for w in (seg.words or [])],
        })
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    tail = out[-1]["end"] if out else 0.0
    print(f"segments {len(out)}  end {tail}")


if __name__ == "__main__":
    main()
