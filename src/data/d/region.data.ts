export interface Region {
    id: number
    name: string
    type?: string
    mapId?: number
    mapImage?: string
    mapCenter?: [number, number]
    mapScale: [number, number]
    isRandom: number[]
    mapRotation?: number
    alertDisable?: boolean
    mapMapping?: MapMapping[]
}

interface MapMapping {
    name: string
    pos: number[]
    opacity: number
    zOrder: number
}

const t: Region[] = [
    {
        id: 1001,
        name: "净界岛",
        type: "Main",
        mapId: 100,
        mapImage: "WBP_Map_Reg_Prologue",
        mapCenter: [16600, 13500],
        mapScale: [0.5, 1.25],
        mapRotation: 270,
        isRandom: [100101, 100102, 100103, 100104],
        alertDisable: true,
        mapMapping: [
            {
                name: "WBP_Map_Prologue_Bg",
                pos: [-512, -512, 3072, 3072],
                opacity: 0.6,
                zOrder: -10,
            },
            {
                name: "WBP_Map_Prologue_100101",
                pos: [152, 44, 1024, 1024],
                opacity: 1,
                zOrder: 0,
            },
            {
                name: "WBP_Map_Prologue_100102",
                pos: [748, 207, 1024, 1024],
                opacity: 1,
                zOrder: 0,
            },
            {
                name: "WBP_Map_Prologue_100103",
                pos: [1014, 1124, 1024, 1024],
                opacity: 1,
                zOrder: 0,
            },
        ],
    },
    {
        id: 1011,
        name: "冰湖城东区",
        type: "Main",
        mapId: 200,
        mapImage: "WBP_Map_Reg_Chapter01",
        mapCenter: [-18300, 15700],
        mapScale: [0.5, 1.25],
        mapRotation: 180,
        isRandom: [101101, 101103, 101104, 101105, 101106, 101107, 101108, 101110, 101111],
        alertDisable: true,
        mapMapping: [
            {
                name: "WBP_Map_Chapter01_Bg",
                pos: [0, 0, 4096, 4096],
                opacity: 0.6,
                zOrder: -10,
            },
            {
                name: "WBP_Map_Chapter01_L0",
                pos: [1024, 512, 2048, 2048],
                opacity: 1,
                zOrder: 0,
            },
            {
                name: "WBP_Map_Chapter01_L-1",
                pos: [512, 512, 3072, 3072],
                opacity: 1,
                zOrder: 0,
            },
        ],
    },
    {
        id: 1013,
        name: "格雷姆废矿",
        type: "Main",
        mapId: 202,
        mapImage: "WBP_Map_Reg_Chapter01_KK",
        mapCenter: [9000, 14600],
        mapScale: [0.5, 1.25],
        mapRotation: 270,
        isRandom: [101301, 101303, 101304, 101305],
        alertDisable: true,
        mapMapping: [
            {
                name: "WBP_Map_Chapter01_KK_L0",
                pos: [0, 0, 2048, 2048],
                opacity: 1,
                zOrder: 0,
            },
            {
                name: "WBP_Map_Chapter01_KK_L-1",
                pos: [0, 0, 2048, 2048],
                opacity: 1,
                zOrder: 0,
            },
            {
                name: "WBP_Map_Chapter01_KK_L-2",
                pos: [-512, 0, 3072, 2048],
                opacity: 1,
                zOrder: 0,
            },
        ],
    },
    {
        id: 1014,
        name: "？？？",
        type: "Fantasy",
        mapScale: [0.5, 1.25],
        isRandom: [101401, 101402],
    },
    {
        id: 1017,
        name: "冰湖城下水道",
        type: "Main",
        mapId: 201,
        mapImage: "WBP_Map_Reg_Chapter01_Sew",
        mapCenter: [-20360, -7102],
        mapScale: [0.5, 1.25],
        isRandom: [101701, 101702, 101703],
        alertDisable: true,
        mapMapping: [
            {
                name: "WBP_Map_Chapter01_Sew_L0",
                pos: [1024, 1024, 2048, 2048],
                opacity: 1,
                zOrder: 0,
            },
        ],
    },
    {
        id: 1019,
        name: "盖雷亚剧院",
        type: "Main",
        mapId: 204,
        mapImage: "WBP_Map_Reg_Chapter01_Thea",
        mapCenter: [20500, 3300],
        mapScale: [0.5, 1.25],
        isRandom: [101901],
        alertDisable: true,
        mapMapping: [
            {
                name: "WBP_Map_Chapter01_Thea",
                pos: [0, 0, 4096, 4096],
                opacity: 1,
                zOrder: 0,
            },
        ],
    },
    {
        id: 1021,
        name: "龙莎要塞",
        type: "EX",
        mapId: 300,
        mapImage: "WBP_Map_Reg_EXChapter01",
        mapCenter: [5500, -15000],
        mapScale: [0.5, 1.25],
        isRandom: [102101, 102102, 102103, 102104],
        alertDisable: true,
        mapMapping: [
            {
                name: "WBP_Map_EX01_Bg",
                pos: [-180, 470, 4096, 4096],
                opacity: 0.6,
                zOrder: 0,
            },
            {
                name: "WBP_Map_EX01_L0",
                pos: [512, 512, 3072, 3072],
                opacity: 1,
                zOrder: 0,
            },
            {
                name: "WBP_Map_EX01_L1",
                pos: [512, 512, 3072, 3072],
                opacity: 1,
                zOrder: 0,
            },
            {
                name: "WBP_Map_EX01_L-1",
                pos: [512, 1024, 3072, 2048],
                opacity: 1,
                zOrder: 0,
            },
        ],
    },
    {
        id: 1022,
        name: "皇家军事监狱",
        type: "EX",
        mapScale: [0.5, 1.25],
        isRandom: [102201],
    },
    {
        id: 1032,
        name: "佩剑炼金院",
        type: "Main",
        mapScale: [0.5, 1.25],
        isRandom: [103201],
    },
    {
        id: 1041,
        name: "烟津渡",
        type: "Main",
        mapId: 400,
        mapImage: "WBP_Map_Reg_East_Yanjindu",
        mapScale: [0.3, 1],
        isRandom: [104102, 104103, 104104, 104105, 104106, 104107, 104108, 104109, 104110],
        alertDisable: true,
        mapMapping: [
            {
                name: "WBP_Map_East_Yanjindu_L0",
                pos: [0, 0, 8192, 8192],
                opacity: 1,
                zOrder: 0,
            },
            {
                name: "WBP_Map_East_Yanjindu_L-1",
                pos: [0, 0, 8192, 8192],
                opacity: 1,
                zOrder: 0,
            },
        ],
    },
    {
        id: 1042,
        name: "UI_REGION_NAME_1042",
        type: "Main",
        mapScale: [0.5, 1.25],
        isRandom: [104201],
    },
    {
        id: 1043,
        name: "UI_REGION_NAME_1043",
        type: "Main",
        mapScale: [0.5, 1.25],
        isRandom: [104301],
    },
    {
        id: 1044,
        name: "UI_REGION_NAME_1044",
        type: "Main",
        mapScale: [0.5, 1.25],
        isRandom: [104401],
    },
    {
        id: 1045,
        name: "皓京",
        type: "Main",
        mapId: 500,
        mapImage: "WBP_Map_Reg_Chapter01",
        mapCenter: [20000, -20000],
        mapScale: [0.5, 1.25],
        isRandom: [104501, 104502, 104503, 104504, 104505, 104506, 104507, 104508],
        alertDisable: true,
        mapMapping: [
            {
                name: "WBP_Map_Chapter01_Bg",
                pos: [0, 0, 4096, 4096],
                opacity: 0.6,
                zOrder: -10,
            },
            {
                name: "WBP_Map_Chapter01_L0",
                pos: [1024, 512, 2048, 2048],
                opacity: 1,
                zOrder: 0,
            },
            {
                name: "WBP_Map_Chapter01_L-1",
                pos: [512, 512, 3072, 3072],
                opacity: 1,
                zOrder: 0,
            },
        ],
    },
    {
        id: 1046,
        name: "UI_REGION_NAME_1046",
        type: "Main",
        mapScale: [0.5, 1.25],
        isRandom: [104601],
    },
    {
        id: 1047,
        name: "UI_REGION_NAME_1047",
        type: "Main",
        mapScale: [0.5, 1.25],
        isRandom: [104701],
    },
    {
        id: 1048,
        name: "UI_REGION_NAME_1048",
        type: "Main",
        mapScale: [0.5, 1.25],
        isRandom: [104801],
    },
    {
        id: 1049,
        name: "潜龙居",
        type: "Main",
        mapId: 400,
        mapScale: [0.5, 1.25],
        isRandom: [104901],
        alertDisable: true,
    },
    {
        id: 1050,
        name: "UI_REGION_NAME_1050",
        type: "Main",
        mapScale: [0.5, 1.25],
        isRandom: [105001],
    },
    {
        id: 1051,
        name: "UI_REGION_NAME_1051",
        mapScale: [0.5, 1.25],
        isRandom: [105101, 105102, 105103],
    },
    {
        id: 1052,
        name: "山外山",
        type: "Main",
        mapId: 501,
        mapImage: "WBP_Map_Reg_Chapter01_KK",
        mapScale: [0.5, 1.25],
        isRandom: [105201],
        alertDisable: true,
        mapMapping: [
            {
                name: "WBP_Map_Chapter01_KK_L0",
                pos: [0, 0, 2048, 2048],
                opacity: 1,
                zOrder: 0,
            },
            {
                name: "WBP_Map_Chapter01_KK_L-1",
                pos: [0, 0, 2048, 2048],
                opacity: 1,
                zOrder: 0,
            },
            {
                name: "WBP_Map_Chapter01_KK_L-2",
                pos: [-512, 0, 3072, 2048],
                opacity: 1,
                zOrder: 0,
            },
        ],
    },
    {
        id: 1053,
        name: "太虚陵",
        type: "Main",
        mapId: 502,
        mapImage: "WBP_Map_Reg_Chapter01_Sew",
        mapCenter: [0, 20000],
        mapScale: [0.5, 1.25],
        mapRotation: 270,
        isRandom: [105301, 105302],
        alertDisable: true,
        mapMapping: [
            {
                name: "WBP_Map_Chapter01_Sew_L0",
                pos: [1024, 1024, 2048, 2048],
                opacity: 1,
                zOrder: 0,
            },
        ],
    },
    {
        id: 1054,
        name: "UI_REGION_NAME_1054",
        mapScale: [0.5, 1.25],
        isRandom: [105401],
    },
    {
        id: 1055,
        name: "由来巷",
        type: "Main",
        mapId: 503,
        mapImage: "WBP_Map_Reg_EXChapter01",
        mapCenter: [20000, 0],
        mapScale: [0.5, 1.25],
        isRandom: [105501],
        alertDisable: true,
        mapMapping: [
            {
                name: "WBP_Map_EX01_Bg",
                pos: [-180, 470, 4096, 4096],
                opacity: 0.6,
                zOrder: 0,
            },
            {
                name: "WBP_Map_EX01_L0",
                pos: [512, 512, 3072, 3072],
                opacity: 1,
                zOrder: 0,
            },
            {
                name: "WBP_Map_EX01_L1",
                pos: [512, 512, 3072, 3072],
                opacity: 1,
                zOrder: 0,
            },
            {
                name: "WBP_Map_EX01_L-1",
                pos: [512, 1024, 3072, 2048],
                opacity: 1,
                zOrder: 0,
            },
        ],
    },
    {
        id: 1056,
        name: "UI_REGION_NAME_1056",
        mapScale: [0.5, 1.25],
        isRandom: [105601, 105602],
    },
    {
        id: 1057,
        name: "烛阴祭坛",
        type: "Main",
        mapId: 401,
        mapImage: "WBP_Map_Reg_East_Heilongjitan",
        mapCenter: [22300, -78018],
        mapScale: [0.5, 1.25],
        isRandom: [105701],
        mapMapping: [
            {
                name: "WBP_Map_East_Heilongjitan_L0",
                pos: [0, 0, 2048, 2048],
                opacity: 1,
                zOrder: 0,
            },
        ],
    },
    {
        id: 1058,
        name: "UI_REGION_NAME_1058",
        type: "Main",
        mapScale: [0.5, 1.25],
        isRandom: [105801],
    },
    {
        id: 1059,
        name: "UI_REGION_NAME_1059",
        type: "Main",
        mapScale: [0.5, 1.25],
        isRandom: [105901],
    },
    {
        id: 1060,
        name: "第三章火车站",
        type: "Main",
        mapScale: [0.5, 1.25],
        isRandom: [106001, 106002, 106003, 106004, 106005, 106006, 106007],
    },
    {
        id: 1061,
        name: "第三章野外",
        type: "Main",
        mapScale: [0.5, 1.25],
        isRandom: [106101],
    },
    {
        id: 2001,
        name: "UI_REGION_NAME_2001",
        type: "Main",
        mapScale: [0.5, 1.25],
        isRandom: [200101],
    },
    {
        id: 2101,
        name: "休憩之所",
        type: "Main",
        mapId: 200,
        mapScale: [0.5, 1.25],
        isRandom: [210101],
        alertDisable: true,
    },
    {
        id: 9997,
        name: "区域性能测试",
        type: "Main",
        mapId: 1,
        mapImage: "WBP_Map_Reg_Chapter01",
        mapCenter: [20000, 20000],
        mapScale: [0.5, 1.25],
        isRandom: [999701],
        mapMapping: [
            {
                name: "WBP_Map_Chapter01_Bg",
                pos: [0, 0, 4096, 4096],
                opacity: 0.6,
                zOrder: -10,
            },
            {
                name: "WBP_Map_Chapter01_L0",
                pos: [1024, 512, 2048, 2048],
                opacity: 1,
                zOrder: 0,
            },
            {
                name: "WBP_Map_Chapter01_L-1",
                pos: [512, 512, 3072, 3072],
                opacity: 1,
                zOrder: 0,
            },
        ],
    },
    {
        id: 9998,
        name: "特殊任务测试区域",
        mapScale: [0.5, 1.25],
        isRandom: [999801],
        alertDisable: true,
    },
    {
        id: 9999,
        name: "区域测试",
        mapScale: [0.5, 1.25],
        isRandom: [999901, 999902, 999903],
        alertDisable: true,
    },
]

export const regionMap = t.reduce((acc, cur) => {
    acc.set(cur.id, cur)
    return acc
}, new Map<number, Region>())

export default t
