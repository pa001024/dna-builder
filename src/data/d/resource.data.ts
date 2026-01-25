export interface Resource {
    id: number
    name: string
    icon: string
}

const t: Resource[] = [
    {
        id: 99,
        name: "月石晶胚",
        icon: "T_Coin_Main_Lv1",
    },
    {
        id: 100,
        name: "月石",
        icon: "T_Coin_Main_Lv2",
    },
    {
        id: 101,
        name: "铜币",
        icon: "T_Coin_Main_Lv3",
    },
    {
        id: 102,
        name: "深红凝珠",
        icon: "T_Coin_Other_Mod",
    },
    {
        id: 110,
        name: "水色棱镜",
        icon: "T_Gacha_Coin01",
    },
    {
        id: 111,
        name: "虹色棱镜",
        icon: "T_Gacha_Coin02",
    },
    {
        id: 201,
        name: "移转模块",
        icon: "T_Resource_PolarityStyle",
    },
    {
        id: 202,
        name: "武器移转模块",
        icon: "T_Resource_PolarityAura",
    },
    {
        id: 206,
        name: "委托手册·一",
        icon: "T_Resource_Ticket01",
    },
    {
        id: 207,
        name: "委托手册·二",
        icon: "T_Resource_Ticket02",
    },
    {
        id: 208,
        name: "委托手册·三",
        icon: "T_Resource_Ticket03",
    },
    {
        id: 209,
        name: "委托手册·四",
        icon: "T_Resource_Ticket04",
    },
    {
        id: 210,
        name: "丰渔之证",
        icon: "T_Coin_Other_Fishing",
    },
    {
        id: 211,
        name: "委托密函线索",
        icon: "T_Icon_Random_Box_Part_01",
    },
    {
        id: 214,
        name: "剧目票根",
        icon: "T_Resource_Abyss_Coin",
    },
    {
        id: 215,
        name: "时之纺线",
        icon: "T_Rouge_ShopToken",
    },
    {
        id: 216,
        name: "狩月之歌",
        icon: "T_Coin_WeeklyDungeon",
    },
    {
        id: 218,
        name: "狩月纪念币",
        icon: "T_Resource_Raid_Coin01",
    },
    {
        id: 1001,
        name: "纯白沙漏",
        icon: "T_Resource_GachaTicket_01",
    },
    {
        id: 1002,
        name: "玩具气锤",
        icon: "T_Resource_Jiasu",
    },
    {
        id: 1003,
        name: "华彩沙漏",
        icon: "T_Resource_GachaTicket_02",
    },
    {
        id: 1006,
        name: "熔炼模具",
        icon: "T_Resource_GeneralWeaponCard",
    },
    {
        id: 2008,
        name: "武器说明书·二",
        icon: "T_Resource_Weapon_Exp03",
    },
    {
        id: 2009,
        name: "武器说明书·三",
        icon: "T_Resource_Weapon_Exp04",
    },
    {
        id: 2010,
        name: "武器说明书·四",
        icon: "T_Resource_Weapon_Exp05",
    },
    {
        id: 2012,
        name: "战斗旋律·二",
        icon: "T_Resource_Char_Exp03",
    },
    {
        id: 2013,
        name: "战斗旋律·三",
        icon: "T_Resource_Char_Exp04",
    },
    {
        id: 2014,
        name: "战斗旋律·四",
        icon: "T_Resource_Char_Exp05",
    },
    {
        id: 3001,
        name: "十面骰",
        icon: "T_Impression_Resouce_01",
    },
    {
        id: 3002,
        name: "妙妙罐罐",
        icon: "T_Resource_PetFood02",
    },
    {
        id: 3003,
        name: "妙妙妙罐罐",
        icon: "T_Resource_PetFood03",
    },
    {
        id: 3005,
        name: "妙妙膏膏",
        icon: "T_Resource_PetExp02",
    },
    {
        id: 3006,
        name: "妙妙妙膏膏",
        icon: "T_Resource_PetExp03",
    },
    {
        id: 3007,
        name: "妙妙乳饮",
        icon: "T_Resource_PetBreak",
    },
    {
        id: 3016,
        name: "增幅激化器",
        icon: "T_Resourece_GeneralModLevelUpItem",
    },
    {
        id: 10001,
        name: "枯桑枝干",
        icon: "T_BreakRes_Wind02",
    },
    {
        id: 10002,
        name: "收束气流",
        icon: "T_BreakRes_Wind03",
    },
    {
        id: 10003,
        name: "渡海蝶",
        icon: "T_BreakRes_Wind04",
    },
    {
        id: 10004,
        name: "刺穿飓风之矢",
        icon: "T_BreakRes_Wind05",
    },
    {
        id: 10005,
        name: "火蜥鳞片",
        icon: "T_BreakRes_Fire02",
    },
    {
        id: 10006,
        name: "永明火",
        icon: "T_BreakRes_Fire03",
    },
    {
        id: 10007,
        name: "淬焰镣铐",
        icon: "T_BreakRes_Fire04",
    },
    {
        id: 10008,
        name: "凝结熔岩",
        icon: "T_BreakRes_Fire05",
    },
    {
        id: 10009,
        name: "蔚蓝珍珠",
        icon: "T_BreakRes_Water02",
    },
    {
        id: 10010,
        name: "保水剂",
        icon: "T_BreakRes_Water03",
    },
    {
        id: 10011,
        name: "净水装置",
        icon: "T_BreakRes_Water04",
    },
    {
        id: 10012,
        name: "冰川泪石",
        icon: "T_BreakRes_Water05",
    },
    {
        id: 10013,
        name: "引雷针",
        icon: "T_BreakRes_Thunder02",
    },
    {
        id: 10014,
        name: "雷夜陨玉",
        icon: "T_BreakRes_Thunder03",
    },
    {
        id: 10015,
        name: "金羊毛",
        icon: "T_BreakRes_Thunder04",
    },
    {
        id: 10016,
        name: "瓶中闪电",
        icon: "T_BreakRes_Thunder05",
    },
    {
        id: 10017,
        name: "启迪透镜",
        icon: "T_BreakRes_Light02",
    },
    {
        id: 10018,
        name: "花叶金冕",
        icon: "T_BreakRes_Light03",
    },
    {
        id: 10019,
        name: "《圣歌》印本",
        icon: "T_BreakRes_Light04",
    },
    {
        id: 10020,
        name: "永衡天秤",
        icon: "T_BreakRes_Light05",
    },
    {
        id: 10021,
        name: "锈痕匕首",
        icon: "T_BreakRes_Dark02",
    },
    {
        id: 10022,
        name: "黑曜匙",
        icon: "T_BreakRes_Dark03",
    },
    {
        id: 10023,
        name: "暗月仪典",
        icon: "T_BreakRes_Dark04",
    },
    {
        id: 10024,
        name: "秽兽细胞反应皿",
        icon: "T_BreakRes_Dark05",
    },
    {
        id: 10100,
        name: "暮夜的履迹",
        icon: "T_BreakRes_Golden",
    },
    {
        id: 10101,
        name: "弃绝怯懦之环",
        icon: "T_Skill01",
    },
    {
        id: 10102,
        name: "逃离困顿之环",
        icon: "T_Skill02",
    },
    {
        id: 10103,
        name: "溯洄时流之环",
        icon: "T_Skill03",
    },
    {
        id: 10104,
        name: "重铸正义之环",
        icon: "T_Skill04",
    },
    {
        id: 10200,
        name: "黑铁勋章",
        icon: "T_BreakRes_Zhanshi01",
    },
    {
        id: 10201,
        name: "白银勋章",
        icon: "T_BreakRes_Zhanshi02",
    },
    {
        id: 10202,
        name: "镀金勋章",
        icon: "T_BreakRes_Zhanshi03",
    },
    {
        id: 10203,
        name: "不语面罩",
        icon: "T_BreakRes_Fashi01",
    },
    {
        id: 10204,
        name: "全视之眼",
        icon: "T_BreakRes_Fashi02",
    },
    {
        id: 10205,
        name: "启迪冠冕",
        icon: "T_BreakRes_Fashi03",
    },
    {
        id: 10206,
        name: "碧薷嫩叶",
        icon: "T_BreakRes_Fuzhu01",
    },
    {
        id: 10207,
        name: "精研草药",
        icon: "T_BreakRes_Fuzhu02",
    },
    {
        id: 10208,
        name: "复方药剂",
        icon: "T_BreakRes_Fuzhu03",
    },
    {
        id: 10209,
        name: "流光箭矢",
        icon: "T_BreakRes_Sheshou01",
    },
    {
        id: 10210,
        name: "流光瞄具",
        icon: "T_BreakRes_Sheshou02",
    },
    {
        id: 10211,
        name: "流光箭匣",
        icon: "T_BreakRes_Sheshou03",
    },
    {
        id: 11001,
        name: "初级武器部件·握柄",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 11002,
        name: "中级武器部件·握柄",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 11003,
        name: "高级武器部件·握柄",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 11004,
        name: "初级武器部件·刀刃",
        icon: "T_Melee_Weapon_Part02",
    },
    {
        id: 11005,
        name: "中级武器部件·刀刃",
        icon: "T_Melee_Weapon_Part02",
    },
    {
        id: 11006,
        name: "高级武器部件·刀刃",
        icon: "T_Melee_Weapon_Part02",
    },
    {
        id: 11007,
        name: "初级武器部件·饰物",
        icon: "T_Melee_Weapon_Part03",
    },
    {
        id: 11008,
        name: "中级武器部件·饰物",
        icon: "T_Melee_Weapon_Part03",
    },
    {
        id: 11009,
        name: "高级武器部件·饰物",
        icon: "T_Melee_Weapon_Part03",
    },
    {
        id: 11010,
        name: "初级武器部件·枪管",
        icon: "T_Range_Weapon_Part01",
    },
    {
        id: 11011,
        name: "中级武器部件·枪管",
        icon: "T_Range_Weapon_Part01",
    },
    {
        id: 11012,
        name: "高级武器部件·枪管",
        icon: "T_Range_Weapon_Part01",
    },
    {
        id: 11013,
        name: "初级武器部件·枪机",
        icon: "T_Range_Weapon_Part02",
    },
    {
        id: 11014,
        name: "中级武器部件·枪机",
        icon: "T_Range_Weapon_Part02",
    },
    {
        id: 11015,
        name: "高级武器部件·枪机",
        icon: "T_Range_Weapon_Part02",
    },
    {
        id: 11016,
        name: "初级武器部件·枪身",
        icon: "T_Range_Weapon_Part03",
    },
    {
        id: 11017,
        name: "中级武器部件·枪身",
        icon: "T_Range_Weapon_Part03",
    },
    {
        id: 11018,
        name: "高级武器部件·枪身",
        icon: "T_Range_Weapon_Part03",
    },
    {
        id: 12001,
        name: "慧谋的攻守的握柄",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 12002,
        name: "慧谋的攻守的刀刃",
        icon: "T_Melee_Weapon_Part02",
    },
    {
        id: 12003,
        name: "红叶一滴的握柄",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 12004,
        name: "红叶一滴的刀刃",
        icon: "T_Melee_Weapon_Part02",
    },
    {
        id: 12005,
        name: "红叶一滴的饰物",
        icon: "T_Melee_Weapon_Part03",
    },
    {
        id: 12006,
        name: "群星无意赦免的枪机",
        icon: "T_Range_Weapon_Part02",
    },
    {
        id: 12007,
        name: "群星无意赦免的枪身",
        icon: "T_Range_Weapon_Part03",
    },
    {
        id: 12008,
        name: "群星无意赦免的枪管",
        icon: "T_Range_Weapon_Part01",
    },
    {
        id: 12009,
        name: "缄默育种者的枪机",
        icon: "T_Range_Weapon_Part02",
    },
    {
        id: 12010,
        name: "缄默育种者的枪身",
        icon: "T_Range_Weapon_Part03",
    },
    {
        id: 12011,
        name: "缄默育种者的枪管",
        icon: "T_Range_Weapon_Part01",
    },
    {
        id: 12012,
        name: "放逐怒雷的枪机",
        icon: "T_Range_Weapon_Part02",
    },
    {
        id: 12013,
        name: "放逐怒雷的枪身",
        icon: "T_Range_Weapon_Part03",
    },
    {
        id: 12014,
        name: "放逐怒雷的枪管",
        icon: "T_Range_Weapon_Part01",
    },
    {
        id: 12015,
        name: "破晓赞美诗的枪机",
        icon: "T_Range_Weapon_Part02",
    },
    {
        id: 12016,
        name: "破晓赞美诗的枪身",
        icon: "T_Range_Weapon_Part03",
    },
    {
        id: 12017,
        name: "破晓赞美诗的枪管",
        icon: "T_Range_Weapon_Part01",
    },
    {
        id: 12018,
        name: "茵布拉花序的弓弦",
        icon: "T_Melee_Weapon_Part03",
    },
    {
        id: 12019,
        name: "茵布拉花序的上弓臂",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 12020,
        name: "茵布拉花序的下弓臂",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 12022,
        name: "塞壬的拥吻的握柄",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 12023,
        name: "塞壬的拥吻的刀刃",
        icon: "T_Melee_Weapon_Part02",
    },
    {
        id: 12024,
        name: "罪愆的逆鳞的握柄",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 12025,
        name: "罪愆的逆鳞的刀刃",
        icon: "T_Melee_Weapon_Part02",
    },
    {
        id: 12026,
        name: "不渝的梦海的握柄",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 12027,
        name: "不渝的梦海的刀刃",
        icon: "T_Melee_Weapon_Part02",
    },
    {
        id: 12028,
        name: "无序奇点的枪机",
        icon: "T_Range_Weapon_Part02",
    },
    {
        id: 12029,
        name: "无序奇点的枪身",
        icon: "T_Range_Weapon_Part03",
    },
    {
        id: 12030,
        name: "无序奇点的枪管",
        icon: "T_Range_Weapon_Part01",
    },
    {
        id: 12031,
        name: "蓝色脉动的枪身",
        icon: "T_Range_Weapon_Part03",
    },
    {
        id: 12032,
        name: "蓝色脉动的枪管",
        icon: "T_Range_Weapon_Part01",
    },
    {
        id: 12033,
        name: "爆破艺术的枪机",
        icon: "T_Range_Weapon_Part02",
    },
    {
        id: 12034,
        name: "爆破艺术的枪身",
        icon: "T_Range_Weapon_Part03",
    },
    {
        id: 12035,
        name: "爆破艺术的枪管",
        icon: "T_Range_Weapon_Part01",
    },
    {
        id: 12036,
        name: "弧光百劫的弓弦",
        icon: "T_Melee_Weapon_Part03",
    },
    {
        id: 12037,
        name: "弧光百劫的上弓臂",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 12038,
        name: "弧光百劫的下弓臂",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 12040,
        name: "孤子的缚锁的握柄",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 12041,
        name: "孤子的缚锁的刀刃",
        icon: "T_Melee_Weapon_Part02",
    },
    {
        id: 12042,
        name: "惩戒的炼火的握柄",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 12043,
        name: "惩戒的炼火的刀刃",
        icon: "T_Melee_Weapon_Part02",
    },
    {
        id: 12044,
        name: "失乡的獠牙的握柄",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 12045,
        name: "失乡的獠牙的左刀刃",
        icon: "T_Melee_Weapon_Part02",
    },
    {
        id: 12046,
        name: "失乡的獠牙的右刀刃",
        icon: "T_Melee_Weapon_Part02",
    },
    {
        id: 12047,
        name: "归墟棘轮的枪机",
        icon: "T_Range_Weapon_Part02",
    },
    {
        id: 12048,
        name: "归墟棘轮的枪身",
        icon: "T_Range_Weapon_Part03",
    },
    {
        id: 12050,
        name: "引浪小调的枪机",
        icon: "T_Range_Weapon_Part02",
    },
    {
        id: 12051,
        name: "引浪小调的枪身",
        icon: "T_Range_Weapon_Part03",
    },
    {
        id: 12052,
        name: "引浪小调的枪管",
        icon: "T_Range_Weapon_Part01",
    },
    {
        id: 12053,
        name: "希冀的丰稔的握柄",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 12054,
        name: "希冀的丰稔的刀刃",
        icon: "T_Melee_Weapon_Part02",
    },
    {
        id: 12055,
        name: "万古的诀别的握柄",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 12056,
        name: "万古的诀别的刀刃",
        icon: "T_Melee_Weapon_Part02",
    },
    {
        id: 12057,
        name: "泽世的慈雨的握柄",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 12058,
        name: "泽世的慈雨的刀刃",
        icon: "T_Melee_Weapon_Part02",
    },
    {
        id: 12059,
        name: "炽枪的花宴的枪机",
        icon: "T_Range_Weapon_Part02",
    },
    {
        id: 12060,
        name: "炽枪的花宴的枪身",
        icon: "T_Range_Weapon_Part03",
    },
    {
        id: 12061,
        name: "炽枪的花宴的枪管",
        icon: "T_Range_Weapon_Part01",
    },
    {
        id: 12062,
        name: "若华的飞光的枪机",
        icon: "T_Range_Weapon_Part02",
    },
    {
        id: 12063,
        name: "若华的飞光的枪身",
        icon: "T_Range_Weapon_Part03",
    },
    {
        id: 12064,
        name: "若华的飞光的枪管",
        icon: "T_Range_Weapon_Part01",
    },
    {
        id: 12065,
        name: "织梦的白羽的枪机",
        icon: "T_Range_Weapon_Part02",
    },
    {
        id: 12066,
        name: "织梦的白羽的枪身",
        icon: "T_Range_Weapon_Part03",
    },
    {
        id: 12067,
        name: "织梦的白羽的枪管",
        icon: "T_Range_Weapon_Part01",
    },
    {
        id: 12068,
        name: "辉珀刃的握柄",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 12069,
        name: "辉珀刃的刀刃",
        icon: "T_Melee_Weapon_Part02",
    },
    {
        id: 12070,
        name: "追忆的残影的握柄",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 12071,
        name: "追忆的残影的刀刃",
        icon: "T_Melee_Weapon_Part02",
    },
    {
        id: 12072,
        name: "春玦戟的握柄",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 12073,
        name: "春玦戟的刀刃",
        icon: "T_Melee_Weapon_Part02",
    },
    {
        id: 12074,
        name: "铸铁者的握柄",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 12075,
        name: "铸铁者的刀刃",
        icon: "T_Melee_Weapon_Part02",
    },
    {
        id: 12076,
        name: "银白敕令的枪机",
        icon: "T_Range_Weapon_Part02",
    },
    {
        id: 12077,
        name: "银白敕令的枪身",
        icon: "T_Range_Weapon_Part03",
    },
    {
        id: 12078,
        name: "银白敕令的枪管",
        icon: "T_Range_Weapon_Part01",
    },
    {
        id: 12079,
        name: "祈请净火的枪机",
        icon: "T_Range_Weapon_Part02",
    },
    {
        id: 12080,
        name: "祈请净火的枪身",
        icon: "T_Range_Weapon_Part03",
    },
    {
        id: 12081,
        name: "祈请净火的枪管",
        icon: "T_Range_Weapon_Part01",
    },
    {
        id: 12082,
        name: "鎏金岁月的握柄",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 12083,
        name: "鎏金岁月的左刀刃",
        icon: "T_Melee_Weapon_Part02",
    },
    {
        id: 12084,
        name: "鎏金岁月的右刀刃",
        icon: "T_Melee_Weapon_Part02",
    },
    {
        id: 12085,
        name: "流浪的蔷薇的握柄",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 12086,
        name: "流浪的蔷薇的刀刃",
        icon: "T_Melee_Weapon_Part02",
    },
    {
        id: 12087,
        name: "幽鲨眼的握柄",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 12088,
        name: "幽鲨眼的左刀刃",
        icon: "T_Melee_Weapon_Part02",
    },
    {
        id: 12089,
        name: "幽鲨眼的右刀刃",
        icon: "T_Melee_Weapon_Part02",
    },
    {
        id: 12090,
        name: "苍瑚凝碧的握柄",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 12091,
        name: "苍瑚凝碧的刀刃",
        icon: "T_Melee_Weapon_Part02",
    },
    {
        id: 12092,
        name: "蒙恩御礼的握柄",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 12093,
        name: "蒙恩御礼的刀刃",
        icon: "T_Melee_Weapon_Part02",
    },
    {
        id: 12094,
        name: "蒙恩御礼的饰物",
        icon: "T_Melee_Weapon_Part03",
    },
    {
        id: 12095,
        name: "告谕圣言的枪机",
        icon: "T_Range_Weapon_Part02",
    },
    {
        id: 12096,
        name: "告谕圣言的枪身",
        icon: "T_Range_Weapon_Part03",
    },
    {
        id: 12097,
        name: "告谕圣言的枪管",
        icon: "T_Range_Weapon_Part01",
    },
    {
        id: 12098,
        name: "告谕圣音的枪身",
        icon: "T_Range_Weapon_Part03",
    },
    {
        id: 12099,
        name: "告谕圣音的枪管",
        icon: "T_Range_Weapon_Part01",
    },
    {
        id: 12100,
        name: "圣裁日的枪机",
        icon: "T_Range_Weapon_Part02",
    },
    {
        id: 12101,
        name: "圣裁日的枪身",
        icon: "T_Range_Weapon_Part03",
    },
    {
        id: 12102,
        name: "圣裁日的枪管",
        icon: "T_Range_Weapon_Part01",
    },
    {
        id: 12103,
        name: "裂魂的弓弦",
        icon: "T_Range_Weapon_Part02",
    },
    {
        id: 12104,
        name: "裂魂的上弓臂",
        icon: "T_Range_Weapon_Part03",
    },
    {
        id: 12105,
        name: "裂魂的下弓臂",
        icon: "T_Range_Weapon_Part01",
    },
    {
        id: 12106,
        name: "烈焰孤沙的弓弦",
        icon: "T_Melee_Weapon_Part03",
    },
    {
        id: 12107,
        name: "烈焰孤沙的上弓臂",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 12108,
        name: "烈焰孤沙的下弓臂",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 12110,
        name: "枯朽的握柄",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 12111,
        name: "枯朽的刀刃",
        icon: "T_Melee_Weapon_Part02",
    },
    {
        id: 12112,
        name: "焦渴的握柄",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 12113,
        name: "焦渴的刀刃",
        icon: "T_Melee_Weapon_Part02",
    },
    {
        id: 12114,
        name: "缠结的握柄",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 12115,
        name: "缠结的刀刃",
        icon: "T_Melee_Weapon_Part02",
    },
    {
        id: 12116,
        name: "凋零的握柄",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 12117,
        name: "凋零的刀刃",
        icon: "T_Melee_Weapon_Part02",
    },
    {
        id: 12118,
        name: "凋零的饰物",
        icon: "T_Melee_Weapon_Part03",
    },
    {
        id: 12119,
        name: "剥离的枪机",
        icon: "T_Range_Weapon_Part02",
    },
    {
        id: 12120,
        name: "剥离的枪身",
        icon: "T_Range_Weapon_Part03",
    },
    {
        id: 12121,
        name: "剥离的枪管",
        icon: "T_Range_Weapon_Part01",
    },
    {
        id: 12122,
        name: "赘生的枪身",
        icon: "T_Range_Weapon_Part03",
    },
    {
        id: 12123,
        name: "赘生的枪管",
        icon: "T_Range_Weapon_Part01",
    },
    {
        id: 12124,
        name: "崩解的枪机",
        icon: "T_Range_Weapon_Part02",
    },
    {
        id: 12125,
        name: "崩解的枪身",
        icon: "T_Range_Weapon_Part03",
    },
    {
        id: 12126,
        name: "崩解的枪管",
        icon: "T_Range_Weapon_Part01",
    },
    {
        id: 12127,
        name: "嘶鸣的枪机",
        icon: "T_Range_Weapon_Part02",
    },
    {
        id: 12128,
        name: "嘶鸣的枪身",
        icon: "T_Range_Weapon_Part03",
    },
    {
        id: 12129,
        name: "嘶鸣的枪管",
        icon: "T_Range_Weapon_Part01",
    },
    {
        id: 12130,
        name: "销骨的枪机",
        icon: "T_Range_Weapon_Part02",
    },
    {
        id: 12131,
        name: "销骨的枪身",
        icon: "T_Range_Weapon_Part03",
    },
    {
        id: 12132,
        name: "销骨的枪管",
        icon: "T_Range_Weapon_Part01",
    },
    {
        id: 12133,
        name: "未来之鸽的握柄",
        icon: "T_Melee_Weapon_Part01",
    },
    {
        id: 12134,
        name: "未来之鸽的刀刃",
        icon: "T_Melee_Weapon_Part02",
    },
    {
        id: 12135,
        name: "雀舞云屏的枪机",
        icon: "T_Range_Weapon_Part02",
    },
    {
        id: 12136,
        name: "雀舞云屏的枪身",
        icon: "T_Range_Weapon_Part03",
    },
    {
        id: 12137,
        name: "雀舞云屏的枪管",
        icon: "T_Range_Weapon_Part01",
    },
    {
        id: 20002,
        name: "破损的嗅盐",
        icon: "T_Resource_Normal02",
    },
    {
        id: 20005,
        name: "石料粉末",
        icon: "T_Resource_Normal04",
    },
    {
        id: 20008,
        name: "排斥结晶",
        icon: "T_Resource_Ganran02",
    },
    {
        id: 20009,
        name: "朱红泪滴",
        icon: "T_Resource_Normal03",
    },
    {
        id: 20010,
        name: "匍地枝",
        icon: "T_Resource_Forge_Low01",
    },
    {
        id: 20011,
        name: "秽兽凝脂",
        icon: "T_Resource_Forge_Low02",
    },
    {
        id: 20012,
        name: "锁链",
        icon: "T_Resource_Forge_Low03",
    },
    {
        id: 20013,
        name: "皎皎之民的信物",
        icon: "T_Resource_Forge_Medium01",
    },
    {
        id: 20014,
        name: "待雪鸟尾羽",
        icon: "T_Resource_Forge_Medium02",
    },
    {
        id: 20017,
        name: "载具装甲",
        icon: "T_Resource_Forge_Medium05",
    },
    {
        id: 20018,
        name: "圣像石骸",
        icon: "T_Resource_Forge_Medium06",
    },
    {
        id: 20019,
        name: "燃料试剂",
        icon: "T_Resource_Forge_Medium07",
    },
    {
        id: 20020,
        name: "隔热涂层",
        icon: "T_Resource_Forge_Medium08",
    },
    {
        id: 20021,
        name: "圣烛",
        icon: "T_Resource_Forge_High01",
    },
    {
        id: 20023,
        name: "金砂",
        icon: "T_Resource_Forge_High03",
    },
    {
        id: 20024,
        name: "秽兽触须",
        icon: "T_Resource_Forge_High04",
    },
    {
        id: 20027,
        name: "利刃药剂",
        icon: "T_Resource_Forge_Product01",
    },
    {
        id: 20028,
        name: "爆弹",
        icon: "T_Resource_Forge_Product02",
    },
    {
        id: 20029,
        name: "固定支架",
        icon: "T_Resource_Forge_Product03",
    },
    {
        id: 20030,
        name: "血清注射器",
        icon: "T_Resource_Forge_Product04",
    },
    {
        id: 20031,
        name: "秽兽聚合物",
        icon: "T_Resource_Forge_Product05",
    },
    {
        id: 20032,
        name: "冷却液",
        icon: "T_Resource_Forge_Product06",
    },
    {
        id: 29001,
        name: "探险之证·净界岛",
        icon: "T_ExploreBadge_Beibao_Prologue",
    },
    {
        id: 29002,
        name: "探险之证·冰湖城",
        icon: "T_ExploreBadge_Beibao_Chapter01",
    },
    {
        id: 29003,
        name: "探险之证·龙莎要塞",
        icon: "T_ExploreBadge_Beibao_EXChapter01",
    },
    {
        id: 29004,
        name: "探险之证·烟津渡",
        icon: "T_ExploreBadge_Beibao_East",
    },
    {
        id: 29005,
        name: "太虚符文",
        icon: "T_Icon_CrystalDust",
    },
    {
        id: 30001,
        name: "生物萃取物",
        icon: "T_Resource_PolarityPart01",
    },
    {
        id: 30002,
        name: "精工磁石",
        icon: "T_Resource_PolarityPart02",
    },
    {
        id: 30101,
        name: "高级染剂·泪湖",
        icon: "T_Dye_01",
    },
    {
        id: 30102,
        name: "基础染剂·海盐",
        icon: "T_Dye_02",
    },
    {
        id: 30103,
        name: "基础染剂·林梢",
        icon: "T_Dye_03",
    },
    {
        id: 30104,
        name: "基础染剂·豌豆",
        icon: "T_Dye_04",
    },
    {
        id: 30105,
        name: "基础染剂·沙丘",
        icon: "T_Dye_05",
    },
    {
        id: 30106,
        name: "基础染剂·红土",
        icon: "T_Dye_06",
    },
    {
        id: 30107,
        name: "基础染剂·胭脂",
        icon: "T_Dye_07",
    },
    {
        id: 30108,
        name: "高级染剂·群鸦",
        icon: "T_Dye_08",
    },
    {
        id: 30109,
        name: "基础染剂·雷雨",
        icon: "T_Dye_09",
    },
    {
        id: 40001,
        name: "嗅盐·一",
        icon: "T_Hp_Full",
    },
    {
        id: 40002,
        name: "凝神嗅盐·一",
        icon: "T_Drop_Mp",
    },
    {
        id: 40003,
        name: "弹药补给箱·一",
        icon: "T_Drop_Ammo",
    },
    {
        id: 40011,
        name: "嗅盐·二",
        icon: "T_Hp_Full",
    },
    {
        id: 40012,
        name: "凝神嗅盐·二",
        icon: "T_Drop_Mp",
    },
    {
        id: 40013,
        name: "弹药补给箱·二",
        icon: "T_Drop_Ammo",
    },
    {
        id: 41002,
        name: "箱中之猫·本色",
        icon: "T_Resource_Gesture_Zhixiang",
    },
    {
        id: 41005,
        name: "箱中之猫·铅灰",
        icon: "T_Resource_Gesture_Zhixiang",
    },
    {
        id: 41006,
        name: "箱中之猫·白樱",
        icon: "T_Resource_Gesture_Zhixiang",
    },
    {
        id: 41012,
        name: "弦上诗篇·黛蓝",
        icon: "T_Resource_Gesture_ViolinDarkIndigo",
    },
    {
        id: 41013,
        name: "“绝不空军”",
        icon: "T_Resource_Gesture_Angling",
    },
    {
        id: 41014,
        name: "极速定格·本色",
        icon: "T_Resource_Gesture_CarBlack",
    },
    {
        id: 41015,
        name: "弦上诗篇·焦糖",
        icon: "T_Resource_Gesture_ViolinCaramel",
    },
    {
        id: 41016,
        name: "弦上诗篇·涅白",
        icon: "T_Resource_Gesture_Violin",
    },
    {
        id: 41017,
        name: "极速定格·白樱",
        icon: "T_Resource_Gesture_CarPink",
    },
    {
        id: 41018,
        name: "极速定格·鎏金",
        icon: "T_Resource_Gesture_Car",
    },
    {
        id: 41019,
        name: "泡泡泡泡鸭",
        icon: "T_Resource_Gesture_Bubblegun",
    },
    {
        id: 41020,
        name: "悠游水岸·本色",
        icon: "T_Resource_Gesture_Beach",
    },
    {
        id: 41021,
        name: "悠游水岸·白樱",
        icon: "T_Resource_Gesture_BeachPink",
    },
    {
        id: 41022,
        name: "悠游水岸·绛紫",
        icon: "T_Resource_Gesture_BeachBlue",
    },
    {
        id: 41028,
        name: "技能五子棋",
        icon: "T_Resource_Gesture_SkillGomoku",
    },
    {
        id: 110006,
        name: "启航自选形象礼箱·星芒",
        icon: "T_Pack_Christmas",
    },
    {
        id: 110012,
        name: "闻香自选形象礼箱·墨玉",
        icon: "T_Pack_Common02",
    },
    {
        id: 1001101,
        name: "思绪片段·贝蕾妮卡",
        icon: "T_CharPiece_Heitao",
    },
    {
        id: 1001103,
        name: "思绪片段·幻景",
        icon: "T_CharPiece_Tuosi",
    },
    {
        id: 1001501,
        name: "思绪片段·莉兹贝尔",
        icon: "T_CharPiece_Baonu",
    },
    {
        id: 1001502,
        name: "思绪片段·妮弗尔夫人",
        icon: "T_CharPiece_Nifu",
    },
    {
        id: 1001503,
        name: "思绪片段·刻舟",
        icon: "T_CharPiece_Kezhou",
    },
    {
        id: 1001801,
        name: "思绪片段·菲娜",
        icon: "T_CharPiece_Feina",
    },
    {
        id: 1002101,
        name: "思绪片段·丽蓓卡",
        icon: "T_CharPiece_Shuimu",
    },
    {
        id: 1002301,
        name: "思绪片段·塔比瑟",
        icon: "T_CharPiece_Zhangyu",
    },
    {
        id: 1002401,
        name: "思绪片段·扶疏",
        icon: "T_CharPiece_Baiheng",
    },
    {
        id: 1003101,
        name: "思绪片段·琳恩",
        icon: "T_CharPiece_Linen",
    },
    {
        id: 1003103,
        name: "思绪片段·耶尔与奥利弗",
        icon: "T_CharPiece_Yeer",
    },
    {
        id: 1003201,
        name: "思绪片段·海尔法",
        icon: "T_CharPiece_Haier",
    },
    {
        id: 1003301,
        name: "思绪片段·玛尔洁",
        icon: "T_CharPiece_Maer",
    },
    {
        id: 1004101,
        name: "思绪片段·黎瑟",
        icon: "T_CharPiece_Lise",
    },
    {
        id: 1004202,
        name: "思绪片段·兰迪",
        icon: "T_CharPiece_Landi",
    },
    {
        id: 1004301,
        name: "思绪片段·西比尔",
        icon: "T_CharPiece_Xibi",
    },
    {
        id: 1005101,
        name: "思绪片段·松露与榛子",
        icon: "T_CharPiece_Songlu",
    },
    {
        id: 1005102,
        name: "思绪片段·奥特赛德",
        icon: "T_CharPiece_Aote",
    },
    {
        id: 1005301,
        name: "思绪片段·赛琪",
        icon: "T_CharPiece_Saiqi",
    },
    {
        id: 1005401,
        name: "思绪片段·达芙涅",
        icon: "T_CharPiece_Dafu",
    },
    {
        id: 3000012,
        name: "固定支架",
        icon: "T_Resource_Forge_Product03",
    },
    {
        id: 3000013,
        name: "祈请净火的枪机",
        icon: "T_Range_Weapon_Part02",
    },
    {
        id: 3000014,
        name: "祈请净火的枪身",
        icon: "T_Range_Weapon_Part03",
    },
    {
        id: 3000015,
        name: "祈请净火的枪管",
        icon: "T_Range_Weapon_Part01",
    },
    {
        id: 3000016,
        name: "金砂",
        icon: "T_Resource_Forge_High03",
    },
    {
        id: 3000017,
        name: "匍地枝",
        icon: "T_Resource_Forge_Low01",
    },
    {
        id: 4010001,
        name: "翠息蝶",
        icon: "T_Pickup_Butterfly01",
    },
    {
        id: 4010002,
        name: "靛息蝶",
        icon: "T_Pickup_Butterfly02",
    },
    {
        id: 4010003,
        name: "清泉",
        icon: "T_Pickup_Spring",
    },
    {
        id: 4010004,
        name: "小雪帽",
        icon: "T_Pickup_Mushroom",
    },
    {
        id: 4010005,
        name: "罐装月髓液",
        icon: "T_Pickup_Marrow",
    },
    {
        id: 4010006,
        name: "紫露花",
        icon: "T_Pickup_Grass02",
    },
    {
        id: 4010007,
        name: "贝壳",
        icon: "T_Pickup_Shell",
    },
    {
        id: 4010008,
        name: "莲草",
        icon: "T_Pickup_Grass01",
    },
    {
        id: 4010009,
        name: "便携供能装置",
        icon: "T_Pickup_Battery",
    },
    {
        id: 4010010,
        name: "隙中花",
        icon: "T_Pickup_Blueflower",
    },
    {
        id: 4010011,
        name: "圣音铃兰",
        icon: "T_Pickup_Redflower",
    },
    {
        id: 4010012,
        name: "鸟蛋",
        icon: "T_Pickup_Egg",
    },
    {
        id: 4010014,
        name: "告苍",
        icon: "T_Pickup_05",
    },
    {
        id: 4010015,
        name: "匪石",
        icon: "T_Pickup_02",
    },
    {
        id: 4010016,
        name: "残器",
        icon: "T_Pickup_04",
    },
    {
        id: 4010017,
        name: "织机娘",
        icon: "T_Pickup_01",
    },
    {
        id: 4010018,
        name: "石龙子",
        icon: "T_Pickup_Skink",
    },
    {
        id: 4010019,
        name: "观雨蛙",
        icon: "T_Pickup_RainFrog",
    },
    {
        id: 4020003,
        name: "银辉石",
        icon: "T_Pickup_Stone01",
    },
    {
        id: 5110200,
        name: "入门鱼竿",
        icon: "T_FishingRod_Normal_2",
    },
    {
        id: 5110300,
        name: "进阶鱼竿",
        icon: "T_FishingRod_Normal_3",
    },
    {
        id: 5110400,
        name: "专家鱼竿",
        icon: "T_FishingRod_Normal_4",
    },
    {
        id: 5110500,
        name: "大师鱼竿",
        icon: "T_FishingRod_Normal_5",
    },
    {
        id: 5210100,
        name: "通用鱼饵",
        icon: "T_FishingLure_Normal",
    },
    {
        id: 5210200,
        name: "蚓鱼上钩",
        icon: "T_FishingLure_Special_3",
    },
    {
        id: 5210300,
        name: "同类相吸",
        icon: "T_FishingLure_Special_1",
    },
    {
        id: 5210400,
        name: "好翅爱吃",
        icon: "T_FishingLure_Special_2",
    },
    {
        id: 6000001,
        name: "春泽玄宝",
        icon: "T_Coin_ActivityZhiliu01",
    },
]

export default t
