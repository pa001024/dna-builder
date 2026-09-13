"""把游戏导出的 glb 转成可以喂给 UE4.27 的 FBX。

为什么必须走 FBX 而不是 glb：UE4.27 自带的 glTF 导入器不支持蒙皮网格
（日志里报 `Mesh has joint weights which are not supported`，只会生成 StaticMesh）。
FBX 是 4.27 原生支持的骨骼网格导入路径。

这个脚本两种用法：
  1) 纯转换（无头）：MODKIT_GLB=<glb> MODKIT_FBX=<out.fbx> blender --background --python 本脚本
  2) 你已经在 Blender 里改完了：MODKIT_FBX=<out.fbx> MODKIT_NO_IMPORT=1 ...
     这时直接导出当前场景，不再导入 glb。

UE 侧关键参数（和 Blender 的 "Unreal Engine" FBX 预设一致）：
  - axis_forward=-Z / axis_up=Y       UE 的坐标约定
  - add_leaf_bones=False              不能有末端叶骨，否则 UE 骨架会多出一堆空骨骼
  - armature_nodetype=ROOT            根骨骼用 ROOT 节点
  - primary/secondary_bone_axis=X/Y   骨骼朝向与 UE 一致
单位：glTF 按规范以米为单位，游戏里是厘米。脚本会实测模型尺寸自动判断是否需要 ×100，
把结果打到日志里，避免出现"导进去只有 1.7 厘米高"这种问题。
"""

import os
import sys

import bpy
from mathutils import Vector

GLB = os.environ.get("MODKIT_GLB", "")
FBX = os.environ["MODKIT_FBX"]
NO_IMPORT = os.environ.get("MODKIT_NO_IMPORT", "") not in ("", "0")


def log(msg):
    print("BLENDER %s" % msg)
    sys.stdout.flush()


def scene_dims():
    """场景里所有网格的世界坐标包围盒尺寸，用来判断单位（米 vs 厘米）。"""
    lo = [1e18] * 3
    hi = [-1e18] * 3
    for ob in bpy.data.objects:
        if ob.type != "MESH":
            continue
        # 用 matrix_world 把局部包围盒角点变换到世界坐标，避免忽略父级/骨架的变换
        for corner in ob.bound_box:
            w = ob.matrix_world @ Vector(corner)
            for i in range(3):
                lo[i] = min(lo[i], w[i])
                hi[i] = max(hi[i], w[i])
    return [hi[i] - lo[i] for i in range(3)], lo, hi


def drop_unskinned_junk():
    """删掉没有蒙皮权重的网格。

    FModel 导出的 glb 里除了真正的 LOD 网格，还会夹带一些辅助网格（实测是
    "Icosphere"：42 顶点、0 个顶点组、没有材质槽）。UE 的骨骼网格导入会把同一骨架下
    的网格合并成一个 SkeletalMesh，这些垃圾会被一起并进去，变成模型上多出来的一块。
    """
    skinned = [o for o in bpy.data.objects if o.type == "MESH" and len(o.vertex_groups) > 0]
    if not skinned:
        log("警告：场景里没有任何带蒙皮的网格，跳过清理")
        return
    for ob in [o for o in bpy.data.objects if o.type == "MESH" and len(o.vertex_groups) == 0]:
        log("清理无蒙皮网格 %s (%d 顶点)" % (ob.name, len(ob.data.vertices)))
        bpy.data.objects.remove(ob, do_unlink=True)


def report():
    arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    log("骨架 %d 个，网格 %d 个" % (len(arms), len(meshes)))
    for a in arms:
        log("  骨架 %s: %d 根骨骼" % (a.name, len(a.data.bones)))
    for m in meshes:
        mats = [ms.material.name if ms.material else "<空>" for ms in m.material_slots]
        vg = len(m.vertex_groups)
        log("  网格 %s: %d 顶点, %d 顶点组, 材质槽 %s" % (m.name, len(m.data.vertices), vg, mats))
    dims, lo, hi = scene_dims()
    log("尺寸 (m?) = %.4f x %.4f x %.4f" % tuple(dims))
    return max(dims)


def main():
    if not NO_IMPORT:
        if not GLB or not os.path.exists(GLB):
            raise RuntimeError("MODKIT_GLB 无效: %r" % GLB)
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=GLB)
        log("已导入 %s" % GLB)

    drop_unskinned_junk()
    maxdim = report()

    # 角色/道具在游戏里都是厘米量级（人形 ~170）。若实测是米量级就 ×100 转厘米。
    scale = 100.0 if maxdim < 10.0 else 1.0
    log("最大尺寸 %.4f -> FBX 导出缩放 = %g" % (maxdim, scale))

    os.makedirs(os.path.dirname(FBX), exist_ok=True)
    bpy.ops.export_scene.fbx(
        filepath=FBX,
        use_selection=False,
        object_types={"ARMATURE", "MESH"},
        global_scale=scale,
        apply_scale_options="FBX_SCALE_NONE",
        axis_forward="-Z",
        axis_up="Y",
        primary_bone_axis="X",
        secondary_bone_axis="Y",
        armature_nodetype="ROOT",
        add_leaf_bones=False,          # UE 不要叶骨
        bake_anim=False,
        mesh_smooth_type="FACE",
        use_mesh_modifiers=True,
        path_mode="AUTO",
        embed_textures=False,
    )
    log("已导出 %s (%d 字节)" % (FBX, os.path.getsize(FBX)))
    log("DONE")


main()
