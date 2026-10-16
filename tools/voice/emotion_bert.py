#!/usr/bin/env python3
"""真实 BERT 中文情绪分类：Johnson8187/Chinese-Emotion-Small（mDeBERTa-v3-base 微调）。

LABEL 标定（2026-10 实测探针验证，非猜测）：
  0 neutral / 1 concerned->tender / 2 happy / 3 angry /
  4 sad / 5 questioning->neutral / 6 surprise / 7 disgusted->angry
用法：emotion_bert.py --input items.json --output result.json [--model DIR]
输入：[{"id": 123, "text": "..."}]  输出：[{"id": 123, "emotion": "happy", "raw": 2, "score": 0.81}]
"""

import argparse
import json

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

LABEL_TO_EMOTION = {
    0: "neutral",
    1: "tender",
    2: "happy",
    3: "angry",
    4: "sad",
    5: "neutral",
    6: "surprise",
    7: "angry",
}

LOW_CONFIDENCE_THRESHOLD = 0.35


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--batch-size", type=int, default=32)
    args = parser.parse_args()

    with open(args.input, encoding="utf-8") as f:
        items = json.load(f)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    tokenizer = AutoTokenizer.from_pretrained(args.model, use_fast=False)
    model = AutoModelForSequenceClassification.from_pretrained(args.model).to(device).eval()

    results = []
    with torch.no_grad():
        for i in range(0, len(items), args.batch_size):
            batch = items[i : i + args.batch_size]
            encoded = tokenizer(
                [item["text"][:256] for item in batch],
                return_tensors="pt",
                padding=True,
                truncation=True,
                max_length=256,
            ).to(device)
            probs = torch.softmax(model(**encoded).logits, dim=-1)
            for item, prob in zip(batch, probs):
                scores = prob.tolist()
                raw = max(range(len(scores)), key=lambda k: scores[k])
                score = scores[raw]
                emotion = LABEL_TO_EMOTION[raw] if score >= LOW_CONFIDENCE_THRESHOLD else "neutral"
                results.append({"id": item["id"], "emotion": emotion, "raw": raw, "score": round(score, 4)})

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False)


if __name__ == "__main__":
    main()
