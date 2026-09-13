#!/usr/bin/env bash
# setup-project.sh — 创建（或重建）UE4.27 烘焙工程
#
#   用法: setup-project.sh [工程根目录]     默认 D:/dev/ue-modkit
#
# 工程名必须叫 **EM**：UE 烘焙时按工程名生成输出目录，叫 EM 才能烘出
# `EM/Content/Asset/...`，正好等于游戏 pak 的内部路径，也正好和挂载点规则对上。
# 改成别的名字，烘焙产物就会落在 `<其他名>/Content/...`，pak 里路径全错。
#
# 插件说明：
#   PythonScriptPlugin        —— 无头驱动脚本的唯一入口（4.27 没有 -ExecutePythonScript）
#   EditorScriptingUtilities  —— 提供 unreal.EditorAssetLibrary；不启用会 AttributeError
#   （不需要 GLTFImporter：4.27 的 glTF 导入器不支持蒙皮网格，一律走 FBX）
set -euo pipefail

MODKIT_DIR="${1:-${MODKIT_DIR:-/d/dev/ue-modkit}}"
PROJ="$MODKIT_DIR/EM"

mkdir -p "$PROJ/Config" "$PROJ/Content"

cat > "$PROJ/EM.uproject" <<'EOF'
{
	"FileVersion": 3,
	"EngineAssociation": "4.27",
	"Category": "",
	"Description": "Duet Night Abyss mod cooking project. The project MUST stay named EM: cooked content lands under EM/Content/..., which is exactly the mount path the game expects.",
	"Modules": [],
	"Plugins": [
		{ "Name": "PythonScriptPlugin", "Enabled": true },
		{ "Name": "EditorScriptingUtilities", "Enabled": true }
	]
}
EOF

cat > "$PROJ/Config/DefaultEngine.ini" <<'EOF'
[/Script/Engine.Engine]
bUseFixedFrameRate=False

[/Script/Engine.RendererSettings]
r.DefaultFeature.AutoExposure=False

[Internationalization]
bEnableLocalizedOverrides=False
EOF

cat > "$PROJ/Config/DefaultGame.ini" <<'EOF'
[/Script/UnrealEd.ProjectPackagingSettings]
bSkipEditorContent=True
bCompressed=False
EOF

echo "工程已创建: $PROJ"
echo "  下一步: scripts/editor/build-mod-editor.sh <输入.glb> <游戏内相对路径> <输出.pak>"
echo
echo "提示：工程首次 cook 会在 $PROJ/DerivedDataCache 和 $PROJ/Saved 下产生缓存，"
echo "      体积可能到几 GB，别放进仓库。"
