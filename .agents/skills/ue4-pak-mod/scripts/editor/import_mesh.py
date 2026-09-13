"""把 Blender 导出的 FBX 导入 UE4.27 工程，并把它"伪装"成游戏原本的资产路径。

烘焙出来的包要能被游戏加载，前提是它内部的引用路径和游戏里已有资产对得上。这个脚本做两件事：

  1. 网格必须引用 `/Game/Asset/Char/Player/Skeleton/Biped_Skeleton`（游戏自带骨架）。
     FBX 导入时 UE 会自己造一个骨架资产，所以要把它改名/挪到游戏的路径上。
  2. 材质槽必须指向游戏里真实的 MI 路径。这里在游戏的 MI 路径上创建"占位材质"：
     占位材质本身不进 pak（我们只挑网格包），它只是让烘焙产物的引用路径正确，
     运行时自然命中游戏自己的 MI。

注意必须走 FBX 而不是 glb：UE4.27 的 glTF 导入器不支持蒙皮网格，只会生成 StaticMesh。
因此导入参数要显式指定 `import_as_skeletal=True`，并且 `automated=False`
（automated=True 时 UE 会忽略 options 自行探测类型，就不再是骨骼网格了）。

参数通过环境变量传入（UE commandlet 拿不到自定义命令行参数）：
    MODKIT_FBX            输入 FBX
    MODKIT_DEST_DIR       目标包目录，如 /Game/Asset/Char/Player/Char035_Eve/Mesh
    MODKIT_DEST_NAME      目标资产名，如 Eve_Part01_SM
    MODKIT_SKELETON       游戏骨架对象路径
    MODKIT_MATERIALS_DIR  游戏材质目录
    MODKIT_SLOT_MAP       可选 JSON: {FBX材质名: 游戏MI名}
"""

import json
import os
import traceback

import unreal

LOG = "MODKIT"


def log(msg):
    unreal.log("%s %s" % (LOG, msg))


def arg(name):
    v = os.environ.get(name)
    if not v:
        raise RuntimeError("缺少环境变量 %s" % name)
    return v


def assets_in(path):
    """用 AssetRegistry 枚举目录下的资产（返回 [(对象路径, 类名)]）。"""
    reg = unreal.AssetRegistryHelpers.get_asset_registry()
    out = []
    for d in reg.get_assets_by_path(path, recursive=False):
        out.append(("%s.%s" % (d.package_name, d.asset_name), str(d.asset_class)))
    return out


def placeholder_parent():
    """占位 MIC 的父材质，放在 _modkit 下（不会进 pak，只是让 MIC 合法）。"""
    path = "/Game/_modkit/M_PlaceholderParent"
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        return unreal.EditorAssetLibrary.load_asset(path)
    mat = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
        "M_PlaceholderParent", "/Game/_modkit", unreal.Material, unreal.MaterialFactoryNew())
    if mat is None:
        raise RuntimeError("创建占位父材质失败")
    unreal.EditorAssetLibrary.save_asset(path, only_if_is_dirty=False)
    return mat


def make_placeholder_material(mi_name, materials_dir):
    """在游戏真实 MI 的路径上创建占位材质。

    必须是 **MaterialInstanceConstant**，不能图省事用 UMaterial：
    烘焙产物会把引用按"导入类"写进 import 表，UE 运行时解析导入时会拿这个类做过滤。
    游戏的 MI 就是 MIC（已核对 MI_Eve_Part01_Water 的 imports：MaterialInstanceConstant），
    如果我们的占位是 UMaterial，类对不上 → 解析成空材质 → 模型变默认灰。
    占位资产本身不会进 pak（我们只挑网格包），它只负责让引用路径与类型都正确。
    """
    obj_path = "%s/%s" % (materials_dir, mi_name)
    if unreal.EditorAssetLibrary.does_asset_exist(obj_path):
        return unreal.EditorAssetLibrary.load_asset(obj_path)

    factory = unreal.MaterialInstanceConstantFactoryNew()
    parent = placeholder_parent()
    try:
        factory.set_editor_property("initial_parent", parent)
    except Exception:
        log("  注：factory.initial_parent 设不上，改为建完后设 parent")

    mic = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
        mi_name, materials_dir, unreal.MaterialInstanceConstant, factory)
    if mic is None:
        raise RuntimeError("创建占位材质失败: %s" % obj_path)
    if mic.get_editor_property("parent") is None:
        mic.set_editor_property("parent", parent)
    unreal.EditorAssetLibrary.save_asset(obj_path, only_if_is_dirty=False)
    log("  占位材质 %s (类=%s, 父=%s)" % (obj_path, mic.get_class().get_name(),
                                        mic.get_editor_property("parent").get_path_name()))
    return mic


def main():
    fbx = arg("MODKIT_FBX")
    dest_dir = arg("MODKIT_DEST_DIR")
    dest_name = arg("MODKIT_DEST_NAME")
    skeleton_path = arg("MODKIT_SKELETON")
    materials_dir = arg("MODKIT_MATERIALS_DIR")
    slot_map = json.loads(os.environ.get("MODKIT_SLOT_MAP", "{}"))

    log("导入 %s -> %s/%s" % (fbx, dest_dir, dest_name))

    # ---- 0. 清掉目标路径上上一轮留下的占位 ----
    # 骨架和材质都是靠"改名到游戏路径"实现的，目标已存在时改名会失败；而 skeleton /
    # material_interface 这类属性在 Python 侧要么只读、要么改了不落盘（见下面的注释）。
    # 所以每轮先把占位清掉，保证始终走改名这条已验证的路径。
    # 注意：materials_dir 在烘焙工程里只放我们造的占位材质，删干净是安全的。
    if unreal.EditorAssetLibrary.does_asset_exist(skeleton_path):
        unreal.EditorAssetLibrary.delete_asset(skeleton_path)
        log("清掉旧骨架占位 %s" % skeleton_path)
    # 目标网格也删掉：只靠 replace_existing 替换会残留上一轮的材质槽（实测槽数会累积），
    # 而从零导入才能保证槽数与 FBX 一致。
    mesh_path_pre = "%s/%s" % (dest_dir, dest_name)
    if unreal.EditorAssetLibrary.does_asset_exist(mesh_path_pre):
        unreal.EditorAssetLibrary.delete_asset(mesh_path_pre)
        log("清掉旧网格 %s" % mesh_path_pre)
    if unreal.EditorAssetLibrary.does_directory_exist(materials_dir):
        for p in unreal.EditorAssetLibrary.list_assets(materials_dir, recursive=True, include_folder=False):
            unreal.EditorAssetLibrary.delete_asset(p)
            log("清掉旧材质占位 %s" % p)

    # ---- 1. 以骨骼网格导入 FBX ----
    # 保留强引用：这两个 UObject 是在 Python 里 new 出来的，没有包归属，
    # 一旦被 GC 回收，ImportAssetTasks 内部解引用就会在 SharedPointer.h 的 IsValid() 上崩。
    global _KEEP_ALIVE
    task = unreal.AssetImportTask()
    task.set_editor_property("filename", fbx)
    task.set_editor_property("destination_path", dest_dir)
    task.set_editor_property("destination_name", dest_name)
    task.set_editor_property("automated", True)       # 自动路径会自己探测出 SkeletalMesh
    task.set_editor_property("replace_existing", True)
    task.set_editor_property("save", False)

    ui = unreal.FbxImportUI()
    ui.set_editor_property("import_mesh", True)
    # 两个都设：只设 import_as_skeletal 时工厂仍按 StaticMesh 走
    # （日志里是 "FactoryCreateFile: StaticMesh with FbxFactory"），
    # mesh_type_to_import 才是 FbxFactory::ResolveSupportedClass 真正读的字段。
    ui.set_editor_property("mesh_type_to_import", unreal.FBXImportType.FBXIT_SKELETAL_MESH)
    ui.set_editor_property("import_as_skeletal", True)
    ui.set_editor_property("import_materials", True)    # 先让导入器建材质，再改名到游戏 MI 路径
    ui.set_editor_property("import_textures", False)
    ui.set_editor_property("import_animations", False)
    ui.set_editor_property("create_physics_asset", False)
    ui.set_editor_property("automated_import_should_detect_type", False)
    sk = ui.get_editor_property("skeletal_mesh_import_data")
    sk.set_editor_property("convert_scene", True)
    sk.set_editor_property("convert_scene_unit", True)
    sk.set_editor_property("import_uniform_scale", 1.0)
    sk.set_editor_property("import_morph_targets", False)
    sk.set_editor_property("import_mesh_lo_ds", False)
    sk.set_editor_property("use_t0_as_ref_pose", False)
    sk.set_editor_property("update_skeleton_reference_pose", False)
    ui.set_editor_property("skeletal_mesh_import_data", sk)
    task.set_editor_property("options", ui)
    _KEEP_ALIVE = [task, ui, sk]

    # 回读一遍，确认属性真的设进去了（设不上会静默按 StaticMesh 走）
    log("options 校验: mesh_type_to_import=%s import_as_skeletal=%s options=%s"
        % (ui.get_editor_property("mesh_type_to_import"),
           ui.get_editor_property("import_as_skeletal"),
           task.get_editor_property("options")))

    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    log("导入后目录内容: %s" % assets_in(dest_dir))

    mesh_path = "%s/%s" % (dest_dir, dest_name)
    if not unreal.EditorAssetLibrary.does_asset_exist(mesh_path):
        raise RuntimeError("导入没有产出 %s，检查上面的导入日志" % mesh_path)
    mesh = unreal.EditorAssetLibrary.load_asset(mesh_path)
    log("得到 %s (%s)" % (mesh_path, mesh.get_class().get_name()))
    if not isinstance(mesh, unreal.SkeletalMesh):
        raise RuntimeError("%s 不是 SkeletalMesh 而是 %s —— import_as_skeletal 没生效"
                           % (mesh_path, mesh.get_class().get_name()))

    # ---- 2. 把自动生成的骨架挪到游戏的真实路径 ----
    skeletons = [(p, c) for p, c in assets_in(dest_dir) if "Skeleton" in c]
    log("目录内骨架: %s" % [p for p, _ in skeletons])
    if not skeletons:
        raise RuntimeError("导入没有产生 USkeleton；检查 FBX 是否带蒙皮")
    auto_path = sorted(skeletons, key=lambda kv: 0 if os.path.basename(kv[0]).startswith(dest_name) else 1)[0][0]

    if auto_path != skeleton_path:
        if unreal.EditorAssetLibrary.does_asset_exist(skeleton_path):
            # 重复烘焙时骨架占位已存在：直接指向它，把新造的那个删掉
            log("骨架 %s 已存在，改指过去并删除新造的 %s" % (skeleton_path, auto_path))
            mesh.set_editor_property("skeleton", unreal.EditorAssetLibrary.load_asset(skeleton_path))
            unreal.EditorAssetLibrary.delete_asset(auto_path)
        else:
            unreal.EditorAssetLibrary.make_directory(skeleton_path.rsplit("/", 1)[0])
            ok = unreal.EditorAssetLibrary.rename_asset(auto_path, skeleton_path)
            log("骨架改名 %s -> %s : %s" % (auto_path, skeleton_path, ok))
            if not ok:
                raise RuntimeError("骨架改名失败")

    skel = mesh.get_editor_property("skeleton")
    log("网格骨架 = %s" % (skel.get_path_name() if skel else "None"))
    if not skel or not str(skel.get_path_name()).startswith(skeleton_path):
        raise RuntimeError("网格没有指向 %s" % skeleton_path)

    # ---- 3. 材质槽指向游戏的真实 MI 路径 ----
    # 这里必须重建成新的 FSkeletalMaterial 结构体再整体赋回：就地修改
    # get_editor_property("materials") 拿到的结构体副本、或者只 set material_interface，
    # 都不会落到烘焙产物里（烘焙包的 imports 里查不到 MI，只有槽名进了 NameMap）。
    # 骨架那边用"改名"就够了（改名会被 UE 自动修引用），材质这边必须显式写入引用。
    materials = mesh.get_editor_property("materials")
    log("材质槽 %d 个" % len(materials))

    rebuilt = []
    for m in materials:
        slot_name = m.get_editor_property("material_slot_name")
        mi_name = slot_map.get(str(slot_name), str(slot_name))
        placeholder = make_placeholder_material(mi_name, materials_dir)
        sm = unreal.SkeletalMaterial()
        sm.set_editor_property("material_slot_name", slot_name)
        sm.set_editor_property("material_interface", placeholder)
        rebuilt.append(sm)
        log("  槽 %s -> %s" % (slot_name, placeholder.get_path_name()))
    mesh.set_editor_property("materials", rebuilt)

    # 回读确认引用真的写进去了
    check = mesh.get_editor_property("materials")
    for m in check:
        cur = m.get_editor_property("material_interface")
        log("  校验槽 %s = %s" % (m.get_editor_property("material_slot_name"),
                                 cur.get_path_name() if cur else "None"))

    unreal.EditorAssetLibrary.save_asset(mesh_path, only_if_is_dirty=False)
    unreal.EditorLoadingAndSavingUtils.save_dirty_packages(True, True)
    log("RESULT mesh=%s skeleton=%s slots=%d" % (mesh_path, skel.get_path_name(), len(rebuilt)))
    log("DONE")


try:
    main()
except Exception:
    log("FAILED\n%s" % traceback.format_exc())
    raise
