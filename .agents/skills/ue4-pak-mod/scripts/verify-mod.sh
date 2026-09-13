#!/usr/bin/env bash
# verify-mod.sh — 校验一个 mod .pak 的格式与内容完整性
#
#   用法: verify-mod.sh <mod.pak> [pakRoot]
#
#   pakRoot 可选：若给出（即 build-mod.sh 用过的中间目录），会把 pak 解包后
#   与 pakRoot 里的构建产物逐字节比对 —— 这是「pak 真的写对了」的最直接证据。
#
# 检查项：
#   1. pak 元数据（挂载点 / 版本 / 是否加密 / 压缩 / path hash seed）
#   2. 包内路径列表（挂载点去掉后必须等于真实的游戏内路径）
#   3. 解包后与构建产物逐字节一致
#
# 退出码：0 全部通过；1 用法/环境错误；2 有检查项失败

set -euo pipefail

PAK="${1:-}"
PAK_ROOT="${2:-}"
if [[ -z "$PAK" ]]; then
    sed -n '2,18p' "$0"
    exit 1
fi

REPAK="${REPAK:-/d/dev/dna-unpack/repak.exe}"

[[ -f "$PAK" ]]   || { echo "找不到 pak: $PAK" >&2; exit 1; }
[[ -f "$REPAK" ]] || { echo "找不到 repak: $REPAK" >&2; exit 1; }

# 转绝对路径，避免后面 cd / 相对路径混用
PAK="$(printf '%s/%s' "$(cd "$(dirname "$PAK")" && pwd)" "$(basename "$PAK")")"
if [[ -n "$PAK_ROOT" ]]; then
    # 注意：build-mod.sh 的默认中间目录是 <skill>/.tmp/pakroot，不是仓库的 .tmp
    [[ -d "$PAK_ROOT" ]] || { echo "找不到构建产物目录: $PAK_ROOT（应指向 build-mod.sh 的 <WORK_DIR>/pakroot）" >&2; exit 1; }
    PAK_ROOT="$(cd "$PAK_ROOT" && pwd)"
fi
WIN_PAK="$(if command -v cygpath >/dev/null 2>&1; then cygpath -w "$PAK"; else printf '%s' "$PAK"; fi)"

echo "===== 1. 元数据 ====="
"$REPAK" info "$WIN_PAK"

echo
echo "===== 2. 包内路径 ====="
"$REPAK" list "$WIN_PAK"

if [[ -z "$PAK_ROOT" ]]; then
    echo
    echo "（未提供 pakRoot，跳过内容比对）"
    exit 0
fi

echo
echo "===== 3. 解包后与构建产物比对 ====="
UNPACKED="$(dirname "$PAK_ROOT")/unpacked"
rm -rf "$UNPACKED"
mkdir -p "$UNPACKED"
"$REPAK" unpack "$WIN_PAK" -o "$(cygpath -w "$UNPACKED" 2>/dev/null || printf '%s' "$UNPACKED")" >/dev/null

ok=0; bad=0
# 遍历构建产物，逐个和 pak 里解出来的同名文件比对
while IFS= read -r -d '' f; do
    rel="${f#"$PAK_ROOT"/}"
    if [[ ! -f "$UNPACKED/$rel" ]]; then
        echo "MISSING  包内缺少 $rel"; bad=$((bad+1))
    elif cmp -s "$f" "$UNPACKED/$rel"; then
        ok=$((ok+1))
    else
        echo "MISMATCH $rel"; bad=$((bad+1))
    fi
done < <(find "$PAK_ROOT" -type f -print0)

echo "逐字节一致: $ok，异常: $bad"
[[ "$bad" -eq 0 ]] && echo "PAK OK" || { echo "PAK 有问题"; exit 2; }
