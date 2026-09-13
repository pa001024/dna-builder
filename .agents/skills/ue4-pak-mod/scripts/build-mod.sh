#!/usr/bin/env bash
# build-mod.sh — 从映射表构建一个可用的 UE4.27 mod .pak
#
#   用法: build-mod.sh <mapping.tsv> <out.pak> [workDir]
#
#   mapping.tsv 每行（制表符分隔，# 开头为注释）：
#     <源 uasset 绝对路径>	<游戏内相对路径(不含扩展名)>	<新导出名>
#   例：
#     D:/dev/dna-unpack/.../Npc_Aida_SM.uasset	EM/Content/Asset/Char/Player/Char035_Eve/Mesh/Eve_Body_SM	Eve_Body_SM
#
# 可用环境变量覆盖默认值：
#   REPAK             repak.exe 路径
#   WORK_DIR          中间产物目录（默认 <skill>/.tmp）
#   PAK_MOUNT         挂载点（默认 ../../../，见 references/pak-and-asset-format.md）
#   PAK_VERSION       pak 版本（默认 V11，UE4.27）
#   PAK_COMPRESSION   压缩算法（默认 Zlib；传空字符串则不压缩）
#   PATH_HASH_SEED    pak path hash seed（十进制；默认取自本机现成 mod 的 0xB233321C）
#
# 退出码：0 成功；1 用法/环境错误；2 构建或校验失败

set -euo pipefail

# ---- 参数与默认值 ----------------------------------------------------------
MAPPING="${1:-}"
OUT_PAK="${2:-}"
if [[ -z "$MAPPING" || -z "$OUT_PAK" ]]; then
    sed -n '2,20p' "$0"
    exit 1
fi

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPAK="${REPAK:-/d/dev/dna-unpack/repak.exe}"
WORK_DIR="${3:-${WORK_DIR:-$SKILL_DIR/.tmp}}"
PAK_MOUNT="${PAK_MOUNT:-../../../}"
PAK_VERSION="${PAK_VERSION:-V11}"
PAK_COMPRESSION="${PAK_COMPRESSION-Zlib}"
PATH_HASH_SEED="${PATH_HASH_SEED:-2989699612}"

# modtool / repak 是原生 Windows 程序，收不了 git-bash 的 /d/... 形式路径，统一转成 D:\...
win() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }

# 把路径转成绝对路径。必须在任何 cd 之前做完 —— 脚本后面会 cd 进 modtool 目录，
# 相对路径到那时就解析错了。
abspath() { printf '%s/%s' "$(cd "$(dirname "$1")" && pwd)" "$(basename "$1")"; }

[[ -f "$MAPPING" ]] || { echo "找不到映射表: $MAPPING" >&2; exit 1; }
[[ -f "$REPAK" ]]   || { echo "找不到 repak: $REPAK（用 REPAK=... 指定）" >&2; exit 1; }

MAPPING="$(abspath "$MAPPING")"
mkdir -p "$WORK_DIR" "$(dirname "$OUT_PAK")"
WORK_DIR="$(cd "$WORK_DIR" && pwd)"
OUT_PAK="$(abspath "$OUT_PAK")"

PAK_ROOT="$WORK_DIR/pakroot"
echo "==> 映射表   : $MAPPING"
echo "==> 中间目录 : $PAK_ROOT"
echo "==> 输出 pak : $OUT_PAK"

# ---- 1. 构建 modtool -------------------------------------------------------
echo "==> [1/3] 编译 modtool"
(cd "$SKILL_DIR/scripts/modtool" && dotnet build -v q --nologo >/dev/null)

# ---- 2. 按映射表生成改名后的资产包 -----------------------------------------
# 先清空，避免上一次的残留文件被打进 pak
echo "==> [2/3] 生成改写后的资产包"
rm -rf "$PAK_ROOT"
mkdir -p "$PAK_ROOT"
(cd "$SKILL_DIR/scripts/modtool" && dotnet run --no-build -- build "$(win "$MAPPING")" "$(win "$PAK_ROOT")")

# ---- 3. 校验构建结果 -------------------------------------------------------
# 导出名是否等于目标名（否则 UE 查不到对象）、载荷是否与源文件逐字节一致
echo "==> [3/3] 校验构建结果"
(cd "$SKILL_DIR/scripts/modtool" && dotnet run --no-build -- check "$(win "$MAPPING")" "$(win "$PAK_ROOT")")

# ---- 4. 打包 ---------------------------------------------------------------
echo "==> 打包"
PACK_ARGS=(pack -m "$PAK_MOUNT" --version "$PAK_VERSION" -p "$PATH_HASH_SEED")
[[ -n "$PAK_COMPRESSION" ]] && PACK_ARGS+=(--compression "$PAK_COMPRESSION")
mkdir -p "$(dirname "$OUT_PAK")"
"$REPAK" "${PACK_ARGS[@]}" "$(win "$PAK_ROOT")" "$(win "$OUT_PAK")"

echo "==> 完成: $OUT_PAK ($(du -h "$OUT_PAK" | cut -f1))"
"$REPAK" info "$(win "$OUT_PAK")"
