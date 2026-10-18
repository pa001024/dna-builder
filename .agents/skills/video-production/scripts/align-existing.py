#!/usr/bin/env python3
"""已有音频 → 字幕时间轴：口播稿（中文<TAB>英文）对齐到现成音频，切出每句的开始/结束。

场景：旁白音频是别人录的 / 之前就导出的，只有口播稿没有时间轴。
做法：faster-whisper 出词级时间 → 中文逐字对齐到口播稿 → 按锚点插值给出每行的 start/end。
（whisper 的字可能漏/错，所以只用它定时间，字幕文字永远取口播稿原文。）

输出 subs.json，与 narrate.ts 完全同构，后续 asr-check.ts / captions.ts / parts.ts 直接复用。

用法：
  E:/soft/GPT-SoVITS-v2/runtime/python.exe .agents/skills/video-production/scripts/align-existing.py \
    --wav assets/voice.wav --script script.tsv --out .tmp/subs.json
"""

import argparse
import bisect
import difflib
import json
import os
import re
import sys
import subprocess

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

PUNCT = " \t\n，。？！：；、·…—「」『』（）()\"'“”‘’~～,.?!:;|/\\-"
DROP = re.compile("[" + re.escape(PUNCT) + "]")


def wav_duration(path):
    """用 ffprobe 读时长（秒）。"""
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    return float(out)


def transcribe(wav, model_size, lang, device):
    """跑 faster-whisper，返回带词级时间戳的段落。"""
    from faster_whisper import WhisperModel

    model = WhisperModel(model_size, device=device, compute_type="int8")
    segments, _ = model.transcribe(
        wav, language=lang, vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=250),
        condition_on_previous_text=False, word_timestamps=True,
    )
    out = []
    for seg in segments:
        words = []
        for w in seg.words or []:
            text = re.sub(r"\s", "", w.word)
            if text:
                words.append({"w": text, "s": float(w.start), "e": float(w.end)})
        if words:
            out.append({"start": float(seg.start), "end": float(seg.end), "words": words})
    return out


def read_script(path):
    """每行 `中文<TAB>英文`，`#` 与空行跳过；一行 = 一条字幕。"""
    lines = []
    with open(path, encoding="utf-8") as f:
        for raw in f:
            raw = raw.strip()
            if not raw or raw.startswith("#"):
                continue
            parts = re.split(r"\t+", raw)
            zh = parts[0].strip()
            en = parts[1].strip() if len(parts) > 1 else ""
            if zh:
                lines.append({"zh": zh, "en": en})
    if not lines:
        raise SystemExit(f"口播稿为空: {path}")
    return lines


def build_char_timeline(segments):
    """把词级时间摊到每个字上，得到 whisper 的字流与时间。"""
    chars, times, seg_index = [], [], []
    for index, seg in enumerate(segments):
        for word in seg["words"]:
            span = word["e"] - word["s"]
            step = span / len(word["w"])
            for offset, char in enumerate(word["w"]):
                if DROP.match(char):
                    continue
                chars.append(char)
                times.append((word["s"] + offset * step, word["s"] + (offset + 1) * step))
                seg_index.append(index)
    return chars, times, seg_index


def build_anchors(script_chars, whisper_chars, whisper_times):
    """用 SequenceMatcher 的匹配块建「稿子字下标 → 时间」锚点。

    只认真正匹配上的字，未匹配段（ASR 漏字/多念）留给相邻锚点插值，
    这样重复句、语气词都不会把后续时间压塌。
    """
    matcher = difflib.SequenceMatcher(None, whisper_chars, script_chars, autojunk=False)
    anchors = [(0, 0.0)]
    for a, b, size in matcher.get_matching_blocks():
        for k in range(size):
            position = b + k
            if anchors and position <= anchors[-1][0]:
                continue
            anchors.append((position, whisper_times[a + k][0]))
    if whisper_times:
        anchors.append((len(script_chars), whisper_times[-1][1]))
    return anchors


def make_time_at(anchors):
    """构造插值函数：给定稿子字下标，返回该字发声的开始时间。"""
    positions = [a[0] for a in anchors]

    def time_at(position):
        if position <= positions[0]:
            return anchors[0][1]
        if position >= positions[-1]:
            return anchors[-1][1]
        lo = bisect.bisect_left(positions, position)
        p1, t1 = anchors[lo]
        if p1 == position:
            return t1
        p0, t0 = anchors[lo - 1]
        return t0 + (t1 - t0) * (position - p0) / (p1 - p0)

    return time_at


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--wav", required=True)
    parser.add_argument("--script", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--model", default="small")
    parser.add_argument("--lang", default="zh")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--max-gap", type=float, default=8.0, help="单条字幕超过该秒数时提示拆行")
    args = parser.parse_args()

    lines = read_script(args.script)
    total = wav_duration(args.wav)
    segments = transcribe(args.wav, args.model, args.lang, args.device)
    if not segments:
        raise SystemExit("ASR 没有识别出任何内容")

    whisper_chars, whisper_times, _ = build_char_timeline(segments)
    script_chars = [c for c in "".join(line["zh"] for line in lines) if not DROP.match(c)]
    time_at = make_time_at(build_anchors(script_chars, whisper_chars, whisper_times))

    cues, cursor = [], 0
    for index, line in enumerate(lines, 1):
        length = len([c for c in line["zh"] if not DROP.match(c)])
        first = cursor
        end_of_line = cursor + length
        start = max(0.0, min(time_at(first), total))
        end = max(start + 0.3, min(time_at(end_of_line), total))
        if index == len(lines) and total - end <= 2.0:
            end = total
        cues.append({
            "index": index, "zh": line["zh"], "en": line["en"],
            "start": round(start, 3), "end": round(end, 3), "duration": round(end - start, 3), "wav": "",
        })
        cursor = end_of_line

    payload = {"voice": os.path.basename(args.wav), "duration": round(total, 3), "gap": 0.0, "cues": cues}
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"{len(cues)} 条字幕 / 音频 {total:.2f}s → {args.out}")
    for cue in cues:
        flag = "  ⚠ 过长，拆成两行" if cue["duration"] > args.max_gap else ""
        print(f"  {cue['index']:02d} {cue['start']:7.2f} → {cue['end']:7.2f} ({cue['duration']:5.2f}s) {cue['zh']}{flag}")
    if cues and total - cues[-1]["end"] > 1.5:
        print(f"⚠ 末尾 {total - cues[-1]['end']:.2f}s 没有字幕：稿子可能没覆盖整段音频（对白被挪到结尾？）")


if __name__ == "__main__":
    main()
