#!/usr/bin/env python3
"""FunASR（SeACo-Paraformer）批量 ASR + CER，专抓 GPT-SoVITS 丢字。
用法：asr_verify.py --input items.json --output result.json [--model paraformer-zh]
输入：[{"id": 123, "wav": "a.wav", "text": "期望文本"}]
输出：[{"id": 123, "transcript": "...", "cer": 0.12}]
"""

import argparse
import json
import re
import unicodedata


def edit_distance(a, b):
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[len(b)]


def normalize(text):
    text = unicodedata.normalize("NFKC", text or "")
    return re.sub(r"[\s，。？！、,.?!~～—…·\"“”\"'‘'()（）<>/\\|｜_*-]", "", text)


def lcs_length(a, b):
    prev = [0] * (len(b) + 1)
    for ca in a:
        cur = [0]
        for j, cb in enumerate(b, 1):
            cur.append(prev[j - 1] + 1 if ca == cb else max(prev[j], cur[j - 1]))
        prev = cur
    return prev[len(b)]


def recall(reference, hypothesis):
    ref = normalize(reference)
    hyp = normalize(hypothesis)
    if not ref:
        return 1.0
    return lcs_length(ref, hyp) / max(1, len(ref))


def missing_spans(reference, hypothesis):
    import difflib

    ref = normalize(reference)
    hyp = normalize(hypothesis)
    matcher = difflib.SequenceMatcher(None, ref, hyp, autojunk=False)
    spans = []
    for tag, i1, i2, _, _ in matcher.get_opcodes():
        if tag == "delete":
            spans.append(ref[i1:i2])
    longest = max([len(span) for span in spans] + [0])
    return longest, len(ref) - lcs_length(ref, hyp)


def cer(reference, hypothesis):
    ref = normalize(reference)
    hyp = normalize(hypothesis)
    if not ref:
        return 0.0 if not hyp else 1.0
    return edit_distance(ref, hyp) / max(1, len(ref))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=False, default="")
    parser.add_argument("--output", required=False, default="")
    parser.add_argument("--model", default="paraformer-zh")
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--serve", action="store_true")
    args = parser.parse_args()

    from funasr import AutoModel

    model = AutoModel(model=args.model, device="cuda", disable_pbar=True)

    if args.serve:
        import sys

        try:
            sys.stdout.reconfigure(encoding="utf-8")
            sys.stdin.reconfigure(encoding="utf-8")
        except Exception:
            pass
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                item = json.loads(line)
                outputs = model.generate(input=[item["wav"]], batch_size=1)
                transcript = outputs[0].get("text", "") if outputs else ""
                longest_missing, missing = missing_spans(item["text"], transcript)
                result = {
                    "id": item["id"],
                    "transcript": transcript,
                    "cer": round(cer(item["text"], transcript), 4),
                    "recall": round(recall(item["text"], transcript), 4),
                    "missing": missing,
                    "longest_missing": longest_missing,
                }
            except Exception as e:
                result = {"id": item.get("id", -1) if isinstance(item, dict) else -1, "transcript": "", "cer": 1.0,
                          "recall": 0.0, "missing": 999, "longest_missing": 999, "error": str(e)[:200]}
            sys.stdout.write(json.dumps(result, ensure_ascii=False) + "\n")
            sys.stdout.flush()
        return
    if not args.input or not args.output:
        raise SystemExit("batch 模式需要 --input 与 --output")
    with open(args.input, encoding="utf-8") as f:
        items = json.load(f)
    results = []
    for i in range(0, len(items), args.batch_size):
        batch = items[i : i + args.batch_size]
        outputs = model.generate(input=[item["wav"] for item in batch], batch_size=args.batch_size)
        for item, output in zip(batch, outputs):
            transcript = output.get("text", "")
            longest_missing, missing = missing_spans(item["text"], transcript)
            results.append({
                "id": item["id"],
                "transcript": transcript,
                "cer": round(cer(item["text"], transcript), 4),
                "recall": round(recall(item["text"], transcript), 4),
                "missing": missing,
                "longest_missing": longest_missing,
            })

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False)


if __name__ == "__main__":
    main()
