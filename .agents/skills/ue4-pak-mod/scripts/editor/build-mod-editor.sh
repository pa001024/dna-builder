#!/usr/bin/env bash
# build-mod-editor.sh — 编辑器烘焙版 mod 构建
#
#   用法: build-mod-editor.sh <输入.glb> <游戏内相对路径(不含扩展名)> <输出.pak>
#
#   例:  .agents/skills/ue4-pak-mod/scripts/editor/build-mod-editor.sh \
#            Eve_Part01_SM.glb \
#            EM/Content/Asset/Char/Player/Char035_Eve/Mesh/Eve_Part01_SM \
#            EveRoundtripTest_P.pak
#
# 链路：Blender(glb -> FBX) -> UE4.27 工程(导入为骨骼网格 + 骨架/材质占位到游戏路径)
#       -> cook(Unversioned) -> 只挑网格包 -> repak -> pak
#
# 为什么必须走编辑器烘焙：UE4.27 的 glTF 导入器不支持蒙皮网格；而且"改完的网格变回
# 可被游戏加载的烘焙包"这件事没有编辑器免开的开源实现（FModel/CUE4Parse/umodel 全是只读）。
#
# 可覆盖的环境变量：
#   BLENDER    blender.exe
#   UE_CMD     UE4Editor-Cmd.exe
#   MODKIT_DIR 工程与中间产物所在目录（默认 D:/dev/ue-modkit）
#   SKELETON   游戏骨架对象路径（默认 Biped_Skeleton）
#   MAT_DIR    游戏材质目录（默认 <角色目录>/Materials）
#   SLOT_MAP   JSON: {FBX材质名: 游戏MI名}，名字对不上时用
set -euo pipefail

GLB="${1:-}"; DEST_REL="${2:-}"; OUT_PAK="${3:-}"
if [[ -z "$GLB" || -z "$DEST_REL" || -z "$OUT_PAK" ]]; then sed -n '2,20p' "$0"; exit 1; fi

BLENDER="${BLENDER:-/c/Program Files/Blender Foundation/Blender 5.2/blender.exe}"
UE_CMD="${UE_CMD:-/d/soft/UE_4.27/Engine/Binaries/Win64/UE4Editor-Cmd.exe}"
MODKIT_DIR="${MODKIT_DIR:-/d/dev/ue-modkit}"
REPAK="${REPAK:-/d/dev/dna-unpack/repak.exe}"
SEED="${PATH_HASH_SEED:-2989699612}"     # 0xB233321C，取自本机现成 mod

# 脚本自己的目录：blender_glb_to_fbx.py / import_mesh.py 就在旁边
EDITOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 工程不存在就先建，否则第一次用只会报一个看不懂的 "找不到 .uproject"
if [[ ! -f "$MODKIT_DIR/EM/EM.uproject" ]]; then
    echo "==> 工程不存在，先创建"
    "$EDITOR_DIR/setup-project.sh" "$MODKIT_DIR"
fi

# git-bash 会把 /Game/... 这种参数改写成 Windows 路径，必须关掉转换，
# 否则 UE 收到的是 C:/Program Files/Git/Game/... ，会被判成非法包名。
export MSYS_NO_PATHCONV=1
win() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }

DEST_DIR_REL="$(dirname "$DEST_REL")"      # .../Char035_Eve/Mesh
DEST_NAME="$(basename "$DEST_REL")"
CHAR_DIR_REL="$(dirname "$DEST_DIR_REL")"  # .../Char035_Eve
# 游戏内相对路径 -> UE 对象路径（/Game/ 映射到 Content/）
game_path() { printf '/Game/%s' "${1#EM/Content/}"; }
DEST_DIR="$(game_path "$DEST_DIR_REL")"
MAT_DIR="${MAT_DIR:-$(game_path "$CHAR_DIR_REL")/Materials}"
SKELETON="${SKELETON:-/Game/Asset/Char/Player/Skeleton/Biped_Skeleton}"

WORK="$MODKIT_DIR/work"
FBX="$WORK/$DEST_NAME.fbx"
COOKED="$MODKIT_DIR/EM/Saved/Cooked/WindowsNoEditor"
PAKROOT="$MODKIT_DIR/pakroot"

echo "==> 输入     : $GLB"
echo "==> 目标资产 : $DEST_DIR/$DEST_NAME"
echo "==> 骨架     : $SKELETON"
echo "==> 材质目录 : $MAT_DIR"
echo "==> 输出 pak : $OUT_PAK"
mkdir -p "$WORK"

echo "==> [1/4] Blender: glb -> FBX"
MODKIT_GLB="$(win "$GLB")" MODKIT_FBX="$(win "$FBX")" \
    "$BLENDER" --background --factory-startup --python "$(win "$EDITOR_DIR/blender_glb_to_fbx.py")" 2>&1 \
    | grep -aE "BLENDER|Traceback|Error" || true
[[ -f "$FBX" ]] || { echo "FBX 未生成，看上面的 Blender 日志" >&2; exit 2; }

echo "==> [2/4] UE: 导入为骨骼网格（骨架/材质占位到游戏路径）"
MODKIT_FBX="$(win "$FBX")" MODKIT_DEST_DIR="$DEST_DIR" MODKIT_DEST_NAME="$DEST_NAME" \
MODKIT_SKELETON="$SKELETON" MODKIT_MATERIALS_DIR="$MAT_DIR" MODKIT_SLOT_MAP="${SLOT_MAP:-{\}}" \
    "$UE_CMD" "$(win "$MODKIT_DIR/EM/EM.uproject")" -run=PythonScript \
    -Script="$(win "$EDITOR_DIR/import_mesh.py")" -unattended -nullrhi -nosplash -nosound -NoLogTimes \
    -abslog="$(win "$MODKIT_DIR/import.log")" >/dev/null 2>&1 || true
grep -a "MODKIT RESULT" "$MODKIT_DIR/import.log" | tr -d '\r' | tail -1
grep -aq "MODKIT RESULT: OK\|MODKIT RESULT mesh=" "$MODKIT_DIR/import.log" || {
    echo "导入失败，见 $MODKIT_DIR/import.log" >&2
    grep -a "MODKIT FAILED" -A12 "$MODKIT_DIR/import.log" | tr -d '\r' >&2
    exit 2
}

echo "==> [3/4] UE: cook（-Unversioned，与游戏资产的烘焙形态一致）"
rm -rf "$MODKIT_DIR/EM/Saved/Cooked"
"$UE_CMD" "$(win "$MODKIT_DIR/EM/EM.uproject")" -run=Cook -targetplatform=WindowsNoEditor \
    -CookAll -Unversioned -SKIPEDITORCONTENT -NoGameAlwaysCook -unattended -nullrhi -nosplash \
    -nosound -NoLogTimes -stdout -abslog="$(win "$MODKIT_DIR/cook.log")" >/dev/null 2>&1 || true
grep -aq "LogCook: Display: Done!" "$MODKIT_DIR/cook.log" || {
    echo "cook 失败，见 $MODKIT_DIR/cook.log" >&2; exit 2
}

echo "==> [4/4] 打包（只放网格包；骨架与材质占位不能进 pak）"
SRC="$COOKED/EM/Content/${DEST_REL#EM/Content/}"
[[ -f "$SRC.uasset" ]] || { echo "找不到烘焙产物 $SRC.uasset" >&2; exit 2; }
rm -rf "$PAKROOT"; mkdir -p "$(dirname "$PAKROOT/$DEST_REL")"
cp "$SRC.uasset" "$SRC.uexp" "$(dirname "$PAKROOT/$DEST_REL")/"
mkdir -p "$(dirname "$OUT_PAK")"
"$REPAK" pack -m "../../../" --version V11 --compression Zlib -p "$SEED" \
    "$(win "$PAKROOT")" "$(win "$OUT_PAK")" >/dev/null

echo "==> 完成: $OUT_PAK"
"$REPAK" info "$(win "$OUT_PAK")"
echo
echo "装到游戏（注意别和已有的同名 mod pak 冲突）:"
echo "  cp \"$OUT_PAK\" \"/e/game/Duet Night Abyss/DNA Game/EM/Content/Paks/~mods/\""
