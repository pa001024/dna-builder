import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { characterDirectory, readSkinCatalog } from "./catalog"

/** 造一个最小的 Script 目录，只放三张映射表。 */
function fixture(skin: string, model: string, part: string, extra: Record<string, string> = {}): string {
    const root = mkdtempSync(join(tmpdir(), "skin-catalog-"))
    mkdirSync(join(root, "Datas"), { recursive: true })
    writeFileSync(join(root, "Datas/Skin.lua"), skin)
    writeFileSync(join(root, "Datas/Model.lua"), model)
    writeFileSync(join(root, "Datas/CharPartModel.lua"), part)
    for (const [name, source] of Object.entries(extra)) writeFileSync(join(root, "Datas", `${name}.lua`), source)
    return root
}

const PART_LUA = `return ReadOnly("CharPartModel", {
  [110291] = {
    CharPartId = 110291,
    PartPath = "SkeletalMesh'/Game/Asset/Char/Player/Common/Suit/Body/SP10/Mesh/QNF_SP10_Body_SM.QNF_SP10_Body_SM'",
    PartType = "Body"
  },
  [110292] = {
    CharPartId = 110292,
    PartPath = "SkeletalMesh'/Game/Asset/Char/Player/Char016_Fuluo/Mesh/Fuluo_SP01_Hair_SM.Fuluo_SP01_Hair_SM'",
    PartType = "Hair"
  }
})`

describe("skin catalog parsing", () => {
    it("joins Skin → Model → CharPartModel into mesh paths", () => {
        const root = fixture(
            `return ReadOnly("Skin", {
  [1102] = {
    CharId = 1102,
    SkinId = 1102,
    SkinTag = "Fuluo"
  },
  [110201] = {
    CharId = 1102,
    SkinId = 110201,
    SkinModelId = 110299,
    SkinTag = "Fuluo01"
  }
})`,
            `local T = {}
T.RT_86 = {
  110291,
  110292
}
return ReadOnly("Model", {
  [110299] = {
    ModelId = 110299,
    PartModelsId = T.RT_86,
    SkeletonMeshPath = "Asset/Char/Player/Char016_Fuluo/Mesh/Fuluo_Face_SM.Fuluo_Face_SM"
  }
})`,
            PART_LUA
        )
        const catalog = readSkinCatalog(root)
        expect(catalog).toHaveLength(1)
        const entry = catalog[0]
        expect(entry.skinId).toBe(110201)
        expect(entry.charId).toBe(1102)
        expect(entry.tag).toBe("Fuluo01")
        // 脸路径补上 /Game/ 前缀并去掉 .ObjectName
        expect(entry.faceMesh).toBe("/Game/Asset/Char/Player/Char016_Fuluo/Mesh/Fuluo_Face_SM")
        expect(entry.partMeshes).toEqual([
            "/Game/Asset/Char/Player/Common/Suit/Body/SP10/Mesh/QNF_SP10_Body_SM",
            "/Game/Asset/Char/Player/Char016_Fuluo/Mesh/Fuluo_SP01_Hair_SM",
        ])
    })

    it("resolves PartModelsId written as a shared T.RT_N constant", () => {
        const root = fixture(
            `return ReadOnly("Skin", {
  [210102] = {
    CharId = 2101,
    SkinId = 210102,
    SkinModelId = 210199,
    SkinTag = "Shuimu01"
  }
})`,
            `local T = {}
T.RT_12 = {
  110291
}
return ReadOnly("Model", {
  [210199] = {
    ModelId = 210199,
    PartModelsId = T.RT_12,
    SkeletonMeshPath = "Asset/Char/Player/Char021_Shuimu/Mesh/Shuimu_Face_SM.Shuimu_Face_SM"
  }
})`,
            PART_LUA
        )
        const [entry] = readSkinCatalog(root)
        expect(entry.partMeshes).toEqual(["/Game/Asset/Char/Player/Common/Suit/Body/SP10/Mesh/QNF_SP10_Body_SM"])
    })

    it("skips default appearances, where skinId equals charId", () => {
        const root = fixture(
            `return ReadOnly("Skin", {
  [1102] = {
    CharId = 1102,
    SkinId = 1102,
    SkinTag = "Fuluo"
  }
})`,
            `return ReadOnly("Model", {})`,
            PART_LUA
        )
        expect(readSkinCatalog(root)).toEqual([])
    })

    it("includes series skins that have no SkinTag but do have parts", () => {
        // 系列皮肤靠模型表拼「公共体型 + 角色头」，和游戏里一致，没有 SkinTag
        const root = fixture(
            `return ReadOnly("Skin", {
  [11010010] = {
    CharId = 1101,
    SkinId = 11010010,
    SkinModelId = 11010010,
    SkinName = "UI_Skin_Name_0010"
  }
})`,
            `local T = {}
T.RT_29 = {
  110291,
  110292
}
return ReadOnly("Model", {
  [11010010] = {
    ModelId = 11010010,
    PartModelsId = T.RT_29,
    SkeletonMeshPath = "Asset/Char/Player/Char016_Fuluo/Mesh/Fuluo_Face_SM.Fuluo_Face_SM"
  }
})`,
            PART_LUA
        )
        const [entry] = readSkinCatalog(root)
        expect(entry.skinId).toBe(11010010)
        expect(entry.tag).toBe("")
        expect(entry.partMeshes).toEqual([
            "/Game/Asset/Char/Player/Common/Suit/Body/SP10/Mesh/QNF_SP10_Body_SM",
            "/Game/Asset/Char/Player/Char016_Fuluo/Mesh/Fuluo_SP01_Hair_SM",
        ])
    })

    it("skips entries whose model has no PartModelsId (icon-only shop rows)", () => {
        const root = fixture(
            `return ReadOnly("Skin", {
  [11010010] = {
    CharId = 1101,
    SkinId = 11010010,
    SkinModelId = 11010010
  }
})`,
            `return ReadOnly("Model", {
  [11010010] = {
    ModelId = 11010010,
    SkeletonMeshPath = "Asset/Char/Player/Char016_Fuluo/Mesh/Fuluo_Face_SM.Fuluo_Face_SM"
  }
})`,
            PART_LUA
        )
        expect(readSkinCatalog(root)).toEqual([])
    })

    it("ignores nested [n] = { tables that are not top-level entries", () => {
        const root = fixture(
            `return ReadOnly("Skin", {
  [110201] = {
    BattleCharUIMap = {
      [36] = 37
    },
    CharId = 1102,
    SkinId = 110201,
    SkinModelId = 110299,
    SkinTag = "Fuluo01"
  }
})`,
            `local T = {}
T.RT_1 = {
  110291
}
return ReadOnly("Model", {
  [110299] = {
    ModelId = 110299,
    PartModelsId = T.RT_1,
    SkeletonMeshPath = "Asset/Char/Player/Char016_Fuluo/Mesh/Fuluo_Face_SM.Fuluo_Face_SM"
  }
})`,
            PART_LUA
        )
        const catalog = readSkinCatalog(root)
        expect(catalog.map(entry => entry.skinId)).toEqual([110201])
        // 嵌套的 [36] 不能被当成皮肤
        expect(catalog[0].charId).toBe(1102)
    })

    it("collects skin-grade effect creature meshes and ignores rows without a mesh", () => {
        const root = fixture(
            `return ReadOnly("Skin", {
  [110201] = {
    CharId = 1102,
    SkinId = 110201,
    SkinModelId = 110299,
    SkinTag = "Fuluo01"
  }
})`,
            `return ReadOnly("Model", {
  [110299] = {
    ModelId = 110299,
    PartModelsId = {110291},
    SkeletonMeshPath = "Asset/Char/Player/Char016_Fuluo/Mesh/Fuluo_Face_SM.Fuluo_Face_SM"
  },
  [110296] = {
    ModelId = 110296,
    SkeletonMeshPath = "Asset/Char/Player/Char016_Fuluo/Mesh/Fuluo_SP01_Part02_SM.Fuluo_SP01_Part02_SM"
  }
})`,
            PART_LUA,
            {
                Skin2LevelUpEffectCreature: `return ReadOnly("Skin2LevelUpEffectCreature", {
  [110201] = {
    [110298] = {
      EffectCreatureId = 110298,
      IsAttach = true,
      Level = T.RT_1,
      SkinID = 110201
    },
    [110299] = {
      EffectCreatureId = 110299,
      IsAttach = true,
      Level = T.RT_2,
      SkinID = 110201
    }
  }
})`,
                EffectCreature: `return ReadOnly("EffectCreature", {
  [110298] = {
    EffectCreatureId = 110298,
    MeshResourceId = 110296,
    SocketName = "Root_Effect02"
  },
  [110299] = {
    EffectCreatureId = 110299,
    MeshResourceId = 110296,
    SocketName = "Root_Effect02"
  }
})`,
            }
        )
        const [entry] = readSkinCatalog(root)
        // 两个效果生物共用同一张网格，只收一份
        expect(entry.effectMeshes).toEqual(["/Game/Asset/Char/Player/Char016_Fuluo/Mesh/Fuluo_SP01_Part02_SM"])
    })

    it("derives the character asset directory from the face mesh", () => {
        expect(
            characterDirectory({
                skinId: 1,
                charId: 1,
                tag: "X",
                modelId: 1,
                faceMesh: "/Game/Asset/Char/Player/Char016_Fuluo/Mesh/Fuluo_Face_SM",
                partMeshes: [],
                effectMeshes: [],
            })
        ).toBe("Asset/Char/Player/Char016_Fuluo")
    })

    it("prefers the model's MontageFolder over the face mesh directory", () => {
        // 系列皮肤的脸来自公共体型目录，只有 MontageFolder 还指向角色自己
        const root = fixture(
            `return ReadOnly("Skin", {
  [210102] = {
    CharId = 2101,
    SkinId = 210102,
    SkinModelId = 210199,
    SkinTag = "Shuimu01"
  }
})`,
            `return ReadOnly("Model", {
  [210199] = {
    ModelId = 210199,
    MontageFolder = "/Game/Asset/Char/Player/Char005_Shuimu/Animation/Montage/",
    PartModelsId = {110291},
    SkeletonMeshPath = "Asset/Char/Player/Common/Suit/Body/SP02/Mesh/ZNF00_SP02_Face_SM.ZNF00_SP02_Face_SM"
  }
})`,
            PART_LUA
        )
        const [entry] = readSkinCatalog(root)
        expect(entry.faceMesh).toBe("/Game/Asset/Char/Player/Common/Suit/Body/SP02/Mesh/ZNF00_SP02_Face_SM")
        expect(characterDirectory(entry)).toBe("Asset/Char/Player/Char005_Shuimu")
    })
})
