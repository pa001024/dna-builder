import type { QuestNode } from "./quest.data"

export interface DynQuest {
    id: number
    name: string
    level: number[]
    regionId: number
    subRegionId: number
    chance: number
    completeNum: number
    dayLimit: boolean
    reward: number[]
    nodes?: QuestNode[]
    startIds?: string[]
}

const t: DynQuest[] = [
    {
        id: 100101,
        name: "打打打打打劫",
        level: [1, 29],
        regionId: 1001,
        subRegionId: 100101,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
    },
    {
        id: 100102,
        name: "打打打打打劫",
        level: [30, 39],
        regionId: 1001,
        subRegionId: 100101,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
    },
    {
        id: 100203,
        name: "探险家大危机！",
        level: [40, 49],
        regionId: 1001,
        subRegionId: 100101,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17159310962711082",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000501,
                        content: "别打啦，再打我就要使出绝活了……好，我要用了哦……救命啊啊啊啊啊！！！\n",
                        npc: 800005,
                        next: 71000511,
                    },
                ],
            },
            {
                id: "17159311478612743",
                type: "TalkNode",
                name: "皎皎感谢",
                dialogues: [
                    {
                        id: 71000511,
                        content: "谢谢，探险家大危机解除！继续冒险喽。",
                        npc: 800005,
                    },
                ],
            },
        ],
    },
    {
        id: 100204,
        name: "探险家大危机！",
        level: [50, 59],
        regionId: 1001,
        subRegionId: 100101,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17159310962711082",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000501,
                        content: "别打啦，再打我就要使出绝活了……好，我要用了哦……救命啊啊啊啊啊！！！\n",
                        npc: 800005,
                        next: 71000511,
                    },
                ],
            },
            {
                id: "17159311478612743",
                type: "TalkNode",
                name: "皎皎感谢",
                dialogues: [
                    {
                        id: 71000511,
                        content: "谢谢，探险家大危机解除！继续冒险喽。",
                        npc: 800005,
                    },
                ],
            },
        ],
    },
    {
        id: 100301,
        name: "打捞物资",
        level: [1, 29],
        regionId: 1001,
        subRegionId: 100101,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1716888064673118078",
                type: "TalkNode",
                name: "开车海滩木桶",
                next: ["17212055560456186", "17212055621486390"],
                dialogues: [
                    {
                        id: 71000601,
                        content: "（被海浪冲上岸的木桶堆积在沙滩上，找找看的话，也许能发现一些有用的东西。）",
                        npc: 800006,
                        next: 71000612,
                    },
                ],
            },
            {
                id: "17212054148203147",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000612,
                        content: "（木桶底部破了个大洞，不管它曾装过什么金银财宝，现在都是件无用的垃圾。去看看其他木桶吧。）",
                    },
                ],
            },
            {
                id: "17212055560456186",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000613,
                        content: "（木桶里除了腐烂的鱼虾以外什么也没有，去看看其他木桶吧。）",
                    },
                ],
            },
            {
                id: "17212055621486390",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000615,
                        content: "（功夫不负有心人，仔细翻找之后，你终于在木桶的夹层里找到了一些能用的物资。）",
                    },
                ],
            },
        ],
    },
    {
        id: 100302,
        name: "打捞物资",
        level: [30, 39],
        regionId: 1001,
        subRegionId: 100101,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1716888064673118078",
                type: "TalkNode",
                name: "开车海滩木桶",
                next: ["17212055560456186", "17212055621486390"],
                dialogues: [
                    {
                        id: 71000601,
                        content: "（被海浪冲上岸的木桶堆积在沙滩上，找找看的话，也许能发现一些有用的东西。）",
                        npc: 800006,
                        next: 71000612,
                    },
                ],
            },
            {
                id: "17212054148203147",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000612,
                        content: "（木桶底部破了个大洞，不管它曾装过什么金银财宝，现在都是件无用的垃圾。去看看其他木桶吧。）",
                    },
                ],
            },
            {
                id: "17212055560456186",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000613,
                        content: "（木桶里除了腐烂的鱼虾以外什么也没有，去看看其他木桶吧。）",
                    },
                ],
            },
            {
                id: "17212055621486390",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000615,
                        content: "（功夫不负有心人，仔细翻找之后，你终于在木桶的夹层里找到了一些能用的物资。）",
                    },
                ],
            },
        ],
    },
    {
        id: 100401,
        name: "环境治理",
        level: [1, 29],
        regionId: 1001,
        subRegionId: 100101,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1716973331678890",
                type: "TalkNode",
                name: "开始清扫对话",
                dialogues: [
                    {
                        id: 71001201,
                        content: "（杂草淹没了你与贝蕾曾经留在此处的痕迹，也许应该清理一下神像附近的杂草了。）",
                        npc: 800006,
                        next: 71001202,
                    },
                ],
            },
            {
                id: "17169737849112259",
                type: "TalkNode",
                name: "完成对话",
                dialogues: [
                    {
                        id: 71001202,
                        content: "（在你的努力下，神像附近恢复了整洁，一如你回忆中的景色。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 100402,
        name: "环境治理",
        level: [30, 39],
        regionId: 1001,
        subRegionId: 100101,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1716973331678890",
                type: "TalkNode",
                name: "开始清扫对话",
                dialogues: [
                    {
                        id: 71001201,
                        content: "（杂草淹没了你与贝蕾曾经留在此处的痕迹，也许应该清理一下神像附近的杂草了。）",
                        npc: 800006,
                        next: 71001202,
                    },
                ],
            },
            {
                id: "17169737849112259",
                type: "TalkNode",
                name: "完成对话",
                dialogues: [
                    {
                        id: 71001202,
                        content: "（在你的努力下，神像附近恢复了整洁，一如你回忆中的景色。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 100501,
        name: "突袭的秽兽",
        level: [1, 29],
        regionId: 1001,
        subRegionId: 100102,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17212734388343539",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71001101,
                        content: "（秽兽来袭，击退它们！）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 100502,
        name: "突袭的秽兽",
        level: [30, 39],
        regionId: 1001,
        subRegionId: 100102,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17212734388343539",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71001101,
                        content: "（秽兽来袭，击退它们！）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 100503,
        name: "突袭的秽兽",
        level: [40, 49],
        regionId: 1001,
        subRegionId: 100102,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17212734388343539",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71001101,
                        content: "（秽兽来袭，击退它们！）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 100600,
        name: "喵……喵？喵！",
        level: [],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: 3,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17550777788132148773",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 72000000,
                        content: "喵……",
                        npc: 800003,
                        next: 71000100,
                    },
                ],
            },
            {
                id: "17550777788132148774",
                type: "TalkNode",
                name: "和猫对话",
                next: ["17550777788132148781", "17550777788132148782", "17550777788132148784", "17550777788132148786"],
                dialogues: [
                    {
                        id: 71000100,
                        content: "（野猫寂寞地叫着，似乎在渴求某位好心人的注意。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17550777788132148775",
                type: "TalkNode",
                name: "和商人1对话",
                dialogues: [
                    {
                        id: 71000200,
                        content: "请问这里有猫粮卖吗？",
                        npc: 100001,
                        next: 710002001,
                    },
                    {
                        id: 710002001,
                        content: "没有没有，人吃的都不够，谁还有心思管猫啊。",
                        npc: 700107,
                        next: 71000210,
                    },
                ],
            },
            {
                id: "17550777788132148777",
                type: "TalkNode",
                name: "和商人2对话",
                dialogues: [
                    {
                        id: 71000210,
                        content: "请问这里有猫粮卖吗？",
                        npc: 100001,
                        next: 710002101,
                    },
                    {
                        id: 710002101,
                        content: "有，自己选吧。真是稀客，我还以为只有内城的老爷太太们会专门给猫买吃的。",
                        npc: 700106,
                        next: 71000220,
                    },
                ],
            },
            {
                id: "17550777788132148778",
                type: "TalkNode",
                name: "和猫对话",
                dialogues: [
                    {
                        id: 71000220,
                        content: "（摆下猫粮）",
                        npc: 100001,
                        next: 710002201,
                    },
                    {
                        id: 710002201,
                        content: "（野猫围着你的食物转了两圈后才放下戒备，吃了起来。看着它满足的表情，你的内心也得到了极大的治愈。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17550777788132148781",
                type: "TalkNode",
                name: "猫到达",
                next: ["17550777788132148784", "17550777788132148786"],
                dialogues: [
                    {
                        id: 71000300,
                        content: "（野猫蹦跳着跑开几步以后驻足看向了你，似乎想让你跟上它的步伐。）",
                        npc: 800006,
                        next: 71000310,
                    },
                ],
            },
            {
                id: "17550777788132148782",
                type: "TalkNode",
                name: "猫到达",
                next: ["17550777788132148786"],
                dialogues: [
                    {
                        id: 71000310,
                        content: "（野猫蹦跳着跑开几步以后驻足看向了你，似乎想让你跟上它的步伐。）",
                        npc: 800006,
                        next: 71000320,
                    },
                ],
            },
            {
                id: "17550777788132148784",
                type: "TalkNode",
                name: "猫到达",
                dialogues: [
                    {
                        id: 71000320,
                        content: "（野猫蹦跳着跑开几步以后驻足看向了你，似乎想让你跟上它的步伐。）",
                        npc: 800006,
                        next: 71000330,
                    },
                ],
            },
            {
                id: "17550777788132148786",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000330,
                        content: "（野猫围着你的脚边开心地转了两圈。看着它满足的表情，你的内心也得到了极大的治愈。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 100621,
        name: "喵……喵？喵！",
        level: [1, 29],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1715691459118425",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71000000,
                        content: "喵……",
                        npc: 800002,
                        next: 71000100,
                    },
                ],
            },
            {
                id: "17156917380651005",
                type: "TalkNode",
                name: "和猫对话",
                next: ["17210353525025752", "17210354719227627", "172103663043210325", "172103676512011795"],
                dialogues: [
                    {
                        id: 71000100,
                        content: "（野猫寂寞地叫着，似乎在渴求某位好心人的注意。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17156918800071843",
                type: "TalkNode",
                name: "和商人1对话",
                dialogues: [
                    {
                        id: 71000200,
                        content: "请问这里有猫粮卖吗？",
                        npc: 100001,
                        next: 710002001,
                    },
                    {
                        id: 710002001,
                        content: "没有没有，人吃的都不够，谁还有心思管猫啊。",
                        npc: 700107,
                        next: 71000210,
                    },
                ],
            },
            {
                id: "17156929075144954",
                type: "TalkNode",
                name: "和商人2对话",
                dialogues: [
                    {
                        id: 71000210,
                        content: "请问这里有猫粮卖吗？",
                        npc: 100001,
                        next: 710002101,
                    },
                    {
                        id: 710002101,
                        content: "有，自己选吧。真是稀客，我还以为只有内城的老爷太太们会专门给猫买吃的。",
                        npc: 700106,
                        next: 71000220,
                    },
                ],
            },
            {
                id: "171569331151411139",
                type: "TalkNode",
                name: "和猫对话",
                dialogues: [
                    {
                        id: 71000220,
                        content: "（摆下猫粮）",
                        npc: 100001,
                        next: 710002201,
                    },
                    {
                        id: 710002201,
                        content: "（野猫围着你的食物转了两圈后才放下戒备，吃了起来。看着它满足的表情，你的内心也得到了极大的治愈。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17210353525025752",
                type: "TalkNode",
                name: "猫到达",
                next: ["172103663043210325", "172103676512011795"],
                dialogues: [
                    {
                        id: 71000300,
                        content: "（野猫蹦跳着跑开几步以后驻足看向了你，似乎想让你跟上它的步伐。）",
                        npc: 800006,
                        next: 71000310,
                    },
                ],
            },
            {
                id: "17210354719227627",
                type: "TalkNode",
                name: "猫到达",
                next: ["172103676512011795"],
                dialogues: [
                    {
                        id: 71000310,
                        content: "（野猫蹦跳着跑开几步以后驻足看向了你，似乎想让你跟上它的步伐。）",
                        npc: 800006,
                        next: 71000320,
                    },
                ],
            },
            {
                id: "172103663043210325",
                type: "TalkNode",
                name: "猫到达",
                dialogues: [
                    {
                        id: 71000320,
                        content: "（野猫蹦跳着跑开几步以后驻足看向了你，似乎想让你跟上它的步伐。）",
                        npc: 800006,
                        next: 71000330,
                    },
                ],
            },
            {
                id: "172103676512011795",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000330,
                        content: "（野猫围着你的脚边开心地转了两圈。看着它满足的表情，你的内心也得到了极大的治愈。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 100622,
        name: "喵……喵？喵！",
        level: [30, 39],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1715691459118425",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71000000,
                        content: "喵……",
                        npc: 800002,
                        next: 71000100,
                    },
                ],
            },
            {
                id: "17156917380651005",
                type: "TalkNode",
                name: "和猫对话",
                next: ["17210353525025752", "17210354719227627", "172103663043210325", "172103676512011795"],
                dialogues: [
                    {
                        id: 71000100,
                        content: "（野猫寂寞地叫着，似乎在渴求某位好心人的注意。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17156918800071843",
                type: "TalkNode",
                name: "和商人1对话",
                dialogues: [
                    {
                        id: 71000200,
                        content: "请问这里有猫粮卖吗？",
                        npc: 100001,
                        next: 710002001,
                    },
                    {
                        id: 710002001,
                        content: "没有没有，人吃的都不够，谁还有心思管猫啊。",
                        npc: 700107,
                        next: 71000210,
                    },
                ],
            },
            {
                id: "17156929075144954",
                type: "TalkNode",
                name: "和商人2对话",
                dialogues: [
                    {
                        id: 71000210,
                        content: "请问这里有猫粮卖吗？",
                        npc: 100001,
                        next: 710002101,
                    },
                    {
                        id: 710002101,
                        content: "有，自己选吧。真是稀客，我还以为只有内城的老爷太太们会专门给猫买吃的。",
                        npc: 700106,
                        next: 71000220,
                    },
                ],
            },
            {
                id: "171569331151411139",
                type: "TalkNode",
                name: "和猫对话",
                dialogues: [
                    {
                        id: 71000220,
                        content: "（摆下猫粮）",
                        npc: 100001,
                        next: 710002201,
                    },
                    {
                        id: 710002201,
                        content: "（野猫围着你的食物转了两圈后才放下戒备，吃了起来。看着它满足的表情，你的内心也得到了极大的治愈。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17210353525025752",
                type: "TalkNode",
                name: "猫到达",
                next: ["172103663043210325", "172103676512011795"],
                dialogues: [
                    {
                        id: 71000300,
                        content: "（野猫蹦跳着跑开几步以后驻足看向了你，似乎想让你跟上它的步伐。）",
                        npc: 800006,
                        next: 71000310,
                    },
                ],
            },
            {
                id: "17210354719227627",
                type: "TalkNode",
                name: "猫到达",
                next: ["172103676512011795"],
                dialogues: [
                    {
                        id: 71000310,
                        content: "（野猫蹦跳着跑开几步以后驻足看向了你，似乎想让你跟上它的步伐。）",
                        npc: 800006,
                        next: 71000320,
                    },
                ],
            },
            {
                id: "172103663043210325",
                type: "TalkNode",
                name: "猫到达",
                dialogues: [
                    {
                        id: 71000320,
                        content: "（野猫蹦跳着跑开几步以后驻足看向了你，似乎想让你跟上它的步伐。）",
                        npc: 800006,
                        next: 71000330,
                    },
                ],
            },
            {
                id: "172103676512011795",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000330,
                        content: "（野猫围着你的脚边开心地转了两圈。看着它满足的表情，你的内心也得到了极大的治愈。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 100641,
        name: "喵……喵？喵！",
        level: [1, 29],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1715691459118425",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71000000,
                        content: "喵……",
                        npc: 800002,
                        next: 71000100,
                    },
                ],
            },
            {
                id: "17156917380651005",
                type: "TalkNode",
                name: "和猫对话",
                next: ["17210353525025752", "17210354719227627", "172103663043210325", "172103676512011795"],
                dialogues: [
                    {
                        id: 71000100,
                        content: "（野猫寂寞地叫着，似乎在渴求某位好心人的注意。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17156918800071843",
                type: "TalkNode",
                name: "和商人1对话",
                dialogues: [
                    {
                        id: 71000200,
                        content: "请问这里有猫粮卖吗？",
                        npc: 100001,
                        next: 710002001,
                    },
                    {
                        id: 710002001,
                        content: "没有没有，人吃的都不够，谁还有心思管猫啊。",
                        npc: 700107,
                        next: 71000210,
                    },
                ],
            },
            {
                id: "17156929075144954",
                type: "TalkNode",
                name: "和商人2对话",
                dialogues: [
                    {
                        id: 71000210,
                        content: "请问这里有猫粮卖吗？",
                        npc: 100001,
                        next: 710002101,
                    },
                    {
                        id: 710002101,
                        content: "有，自己选吧。真是稀客，我还以为只有内城的老爷太太们会专门给猫买吃的。",
                        npc: 700106,
                        next: 71000220,
                    },
                ],
            },
            {
                id: "171569331151411139",
                type: "TalkNode",
                name: "和猫对话",
                dialogues: [
                    {
                        id: 71000220,
                        content: "（摆下猫粮）",
                        npc: 100001,
                        next: 710002201,
                    },
                    {
                        id: 710002201,
                        content: "（野猫围着你的食物转了两圈后才放下戒备，吃了起来。看着它满足的表情，你的内心也得到了极大的治愈。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17210353525025752",
                type: "TalkNode",
                name: "猫到达",
                next: ["172103663043210325", "172103676512011795"],
                dialogues: [
                    {
                        id: 71000300,
                        content: "（野猫蹦跳着跑开几步以后驻足看向了你，似乎想让你跟上它的步伐。）",
                        npc: 800006,
                        next: 71000310,
                    },
                ],
            },
            {
                id: "17210354719227627",
                type: "TalkNode",
                name: "猫到达",
                next: ["172103676512011795"],
                dialogues: [
                    {
                        id: 71000310,
                        content: "（野猫蹦跳着跑开几步以后驻足看向了你，似乎想让你跟上它的步伐。）",
                        npc: 800006,
                        next: 71000320,
                    },
                ],
            },
            {
                id: "172103663043210325",
                type: "TalkNode",
                name: "猫到达",
                dialogues: [
                    {
                        id: 71000320,
                        content: "（野猫蹦跳着跑开几步以后驻足看向了你，似乎想让你跟上它的步伐。）",
                        npc: 800006,
                        next: 71000330,
                    },
                ],
            },
            {
                id: "172103676512011795",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000330,
                        content: "（野猫围着你的脚边开心地转了两圈。看着它满足的表情，你的内心也得到了极大的治愈。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 100642,
        name: "喵……喵？喵！",
        level: [30, 39],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1715691459118425",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71000000,
                        content: "喵……",
                        npc: 800002,
                        next: 71000100,
                    },
                ],
            },
            {
                id: "17156917380651005",
                type: "TalkNode",
                name: "和猫对话",
                next: ["17210353525025752", "17210354719227627", "172103663043210325", "172103676512011795"],
                dialogues: [
                    {
                        id: 71000100,
                        content: "（野猫寂寞地叫着，似乎在渴求某位好心人的注意。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17156918800071843",
                type: "TalkNode",
                name: "和商人1对话",
                dialogues: [
                    {
                        id: 71000200,
                        content: "请问这里有猫粮卖吗？",
                        npc: 100001,
                        next: 710002001,
                    },
                    {
                        id: 710002001,
                        content: "没有没有，人吃的都不够，谁还有心思管猫啊。",
                        npc: 700107,
                        next: 71000210,
                    },
                ],
            },
            {
                id: "17156929075144954",
                type: "TalkNode",
                name: "和商人2对话",
                dialogues: [
                    {
                        id: 71000210,
                        content: "请问这里有猫粮卖吗？",
                        npc: 100001,
                        next: 710002101,
                    },
                    {
                        id: 710002101,
                        content: "有，自己选吧。真是稀客，我还以为只有内城的老爷太太们会专门给猫买吃的。",
                        npc: 700106,
                        next: 71000220,
                    },
                ],
            },
            {
                id: "171569331151411139",
                type: "TalkNode",
                name: "和猫对话",
                dialogues: [
                    {
                        id: 71000220,
                        content: "（摆下猫粮）",
                        npc: 100001,
                        next: 710002201,
                    },
                    {
                        id: 710002201,
                        content: "（野猫围着你的食物转了两圈后才放下戒备，吃了起来。看着它满足的表情，你的内心也得到了极大的治愈。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17210353525025752",
                type: "TalkNode",
                name: "猫到达",
                next: ["172103663043210325", "172103676512011795"],
                dialogues: [
                    {
                        id: 71000300,
                        content: "（野猫蹦跳着跑开几步以后驻足看向了你，似乎想让你跟上它的步伐。）",
                        npc: 800006,
                        next: 71000310,
                    },
                ],
            },
            {
                id: "17210354719227627",
                type: "TalkNode",
                name: "猫到达",
                next: ["172103676512011795"],
                dialogues: [
                    {
                        id: 71000310,
                        content: "（野猫蹦跳着跑开几步以后驻足看向了你，似乎想让你跟上它的步伐。）",
                        npc: 800006,
                        next: 71000320,
                    },
                ],
            },
            {
                id: "172103663043210325",
                type: "TalkNode",
                name: "猫到达",
                dialogues: [
                    {
                        id: 71000320,
                        content: "（野猫蹦跳着跑开几步以后驻足看向了你，似乎想让你跟上它的步伐。）",
                        npc: 800006,
                        next: 71000330,
                    },
                ],
            },
            {
                id: "172103676512011795",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000330,
                        content: "（野猫围着你的脚边开心地转了两圈。看着它满足的表情，你的内心也得到了极大的治愈。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 100921,
        name: "生财有道",
        level: [1, 29],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17217161960701030",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71001001,
                        content: "（一台崭新的车辆，这或许是一个……发财的机会？）",
                        npc: 800006,
                        next: 71001002,
                    },
                ],
            },
            {
                id: "171887280913814460",
                type: "TalkNode",
                name: "发现汽车选择是否偷车",
                next: ["17219796749773662", "17213855146685809", "17217164209203383"],
                dialogues: [
                    {
                        id: 71001002,
                        content: "（车里的月髓能源装置装得满满当当，果然是一个发财的机会！）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17219796749773663",
                type: "TalkNode",
                name: "提议去找士兵",
                dialogues: [
                    {
                        id: 71001005,
                        content: "（良知最终战胜了诱惑，你决定向城门守卫汇报车辆安保的疏漏。）",
                        npc: 800006,
                        next: 71001006,
                    },
                ],
            },
            {
                id: "17219796749773662",
                type: "TalkNode",
                name: "与士兵对话",
                dialogues: [
                    {
                        id: 71001006,
                        content: "感谢您的通知，我这就派人加强巡逻，这是一点谢礼，还望不要嫌弃。",
                        npc: 818010,
                    },
                ],
            },
            {
                id: "17213855146685809",
                type: "TalkNode",
                name: "士兵威慑玩家",
                dialogues: [
                    {
                        id: 71001003,
                        content: "你在干什么！快来人啊！",
                        npc: 818010,
                        next: 71001004,
                    },
                ],
            },
            {
                id: "17217164209203383",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71001004,
                        content:
                            "（现在不会再有人来阻拦你的脚步了。撬开车锁，带走装满月髓液的能源装置，卖个好价钱。一切都在按你的计划进行，又是令人心情愉悦的一天。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 100922,
        name: "生财有道",
        level: [30, 39],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17217161960701030",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71001001,
                        content: "（一台崭新的车辆，这或许是一个……发财的机会？）",
                        npc: 800006,
                        next: 71001002,
                    },
                ],
            },
            {
                id: "171887280913814460",
                type: "TalkNode",
                name: "发现汽车选择是否偷车",
                next: ["17219796749773662", "17213855146685809", "17217164209203383"],
                dialogues: [
                    {
                        id: 71001002,
                        content: "（车里的月髓能源装置装得满满当当，果然是一个发财的机会！）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17219796749773663",
                type: "TalkNode",
                name: "提议去找士兵",
                dialogues: [
                    {
                        id: 71001005,
                        content: "（良知最终战胜了诱惑，你决定向城门守卫汇报车辆安保的疏漏。）",
                        npc: 800006,
                        next: 71001006,
                    },
                ],
            },
            {
                id: "17219796749773662",
                type: "TalkNode",
                name: "与士兵对话",
                dialogues: [
                    {
                        id: 71001006,
                        content: "感谢您的通知，我这就派人加强巡逻，这是一点谢礼，还望不要嫌弃。",
                        npc: 818010,
                    },
                ],
            },
            {
                id: "17213855146685809",
                type: "TalkNode",
                name: "士兵威慑玩家",
                dialogues: [
                    {
                        id: 71001003,
                        content: "你在干什么！快来人啊！",
                        npc: 818010,
                        next: 71001004,
                    },
                ],
            },
            {
                id: "17217164209203383",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71001004,
                        content:
                            "（现在不会再有人来阻拦你的脚步了。撬开车锁，带走装满月髓液的能源装置，卖个好价钱。一切都在按你的计划进行，又是令人心情愉悦的一天。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 100923,
        name: "生财有道",
        level: [40, 49],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17217161960701030",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71001001,
                        content: "（一台崭新的车辆，这或许是一个……发财的机会？）",
                        npc: 800006,
                        next: 71001002,
                    },
                ],
            },
            {
                id: "171887280913814460",
                type: "TalkNode",
                name: "发现汽车选择是否偷车",
                next: ["17219796749773662", "17213855146685809", "17217164209203383"],
                dialogues: [
                    {
                        id: 71001002,
                        content: "（车里的月髓能源装置装得满满当当，果然是一个发财的机会！）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17219796749773663",
                type: "TalkNode",
                name: "提议去找士兵",
                dialogues: [
                    {
                        id: 71001005,
                        content: "（良知最终战胜了诱惑，你决定向城门守卫汇报车辆安保的疏漏。）",
                        npc: 800006,
                        next: 71001006,
                    },
                ],
            },
            {
                id: "17219796749773662",
                type: "TalkNode",
                name: "与士兵对话",
                dialogues: [
                    {
                        id: 71001006,
                        content: "感谢您的通知，我这就派人加强巡逻，这是一点谢礼，还望不要嫌弃。",
                        npc: 818010,
                    },
                ],
            },
            {
                id: "17213855146685809",
                type: "TalkNode",
                name: "士兵威慑玩家",
                dialogues: [
                    {
                        id: 71001003,
                        content: "你在干什么！快来人啊！",
                        npc: 818010,
                        next: 71001004,
                    },
                ],
            },
            {
                id: "17217164209203383",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71001004,
                        content:
                            "（现在不会再有人来阻拦你的脚步了。撬开车锁，带走装满月髓液的能源装置，卖个好价钱。一切都在按你的计划进行，又是令人心情愉悦的一天。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 100951,
        name: "生财有道",
        level: [1, 29],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17217161960701030",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71001001,
                        content: "（一台崭新的车辆，这或许是一个……发财的机会？）",
                        npc: 800006,
                        next: 71001002,
                    },
                ],
            },
            {
                id: "171887280913814460",
                type: "TalkNode",
                name: "发现汽车选择是否偷车",
                next: ["17219796749773662", "17213855146685809", "17217164209203383"],
                dialogues: [
                    {
                        id: 71001002,
                        content: "（车里的月髓能源装置装得满满当当，果然是一个发财的机会！）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17219796749773663",
                type: "TalkNode",
                name: "提议去找士兵",
                dialogues: [
                    {
                        id: 71001005,
                        content: "（良知最终战胜了诱惑，你决定向城门守卫汇报车辆安保的疏漏。）",
                        npc: 800006,
                        next: 71001006,
                    },
                ],
            },
            {
                id: "17219796749773662",
                type: "TalkNode",
                name: "与士兵对话",
                dialogues: [
                    {
                        id: 71001006,
                        content: "感谢您的通知，我这就派人加强巡逻，这是一点谢礼，还望不要嫌弃。",
                        npc: 818010,
                    },
                ],
            },
            {
                id: "17213855146685809",
                type: "TalkNode",
                name: "士兵威慑玩家",
                dialogues: [
                    {
                        id: 71001003,
                        content: "你在干什么！快来人啊！",
                        npc: 818010,
                        next: 71001004,
                    },
                ],
            },
            {
                id: "17217164209203383",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71001004,
                        content:
                            "（现在不会再有人来阻拦你的脚步了。撬开车锁，带走装满月髓液的能源装置，卖个好价钱。一切都在按你的计划进行，又是令人心情愉悦的一天。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 100952,
        name: "生财有道",
        level: [30, 39],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17217161960701030",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71001001,
                        content: "（一台崭新的车辆，这或许是一个……发财的机会？）",
                        npc: 800006,
                        next: 71001002,
                    },
                ],
            },
            {
                id: "171887280913814460",
                type: "TalkNode",
                name: "发现汽车选择是否偷车",
                next: ["17219796749773662", "17213855146685809", "17217164209203383"],
                dialogues: [
                    {
                        id: 71001002,
                        content: "（车里的月髓能源装置装得满满当当，果然是一个发财的机会！）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17219796749773663",
                type: "TalkNode",
                name: "提议去找士兵",
                dialogues: [
                    {
                        id: 71001005,
                        content: "（良知最终战胜了诱惑，你决定向城门守卫汇报车辆安保的疏漏。）",
                        npc: 800006,
                        next: 71001006,
                    },
                ],
            },
            {
                id: "17219796749773662",
                type: "TalkNode",
                name: "与士兵对话",
                dialogues: [
                    {
                        id: 71001006,
                        content: "感谢您的通知，我这就派人加强巡逻，这是一点谢礼，还望不要嫌弃。",
                        npc: 818010,
                    },
                ],
            },
            {
                id: "17213855146685809",
                type: "TalkNode",
                name: "士兵威慑玩家",
                dialogues: [
                    {
                        id: 71001003,
                        content: "你在干什么！快来人啊！",
                        npc: 818010,
                        next: 71001004,
                    },
                ],
            },
            {
                id: "17217164209203383",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71001004,
                        content:
                            "（现在不会再有人来阻拦你的脚步了。撬开车锁，带走装满月髓液的能源装置，卖个好价钱。一切都在按你的计划进行，又是令人心情愉悦的一天。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 100953,
        name: "生财有道",
        level: [40, 49],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17217161960701030",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71001001,
                        content: "（一台崭新的车辆，这或许是一个……发财的机会？）",
                        npc: 800006,
                        next: 71001002,
                    },
                ],
            },
            {
                id: "171887280913814460",
                type: "TalkNode",
                name: "发现汽车选择是否偷车",
                next: ["17219796749773662", "17213855146685809", "17217164209203383"],
                dialogues: [
                    {
                        id: 71001002,
                        content: "（车里的月髓能源装置装得满满当当，果然是一个发财的机会！）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17219796749773663",
                type: "TalkNode",
                name: "提议去找士兵",
                dialogues: [
                    {
                        id: 71001005,
                        content: "（良知最终战胜了诱惑，你决定向城门守卫汇报车辆安保的疏漏。）",
                        npc: 800006,
                        next: 71001006,
                    },
                ],
            },
            {
                id: "17219796749773662",
                type: "TalkNode",
                name: "与士兵对话",
                dialogues: [
                    {
                        id: 71001006,
                        content: "感谢您的通知，我这就派人加强巡逻，这是一点谢礼，还望不要嫌弃。",
                        npc: 818010,
                    },
                ],
            },
            {
                id: "17213855146685809",
                type: "TalkNode",
                name: "士兵威慑玩家",
                dialogues: [
                    {
                        id: 71001003,
                        content: "你在干什么！快来人啊！",
                        npc: 818010,
                        next: 71001004,
                    },
                ],
            },
            {
                id: "17217164209203383",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71001004,
                        content:
                            "（现在不会再有人来阻拦你的脚步了。撬开车锁，带走装满月髓液的能源装置，卖个好价钱。一切都在按你的计划进行，又是令人心情愉悦的一天。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 101100,
        name: "探险家大危机！",
        level: [1, 65],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17189631195655361",
                type: "TalkNode",
                name: "弹旁白",
                next: ["17189632786227222"],
                dialogues: [
                    {
                        id: 71000501,
                        content: "别打啦，再打我就要使出绝活了……好，我要用了哦……救命啊啊啊啊啊！！！\n",
                        npc: 800005,
                        next: 71000512,
                    },
                ],
            },
            {
                id: "1725265371621170332",
                type: "TalkNode",
                name: "狩月人开车",
                dialogues: [
                    {
                        id: 71000503,
                        content: "最后一个，搞定。",
                        npc: 818014,
                        next: 71000504,
                    },
                ],
            },
            {
                id: "1725265394661170719",
                type: "TalkNode",
                name: "探险白与狩月人的旁白",
                dialogues: [
                    {
                        id: 71000504,
                        content: "我去看看附近还有没有敌人，你自己小心。",
                        npc: 818014,
                        next: 71000505,
                    },
                    {
                        id: 71000505,
                        content: "收到收到，我会注意的！",
                        npc: 818015,
                        next: 71000506,
                    },
                    {
                        id: 71000506,
                        content: "诶，你也来啦。呜呜……原来有这么多人愿意帮助我……这是给大家准备的谢礼，以后也请多多关照了。",
                        npc: 818015,
                    },
                ],
            },
            {
                id: "17189632786227222",
                type: "TalkNode",
                name: "表达感谢",
                dialogues: [
                    {
                        id: 71000512,
                        content: "谢谢，探险家大危机解除！继续冒险喽。",
                        npc: 800005,
                    },
                ],
            },
        ],
    },
    {
        id: 101211,
        name: "丢三落四",
        level: [1, 29],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17217248991461516",
                type: "TalkNode",
                name: "狩月人开车对话",
                dialogues: [
                    {
                        id: 71001601,
                        content: "好多秽兽啊……这可怎么办……",
                        npc: 818004,
                        next: 71001602,
                    },
                ],
            },
            {
                id: "17217249478352306",
                type: "TalkNode",
                name: "与狩月人交流",
                next: ["17220635389484742", "17220635389484746"],
                dialogues: [
                    {
                        id: 71001602,
                        content: "发生什么了？",
                        npc: 100001,
                        next: 71001603,
                    },
                    {
                        id: 71001603,
                        content: "哇，看你的打扮，是位很厉害的狩月人吧！那个……我其实也是狩月人，只是我太弱了……",
                        npc: 818004,
                        next: 71001604,
                    },
                    {
                        id: 71001604,
                        content: "你能帮我把落在那群秽兽里的武器拿回来吗，不然我连下个委托都做不了了……",
                        npc: 818004,
                        next: 71001605,
                    },
                    {
                        id: 71001605,
                        content: "……我来帮忙吧。",
                        npc: 100001,
                        next: 71001606,
                    },
                    {
                        id: 71001606,
                        content: "谢谢谢谢！",
                        npc: 818004,
                        next: 71001607,
                    },
                ],
            },
            {
                id: "17220635389484739",
                type: "TalkNode",
                name: "开车对话",
                next: ["17220635389484746"],
                dialogues: [
                    {
                        id: 71001607,
                        content: "秽兽就在前面，大师，你也小心些哦。",
                        npc: 818004,
                        next: 71001608,
                    },
                ],
            },
            {
                id: "17220635389484742",
                type: "TalkNode",
                name: "与狩月人对话",
                dialogues: [
                    {
                        id: 71001608,
                        content: "呜呜呜……要是接不了委托可怎么办呀，好几天没吃饭了……",
                        npc: 818004,
                        options: [
                            {
                                id: 710016081,
                                content: "（交出武器。）",
                                next: 71001609,
                                impr: [1011, "Empathy", 1],
                            },
                            {
                                id: 710016082,
                                content: "（再考虑一下。）",
                                next: 71001608,
                            },
                        ],
                    },
                    {
                        id: 71001609,
                        content: "谢谢！那我这就去做委托了，大师，我们以后再见！",
                        npc: 818004,
                    },
                ],
            },
            {
                id: "17220635389484746",
                type: "TalkNode",
                name: "与商人对话",
                dialogues: [
                    {
                        id: 71001610,
                        content:
                            "事情我都知道了，把武器还给一名弱者真的好吗？说不定哪次就死在委托里了，与其这样，不如把她的武器都卖给我吧。这样对大家都好。",
                        npc: 818005,
                        options: [
                            {
                                id: 710016101,
                                content: "（卖掉武器。）",
                                next: 71001611,
                                impr: [1011, "Benefit", 1],
                            },
                            {
                                id: 710016102,
                                content: "（再考虑一下。）",
                                next: 71001610,
                            },
                        ],
                    },
                    {
                        id: 71001611,
                        content: "合作愉快，以后还请继续找我。",
                        npc: 818005,
                    },
                ],
            },
            {
                id: "17220635389494748",
                type: "TalkNode",
                name: "商人感谢",
                dialogues: [
                    {
                        id: 71001611,
                        content: "合作愉快，以后还请继续找我。",
                        npc: 818005,
                        next: 71001610,
                    },
                ],
            },
            {
                id: "17220635389484744",
                type: "TalkNode",
                name: "狩月人感谢",
                dialogues: [
                    {
                        id: 71001609,
                        content: "谢谢！那我这就去做委托了，大师，我们以后再见！",
                        npc: 818004,
                        next: 71001608,
                    },
                ],
            },
        ],
        startIds: ["17217248991461516", "17220635389494748", "17220635389484744"],
    },
    {
        id: 101212,
        name: "丢三落四",
        level: [30, 39],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17217248991461516",
                type: "TalkNode",
                name: "狩月人开车对话",
                dialogues: [
                    {
                        id: 71001601,
                        content: "好多秽兽啊……这可怎么办……",
                        npc: 818004,
                        next: 71001602,
                    },
                ],
            },
            {
                id: "17217249478352306",
                type: "TalkNode",
                name: "与狩月人交流",
                next: ["17220635389484742", "17220635389484746"],
                dialogues: [
                    {
                        id: 71001602,
                        content: "发生什么了？",
                        npc: 100001,
                        next: 71001603,
                    },
                    {
                        id: 71001603,
                        content: "哇，看你的打扮，是位很厉害的狩月人吧！那个……我其实也是狩月人，只是我太弱了……",
                        npc: 818004,
                        next: 71001604,
                    },
                    {
                        id: 71001604,
                        content: "你能帮我把落在那群秽兽里的武器拿回来吗，不然我连下个委托都做不了了……",
                        npc: 818004,
                        next: 71001605,
                    },
                    {
                        id: 71001605,
                        content: "……我来帮忙吧。",
                        npc: 100001,
                        next: 71001606,
                    },
                    {
                        id: 71001606,
                        content: "谢谢谢谢！",
                        npc: 818004,
                        next: 71001607,
                    },
                ],
            },
            {
                id: "17220635389484739",
                type: "TalkNode",
                name: "开车对话",
                next: ["17220635389484746"],
                dialogues: [
                    {
                        id: 71001607,
                        content: "秽兽就在前面，大师，你也小心些哦。",
                        npc: 818004,
                        next: 71001608,
                    },
                ],
            },
            {
                id: "17220635389484742",
                type: "TalkNode",
                name: "与狩月人对话",
                dialogues: [
                    {
                        id: 71001608,
                        content: "呜呜呜……要是接不了委托可怎么办呀，好几天没吃饭了……",
                        npc: 818004,
                        options: [
                            {
                                id: 710016081,
                                content: "（交出武器。）",
                                next: 71001609,
                                impr: [1011, "Empathy", 1],
                            },
                            {
                                id: 710016082,
                                content: "（再考虑一下。）",
                                next: 71001608,
                            },
                        ],
                    },
                    {
                        id: 71001609,
                        content: "谢谢！那我这就去做委托了，大师，我们以后再见！",
                        npc: 818004,
                    },
                ],
            },
            {
                id: "17220635389484746",
                type: "TalkNode",
                name: "与商人对话",
                dialogues: [
                    {
                        id: 71001610,
                        content:
                            "事情我都知道了，把武器还给一名弱者真的好吗？说不定哪次就死在委托里了，与其这样，不如把她的武器都卖给我吧。这样对大家都好。",
                        npc: 818005,
                        options: [
                            {
                                id: 710016101,
                                content: "（卖掉武器。）",
                                next: 71001611,
                                impr: [1011, "Benefit", 1],
                            },
                            {
                                id: 710016102,
                                content: "（再考虑一下。）",
                                next: 71001610,
                            },
                        ],
                    },
                    {
                        id: 71001611,
                        content: "合作愉快，以后还请继续找我。",
                        npc: 818005,
                    },
                ],
            },
            {
                id: "17220635389494748",
                type: "TalkNode",
                name: "商人感谢",
                dialogues: [
                    {
                        id: 71001611,
                        content: "合作愉快，以后还请继续找我。",
                        npc: 818005,
                        next: 71001610,
                    },
                ],
            },
            {
                id: "17220635389484744",
                type: "TalkNode",
                name: "狩月人感谢",
                dialogues: [
                    {
                        id: 71001609,
                        content: "谢谢！那我这就去做委托了，大师，我们以后再见！",
                        npc: 818004,
                        next: 71001608,
                    },
                ],
            },
        ],
        startIds: ["17217248991461516", "17220635389494748", "17220635389484744"],
    },
    {
        id: 101213,
        name: "丢三落四",
        level: [40, 49],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17217248991461516",
                type: "TalkNode",
                name: "狩月人开车对话",
                dialogues: [
                    {
                        id: 71001601,
                        content: "好多秽兽啊……这可怎么办……",
                        npc: 818004,
                        next: 71001602,
                    },
                ],
            },
            {
                id: "17217249478352306",
                type: "TalkNode",
                name: "与狩月人交流",
                next: ["17220635389484742", "17220635389484746"],
                dialogues: [
                    {
                        id: 71001602,
                        content: "发生什么了？",
                        npc: 100001,
                        next: 71001603,
                    },
                    {
                        id: 71001603,
                        content: "哇，看你的打扮，是位很厉害的狩月人吧！那个……我其实也是狩月人，只是我太弱了……",
                        npc: 818004,
                        next: 71001604,
                    },
                    {
                        id: 71001604,
                        content: "你能帮我把落在那群秽兽里的武器拿回来吗，不然我连下个委托都做不了了……",
                        npc: 818004,
                        next: 71001605,
                    },
                    {
                        id: 71001605,
                        content: "……我来帮忙吧。",
                        npc: 100001,
                        next: 71001606,
                    },
                    {
                        id: 71001606,
                        content: "谢谢谢谢！",
                        npc: 818004,
                        next: 71001607,
                    },
                ],
            },
            {
                id: "17220635389484739",
                type: "TalkNode",
                name: "开车对话",
                next: ["17220635389484746"],
                dialogues: [
                    {
                        id: 71001607,
                        content: "秽兽就在前面，大师，你也小心些哦。",
                        npc: 818004,
                        next: 71001608,
                    },
                ],
            },
            {
                id: "17220635389484742",
                type: "TalkNode",
                name: "与狩月人对话",
                dialogues: [
                    {
                        id: 71001608,
                        content: "呜呜呜……要是接不了委托可怎么办呀，好几天没吃饭了……",
                        npc: 818004,
                        options: [
                            {
                                id: 710016081,
                                content: "（交出武器。）",
                                next: 71001609,
                                impr: [1011, "Empathy", 1],
                            },
                            {
                                id: 710016082,
                                content: "（再考虑一下。）",
                                next: 71001608,
                            },
                        ],
                    },
                    {
                        id: 71001609,
                        content: "谢谢！那我这就去做委托了，大师，我们以后再见！",
                        npc: 818004,
                    },
                ],
            },
            {
                id: "17220635389484746",
                type: "TalkNode",
                name: "与商人对话",
                dialogues: [
                    {
                        id: 71001610,
                        content:
                            "事情我都知道了，把武器还给一名弱者真的好吗？说不定哪次就死在委托里了，与其这样，不如把她的武器都卖给我吧。这样对大家都好。",
                        npc: 818005,
                        options: [
                            {
                                id: 710016101,
                                content: "（卖掉武器。）",
                                next: 71001611,
                                impr: [1011, "Benefit", 1],
                            },
                            {
                                id: 710016102,
                                content: "（再考虑一下。）",
                                next: 71001610,
                            },
                        ],
                    },
                    {
                        id: 71001611,
                        content: "合作愉快，以后还请继续找我。",
                        npc: 818005,
                    },
                ],
            },
            {
                id: "17220635389494748",
                type: "TalkNode",
                name: "商人感谢",
                dialogues: [
                    {
                        id: 71001611,
                        content: "合作愉快，以后还请继续找我。",
                        npc: 818005,
                        next: 71001610,
                    },
                ],
            },
            {
                id: "17220635389484744",
                type: "TalkNode",
                name: "狩月人感谢",
                dialogues: [
                    {
                        id: 71001609,
                        content: "谢谢！那我这就去做委托了，大师，我们以后再见！",
                        npc: 818004,
                        next: 71001608,
                    },
                ],
            },
        ],
        startIds: ["17217248991461516", "17220635389494748", "17220635389484744"],
    },
    {
        id: 101241,
        name: "丢三落四",
        level: [1, 29],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17217248991461516",
                type: "TalkNode",
                name: "狩月人开车对话",
                dialogues: [
                    {
                        id: 71001601,
                        content: "好多秽兽啊……这可怎么办……",
                        npc: 818004,
                        next: 71001602,
                    },
                ],
            },
            {
                id: "17217249478352306",
                type: "TalkNode",
                name: "与狩月人交流",
                next: ["17220635389484742", "17220635389484746"],
                dialogues: [
                    {
                        id: 71001602,
                        content: "发生什么了？",
                        npc: 100001,
                        next: 71001603,
                    },
                    {
                        id: 71001603,
                        content: "哇，看你的打扮，是位很厉害的狩月人吧！那个……我其实也是狩月人，只是我太弱了……",
                        npc: 818004,
                        next: 71001604,
                    },
                    {
                        id: 71001604,
                        content: "你能帮我把落在那群秽兽里的武器拿回来吗，不然我连下个委托都做不了了……",
                        npc: 818004,
                        next: 71001605,
                    },
                    {
                        id: 71001605,
                        content: "……我来帮忙吧。",
                        npc: 100001,
                        next: 71001606,
                    },
                    {
                        id: 71001606,
                        content: "谢谢谢谢！",
                        npc: 818004,
                        next: 71001607,
                    },
                ],
            },
            {
                id: "17220635389484739",
                type: "TalkNode",
                name: "开车对话",
                next: ["17220635389484746"],
                dialogues: [
                    {
                        id: 71001607,
                        content: "秽兽就在前面，大师，你也小心些哦。",
                        npc: 818004,
                        next: 71001608,
                    },
                ],
            },
            {
                id: "17220635389484742",
                type: "TalkNode",
                name: "与狩月人对话",
                dialogues: [
                    {
                        id: 71001608,
                        content: "呜呜呜……要是接不了委托可怎么办呀，好几天没吃饭了……",
                        npc: 818004,
                        options: [
                            {
                                id: 710016081,
                                content: "（交出武器。）",
                                next: 71001609,
                                impr: [1011, "Empathy", 1],
                            },
                            {
                                id: 710016082,
                                content: "（再考虑一下。）",
                                next: 71001608,
                            },
                        ],
                    },
                    {
                        id: 71001609,
                        content: "谢谢！那我这就去做委托了，大师，我们以后再见！",
                        npc: 818004,
                    },
                ],
            },
            {
                id: "17220635389484746",
                type: "TalkNode",
                name: "与商人对话",
                dialogues: [
                    {
                        id: 71001610,
                        content:
                            "事情我都知道了，把武器还给一名弱者真的好吗？说不定哪次就死在委托里了，与其这样，不如把她的武器都卖给我吧。这样对大家都好。",
                        npc: 818005,
                        options: [
                            {
                                id: 710016101,
                                content: "（卖掉武器。）",
                                next: 71001611,
                                impr: [1011, "Benefit", 1],
                            },
                            {
                                id: 710016102,
                                content: "（再考虑一下。）",
                                next: 71001610,
                            },
                        ],
                    },
                    {
                        id: 71001611,
                        content: "合作愉快，以后还请继续找我。",
                        npc: 818005,
                    },
                ],
            },
            {
                id: "17220635389494748",
                type: "TalkNode",
                name: "商人感谢",
                dialogues: [
                    {
                        id: 71001611,
                        content: "合作愉快，以后还请继续找我。",
                        npc: 818005,
                        next: 71001610,
                    },
                ],
            },
            {
                id: "17220635389484744",
                type: "TalkNode",
                name: "狩月人感谢",
                dialogues: [
                    {
                        id: 71001609,
                        content: "谢谢！那我这就去做委托了，大师，我们以后再见！",
                        npc: 818004,
                        next: 71001608,
                    },
                ],
            },
        ],
        startIds: ["17217248991461516", "17220635389494748", "17220635389484744"],
    },
    {
        id: 101242,
        name: "丢三落四",
        level: [30, 39],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17217248991461516",
                type: "TalkNode",
                name: "狩月人开车对话",
                dialogues: [
                    {
                        id: 71001601,
                        content: "好多秽兽啊……这可怎么办……",
                        npc: 818004,
                        next: 71001602,
                    },
                ],
            },
            {
                id: "17217249478352306",
                type: "TalkNode",
                name: "与狩月人交流",
                next: ["17220635389484742", "17220635389484746"],
                dialogues: [
                    {
                        id: 71001602,
                        content: "发生什么了？",
                        npc: 100001,
                        next: 71001603,
                    },
                    {
                        id: 71001603,
                        content: "哇，看你的打扮，是位很厉害的狩月人吧！那个……我其实也是狩月人，只是我太弱了……",
                        npc: 818004,
                        next: 71001604,
                    },
                    {
                        id: 71001604,
                        content: "你能帮我把落在那群秽兽里的武器拿回来吗，不然我连下个委托都做不了了……",
                        npc: 818004,
                        next: 71001605,
                    },
                    {
                        id: 71001605,
                        content: "……我来帮忙吧。",
                        npc: 100001,
                        next: 71001606,
                    },
                    {
                        id: 71001606,
                        content: "谢谢谢谢！",
                        npc: 818004,
                        next: 71001607,
                    },
                ],
            },
            {
                id: "17220635389484739",
                type: "TalkNode",
                name: "开车对话",
                next: ["17220635389484746"],
                dialogues: [
                    {
                        id: 71001607,
                        content: "秽兽就在前面，大师，你也小心些哦。",
                        npc: 818004,
                        next: 71001608,
                    },
                ],
            },
            {
                id: "17220635389484742",
                type: "TalkNode",
                name: "与狩月人对话",
                dialogues: [
                    {
                        id: 71001608,
                        content: "呜呜呜……要是接不了委托可怎么办呀，好几天没吃饭了……",
                        npc: 818004,
                        options: [
                            {
                                id: 710016081,
                                content: "（交出武器。）",
                                next: 71001609,
                                impr: [1011, "Empathy", 1],
                            },
                            {
                                id: 710016082,
                                content: "（再考虑一下。）",
                                next: 71001608,
                            },
                        ],
                    },
                    {
                        id: 71001609,
                        content: "谢谢！那我这就去做委托了，大师，我们以后再见！",
                        npc: 818004,
                    },
                ],
            },
            {
                id: "17220635389484746",
                type: "TalkNode",
                name: "与商人对话",
                dialogues: [
                    {
                        id: 71001610,
                        content:
                            "事情我都知道了，把武器还给一名弱者真的好吗？说不定哪次就死在委托里了，与其这样，不如把她的武器都卖给我吧。这样对大家都好。",
                        npc: 818005,
                        options: [
                            {
                                id: 710016101,
                                content: "（卖掉武器。）",
                                next: 71001611,
                                impr: [1011, "Benefit", 1],
                            },
                            {
                                id: 710016102,
                                content: "（再考虑一下。）",
                                next: 71001610,
                            },
                        ],
                    },
                    {
                        id: 71001611,
                        content: "合作愉快，以后还请继续找我。",
                        npc: 818005,
                    },
                ],
            },
            {
                id: "17220635389494748",
                type: "TalkNode",
                name: "商人感谢",
                dialogues: [
                    {
                        id: 71001611,
                        content: "合作愉快，以后还请继续找我。",
                        npc: 818005,
                        next: 71001610,
                    },
                ],
            },
            {
                id: "17220635389484744",
                type: "TalkNode",
                name: "狩月人感谢",
                dialogues: [
                    {
                        id: 71001609,
                        content: "谢谢！那我这就去做委托了，大师，我们以后再见！",
                        npc: 818004,
                        next: 71001608,
                    },
                ],
            },
        ],
        startIds: ["17217248991461516", "17220635389494748", "17220635389484744"],
    },
    {
        id: 101243,
        name: "丢三落四",
        level: [40, 49],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17217248991461516",
                type: "TalkNode",
                name: "狩月人开车对话",
                dialogues: [
                    {
                        id: 71001601,
                        content: "好多秽兽啊……这可怎么办……",
                        npc: 818004,
                        next: 71001602,
                    },
                ],
            },
            {
                id: "17217249478352306",
                type: "TalkNode",
                name: "与狩月人交流",
                next: ["17220635389484742", "17220635389484746"],
                dialogues: [
                    {
                        id: 71001602,
                        content: "发生什么了？",
                        npc: 100001,
                        next: 71001603,
                    },
                    {
                        id: 71001603,
                        content: "哇，看你的打扮，是位很厉害的狩月人吧！那个……我其实也是狩月人，只是我太弱了……",
                        npc: 818004,
                        next: 71001604,
                    },
                    {
                        id: 71001604,
                        content: "你能帮我把落在那群秽兽里的武器拿回来吗，不然我连下个委托都做不了了……",
                        npc: 818004,
                        next: 71001605,
                    },
                    {
                        id: 71001605,
                        content: "……我来帮忙吧。",
                        npc: 100001,
                        next: 71001606,
                    },
                    {
                        id: 71001606,
                        content: "谢谢谢谢！",
                        npc: 818004,
                        next: 71001607,
                    },
                ],
            },
            {
                id: "17220635389484739",
                type: "TalkNode",
                name: "开车对话",
                next: ["17220635389484746"],
                dialogues: [
                    {
                        id: 71001607,
                        content: "秽兽就在前面，大师，你也小心些哦。",
                        npc: 818004,
                        next: 71001608,
                    },
                ],
            },
            {
                id: "17220635389484742",
                type: "TalkNode",
                name: "与狩月人对话",
                dialogues: [
                    {
                        id: 71001608,
                        content: "呜呜呜……要是接不了委托可怎么办呀，好几天没吃饭了……",
                        npc: 818004,
                        options: [
                            {
                                id: 710016081,
                                content: "（交出武器。）",
                                next: 71001609,
                                impr: [1011, "Empathy", 1],
                            },
                            {
                                id: 710016082,
                                content: "（再考虑一下。）",
                                next: 71001608,
                            },
                        ],
                    },
                    {
                        id: 71001609,
                        content: "谢谢！那我这就去做委托了，大师，我们以后再见！",
                        npc: 818004,
                    },
                ],
            },
            {
                id: "17220635389484746",
                type: "TalkNode",
                name: "与商人对话",
                dialogues: [
                    {
                        id: 71001610,
                        content:
                            "事情我都知道了，把武器还给一名弱者真的好吗？说不定哪次就死在委托里了，与其这样，不如把她的武器都卖给我吧。这样对大家都好。",
                        npc: 818005,
                        options: [
                            {
                                id: 710016101,
                                content: "（卖掉武器。）",
                                next: 71001611,
                                impr: [1011, "Benefit", 1],
                            },
                            {
                                id: 710016102,
                                content: "（再考虑一下。）",
                                next: 71001610,
                            },
                        ],
                    },
                    {
                        id: 71001611,
                        content: "合作愉快，以后还请继续找我。",
                        npc: 818005,
                    },
                ],
            },
            {
                id: "17220635389494748",
                type: "TalkNode",
                name: "商人感谢",
                dialogues: [
                    {
                        id: 71001611,
                        content: "合作愉快，以后还请继续找我。",
                        npc: 818005,
                        next: 71001610,
                    },
                ],
            },
            {
                id: "17220635389484744",
                type: "TalkNode",
                name: "狩月人感谢",
                dialogues: [
                    {
                        id: 71001609,
                        content: "谢谢！那我这就去做委托了，大师，我们以后再见！",
                        npc: 818004,
                        next: 71001608,
                    },
                ],
            },
        ],
        startIds: ["17217248991461516", "17220635389494748", "17220635389484744"],
    },
    {
        id: 101313,
        name: "倒买倒卖",
        level: [40, 49],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17388976599751099",
                type: "TalkNode",
                name: "旁白开车对话",
                next: ["17388976599761102"],
                dialogues: [
                    {
                        id: 71001401,
                        content: "（你远远的便闻到了北风莓的香味，去摘一些的话，应该能卖个好价钱。）",
                        npc: 800006,
                        next: 71001403,
                    },
                ],
            },
            {
                id: "17388976599761101",
                type: "TalkNode",
                name: "采集完成开车对话",
                next: ["17388976599761103", "17388976599771105"],
                dialogues: [
                    {
                        id: 71001403,
                        content: "（远处有两名商人都在收购北风莓，与他们聊聊看再决定卖给谁吧。）",
                        npc: 800006,
                        next: 71001404,
                    },
                ],
            },
            {
                id: "17388976599761102",
                type: "TalkNode",
                name: "采集对话",
                dialogues: [
                    {
                        id: 71001402,
                        content: "（这一批北风莓色泽艳丽、果肉饱满，任谁都能看得出，这样的特产根本不愁卖不出去。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17388976599761103",
                type: "TalkNode",
                name: "和本地商人对话",
                dialogues: [
                    {
                        id: 71001404,
                        content:
                            "我这小摊在冰湖城开了好几年了，虽然利润不高，但来做买卖的都是熟人。你这批北风莓我全收了就当交个朋友吧，大伙都在冰湖城，以后还能互相照顾照顾。",
                        npc: 818002,
                        options: [
                            {
                                id: 710014041,
                                content: "（卖给本地商人。）",
                                next: 71001406,
                                impr: [1011, "Morality", 1],
                            },
                            {
                                id: 710014042,
                                content: "（再考虑一下。）",
                                next: 71001404,
                            },
                        ],
                    },
                    {
                        id: 71001406,
                        content: "（虽然利润较低，但为了长久而稳定的人脉，你最终还是与本地商人完成了交易。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17388976599771105",
                type: "TalkNode",
                name: "和外地商人交流",
                dialogues: [
                    {
                        id: 71001405,
                        content: "嘿，我看到你怀里那些北风莓了。我出的钱可比冰湖城那些穷商人多了去了。怎么样，咱两一起赚笔大的如何？",
                        npc: 818003,
                        options: [
                            {
                                id: 710014051,
                                content: "（卖给外地商人。）",
                                next: 71001407,
                                impr: [1011, "Benefit", 1],
                            },
                            {
                                id: 710014052,
                                content: "（再考虑一下。）",
                                next: 71001405,
                            },
                        ],
                    },
                    {
                        id: 71001407,
                        content: "（未来的承诺远没有当下的利益来得靠谱，你最终还是与外地商人完成了交易，并收获了一大笔丰厚的报酬。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 101323,
        name: "倒买倒卖",
        level: [40, 49],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17388976599751099",
                type: "TalkNode",
                name: "旁白开车对话",
                next: ["17388976599761102"],
                dialogues: [
                    {
                        id: 71001401,
                        content: "（你远远的便闻到了北风莓的香味，去摘一些的话，应该能卖个好价钱。）",
                        npc: 800006,
                        next: 71001403,
                    },
                ],
            },
            {
                id: "17388976599761101",
                type: "TalkNode",
                name: "采集完成开车对话",
                next: ["17388976599761103", "17388976599771105"],
                dialogues: [
                    {
                        id: 71001403,
                        content: "（远处有两名商人都在收购北风莓，与他们聊聊看再决定卖给谁吧。）",
                        npc: 800006,
                        next: 71001404,
                    },
                ],
            },
            {
                id: "17388976599761102",
                type: "TalkNode",
                name: "采集对话",
                dialogues: [
                    {
                        id: 71001402,
                        content: "（这一批北风莓色泽艳丽、果肉饱满，任谁都能看得出，这样的特产根本不愁卖不出去。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17388976599761103",
                type: "TalkNode",
                name: "和本地商人对话",
                dialogues: [
                    {
                        id: 71001404,
                        content:
                            "我这小摊在冰湖城开了好几年了，虽然利润不高，但来做买卖的都是熟人。你这批北风莓我全收了就当交个朋友吧，大伙都在冰湖城，以后还能互相照顾照顾。",
                        npc: 818002,
                        options: [
                            {
                                id: 710014041,
                                content: "（卖给本地商人。）",
                                next: 71001406,
                                impr: [1011, "Morality", 1],
                            },
                            {
                                id: 710014042,
                                content: "（再考虑一下。）",
                                next: 71001404,
                            },
                        ],
                    },
                    {
                        id: 71001406,
                        content: "（虽然利润较低，但为了长久而稳定的人脉，你最终还是与本地商人完成了交易。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17388976599771105",
                type: "TalkNode",
                name: "和外地商人交流",
                dialogues: [
                    {
                        id: 71001405,
                        content: "嘿，我看到你怀里那些北风莓了。我出的钱可比冰湖城那些穷商人多了去了。怎么样，咱两一起赚笔大的如何？",
                        npc: 818003,
                        options: [
                            {
                                id: 710014051,
                                content: "（卖给外地商人。）",
                                next: 71001407,
                                impr: [1011, "Benefit", 1],
                            },
                            {
                                id: 710014052,
                                content: "（再考虑一下。）",
                                next: 71001405,
                            },
                        ],
                    },
                    {
                        id: 71001407,
                        content: "（未来的承诺远没有当下的利益来得靠谱，你最终还是与外地商人完成了交易，并收获了一大笔丰厚的报酬。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 101405,
        name: "打打打打打劫",
        level: [60, 65],
        regionId: 1013,
        subRegionId: 101301,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
    },
    {
        id: 101600,
        name: "睡前故事",
        level: [1, 65],
        regionId: 1001,
        subRegionId: 100102,
        chance: 5,
        completeNum: 1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17213572947314989",
                type: "TalkNode",
                name: "主角开车对话",
                dialogues: [
                    {
                        id: 71001301,
                        content: "依贝蕾所说，这里就是我们曾经的家，可我却一点印象都没有……",
                        npc: 100001,
                        next: 71001302,
                    },
                    {
                        id: 71001302,
                        content: "也许我该在这附近转转，兴许能想起些什么。",
                        npc: 100001,
                        next: 71001303,
                    },
                ],
            },
            {
                id: "17271479122381429",
                type: "TalkNode",
                name: "与床交互",
                dialogues: [
                    {
                        id: 71001303,
                        content:
                            "家具的制作十分粗糙，不少钉子都被深深砸进了木头里，就像我们在村里的房门把手一样。贝蕾原来从小就有这么大力气呢。",
                        next: 71001304,
                    },
                ],
            },
            {
                id: "17271479385982069",
                type: "TalkNode",
                name: "与炼金交互",
                dialogues: [
                    {
                        id: 71001304,
                        content: "这是……一本炼金故事书？原来贝蕾小时候给我讲的那些奇奇怪怪的睡前故事，都是从这本书上来的。",
                        next: 71001305,
                    },
                    {
                        id: 71001305,
                        content: "但是书上这些批注比贝蕾的字迹工整好多，会是谁写的呢？",
                        next: 71001306,
                    },
                ],
            },
            {
                id: "172135780037311203",
                type: "TalkNode",
                name: "交互完成对话",
                dialogues: [
                    {
                        id: 71001306,
                        content: "想起了不少贝蕾的事呢。至于这里，还是什么都想不起来……",
                        npc: 100001,
                        next: 71001307,
                    },
                    {
                        id: 71001307,
                        content: "算了，也许等到以后，自然就想起来了。",
                        npc: 100001,
                    },
                ],
            },
        ],
    },
    {
        id: 101705,
        name: "打打打打打劫",
        level: [60, 65],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
    },
    {
        id: 102005,
        name: "突袭的秽兽",
        level: [60, 65],
        regionId: 1013,
        subRegionId: 101303,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1732783210485457708",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71001101,
                        content: "（秽兽来袭，击退它们！）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 102205,
        name: "突袭的秽兽",
        level: [60, 65],
        regionId: 1017,
        subRegionId: 101701,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1732783210501461241",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71001101,
                        content: "（秽兽来袭，击退它们！）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 102305,
        name: "打打打打打劫",
        level: [60, 65],
        regionId: 1017,
        subRegionId: 101701,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
    },
    {
        id: 102524,
        name: "一场误会",
        level: [50, 59],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1724143163247566",
                type: "TalkNode",
                name: "凯文开车对话",
                dialogues: [
                    {
                        id: 71002101,
                        content: "啊，{nickname}！！你可真是我的救星，快来帮帮我。",
                        npc: 818007,
                        next: 71002102,
                    },
                ],
            },
            {
                id: "1724143163247568",
                type: "TalkNode",
                name: "与凯文对话任务选择",
                dialogues: [
                    {
                        id: 71002102,
                        content: "我要把这箱物资送给泪湖那边的同僚，但突然肚子好痛，你能不能帮我送一下！拜托拜托！",
                        npc: 818007,
                    },
                ],
            },
            {
                id: "17241436682064485",
                type: "TalkNode",
                name: "与士兵对话",
                next: ["17267290106769602", "17241439372409087", "17241438689357703"],
                dialogues: [
                    {
                        id: 71002103,
                        content: "你好，这些是凯文托我转交的物资。",
                        npc: 100001,
                        next: 71002104,
                    },
                    {
                        id: 71002104,
                        content: "嗯……不对啊，怎么少了2条弹匣和1把步枪，说，是不是你偷偷拿走了！",
                        npc: 818008,
                    },
                ],
            },
            {
                id: "17241439433939323",
                type: "TalkNode",
                name: "去找凯文开车对话",
                next: ["17241439372409087"],
                dialogues: [
                    {
                        id: 71002113,
                        content: "拖延时间想溜？兄弟们，给我看着这{性别：小子|丫头}，看紧点。",
                        npc: 818008,
                        next: 71002114,
                    },
                ],
            },
            {
                id: "17267290106769602",
                type: "TalkNode",
                name: "战斗开车对话",
                next: ["17241438689357703"],
                dialogues: [
                    {
                        id: 71002105,
                        content: "侵吞帝国财产，跟我走一趟！",
                        npc: 818008,
                        next: 71002106,
                    },
                ],
            },
            {
                id: "17241439372409087",
                type: "TalkNode",
                name: "与凯文对话",
                dialogues: [
                    {
                        id: 71002114,
                        content: "来了来了——",
                        npc: 818007,
                        next: 71002115,
                    },
                    {
                        id: 71002115,
                        content: "啊？物资少了？哦！2条弹匣和1把步枪是吧。在我这儿呢，刚刚我把自己那份直接拿走了。",
                        npc: 818007,
                        next: 71002116,
                    },
                    {
                        id: 71002116,
                        content: "你也太不谨慎了——军团的物资随手丢给路人？万一是同盟的家伙怎么交差？",
                        npc: 818008,
                        next: 71002117,
                    },
                    {
                        id: 71002117,
                        content: "啊哈，抱歉抱歉，下次注意，下次注意。",
                        npc: 818007,
                        next: 71002118,
                    },
                    {
                        id: 71002118,
                        content: "{nickname}，这点东西你收下当赔礼吧，连累了你，怪不好意思的。",
                        npc: 818007,
                    },
                ],
            },
            {
                id: "17241438689357703",
                type: "TalkNode",
                name: "对话获取奖励",
                dialogues: [
                    {
                        id: 71002106,
                        content: "啊？？我上个厕所的工夫，大伙怎么打起来了！",
                        npc: 818007,
                        next: 71002107,
                    },
                    {
                        id: 71002107,
                        content: "他们先动手的。",
                        npc: 100001,
                        next: 71002108,
                    },
                    {
                        id: 71002108,
                        content: "你这家伙找的什么人啊，连军团的物资都敢偷。",
                        npc: 818008,
                        next: 71002109,
                    },
                    {
                        id: 71002109,
                        content: "啊？哦！2条弹匣和1把步枪是吧，在我这儿呢，我把自己那份直接拿走了。",
                        npc: 818007,
                        next: 71002110,
                    },
                    {
                        id: 71002110,
                        content: "你也太不谨慎了——军团的物资随手丢给路人？万一是同盟的家伙怎么交差？",
                        npc: 818008,
                        next: 71002111,
                    },
                    {
                        id: 71002111,
                        content: "啊哈，抱歉抱歉，下次注意，下次注意。",
                        npc: 818007,
                        next: 71002112,
                    },
                    {
                        id: 71002112,
                        content: "{nickname}，这点东西你收下当赔礼吧，连累了你，怪不好意思的。",
                        npc: 818007,
                    },
                ],
            },
        ],
    },
    {
        id: 102525,
        name: "一场误会",
        level: [60, 65],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1724143163247566",
                type: "TalkNode",
                name: "凯文开车对话",
                dialogues: [
                    {
                        id: 71002101,
                        content: "啊，{nickname}！！你可真是我的救星，快来帮帮我。",
                        npc: 818007,
                        next: 71002102,
                    },
                ],
            },
            {
                id: "1724143163247568",
                type: "TalkNode",
                name: "与凯文对话任务选择",
                dialogues: [
                    {
                        id: 71002102,
                        content: "我要把这箱物资送给泪湖那边的同僚，但突然肚子好痛，你能不能帮我送一下！拜托拜托！",
                        npc: 818007,
                    },
                ],
            },
            {
                id: "17241436682064485",
                type: "TalkNode",
                name: "与士兵对话",
                next: ["17267290106769602", "17241439372409087", "17241438689357703"],
                dialogues: [
                    {
                        id: 71002103,
                        content: "你好，这些是凯文托我转交的物资。",
                        npc: 100001,
                        next: 71002104,
                    },
                    {
                        id: 71002104,
                        content: "嗯……不对啊，怎么少了2条弹匣和1把步枪，说，是不是你偷偷拿走了！",
                        npc: 818008,
                    },
                ],
            },
            {
                id: "17241439433939323",
                type: "TalkNode",
                name: "去找凯文开车对话",
                next: ["17241439372409087"],
                dialogues: [
                    {
                        id: 71002113,
                        content: "拖延时间想溜？兄弟们，给我看着这{性别：小子|丫头}，看紧点。",
                        npc: 818008,
                        next: 71002114,
                    },
                ],
            },
            {
                id: "17267290106769602",
                type: "TalkNode",
                name: "战斗开车对话",
                next: ["17241438689357703"],
                dialogues: [
                    {
                        id: 71002105,
                        content: "侵吞帝国财产，跟我走一趟！",
                        npc: 818008,
                        next: 71002106,
                    },
                ],
            },
            {
                id: "17241439372409087",
                type: "TalkNode",
                name: "与凯文对话",
                dialogues: [
                    {
                        id: 71002114,
                        content: "来了来了——",
                        npc: 818007,
                        next: 71002115,
                    },
                    {
                        id: 71002115,
                        content: "啊？物资少了？哦！2条弹匣和1把步枪是吧。在我这儿呢，刚刚我把自己那份直接拿走了。",
                        npc: 818007,
                        next: 71002116,
                    },
                    {
                        id: 71002116,
                        content: "你也太不谨慎了——军团的物资随手丢给路人？万一是同盟的家伙怎么交差？",
                        npc: 818008,
                        next: 71002117,
                    },
                    {
                        id: 71002117,
                        content: "啊哈，抱歉抱歉，下次注意，下次注意。",
                        npc: 818007,
                        next: 71002118,
                    },
                    {
                        id: 71002118,
                        content: "{nickname}，这点东西你收下当赔礼吧，连累了你，怪不好意思的。",
                        npc: 818007,
                    },
                ],
            },
            {
                id: "17241438689357703",
                type: "TalkNode",
                name: "对话获取奖励",
                dialogues: [
                    {
                        id: 71002106,
                        content: "啊？？我上个厕所的工夫，大伙怎么打起来了！",
                        npc: 818007,
                        next: 71002107,
                    },
                    {
                        id: 71002107,
                        content: "他们先动手的。",
                        npc: 100001,
                        next: 71002108,
                    },
                    {
                        id: 71002108,
                        content: "你这家伙找的什么人啊，连军团的物资都敢偷。",
                        npc: 818008,
                        next: 71002109,
                    },
                    {
                        id: 71002109,
                        content: "啊？哦！2条弹匣和1把步枪是吧，在我这儿呢，我把自己那份直接拿走了。",
                        npc: 818007,
                        next: 71002110,
                    },
                    {
                        id: 71002110,
                        content: "你也太不谨慎了——军团的物资随手丢给路人？万一是同盟的家伙怎么交差？",
                        npc: 818008,
                        next: 71002111,
                    },
                    {
                        id: 71002111,
                        content: "啊哈，抱歉抱歉，下次注意，下次注意。",
                        npc: 818007,
                        next: 71002112,
                    },
                    {
                        id: 71002112,
                        content: "{nickname}，这点东西你收下当赔礼吧，连累了你，怪不好意思的。",
                        npc: 818007,
                    },
                ],
            },
        ],
    },
    {
        id: 102534,
        name: "一场误会",
        level: [50, 59],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1724143163247566",
                type: "TalkNode",
                name: "凯文开车对话",
                dialogues: [
                    {
                        id: 71002101,
                        content: "啊，{nickname}！！你可真是我的救星，快来帮帮我。",
                        npc: 818007,
                        next: 71002102,
                    },
                ],
            },
            {
                id: "1724143163247568",
                type: "TalkNode",
                name: "与凯文对话任务选择",
                dialogues: [
                    {
                        id: 71002102,
                        content: "我要把这箱物资送给泪湖那边的同僚，但突然肚子好痛，你能不能帮我送一下！拜托拜托！",
                        npc: 818007,
                    },
                ],
            },
            {
                id: "17241436682064485",
                type: "TalkNode",
                name: "与士兵对话",
                next: ["17267290106769602", "17241439372409087", "17241438689357703"],
                dialogues: [
                    {
                        id: 71002103,
                        content: "你好，这些是凯文托我转交的物资。",
                        npc: 100001,
                        next: 71002104,
                    },
                    {
                        id: 71002104,
                        content: "嗯……不对啊，怎么少了2条弹匣和1把步枪，说，是不是你偷偷拿走了！",
                        npc: 818008,
                    },
                ],
            },
            {
                id: "17241439433939323",
                type: "TalkNode",
                name: "去找凯文开车对话",
                next: ["17241439372409087"],
                dialogues: [
                    {
                        id: 71002113,
                        content: "拖延时间想溜？兄弟们，给我看着这{性别：小子|丫头}，看紧点。",
                        npc: 818008,
                        next: 71002114,
                    },
                ],
            },
            {
                id: "17267290106769602",
                type: "TalkNode",
                name: "战斗开车对话",
                next: ["17241438689357703"],
                dialogues: [
                    {
                        id: 71002105,
                        content: "侵吞帝国财产，跟我走一趟！",
                        npc: 818008,
                        next: 71002106,
                    },
                ],
            },
            {
                id: "17241439372409087",
                type: "TalkNode",
                name: "与凯文对话",
                dialogues: [
                    {
                        id: 71002114,
                        content: "来了来了——",
                        npc: 818007,
                        next: 71002115,
                    },
                    {
                        id: 71002115,
                        content: "啊？物资少了？哦！2条弹匣和1把步枪是吧。在我这儿呢，刚刚我把自己那份直接拿走了。",
                        npc: 818007,
                        next: 71002116,
                    },
                    {
                        id: 71002116,
                        content: "你也太不谨慎了——军团的物资随手丢给路人？万一是同盟的家伙怎么交差？",
                        npc: 818008,
                        next: 71002117,
                    },
                    {
                        id: 71002117,
                        content: "啊哈，抱歉抱歉，下次注意，下次注意。",
                        npc: 818007,
                        next: 71002118,
                    },
                    {
                        id: 71002118,
                        content: "{nickname}，这点东西你收下当赔礼吧，连累了你，怪不好意思的。",
                        npc: 818007,
                    },
                ],
            },
            {
                id: "17241438689357703",
                type: "TalkNode",
                name: "对话获取奖励",
                dialogues: [
                    {
                        id: 71002106,
                        content: "啊？？我上个厕所的工夫，大伙怎么打起来了！",
                        npc: 818007,
                        next: 71002107,
                    },
                    {
                        id: 71002107,
                        content: "他们先动手的。",
                        npc: 100001,
                        next: 71002108,
                    },
                    {
                        id: 71002108,
                        content: "你这家伙找的什么人啊，连军团的物资都敢偷。",
                        npc: 818008,
                        next: 71002109,
                    },
                    {
                        id: 71002109,
                        content: "啊？哦！2条弹匣和1把步枪是吧，在我这儿呢，我把自己那份直接拿走了。",
                        npc: 818007,
                        next: 71002110,
                    },
                    {
                        id: 71002110,
                        content: "你也太不谨慎了——军团的物资随手丢给路人？万一是同盟的家伙怎么交差？",
                        npc: 818008,
                        next: 71002111,
                    },
                    {
                        id: 71002111,
                        content: "啊哈，抱歉抱歉，下次注意，下次注意。",
                        npc: 818007,
                        next: 71002112,
                    },
                    {
                        id: 71002112,
                        content: "{nickname}，这点东西你收下当赔礼吧，连累了你，怪不好意思的。",
                        npc: 818007,
                    },
                ],
            },
        ],
    },
    {
        id: 102535,
        name: "一场误会",
        level: [60, 65],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1724143163247566",
                type: "TalkNode",
                name: "凯文开车对话",
                dialogues: [
                    {
                        id: 71002101,
                        content: "啊，{nickname}！！你可真是我的救星，快来帮帮我。",
                        npc: 818007,
                        next: 71002102,
                    },
                ],
            },
            {
                id: "1724143163247568",
                type: "TalkNode",
                name: "与凯文对话任务选择",
                dialogues: [
                    {
                        id: 71002102,
                        content: "我要把这箱物资送给泪湖那边的同僚，但突然肚子好痛，你能不能帮我送一下！拜托拜托！",
                        npc: 818007,
                    },
                ],
            },
            {
                id: "17241436682064485",
                type: "TalkNode",
                name: "与士兵对话",
                next: ["17267290106769602", "17241439372409087", "17241438689357703"],
                dialogues: [
                    {
                        id: 71002103,
                        content: "你好，这些是凯文托我转交的物资。",
                        npc: 100001,
                        next: 71002104,
                    },
                    {
                        id: 71002104,
                        content: "嗯……不对啊，怎么少了2条弹匣和1把步枪，说，是不是你偷偷拿走了！",
                        npc: 818008,
                    },
                ],
            },
            {
                id: "17241439433939323",
                type: "TalkNode",
                name: "去找凯文开车对话",
                next: ["17241439372409087"],
                dialogues: [
                    {
                        id: 71002113,
                        content: "拖延时间想溜？兄弟们，给我看着这{性别：小子|丫头}，看紧点。",
                        npc: 818008,
                        next: 71002114,
                    },
                ],
            },
            {
                id: "17267290106769602",
                type: "TalkNode",
                name: "战斗开车对话",
                next: ["17241438689357703"],
                dialogues: [
                    {
                        id: 71002105,
                        content: "侵吞帝国财产，跟我走一趟！",
                        npc: 818008,
                        next: 71002106,
                    },
                ],
            },
            {
                id: "17241439372409087",
                type: "TalkNode",
                name: "与凯文对话",
                dialogues: [
                    {
                        id: 71002114,
                        content: "来了来了——",
                        npc: 818007,
                        next: 71002115,
                    },
                    {
                        id: 71002115,
                        content: "啊？物资少了？哦！2条弹匣和1把步枪是吧。在我这儿呢，刚刚我把自己那份直接拿走了。",
                        npc: 818007,
                        next: 71002116,
                    },
                    {
                        id: 71002116,
                        content: "你也太不谨慎了——军团的物资随手丢给路人？万一是同盟的家伙怎么交差？",
                        npc: 818008,
                        next: 71002117,
                    },
                    {
                        id: 71002117,
                        content: "啊哈，抱歉抱歉，下次注意，下次注意。",
                        npc: 818007,
                        next: 71002118,
                    },
                    {
                        id: 71002118,
                        content: "{nickname}，这点东西你收下当赔礼吧，连累了你，怪不好意思的。",
                        npc: 818007,
                    },
                ],
            },
            {
                id: "17241438689357703",
                type: "TalkNode",
                name: "对话获取奖励",
                dialogues: [
                    {
                        id: 71002106,
                        content: "啊？？我上个厕所的工夫，大伙怎么打起来了！",
                        npc: 818007,
                        next: 71002107,
                    },
                    {
                        id: 71002107,
                        content: "他们先动手的。",
                        npc: 100001,
                        next: 71002108,
                    },
                    {
                        id: 71002108,
                        content: "你这家伙找的什么人啊，连军团的物资都敢偷。",
                        npc: 818008,
                        next: 71002109,
                    },
                    {
                        id: 71002109,
                        content: "啊？哦！2条弹匣和1把步枪是吧，在我这儿呢，我把自己那份直接拿走了。",
                        npc: 818007,
                        next: 71002110,
                    },
                    {
                        id: 71002110,
                        content: "你也太不谨慎了——军团的物资随手丢给路人？万一是同盟的家伙怎么交差？",
                        npc: 818008,
                        next: 71002111,
                    },
                    {
                        id: 71002111,
                        content: "啊哈，抱歉抱歉，下次注意，下次注意。",
                        npc: 818007,
                        next: 71002112,
                    },
                    {
                        id: 71002112,
                        content: "{nickname}，这点东西你收下当赔礼吧，连累了你，怪不好意思的。",
                        npc: 818007,
                    },
                ],
            },
        ],
    },
    {
        id: 102905,
        name: "调整调整再调整",
        level: [60, 65],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "172415203295057256",
                type: "TalkNode",
                name: "NPC开车对话",
                dialogues: [
                    {
                        id: 71001901,
                        content: "调整前后到底有没有区别呢……",
                        npc: 818016,
                        next: 71001902,
                    },
                ],
            },
            {
                id: "172415208014258112",
                type: "TalkNode",
                name: "NPC交互对话",
                next: ["172551304133810406"],
                dialogues: [
                    {
                        id: 71001902,
                        content:
                            "哦？你来得正好，我刚调整了一下这部升降机，你能帮我乘坐一下试试有没有变快吗？我来来回回坐得太多了实在感觉不出来。",
                        npc: 818016,
                    },
                ],
            },
            {
                id: "172551303112910139",
                type: "TalkNode",
                name: "与npc对话",
                dialogues: [
                    {
                        id: 71001904,
                        content: "感觉没什么变化。",
                        npc: 100001,
                        next: 71001905,
                    },
                    {
                        id: 71001905,
                        content: "这样啊，果然调优来调优去都只是图一个自己的心理安慰。行吧，谢谢你提供的数据，这是我的一点心意。",
                        npc: 818016,
                    },
                ],
            },
            {
                id: "172551304133810406",
                type: "TalkNode",
                name: "与npc对话奖励",
                dialogues: [
                    {
                        id: 71001903,
                        content: "这么快？难道有什么我没发现的问题，看来得再整体检查一遍了，谢谢你提供的数据，这是我的一点心意。",
                        npc: 818016,
                    },
                ],
            },
        ],
    },
    {
        id: 104004,
        name: "打打打打打劫",
        level: [50, 59],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
    },
    {
        id: 104524,
        name: "趋光性",
        level: [50, 59],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1733137261166212656",
                type: "TalkNode",
                name: "开车对话",
                next: ["1733137502490215111"],
                dialogues: [
                    {
                        id: 71003501,
                        content: "（远处闪闪发光的东西吸引了你的注意，靠近看看到底是什么吧。）",
                        npc: 800006,
                        next: 71003502,
                    },
                ],
            },
            {
                id: "17331391356532740157",
                type: "TalkNode",
                name: "混混出现开车",
                dialogues: [
                    {
                        id: 71003502,
                        content: "我就说这亮闪闪的破镜子能引来狩月人吧，动手！",
                        npc: 818028,
                    },
                ],
            },
            {
                id: "1733137502490215111",
                type: "TalkNode",
                name: "与混混对话",
                dialogues: [
                    {
                        id: 71003504,
                        content: "别打了别打了，我们再也不敢了……",
                        npc: 818028,
                    },
                ],
            },
        ],
    },
    {
        id: 104554,
        name: "趋光性",
        level: [50, 59],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1733137261166212656",
                type: "TalkNode",
                name: "开车对话",
                next: ["1733137502490215111"],
                dialogues: [
                    {
                        id: 71003501,
                        content: "（远处闪闪发光的东西吸引了你的注意，靠近看看到底是什么吧。）",
                        npc: 800006,
                        next: 71003502,
                    },
                ],
            },
            {
                id: "17331391356532740157",
                type: "TalkNode",
                name: "混混出现开车",
                dialogues: [
                    {
                        id: 71003502,
                        content: "我就说这亮闪闪的破镜子能引来狩月人吧，动手！",
                        npc: 818028,
                    },
                ],
            },
            {
                id: "1733137502490215111",
                type: "TalkNode",
                name: "与混混对话",
                dialogues: [
                    {
                        id: 71003504,
                        content: "别打了别打了，我们再也不敢了……",
                        npc: 818028,
                    },
                ],
            },
        ],
    },
    {
        id: 104804,
        name: "秽兽通道",
        level: [50, 59],
        regionId: 1021,
        subRegionId: 102101,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1733468730434637974",
                type: "TalkNode",
                name: "看到秽兽群开车",
                next: ["17334739246391958"],
                dialogues: [
                    {
                        id: 71003801,
                        content: "（游荡的秽兽挤满了通道，击退它们吧。）",
                        npc: 800006,
                        next: 71003802,
                    },
                ],
            },
            {
                id: "1733473884441832",
                type: "TalkNode",
                name: "击杀一半开车",
                dialogues: [
                    {
                        id: 71003802,
                        content: "（更多秽兽被打斗的声响吸引，涌向了通道，击退它们吧。）",
                        npc: 800006,
                        next: 71003803,
                    },
                ],
            },
            {
                id: "17334739246391958",
                type: "TalkNode",
                name: "击杀完成开车",
                dialogues: [
                    {
                        id: 71003803,
                        content: "（通道中的所有秽兽都被你清理干净，这里暂时安全了。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 105004,
        name: "打打打打打劫",
        level: [50, 59],
        regionId: 1001,
        subRegionId: 100103,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
    },
    {
        id: 105203,
        name: "探险家小研究！",
        level: [40, 49],
        regionId: 1001,
        subRegionId: 100102,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17339853912771355",
                type: "TalkNode",
                name: "皎皎开车",
                dialogues: [
                    {
                        id: 71004201,
                        content: "唔嗯嗯嗯嗯，好结实……",
                        npc: 818038,
                        next: 71004202,
                    },
                ],
            },
            {
                id: "17339854854482439",
                type: "TalkNode",
                name: "对话节点",
                next: ["17339859268628057"],
                dialogues: [
                    {
                        id: 71004202,
                        content: "你在干什么？",
                        npc: 100001,
                        next: 71004203,
                    },
                    {
                        id: 71004203,
                        content: "我最近在研究秽兽的生态，你要不要帮我找点死掉的秽兽样本呀。",
                        npc: 818038,
                        options: [
                            {
                                id: 710042031,
                                content: "（接受。）",
                                next: 71004204,
                            },
                            {
                                id: 710042032,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71004204,
                        content: "好，那就交给你了！我先休息一下，一直一个人收集样本差点累死我……",
                        npc: 818038,
                        next: 71004205,
                    },
                ],
            },
            {
                id: "17339857752195069",
                type: "TalkNode",
                name: "皎皎开车",
                dialogues: [
                    {
                        id: 71004205,
                        content: "呜哇哇哇，周围怎么还有活的秽兽呀，别过来别过来，是我研究你们不是你们研究我！",
                        npc: 818038,
                        next: 71004206,
                    },
                ],
            },
            {
                id: "17339859268628057",
                type: "TalkNode",
                name: "击杀结束",
                dialogues: [
                    {
                        id: 71004206,
                        content: "谢啦谢啦，现在样本集齐了，我也该去继续研究了，下次见喽！",
                        npc: 818038,
                    },
                ],
            },
        ],
    },
    {
        id: 105204,
        name: "探险家小研究！",
        level: [50, 59],
        regionId: 1001,
        subRegionId: 100102,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17339853912771355",
                type: "TalkNode",
                name: "皎皎开车",
                dialogues: [
                    {
                        id: 71004201,
                        content: "唔嗯嗯嗯嗯，好结实……",
                        npc: 818038,
                        next: 71004202,
                    },
                ],
            },
            {
                id: "17339854854482439",
                type: "TalkNode",
                name: "对话节点",
                next: ["17339859268628057"],
                dialogues: [
                    {
                        id: 71004202,
                        content: "你在干什么？",
                        npc: 100001,
                        next: 71004203,
                    },
                    {
                        id: 71004203,
                        content: "我最近在研究秽兽的生态，你要不要帮我找点死掉的秽兽样本呀。",
                        npc: 818038,
                        options: [
                            {
                                id: 710042031,
                                content: "（接受。）",
                                next: 71004204,
                            },
                            {
                                id: 710042032,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71004204,
                        content: "好，那就交给你了！我先休息一下，一直一个人收集样本差点累死我……",
                        npc: 818038,
                        next: 71004205,
                    },
                ],
            },
            {
                id: "17339857752195069",
                type: "TalkNode",
                name: "皎皎开车",
                dialogues: [
                    {
                        id: 71004205,
                        content: "呜哇哇哇，周围怎么还有活的秽兽呀，别过来别过来，是我研究你们不是你们研究我！",
                        npc: 818038,
                        next: 71004206,
                    },
                ],
            },
            {
                id: "17339859268628057",
                type: "TalkNode",
                name: "击杀结束",
                dialogues: [
                    {
                        id: 71004206,
                        content: "谢啦谢啦，现在样本集齐了，我也该去继续研究了，下次见喽！",
                        npc: 818038,
                    },
                ],
            },
        ],
    },
    {
        id: 105904,
        name: "公路维护",
        level: [50, 59],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1735111555773699624",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71004801,
                        content: "（远处传来碎冰掉落的声音，过去看看发生了什么吧。）",
                        npc: 800006,
                        next: 71004802,
                    },
                ],
            },
            {
                id: "17351096122601397",
                type: "TalkNode",
                name: "清理对话",
                dialogues: [
                    {
                        id: 71004802,
                        content: "狩月人？你来得正好，最近公路下面结的冰锥有点多了，一起把它们清理掉吧。",
                        npc: 818039,
                        options: [
                            {
                                id: 710048021,
                                content: "（接受。）",
                                next: 71004803,
                            },
                            {
                                id: 710048022,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71004803,
                        content: "感谢帮助，那边几块交给你了。",
                        npc: 818039,
                        next: 71004805,
                    },
                ],
            },
            {
                id: "17351098028014167",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71004805,
                        content: "这样安全隐患就小很多了，拿上吧，这些都是给你的报酬。",
                        npc: 818039,
                    },
                ],
            },
        ],
    },
    {
        id: 105905,
        name: "公路维护",
        level: [60, 65],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1735111555773699624",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71004801,
                        content: "（远处传来碎冰掉落的声音，过去看看发生了什么吧。）",
                        npc: 800006,
                        next: 71004802,
                    },
                ],
            },
            {
                id: "17351096122601397",
                type: "TalkNode",
                name: "清理对话",
                dialogues: [
                    {
                        id: 71004802,
                        content: "狩月人？你来得正好，最近公路下面结的冰锥有点多了，一起把它们清理掉吧。",
                        npc: 818039,
                        options: [
                            {
                                id: 710048021,
                                content: "（接受。）",
                                next: 71004803,
                            },
                            {
                                id: 710048022,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71004803,
                        content: "感谢帮助，那边几块交给你了。",
                        npc: 818039,
                        next: 71004805,
                    },
                ],
            },
            {
                id: "17351098028014167",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71004805,
                        content: "这样安全隐患就小很多了，拿上吧，这些都是给你的报酬。",
                        npc: 818039,
                    },
                ],
            },
        ],
    },
    {
        id: 106543,
        name: "身处外城",
        level: [40, 49],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17357863822593739",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71005301,
                        content: "抢劫啦，抢劫啦，有没有人帮帮我啊！",
                        npc: 818042,
                        next: 71005302,
                    },
                ],
            },
            {
                id: "17357863469293379",
                type: "TalkNode",
                name: "请求拿回钱财",
                dialogues: [
                    {
                        id: 71005302,
                        content: "抢你的人跑哪去了？",
                        npc: 100001,
                        next: 71005303,
                    },
                    {
                        id: 71005303,
                        content: "他们，他们往那边跑了，呜呜呜，外城真的好危险啊……",
                        npc: 818042,
                        next: 71005304,
                    },
                ],
            },
            {
                id: "17357865108865826",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005304,
                        content: "内城的家伙一个比一个有钱啊，几个月不愁吃喝喽。",
                        npc: 818043,
                        next: 71005305,
                    },
                    {
                        id: 71005305,
                        content: "站住，把抢来的东西还回来。",
                        npc: 100001,
                        next: 71005306,
                    },
                    {
                        id: 71005306,
                        content: "哼，这么快就有人帮忙出头啊，那就别怪我们下狠手了！",
                        npc: 818043,
                        next: 71005307,
                    },
                ],
            },
            {
                id: "17358006120342109499",
                type: "TalkNode",
                name: "与小混混对话",
                dialogues: [
                    {
                        id: 71005307,
                        content: "啧，今天真是晦气，撤！",
                        npc: 818043,
                        next: 71005308,
                    },
                ],
            },
            {
                id: "17357865932597840",
                type: "TalkNode",
                name: "小混混离开后选择",
                next: ["17358005146902108936"],
                dialogues: [
                    {
                        id: 71005308,
                        content: "（抢劫者们说完便朝各个方向逃去，你捡起地上的包裹，思索着下一步行动。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17357866196488312",
                type: "TalkNode",
                name: "似乎忘记了什么",
                dialogues: [
                    {
                        id: 71005309,
                        content: "（这是帮女孩认识外城险恶的“学费”，你拿走它们天经地义。不找她再多要点钱已经算是相当仁慈了。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17358005146902108936",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005310,
                        content: "我拿回来了，是这个包裹没错吧。",
                        npc: 100001,
                        next: 71005311,
                    },
                    {
                        id: 71005311,
                        content: "是的是的，谢谢你！",
                        npc: 818042,
                        next: 71005312,
                    },
                    {
                        id: 71005312,
                        content: "（女孩擦了擦眼泪，从包裹中取出一大笔钱放到了你的手上。）",
                        npc: 800006,
                        next: 71005313,
                    },
                    {
                        id: 71005313,
                        content: "这些是谢礼，外城还有你这样善良的狩月人真是太好了，呜呜呜……",
                        npc: 818042,
                    },
                ],
            },
        ],
    },
    {
        id: 106544,
        name: "身处外城",
        level: [50, 59],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17357863822593739",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71005301,
                        content: "抢劫啦，抢劫啦，有没有人帮帮我啊！",
                        npc: 818042,
                        next: 71005302,
                    },
                ],
            },
            {
                id: "17357863469293379",
                type: "TalkNode",
                name: "请求拿回钱财",
                dialogues: [
                    {
                        id: 71005302,
                        content: "抢你的人跑哪去了？",
                        npc: 100001,
                        next: 71005303,
                    },
                    {
                        id: 71005303,
                        content: "他们，他们往那边跑了，呜呜呜，外城真的好危险啊……",
                        npc: 818042,
                        next: 71005304,
                    },
                ],
            },
            {
                id: "17357865108865826",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005304,
                        content: "内城的家伙一个比一个有钱啊，几个月不愁吃喝喽。",
                        npc: 818043,
                        next: 71005305,
                    },
                    {
                        id: 71005305,
                        content: "站住，把抢来的东西还回来。",
                        npc: 100001,
                        next: 71005306,
                    },
                    {
                        id: 71005306,
                        content: "哼，这么快就有人帮忙出头啊，那就别怪我们下狠手了！",
                        npc: 818043,
                        next: 71005307,
                    },
                ],
            },
            {
                id: "17358006120342109499",
                type: "TalkNode",
                name: "与小混混对话",
                dialogues: [
                    {
                        id: 71005307,
                        content: "啧，今天真是晦气，撤！",
                        npc: 818043,
                        next: 71005308,
                    },
                ],
            },
            {
                id: "17357865932597840",
                type: "TalkNode",
                name: "小混混离开后选择",
                next: ["17358005146902108936"],
                dialogues: [
                    {
                        id: 71005308,
                        content: "（抢劫者们说完便朝各个方向逃去，你捡起地上的包裹，思索着下一步行动。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17357866196488312",
                type: "TalkNode",
                name: "似乎忘记了什么",
                dialogues: [
                    {
                        id: 71005309,
                        content: "（这是帮女孩认识外城险恶的“学费”，你拿走它们天经地义。不找她再多要点钱已经算是相当仁慈了。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17358005146902108936",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005310,
                        content: "我拿回来了，是这个包裹没错吧。",
                        npc: 100001,
                        next: 71005311,
                    },
                    {
                        id: 71005311,
                        content: "是的是的，谢谢你！",
                        npc: 818042,
                        next: 71005312,
                    },
                    {
                        id: 71005312,
                        content: "（女孩擦了擦眼泪，从包裹中取出一大笔钱放到了你的手上。）",
                        npc: 800006,
                        next: 71005313,
                    },
                    {
                        id: 71005313,
                        content: "这些是谢礼，外城还有你这样善良的狩月人真是太好了，呜呜呜……",
                        npc: 818042,
                    },
                ],
            },
        ],
    },
    {
        id: 106553,
        name: "身处外城",
        level: [40, 49],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17357863822593739",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71005301,
                        content: "抢劫啦，抢劫啦，有没有人帮帮我啊！",
                        npc: 818042,
                        next: 71005302,
                    },
                ],
            },
            {
                id: "17357863469293379",
                type: "TalkNode",
                name: "请求拿回钱财",
                dialogues: [
                    {
                        id: 71005302,
                        content: "抢你的人跑哪去了？",
                        npc: 100001,
                        next: 71005303,
                    },
                    {
                        id: 71005303,
                        content: "他们，他们往那边跑了，呜呜呜，外城真的好危险啊……",
                        npc: 818042,
                        next: 71005304,
                    },
                ],
            },
            {
                id: "17357865108865826",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005304,
                        content: "内城的家伙一个比一个有钱啊，几个月不愁吃喝喽。",
                        npc: 818043,
                        next: 71005305,
                    },
                    {
                        id: 71005305,
                        content: "站住，把抢来的东西还回来。",
                        npc: 100001,
                        next: 71005306,
                    },
                    {
                        id: 71005306,
                        content: "哼，这么快就有人帮忙出头啊，那就别怪我们下狠手了！",
                        npc: 818043,
                        next: 71005307,
                    },
                ],
            },
            {
                id: "17358006120342109499",
                type: "TalkNode",
                name: "与小混混对话",
                dialogues: [
                    {
                        id: 71005307,
                        content: "啧，今天真是晦气，撤！",
                        npc: 818043,
                        next: 71005308,
                    },
                ],
            },
            {
                id: "17357865932597840",
                type: "TalkNode",
                name: "小混混离开后选择",
                next: ["17358005146902108936"],
                dialogues: [
                    {
                        id: 71005308,
                        content: "（抢劫者们说完便朝各个方向逃去，你捡起地上的包裹，思索着下一步行动。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17357866196488312",
                type: "TalkNode",
                name: "似乎忘记了什么",
                dialogues: [
                    {
                        id: 71005309,
                        content: "（这是帮女孩认识外城险恶的“学费”，你拿走它们天经地义。不找她再多要点钱已经算是相当仁慈了。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17358005146902108936",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005310,
                        content: "我拿回来了，是这个包裹没错吧。",
                        npc: 100001,
                        next: 71005311,
                    },
                    {
                        id: 71005311,
                        content: "是的是的，谢谢你！",
                        npc: 818042,
                        next: 71005312,
                    },
                    {
                        id: 71005312,
                        content: "（女孩擦了擦眼泪，从包裹中取出一大笔钱放到了你的手上。）",
                        npc: 800006,
                        next: 71005313,
                    },
                    {
                        id: 71005313,
                        content: "这些是谢礼，外城还有你这样善良的狩月人真是太好了，呜呜呜……",
                        npc: 818042,
                    },
                ],
            },
        ],
    },
    {
        id: 106554,
        name: "身处外城",
        level: [50, 59],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17357863822593739",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71005301,
                        content: "抢劫啦，抢劫啦，有没有人帮帮我啊！",
                        npc: 818042,
                        next: 71005302,
                    },
                ],
            },
            {
                id: "17357863469293379",
                type: "TalkNode",
                name: "请求拿回钱财",
                dialogues: [
                    {
                        id: 71005302,
                        content: "抢你的人跑哪去了？",
                        npc: 100001,
                        next: 71005303,
                    },
                    {
                        id: 71005303,
                        content: "他们，他们往那边跑了，呜呜呜，外城真的好危险啊……",
                        npc: 818042,
                        next: 71005304,
                    },
                ],
            },
            {
                id: "17357865108865826",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005304,
                        content: "内城的家伙一个比一个有钱啊，几个月不愁吃喝喽。",
                        npc: 818043,
                        next: 71005305,
                    },
                    {
                        id: 71005305,
                        content: "站住，把抢来的东西还回来。",
                        npc: 100001,
                        next: 71005306,
                    },
                    {
                        id: 71005306,
                        content: "哼，这么快就有人帮忙出头啊，那就别怪我们下狠手了！",
                        npc: 818043,
                        next: 71005307,
                    },
                ],
            },
            {
                id: "17358006120342109499",
                type: "TalkNode",
                name: "与小混混对话",
                dialogues: [
                    {
                        id: 71005307,
                        content: "啧，今天真是晦气，撤！",
                        npc: 818043,
                        next: 71005308,
                    },
                ],
            },
            {
                id: "17357865932597840",
                type: "TalkNode",
                name: "小混混离开后选择",
                next: ["17358005146902108936"],
                dialogues: [
                    {
                        id: 71005308,
                        content: "（抢劫者们说完便朝各个方向逃去，你捡起地上的包裹，思索着下一步行动。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17357866196488312",
                type: "TalkNode",
                name: "似乎忘记了什么",
                dialogues: [
                    {
                        id: 71005309,
                        content: "（这是帮女孩认识外城险恶的“学费”，你拿走它们天经地义。不找她再多要点钱已经算是相当仁慈了。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17358005146902108936",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005310,
                        content: "我拿回来了，是这个包裹没错吧。",
                        npc: 100001,
                        next: 71005311,
                    },
                    {
                        id: 71005311,
                        content: "是的是的，谢谢你！",
                        npc: 818042,
                        next: 71005312,
                    },
                    {
                        id: 71005312,
                        content: "（女孩擦了擦眼泪，从包裹中取出一大笔钱放到了你的手上。）",
                        npc: 800006,
                        next: 71005313,
                    },
                    {
                        id: 71005313,
                        content: "这些是谢礼，外城还有你这样善良的狩月人真是太好了，呜呜呜……",
                        npc: 818042,
                    },
                ],
            },
        ],
    },
    {
        id: 106635,
        name: "一碰即坏",
        level: [60, 65],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17358124408351401296",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71005401,
                        content: "丰厚奖励就在眼前，走过路过别错过。",
                        npc: 818044,
                        next: 71005402,
                    },
                ],
            },
            {
                id: "17358124635791401739",
                type: "TalkNode",
                name: "选择开启匣子",
                next: ["17358125334741403001"],
                dialogues: [
                    {
                        id: 71005402,
                        content: "呦，这位狩月人要来试试吗，只要你能打开这个箱子，里面的奖励就都是你的了！",
                        npc: 818044,
                    },
                ],
            },
            {
                id: "17358127109881404299",
                type: "TalkNode",
                name: "发现不对劲分支选项",
                next: ["1735874291275700082"],
                dialogues: [
                    {
                        id: 71005404,
                        content: "啊，你把我的宝箱弄坏了啊，赔钱赔钱！",
                        npc: 818044,
                        options: [
                            {
                                id: 710054041,
                                content: "箱子一碰就坏，你没做手脚的话我把锁芯拆出来给所有人看看如何。",
                                next: 71005405,
                                impr: [1011, "Wisdom", 1],
                            },
                            {
                                id: 710054042,
                                content: "上一个讹我钱的人已经成为病房贵宾了。",
                                next: 71005407,
                            },
                        ],
                    },
                    {
                        id: 71005405,
                        content: "嘘……别喊别喊，我之后还要在这一带骗……不是，跟其他人做生意呢。这些东西给你，行行好别喊了。",
                        npc: 818044,
                        next: 71005406,
                    },
                    {
                        id: 71005407,
                        content: "你这家伙，非逼我动手是吧！",
                        npc: 818044,
                        next: 71005408,
                    },
                    {
                        id: 71005406,
                        content: "（男人自知理亏，塞给你一袋钱财便抱着箱子灰溜溜地走开了。）",
                        npc: 800006,
                    },
                    {
                        id: 71005408,
                        content: "没想到你这骗子还有跟人动手的勇气啊，那就来吧。",
                        npc: 100001,
                        next: 71005409,
                    },
                ],
            },
            {
                id: "17358125334741403001",
                type: "TalkNode",
                name: "对话节点",
                next: ["17358127109881404299"],
                dialogues: [
                    {
                        id: 71005403,
                        content:
                            "（锁孔打开的声音传来，当你以为自己成功时，缓缓开启的箱子突然发出“咔哒”一声脆响，重重地关上。无论如何尝试，箱子都再也无法打开了。）",
                        npc: 800006,
                        next: 71005404,
                    },
                ],
            },
            {
                id: "1735874291275700082",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005409,
                        content: "（男人自知理亏，抱着箱子灰溜溜地走开了。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 106655,
        name: "一碰即坏",
        level: [60, 65],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17358124408351401296",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71005401,
                        content: "丰厚奖励就在眼前，走过路过别错过。",
                        npc: 818044,
                        next: 71005402,
                    },
                ],
            },
            {
                id: "17358124635791401739",
                type: "TalkNode",
                name: "选择开启匣子",
                next: ["17358125334741403001"],
                dialogues: [
                    {
                        id: 71005402,
                        content: "呦，这位狩月人要来试试吗，只要你能打开这个箱子，里面的奖励就都是你的了！",
                        npc: 818044,
                    },
                ],
            },
            {
                id: "17358127109881404299",
                type: "TalkNode",
                name: "发现不对劲分支选项",
                next: ["1735874291275700082"],
                dialogues: [
                    {
                        id: 71005404,
                        content: "啊，你把我的宝箱弄坏了啊，赔钱赔钱！",
                        npc: 818044,
                        options: [
                            {
                                id: 710054041,
                                content: "箱子一碰就坏，你没做手脚的话我把锁芯拆出来给所有人看看如何。",
                                next: 71005405,
                                impr: [1011, "Wisdom", 1],
                            },
                            {
                                id: 710054042,
                                content: "上一个讹我钱的人已经成为病房贵宾了。",
                                next: 71005407,
                            },
                        ],
                    },
                    {
                        id: 71005405,
                        content: "嘘……别喊别喊，我之后还要在这一带骗……不是，跟其他人做生意呢。这些东西给你，行行好别喊了。",
                        npc: 818044,
                        next: 71005406,
                    },
                    {
                        id: 71005407,
                        content: "你这家伙，非逼我动手是吧！",
                        npc: 818044,
                        next: 71005408,
                    },
                    {
                        id: 71005406,
                        content: "（男人自知理亏，塞给你一袋钱财便抱着箱子灰溜溜地走开了。）",
                        npc: 800006,
                    },
                    {
                        id: 71005408,
                        content: "没想到你这骗子还有跟人动手的勇气啊，那就来吧。",
                        npc: 100001,
                        next: 71005409,
                    },
                ],
            },
            {
                id: "17358125334741403001",
                type: "TalkNode",
                name: "对话节点",
                next: ["17358127109881404299"],
                dialogues: [
                    {
                        id: 71005403,
                        content:
                            "（锁孔打开的声音传来，当你以为自己成功时，缓缓开启的箱子突然发出“咔哒”一声脆响，重重地关上。无论如何尝试，箱子都再也无法打开了。）",
                        npc: 800006,
                        next: 71005404,
                    },
                ],
            },
            {
                id: "1735874291275700082",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005409,
                        content: "（男人自知理亏，抱着箱子灰溜溜地走开了。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 108103,
        name: "探险家小研究！",
        level: [40, 49],
        regionId: 1017,
        subRegionId: 101701,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "174116795662766",
                type: "TalkNode",
                name: "皎皎开车",
                dialogues: [
                    {
                        id: 71004201,
                        content: "唔嗯嗯嗯嗯，好结实……",
                        npc: 818038,
                        next: 71004202,
                    },
                ],
            },
            {
                id: "174116795662767",
                type: "TalkNode",
                name: "对话节点",
                next: ["174116795662978"],
                dialogues: [
                    {
                        id: 71004202,
                        content: "你在干什么？",
                        npc: 100001,
                        next: 71004203,
                    },
                    {
                        id: 71004203,
                        content: "我最近在研究秽兽的生态，你要不要帮我找点死掉的秽兽样本呀。",
                        npc: 818038,
                        options: [
                            {
                                id: 710042031,
                                content: "（接受。）",
                                next: 71004204,
                            },
                            {
                                id: 710042032,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71004204,
                        content: "好，那就交给你了！我先休息一下，一直一个人收集样本差点累死我……",
                        npc: 818038,
                        next: 71004205,
                    },
                ],
            },
            {
                id: "174116795662971",
                type: "TalkNode",
                name: "皎皎开车",
                dialogues: [
                    {
                        id: 71004205,
                        content: "呜哇哇哇，周围怎么还有活的秽兽呀，别过来别过来，是我研究你们不是你们研究我！",
                        npc: 818038,
                        next: 71004206,
                    },
                ],
            },
            {
                id: "174116795662978",
                type: "TalkNode",
                name: "击杀结束",
                dialogues: [
                    {
                        id: 71004206,
                        content: "谢啦谢啦，现在样本集齐了，我也该去继续研究了，下次见喽！",
                        npc: 818038,
                    },
                ],
            },
        ],
    },
    {
        id: 108203,
        name: "烛阴之灾的影响",
        level: [40, 49],
        regionId: 1041,
        subRegionId: 104108,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1749035323773301572",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006401,
                        content: "（玄色狴犴骤然出现，击退它们！）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 108204,
        name: "烛阴之灾的影响",
        level: [50, 59],
        regionId: 1041,
        subRegionId: 104108,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1749035323773301572",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006401,
                        content: "（玄色狴犴骤然出现，击退它们！）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 108923,
        name: "跑腿代购",
        level: [40, 49],
        regionId: 1041,
        subRegionId: 104109,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1750165607615633585",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007101,
                        content: "唉……怎么时间刚好都撞一块了呢……",
                        npc: 818069,
                        next: 71007103,
                    },
                ],
            },
            {
                id: "1750165628019634064",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007103,
                        content: "诶，这位朋友来得正好，你能帮我去那边排块核桃酥吗？",
                        npc: 818069,
                        next: 71007104,
                    },
                    {
                        id: 71007104,
                        content: "我等会还约了其他人谈生意，实在没空去排队了。",
                        npc: 818069,
                        options: [
                            {
                                id: 710071041,
                                content: "（接受。）",
                                next: 71007105,
                            },
                            {
                                id: 710071042,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71007105,
                        content: "谢了，那我先走一步。",
                        npc: 818069,
                        next: 71007106,
                    },
                ],
            },
            {
                id: "1750169293149641029",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007106,
                        content: "（一段时间后……）",
                        npc: 800006,
                        next: 710071061,
                    },
                ],
            },
            {
                id: "17576477242633840416",
                type: "TalkNode",
                name: "对话节点",
                next: ["1750166084867635616"],
                dialogues: [
                    {
                        id: 710071061,
                        content: "你运气真好，这是最后一份特色小吃了请拿好",
                        npc: 818071,
                        next: 71007108,
                    },
                ],
            },
            {
                id: "1750169360732642308",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007107,
                        content: "（刚买好小吃，你就看到身后有个孩子眼巴巴地看着你。）",
                        npc: 800006,
                        next: 71007108,
                    },
                ],
            },
            {
                id: "1750166084867635616",
                type: "TalkNode",
                name: "对话节点",
                next: ["1750166188974637494"],
                dialogues: [
                    {
                        id: 71007108,
                        content: "那个……我能用这些钱买你的核桃酥吗？我妈妈很喜欢这家的核桃酥，但她最近生病了，我想给她带一份回家……",
                        npc: 818070,
                        options: [
                            {
                                id: 710071081,
                                content: "（接受。）",
                                next: 71007109,
                                impr: [1041, "Empathy", 1],
                            },
                            {
                                id: 710071082,
                                content: "（拒绝。）",
                                next: 71007113,
                                impr: [1041, "Morality", 1],
                            },
                        ],
                    },
                    {
                        id: 71007109,
                        content: "既然这样，那还是让给你吧，希望你妈妈能快点好起来。",
                        npc: 100001,
                        next: 710071091,
                    },
                    {
                        id: 71007113,
                        content: "抱歉，我答应了别人。",
                        npc: 100001,
                        next: 710071131,
                    },
                    {
                        id: 710071091,
                        content: "谢谢{性别：大哥哥|大姐姐}！你真是个大好人！",
                        npc: 818070,
                        next: 71007110,
                    },
                    {
                        id: 710071131,
                        content: "唔……好吧，谢谢……",
                        npc: 818070,
                        next: 71007114,
                    },
                ],
            },
            {
                id: "1750166175140636985",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007110,
                        content: "回来了回来了，吃的在哪呢？",
                        npc: 818069,
                        next: 71007111,
                    },
                    {
                        id: 71007111,
                        content: "（你和男子说明了事情经过……）",
                        npc: 800006,
                        next: 71007112,
                    },
                    {
                        id: 71007112,
                        content: "这样啊，那就没办法了，毕竟那孩子比我更需要嘛，辛苦你啦。",
                        npc: 818069,
                    },
                ],
            },
            {
                id: "1750166188974637494",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007114,
                        content: "回来了回来了，吃的在哪呢？",
                        npc: 818069,
                        next: 71007115,
                    },
                    {
                        id: 71007115,
                        content: "给你。",
                        npc: 100001,
                        next: 71007116,
                    },
                    {
                        id: 71007116,
                        content: "嗯～真香！辛苦你啦，来来来，这是你的报酬。",
                        npc: 818069,
                    },
                ],
            },
        ],
    },
    {
        id: 108924,
        name: "跑腿代购",
        level: [50, 59],
        regionId: 1041,
        subRegionId: 104109,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1750165607615633585",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007101,
                        content: "唉……怎么时间刚好都撞一块了呢……",
                        npc: 818069,
                        next: 71007103,
                    },
                ],
            },
            {
                id: "1750165628019634064",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007103,
                        content: "诶，这位朋友来得正好，你能帮我去那边排块核桃酥吗？",
                        npc: 818069,
                        next: 71007104,
                    },
                    {
                        id: 71007104,
                        content: "我等会还约了其他人谈生意，实在没空去排队了。",
                        npc: 818069,
                        options: [
                            {
                                id: 710071041,
                                content: "（接受。）",
                                next: 71007105,
                            },
                            {
                                id: 710071042,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71007105,
                        content: "谢了，那我先走一步。",
                        npc: 818069,
                        next: 71007106,
                    },
                ],
            },
            {
                id: "1750169293149641029",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007106,
                        content: "（一段时间后……）",
                        npc: 800006,
                        next: 710071061,
                    },
                ],
            },
            {
                id: "17576477242633840416",
                type: "TalkNode",
                name: "对话节点",
                next: ["1750166084867635616"],
                dialogues: [
                    {
                        id: 710071061,
                        content: "你运气真好，这是最后一份特色小吃了请拿好",
                        npc: 818071,
                        next: 71007108,
                    },
                ],
            },
            {
                id: "1750169360732642308",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007107,
                        content: "（刚买好小吃，你就看到身后有个孩子眼巴巴地看着你。）",
                        npc: 800006,
                        next: 71007108,
                    },
                ],
            },
            {
                id: "1750166084867635616",
                type: "TalkNode",
                name: "对话节点",
                next: ["1750166188974637494"],
                dialogues: [
                    {
                        id: 71007108,
                        content: "那个……我能用这些钱买你的核桃酥吗？我妈妈很喜欢这家的核桃酥，但她最近生病了，我想给她带一份回家……",
                        npc: 818070,
                        options: [
                            {
                                id: 710071081,
                                content: "（接受。）",
                                next: 71007109,
                                impr: [1041, "Empathy", 1],
                            },
                            {
                                id: 710071082,
                                content: "（拒绝。）",
                                next: 71007113,
                                impr: [1041, "Morality", 1],
                            },
                        ],
                    },
                    {
                        id: 71007109,
                        content: "既然这样，那还是让给你吧，希望你妈妈能快点好起来。",
                        npc: 100001,
                        next: 710071091,
                    },
                    {
                        id: 71007113,
                        content: "抱歉，我答应了别人。",
                        npc: 100001,
                        next: 710071131,
                    },
                    {
                        id: 710071091,
                        content: "谢谢{性别：大哥哥|大姐姐}！你真是个大好人！",
                        npc: 818070,
                        next: 71007110,
                    },
                    {
                        id: 710071131,
                        content: "唔……好吧，谢谢……",
                        npc: 818070,
                        next: 71007114,
                    },
                ],
            },
            {
                id: "1750166175140636985",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007110,
                        content: "回来了回来了，吃的在哪呢？",
                        npc: 818069,
                        next: 71007111,
                    },
                    {
                        id: 71007111,
                        content: "（你和男子说明了事情经过……）",
                        npc: 800006,
                        next: 71007112,
                    },
                    {
                        id: 71007112,
                        content: "这样啊，那就没办法了，毕竟那孩子比我更需要嘛，辛苦你啦。",
                        npc: 818069,
                    },
                ],
            },
            {
                id: "1750166188974637494",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007114,
                        content: "回来了回来了，吃的在哪呢？",
                        npc: 818069,
                        next: 71007115,
                    },
                    {
                        id: 71007115,
                        content: "给你。",
                        npc: 100001,
                        next: 71007116,
                    },
                    {
                        id: 71007116,
                        content: "嗯～真香！辛苦你啦，来来来，这是你的报酬。",
                        npc: 818069,
                    },
                ],
            },
        ],
    },
    {
        id: 108943,
        name: "跑腿代购",
        level: [40, 49],
        regionId: 1041,
        subRegionId: 104109,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1750165607615633585",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007101,
                        content: "唉……怎么时间刚好都撞一块了呢……",
                        npc: 818069,
                        next: 71007103,
                    },
                ],
            },
            {
                id: "1750165628019634064",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007103,
                        content: "诶，这位朋友来得正好，你能帮我去那边排块核桃酥吗？",
                        npc: 818069,
                        next: 71007104,
                    },
                    {
                        id: 71007104,
                        content: "我等会还约了其他人谈生意，实在没空去排队了。",
                        npc: 818069,
                        options: [
                            {
                                id: 710071041,
                                content: "（接受。）",
                                next: 71007105,
                            },
                            {
                                id: 710071042,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71007105,
                        content: "谢了，那我先走一步。",
                        npc: 818069,
                        next: 71007106,
                    },
                ],
            },
            {
                id: "1750169293149641029",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007106,
                        content: "（一段时间后……）",
                        npc: 800006,
                        next: 710071061,
                    },
                ],
            },
            {
                id: "17576477242633840416",
                type: "TalkNode",
                name: "对话节点",
                next: ["1750166084867635616"],
                dialogues: [
                    {
                        id: 710071061,
                        content: "你运气真好，这是最后一份特色小吃了请拿好",
                        npc: 818071,
                        next: 71007108,
                    },
                ],
            },
            {
                id: "1750169360732642308",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007107,
                        content: "（刚买好小吃，你就看到身后有个孩子眼巴巴地看着你。）",
                        npc: 800006,
                        next: 71007108,
                    },
                ],
            },
            {
                id: "1750166084867635616",
                type: "TalkNode",
                name: "对话节点",
                next: ["1750166188974637494"],
                dialogues: [
                    {
                        id: 71007108,
                        content: "那个……我能用这些钱买你的核桃酥吗？我妈妈很喜欢这家的核桃酥，但她最近生病了，我想给她带一份回家……",
                        npc: 818070,
                        options: [
                            {
                                id: 710071081,
                                content: "（接受。）",
                                next: 71007109,
                                impr: [1041, "Empathy", 1],
                            },
                            {
                                id: 710071082,
                                content: "（拒绝。）",
                                next: 71007113,
                                impr: [1041, "Morality", 1],
                            },
                        ],
                    },
                    {
                        id: 71007109,
                        content: "既然这样，那还是让给你吧，希望你妈妈能快点好起来。",
                        npc: 100001,
                        next: 710071091,
                    },
                    {
                        id: 71007113,
                        content: "抱歉，我答应了别人。",
                        npc: 100001,
                        next: 710071131,
                    },
                    {
                        id: 710071091,
                        content: "谢谢{性别：大哥哥|大姐姐}！你真是个大好人！",
                        npc: 818070,
                        next: 71007110,
                    },
                    {
                        id: 710071131,
                        content: "唔……好吧，谢谢……",
                        npc: 818070,
                        next: 71007114,
                    },
                ],
            },
            {
                id: "1750166175140636985",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007110,
                        content: "回来了回来了，吃的在哪呢？",
                        npc: 818069,
                        next: 71007111,
                    },
                    {
                        id: 71007111,
                        content: "（你和男子说明了事情经过……）",
                        npc: 800006,
                        next: 71007112,
                    },
                    {
                        id: 71007112,
                        content: "这样啊，那就没办法了，毕竟那孩子比我更需要嘛，辛苦你啦。",
                        npc: 818069,
                    },
                ],
            },
            {
                id: "1750166188974637494",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007114,
                        content: "回来了回来了，吃的在哪呢？",
                        npc: 818069,
                        next: 71007115,
                    },
                    {
                        id: 71007115,
                        content: "给你。",
                        npc: 100001,
                        next: 71007116,
                    },
                    {
                        id: 71007116,
                        content: "嗯～真香！辛苦你啦，来来来，这是你的报酬。",
                        npc: 818069,
                    },
                ],
            },
        ],
    },
    {
        id: 108944,
        name: "跑腿代购",
        level: [50, 59],
        regionId: 1041,
        subRegionId: 104109,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1750165607615633585",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007101,
                        content: "唉……怎么时间刚好都撞一块了呢……",
                        npc: 818069,
                        next: 71007103,
                    },
                ],
            },
            {
                id: "1750165628019634064",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007103,
                        content: "诶，这位朋友来得正好，你能帮我去那边排块核桃酥吗？",
                        npc: 818069,
                        next: 71007104,
                    },
                    {
                        id: 71007104,
                        content: "我等会还约了其他人谈生意，实在没空去排队了。",
                        npc: 818069,
                        options: [
                            {
                                id: 710071041,
                                content: "（接受。）",
                                next: 71007105,
                            },
                            {
                                id: 710071042,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71007105,
                        content: "谢了，那我先走一步。",
                        npc: 818069,
                        next: 71007106,
                    },
                ],
            },
            {
                id: "1750169293149641029",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007106,
                        content: "（一段时间后……）",
                        npc: 800006,
                        next: 710071061,
                    },
                ],
            },
            {
                id: "17576477242633840416",
                type: "TalkNode",
                name: "对话节点",
                next: ["1750166084867635616"],
                dialogues: [
                    {
                        id: 710071061,
                        content: "你运气真好，这是最后一份特色小吃了请拿好",
                        npc: 818071,
                        next: 71007108,
                    },
                ],
            },
            {
                id: "1750169360732642308",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007107,
                        content: "（刚买好小吃，你就看到身后有个孩子眼巴巴地看着你。）",
                        npc: 800006,
                        next: 71007108,
                    },
                ],
            },
            {
                id: "1750166084867635616",
                type: "TalkNode",
                name: "对话节点",
                next: ["1750166188974637494"],
                dialogues: [
                    {
                        id: 71007108,
                        content: "那个……我能用这些钱买你的核桃酥吗？我妈妈很喜欢这家的核桃酥，但她最近生病了，我想给她带一份回家……",
                        npc: 818070,
                        options: [
                            {
                                id: 710071081,
                                content: "（接受。）",
                                next: 71007109,
                                impr: [1041, "Empathy", 1],
                            },
                            {
                                id: 710071082,
                                content: "（拒绝。）",
                                next: 71007113,
                                impr: [1041, "Morality", 1],
                            },
                        ],
                    },
                    {
                        id: 71007109,
                        content: "既然这样，那还是让给你吧，希望你妈妈能快点好起来。",
                        npc: 100001,
                        next: 710071091,
                    },
                    {
                        id: 71007113,
                        content: "抱歉，我答应了别人。",
                        npc: 100001,
                        next: 710071131,
                    },
                    {
                        id: 710071091,
                        content: "谢谢{性别：大哥哥|大姐姐}！你真是个大好人！",
                        npc: 818070,
                        next: 71007110,
                    },
                    {
                        id: 710071131,
                        content: "唔……好吧，谢谢……",
                        npc: 818070,
                        next: 71007114,
                    },
                ],
            },
            {
                id: "1750166175140636985",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007110,
                        content: "回来了回来了，吃的在哪呢？",
                        npc: 818069,
                        next: 71007111,
                    },
                    {
                        id: 71007111,
                        content: "（你和男子说明了事情经过……）",
                        npc: 800006,
                        next: 71007112,
                    },
                    {
                        id: 71007112,
                        content: "这样啊，那就没办法了，毕竟那孩子比我更需要嘛，辛苦你啦。",
                        npc: 818069,
                    },
                ],
            },
            {
                id: "1750166188974637494",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007114,
                        content: "回来了回来了，吃的在哪呢？",
                        npc: 818069,
                        next: 71007115,
                    },
                    {
                        id: 71007115,
                        content: "给你。",
                        npc: 100001,
                        next: 71007116,
                    },
                    {
                        id: 71007116,
                        content: "嗯～真香！辛苦你啦，来来来，这是你的报酬。",
                        npc: 818069,
                    },
                ],
            },
        ],
    },
    {
        id: 109024,
        name: "交织的心意",
        level: [50, 59],
        regionId: 1041,
        subRegionId: 104110,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1750151792109307",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007001,
                        content: "这可怎生是好？白龙神君，派个人来帮帮我吧！",
                        npc: 818066,
                        next: 71007002,
                    },
                ],
            },
            {
                id: "1750151806482874",
                type: "TalkNode",
                name: "请求买礼物对话",
                dialogues: [
                    {
                        id: 71007002,
                        content: "发生什么了？",
                        npc: 100001,
                        next: 71007003,
                    },
                    {
                        id: 71007003,
                        content: "我与心上人约在此处相见，但场地尚未布置妥当。阁下可以替我跑一趟，买件礼物回来吗？",
                        npc: 818066,
                        options: [
                            {
                                id: 710070031,
                                content: "（接受。）",
                                next: 71007004,
                            },
                            {
                                id: 710070032,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71007004,
                        content: "那可真是有劳了！啊对了，我那心上人对花过敏，切记不要买含花的礼物啊。",
                        npc: 818066,
                        next: 71007005,
                    },
                ],
            },
            {
                id: "17501519802312104",
                type: "TalkNode",
                name: "小贩对话",
                next: ["17575778221273201731", "17501639742181275563"],
                dialogues: [
                    {
                        id: 71007005,
                        content: "你好，我想挑一件适合送人的礼物。",
                        npc: 100001,
                        next: 71007006,
                    },
                    {
                        id: 71007006,
                        content: "好嘞，现在这三款礼物最受欢迎，且听我慢慢道来。",
                        npc: 818067,
                        next: 71007007,
                    },
                    {
                        id: 71007007,
                        content: "第一件是蒹葭浦现采的告苍花，还带着清晨的露珠，送女孩子准没错。",
                        npc: 818067,
                        next: 71007008,
                    },
                    {
                        id: 71007008,
                        content: "第二件是机枢派名家打磨的青铜吊坠，做功考究，细节精致。",
                        npc: 818067,
                        next: 71007009,
                    },
                    {
                        id: 71007009,
                        content: "第三件是悬衡派特制的白龙神君造型摆件，技艺精湛，栩栩如生。",
                        npc: 818067,
                        next: 71007010,
                    },
                    {
                        id: 71007010,
                        content: "你想要哪一件呀？",
                        npc: 818067,
                        options: [
                            {
                                id: 710070101,
                                content: "告苍花。",
                                next: 71007011,
                                impr: [1041, "Chaos", 1],
                            },
                            {
                                id: 710070102,
                                content: "青铜吊坠。",
                                next: 71007011,
                                impr: [1041, "Empathy", 1],
                            },
                            {
                                id: 710070103,
                                content: "白龙摆件。",
                                next: 71007011,
                                impr: [1041, "Morality", 1],
                            },
                        ],
                    },
                    {
                        id: 71007011,
                        content: "好嘞，这就给您包装好。下次再来哈。",
                        npc: 818067,
                        next: 71007012,
                    },
                ],
            },
            {
                id: "17501520042682862",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007012,
                        content: "礼物来了，快打开看看合不合你心意！",
                        npc: 818066,
                        next: 71007013,
                    },
                    {
                        id: 71007013,
                        content: "阿嚏！阿……阿嚏……怎，怎么有花……我感觉有点不舒服，要……喘不上气了……",
                        npc: 818068,
                        next: 71007014,
                    },
                    {
                        id: 71007014,
                        content: "（男子见状立马背起他的心上人求医，留你一个人在原地。）",
                        npc: 800006,
                        next: 71007015,
                    },
                    {
                        id: 71007015,
                        content: "（这里的事已经处理完毕，可以离开了。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17575778221273201731",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007016,
                        content: "礼物拿来了，快拆开来看看合不合你心意！",
                        npc: 818066,
                        next: 71007017,
                    },
                    {
                        id: 71007017,
                        content: "谢谢，只要是你为我准备的，我都喜欢！",
                        npc: 818068,
                        next: 71007018,
                    },
                    {
                        id: 71007018,
                        content: "（男子看着心上人脸上幸福的表情，悄悄向你竖起了大拇指。）",
                        npc: 800006,
                        next: 71007019,
                    },
                    {
                        id: 71007019,
                        content: "（这里的事已经处理完毕，可以离开了。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17501639742181275563",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007016,
                        content: "礼物拿来了，快拆开来看看合不合你心意！",
                        npc: 818066,
                        next: 71007017,
                    },
                    {
                        id: 71007017,
                        content: "谢谢，只要是你为我准备的，我都喜欢！",
                        npc: 818068,
                        next: 71007018,
                    },
                    {
                        id: 71007018,
                        content: "（男子看着心上人脸上幸福的表情，悄悄向你竖起了大拇指。）",
                        npc: 800006,
                        next: 71007019,
                    },
                    {
                        id: 71007019,
                        content: "（这里的事已经处理完毕，可以离开了。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 109025,
        name: "交织的心意",
        level: [60, 65],
        regionId: 1041,
        subRegionId: 104110,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1750151792109307",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007001,
                        content: "这可怎生是好？白龙神君，派个人来帮帮我吧！",
                        npc: 818066,
                        next: 71007002,
                    },
                ],
            },
            {
                id: "1750151806482874",
                type: "TalkNode",
                name: "请求买礼物对话",
                dialogues: [
                    {
                        id: 71007002,
                        content: "发生什么了？",
                        npc: 100001,
                        next: 71007003,
                    },
                    {
                        id: 71007003,
                        content: "我与心上人约在此处相见，但场地尚未布置妥当。阁下可以替我跑一趟，买件礼物回来吗？",
                        npc: 818066,
                        options: [
                            {
                                id: 710070031,
                                content: "（接受。）",
                                next: 71007004,
                            },
                            {
                                id: 710070032,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71007004,
                        content: "那可真是有劳了！啊对了，我那心上人对花过敏，切记不要买含花的礼物啊。",
                        npc: 818066,
                        next: 71007005,
                    },
                ],
            },
            {
                id: "17501519802312104",
                type: "TalkNode",
                name: "小贩对话",
                next: ["17575778221273201731", "17501639742181275563"],
                dialogues: [
                    {
                        id: 71007005,
                        content: "你好，我想挑一件适合送人的礼物。",
                        npc: 100001,
                        next: 71007006,
                    },
                    {
                        id: 71007006,
                        content: "好嘞，现在这三款礼物最受欢迎，且听我慢慢道来。",
                        npc: 818067,
                        next: 71007007,
                    },
                    {
                        id: 71007007,
                        content: "第一件是蒹葭浦现采的告苍花，还带着清晨的露珠，送女孩子准没错。",
                        npc: 818067,
                        next: 71007008,
                    },
                    {
                        id: 71007008,
                        content: "第二件是机枢派名家打磨的青铜吊坠，做功考究，细节精致。",
                        npc: 818067,
                        next: 71007009,
                    },
                    {
                        id: 71007009,
                        content: "第三件是悬衡派特制的白龙神君造型摆件，技艺精湛，栩栩如生。",
                        npc: 818067,
                        next: 71007010,
                    },
                    {
                        id: 71007010,
                        content: "你想要哪一件呀？",
                        npc: 818067,
                        options: [
                            {
                                id: 710070101,
                                content: "告苍花。",
                                next: 71007011,
                                impr: [1041, "Chaos", 1],
                            },
                            {
                                id: 710070102,
                                content: "青铜吊坠。",
                                next: 71007011,
                                impr: [1041, "Empathy", 1],
                            },
                            {
                                id: 710070103,
                                content: "白龙摆件。",
                                next: 71007011,
                                impr: [1041, "Morality", 1],
                            },
                        ],
                    },
                    {
                        id: 71007011,
                        content: "好嘞，这就给您包装好。下次再来哈。",
                        npc: 818067,
                        next: 71007012,
                    },
                ],
            },
            {
                id: "17501520042682862",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007012,
                        content: "礼物来了，快打开看看合不合你心意！",
                        npc: 818066,
                        next: 71007013,
                    },
                    {
                        id: 71007013,
                        content: "阿嚏！阿……阿嚏……怎，怎么有花……我感觉有点不舒服，要……喘不上气了……",
                        npc: 818068,
                        next: 71007014,
                    },
                    {
                        id: 71007014,
                        content: "（男子见状立马背起他的心上人求医，留你一个人在原地。）",
                        npc: 800006,
                        next: 71007015,
                    },
                    {
                        id: 71007015,
                        content: "（这里的事已经处理完毕，可以离开了。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17575778221273201731",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007016,
                        content: "礼物拿来了，快拆开来看看合不合你心意！",
                        npc: 818066,
                        next: 71007017,
                    },
                    {
                        id: 71007017,
                        content: "谢谢，只要是你为我准备的，我都喜欢！",
                        npc: 818068,
                        next: 71007018,
                    },
                    {
                        id: 71007018,
                        content: "（男子看着心上人脸上幸福的表情，悄悄向你竖起了大拇指。）",
                        npc: 800006,
                        next: 71007019,
                    },
                    {
                        id: 71007019,
                        content: "（这里的事已经处理完毕，可以离开了。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17501639742181275563",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007016,
                        content: "礼物拿来了，快拆开来看看合不合你心意！",
                        npc: 818066,
                        next: 71007017,
                    },
                    {
                        id: 71007017,
                        content: "谢谢，只要是你为我准备的，我都喜欢！",
                        npc: 818068,
                        next: 71007018,
                    },
                    {
                        id: 71007018,
                        content: "（男子看着心上人脸上幸福的表情，悄悄向你竖起了大拇指。）",
                        npc: 800006,
                        next: 71007019,
                    },
                    {
                        id: 71007019,
                        content: "（这里的事已经处理完毕，可以离开了。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 109044,
        name: "交织的心意",
        level: [50, 59],
        regionId: 1041,
        subRegionId: 104110,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1750151792109307",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007001,
                        content: "这可怎生是好？白龙神君，派个人来帮帮我吧！",
                        npc: 818066,
                        next: 71007002,
                    },
                ],
            },
            {
                id: "1750151806482874",
                type: "TalkNode",
                name: "请求买礼物对话",
                dialogues: [
                    {
                        id: 71007002,
                        content: "发生什么了？",
                        npc: 100001,
                        next: 71007003,
                    },
                    {
                        id: 71007003,
                        content: "我与心上人约在此处相见，但场地尚未布置妥当。阁下可以替我跑一趟，买件礼物回来吗？",
                        npc: 818066,
                        options: [
                            {
                                id: 710070031,
                                content: "（接受。）",
                                next: 71007004,
                            },
                            {
                                id: 710070032,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71007004,
                        content: "那可真是有劳了！啊对了，我那心上人对花过敏，切记不要买含花的礼物啊。",
                        npc: 818066,
                        next: 71007005,
                    },
                ],
            },
            {
                id: "17501519802312104",
                type: "TalkNode",
                name: "小贩对话",
                next: ["17575778221273201731", "17501639742181275563"],
                dialogues: [
                    {
                        id: 71007005,
                        content: "你好，我想挑一件适合送人的礼物。",
                        npc: 100001,
                        next: 71007006,
                    },
                    {
                        id: 71007006,
                        content: "好嘞，现在这三款礼物最受欢迎，且听我慢慢道来。",
                        npc: 818067,
                        next: 71007007,
                    },
                    {
                        id: 71007007,
                        content: "第一件是蒹葭浦现采的告苍花，还带着清晨的露珠，送女孩子准没错。",
                        npc: 818067,
                        next: 71007008,
                    },
                    {
                        id: 71007008,
                        content: "第二件是机枢派名家打磨的青铜吊坠，做功考究，细节精致。",
                        npc: 818067,
                        next: 71007009,
                    },
                    {
                        id: 71007009,
                        content: "第三件是悬衡派特制的白龙神君造型摆件，技艺精湛，栩栩如生。",
                        npc: 818067,
                        next: 71007010,
                    },
                    {
                        id: 71007010,
                        content: "你想要哪一件呀？",
                        npc: 818067,
                        options: [
                            {
                                id: 710070101,
                                content: "告苍花。",
                                next: 71007011,
                                impr: [1041, "Chaos", 1],
                            },
                            {
                                id: 710070102,
                                content: "青铜吊坠。",
                                next: 71007011,
                                impr: [1041, "Empathy", 1],
                            },
                            {
                                id: 710070103,
                                content: "白龙摆件。",
                                next: 71007011,
                                impr: [1041, "Morality", 1],
                            },
                        ],
                    },
                    {
                        id: 71007011,
                        content: "好嘞，这就给您包装好。下次再来哈。",
                        npc: 818067,
                        next: 71007012,
                    },
                ],
            },
            {
                id: "17501520042682862",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007012,
                        content: "礼物来了，快打开看看合不合你心意！",
                        npc: 818066,
                        next: 71007013,
                    },
                    {
                        id: 71007013,
                        content: "阿嚏！阿……阿嚏……怎，怎么有花……我感觉有点不舒服，要……喘不上气了……",
                        npc: 818068,
                        next: 71007014,
                    },
                    {
                        id: 71007014,
                        content: "（男子见状立马背起他的心上人求医，留你一个人在原地。）",
                        npc: 800006,
                        next: 71007015,
                    },
                    {
                        id: 71007015,
                        content: "（这里的事已经处理完毕，可以离开了。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17575778221273201731",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007016,
                        content: "礼物拿来了，快拆开来看看合不合你心意！",
                        npc: 818066,
                        next: 71007017,
                    },
                    {
                        id: 71007017,
                        content: "谢谢，只要是你为我准备的，我都喜欢！",
                        npc: 818068,
                        next: 71007018,
                    },
                    {
                        id: 71007018,
                        content: "（男子看着心上人脸上幸福的表情，悄悄向你竖起了大拇指。）",
                        npc: 800006,
                        next: 71007019,
                    },
                    {
                        id: 71007019,
                        content: "（这里的事已经处理完毕，可以离开了。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17501639742181275563",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007016,
                        content: "礼物拿来了，快拆开来看看合不合你心意！",
                        npc: 818066,
                        next: 71007017,
                    },
                    {
                        id: 71007017,
                        content: "谢谢，只要是你为我准备的，我都喜欢！",
                        npc: 818068,
                        next: 71007018,
                    },
                    {
                        id: 71007018,
                        content: "（男子看着心上人脸上幸福的表情，悄悄向你竖起了大拇指。）",
                        npc: 800006,
                        next: 71007019,
                    },
                    {
                        id: 71007019,
                        content: "（这里的事已经处理完毕，可以离开了。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 109045,
        name: "交织的心意",
        level: [60, 65],
        regionId: 1041,
        subRegionId: 104110,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1750151792109307",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007001,
                        content: "这可怎生是好？白龙神君，派个人来帮帮我吧！",
                        npc: 818066,
                        next: 71007002,
                    },
                ],
            },
            {
                id: "1750151806482874",
                type: "TalkNode",
                name: "请求买礼物对话",
                dialogues: [
                    {
                        id: 71007002,
                        content: "发生什么了？",
                        npc: 100001,
                        next: 71007003,
                    },
                    {
                        id: 71007003,
                        content: "我与心上人约在此处相见，但场地尚未布置妥当。阁下可以替我跑一趟，买件礼物回来吗？",
                        npc: 818066,
                        options: [
                            {
                                id: 710070031,
                                content: "（接受。）",
                                next: 71007004,
                            },
                            {
                                id: 710070032,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71007004,
                        content: "那可真是有劳了！啊对了，我那心上人对花过敏，切记不要买含花的礼物啊。",
                        npc: 818066,
                        next: 71007005,
                    },
                ],
            },
            {
                id: "17501519802312104",
                type: "TalkNode",
                name: "小贩对话",
                next: ["17575778221273201731", "17501639742181275563"],
                dialogues: [
                    {
                        id: 71007005,
                        content: "你好，我想挑一件适合送人的礼物。",
                        npc: 100001,
                        next: 71007006,
                    },
                    {
                        id: 71007006,
                        content: "好嘞，现在这三款礼物最受欢迎，且听我慢慢道来。",
                        npc: 818067,
                        next: 71007007,
                    },
                    {
                        id: 71007007,
                        content: "第一件是蒹葭浦现采的告苍花，还带着清晨的露珠，送女孩子准没错。",
                        npc: 818067,
                        next: 71007008,
                    },
                    {
                        id: 71007008,
                        content: "第二件是机枢派名家打磨的青铜吊坠，做功考究，细节精致。",
                        npc: 818067,
                        next: 71007009,
                    },
                    {
                        id: 71007009,
                        content: "第三件是悬衡派特制的白龙神君造型摆件，技艺精湛，栩栩如生。",
                        npc: 818067,
                        next: 71007010,
                    },
                    {
                        id: 71007010,
                        content: "你想要哪一件呀？",
                        npc: 818067,
                        options: [
                            {
                                id: 710070101,
                                content: "告苍花。",
                                next: 71007011,
                                impr: [1041, "Chaos", 1],
                            },
                            {
                                id: 710070102,
                                content: "青铜吊坠。",
                                next: 71007011,
                                impr: [1041, "Empathy", 1],
                            },
                            {
                                id: 710070103,
                                content: "白龙摆件。",
                                next: 71007011,
                                impr: [1041, "Morality", 1],
                            },
                        ],
                    },
                    {
                        id: 71007011,
                        content: "好嘞，这就给您包装好。下次再来哈。",
                        npc: 818067,
                        next: 71007012,
                    },
                ],
            },
            {
                id: "17501520042682862",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007012,
                        content: "礼物来了，快打开看看合不合你心意！",
                        npc: 818066,
                        next: 71007013,
                    },
                    {
                        id: 71007013,
                        content: "阿嚏！阿……阿嚏……怎，怎么有花……我感觉有点不舒服，要……喘不上气了……",
                        npc: 818068,
                        next: 71007014,
                    },
                    {
                        id: 71007014,
                        content: "（男子见状立马背起他的心上人求医，留你一个人在原地。）",
                        npc: 800006,
                        next: 71007015,
                    },
                    {
                        id: 71007015,
                        content: "（这里的事已经处理完毕，可以离开了。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17575778221273201731",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007016,
                        content: "礼物拿来了，快拆开来看看合不合你心意！",
                        npc: 818066,
                        next: 71007017,
                    },
                    {
                        id: 71007017,
                        content: "谢谢，只要是你为我准备的，我都喜欢！",
                        npc: 818068,
                        next: 71007018,
                    },
                    {
                        id: 71007018,
                        content: "（男子看着心上人脸上幸福的表情，悄悄向你竖起了大拇指。）",
                        npc: 800006,
                        next: 71007019,
                    },
                    {
                        id: 71007019,
                        content: "（这里的事已经处理完毕，可以离开了。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17501639742181275563",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007016,
                        content: "礼物拿来了，快拆开来看看合不合你心意！",
                        npc: 818066,
                        next: 71007017,
                    },
                    {
                        id: 71007017,
                        content: "谢谢，只要是你为我准备的，我都喜欢！",
                        npc: 818068,
                        next: 71007018,
                    },
                    {
                        id: 71007018,
                        content: "（男子看着心上人脸上幸福的表情，悄悄向你竖起了大拇指。）",
                        npc: 800006,
                        next: 71007019,
                    },
                    {
                        id: 71007019,
                        content: "（这里的事已经处理完毕，可以离开了。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 109054,
        name: "交织的心意",
        level: [50, 59],
        regionId: 1041,
        subRegionId: 104110,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1750151792109307",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007001,
                        content: "这可怎生是好？白龙神君，派个人来帮帮我吧！",
                        npc: 818066,
                        next: 71007002,
                    },
                ],
            },
            {
                id: "1750151806482874",
                type: "TalkNode",
                name: "请求买礼物对话",
                dialogues: [
                    {
                        id: 71007002,
                        content: "发生什么了？",
                        npc: 100001,
                        next: 71007003,
                    },
                    {
                        id: 71007003,
                        content: "我与心上人约在此处相见，但场地尚未布置妥当。阁下可以替我跑一趟，买件礼物回来吗？",
                        npc: 818066,
                        options: [
                            {
                                id: 710070031,
                                content: "（接受。）",
                                next: 71007004,
                            },
                            {
                                id: 710070032,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71007004,
                        content: "那可真是有劳了！啊对了，我那心上人对花过敏，切记不要买含花的礼物啊。",
                        npc: 818066,
                        next: 71007005,
                    },
                ],
            },
            {
                id: "17501519802312104",
                type: "TalkNode",
                name: "小贩对话",
                next: ["17575778221273201731", "17501639742181275563"],
                dialogues: [
                    {
                        id: 71007005,
                        content: "你好，我想挑一件适合送人的礼物。",
                        npc: 100001,
                        next: 71007006,
                    },
                    {
                        id: 71007006,
                        content: "好嘞，现在这三款礼物最受欢迎，且听我慢慢道来。",
                        npc: 818067,
                        next: 71007007,
                    },
                    {
                        id: 71007007,
                        content: "第一件是蒹葭浦现采的告苍花，还带着清晨的露珠，送女孩子准没错。",
                        npc: 818067,
                        next: 71007008,
                    },
                    {
                        id: 71007008,
                        content: "第二件是机枢派名家打磨的青铜吊坠，做功考究，细节精致。",
                        npc: 818067,
                        next: 71007009,
                    },
                    {
                        id: 71007009,
                        content: "第三件是悬衡派特制的白龙神君造型摆件，技艺精湛，栩栩如生。",
                        npc: 818067,
                        next: 71007010,
                    },
                    {
                        id: 71007010,
                        content: "你想要哪一件呀？",
                        npc: 818067,
                        options: [
                            {
                                id: 710070101,
                                content: "告苍花。",
                                next: 71007011,
                                impr: [1041, "Chaos", 1],
                            },
                            {
                                id: 710070102,
                                content: "青铜吊坠。",
                                next: 71007011,
                                impr: [1041, "Empathy", 1],
                            },
                            {
                                id: 710070103,
                                content: "白龙摆件。",
                                next: 71007011,
                                impr: [1041, "Morality", 1],
                            },
                        ],
                    },
                    {
                        id: 71007011,
                        content: "好嘞，这就给您包装好。下次再来哈。",
                        npc: 818067,
                        next: 71007012,
                    },
                ],
            },
            {
                id: "17501520042682862",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007012,
                        content: "礼物来了，快打开看看合不合你心意！",
                        npc: 818066,
                        next: 71007013,
                    },
                    {
                        id: 71007013,
                        content: "阿嚏！阿……阿嚏……怎，怎么有花……我感觉有点不舒服，要……喘不上气了……",
                        npc: 818068,
                        next: 71007014,
                    },
                    {
                        id: 71007014,
                        content: "（男子见状立马背起他的心上人求医，留你一个人在原地。）",
                        npc: 800006,
                        next: 71007015,
                    },
                    {
                        id: 71007015,
                        content: "（这里的事已经处理完毕，可以离开了。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17575778221273201731",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007016,
                        content: "礼物拿来了，快拆开来看看合不合你心意！",
                        npc: 818066,
                        next: 71007017,
                    },
                    {
                        id: 71007017,
                        content: "谢谢，只要是你为我准备的，我都喜欢！",
                        npc: 818068,
                        next: 71007018,
                    },
                    {
                        id: 71007018,
                        content: "（男子看着心上人脸上幸福的表情，悄悄向你竖起了大拇指。）",
                        npc: 800006,
                        next: 71007019,
                    },
                    {
                        id: 71007019,
                        content: "（这里的事已经处理完毕，可以离开了。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17501639742181275563",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007016,
                        content: "礼物拿来了，快拆开来看看合不合你心意！",
                        npc: 818066,
                        next: 71007017,
                    },
                    {
                        id: 71007017,
                        content: "谢谢，只要是你为我准备的，我都喜欢！",
                        npc: 818068,
                        next: 71007018,
                    },
                    {
                        id: 71007018,
                        content: "（男子看着心上人脸上幸福的表情，悄悄向你竖起了大拇指。）",
                        npc: 800006,
                        next: 71007019,
                    },
                    {
                        id: 71007019,
                        content: "（这里的事已经处理完毕，可以离开了。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 109055,
        name: "交织的心意",
        level: [60, 65],
        regionId: 1041,
        subRegionId: 104110,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1750151792109307",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007001,
                        content: "这可怎生是好？白龙神君，派个人来帮帮我吧！",
                        npc: 818066,
                        next: 71007002,
                    },
                ],
            },
            {
                id: "1750151806482874",
                type: "TalkNode",
                name: "请求买礼物对话",
                dialogues: [
                    {
                        id: 71007002,
                        content: "发生什么了？",
                        npc: 100001,
                        next: 71007003,
                    },
                    {
                        id: 71007003,
                        content: "我与心上人约在此处相见，但场地尚未布置妥当。阁下可以替我跑一趟，买件礼物回来吗？",
                        npc: 818066,
                        options: [
                            {
                                id: 710070031,
                                content: "（接受。）",
                                next: 71007004,
                            },
                            {
                                id: 710070032,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71007004,
                        content: "那可真是有劳了！啊对了，我那心上人对花过敏，切记不要买含花的礼物啊。",
                        npc: 818066,
                        next: 71007005,
                    },
                ],
            },
            {
                id: "17501519802312104",
                type: "TalkNode",
                name: "小贩对话",
                next: ["17575778221273201731", "17501639742181275563"],
                dialogues: [
                    {
                        id: 71007005,
                        content: "你好，我想挑一件适合送人的礼物。",
                        npc: 100001,
                        next: 71007006,
                    },
                    {
                        id: 71007006,
                        content: "好嘞，现在这三款礼物最受欢迎，且听我慢慢道来。",
                        npc: 818067,
                        next: 71007007,
                    },
                    {
                        id: 71007007,
                        content: "第一件是蒹葭浦现采的告苍花，还带着清晨的露珠，送女孩子准没错。",
                        npc: 818067,
                        next: 71007008,
                    },
                    {
                        id: 71007008,
                        content: "第二件是机枢派名家打磨的青铜吊坠，做功考究，细节精致。",
                        npc: 818067,
                        next: 71007009,
                    },
                    {
                        id: 71007009,
                        content: "第三件是悬衡派特制的白龙神君造型摆件，技艺精湛，栩栩如生。",
                        npc: 818067,
                        next: 71007010,
                    },
                    {
                        id: 71007010,
                        content: "你想要哪一件呀？",
                        npc: 818067,
                        options: [
                            {
                                id: 710070101,
                                content: "告苍花。",
                                next: 71007011,
                                impr: [1041, "Chaos", 1],
                            },
                            {
                                id: 710070102,
                                content: "青铜吊坠。",
                                next: 71007011,
                                impr: [1041, "Empathy", 1],
                            },
                            {
                                id: 710070103,
                                content: "白龙摆件。",
                                next: 71007011,
                                impr: [1041, "Morality", 1],
                            },
                        ],
                    },
                    {
                        id: 71007011,
                        content: "好嘞，这就给您包装好。下次再来哈。",
                        npc: 818067,
                        next: 71007012,
                    },
                ],
            },
            {
                id: "17501520042682862",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007012,
                        content: "礼物来了，快打开看看合不合你心意！",
                        npc: 818066,
                        next: 71007013,
                    },
                    {
                        id: 71007013,
                        content: "阿嚏！阿……阿嚏……怎，怎么有花……我感觉有点不舒服，要……喘不上气了……",
                        npc: 818068,
                        next: 71007014,
                    },
                    {
                        id: 71007014,
                        content: "（男子见状立马背起他的心上人求医，留你一个人在原地。）",
                        npc: 800006,
                        next: 71007015,
                    },
                    {
                        id: 71007015,
                        content: "（这里的事已经处理完毕，可以离开了。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17575778221273201731",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007016,
                        content: "礼物拿来了，快拆开来看看合不合你心意！",
                        npc: 818066,
                        next: 71007017,
                    },
                    {
                        id: 71007017,
                        content: "谢谢，只要是你为我准备的，我都喜欢！",
                        npc: 818068,
                        next: 71007018,
                    },
                    {
                        id: 71007018,
                        content: "（男子看着心上人脸上幸福的表情，悄悄向你竖起了大拇指。）",
                        npc: 800006,
                        next: 71007019,
                    },
                    {
                        id: 71007019,
                        content: "（这里的事已经处理完毕，可以离开了。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17501639742181275563",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007016,
                        content: "礼物拿来了，快拆开来看看合不合你心意！",
                        npc: 818066,
                        next: 71007017,
                    },
                    {
                        id: 71007017,
                        content: "谢谢，只要是你为我准备的，我都喜欢！",
                        npc: 818068,
                        next: 71007018,
                    },
                    {
                        id: 71007018,
                        content: "（男子看着心上人脸上幸福的表情，悄悄向你竖起了大拇指。）",
                        npc: 800006,
                        next: 71007019,
                    },
                    {
                        id: 71007019,
                        content: "（这里的事已经处理完毕，可以离开了。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 109113,
        name: "难以取舍",
        level: [40, 49],
        regionId: 1041,
        subRegionId: 104108,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1750244194350490",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007201,
                        content: "嗯……到底选哪家好呢……",
                        npc: 818074,
                        next: 71007203,
                    },
                ],
            },
            {
                id: "1750244197345693",
                type: "TalkNode",
                name: "对话节点",
                next: ["17502460237112933"],
                dialogues: [
                    {
                        id: 71007203,
                        content: "啊呀，这位朋友来得正好。我每次买东西都拿不定主意，能拜托你帮我看看，给点建议吗？",
                        npc: 818074,
                        options: [
                            {
                                id: 710072031,
                                content: "（接受。）",
                                next: 71007204,
                            },
                            {
                                id: 710072032,
                                content: "（拒绝。）",
                                next: 71007206,
                            },
                        ],
                    },
                    {
                        id: 71007204,
                        content: "万分感谢，我就在这儿等你。",
                        npc: 818074,
                        next: 71007206,
                    },
                ],
            },
            {
                id: "17502460202332776",
                type: "TalkNode",
                name: "对话节点",
                next: ["17502461152704199", "17502461190554383"],
                dialogues: [
                    {
                        id: 71007206,
                        content: "我这可都是从原产地千里迢迢运输回来的高档货，更有百年春官方认证。虽说贵了些，但一分钱绝对对得起一分货。",
                        npc: 818072,
                        next: 71007209,
                    },
                ],
            },
            {
                id: "17502460237112933",
                type: "TalkNode",
                name: "对话节点",
                next: ["17502461152704199"],
                dialogues: [
                    {
                        id: 71007207,
                        content: "都是日用品，高不高档有啥区别。还是我这便宜实惠的性价比更高，你说对吧。",
                        npc: 818073,
                        next: 71007209,
                    },
                ],
            },
            {
                id: "17502461190554383",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007208,
                        content: "（仔细确认之后，你已经做出了选择。现在去给那位纠结的旅人提供你的宝贵建议吧。）",
                        npc: 800006,
                        next: 71007209,
                    },
                ],
            },
            {
                id: "17502461152704199",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007209,
                        content: "怎么样，你觉得哪家卖的更好？",
                        npc: 818074,
                        options: [
                            {
                                id: 710072091,
                                content: "织星客卖的质量更好，买他的比较有保障。",
                                next: 71007210,
                                impr: [1041, "Morality", 1],
                            },
                            {
                                id: 710072092,
                                content: "黑市商人价格便宜，买他的更实惠。",
                                next: 71007210,
                                impr: [1041, "Benefit", 1],
                            },
                        ],
                    },
                    {
                        id: 71007210,
                        content: "好，那就买他的吧！谢谢你！",
                        npc: 818074,
                    },
                ],
            },
        ],
    },
    {
        id: 109114,
        name: "难以取舍",
        level: [50, 59],
        regionId: 1041,
        subRegionId: 104108,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1750244194350490",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007201,
                        content: "嗯……到底选哪家好呢……",
                        npc: 818074,
                        next: 71007203,
                    },
                ],
            },
            {
                id: "1750244197345693",
                type: "TalkNode",
                name: "对话节点",
                next: ["17502460237112933"],
                dialogues: [
                    {
                        id: 71007203,
                        content: "啊呀，这位朋友来得正好。我每次买东西都拿不定主意，能拜托你帮我看看，给点建议吗？",
                        npc: 818074,
                        options: [
                            {
                                id: 710072031,
                                content: "（接受。）",
                                next: 71007204,
                            },
                            {
                                id: 710072032,
                                content: "（拒绝。）",
                                next: 71007206,
                            },
                        ],
                    },
                    {
                        id: 71007204,
                        content: "万分感谢，我就在这儿等你。",
                        npc: 818074,
                        next: 71007206,
                    },
                ],
            },
            {
                id: "17502460202332776",
                type: "TalkNode",
                name: "对话节点",
                next: ["17502461152704199", "17502461190554383"],
                dialogues: [
                    {
                        id: 71007206,
                        content: "我这可都是从原产地千里迢迢运输回来的高档货，更有百年春官方认证。虽说贵了些，但一分钱绝对对得起一分货。",
                        npc: 818072,
                        next: 71007209,
                    },
                ],
            },
            {
                id: "17502460237112933",
                type: "TalkNode",
                name: "对话节点",
                next: ["17502461152704199"],
                dialogues: [
                    {
                        id: 71007207,
                        content: "都是日用品，高不高档有啥区别。还是我这便宜实惠的性价比更高，你说对吧。",
                        npc: 818073,
                        next: 71007209,
                    },
                ],
            },
            {
                id: "17502461190554383",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007208,
                        content: "（仔细确认之后，你已经做出了选择。现在去给那位纠结的旅人提供你的宝贵建议吧。）",
                        npc: 800006,
                        next: 71007209,
                    },
                ],
            },
            {
                id: "17502461152704199",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007209,
                        content: "怎么样，你觉得哪家卖的更好？",
                        npc: 818074,
                        options: [
                            {
                                id: 710072091,
                                content: "织星客卖的质量更好，买他的比较有保障。",
                                next: 71007210,
                                impr: [1041, "Morality", 1],
                            },
                            {
                                id: 710072092,
                                content: "黑市商人价格便宜，买他的更实惠。",
                                next: 71007210,
                                impr: [1041, "Benefit", 1],
                            },
                        ],
                    },
                    {
                        id: 71007210,
                        content: "好，那就买他的吧！谢谢你！",
                        npc: 818074,
                    },
                ],
            },
        ],
    },
    {
        id: 109123,
        name: "难以取舍",
        level: [40, 49],
        regionId: 1041,
        subRegionId: 104108,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1750244194350490",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007201,
                        content: "嗯……到底选哪家好呢……",
                        npc: 818074,
                        next: 71007203,
                    },
                ],
            },
            {
                id: "1750244197345693",
                type: "TalkNode",
                name: "对话节点",
                next: ["17502460237112933"],
                dialogues: [
                    {
                        id: 71007203,
                        content: "啊呀，这位朋友来得正好。我每次买东西都拿不定主意，能拜托你帮我看看，给点建议吗？",
                        npc: 818074,
                        options: [
                            {
                                id: 710072031,
                                content: "（接受。）",
                                next: 71007204,
                            },
                            {
                                id: 710072032,
                                content: "（拒绝。）",
                                next: 71007206,
                            },
                        ],
                    },
                    {
                        id: 71007204,
                        content: "万分感谢，我就在这儿等你。",
                        npc: 818074,
                        next: 71007206,
                    },
                ],
            },
            {
                id: "17502460202332776",
                type: "TalkNode",
                name: "对话节点",
                next: ["17502461152704199", "17502461190554383"],
                dialogues: [
                    {
                        id: 71007206,
                        content: "我这可都是从原产地千里迢迢运输回来的高档货，更有百年春官方认证。虽说贵了些，但一分钱绝对对得起一分货。",
                        npc: 818072,
                        next: 71007209,
                    },
                ],
            },
            {
                id: "17502460237112933",
                type: "TalkNode",
                name: "对话节点",
                next: ["17502461152704199"],
                dialogues: [
                    {
                        id: 71007207,
                        content: "都是日用品，高不高档有啥区别。还是我这便宜实惠的性价比更高，你说对吧。",
                        npc: 818073,
                        next: 71007209,
                    },
                ],
            },
            {
                id: "17502461190554383",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007208,
                        content: "（仔细确认之后，你已经做出了选择。现在去给那位纠结的旅人提供你的宝贵建议吧。）",
                        npc: 800006,
                        next: 71007209,
                    },
                ],
            },
            {
                id: "17502461152704199",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007209,
                        content: "怎么样，你觉得哪家卖的更好？",
                        npc: 818074,
                        options: [
                            {
                                id: 710072091,
                                content: "织星客卖的质量更好，买他的比较有保障。",
                                next: 71007210,
                                impr: [1041, "Morality", 1],
                            },
                            {
                                id: 710072092,
                                content: "黑市商人价格便宜，买他的更实惠。",
                                next: 71007210,
                                impr: [1041, "Benefit", 1],
                            },
                        ],
                    },
                    {
                        id: 71007210,
                        content: "好，那就买他的吧！谢谢你！",
                        npc: 818074,
                    },
                ],
            },
        ],
    },
    {
        id: 109124,
        name: "难以取舍",
        level: [50, 59],
        regionId: 1041,
        subRegionId: 104108,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1750244194350490",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007201,
                        content: "嗯……到底选哪家好呢……",
                        npc: 818074,
                        next: 71007203,
                    },
                ],
            },
            {
                id: "1750244197345693",
                type: "TalkNode",
                name: "对话节点",
                next: ["17502460237112933"],
                dialogues: [
                    {
                        id: 71007203,
                        content: "啊呀，这位朋友来得正好。我每次买东西都拿不定主意，能拜托你帮我看看，给点建议吗？",
                        npc: 818074,
                        options: [
                            {
                                id: 710072031,
                                content: "（接受。）",
                                next: 71007204,
                            },
                            {
                                id: 710072032,
                                content: "（拒绝。）",
                                next: 71007206,
                            },
                        ],
                    },
                    {
                        id: 71007204,
                        content: "万分感谢，我就在这儿等你。",
                        npc: 818074,
                        next: 71007206,
                    },
                ],
            },
            {
                id: "17502460202332776",
                type: "TalkNode",
                name: "对话节点",
                next: ["17502461152704199", "17502461190554383"],
                dialogues: [
                    {
                        id: 71007206,
                        content: "我这可都是从原产地千里迢迢运输回来的高档货，更有百年春官方认证。虽说贵了些，但一分钱绝对对得起一分货。",
                        npc: 818072,
                        next: 71007209,
                    },
                ],
            },
            {
                id: "17502460237112933",
                type: "TalkNode",
                name: "对话节点",
                next: ["17502461152704199"],
                dialogues: [
                    {
                        id: 71007207,
                        content: "都是日用品，高不高档有啥区别。还是我这便宜实惠的性价比更高，你说对吧。",
                        npc: 818073,
                        next: 71007209,
                    },
                ],
            },
            {
                id: "17502461190554383",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007208,
                        content: "（仔细确认之后，你已经做出了选择。现在去给那位纠结的旅人提供你的宝贵建议吧。）",
                        npc: 800006,
                        next: 71007209,
                    },
                ],
            },
            {
                id: "17502461152704199",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71007209,
                        content: "怎么样，你觉得哪家卖的更好？",
                        npc: 818074,
                        options: [
                            {
                                id: 710072091,
                                content: "织星客卖的质量更好，买他的比较有保障。",
                                next: 71007210,
                                impr: [1041, "Morality", 1],
                            },
                            {
                                id: 710072092,
                                content: "黑市商人价格便宜，买他的更实惠。",
                                next: 71007210,
                                impr: [1041, "Benefit", 1],
                            },
                        ],
                    },
                    {
                        id: 71007210,
                        content: "好，那就买他的吧！谢谢你！",
                        npc: 818074,
                    },
                ],
            },
        ],
    },
    {
        id: 200701,
        name: "高空作业",
        level: [1, 29],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "171746957792412380",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71000701,
                        content: "真是头疼啊，就剩几条管道了。",
                        npc: 800007,
                        next: 71000710,
                    },
                ],
            },
            {
                id: "171746974535716988",
                type: "TalkNode",
                name: "和修理工对话",
                next: ["171747345059438631", "172197711197315690", "172535480720210231"],
                dialogues: [
                    {
                        id: 71000710,
                        content: "发生什么了？",
                        npc: 100001,
                        next: 71000711,
                    },
                    {
                        id: 71000711,
                        content: "哎呀，我得检查一下城里这些月髓管有没有坏。",
                        npc: 800007,
                        next: 71000721,
                    },
                    {
                        id: 71000721,
                        content: "但我的作业绳在上条管子那里弄断了，你能帮我上去看一看剩下的几条管子吗？",
                        npc: 800007,
                        options: [
                            {
                                id: 710007210,
                                content: "好吧。",
                                next: 71000741,
                            },
                            {
                                id: 710007211,
                                content: "抱歉，我还有其他事。",
                            },
                        ],
                    },
                    {
                        id: 71000741,
                        content: "剩下的几条管道我帮你标出来了，真是麻烦你了！",
                        npc: 800007,
                        next: 71000751,
                    },
                ],
            },
            {
                id: "171747334876334482",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000751,
                        content: "（这条管道没有破损，去看看下一条管道吧。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "171747345059438631",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000751,
                        content: "（这条管道没有破损，去看看下一条管道吧。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "172197711197315690",
                type: "TalkNode",
                name: "对话节点",
                next: ["171757840803519522"],
                dialogues: [
                    {
                        id: 71000761,
                        content: "（最后一条管道也没有破损，去告诉那名工人吧。）",
                        npc: 800006,
                        next: 71000771,
                    },
                ],
            },
            {
                id: "172535480720210231",
                type: "TalkNode",
                name: "对话节点",
                next: ["17253582843024411"],
                dialogues: [
                    {
                        id: 71000780,
                        content: "（这条管道出现了轻微破损，去告诉那名工人吧。）",
                        npc: 800006,
                        next: 71000781,
                    },
                ],
            },
            {
                id: "171757840803519522",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000771,
                        content: "都没问题？太好了！万分感谢！",
                        npc: 800007,
                    },
                ],
            },
            {
                id: "17253582843024411",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000781,
                        content: "唉……看来又得上工了，我回去拿点工具，你拿上我的钥匙，先去帮我关一下月髓管的总阀吧。",
                        npc: 800007,
                        next: 71000782,
                    },
                ],
            },
            {
                id: "172535497614512174",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000782,
                        content: "谢谢，剩下的就交给我吧。",
                        npc: 800007,
                    },
                ],
            },
        ],
    },
    {
        id: 200702,
        name: "高空作业",
        level: [30, 39],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "171746957792412380",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71000701,
                        content: "真是头疼啊，就剩几条管道了。",
                        npc: 800007,
                        next: 71000710,
                    },
                ],
            },
            {
                id: "171746974535716988",
                type: "TalkNode",
                name: "和修理工对话",
                next: ["171747345059438631", "172197711197315690", "172535480720210231"],
                dialogues: [
                    {
                        id: 71000710,
                        content: "发生什么了？",
                        npc: 100001,
                        next: 71000711,
                    },
                    {
                        id: 71000711,
                        content: "哎呀，我得检查一下城里这些月髓管有没有坏。",
                        npc: 800007,
                        next: 71000721,
                    },
                    {
                        id: 71000721,
                        content: "但我的作业绳在上条管子那里弄断了，你能帮我上去看一看剩下的几条管子吗？",
                        npc: 800007,
                        options: [
                            {
                                id: 710007210,
                                content: "好吧。",
                                next: 71000741,
                            },
                            {
                                id: 710007211,
                                content: "抱歉，我还有其他事。",
                            },
                        ],
                    },
                    {
                        id: 71000741,
                        content: "剩下的几条管道我帮你标出来了，真是麻烦你了！",
                        npc: 800007,
                        next: 71000751,
                    },
                ],
            },
            {
                id: "171747334876334482",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000751,
                        content: "（这条管道没有破损，去看看下一条管道吧。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "171747345059438631",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000751,
                        content: "（这条管道没有破损，去看看下一条管道吧。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "172197711197315690",
                type: "TalkNode",
                name: "对话节点",
                next: ["171757840803519522"],
                dialogues: [
                    {
                        id: 71000761,
                        content: "（最后一条管道也没有破损，去告诉那名工人吧。）",
                        npc: 800006,
                        next: 71000771,
                    },
                ],
            },
            {
                id: "172535480720210231",
                type: "TalkNode",
                name: "对话节点",
                next: ["17253582843024411"],
                dialogues: [
                    {
                        id: 71000780,
                        content: "（这条管道出现了轻微破损，去告诉那名工人吧。）",
                        npc: 800006,
                        next: 71000781,
                    },
                ],
            },
            {
                id: "171757840803519522",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000771,
                        content: "都没问题？太好了！万分感谢！",
                        npc: 800007,
                    },
                ],
            },
            {
                id: "17253582843024411",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000781,
                        content: "唉……看来又得上工了，我回去拿点工具，你拿上我的钥匙，先去帮我关一下月髓管的总阀吧。",
                        npc: 800007,
                        next: 71000782,
                    },
                ],
            },
            {
                id: "172535497614512174",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000782,
                        content: "谢谢，剩下的就交给我吧。",
                        npc: 800007,
                    },
                ],
            },
        ],
    },
    {
        id: 200801,
        name: "捉迷藏",
        level: [1, 29],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "171749026044282375",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000901,
                        content: "捉迷藏，捉迷藏，一起来玩捉迷藏！",
                        npc: 800008,
                        next: 71000902,
                    },
                ],
            },
            {
                id: "171749032353984115",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000902,
                        content: "捉迷藏，捉迷藏，一起来玩捉迷藏！",
                        npc: 800008,
                        next: 71000903,
                    },
                    {
                        id: 71000903,
                        content: "好呀好呀！但是我不想找人，我想藏。",
                        npc: 800009,
                        next: 71000904,
                    },
                    {
                        id: 71000904,
                        content: "我也是，我发现一个超级隐蔽的地方，躲在那一定能赢！",
                        npc: 800010,
                        next: 71000905,
                    },
                    {
                        id: 71000905,
                        content: "那怎么办？还有人愿意和我们一起捉迷藏吗……",
                        npc: 800009,
                        next: 71000906,
                    },
                    {
                        id: 71000906,
                        content: "（孩子们注意到了路过的你，满眼期待地等待着你的回应。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17221556213594046",
                type: "TalkNode",
                name: "对话节点",
                next: [
                    "17292332548143169",
                    "17292332452082869",
                    "17292332452092872",
                    "171749113800192361",
                    "171749130757096639",
                    "17292332548153170",
                    "17292332452092873",
                    "171749137936397927",
                ],
                dialogues: [
                    {
                        id: 71000907,
                        content: "（孩子们兴奋地跳了起来，一眨眼就消失在了街角。现在该好好想想去哪里寻找这些孩子了。）",
                        next: 71000908,
                    },
                ],
            },
            {
                id: "17292332548143166",
                type: "TalkNode",
                name: "对话节点-无聊小孩",
                next: ["17221558938617160"],
                dialogues: [
                    {
                        id: 71000908,
                        content: "哇，这么快就被你找到了。",
                        npc: 800008,
                    },
                ],
            },
            {
                id: "17292332548143169",
                type: "TalkNode",
                name: "对话节点-嬉闹小孩",
                next: ["17221558938617160"],
                dialogues: [
                    {
                        id: 71000909,
                        content: "你好厉害呀。",
                        npc: 800009,
                    },
                ],
            },
            {
                id: "17292332452082869",
                type: "TalkNode",
                name: "对话节点-小孩",
                next: ["17221558938617160"],
                dialogues: [
                    {
                        id: 71000908,
                        content: "哇，这么快就被你找到了。",
                        npc: 800008,
                    },
                ],
            },
            {
                id: "17292332452092872",
                type: "TalkNode",
                name: "对话节点-草丛小孩",
                next: ["17221558938617160"],
                dialogues: [
                    {
                        id: 71000909,
                        content: "你好厉害呀。",
                        npc: 800009,
                    },
                ],
            },
            {
                id: "171749113800192361",
                type: "TalkNode",
                name: "对话节点-无聊小孩",
                next: ["17221558938617160"],
                dialogues: [
                    {
                        id: 71000908,
                        content: "哇，这么快就被你找到了。",
                        npc: 800008,
                        next: 71000911,
                    },
                ],
            },
            {
                id: "171749130757096639",
                type: "TalkNode",
                name: "对话节点-嬉闹小孩",
                next: ["17221558938617160"],
                dialogues: [
                    {
                        id: 71000909,
                        content: "你好厉害呀。",
                        npc: 800009,
                        next: 71000911,
                    },
                ],
            },
            {
                id: "17292332548153170",
                type: "TalkNode",
                name: "对话节点-兴奋小孩",
                next: ["17221558938617160"],
                dialogues: [
                    {
                        id: 71000910,
                        content: "可恶，我居然输了……",
                        npc: 800010,
                    },
                ],
            },
            {
                id: "17292332452092873",
                type: "TalkNode",
                name: "对话节点",
                next: ["17221558938617160"],
                dialogues: [
                    {
                        id: 71000910,
                        content: "可恶，我居然输了……",
                        npc: 800010,
                    },
                ],
            },
            {
                id: "171749137936397927",
                type: "TalkNode",
                name: "对话节点-兴奋小孩",
                dialogues: [
                    {
                        id: 71000910,
                        content: "可恶，我居然输了……",
                        npc: 800010,
                        next: 71000911,
                    },
                ],
            },
            {
                id: "17221558938617160",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000911,
                        content: "好吧好吧，愿赌服输，这是给你的谢礼，下次还要和我们一起玩哦！",
                        npc: 800008,
                    },
                ],
            },
        ],
    },
    {
        id: 200802,
        name: "捉迷藏",
        level: [30, 39],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "171749026044282375",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000901,
                        content: "捉迷藏，捉迷藏，一起来玩捉迷藏！",
                        npc: 800008,
                        next: 71000902,
                    },
                ],
            },
            {
                id: "171749032353984115",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000902,
                        content: "捉迷藏，捉迷藏，一起来玩捉迷藏！",
                        npc: 800008,
                        next: 71000903,
                    },
                    {
                        id: 71000903,
                        content: "好呀好呀！但是我不想找人，我想藏。",
                        npc: 800009,
                        next: 71000904,
                    },
                    {
                        id: 71000904,
                        content: "我也是，我发现一个超级隐蔽的地方，躲在那一定能赢！",
                        npc: 800010,
                        next: 71000905,
                    },
                    {
                        id: 71000905,
                        content: "那怎么办？还有人愿意和我们一起捉迷藏吗……",
                        npc: 800009,
                        next: 71000906,
                    },
                    {
                        id: 71000906,
                        content: "（孩子们注意到了路过的你，满眼期待地等待着你的回应。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17221556213594046",
                type: "TalkNode",
                name: "对话节点",
                next: [
                    "17292332548143169",
                    "17292332452082869",
                    "17292332452092872",
                    "171749113800192361",
                    "171749130757096639",
                    "17292332548153170",
                    "17292332452092873",
                    "171749137936397927",
                ],
                dialogues: [
                    {
                        id: 71000907,
                        content: "（孩子们兴奋地跳了起来，一眨眼就消失在了街角。现在该好好想想去哪里寻找这些孩子了。）",
                        next: 71000908,
                    },
                ],
            },
            {
                id: "17292332548143166",
                type: "TalkNode",
                name: "对话节点-无聊小孩",
                next: ["17221558938617160"],
                dialogues: [
                    {
                        id: 71000908,
                        content: "哇，这么快就被你找到了。",
                        npc: 800008,
                    },
                ],
            },
            {
                id: "17292332548143169",
                type: "TalkNode",
                name: "对话节点-嬉闹小孩",
                next: ["17221558938617160"],
                dialogues: [
                    {
                        id: 71000909,
                        content: "你好厉害呀。",
                        npc: 800009,
                    },
                ],
            },
            {
                id: "17292332452082869",
                type: "TalkNode",
                name: "对话节点-小孩",
                next: ["17221558938617160"],
                dialogues: [
                    {
                        id: 71000908,
                        content: "哇，这么快就被你找到了。",
                        npc: 800008,
                    },
                ],
            },
            {
                id: "17292332452092872",
                type: "TalkNode",
                name: "对话节点-草丛小孩",
                next: ["17221558938617160"],
                dialogues: [
                    {
                        id: 71000909,
                        content: "你好厉害呀。",
                        npc: 800009,
                    },
                ],
            },
            {
                id: "171749113800192361",
                type: "TalkNode",
                name: "对话节点-无聊小孩",
                next: ["17221558938617160"],
                dialogues: [
                    {
                        id: 71000908,
                        content: "哇，这么快就被你找到了。",
                        npc: 800008,
                        next: 71000911,
                    },
                ],
            },
            {
                id: "171749130757096639",
                type: "TalkNode",
                name: "对话节点-嬉闹小孩",
                next: ["17221558938617160"],
                dialogues: [
                    {
                        id: 71000909,
                        content: "你好厉害呀。",
                        npc: 800009,
                        next: 71000911,
                    },
                ],
            },
            {
                id: "17292332548153170",
                type: "TalkNode",
                name: "对话节点-兴奋小孩",
                next: ["17221558938617160"],
                dialogues: [
                    {
                        id: 71000910,
                        content: "可恶，我居然输了……",
                        npc: 800010,
                    },
                ],
            },
            {
                id: "17292332452092873",
                type: "TalkNode",
                name: "对话节点",
                next: ["17221558938617160"],
                dialogues: [
                    {
                        id: 71000910,
                        content: "可恶，我居然输了……",
                        npc: 800010,
                    },
                ],
            },
            {
                id: "171749137936397927",
                type: "TalkNode",
                name: "对话节点-兴奋小孩",
                dialogues: [
                    {
                        id: 71000910,
                        content: "可恶，我居然输了……",
                        npc: 800010,
                        next: 71000911,
                    },
                ],
            },
            {
                id: "17221558938617160",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000911,
                        content: "好吧好吧，愿赌服输，这是给你的谢礼，下次还要和我们一起玩哦！",
                        npc: 800008,
                    },
                ],
            },
        ],
    },
    {
        id: 200803,
        name: "捉迷藏",
        level: [40, 49],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "171749026044282375",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000901,
                        content: "捉迷藏，捉迷藏，一起来玩捉迷藏！",
                        npc: 800008,
                        next: 71000902,
                    },
                ],
            },
            {
                id: "171749032353984115",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000902,
                        content: "捉迷藏，捉迷藏，一起来玩捉迷藏！",
                        npc: 800008,
                        next: 71000903,
                    },
                    {
                        id: 71000903,
                        content: "好呀好呀！但是我不想找人，我想藏。",
                        npc: 800009,
                        next: 71000904,
                    },
                    {
                        id: 71000904,
                        content: "我也是，我发现一个超级隐蔽的地方，躲在那一定能赢！",
                        npc: 800010,
                        next: 71000905,
                    },
                    {
                        id: 71000905,
                        content: "那怎么办？还有人愿意和我们一起捉迷藏吗……",
                        npc: 800009,
                        next: 71000906,
                    },
                    {
                        id: 71000906,
                        content: "（孩子们注意到了路过的你，满眼期待地等待着你的回应。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17221556213594046",
                type: "TalkNode",
                name: "对话节点",
                next: [
                    "17292332548143169",
                    "17292332452082869",
                    "17292332452092872",
                    "171749113800192361",
                    "171749130757096639",
                    "17292332548153170",
                    "17292332452092873",
                    "171749137936397927",
                ],
                dialogues: [
                    {
                        id: 71000907,
                        content: "（孩子们兴奋地跳了起来，一眨眼就消失在了街角。现在该好好想想去哪里寻找这些孩子了。）",
                        next: 71000908,
                    },
                ],
            },
            {
                id: "17292332548143166",
                type: "TalkNode",
                name: "对话节点-无聊小孩",
                next: ["17221558938617160"],
                dialogues: [
                    {
                        id: 71000908,
                        content: "哇，这么快就被你找到了。",
                        npc: 800008,
                    },
                ],
            },
            {
                id: "17292332548143169",
                type: "TalkNode",
                name: "对话节点-嬉闹小孩",
                next: ["17221558938617160"],
                dialogues: [
                    {
                        id: 71000909,
                        content: "你好厉害呀。",
                        npc: 800009,
                    },
                ],
            },
            {
                id: "17292332452082869",
                type: "TalkNode",
                name: "对话节点-小孩",
                next: ["17221558938617160"],
                dialogues: [
                    {
                        id: 71000908,
                        content: "哇，这么快就被你找到了。",
                        npc: 800008,
                    },
                ],
            },
            {
                id: "17292332452092872",
                type: "TalkNode",
                name: "对话节点-草丛小孩",
                next: ["17221558938617160"],
                dialogues: [
                    {
                        id: 71000909,
                        content: "你好厉害呀。",
                        npc: 800009,
                    },
                ],
            },
            {
                id: "171749113800192361",
                type: "TalkNode",
                name: "对话节点-无聊小孩",
                next: ["17221558938617160"],
                dialogues: [
                    {
                        id: 71000908,
                        content: "哇，这么快就被你找到了。",
                        npc: 800008,
                        next: 71000911,
                    },
                ],
            },
            {
                id: "171749130757096639",
                type: "TalkNode",
                name: "对话节点-嬉闹小孩",
                next: ["17221558938617160"],
                dialogues: [
                    {
                        id: 71000909,
                        content: "你好厉害呀。",
                        npc: 800009,
                        next: 71000911,
                    },
                ],
            },
            {
                id: "17292332548153170",
                type: "TalkNode",
                name: "对话节点-兴奋小孩",
                next: ["17221558938617160"],
                dialogues: [
                    {
                        id: 71000910,
                        content: "可恶，我居然输了……",
                        npc: 800010,
                    },
                ],
            },
            {
                id: "17292332452092873",
                type: "TalkNode",
                name: "对话节点",
                next: ["17221558938617160"],
                dialogues: [
                    {
                        id: 71000910,
                        content: "可恶，我居然输了……",
                        npc: 800010,
                    },
                ],
            },
            {
                id: "171749137936397927",
                type: "TalkNode",
                name: "对话节点-兴奋小孩",
                dialogues: [
                    {
                        id: 71000910,
                        content: "可恶，我居然输了……",
                        npc: 800010,
                        next: 71000911,
                    },
                ],
            },
            {
                id: "17221558938617160",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71000911,
                        content: "好吧好吧，愿赌服输，这是给你的谢礼，下次还要和我们一起玩哦！",
                        npc: 800008,
                    },
                ],
            },
        ],
    },
    {
        id: 201031,
        name: "物理维修",
        level: [1, 29],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1721718394849891",
                type: "TalkNode",
                name: "士兵对着卡住的机关开车对话",
                dialogues: [
                    {
                        id: 71001501,
                        content: "唉……这破玩意怎么又坏了……",
                        npc: 818006,
                        next: 71001502,
                    },
                ],
            },
            {
                id: "17218750111354147",
                type: "TalkNode",
                name: "与士兵交互修理",
                next: ["172172081966914963", "172172067859712593", "172172128321419251", "172172079701414449", "172172086324815577"],
                dialogues: [
                    {
                        id: 71001502,
                        content: "发生什么了？",
                        npc: 100001,
                        next: 71001503,
                    },
                    {
                        id: 71001503,
                        content: "这台机器我老用不好，要不你也来试试，看看是机器的问题还是我的问题。",
                        npc: 818006,
                    },
                ],
            },
            {
                id: "172172126917318875",
                type: "TalkNode",
                name: "感谢",
                next: ["172172128321419251"],
                dialogues: [
                    {
                        id: 71001504,
                        content: "谢了啊。",
                        npc: 818006,
                        next: 71001505,
                    },
                ],
            },
            {
                id: "172172081966914963",
                type: "TalkNode",
                name: "试试？",
                next: ["172172079701414449", "172172086324815577"],
                dialogues: [
                    {
                        id: 71001506,
                        content: "这也行？",
                        npc: 818006,
                        next: 71001507,
                    },
                ],
            },
            {
                id: "172172067859712593",
                type: "TalkNode",
                name: "悠着点1",
                next: ["172172079701414449", "172172086324815577"],
                dialogues: [
                    {
                        id: 71001507,
                        content: "呃……真的拍两下就能好吗？",
                        npc: 818006,
                        next: 71001508,
                    },
                ],
            },
            {
                id: "172172128321419251",
                type: "TalkNode",
                name: "对话奖励",
                dialogues: [
                    {
                        id: 71001505,
                        content: "有两下子！唉，看来还是我的操作方式不对……",
                        npc: 818006,
                    },
                ],
            },
            {
                id: "172172079701414449",
                type: "TalkNode",
                name: "悠着点2",
                dialogues: [
                    {
                        id: 71001508,
                        content: "喂喂，刚刚是不是有零件飞出去了。",
                        npc: 818006,
                        next: 71001509,
                    },
                ],
            },
            {
                id: "172172086324815577",
                type: "TalkNode",
                name: "对话奖励",
                dialogues: [
                    {
                        id: 71001509,
                        content: "厉害啊，居然真有用！",
                        npc: 818006,
                    },
                ],
            },
        ],
    },
    {
        id: 201032,
        name: "物理维修",
        level: [30, 39],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1721718394849891",
                type: "TalkNode",
                name: "士兵对着卡住的机关开车对话",
                dialogues: [
                    {
                        id: 71001501,
                        content: "唉……这破玩意怎么又坏了……",
                        npc: 818006,
                        next: 71001502,
                    },
                ],
            },
            {
                id: "17218750111354147",
                type: "TalkNode",
                name: "与士兵交互修理",
                next: ["172172081966914963", "172172067859712593", "172172128321419251", "172172079701414449", "172172086324815577"],
                dialogues: [
                    {
                        id: 71001502,
                        content: "发生什么了？",
                        npc: 100001,
                        next: 71001503,
                    },
                    {
                        id: 71001503,
                        content: "这台机器我老用不好，要不你也来试试，看看是机器的问题还是我的问题。",
                        npc: 818006,
                    },
                ],
            },
            {
                id: "172172126917318875",
                type: "TalkNode",
                name: "感谢",
                next: ["172172128321419251"],
                dialogues: [
                    {
                        id: 71001504,
                        content: "谢了啊。",
                        npc: 818006,
                        next: 71001505,
                    },
                ],
            },
            {
                id: "172172081966914963",
                type: "TalkNode",
                name: "试试？",
                next: ["172172079701414449", "172172086324815577"],
                dialogues: [
                    {
                        id: 71001506,
                        content: "这也行？",
                        npc: 818006,
                        next: 71001507,
                    },
                ],
            },
            {
                id: "172172067859712593",
                type: "TalkNode",
                name: "悠着点1",
                next: ["172172079701414449", "172172086324815577"],
                dialogues: [
                    {
                        id: 71001507,
                        content: "呃……真的拍两下就能好吗？",
                        npc: 818006,
                        next: 71001508,
                    },
                ],
            },
            {
                id: "172172128321419251",
                type: "TalkNode",
                name: "对话奖励",
                dialogues: [
                    {
                        id: 71001505,
                        content: "有两下子！唉，看来还是我的操作方式不对……",
                        npc: 818006,
                    },
                ],
            },
            {
                id: "172172079701414449",
                type: "TalkNode",
                name: "悠着点2",
                dialogues: [
                    {
                        id: 71001508,
                        content: "喂喂，刚刚是不是有零件飞出去了。",
                        npc: 818006,
                        next: 71001509,
                    },
                ],
            },
            {
                id: "172172086324815577",
                type: "TalkNode",
                name: "对话奖励",
                dialogues: [
                    {
                        id: 71001509,
                        content: "厉害啊，居然真有用！",
                        npc: 818006,
                    },
                ],
            },
        ],
    },
    {
        id: 201033,
        name: "物理维修",
        level: [40, 49],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1721718394849891",
                type: "TalkNode",
                name: "士兵对着卡住的机关开车对话",
                dialogues: [
                    {
                        id: 71001501,
                        content: "唉……这破玩意怎么又坏了……",
                        npc: 818006,
                        next: 71001502,
                    },
                ],
            },
            {
                id: "17218750111354147",
                type: "TalkNode",
                name: "与士兵交互修理",
                next: ["172172081966914963", "172172067859712593", "172172128321419251", "172172079701414449", "172172086324815577"],
                dialogues: [
                    {
                        id: 71001502,
                        content: "发生什么了？",
                        npc: 100001,
                        next: 71001503,
                    },
                    {
                        id: 71001503,
                        content: "这台机器我老用不好，要不你也来试试，看看是机器的问题还是我的问题。",
                        npc: 818006,
                    },
                ],
            },
            {
                id: "172172126917318875",
                type: "TalkNode",
                name: "感谢",
                next: ["172172128321419251"],
                dialogues: [
                    {
                        id: 71001504,
                        content: "谢了啊。",
                        npc: 818006,
                        next: 71001505,
                    },
                ],
            },
            {
                id: "172172081966914963",
                type: "TalkNode",
                name: "试试？",
                next: ["172172079701414449", "172172086324815577"],
                dialogues: [
                    {
                        id: 71001506,
                        content: "这也行？",
                        npc: 818006,
                        next: 71001507,
                    },
                ],
            },
            {
                id: "172172067859712593",
                type: "TalkNode",
                name: "悠着点1",
                next: ["172172079701414449", "172172086324815577"],
                dialogues: [
                    {
                        id: 71001507,
                        content: "呃……真的拍两下就能好吗？",
                        npc: 818006,
                        next: 71001508,
                    },
                ],
            },
            {
                id: "172172128321419251",
                type: "TalkNode",
                name: "对话奖励",
                dialogues: [
                    {
                        id: 71001505,
                        content: "有两下子！唉，看来还是我的操作方式不对……",
                        npc: 818006,
                    },
                ],
            },
            {
                id: "172172079701414449",
                type: "TalkNode",
                name: "悠着点2",
                dialogues: [
                    {
                        id: 71001508,
                        content: "喂喂，刚刚是不是有零件飞出去了。",
                        npc: 818006,
                        next: 71001509,
                    },
                ],
            },
            {
                id: "172172086324815577",
                type: "TalkNode",
                name: "对话奖励",
                dialogues: [
                    {
                        id: 71001509,
                        content: "厉害啊，居然真有用！",
                        npc: 818006,
                    },
                ],
            },
        ],
    },
    {
        id: 201051,
        name: "物理维修",
        level: [1, 29],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1721718394849891",
                type: "TalkNode",
                name: "士兵对着卡住的机关开车对话",
                dialogues: [
                    {
                        id: 71001501,
                        content: "唉……这破玩意怎么又坏了……",
                        npc: 818006,
                        next: 71001502,
                    },
                ],
            },
            {
                id: "17218750111354147",
                type: "TalkNode",
                name: "与士兵交互修理",
                next: ["172172081966914963", "172172067859712593", "172172128321419251", "172172079701414449", "172172086324815577"],
                dialogues: [
                    {
                        id: 71001502,
                        content: "发生什么了？",
                        npc: 100001,
                        next: 71001503,
                    },
                    {
                        id: 71001503,
                        content: "这台机器我老用不好，要不你也来试试，看看是机器的问题还是我的问题。",
                        npc: 818006,
                    },
                ],
            },
            {
                id: "172172126917318875",
                type: "TalkNode",
                name: "感谢",
                next: ["172172128321419251"],
                dialogues: [
                    {
                        id: 71001504,
                        content: "谢了啊。",
                        npc: 818006,
                        next: 71001505,
                    },
                ],
            },
            {
                id: "172172081966914963",
                type: "TalkNode",
                name: "试试？",
                next: ["172172079701414449", "172172086324815577"],
                dialogues: [
                    {
                        id: 71001506,
                        content: "这也行？",
                        npc: 818006,
                        next: 71001507,
                    },
                ],
            },
            {
                id: "172172067859712593",
                type: "TalkNode",
                name: "悠着点1",
                next: ["172172079701414449", "172172086324815577"],
                dialogues: [
                    {
                        id: 71001507,
                        content: "呃……真的拍两下就能好吗？",
                        npc: 818006,
                        next: 71001508,
                    },
                ],
            },
            {
                id: "172172128321419251",
                type: "TalkNode",
                name: "对话奖励",
                dialogues: [
                    {
                        id: 71001505,
                        content: "有两下子！唉，看来还是我的操作方式不对……",
                        npc: 818006,
                    },
                ],
            },
            {
                id: "172172079701414449",
                type: "TalkNode",
                name: "悠着点2",
                dialogues: [
                    {
                        id: 71001508,
                        content: "喂喂，刚刚是不是有零件飞出去了。",
                        npc: 818006,
                        next: 71001509,
                    },
                ],
            },
            {
                id: "172172086324815577",
                type: "TalkNode",
                name: "对话奖励",
                dialogues: [
                    {
                        id: 71001509,
                        content: "厉害啊，居然真有用！",
                        npc: 818006,
                    },
                ],
            },
        ],
    },
    {
        id: 201052,
        name: "物理维修",
        level: [30, 39],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1721718394849891",
                type: "TalkNode",
                name: "士兵对着卡住的机关开车对话",
                dialogues: [
                    {
                        id: 71001501,
                        content: "唉……这破玩意怎么又坏了……",
                        npc: 818006,
                        next: 71001502,
                    },
                ],
            },
            {
                id: "17218750111354147",
                type: "TalkNode",
                name: "与士兵交互修理",
                next: ["172172081966914963", "172172067859712593", "172172128321419251", "172172079701414449", "172172086324815577"],
                dialogues: [
                    {
                        id: 71001502,
                        content: "发生什么了？",
                        npc: 100001,
                        next: 71001503,
                    },
                    {
                        id: 71001503,
                        content: "这台机器我老用不好，要不你也来试试，看看是机器的问题还是我的问题。",
                        npc: 818006,
                    },
                ],
            },
            {
                id: "172172126917318875",
                type: "TalkNode",
                name: "感谢",
                next: ["172172128321419251"],
                dialogues: [
                    {
                        id: 71001504,
                        content: "谢了啊。",
                        npc: 818006,
                        next: 71001505,
                    },
                ],
            },
            {
                id: "172172081966914963",
                type: "TalkNode",
                name: "试试？",
                next: ["172172079701414449", "172172086324815577"],
                dialogues: [
                    {
                        id: 71001506,
                        content: "这也行？",
                        npc: 818006,
                        next: 71001507,
                    },
                ],
            },
            {
                id: "172172067859712593",
                type: "TalkNode",
                name: "悠着点1",
                next: ["172172079701414449", "172172086324815577"],
                dialogues: [
                    {
                        id: 71001507,
                        content: "呃……真的拍两下就能好吗？",
                        npc: 818006,
                        next: 71001508,
                    },
                ],
            },
            {
                id: "172172128321419251",
                type: "TalkNode",
                name: "对话奖励",
                dialogues: [
                    {
                        id: 71001505,
                        content: "有两下子！唉，看来还是我的操作方式不对……",
                        npc: 818006,
                    },
                ],
            },
            {
                id: "172172079701414449",
                type: "TalkNode",
                name: "悠着点2",
                dialogues: [
                    {
                        id: 71001508,
                        content: "喂喂，刚刚是不是有零件飞出去了。",
                        npc: 818006,
                        next: 71001509,
                    },
                ],
            },
            {
                id: "172172086324815577",
                type: "TalkNode",
                name: "对话奖励",
                dialogues: [
                    {
                        id: 71001509,
                        content: "厉害啊，居然真有用！",
                        npc: 818006,
                    },
                ],
            },
        ],
    },
    {
        id: 201053,
        name: "物理维修",
        level: [40, 49],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1721718394849891",
                type: "TalkNode",
                name: "士兵对着卡住的机关开车对话",
                dialogues: [
                    {
                        id: 71001501,
                        content: "唉……这破玩意怎么又坏了……",
                        npc: 818006,
                        next: 71001502,
                    },
                ],
            },
            {
                id: "17218750111354147",
                type: "TalkNode",
                name: "与士兵交互修理",
                next: ["172172081966914963", "172172067859712593", "172172128321419251", "172172079701414449", "172172086324815577"],
                dialogues: [
                    {
                        id: 71001502,
                        content: "发生什么了？",
                        npc: 100001,
                        next: 71001503,
                    },
                    {
                        id: 71001503,
                        content: "这台机器我老用不好，要不你也来试试，看看是机器的问题还是我的问题。",
                        npc: 818006,
                    },
                ],
            },
            {
                id: "172172126917318875",
                type: "TalkNode",
                name: "感谢",
                next: ["172172128321419251"],
                dialogues: [
                    {
                        id: 71001504,
                        content: "谢了啊。",
                        npc: 818006,
                        next: 71001505,
                    },
                ],
            },
            {
                id: "172172081966914963",
                type: "TalkNode",
                name: "试试？",
                next: ["172172079701414449", "172172086324815577"],
                dialogues: [
                    {
                        id: 71001506,
                        content: "这也行？",
                        npc: 818006,
                        next: 71001507,
                    },
                ],
            },
            {
                id: "172172067859712593",
                type: "TalkNode",
                name: "悠着点1",
                next: ["172172079701414449", "172172086324815577"],
                dialogues: [
                    {
                        id: 71001507,
                        content: "呃……真的拍两下就能好吗？",
                        npc: 818006,
                        next: 71001508,
                    },
                ],
            },
            {
                id: "172172128321419251",
                type: "TalkNode",
                name: "对话奖励",
                dialogues: [
                    {
                        id: 71001505,
                        content: "有两下子！唉，看来还是我的操作方式不对……",
                        npc: 818006,
                    },
                ],
            },
            {
                id: "172172079701414449",
                type: "TalkNode",
                name: "悠着点2",
                dialogues: [
                    {
                        id: 71001508,
                        content: "喂喂，刚刚是不是有零件飞出去了。",
                        npc: 818006,
                        next: 71001509,
                    },
                ],
            },
            {
                id: "172172086324815577",
                type: "TalkNode",
                name: "对话奖励",
                dialogues: [
                    {
                        id: 71001509,
                        content: "厉害啊，居然真有用！",
                        npc: 818006,
                    },
                ],
            },
        ],
    },
    {
        id: 201503,
        name: "探险家小委托！",
        level: [40, 49],
        regionId: 1001,
        subRegionId: 100102,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17241227705064541",
                type: "TalkNode",
                name: "皎皎开车对话",
                dialogues: [
                    {
                        id: 71001701,
                        content: "诶，那不是{nickname}吗，快来快来。",
                        npc: 818012,
                        next: 71001702,
                    },
                ],
            },
            {
                id: "17241227827384848",
                type: "TalkNode",
                name: "皎皎选项对话",
                next: ["1731401599163823084", "1731048503919419693", "172412327851413121"],
                dialogues: [
                    {
                        id: 71001702,
                        content: "哼嗯，我得好好研究一下这里，你可要保护好我哦。",
                        npc: 818012,
                        options: [
                            {
                                id: 710017021,
                                content: "（接受。）",
                                next: 71001703,
                            },
                            {
                                id: 710017022,
                                content: "（拒绝。）",
                                next: 71001707,
                            },
                        ],
                    },
                    {
                        id: 71001707,
                        content: "唔……你不陪我的话，那我就还是早点离开吧，这里给人的感觉阴森森的……",
                        npc: 818012,
                    },
                ],
            },
            {
                id: "1731048472966419189",
                type: "TalkNode",
                name: "皎皎开车对话",
                next: ["172412327851413121"],
                dialogues: [
                    {
                        id: 71001703,
                        content: "怎么每次我一研究就有坏家伙跑出来打扰呀，交给你啦！我正研究到关键的地方呢。",
                        npc: 818012,
                        next: 71001706,
                    },
                ],
            },
            {
                id: "1731401599163823084",
                type: "TalkNode",
                name: "皎皎开车对话",
                next: ["172412327851413121"],
                dialogues: [
                    {
                        id: 71001704,
                        content: "这里这样，再这样……嗯……快了快了，再等等哈。",
                        npc: 818012,
                        next: 71001705,
                    },
                ],
            },
            {
                id: "1731048503919419693",
                type: "TalkNode",
                name: "皎皎开车对话",
                dialogues: [
                    {
                        id: 71001705,
                        content: "没错，就是这样！好耶，研究完成！",
                        npc: 818012,
                        next: 71001706,
                    },
                ],
            },
            {
                id: "172412327851413121",
                type: "TalkNode",
                name: "结束对话",
                dialogues: [
                    {
                        id: 71001706,
                        content: "还好有你在，本次考察圆满结束喽！这是一点小心意，下次也拜托你啦~",
                        npc: 818012,
                    },
                ],
            },
        ],
    },
    {
        id: 201504,
        name: "探险家小委托！",
        level: [50, 59],
        regionId: 1001,
        subRegionId: 100102,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17241227705064541",
                type: "TalkNode",
                name: "皎皎开车对话",
                dialogues: [
                    {
                        id: 71001701,
                        content: "诶，那不是{nickname}吗，快来快来。",
                        npc: 818012,
                        next: 71001702,
                    },
                ],
            },
            {
                id: "17241227827384848",
                type: "TalkNode",
                name: "皎皎选项对话",
                next: ["1731401599163823084", "1731048503919419693", "172412327851413121"],
                dialogues: [
                    {
                        id: 71001702,
                        content: "哼嗯，我得好好研究一下这里，你可要保护好我哦。",
                        npc: 818012,
                        options: [
                            {
                                id: 710017021,
                                content: "（接受。）",
                                next: 71001703,
                            },
                            {
                                id: 710017022,
                                content: "（拒绝。）",
                                next: 71001707,
                            },
                        ],
                    },
                    {
                        id: 71001707,
                        content: "唔……你不陪我的话，那我就还是早点离开吧，这里给人的感觉阴森森的……",
                        npc: 818012,
                    },
                ],
            },
            {
                id: "1731048472966419189",
                type: "TalkNode",
                name: "皎皎开车对话",
                next: ["172412327851413121"],
                dialogues: [
                    {
                        id: 71001703,
                        content: "怎么每次我一研究就有坏家伙跑出来打扰呀，交给你啦！我正研究到关键的地方呢。",
                        npc: 818012,
                        next: 71001706,
                    },
                ],
            },
            {
                id: "1731401599163823084",
                type: "TalkNode",
                name: "皎皎开车对话",
                next: ["172412327851413121"],
                dialogues: [
                    {
                        id: 71001704,
                        content: "这里这样，再这样……嗯……快了快了，再等等哈。",
                        npc: 818012,
                        next: 71001705,
                    },
                ],
            },
            {
                id: "1731048503919419693",
                type: "TalkNode",
                name: "皎皎开车对话",
                dialogues: [
                    {
                        id: 71001705,
                        content: "没错，就是这样！好耶，研究完成！",
                        npc: 818012,
                        next: 71001706,
                    },
                ],
            },
            {
                id: "172412327851413121",
                type: "TalkNode",
                name: "结束对话",
                dialogues: [
                    {
                        id: 71001706,
                        content: "还好有你在，本次考察圆满结束喽！这是一点小心意，下次也拜托你啦~",
                        npc: 818012,
                    },
                ],
            },
        ],
    },
    {
        id: 202123,
        name: "杰瑞在哪里",
        level: [40, 49],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17241346764827302",
                type: "TalkNode",
                name: "寻猫NPC开车对话",
                dialogues: [
                    {
                        id: 71002001,
                        content: "杰瑞，你又跑去哪了啊，呜呜呜……",
                        npc: 818017,
                        next: 71002002,
                    },
                ],
            },
            {
                id: "17241353468208032",
                type: "TalkNode",
                name: "与NPC对话选择是否找猫",
                dialogues: [
                    {
                        id: 71002002,
                        content: "能拜托你找找我跑丢的<H>猫</>吗，它应该就在这附近才对……",
                        npc: 818017,
                    },
                ],
            },
            {
                id: "17274226098911050",
                type: "TalkNode",
                name: "选项后补充对话",
                next: ["17291653419155639", "17291653482045937", "17291653514126073"],
                dialogues: [
                    {
                        id: 71002007,
                        content: "谢谢你！杰瑞，我的杰瑞……",
                        npc: 818017,
                        next: 71002003,
                    },
                ],
            },
            {
                id: "172413619232913665",
                type: "TalkNode",
                name: "找到猫后的抉择",
                next: ["172413665949716261", "172413667528216618"],
                dialogues: [
                    {
                        id: 71002003,
                        content: "（“杰瑞”瑟缩在地上不愿离开，似乎非常惧怕与人类接触。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17291653419155639",
                type: "TalkNode",
                name: "找到猫后的抉择",
                next: ["172413665949716261", "172413667528216618"],
                dialogues: [
                    {
                        id: 71002003,
                        content: "（“杰瑞”瑟缩在地上不愿离开，似乎非常惧怕与人类接触。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17291653482045937",
                type: "TalkNode",
                name: "找到猫后的抉择",
                next: ["172413665949716261", "172413667528216618"],
                dialogues: [
                    {
                        id: 71002003,
                        content: "（“杰瑞”瑟缩在地上不愿离开，似乎非常惧怕与人类接触。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17291653514126073",
                type: "TalkNode",
                name: "找到猫后的抉择",
                next: ["172413667528216618"],
                dialogues: [
                    {
                        id: 71002003,
                        content: "（“杰瑞”瑟缩在地上不愿离开，似乎非常惧怕与人类接触。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "172413665949716261",
                type: "TalkNode",
                name: "带猫回去找NPC",
                dialogues: [
                    {
                        id: 71002004,
                        content: "太好了，杰瑞你回来了！谢谢，谢谢。",
                        npc: 818018,
                        next: 71002005,
                    },
                    {
                        id: 71002005,
                        content: "（少女抱起“杰瑞”又亲又抱，你假装看不到猫咪在少女怀中挣扎的模样，收下报酬便离开了。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "172413667528216618",
                type: "TalkNode",
                name: "放猫走找NPC",
                dialogues: [
                    {
                        id: 71002006,
                        content: "你也找不到它吗……算了，到处乱跑的小猫不是我的杰瑞，我要让妈妈再给我买一只听话的好猫！",
                        npc: 818018,
                    },
                ],
            },
            {
                id: "172413614772112431",
                type: "TalkNode",
                name: "猫叫开车",
                dialogues: [
                    {
                        id: 10010101,
                        content: "贝蕾，我……",
                        npc: 100001,
                    },
                ],
            },
            {
                id: "172413616667212888",
                type: "TalkNode",
                name: "猫叫开车",
                dialogues: [
                    {
                        id: 10010101,
                        content: "贝蕾，我……",
                        npc: 100001,
                    },
                ],
            },
        ],
    },
    {
        id: 202143,
        name: "杰瑞在哪里",
        level: [40, 49],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17241346764827302",
                type: "TalkNode",
                name: "寻猫NPC开车对话",
                dialogues: [
                    {
                        id: 71002001,
                        content: "杰瑞，你又跑去哪了啊，呜呜呜……",
                        npc: 818017,
                        next: 71002002,
                    },
                ],
            },
            {
                id: "17241353468208032",
                type: "TalkNode",
                name: "与NPC对话选择是否找猫",
                dialogues: [
                    {
                        id: 71002002,
                        content: "能拜托你找找我跑丢的<H>猫</>吗，它应该就在这附近才对……",
                        npc: 818017,
                    },
                ],
            },
            {
                id: "17274226098911050",
                type: "TalkNode",
                name: "选项后补充对话",
                next: ["17291653419155639", "17291653482045937", "17291653514126073"],
                dialogues: [
                    {
                        id: 71002007,
                        content: "谢谢你！杰瑞，我的杰瑞……",
                        npc: 818017,
                        next: 71002003,
                    },
                ],
            },
            {
                id: "172413619232913665",
                type: "TalkNode",
                name: "找到猫后的抉择",
                next: ["172413665949716261", "172413667528216618"],
                dialogues: [
                    {
                        id: 71002003,
                        content: "（“杰瑞”瑟缩在地上不愿离开，似乎非常惧怕与人类接触。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17291653419155639",
                type: "TalkNode",
                name: "找到猫后的抉择",
                next: ["172413665949716261", "172413667528216618"],
                dialogues: [
                    {
                        id: 71002003,
                        content: "（“杰瑞”瑟缩在地上不愿离开，似乎非常惧怕与人类接触。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17291653482045937",
                type: "TalkNode",
                name: "找到猫后的抉择",
                next: ["172413665949716261", "172413667528216618"],
                dialogues: [
                    {
                        id: 71002003,
                        content: "（“杰瑞”瑟缩在地上不愿离开，似乎非常惧怕与人类接触。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17291653514126073",
                type: "TalkNode",
                name: "找到猫后的抉择",
                next: ["172413667528216618"],
                dialogues: [
                    {
                        id: 71002003,
                        content: "（“杰瑞”瑟缩在地上不愿离开，似乎非常惧怕与人类接触。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "172413665949716261",
                type: "TalkNode",
                name: "带猫回去找NPC",
                dialogues: [
                    {
                        id: 71002004,
                        content: "太好了，杰瑞你回来了！谢谢，谢谢。",
                        npc: 818018,
                        next: 71002005,
                    },
                    {
                        id: 71002005,
                        content: "（少女抱起“杰瑞”又亲又抱，你假装看不到猫咪在少女怀中挣扎的模样，收下报酬便离开了。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "172413667528216618",
                type: "TalkNode",
                name: "放猫走找NPC",
                dialogues: [
                    {
                        id: 71002006,
                        content: "你也找不到它吗……算了，到处乱跑的小猫不是我的杰瑞，我要让妈妈再给我买一只听话的好猫！",
                        npc: 818018,
                    },
                ],
            },
            {
                id: "172413614772112431",
                type: "TalkNode",
                name: "猫叫开车",
                dialogues: [
                    {
                        id: 10010101,
                        content: "贝蕾，我……",
                        npc: 100001,
                    },
                ],
            },
            {
                id: "172413616667212888",
                type: "TalkNode",
                name: "猫叫开车",
                dialogues: [
                    {
                        id: 10010101,
                        content: "贝蕾，我……",
                        npc: 100001,
                    },
                ],
            },
        ],
    },
    {
        id: 202405,
        name: "小小研究者",
        level: [60, 65],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17260250030748785",
                type: "TalkNode",
                name: "西奥开车",
                dialogues: [
                    {
                        id: 71000801,
                        content: "{nickname}，{nickname}，快来，我找到新的研究课题了。",
                        npc: 800011,
                        next: 71000802,
                    },
                ],
            },
            {
                id: "17260251272839457",
                type: "TalkNode",
                name: "与西奥对话",
                dialogues: [
                    {
                        id: 71000802,
                        content: "这次的研究素材在湖对面，你能帮帮我吗？",
                        npc: 800011,
                        options: [
                            {
                                id: 710008021,
                                content: "（接受。）",
                                next: 71000803,
                            },
                            {
                                id: 710008022,
                                content: "（拒绝。）",
                                next: 71000805,
                            },
                        ],
                    },
                    {
                        id: 71000805,
                        content: "……好吧，我明白了，你的意思是，成为伟大的炼金术师的第一步，就是靠自己的力量寻找研究素材！",
                        npc: 800011,
                    },
                ],
            },
            {
                id: "172602534410711876",
                type: "TalkNode",
                name: "拾取完成开车对话",
                dialogues: [
                    {
                        id: 71000803,
                        content: "这就是西奥要研究的东西了，拿点回去给他吧。",
                        npc: 100001,
                        next: 71000804,
                    },
                ],
            },
            {
                id: "172602537196412349",
                type: "TalkNode",
                name: "与西奥交流完成任务",
                dialogues: [
                    {
                        id: 71000804,
                        content: "谢谢你！想要成为伟大的炼金术师，要学习的东西真的好多好多呢……",
                        npc: 800011,
                    },
                ],
            },
        ],
    },
    {
        id: 203205,
        name: "咆哮木桶",
        level: [60, 65],
        regionId: 1017,
        subRegionId: 101701,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1728443152944815",
                type: "TalkNode",
                name: "主角开车对话",
                next: ["17284433215322067", "17284433215322069", "17284434886795019"],
                dialogues: [
                    {
                        id: 71002701,
                        content: "（一些木桶顺着水道漂来，有的还发出着诡异的声响，谨慎打开的话，也许能发现一些有用的东西。）",
                        npc: 800006,
                        next: 71002702,
                    },
                ],
            },
            {
                id: "17284433215322065",
                type: "TalkNode",
                name: "无事发生",
                dialogues: [
                    {
                        id: 71002702,
                        content: "（木桶底部破了个大洞，除了风声穿过的嘶吼，你找不到任何有用的东西，去看看其他木桶吧。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17284433215322067",
                type: "TalkNode",
                name: "无事发生",
                dialogues: [
                    {
                        id: 71002703,
                        content: "（木桶里装满了生活垃圾，散发着咕嘟咕嘟的闷响和刺鼻的气味，去看看其他木桶吧。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17284433215322069",
                type: "TalkNode",
                name: "找到物资",
                dialogues: [
                    {
                        id: 71002704,
                        content: "（付出必然要有回报，仔细翻找之后，你果然在木桶的夹层里找到了一些能用的物资。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17284434886795019",
                type: "TalkNode",
                name: "出现秽兽",
                dialogues: [
                    {
                        id: 71002705,
                        content: "（破旧的木桶轰然散架，巨大的噪音将周围的秽兽吸引了过来，击败它们，拿到你应得的战利品吧。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 203305,
        name: "山体坍塌",
        level: [60, 65],
        regionId: 1001,
        subRegionId: 100103,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17283891898101208",
                type: "TalkNode",
                name: "主角开车",
                next: ["1728464074203182288", "1730011276550198239"],
                dialogues: [
                    {
                        id: 71002801,
                        content: "（坍塌的碎石挡住了前路，将它们清理掉吧。）",
                        npc: 800006,
                        next: 71002802,
                    },
                ],
            },
            {
                id: "1730011198441196943",
                type: "TalkNode",
                name: "秽兽出现开车",
                next: ["1730011276550198239"],
                dialogues: [
                    {
                        id: 71002803,
                        content: "（清理碎石的响动将周围的秽兽吸引了过来，借助洞顶的落石击退它们吧。）",
                        npc: 800006,
                        next: 71002804,
                    },
                ],
            },
            {
                id: "1728464074203182288",
                type: "TalkNode",
                name: "主角开车",
                dialogues: [
                    {
                        id: 71002802,
                        content: "（你在清理碎石的过程中找到了些能用的物资，将它们收好吧。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "1730011276550198239",
                type: "TalkNode",
                name: "击杀秽兽开车",
                dialogues: [
                    {
                        id: 71002804,
                        content: "（一番战斗后，你在周围找到了些能用的物资，将它们收好吧。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 203704,
        name: "矿坑坍塌",
        level: [50, 59],
        regionId: 1013,
        subRegionId: 101305,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1730015793805784826",
                type: "TalkNode",
                name: "开车",
                next: ["1730015163890780381", "1730015165883780480", "1730015867841786306"],
                dialogues: [
                    {
                        id: 71003201,
                        content: "（坍塌的碎石挡住了前路，四周遗落的爆炸物也许能帮你更快地清理这些碎石。）",
                        npc: 800006,
                        next: 71003203,
                    },
                ],
            },
            {
                id: "1730015153524780081",
                type: "TalkNode",
                name: "拾取开车",
                next: ["1730015575623783929"],
                dialogues: [
                    {
                        id: 71003203,
                        content: "（你找到了一些爆炸物，稍微处理下应该还能用。）",
                        npc: 800006,
                        next: 71003206,
                    },
                ],
            },
            {
                id: "1730015163890780381",
                type: "TalkNode",
                name: "拾取开车",
                next: ["1730015575623783929"],
                dialogues: [
                    {
                        id: 71003204,
                        content: "（你找到了一些引线，稍微处理下应该还能用。）",
                        npc: 800006,
                        next: 71003206,
                    },
                ],
            },
            {
                id: "1730015165883780480",
                type: "TalkNode",
                name: "拾取开车",
                next: ["1730015575623783929"],
                dialogues: [
                    {
                        id: 71003202,
                        content: "（你找到了矿工们的简易爆破手册，勉强还能分辨出上面写的内容。）",
                        npc: 800006,
                        next: 71003206,
                    },
                ],
            },
            {
                id: "1730015867841786306",
                type: "TalkNode",
                name: "完成开车",
                dialogues: [
                    {
                        id: 71003207,
                        content: "（你在清理碎石的过程中找到了些能用的物资，将它们收好吧。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "1730015575623783929",
                type: "TalkNode",
                name: "组合",
                dialogues: [
                    {
                        id: 71003206,
                        content: "（你按照矿工手册上的指示安装好了爆炸物，用它们清空面前区域吧。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 203705,
        name: "矿坑坍塌",
        level: [60, 65],
        regionId: 1013,
        subRegionId: 101305,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1730015793805784826",
                type: "TalkNode",
                name: "开车",
                next: ["1730015163890780381", "1730015165883780480", "1730015867841786306"],
                dialogues: [
                    {
                        id: 71003201,
                        content: "（坍塌的碎石挡住了前路，四周遗落的爆炸物也许能帮你更快地清理这些碎石。）",
                        npc: 800006,
                        next: 71003203,
                    },
                ],
            },
            {
                id: "1730015153524780081",
                type: "TalkNode",
                name: "拾取开车",
                next: ["1730015575623783929"],
                dialogues: [
                    {
                        id: 71003203,
                        content: "（你找到了一些爆炸物，稍微处理下应该还能用。）",
                        npc: 800006,
                        next: 71003206,
                    },
                ],
            },
            {
                id: "1730015163890780381",
                type: "TalkNode",
                name: "拾取开车",
                next: ["1730015575623783929"],
                dialogues: [
                    {
                        id: 71003204,
                        content: "（你找到了一些引线，稍微处理下应该还能用。）",
                        npc: 800006,
                        next: 71003206,
                    },
                ],
            },
            {
                id: "1730015165883780480",
                type: "TalkNode",
                name: "拾取开车",
                next: ["1730015575623783929"],
                dialogues: [
                    {
                        id: 71003202,
                        content: "（你找到了矿工们的简易爆破手册，勉强还能分辨出上面写的内容。）",
                        npc: 800006,
                        next: 71003206,
                    },
                ],
            },
            {
                id: "1730015867841786306",
                type: "TalkNode",
                name: "完成开车",
                dialogues: [
                    {
                        id: 71003207,
                        content: "（你在清理碎石的过程中找到了些能用的物资，将它们收好吧。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "1730015575623783929",
                type: "TalkNode",
                name: "组合",
                dialogues: [
                    {
                        id: 71003206,
                        content: "（你按照矿工手册上的指示安装好了爆炸物，用它们清空面前区域吧。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 204405,
        name: "探险家小委托！",
        level: [60, 65],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1732880525139997",
                type: "TalkNode",
                name: "皎皎开车对话",
                dialogues: [
                    {
                        id: 71001701,
                        content: "诶，那不是{nickname}吗，快来快来。",
                        npc: 818012,
                        next: 71001702,
                    },
                ],
            },
            {
                id: "1732880525139998",
                type: "TalkNode",
                name: "皎皎选项对话",
                next: ["17328805251411020", "17328805251411012", "17328805251401005"],
                dialogues: [
                    {
                        id: 71001702,
                        content: "哼嗯，我得好好研究一下这里，你可要保护好我哦。",
                        npc: 818012,
                        options: [
                            {
                                id: 710017021,
                                content: "（接受。）",
                                next: 71001703,
                            },
                            {
                                id: 710017022,
                                content: "（拒绝。）",
                                next: 71001707,
                            },
                        ],
                    },
                    {
                        id: 71001707,
                        content: "唔……你不陪我的话，那我就还是早点离开吧，这里给人的感觉阴森森的……",
                        npc: 818012,
                    },
                ],
            },
            {
                id: "17328805251401011",
                type: "TalkNode",
                name: "皎皎开车对话",
                next: ["17328805251401005"],
                dialogues: [
                    {
                        id: 71001703,
                        content: "怎么每次我一研究就有坏家伙跑出来打扰呀，交给你啦！我正研究到关键的地方呢。",
                        npc: 818012,
                        next: 71001706,
                    },
                ],
            },
            {
                id: "17328805251411020",
                type: "TalkNode",
                name: "皎皎开车对话",
                next: ["17328805251401005"],
                dialogues: [
                    {
                        id: 71001704,
                        content: "这里这样，再这样……嗯……快了快了，再等等哈。",
                        npc: 818012,
                        next: 71001705,
                    },
                ],
            },
            {
                id: "17328805251411012",
                type: "TalkNode",
                name: "皎皎开车对话",
                dialogues: [
                    {
                        id: 71001705,
                        content: "没错，就是这样！好耶，研究完成！",
                        npc: 818012,
                        next: 71001706,
                    },
                ],
            },
            {
                id: "17328805251401005",
                type: "TalkNode",
                name: "结束对话",
                dialogues: [
                    {
                        id: 71001706,
                        content: "还好有你在，本次考察圆满结束喽！这是一点小心意，下次也拜托你啦~",
                        npc: 818012,
                    },
                ],
            },
        ],
    },
    {
        id: 205105,
        name: "废艇奇遇",
        level: [60, 65],
        regionId: 1001,
        subRegionId: 100103,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1733902595665653160",
                type: "TalkNode",
                name: "拾取开车",
                dialogues: [
                    {
                        id: 71004101,
                        content: "（废弃飞艇不知何时成了山间部分动物的大号储物箱，翻找一下也许能发现些有用的物资。）",
                        npc: 800006,
                        next: 71004102,
                    },
                ],
            },
            {
                id: "1733902647216653670",
                type: "TalkNode",
                name: "士兵出现开车",
                dialogues: [
                    {
                        id: 71004102,
                        content: "（翻动物资的声响将周围的敌人吸引了过来，击退他们吧。）",
                        npc: 800006,
                        next: 71004103,
                    },
                ],
            },
            {
                id: "1733902832608655249",
                type: "TalkNode",
                name: "击杀完成开车",
                dialogues: [
                    {
                        id: 71004103,
                        content: "（敌人退去，现在可以清点下你方才收集的物资了。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 205405,
        name: "惊喜物资",
        level: [60, 65],
        regionId: 1001,
        subRegionId: 100101,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17343290957301652",
                type: "TalkNode",
                name: "开车对话",
                next: [
                    "1734339030919229315",
                    "1734339039514229550",
                    "1734339047869229768",
                    "1734339052015229887",
                    "17343291863453751",
                    "1734339030919229316",
                    "1734339039514229551",
                    "1734339047869229769",
                    "1734339052015229888",
                ],
                dialogues: [
                    {
                        id: 71004301,
                        content: "（这一带总能捡到些漂亮的贝壳，打碎那些冲上岸的箱子找找看吧。）",
                        npc: 800006,
                        next: 71004302,
                    },
                ],
            },
            {
                id: "17340804261221244",
                type: "TalkNode",
                name: "破坏箱子出现贝壳开车",
                dialogues: [
                    {
                        id: 71004302,
                        content: "（你在箱子底部找到了些被压住的贝壳。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "1734339030919229315",
                type: "TalkNode",
                name: "破坏箱子出现贝壳开车",
                dialogues: [
                    {
                        id: 71004302,
                        content: "（你在箱子底部找到了些被压住的贝壳。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "1734339039514229550",
                type: "TalkNode",
                name: "破坏箱子出现贝壳开车",
                dialogues: [
                    {
                        id: 71004302,
                        content: "（你在箱子底部找到了些被压住的贝壳。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "1734339047869229768",
                type: "TalkNode",
                name: "破坏箱子出现贝壳开车",
                dialogues: [
                    {
                        id: 71004302,
                        content: "（你在箱子底部找到了些被压住的贝壳。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "1734339052015229887",
                type: "TalkNode",
                name: "破坏箱子出现贝壳开车",
                dialogues: [
                    {
                        id: 71004302,
                        content: "（你在箱子底部找到了些被压住的贝壳。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17343291863453751",
                type: "TalkNode",
                name: "破坏箱子出现秽兽",
                dialogues: [
                    {
                        id: 71004303,
                        content:
                            "（你早就听闻部分秽兽会躲藏在阴暗的箱子内袭击他人，但不幸的是，这一次它们撞上你了。击败它们，拿到你应得的战利品吧。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "1734339030919229316",
                type: "TalkNode",
                name: "破坏箱子出现秽兽",
                dialogues: [
                    {
                        id: 71004303,
                        content:
                            "（你早就听闻部分秽兽会躲藏在阴暗的箱子内袭击他人，但不幸的是，这一次它们撞上你了。击败它们，拿到你应得的战利品吧。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "1734339039514229551",
                type: "TalkNode",
                name: "破坏箱子出现秽兽",
                dialogues: [
                    {
                        id: 71004303,
                        content:
                            "（你早就听闻部分秽兽会躲藏在阴暗的箱子内袭击他人，但不幸的是，这一次它们撞上你了。击败它们，拿到你应得的战利品吧。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "1734339047869229769",
                type: "TalkNode",
                name: "破坏箱子出现秽兽",
                dialogues: [
                    {
                        id: 71004303,
                        content:
                            "（你早就听闻部分秽兽会躲藏在阴暗的箱子内袭击他人，但不幸的是，这一次它们撞上你了。击败它们，拿到你应得的战利品吧。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "1734339052015229888",
                type: "TalkNode",
                name: "破坏箱子出现秽兽",
                dialogues: [
                    {
                        id: 71004303,
                        content:
                            "（你早就听闻部分秽兽会躲藏在阴暗的箱子内袭击他人，但不幸的是，这一次它们撞上你了。击败它们，拿到你应得的战利品吧。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 205705,
        name: "惊喜物资",
        level: [60, 65],
        regionId: 1021,
        subRegionId: 102101,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17346800765453403702",
                type: "TalkNode",
                name: "开始开车",
                next: [
                    "17346810316733406323",
                    "17346810382753406510",
                    "17346810471663406743",
                    "17346810533403406903",
                    "17346810588993407058",
                    "17346809770073405388",
                    "17346810316733406324",
                    "17346810382753406511",
                    "17346810471663406744",
                    "17346810533403406904",
                    "17346810588993407059",
                ],
                dialogues: [
                    {
                        id: 71004601,
                        content: "（面前摆放着大量的物资箱，打开它们搜寻有用的物资吧。）",
                        npc: 800006,
                        next: 71004602,
                    },
                ],
            },
            {
                id: "17346809701843405324",
                type: "TalkNode",
                name: "电池开车",
                dialogues: [
                    {
                        id: 71004602,
                        content: "（你在箱子中找到了些有用的物资。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17346810316733406323",
                type: "TalkNode",
                name: "电池开车",
                dialogues: [
                    {
                        id: 71004602,
                        content: "（你在箱子中找到了些有用的物资。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17346810382753406510",
                type: "TalkNode",
                name: "电池开车",
                dialogues: [
                    {
                        id: 71004602,
                        content: "（你在箱子中找到了些有用的物资。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17346810471663406743",
                type: "TalkNode",
                name: "电池开车",
                dialogues: [
                    {
                        id: 71004602,
                        content: "（你在箱子中找到了些有用的物资。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17346810533403406903",
                type: "TalkNode",
                name: "电池开车",
                dialogues: [
                    {
                        id: 71004602,
                        content: "（你在箱子中找到了些有用的物资。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17346810588993407058",
                type: "TalkNode",
                name: "电池开车",
                dialogues: [
                    {
                        id: 71004602,
                        content: "（你在箱子中找到了些有用的物资。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17346809770073405388",
                type: "TalkNode",
                name: "秽兽开车",
                dialogues: [
                    {
                        id: 71004603,
                        content:
                            "（你早就听闻部分秽兽会躲藏在阴暗的箱子内袭击他人，但不幸的是，这一次它们撞上你了。击败它们，拿到你应得的战利品吧。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17346810316733406324",
                type: "TalkNode",
                name: "秽兽开车",
                dialogues: [
                    {
                        id: 71004603,
                        content:
                            "（你早就听闻部分秽兽会躲藏在阴暗的箱子内袭击他人，但不幸的是，这一次它们撞上你了。击败它们，拿到你应得的战利品吧。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17346810382753406511",
                type: "TalkNode",
                name: "秽兽开车",
                dialogues: [
                    {
                        id: 71004603,
                        content:
                            "（你早就听闻部分秽兽会躲藏在阴暗的箱子内袭击他人，但不幸的是，这一次它们撞上你了。击败它们，拿到你应得的战利品吧。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17346810471663406744",
                type: "TalkNode",
                name: "秽兽开车",
                dialogues: [
                    {
                        id: 71004603,
                        content:
                            "（你早就听闻部分秽兽会躲藏在阴暗的箱子内袭击他人，但不幸的是，这一次它们撞上你了。击败它们，拿到你应得的战利品吧。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17346810533403406904",
                type: "TalkNode",
                name: "秽兽开车",
                dialogues: [
                    {
                        id: 71004603,
                        content:
                            "（你早就听闻部分秽兽会躲藏在阴暗的箱子内袭击他人，但不幸的是，这一次它们撞上你了。击败它们，拿到你应得的战利品吧。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17346810588993407059",
                type: "TalkNode",
                name: "秽兽开车",
                dialogues: [
                    {
                        id: 71004603,
                        content:
                            "（你早就听闻部分秽兽会躲藏在阴暗的箱子内袭击他人，但不幸的是，这一次它们撞上你了。击败它们，拿到你应得的战利品吧。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 206004,
        name: "迷糊渔人",
        level: [50, 59],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17351241012741393921",
                type: "TalkNode",
                name: "钓鱼人开车对话",
                dialogues: [
                    {
                        id: 71004901,
                        content: "唉……我过不去啊，早知道提前买点草饵了。",
                        npc: 818040,
                        next: 71004902,
                    },
                ],
            },
            {
                id: "1735124035970697658",
                type: "TalkNode",
                name: "钓鱼人交互对话",
                next: ["17351964542182805135", "17351245747371396790"],
                dialogues: [
                    {
                        id: 71004902,
                        content: "狩月人啊，我需要点莲草做鱼饵，但莲草都在湖对面我过不去啊，你能帮我采点回来吗？",
                        npc: 818040,
                        options: [
                            {
                                id: 710049021,
                                content: "（接受。）",
                                next: 71004903,
                            },
                            {
                                id: 710049022,
                                content: "（拒绝。）",
                                next: 71004905,
                            },
                        ],
                    },
                    {
                        id: 71004903,
                        content: "谢谢！那我就先把竿架上等你哈。",
                        npc: 818040,
                        next: 71004905,
                    },
                ],
            },
            {
                id: "17351274086864886883",
                type: "TalkNode",
                name: "遇见秽兽开车",
                next: ["17351245747371396790"],
                dialogues: [
                    {
                        id: 71004905,
                        content: "（游荡的秽兽挤满了四周，先击退它们，再去采集莲草吧。）",
                        npc: 800006,
                        next: 71004906,
                    },
                ],
            },
            {
                id: "17351964542182805135",
                type: "TalkNode",
                name: "拾取完成开车",
                dialogues: [
                    {
                        id: 71004906,
                        content: "（附近的莲草被你一扫而空，把它们交给捕鱼人吧。）",
                        npc: 800006,
                        next: 71004907,
                    },
                ],
            },
            {
                id: "17351245747371396790",
                type: "TalkNode",
                name: "结束对话",
                dialogues: [
                    {
                        id: 71004907,
                        content: "好好好，这么多饵料，今天绝对能钓上鱼！",
                        npc: 818040,
                    },
                ],
            },
        ],
    },
    {
        id: 206005,
        name: "迷糊渔人",
        level: [60, 65],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17351241012741393921",
                type: "TalkNode",
                name: "钓鱼人开车对话",
                dialogues: [
                    {
                        id: 71004901,
                        content: "唉……我过不去啊，早知道提前买点草饵了。",
                        npc: 818040,
                        next: 71004902,
                    },
                ],
            },
            {
                id: "1735124035970697658",
                type: "TalkNode",
                name: "钓鱼人交互对话",
                next: ["17351964542182805135", "17351245747371396790"],
                dialogues: [
                    {
                        id: 71004902,
                        content: "狩月人啊，我需要点莲草做鱼饵，但莲草都在湖对面我过不去啊，你能帮我采点回来吗？",
                        npc: 818040,
                        options: [
                            {
                                id: 710049021,
                                content: "（接受。）",
                                next: 71004903,
                            },
                            {
                                id: 710049022,
                                content: "（拒绝。）",
                                next: 71004905,
                            },
                        ],
                    },
                    {
                        id: 71004903,
                        content: "谢谢！那我就先把竿架上等你哈。",
                        npc: 818040,
                        next: 71004905,
                    },
                ],
            },
            {
                id: "17351274086864886883",
                type: "TalkNode",
                name: "遇见秽兽开车",
                next: ["17351245747371396790"],
                dialogues: [
                    {
                        id: 71004905,
                        content: "（游荡的秽兽挤满了四周，先击退它们，再去采集莲草吧。）",
                        npc: 800006,
                        next: 71004906,
                    },
                ],
            },
            {
                id: "17351964542182805135",
                type: "TalkNode",
                name: "拾取完成开车",
                dialogues: [
                    {
                        id: 71004906,
                        content: "（附近的莲草被你一扫而空，把它们交给捕鱼人吧。）",
                        npc: 800006,
                        next: 71004907,
                    },
                ],
            },
            {
                id: "17351245747371396790",
                type: "TalkNode",
                name: "结束对话",
                dialogues: [
                    {
                        id: 71004907,
                        content: "好好好，这么多饵料，今天绝对能钓上鱼！",
                        npc: 818040,
                    },
                ],
            },
        ],
    },
    {
        id: 206434,
        name: "幸福硬币",
        level: [50, 59],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17361494124551805",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71005201,
                        content: "幸福硬币，有魔法的幸福硬币，大哥哥大姐姐们，来买一枚吧。",
                        npc: 818046,
                        next: 71005202,
                    },
                ],
            },
            {
                id: "17361495322822663",
                type: "TalkNode",
                name: "对话节点",
                next: ["17361495563663188"],
                dialogues: [
                    {
                        id: 71005202,
                        content: "（待你靠近后，女孩立马从怀中掏出几枚铜币递到了你的面前。）",
                        npc: 800006,
                        next: 71005203,
                    },
                    {
                        id: 71005203,
                        content:
                            "{性别：大哥哥|大姐姐}，你好你好，要买幸福硬币吗？这是妈妈留给我的，她说一枚烦恼消散，两枚幸福常伴，三枚……三枚想做什么都能做到！",
                        npc: 818046,
                        next: 71005204,
                    },
                    {
                        id: 71005204,
                        content: "……",
                        npc: 100001,
                        next: 71005205,
                    },
                    {
                        id: 71005205,
                        content:
                            "它们都被妈妈施过魔法了，真的很有用，不骗你！不信的话你去问问其他人嘛，问完再来看看要不要买呗。去吧去吧，我就在这等你。",
                        npc: 818046,
                        next: 71005206,
                    },
                ],
            },
            {
                id: "17361495496112997",
                type: "TalkNode",
                name: "乞讨者",
                next: ["17361494209071982"],
                dialogues: [
                    {
                        id: 71005206,
                        content: "（你注意到老人的脚边摆放着几枚幸福硬币，于是你与他攀谈了起来。）",
                        npc: 800006,
                        next: 71005207,
                    },
                    {
                        id: 71005207,
                        content: "幸福硬币？哈哈，真有这好东西我还会在这破地方饿肚子？",
                        npc: 818047,
                        next: 71005208,
                    },
                    {
                        id: 71005208,
                        content: "这话不要告诉那小姑娘啊。她那么小就没有亲人了，怪可怜的……很多东西就算是假的，也能给人点盼头，你说对吧。",
                        npc: 818047,
                        next: 71005214,
                    },
                ],
            },
            {
                id: "17361495563663188",
                type: "TalkNode",
                name: "小男孩",
                dialogues: [
                    {
                        id: 71005209,
                        content: "（你注意到男孩手中正把玩着几枚幸福硬币，于是你与他攀谈了起来。）",
                        npc: 800006,
                        next: 71005210,
                    },
                    {
                        id: 71005210,
                        content: "你看我左手的幸福硬币和右手的铜币有什么不一样吗？",
                        npc: 818048,
                        next: 71005211,
                    },
                    {
                        id: 71005211,
                        content: "（男孩举起双手，你仔细观察后，确认它们就是完全一样的东西。）",
                        npc: 800006,
                        next: 71005212,
                    },
                    {
                        id: 71005212,
                        content: "是呀，幸福硬币就是我们手里的铜币。它不是魔法创造出来的宝贝，而是诞生自大家的善意。",
                        npc: 818048,
                        next: 71005213,
                    },
                    {
                        id: 71005213,
                        content: "一枚幸福硬币就能买到她的笑容，这么轻松的买卖可不多见呀。",
                        npc: 818048,
                        next: 71005214,
                    },
                ],
            },
            {
                id: "17361494209071982",
                type: "TalkNode",
                name: "买花",
                next: ["17361496134204460"],
                dialogues: [
                    {
                        id: 71005214,
                        content: "怎么样，大家都说很有用吧！",
                        npc: 818046,
                    },
                ],
            },
            {
                id: "17361496084264314",
                type: "TalkNode",
                name: "信任",
                dialogues: [
                    {
                        id: 71005215,
                        content: "嘿嘿，真是拿你没办法。那就全都卖给你吧，希望你能找到属于自己的幸福哦。",
                        npc: 818046,
                    },
                ],
            },
            {
                id: "17361496134204460",
                type: "TalkNode",
                name: "不信任",
                dialogues: [
                    {
                        id: 71005216,
                        content: "靠自己吗……好帅气的发言啊！我以后也可以像你这样吗？",
                        npc: 818046,
                        next: 71005217,
                    },
                    {
                        id: 71005217,
                        content: "当然。",
                        npc: 100001,
                        next: 71005218,
                    },
                    {
                        id: 71005218,
                        content: "唔……这样子啊……我会好好想想的，谢谢你！",
                        npc: 818046,
                    },
                ],
            },
        ],
    },
    {
        id: 206444,
        name: "幸福硬币",
        level: [50, 59],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17361494124551805",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71005201,
                        content: "幸福硬币，有魔法的幸福硬币，大哥哥大姐姐们，来买一枚吧。",
                        npc: 818046,
                        next: 71005202,
                    },
                ],
            },
            {
                id: "17361495322822663",
                type: "TalkNode",
                name: "对话节点",
                next: ["17361495563663188"],
                dialogues: [
                    {
                        id: 71005202,
                        content: "（待你靠近后，女孩立马从怀中掏出几枚铜币递到了你的面前。）",
                        npc: 800006,
                        next: 71005203,
                    },
                    {
                        id: 71005203,
                        content:
                            "{性别：大哥哥|大姐姐}，你好你好，要买幸福硬币吗？这是妈妈留给我的，她说一枚烦恼消散，两枚幸福常伴，三枚……三枚想做什么都能做到！",
                        npc: 818046,
                        next: 71005204,
                    },
                    {
                        id: 71005204,
                        content: "……",
                        npc: 100001,
                        next: 71005205,
                    },
                    {
                        id: 71005205,
                        content:
                            "它们都被妈妈施过魔法了，真的很有用，不骗你！不信的话你去问问其他人嘛，问完再来看看要不要买呗。去吧去吧，我就在这等你。",
                        npc: 818046,
                        next: 71005206,
                    },
                ],
            },
            {
                id: "17361495496112997",
                type: "TalkNode",
                name: "乞讨者",
                next: ["17361494209071982"],
                dialogues: [
                    {
                        id: 71005206,
                        content: "（你注意到老人的脚边摆放着几枚幸福硬币，于是你与他攀谈了起来。）",
                        npc: 800006,
                        next: 71005207,
                    },
                    {
                        id: 71005207,
                        content: "幸福硬币？哈哈，真有这好东西我还会在这破地方饿肚子？",
                        npc: 818047,
                        next: 71005208,
                    },
                    {
                        id: 71005208,
                        content: "这话不要告诉那小姑娘啊。她那么小就没有亲人了，怪可怜的……很多东西就算是假的，也能给人点盼头，你说对吧。",
                        npc: 818047,
                        next: 71005214,
                    },
                ],
            },
            {
                id: "17361495563663188",
                type: "TalkNode",
                name: "小男孩",
                dialogues: [
                    {
                        id: 71005209,
                        content: "（你注意到男孩手中正把玩着几枚幸福硬币，于是你与他攀谈了起来。）",
                        npc: 800006,
                        next: 71005210,
                    },
                    {
                        id: 71005210,
                        content: "你看我左手的幸福硬币和右手的铜币有什么不一样吗？",
                        npc: 818048,
                        next: 71005211,
                    },
                    {
                        id: 71005211,
                        content: "（男孩举起双手，你仔细观察后，确认它们就是完全一样的东西。）",
                        npc: 800006,
                        next: 71005212,
                    },
                    {
                        id: 71005212,
                        content: "是呀，幸福硬币就是我们手里的铜币。它不是魔法创造出来的宝贝，而是诞生自大家的善意。",
                        npc: 818048,
                        next: 71005213,
                    },
                    {
                        id: 71005213,
                        content: "一枚幸福硬币就能买到她的笑容，这么轻松的买卖可不多见呀。",
                        npc: 818048,
                        next: 71005214,
                    },
                ],
            },
            {
                id: "17361494209071982",
                type: "TalkNode",
                name: "买花",
                next: ["17361496134204460"],
                dialogues: [
                    {
                        id: 71005214,
                        content: "怎么样，大家都说很有用吧！",
                        npc: 818046,
                    },
                ],
            },
            {
                id: "17361496084264314",
                type: "TalkNode",
                name: "信任",
                dialogues: [
                    {
                        id: 71005215,
                        content: "嘿嘿，真是拿你没办法。那就全都卖给你吧，希望你能找到属于自己的幸福哦。",
                        npc: 818046,
                    },
                ],
            },
            {
                id: "17361496134204460",
                type: "TalkNode",
                name: "不信任",
                dialogues: [
                    {
                        id: 71005216,
                        content: "靠自己吗……好帅气的发言啊！我以后也可以像你这样吗？",
                        npc: 818046,
                        next: 71005217,
                    },
                    {
                        id: 71005217,
                        content: "当然。",
                        npc: 100001,
                        next: 71005218,
                    },
                    {
                        id: 71005218,
                        content: "唔……这样子啊……我会好好想想的，谢谢你！",
                        npc: 818046,
                    },
                ],
            },
        ],
    },
    {
        id: 206711,
        name: "可怕的声音",
        level: [1, 29],
        regionId: 1017,
        subRegionId: 101701,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17363166248501104",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71005501,
                        content: "那边的狩月人，帮帮我吧。",
                        npc: 818049,
                        next: 71005502,
                    },
                ],
            },
            {
                id: "17363193381637148",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005502,
                        content: "我，我好像听到前面有可怕的声音，你能帮我去看看吗？",
                        npc: 818049,
                    },
                ],
            },
            {
                id: "1736421027525708721",
                type: "TalkNode",
                name: "对话节点",
                next: ["17363168989182906", "17363171406525306", "17363217500712831557"],
                dialogues: [
                    {
                        id: 71005503,
                        content: "（你并未看到什么值得恐惧的东西，也许一切只是男子的错觉而已。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17363168841782593",
                type: "TalkNode",
                name: "放鱼分支",
                next: ["17363171290004843"],
                dialogues: [
                    {
                        id: 71005506,
                        content: "（几块金属卡在了水道旁，不时发出刺耳的声响。这大概就是吓到男子的声音。）",
                        npc: 800006,
                        next: 71005507,
                    },
                    {
                        id: 71005507,
                        content: "（你将金属捡起，因为金属永远不缺买家。等完成男子的委托就找个地方把它们卖掉吧。）",
                        npc: 800006,
                        next: 71005508,
                    },
                ],
            },
            {
                id: "17363168989182906",
                type: "TalkNode",
                name: "打秽兽分支",
                next: ["17363171406525306", "17363217500712831557"],
                dialogues: [
                    {
                        id: 71005504,
                        content: "（几只秽兽徘徊在水道上游，不时发出嘶哑的吼叫。这大概就是吓到男子的声音。）",
                        npc: 800006,
                        next: 71005508,
                    },
                ],
            },
            {
                id: "17363171290004843",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005508,
                        content: "我听不到可怕的声音了，谢谢你。",
                        npc: 818049,
                    },
                ],
            },
            {
                id: "17363217500712831557",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71005505,
                        content: "（所有秽兽被你击退，四周恢复了寂静。回去告诉男子吧。）",
                        npc: 800006,
                        next: 71005508,
                    },
                ],
            },
            {
                id: "17363171406525306",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005508,
                        content: "我听不到可怕的声音了，谢谢你。",
                        npc: 818049,
                    },
                ],
            },
        ],
    },
    {
        id: 206712,
        name: "可怕的声音",
        level: [30, 39],
        regionId: 1017,
        subRegionId: 101701,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17363166248501104",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71005501,
                        content: "那边的狩月人，帮帮我吧。",
                        npc: 818049,
                        next: 71005502,
                    },
                ],
            },
            {
                id: "17363193381637148",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005502,
                        content: "我，我好像听到前面有可怕的声音，你能帮我去看看吗？",
                        npc: 818049,
                    },
                ],
            },
            {
                id: "1736421027525708721",
                type: "TalkNode",
                name: "对话节点",
                next: ["17363168989182906", "17363171406525306", "17363217500712831557"],
                dialogues: [
                    {
                        id: 71005503,
                        content: "（你并未看到什么值得恐惧的东西，也许一切只是男子的错觉而已。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17363168841782593",
                type: "TalkNode",
                name: "放鱼分支",
                next: ["17363171290004843"],
                dialogues: [
                    {
                        id: 71005506,
                        content: "（几块金属卡在了水道旁，不时发出刺耳的声响。这大概就是吓到男子的声音。）",
                        npc: 800006,
                        next: 71005507,
                    },
                    {
                        id: 71005507,
                        content: "（你将金属捡起，因为金属永远不缺买家。等完成男子的委托就找个地方把它们卖掉吧。）",
                        npc: 800006,
                        next: 71005508,
                    },
                ],
            },
            {
                id: "17363168989182906",
                type: "TalkNode",
                name: "打秽兽分支",
                next: ["17363171406525306", "17363217500712831557"],
                dialogues: [
                    {
                        id: 71005504,
                        content: "（几只秽兽徘徊在水道上游，不时发出嘶哑的吼叫。这大概就是吓到男子的声音。）",
                        npc: 800006,
                        next: 71005508,
                    },
                ],
            },
            {
                id: "17363171290004843",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005508,
                        content: "我听不到可怕的声音了，谢谢你。",
                        npc: 818049,
                    },
                ],
            },
            {
                id: "17363217500712831557",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71005505,
                        content: "（所有秽兽被你击退，四周恢复了寂静。回去告诉男子吧。）",
                        npc: 800006,
                        next: 71005508,
                    },
                ],
            },
            {
                id: "17363171406525306",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005508,
                        content: "我听不到可怕的声音了，谢谢你。",
                        npc: 818049,
                    },
                ],
            },
        ],
    },
    {
        id: 206713,
        name: "可怕的声音",
        level: [40, 49],
        regionId: 1017,
        subRegionId: 101701,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17363166248501104",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71005501,
                        content: "那边的狩月人，帮帮我吧。",
                        npc: 818049,
                        next: 71005502,
                    },
                ],
            },
            {
                id: "17363193381637148",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005502,
                        content: "我，我好像听到前面有可怕的声音，你能帮我去看看吗？",
                        npc: 818049,
                    },
                ],
            },
            {
                id: "1736421027525708721",
                type: "TalkNode",
                name: "对话节点",
                next: ["17363168989182906", "17363171406525306", "17363217500712831557"],
                dialogues: [
                    {
                        id: 71005503,
                        content: "（你并未看到什么值得恐惧的东西，也许一切只是男子的错觉而已。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17363168841782593",
                type: "TalkNode",
                name: "放鱼分支",
                next: ["17363171290004843"],
                dialogues: [
                    {
                        id: 71005506,
                        content: "（几块金属卡在了水道旁，不时发出刺耳的声响。这大概就是吓到男子的声音。）",
                        npc: 800006,
                        next: 71005507,
                    },
                    {
                        id: 71005507,
                        content: "（你将金属捡起，因为金属永远不缺买家。等完成男子的委托就找个地方把它们卖掉吧。）",
                        npc: 800006,
                        next: 71005508,
                    },
                ],
            },
            {
                id: "17363168989182906",
                type: "TalkNode",
                name: "打秽兽分支",
                next: ["17363171406525306", "17363217500712831557"],
                dialogues: [
                    {
                        id: 71005504,
                        content: "（几只秽兽徘徊在水道上游，不时发出嘶哑的吼叫。这大概就是吓到男子的声音。）",
                        npc: 800006,
                        next: 71005508,
                    },
                ],
            },
            {
                id: "17363171290004843",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005508,
                        content: "我听不到可怕的声音了，谢谢你。",
                        npc: 818049,
                    },
                ],
            },
            {
                id: "17363217500712831557",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71005505,
                        content: "（所有秽兽被你击退，四周恢复了寂静。回去告诉男子吧。）",
                        npc: 800006,
                        next: 71005508,
                    },
                ],
            },
            {
                id: "17363171406525306",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005508,
                        content: "我听不到可怕的声音了，谢谢你。",
                        npc: 818049,
                    },
                ],
            },
        ],
    },
    {
        id: 206731,
        name: "可怕的声音",
        level: [1, 29],
        regionId: 1017,
        subRegionId: 101701,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17363166248501104",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71005501,
                        content: "那边的狩月人，帮帮我吧。",
                        npc: 818049,
                        next: 71005502,
                    },
                ],
            },
            {
                id: "17363193381637148",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005502,
                        content: "我，我好像听到前面有可怕的声音，你能帮我去看看吗？",
                        npc: 818049,
                    },
                ],
            },
            {
                id: "1736421027525708721",
                type: "TalkNode",
                name: "对话节点",
                next: ["17363168989182906", "17363171406525306", "17363217500712831557"],
                dialogues: [
                    {
                        id: 71005503,
                        content: "（你并未看到什么值得恐惧的东西，也许一切只是男子的错觉而已。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17363168841782593",
                type: "TalkNode",
                name: "放鱼分支",
                next: ["17363171290004843"],
                dialogues: [
                    {
                        id: 71005506,
                        content: "（几块金属卡在了水道旁，不时发出刺耳的声响。这大概就是吓到男子的声音。）",
                        npc: 800006,
                        next: 71005507,
                    },
                    {
                        id: 71005507,
                        content: "（你将金属捡起，因为金属永远不缺买家。等完成男子的委托就找个地方把它们卖掉吧。）",
                        npc: 800006,
                        next: 71005508,
                    },
                ],
            },
            {
                id: "17363168989182906",
                type: "TalkNode",
                name: "打秽兽分支",
                next: ["17363171406525306", "17363217500712831557"],
                dialogues: [
                    {
                        id: 71005504,
                        content: "（几只秽兽徘徊在水道上游，不时发出嘶哑的吼叫。这大概就是吓到男子的声音。）",
                        npc: 800006,
                        next: 71005508,
                    },
                ],
            },
            {
                id: "17363171290004843",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005508,
                        content: "我听不到可怕的声音了，谢谢你。",
                        npc: 818049,
                    },
                ],
            },
            {
                id: "17363217500712831557",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71005505,
                        content: "（所有秽兽被你击退，四周恢复了寂静。回去告诉男子吧。）",
                        npc: 800006,
                        next: 71005508,
                    },
                ],
            },
            {
                id: "17363171406525306",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005508,
                        content: "我听不到可怕的声音了，谢谢你。",
                        npc: 818049,
                    },
                ],
            },
        ],
    },
    {
        id: 206732,
        name: "可怕的声音",
        level: [30, 39],
        regionId: 1017,
        subRegionId: 101701,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17363166248501104",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71005501,
                        content: "那边的狩月人，帮帮我吧。",
                        npc: 818049,
                        next: 71005502,
                    },
                ],
            },
            {
                id: "17363193381637148",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005502,
                        content: "我，我好像听到前面有可怕的声音，你能帮我去看看吗？",
                        npc: 818049,
                    },
                ],
            },
            {
                id: "1736421027525708721",
                type: "TalkNode",
                name: "对话节点",
                next: ["17363168989182906", "17363171406525306", "17363217500712831557"],
                dialogues: [
                    {
                        id: 71005503,
                        content: "（你并未看到什么值得恐惧的东西，也许一切只是男子的错觉而已。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17363168841782593",
                type: "TalkNode",
                name: "放鱼分支",
                next: ["17363171290004843"],
                dialogues: [
                    {
                        id: 71005506,
                        content: "（几块金属卡在了水道旁，不时发出刺耳的声响。这大概就是吓到男子的声音。）",
                        npc: 800006,
                        next: 71005507,
                    },
                    {
                        id: 71005507,
                        content: "（你将金属捡起，因为金属永远不缺买家。等完成男子的委托就找个地方把它们卖掉吧。）",
                        npc: 800006,
                        next: 71005508,
                    },
                ],
            },
            {
                id: "17363168989182906",
                type: "TalkNode",
                name: "打秽兽分支",
                next: ["17363171406525306", "17363217500712831557"],
                dialogues: [
                    {
                        id: 71005504,
                        content: "（几只秽兽徘徊在水道上游，不时发出嘶哑的吼叫。这大概就是吓到男子的声音。）",
                        npc: 800006,
                        next: 71005508,
                    },
                ],
            },
            {
                id: "17363171290004843",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005508,
                        content: "我听不到可怕的声音了，谢谢你。",
                        npc: 818049,
                    },
                ],
            },
            {
                id: "17363217500712831557",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71005505,
                        content: "（所有秽兽被你击退，四周恢复了寂静。回去告诉男子吧。）",
                        npc: 800006,
                        next: 71005508,
                    },
                ],
            },
            {
                id: "17363171406525306",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005508,
                        content: "我听不到可怕的声音了，谢谢你。",
                        npc: 818049,
                    },
                ],
            },
        ],
    },
    {
        id: 206733,
        name: "可怕的声音",
        level: [40, 49],
        regionId: 1017,
        subRegionId: 101701,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17363166248501104",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71005501,
                        content: "那边的狩月人，帮帮我吧。",
                        npc: 818049,
                        next: 71005502,
                    },
                ],
            },
            {
                id: "17363193381637148",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005502,
                        content: "我，我好像听到前面有可怕的声音，你能帮我去看看吗？",
                        npc: 818049,
                    },
                ],
            },
            {
                id: "1736421027525708721",
                type: "TalkNode",
                name: "对话节点",
                next: ["17363168989182906", "17363171406525306", "17363217500712831557"],
                dialogues: [
                    {
                        id: 71005503,
                        content: "（你并未看到什么值得恐惧的东西，也许一切只是男子的错觉而已。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17363168841782593",
                type: "TalkNode",
                name: "放鱼分支",
                next: ["17363171290004843"],
                dialogues: [
                    {
                        id: 71005506,
                        content: "（几块金属卡在了水道旁，不时发出刺耳的声响。这大概就是吓到男子的声音。）",
                        npc: 800006,
                        next: 71005507,
                    },
                    {
                        id: 71005507,
                        content: "（你将金属捡起，因为金属永远不缺买家。等完成男子的委托就找个地方把它们卖掉吧。）",
                        npc: 800006,
                        next: 71005508,
                    },
                ],
            },
            {
                id: "17363168989182906",
                type: "TalkNode",
                name: "打秽兽分支",
                next: ["17363171406525306", "17363217500712831557"],
                dialogues: [
                    {
                        id: 71005504,
                        content: "（几只秽兽徘徊在水道上游，不时发出嘶哑的吼叫。这大概就是吓到男子的声音。）",
                        npc: 800006,
                        next: 71005508,
                    },
                ],
            },
            {
                id: "17363171290004843",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005508,
                        content: "我听不到可怕的声音了，谢谢你。",
                        npc: 818049,
                    },
                ],
            },
            {
                id: "17363217500712831557",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71005505,
                        content: "（所有秽兽被你击退，四周恢复了寂静。回去告诉男子吧。）",
                        npc: 800006,
                        next: 71005508,
                    },
                ],
            },
            {
                id: "17363171406525306",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005508,
                        content: "我听不到可怕的声音了，谢谢你。",
                        npc: 818049,
                    },
                ],
            },
        ],
    },
    {
        id: 206905,
        name: "迷糊渔人",
        level: [60, 65],
        regionId: 1017,
        subRegionId: 101702,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17364947210671145",
                type: "TalkNode",
                name: "开车",
                dialogues: [
                    {
                        id: 71005601,
                        content: "哼啊啊啊……好重……鱼线，拉不起来了……",
                        npc: 818050,
                        next: 71005602,
                    },
                ],
            },
            {
                id: "17364947631282168",
                type: "TalkNode",
                name: "交互请求清理垃圾",
                dialogues: [
                    {
                        id: 71005602,
                        content: "发生什么了？",
                        npc: 100001,
                        next: 71005603,
                    },
                    {
                        id: 71005603,
                        content: "狩月人是你啊，我的鱼线被下面几块垃圾缠住了，你能帮帮我吗？",
                        npc: 818050,
                        options: [
                            {
                                id: 710056031,
                                content: "（接受。）",
                                next: 71005604,
                            },
                            {
                                id: 710056032,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71005604,
                        content: "好，那我在这边拉，你去那边打碎垃圾。",
                        npc: 818050,
                        next: 71005605,
                    },
                ],
            },
            {
                id: "1736736311430703960",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005605,
                        content: "呼……拉起来了，谢谢你哈。",
                        npc: 818050,
                    },
                ],
            },
        ],
    },
    {
        id: 207005,
        name: "迷糊渔人",
        level: [60, 65],
        regionId: 1017,
        subRegionId: 101701,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17367648283143496",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71005701,
                        content: "救命啊，有没有人来救救我。",
                        npc: 818051,
                        next: 71005702,
                    },
                ],
            },
            {
                id: "17367648283143498",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005702,
                        content: "多谢……那个，能不能再帮我一个小忙。我逃跑的时候把鱼竿落在前面了，但那里还有几只秽兽……",
                        npc: 818051,
                        options: [
                            {
                                id: 710057021,
                                content: "（接受。）",
                                next: 71005703,
                            },
                            {
                                id: 710057022,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71005703,
                        content: "谢谢谢谢，我就在这等你哈。",
                        npc: 818051,
                        next: 71005704,
                    },
                ],
            },
            {
                id: "17367648283143505",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005704,
                        content: "就是这根鱼竿，谢谢你！",
                        npc: 818051,
                    },
                ],
            },
        ],
    },
    {
        id: 207213,
        name: "热情邀约",
        level: [40, 49],
        regionId: 1013,
        subRegionId: 101303,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17368526325511325",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71005801,
                        content: "喂，那边的狩月人，我这里有个大便宜要不要来看看。",
                        npc: 818052,
                        next: 71005802,
                    },
                ],
            },
            {
                id: "17369069666311814",
                type: "TalkNode",
                name: "交互对话",
                next: ["17369312020249563"],
                dialogues: [
                    {
                        id: 71005802,
                        content: "我在前面发现了一堆银辉石，但我实在拿不下了，就全让给你吧。有兴趣的话我就带你过去。",
                        npc: 818052,
                        options: [
                            {
                                id: 710058031,
                                content: "（接受。）",
                                next: 71005804,
                            },
                            {
                                id: 710058032,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71005804,
                        content: "好，跟我来。",
                        npc: 818052,
                        next: 71005805,
                    },
                ],
            },
            {
                id: "17369961811741692784",
                type: "TalkNode",
                name: "指示开车",
                dialogues: [
                    {
                        id: 71005805,
                        content: "第一批在这。",
                        npc: 818052,
                        next: 71005806,
                    },
                ],
            },
            {
                id: "17369312020249563",
                type: "TalkNode",
                name: "对话节点",
                next: ["173693147226712177"],
                dialogues: [
                    {
                        id: 71005806,
                        content: "前面还有，你还要吗？",
                        npc: 818052,
                        options: [
                            {
                                id: 710058061,
                                content: "当然，走吧。",
                                next: 71005807,
                            },
                            {
                                id: 710058062,
                                content: "算了，足够了。",
                                next: 71005814,
                                impr: [1011, "Wisdom", 1],
                            },
                        ],
                    },
                    {
                        id: 71005807,
                        content: "好，跟我来。",
                        npc: 818052,
                        next: 71005808,
                    },
                    {
                        id: 71005814,
                        content: "可恶，就差一点……不，我的意思是真可惜。那我就不打扰你了，再见。",
                        npc: 818052,
                    },
                ],
            },
            {
                id: "17369962024531693122",
                type: "TalkNode",
                name: "指示开车",
                dialogues: [
                    {
                        id: 71005808,
                        content: "第二批在这。",
                        npc: 818052,
                        next: 71005809,
                    },
                ],
            },
            {
                id: "173693147226712177",
                type: "TalkNode",
                name: "对话节点",
                next: ["17369387875972899393"],
                dialogues: [
                    {
                        id: 71005809,
                        content: "前面还有，你还要吗？",
                        npc: 818052,
                        options: [
                            {
                                id: 710058091,
                                content: "当然，走吧。",
                                next: 71005810,
                            },
                            {
                                id: 710058092,
                                content: "算了，足够了。",
                                next: 71005814,
                                impr: [1011, "Wisdom", 1],
                            },
                        ],
                    },
                    {
                        id: 71005810,
                        content: "好，你往前走就看到了。",
                        npc: 818052,
                        next: 71005811,
                    },
                    {
                        id: 71005814,
                        content: "可恶，就差一点……不，我的意思是真可惜。那我就不打扰你了，再见。",
                        npc: 818052,
                    },
                ],
            },
            {
                id: "17369950811591690932",
                type: "TalkNode",
                name: "动手开车对话",
                dialogues: [
                    {
                        id: 71005811,
                        content: "就是现在，兄弟们动手！",
                        npc: 818052,
                        next: 71005812,
                    },
                    {
                        id: 71005812,
                        content: "（显然银辉石都是这几名矿工装扮的强盗布置的陷阱，击退他们吧。）",
                        npc: 800006,
                        next: 71005813,
                    },
                ],
            },
            {
                id: "17369387875972899393",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005813,
                        content: "（你击退了所有人，现在可以清点一下今天的收获了。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 207214,
        name: "热情邀约",
        level: [50, 59],
        regionId: 1013,
        subRegionId: 101303,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17368526325511325",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71005801,
                        content: "喂，那边的狩月人，我这里有个大便宜要不要来看看。",
                        npc: 818052,
                        next: 71005802,
                    },
                ],
            },
            {
                id: "17369069666311814",
                type: "TalkNode",
                name: "交互对话",
                next: ["17369312020249563"],
                dialogues: [
                    {
                        id: 71005802,
                        content: "我在前面发现了一堆银辉石，但我实在拿不下了，就全让给你吧。有兴趣的话我就带你过去。",
                        npc: 818052,
                        options: [
                            {
                                id: 710058031,
                                content: "（接受。）",
                                next: 71005804,
                            },
                            {
                                id: 710058032,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71005804,
                        content: "好，跟我来。",
                        npc: 818052,
                        next: 71005805,
                    },
                ],
            },
            {
                id: "17369961811741692784",
                type: "TalkNode",
                name: "指示开车",
                dialogues: [
                    {
                        id: 71005805,
                        content: "第一批在这。",
                        npc: 818052,
                        next: 71005806,
                    },
                ],
            },
            {
                id: "17369312020249563",
                type: "TalkNode",
                name: "对话节点",
                next: ["173693147226712177"],
                dialogues: [
                    {
                        id: 71005806,
                        content: "前面还有，你还要吗？",
                        npc: 818052,
                        options: [
                            {
                                id: 710058061,
                                content: "当然，走吧。",
                                next: 71005807,
                            },
                            {
                                id: 710058062,
                                content: "算了，足够了。",
                                next: 71005814,
                                impr: [1011, "Wisdom", 1],
                            },
                        ],
                    },
                    {
                        id: 71005807,
                        content: "好，跟我来。",
                        npc: 818052,
                        next: 71005808,
                    },
                    {
                        id: 71005814,
                        content: "可恶，就差一点……不，我的意思是真可惜。那我就不打扰你了，再见。",
                        npc: 818052,
                    },
                ],
            },
            {
                id: "17369962024531693122",
                type: "TalkNode",
                name: "指示开车",
                dialogues: [
                    {
                        id: 71005808,
                        content: "第二批在这。",
                        npc: 818052,
                        next: 71005809,
                    },
                ],
            },
            {
                id: "173693147226712177",
                type: "TalkNode",
                name: "对话节点",
                next: ["17369387875972899393"],
                dialogues: [
                    {
                        id: 71005809,
                        content: "前面还有，你还要吗？",
                        npc: 818052,
                        options: [
                            {
                                id: 710058091,
                                content: "当然，走吧。",
                                next: 71005810,
                            },
                            {
                                id: 710058092,
                                content: "算了，足够了。",
                                next: 71005814,
                                impr: [1011, "Wisdom", 1],
                            },
                        ],
                    },
                    {
                        id: 71005810,
                        content: "好，你往前走就看到了。",
                        npc: 818052,
                        next: 71005811,
                    },
                    {
                        id: 71005814,
                        content: "可恶，就差一点……不，我的意思是真可惜。那我就不打扰你了，再见。",
                        npc: 818052,
                    },
                ],
            },
            {
                id: "17369950811591690932",
                type: "TalkNode",
                name: "动手开车对话",
                dialogues: [
                    {
                        id: 71005811,
                        content: "就是现在，兄弟们动手！",
                        npc: 818052,
                        next: 71005812,
                    },
                    {
                        id: 71005812,
                        content: "（显然银辉石都是这几名矿工装扮的强盗布置的陷阱，击退他们吧。）",
                        npc: 800006,
                        next: 71005813,
                    },
                ],
            },
            {
                id: "17369387875972899393",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005813,
                        content: "（你击退了所有人，现在可以清点一下今天的收获了。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 207233,
        name: "热情邀约",
        level: [40, 49],
        regionId: 1013,
        subRegionId: 101303,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17368526325511325",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71005801,
                        content: "喂，那边的狩月人，我这里有个大便宜要不要来看看。",
                        npc: 818052,
                        next: 71005802,
                    },
                ],
            },
            {
                id: "17369069666311814",
                type: "TalkNode",
                name: "交互对话",
                next: ["17369312020249563"],
                dialogues: [
                    {
                        id: 71005802,
                        content: "我在前面发现了一堆银辉石，但我实在拿不下了，就全让给你吧。有兴趣的话我就带你过去。",
                        npc: 818052,
                        options: [
                            {
                                id: 710058031,
                                content: "（接受。）",
                                next: 71005804,
                            },
                            {
                                id: 710058032,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71005804,
                        content: "好，跟我来。",
                        npc: 818052,
                        next: 71005805,
                    },
                ],
            },
            {
                id: "17369961811741692784",
                type: "TalkNode",
                name: "指示开车",
                dialogues: [
                    {
                        id: 71005805,
                        content: "第一批在这。",
                        npc: 818052,
                        next: 71005806,
                    },
                ],
            },
            {
                id: "17369312020249563",
                type: "TalkNode",
                name: "对话节点",
                next: ["173693147226712177"],
                dialogues: [
                    {
                        id: 71005806,
                        content: "前面还有，你还要吗？",
                        npc: 818052,
                        options: [
                            {
                                id: 710058061,
                                content: "当然，走吧。",
                                next: 71005807,
                            },
                            {
                                id: 710058062,
                                content: "算了，足够了。",
                                next: 71005814,
                                impr: [1011, "Wisdom", 1],
                            },
                        ],
                    },
                    {
                        id: 71005807,
                        content: "好，跟我来。",
                        npc: 818052,
                        next: 71005808,
                    },
                    {
                        id: 71005814,
                        content: "可恶，就差一点……不，我的意思是真可惜。那我就不打扰你了，再见。",
                        npc: 818052,
                    },
                ],
            },
            {
                id: "17369962024531693122",
                type: "TalkNode",
                name: "指示开车",
                dialogues: [
                    {
                        id: 71005808,
                        content: "第二批在这。",
                        npc: 818052,
                        next: 71005809,
                    },
                ],
            },
            {
                id: "173693147226712177",
                type: "TalkNode",
                name: "对话节点",
                next: ["17369387875972899393"],
                dialogues: [
                    {
                        id: 71005809,
                        content: "前面还有，你还要吗？",
                        npc: 818052,
                        options: [
                            {
                                id: 710058091,
                                content: "当然，走吧。",
                                next: 71005810,
                            },
                            {
                                id: 710058092,
                                content: "算了，足够了。",
                                next: 71005814,
                                impr: [1011, "Wisdom", 1],
                            },
                        ],
                    },
                    {
                        id: 71005810,
                        content: "好，你往前走就看到了。",
                        npc: 818052,
                        next: 71005811,
                    },
                    {
                        id: 71005814,
                        content: "可恶，就差一点……不，我的意思是真可惜。那我就不打扰你了，再见。",
                        npc: 818052,
                    },
                ],
            },
            {
                id: "17369950811591690932",
                type: "TalkNode",
                name: "动手开车对话",
                dialogues: [
                    {
                        id: 71005811,
                        content: "就是现在，兄弟们动手！",
                        npc: 818052,
                        next: 71005812,
                    },
                    {
                        id: 71005812,
                        content: "（显然银辉石都是这几名矿工装扮的强盗布置的陷阱，击退他们吧。）",
                        npc: 800006,
                        next: 71005813,
                    },
                ],
            },
            {
                id: "17369387875972899393",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005813,
                        content: "（你击退了所有人，现在可以清点一下今天的收获了。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 207234,
        name: "热情邀约",
        level: [50, 59],
        regionId: 1013,
        subRegionId: 101303,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17368526325511325",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71005801,
                        content: "喂，那边的狩月人，我这里有个大便宜要不要来看看。",
                        npc: 818052,
                        next: 71005802,
                    },
                ],
            },
            {
                id: "17369069666311814",
                type: "TalkNode",
                name: "交互对话",
                next: ["17369312020249563"],
                dialogues: [
                    {
                        id: 71005802,
                        content: "我在前面发现了一堆银辉石，但我实在拿不下了，就全让给你吧。有兴趣的话我就带你过去。",
                        npc: 818052,
                        options: [
                            {
                                id: 710058031,
                                content: "（接受。）",
                                next: 71005804,
                            },
                            {
                                id: 710058032,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71005804,
                        content: "好，跟我来。",
                        npc: 818052,
                        next: 71005805,
                    },
                ],
            },
            {
                id: "17369961811741692784",
                type: "TalkNode",
                name: "指示开车",
                dialogues: [
                    {
                        id: 71005805,
                        content: "第一批在这。",
                        npc: 818052,
                        next: 71005806,
                    },
                ],
            },
            {
                id: "17369312020249563",
                type: "TalkNode",
                name: "对话节点",
                next: ["173693147226712177"],
                dialogues: [
                    {
                        id: 71005806,
                        content: "前面还有，你还要吗？",
                        npc: 818052,
                        options: [
                            {
                                id: 710058061,
                                content: "当然，走吧。",
                                next: 71005807,
                            },
                            {
                                id: 710058062,
                                content: "算了，足够了。",
                                next: 71005814,
                                impr: [1011, "Wisdom", 1],
                            },
                        ],
                    },
                    {
                        id: 71005807,
                        content: "好，跟我来。",
                        npc: 818052,
                        next: 71005808,
                    },
                    {
                        id: 71005814,
                        content: "可恶，就差一点……不，我的意思是真可惜。那我就不打扰你了，再见。",
                        npc: 818052,
                    },
                ],
            },
            {
                id: "17369962024531693122",
                type: "TalkNode",
                name: "指示开车",
                dialogues: [
                    {
                        id: 71005808,
                        content: "第二批在这。",
                        npc: 818052,
                        next: 71005809,
                    },
                ],
            },
            {
                id: "173693147226712177",
                type: "TalkNode",
                name: "对话节点",
                next: ["17369387875972899393"],
                dialogues: [
                    {
                        id: 71005809,
                        content: "前面还有，你还要吗？",
                        npc: 818052,
                        options: [
                            {
                                id: 710058091,
                                content: "当然，走吧。",
                                next: 71005810,
                            },
                            {
                                id: 710058092,
                                content: "算了，足够了。",
                                next: 71005814,
                                impr: [1011, "Wisdom", 1],
                            },
                        ],
                    },
                    {
                        id: 71005810,
                        content: "好，你往前走就看到了。",
                        npc: 818052,
                        next: 71005811,
                    },
                    {
                        id: 71005814,
                        content: "可恶，就差一点……不，我的意思是真可惜。那我就不打扰你了，再见。",
                        npc: 818052,
                    },
                ],
            },
            {
                id: "17369950811591690932",
                type: "TalkNode",
                name: "动手开车对话",
                dialogues: [
                    {
                        id: 71005811,
                        content: "就是现在，兄弟们动手！",
                        npc: 818052,
                        next: 71005812,
                    },
                    {
                        id: 71005812,
                        content: "（显然银辉石都是这几名矿工装扮的强盗布置的陷阱，击退他们吧。）",
                        npc: 800006,
                        next: 71005813,
                    },
                ],
            },
            {
                id: "17369387875972899393",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005813,
                        content: "（你击退了所有人，现在可以清点一下今天的收获了。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 207315,
        name: "飞奔的爸爸",
        level: [60, 65],
        regionId: 1013,
        subRegionId: 101304,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17370095158092741",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71005901,
                        content: "爸爸跑得好快，所有人都输给你了！",
                        npc: 818053,
                        next: 71005902,
                    },
                ],
            },
            {
                id: "17370095398203147",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005902,
                        content: "又有人过来了。我告诉你哦，我爸爸跑得可快了，你要不要跟他比比看！",
                        npc: 818053,
                        options: [
                            {
                                id: 710059021,
                                content: "（接受。）",
                                next: 71005903,
                            },
                            {
                                id: 710059022,
                                content: "（拒绝。）",
                                next: 71005904,
                            },
                        ],
                    },
                    {
                        id: 71005903,
                        content: "咳，既然要比那就来吧。不过比之前我有几句话要跟你交代一下，请跟我来。",
                        npc: 818054,
                        next: 71005904,
                    },
                ],
            },
            {
                id: "17370098838126328",
                type: "TalkNode",
                name: "对话节点",
                next: ["173701090538818632", "173701131915125665", "173701133281625961", "173701124208323619"],
                dialogues: [
                    {
                        id: 71005904,
                        content: "这些钱你拿着，等会比的时候拜托你放放水哈……我……不想让儿子失望，所以就跟他编了个瞎话说谁都跑不过我。",
                        npc: 818054,
                        options: [
                            {
                                id: 710059041,
                                content: "原来是这样，交给我吧。",
                                next: 71005905,
                            },
                            {
                                id: 710059042,
                                content: "不行，要比就堂堂正正地比。",
                                next: 71005906,
                            },
                        ],
                    },
                    {
                        id: 71005905,
                        content: "谢谢，给你添麻烦了……",
                        npc: 818054,
                        next: 71005907,
                    },
                    {
                        id: 71005906,
                        content: "唉……好吧。",
                        npc: 818054,
                        next: 71005907,
                    },
                ],
            },
            {
                id: "17370099970278173",
                type: "TalkNode",
                name: "倒计时开车",
                next: ["173701131915125665", "173701133281625961", "173701124208323619"],
                dialogues: [
                    {
                        id: 71005907,
                        content: "那么比赛马上开始，爸爸加油哦！",
                        npc: 818053,
                        next: 71005908,
                    },
                    {
                        id: 71005908,
                        content: "三……",
                        npc: 818053,
                        next: 71005909,
                    },
                    {
                        id: 71005909,
                        content: "二……",
                        npc: 818053,
                        next: 71005910,
                    },
                    {
                        id: 71005910,
                        content: "一！",
                        npc: 818053,
                        next: 71005918,
                    },
                ],
            },
            {
                id: "173701090538818632",
                type: "TalkNode",
                name: "不放水跑赢",
                dialogues: [
                    {
                        id: 71005918,
                        content: "抱歉啊儿子，我输了……",
                        npc: 818054,
                        next: 71005919,
                    },
                    {
                        id: 71005919,
                        content: "没事的爸爸，这次只是失误！下次我们一起赢回来！",
                        npc: 818053,
                        next: 71005920,
                    },
                    {
                        id: 71005920,
                        content: "唉……好，好吧。也要谢谢这位狩月人了，这是你应得的奖品，都拿去吧。",
                        npc: 818054,
                    },
                ],
            },
            {
                id: "173701131915125665",
                type: "TalkNode",
                name: "放水跑赢",
                dialogues: [
                    {
                        id: 71005913,
                        content: "喂，这跟我们说好的不一样啊……",
                        npc: 818054,
                        next: 71005914,
                    },
                    {
                        id: 71005914,
                        content: "咦，说好的什么？",
                        npc: 818053,
                        next: 71005915,
                    },
                    {
                        id: 71005915,
                        content: "咳，没什么。抱歉啊儿子，我输了……",
                        npc: 818054,
                        next: 71005916,
                    },
                    {
                        id: 71005916,
                        content: "没事的爸爸，这次只是失误！下次我们一起赢回来！",
                        npc: 818053,
                        next: 71005917,
                    },
                    {
                        id: 71005917,
                        content: "唉……好，好吧。来，这是你应得的奖品，都拿去吧。",
                        npc: 818054,
                    },
                ],
            },
            {
                id: "173701133281625961",
                type: "TalkNode",
                name: "放水没跑赢",
                dialogues: [
                    {
                        id: 71005911,
                        content: "哇，爸爸真的好厉害！",
                        npc: 818053,
                        next: 71005912,
                    },
                    {
                        id: 71005912,
                        content: "谢谢……这是我的一点心意，都拿去吧。",
                        npc: 818054,
                    },
                ],
            },
            {
                id: "173701124208323619",
                type: "TalkNode",
                name: "不放水没跑赢",
                dialogues: [
                    {
                        id: 71005921,
                        content: "哇，爸爸真的好厉害！",
                        npc: 818053,
                        next: 71005922,
                    },
                    {
                        id: 71005922,
                        content: "嘿……你是故意的吧。谢谢……这是我的一点心意，都拿去吧。",
                        npc: 818054,
                    },
                ],
            },
        ],
    },
    {
        id: 207345,
        name: "飞奔的爸爸",
        level: [60, 65],
        regionId: 1013,
        subRegionId: 101304,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17370095158092741",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71005901,
                        content: "爸爸跑得好快，所有人都输给你了！",
                        npc: 818053,
                        next: 71005902,
                    },
                ],
            },
            {
                id: "17370095398203147",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005902,
                        content: "又有人过来了。我告诉你哦，我爸爸跑得可快了，你要不要跟他比比看！",
                        npc: 818053,
                        options: [
                            {
                                id: 710059021,
                                content: "（接受。）",
                                next: 71005903,
                            },
                            {
                                id: 710059022,
                                content: "（拒绝。）",
                                next: 71005904,
                            },
                        ],
                    },
                    {
                        id: 71005903,
                        content: "咳，既然要比那就来吧。不过比之前我有几句话要跟你交代一下，请跟我来。",
                        npc: 818054,
                        next: 71005904,
                    },
                ],
            },
            {
                id: "17370098838126328",
                type: "TalkNode",
                name: "对话节点",
                next: ["173701090538818632", "173701131915125665", "173701133281625961", "173701124208323619"],
                dialogues: [
                    {
                        id: 71005904,
                        content: "这些钱你拿着，等会比的时候拜托你放放水哈……我……不想让儿子失望，所以就跟他编了个瞎话说谁都跑不过我。",
                        npc: 818054,
                        options: [
                            {
                                id: 710059041,
                                content: "原来是这样，交给我吧。",
                                next: 71005905,
                            },
                            {
                                id: 710059042,
                                content: "不行，要比就堂堂正正地比。",
                                next: 71005906,
                            },
                        ],
                    },
                    {
                        id: 71005905,
                        content: "谢谢，给你添麻烦了……",
                        npc: 818054,
                        next: 71005907,
                    },
                    {
                        id: 71005906,
                        content: "唉……好吧。",
                        npc: 818054,
                        next: 71005907,
                    },
                ],
            },
            {
                id: "17370099970278173",
                type: "TalkNode",
                name: "倒计时开车",
                next: ["173701131915125665", "173701133281625961", "173701124208323619"],
                dialogues: [
                    {
                        id: 71005907,
                        content: "那么比赛马上开始，爸爸加油哦！",
                        npc: 818053,
                        next: 71005908,
                    },
                    {
                        id: 71005908,
                        content: "三……",
                        npc: 818053,
                        next: 71005909,
                    },
                    {
                        id: 71005909,
                        content: "二……",
                        npc: 818053,
                        next: 71005910,
                    },
                    {
                        id: 71005910,
                        content: "一！",
                        npc: 818053,
                        next: 71005918,
                    },
                ],
            },
            {
                id: "173701090538818632",
                type: "TalkNode",
                name: "不放水跑赢",
                dialogues: [
                    {
                        id: 71005918,
                        content: "抱歉啊儿子，我输了……",
                        npc: 818054,
                        next: 71005919,
                    },
                    {
                        id: 71005919,
                        content: "没事的爸爸，这次只是失误！下次我们一起赢回来！",
                        npc: 818053,
                        next: 71005920,
                    },
                    {
                        id: 71005920,
                        content: "唉……好，好吧。也要谢谢这位狩月人了，这是你应得的奖品，都拿去吧。",
                        npc: 818054,
                    },
                ],
            },
            {
                id: "173701131915125665",
                type: "TalkNode",
                name: "放水跑赢",
                dialogues: [
                    {
                        id: 71005913,
                        content: "喂，这跟我们说好的不一样啊……",
                        npc: 818054,
                        next: 71005914,
                    },
                    {
                        id: 71005914,
                        content: "咦，说好的什么？",
                        npc: 818053,
                        next: 71005915,
                    },
                    {
                        id: 71005915,
                        content: "咳，没什么。抱歉啊儿子，我输了……",
                        npc: 818054,
                        next: 71005916,
                    },
                    {
                        id: 71005916,
                        content: "没事的爸爸，这次只是失误！下次我们一起赢回来！",
                        npc: 818053,
                        next: 71005917,
                    },
                    {
                        id: 71005917,
                        content: "唉……好，好吧。来，这是你应得的奖品，都拿去吧。",
                        npc: 818054,
                    },
                ],
            },
            {
                id: "173701133281625961",
                type: "TalkNode",
                name: "放水没跑赢",
                dialogues: [
                    {
                        id: 71005911,
                        content: "哇，爸爸真的好厉害！",
                        npc: 818053,
                        next: 71005912,
                    },
                    {
                        id: 71005912,
                        content: "谢谢……这是我的一点心意，都拿去吧。",
                        npc: 818054,
                    },
                ],
            },
            {
                id: "173701124208323619",
                type: "TalkNode",
                name: "不放水没跑赢",
                dialogues: [
                    {
                        id: 71005921,
                        content: "哇，爸爸真的好厉害！",
                        npc: 818053,
                        next: 71005922,
                    },
                    {
                        id: 71005922,
                        content: "嘿……你是故意的吧。谢谢……这是我的一点心意，都拿去吧。",
                        npc: 818054,
                    },
                ],
            },
        ],
    },
    {
        id: 207355,
        name: "飞奔的爸爸",
        level: [60, 65],
        regionId: 1013,
        subRegionId: 101304,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17370095158092741",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71005901,
                        content: "爸爸跑得好快，所有人都输给你了！",
                        npc: 818053,
                        next: 71005902,
                    },
                ],
            },
            {
                id: "17370095398203147",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005902,
                        content: "又有人过来了。我告诉你哦，我爸爸跑得可快了，你要不要跟他比比看！",
                        npc: 818053,
                        options: [
                            {
                                id: 710059021,
                                content: "（接受。）",
                                next: 71005903,
                            },
                            {
                                id: 710059022,
                                content: "（拒绝。）",
                                next: 71005904,
                            },
                        ],
                    },
                    {
                        id: 71005903,
                        content: "咳，既然要比那就来吧。不过比之前我有几句话要跟你交代一下，请跟我来。",
                        npc: 818054,
                        next: 71005904,
                    },
                ],
            },
            {
                id: "17370098838126328",
                type: "TalkNode",
                name: "对话节点",
                next: ["173701090538818632", "173701131915125665", "173701133281625961", "173701124208323619"],
                dialogues: [
                    {
                        id: 71005904,
                        content: "这些钱你拿着，等会比的时候拜托你放放水哈……我……不想让儿子失望，所以就跟他编了个瞎话说谁都跑不过我。",
                        npc: 818054,
                        options: [
                            {
                                id: 710059041,
                                content: "原来是这样，交给我吧。",
                                next: 71005905,
                            },
                            {
                                id: 710059042,
                                content: "不行，要比就堂堂正正地比。",
                                next: 71005906,
                            },
                        ],
                    },
                    {
                        id: 71005905,
                        content: "谢谢，给你添麻烦了……",
                        npc: 818054,
                        next: 71005907,
                    },
                    {
                        id: 71005906,
                        content: "唉……好吧。",
                        npc: 818054,
                        next: 71005907,
                    },
                ],
            },
            {
                id: "17370099970278173",
                type: "TalkNode",
                name: "倒计时开车",
                next: ["173701131915125665", "173701133281625961", "173701124208323619"],
                dialogues: [
                    {
                        id: 71005907,
                        content: "那么比赛马上开始，爸爸加油哦！",
                        npc: 818053,
                        next: 71005908,
                    },
                    {
                        id: 71005908,
                        content: "三……",
                        npc: 818053,
                        next: 71005909,
                    },
                    {
                        id: 71005909,
                        content: "二……",
                        npc: 818053,
                        next: 71005910,
                    },
                    {
                        id: 71005910,
                        content: "一！",
                        npc: 818053,
                        next: 71005918,
                    },
                ],
            },
            {
                id: "173701090538818632",
                type: "TalkNode",
                name: "不放水跑赢",
                dialogues: [
                    {
                        id: 71005918,
                        content: "抱歉啊儿子，我输了……",
                        npc: 818054,
                        next: 71005919,
                    },
                    {
                        id: 71005919,
                        content: "没事的爸爸，这次只是失误！下次我们一起赢回来！",
                        npc: 818053,
                        next: 71005920,
                    },
                    {
                        id: 71005920,
                        content: "唉……好，好吧。也要谢谢这位狩月人了，这是你应得的奖品，都拿去吧。",
                        npc: 818054,
                    },
                ],
            },
            {
                id: "173701131915125665",
                type: "TalkNode",
                name: "放水跑赢",
                dialogues: [
                    {
                        id: 71005913,
                        content: "喂，这跟我们说好的不一样啊……",
                        npc: 818054,
                        next: 71005914,
                    },
                    {
                        id: 71005914,
                        content: "咦，说好的什么？",
                        npc: 818053,
                        next: 71005915,
                    },
                    {
                        id: 71005915,
                        content: "咳，没什么。抱歉啊儿子，我输了……",
                        npc: 818054,
                        next: 71005916,
                    },
                    {
                        id: 71005916,
                        content: "没事的爸爸，这次只是失误！下次我们一起赢回来！",
                        npc: 818053,
                        next: 71005917,
                    },
                    {
                        id: 71005917,
                        content: "唉……好，好吧。来，这是你应得的奖品，都拿去吧。",
                        npc: 818054,
                    },
                ],
            },
            {
                id: "173701133281625961",
                type: "TalkNode",
                name: "放水没跑赢",
                dialogues: [
                    {
                        id: 71005911,
                        content: "哇，爸爸真的好厉害！",
                        npc: 818053,
                        next: 71005912,
                    },
                    {
                        id: 71005912,
                        content: "谢谢……这是我的一点心意，都拿去吧。",
                        npc: 818054,
                    },
                ],
            },
            {
                id: "173701124208323619",
                type: "TalkNode",
                name: "不放水没跑赢",
                dialogues: [
                    {
                        id: 71005921,
                        content: "哇，爸爸真的好厉害！",
                        npc: 818053,
                        next: 71005922,
                    },
                    {
                        id: 71005922,
                        content: "嘿……你是故意的吧。谢谢……这是我的一点心意，都拿去吧。",
                        npc: 818054,
                    },
                ],
            },
        ],
    },
    {
        id: 207614,
        name: "皎皎特快，送啥都快",
        level: [50, 59],
        regionId: 1013,
        subRegionId: 101301,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17370949494471445",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71006101,
                        content: "咱不想……不想……不想上工啊……",
                        npc: 818019,
                        next: 71006102,
                    },
                ],
            },
            {
                id: "173710110520812569",
                type: "TalkNode",
                name: "对话节点",
                next: ["173710125978814418", "17371087069472206713"],
                dialogues: [
                    {
                        id: 71006102,
                        content: "可恶……怎么这次还要往废矿送吃的啊。大家就不能挑点正常的地方吃饭吗！不怕出事吗！跑死我了……",
                        npc: 818019,
                        next: 71006103,
                    },
                    {
                        id: 71006103,
                        content: "需要帮忙吗？",
                        npc: 100001,
                        next: 71006104,
                    },
                    {
                        id: 71006104,
                        content: "需要！这下面全是秽兽我过不去，你帮我把这份吃的送过去吧。",
                        npc: 818019,
                        next: 71006105,
                    },
                    {
                        id: 71006105,
                        content: "好，交给我吧。",
                        npc: 100001,
                        next: 71006106,
                    },
                ],
            },
            {
                id: "17371094338652208400",
                type: "TalkNode",
                name: "对话节点",
                next: ["17371087069472206713"],
                dialogues: [
                    {
                        id: 71006106,
                        content: "（大批秽兽拦住了你的去路，击退它们再过去吧。）",
                        npc: 800006,
                        next: 71006108,
                    },
                ],
            },
            {
                id: "173710125978814418",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006108,
                        content: "你好，你订的饭送到了。",
                        npc: 100001,
                        next: 71006109,
                    },
                    {
                        id: 71006109,
                        content: "我看看，这都洒成什么样子，根本没法吃啊！银色和平餐厅这新服务真是不靠谱！",
                        npc: 818058,
                        options: [
                            {
                                id: 710061091,
                                content: "抱歉，可能是击退秽兽时候洒出来的。",
                                next: 71006110,
                                impr: [1011, "Benefit", 1],
                            },
                            {
                                id: 710061092,
                                content: "怎么不能吃，我给你示范一下。",
                                next: 71006111,
                                impr: [1011, "Chaos", 1],
                            },
                        ],
                    },
                    {
                        id: 71006110,
                        content: "这样啊……那你来送餐，比我写论文也简单不了多少。算了，这些给你，刚刚凶了你不好意思啊。",
                        npc: 818058,
                    },
                    {
                        id: 71006111,
                        content: "（你当着地质学者的面快速吃完了饭菜。）",
                        npc: 800006,
                        next: 71006112,
                    },
                    {
                        id: 71006112,
                        content:
                            "慢点慢点，要是我害你噎死了怎么办……唉……你来送餐，比我写论文也简单不了多少。算了，这些给你，刚刚凶了你不好意思啊。",
                        npc: 818058,
                    },
                ],
            },
            {
                id: "17371087069472206713",
                type: "TalkNode",
                name: "还没送到抱怨",
                dialogues: [
                    {
                        id: 71006107,
                        content: "怎么还没送到……",
                        npc: 818058,
                    },
                ],
            },
        ],
    },
    {
        id: 207615,
        name: "皎皎特快，送啥都快",
        level: [60, 65],
        regionId: 1013,
        subRegionId: 101301,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17370949494471445",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71006101,
                        content: "咱不想……不想……不想上工啊……",
                        npc: 818019,
                        next: 71006102,
                    },
                ],
            },
            {
                id: "173710110520812569",
                type: "TalkNode",
                name: "对话节点",
                next: ["173710125978814418", "17371087069472206713"],
                dialogues: [
                    {
                        id: 71006102,
                        content: "可恶……怎么这次还要往废矿送吃的啊。大家就不能挑点正常的地方吃饭吗！不怕出事吗！跑死我了……",
                        npc: 818019,
                        next: 71006103,
                    },
                    {
                        id: 71006103,
                        content: "需要帮忙吗？",
                        npc: 100001,
                        next: 71006104,
                    },
                    {
                        id: 71006104,
                        content: "需要！这下面全是秽兽我过不去，你帮我把这份吃的送过去吧。",
                        npc: 818019,
                        next: 71006105,
                    },
                    {
                        id: 71006105,
                        content: "好，交给我吧。",
                        npc: 100001,
                        next: 71006106,
                    },
                ],
            },
            {
                id: "17371094338652208400",
                type: "TalkNode",
                name: "对话节点",
                next: ["17371087069472206713"],
                dialogues: [
                    {
                        id: 71006106,
                        content: "（大批秽兽拦住了你的去路，击退它们再过去吧。）",
                        npc: 800006,
                        next: 71006108,
                    },
                ],
            },
            {
                id: "173710125978814418",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006108,
                        content: "你好，你订的饭送到了。",
                        npc: 100001,
                        next: 71006109,
                    },
                    {
                        id: 71006109,
                        content: "我看看，这都洒成什么样子，根本没法吃啊！银色和平餐厅这新服务真是不靠谱！",
                        npc: 818058,
                        options: [
                            {
                                id: 710061091,
                                content: "抱歉，可能是击退秽兽时候洒出来的。",
                                next: 71006110,
                                impr: [1011, "Benefit", 1],
                            },
                            {
                                id: 710061092,
                                content: "怎么不能吃，我给你示范一下。",
                                next: 71006111,
                                impr: [1011, "Chaos", 1],
                            },
                        ],
                    },
                    {
                        id: 71006110,
                        content: "这样啊……那你来送餐，比我写论文也简单不了多少。算了，这些给你，刚刚凶了你不好意思啊。",
                        npc: 818058,
                    },
                    {
                        id: 71006111,
                        content: "（你当着地质学者的面快速吃完了饭菜。）",
                        npc: 800006,
                        next: 71006112,
                    },
                    {
                        id: 71006112,
                        content:
                            "慢点慢点，要是我害你噎死了怎么办……唉……你来送餐，比我写论文也简单不了多少。算了，这些给你，刚刚凶了你不好意思啊。",
                        npc: 818058,
                    },
                ],
            },
            {
                id: "17371087069472206713",
                type: "TalkNode",
                name: "还没送到抱怨",
                dialogues: [
                    {
                        id: 71006107,
                        content: "怎么还没送到……",
                        npc: 818058,
                    },
                ],
            },
        ],
    },
    {
        id: 207654,
        name: "皎皎特快，送啥都快",
        level: [50, 59],
        regionId: 1013,
        subRegionId: 101301,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17370949494471445",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71006101,
                        content: "咱不想……不想……不想上工啊……",
                        npc: 818019,
                        next: 71006102,
                    },
                ],
            },
            {
                id: "173710110520812569",
                type: "TalkNode",
                name: "对话节点",
                next: ["173710125978814418", "17371087069472206713"],
                dialogues: [
                    {
                        id: 71006102,
                        content: "可恶……怎么这次还要往废矿送吃的啊。大家就不能挑点正常的地方吃饭吗！不怕出事吗！跑死我了……",
                        npc: 818019,
                        next: 71006103,
                    },
                    {
                        id: 71006103,
                        content: "需要帮忙吗？",
                        npc: 100001,
                        next: 71006104,
                    },
                    {
                        id: 71006104,
                        content: "需要！这下面全是秽兽我过不去，你帮我把这份吃的送过去吧。",
                        npc: 818019,
                        next: 71006105,
                    },
                    {
                        id: 71006105,
                        content: "好，交给我吧。",
                        npc: 100001,
                        next: 71006106,
                    },
                ],
            },
            {
                id: "17371094338652208400",
                type: "TalkNode",
                name: "对话节点",
                next: ["17371087069472206713"],
                dialogues: [
                    {
                        id: 71006106,
                        content: "（大批秽兽拦住了你的去路，击退它们再过去吧。）",
                        npc: 800006,
                        next: 71006108,
                    },
                ],
            },
            {
                id: "173710125978814418",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006108,
                        content: "你好，你订的饭送到了。",
                        npc: 100001,
                        next: 71006109,
                    },
                    {
                        id: 71006109,
                        content: "我看看，这都洒成什么样子，根本没法吃啊！银色和平餐厅这新服务真是不靠谱！",
                        npc: 818058,
                        options: [
                            {
                                id: 710061091,
                                content: "抱歉，可能是击退秽兽时候洒出来的。",
                                next: 71006110,
                                impr: [1011, "Benefit", 1],
                            },
                            {
                                id: 710061092,
                                content: "怎么不能吃，我给你示范一下。",
                                next: 71006111,
                                impr: [1011, "Chaos", 1],
                            },
                        ],
                    },
                    {
                        id: 71006110,
                        content: "这样啊……那你来送餐，比我写论文也简单不了多少。算了，这些给你，刚刚凶了你不好意思啊。",
                        npc: 818058,
                    },
                    {
                        id: 71006111,
                        content: "（你当着地质学者的面快速吃完了饭菜。）",
                        npc: 800006,
                        next: 71006112,
                    },
                    {
                        id: 71006112,
                        content:
                            "慢点慢点，要是我害你噎死了怎么办……唉……你来送餐，比我写论文也简单不了多少。算了，这些给你，刚刚凶了你不好意思啊。",
                        npc: 818058,
                    },
                ],
            },
            {
                id: "17371087069472206713",
                type: "TalkNode",
                name: "还没送到抱怨",
                dialogues: [
                    {
                        id: 71006107,
                        content: "怎么还没送到……",
                        npc: 818058,
                    },
                ],
            },
        ],
    },
    {
        id: 207655,
        name: "皎皎特快，送啥都快",
        level: [60, 65],
        regionId: 1013,
        subRegionId: 101301,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "17370949494471445",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71006101,
                        content: "咱不想……不想……不想上工啊……",
                        npc: 818019,
                        next: 71006102,
                    },
                ],
            },
            {
                id: "173710110520812569",
                type: "TalkNode",
                name: "对话节点",
                next: ["173710125978814418", "17371087069472206713"],
                dialogues: [
                    {
                        id: 71006102,
                        content: "可恶……怎么这次还要往废矿送吃的啊。大家就不能挑点正常的地方吃饭吗！不怕出事吗！跑死我了……",
                        npc: 818019,
                        next: 71006103,
                    },
                    {
                        id: 71006103,
                        content: "需要帮忙吗？",
                        npc: 100001,
                        next: 71006104,
                    },
                    {
                        id: 71006104,
                        content: "需要！这下面全是秽兽我过不去，你帮我把这份吃的送过去吧。",
                        npc: 818019,
                        next: 71006105,
                    },
                    {
                        id: 71006105,
                        content: "好，交给我吧。",
                        npc: 100001,
                        next: 71006106,
                    },
                ],
            },
            {
                id: "17371094338652208400",
                type: "TalkNode",
                name: "对话节点",
                next: ["17371087069472206713"],
                dialogues: [
                    {
                        id: 71006106,
                        content: "（大批秽兽拦住了你的去路，击退它们再过去吧。）",
                        npc: 800006,
                        next: 71006108,
                    },
                ],
            },
            {
                id: "173710125978814418",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006108,
                        content: "你好，你订的饭送到了。",
                        npc: 100001,
                        next: 71006109,
                    },
                    {
                        id: 71006109,
                        content: "我看看，这都洒成什么样子，根本没法吃啊！银色和平餐厅这新服务真是不靠谱！",
                        npc: 818058,
                        options: [
                            {
                                id: 710061091,
                                content: "抱歉，可能是击退秽兽时候洒出来的。",
                                next: 71006110,
                                impr: [1011, "Benefit", 1],
                            },
                            {
                                id: 710061092,
                                content: "怎么不能吃，我给你示范一下。",
                                next: 71006111,
                                impr: [1011, "Chaos", 1],
                            },
                        ],
                    },
                    {
                        id: 71006110,
                        content: "这样啊……那你来送餐，比我写论文也简单不了多少。算了，这些给你，刚刚凶了你不好意思啊。",
                        npc: 818058,
                    },
                    {
                        id: 71006111,
                        content: "（你当着地质学者的面快速吃完了饭菜。）",
                        npc: 800006,
                        next: 71006112,
                    },
                    {
                        id: 71006112,
                        content:
                            "慢点慢点，要是我害你噎死了怎么办……唉……你来送餐，比我写论文也简单不了多少。算了，这些给你，刚刚凶了你不好意思啊。",
                        npc: 818058,
                    },
                ],
            },
            {
                id: "17371087069472206713",
                type: "TalkNode",
                name: "还没送到抱怨",
                dialogues: [
                    {
                        id: 71006107,
                        content: "怎么还没送到……",
                        npc: 818058,
                    },
                ],
            },
        ],
    },
    {
        id: 207704,
        name: "迷糊渔人",
        level: [50, 59],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1738810932370255229",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71006201,
                        content: "今天怎么回事，这么久了一条鱼都没上钩。",
                        npc: 818055,
                        next: 71006202,
                    },
                ],
            },
            {
                id: "1738811009911256418",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006202,
                        content: "狩月人你来啦，我怀疑这地方今天根本没有鱼，你能不能帮我试试？",
                        npc: 818055,
                    },
                ],
            },
            {
                id: "17390122111993040227",
                type: "TalkNode",
                name: "接受对话",
                dialogues: [
                    {
                        id: 71006203,
                        content: "好，拜托你了。",
                        npc: 818055,
                        next: 71006205,
                    },
                ],
            },
            {
                id: "1738811061261257593",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006205,
                        content: "太厉害了，一下就钓上来了。看来不是地方的问题。",
                        npc: 818055,
                        next: 71006206,
                    },
                    {
                        id: 71006206,
                        content: "谢谢你帮我验证了一下哈，我自己再在这里试试看。今天绝对不能再提着空桶回去了！",
                        npc: 818055,
                    },
                ],
            },
        ],
    },
    {
        id: 207705,
        name: "迷糊渔人",
        level: [60, 65],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1738810932370255229",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71006201,
                        content: "今天怎么回事，这么久了一条鱼都没上钩。",
                        npc: 818055,
                        next: 71006202,
                    },
                ],
            },
            {
                id: "1738811009911256418",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006202,
                        content: "狩月人你来啦，我怀疑这地方今天根本没有鱼，你能不能帮我试试？",
                        npc: 818055,
                    },
                ],
            },
            {
                id: "17390122111993040227",
                type: "TalkNode",
                name: "接受对话",
                dialogues: [
                    {
                        id: 71006203,
                        content: "好，拜托你了。",
                        npc: 818055,
                        next: 71006205,
                    },
                ],
            },
            {
                id: "1738811061261257593",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006205,
                        content: "太厉害了，一下就钓上来了。看来不是地方的问题。",
                        npc: 818055,
                        next: 71006206,
                    },
                    {
                        id: 71006206,
                        content: "谢谢你帮我验证了一下哈，我自己再在这里试试看。今天绝对不能再提着空桶回去了！",
                        npc: 818055,
                    },
                ],
            },
        ],
    },
    {
        id: 207804,
        name: "迷糊渔人",
        level: [50, 59],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1750236994566369197",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006301,
                        content: "救命啊，有没有人来救救我。",
                        npc: 818056,
                        next: 71006302,
                    },
                ],
            },
            {
                id: "1750236994566369198",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006302,
                        content: "多谢……那个，能不能再帮我一个小忙。我这几天一条鱼都没钓上，回去总被大家笑话。你能不能帮我钓一条呢。",
                        npc: 818056,
                    },
                ],
            },
            {
                id: "1750236994566369199",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006303,
                        content: "谢谢谢谢，桶我给你放边上了哈。",
                        npc: 818056,
                        next: 71006305,
                    },
                ],
            },
            {
                id: "1750236994566369201",
                type: "TalkNode",
                name: "钓鱼成功对话",
                dialogues: [
                    {
                        id: 71006305,
                        content: "太好了，今天终于不用被大伙嘲笑了！这是我的谢礼，真是辛苦你啦。",
                        npc: 818056,
                    },
                ],
            },
        ],
    },
    {
        id: 207805,
        name: "迷糊渔人",
        level: [60, 65],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1750236994566369197",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006301,
                        content: "救命啊，有没有人来救救我。",
                        npc: 818056,
                        next: 71006302,
                    },
                ],
            },
            {
                id: "1750236994566369198",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006302,
                        content: "多谢……那个，能不能再帮我一个小忙。我这几天一条鱼都没钓上，回去总被大家笑话。你能不能帮我钓一条呢。",
                        npc: 818056,
                    },
                ],
            },
            {
                id: "1750236994566369199",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006303,
                        content: "谢谢谢谢，桶我给你放边上了哈。",
                        npc: 818056,
                        next: 71006305,
                    },
                ],
            },
            {
                id: "1750236994566369201",
                type: "TalkNode",
                name: "钓鱼成功对话",
                dialogues: [
                    {
                        id: 71006305,
                        content: "太好了，今天终于不用被大伙嘲笑了！这是我的谢礼，真是辛苦你啦。",
                        npc: 818056,
                    },
                ],
            },
        ],
    },
    {
        id: 207903,
        name: "探险家小委托！",
        level: [40, 49],
        regionId: 1017,
        subRegionId: 101701,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1741155805076177",
                type: "TalkNode",
                name: "皎皎开车对话",
                dialogues: [
                    {
                        id: 71001701,
                        content: "诶，那不是{nickname}吗，快来快来。",
                        npc: 818012,
                        next: 71001702,
                    },
                ],
            },
            {
                id: "1741155805076178",
                type: "TalkNode",
                name: "皎皎选项对话",
                next: ["1741155805079200", "1741155805077185", "1741155805078192"],
                dialogues: [
                    {
                        id: 71001702,
                        content: "哼嗯，我得好好研究一下这里，你可要保护好我哦。",
                        npc: 818012,
                        options: [
                            {
                                id: 710017021,
                                content: "（接受。）",
                                next: 71001703,
                            },
                            {
                                id: 710017022,
                                content: "（拒绝。）",
                                next: 71001707,
                            },
                        ],
                    },
                    {
                        id: 71001707,
                        content: "唔……你不陪我的话，那我就还是早点离开吧，这里给人的感觉阴森森的……",
                        npc: 818012,
                    },
                ],
            },
            {
                id: "1741155805078191",
                type: "TalkNode",
                name: "皎皎开车对话",
                next: ["1741155805077185", "1741155805078192"],
                dialogues: [
                    {
                        id: 71001703,
                        content: "怎么每次我一研究就有坏家伙跑出来打扰呀，交给你啦！我正研究到关键的地方呢。",
                        npc: 818012,
                        next: 71001704,
                    },
                ],
            },
            {
                id: "1741155805079200",
                type: "TalkNode",
                name: "皎皎开车对话",
                next: ["1741155805078192"],
                dialogues: [
                    {
                        id: 71001704,
                        content: "这里这样，再这样……嗯……快了快了，再等等哈。",
                        npc: 818012,
                        next: 71001706,
                    },
                ],
            },
            {
                id: "1741155805077185",
                type: "TalkNode",
                name: "结束对话",
                dialogues: [
                    {
                        id: 71001706,
                        content: "还好有你在，本次考察圆满结束喽！这是一点小心意，下次也拜托你啦~",
                        npc: 818012,
                    },
                ],
            },
            {
                id: "1741155805078192",
                type: "TalkNode",
                name: "皎皎开车对话",
                next: ["1741155805077185"],
                dialogues: [
                    {
                        id: 71001705,
                        content: "没错，就是这样！好耶，研究完成！",
                        npc: 818012,
                        next: 71001706,
                    },
                ],
            },
        ],
    },
    {
        id: 208503,
        name: "无由生的执念",
        level: [40, 49],
        regionId: 1041,
        subRegionId: 104104,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17491097954873071",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006601,
                        content: "好想要小青蛙呀，咕咕呱呱呱。",
                        npc: 818062,
                        next: 71006602,
                    },
                ],
            },
            {
                id: "17491100586673470",
                type: "TalkNode",
                name: "对话节点",
                next: ["17495423373383106626"],
                dialogues: [
                    {
                        id: 71006602,
                        content: "小青蛙，好想要小青蛙，小青蛙小青蛙小青蛙。",
                        npc: 818062,
                        options: [
                            {
                                id: 710066021,
                                content: "（帮它解决执念。）",
                                next: 71006603,
                            },
                            {
                                id: 710066022,
                                content: "（默默离开。）",
                            },
                        ],
                    },
                    {
                        id: 71006603,
                        content: "（它似乎对青蛙有什么执念，帮它找找看吧。）",
                        npc: 100001,
                        next: 71006604,
                    },
                ],
            },
            {
                id: "17491109520566341",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006604,
                        content: "这些应该足够了，回去交给它吧。",
                        npc: 100001,
                        next: 71006605,
                    },
                ],
            },
            {
                id: "17495423373383106626",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006605,
                        content: "小青蛙，好耶，小青蛙，好～咕呱咕呱。",
                        npc: 818062,
                        next: 71006606,
                    },
                    {
                        id: 71006606,
                        content: "（就这样，无由生消失在了你的面前。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 208504,
        name: "无由生的执念",
        level: [50, 59],
        regionId: 1041,
        subRegionId: 104104,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17491097954873071",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006601,
                        content: "好想要小青蛙呀，咕咕呱呱呱。",
                        npc: 818062,
                        next: 71006602,
                    },
                ],
            },
            {
                id: "17491100586673470",
                type: "TalkNode",
                name: "对话节点",
                next: ["17495423373383106626"],
                dialogues: [
                    {
                        id: 71006602,
                        content: "小青蛙，好想要小青蛙，小青蛙小青蛙小青蛙。",
                        npc: 818062,
                        options: [
                            {
                                id: 710066021,
                                content: "（帮它解决执念。）",
                                next: 71006603,
                            },
                            {
                                id: 710066022,
                                content: "（默默离开。）",
                            },
                        ],
                    },
                    {
                        id: 71006603,
                        content: "（它似乎对青蛙有什么执念，帮它找找看吧。）",
                        npc: 100001,
                        next: 71006604,
                    },
                ],
            },
            {
                id: "17491109520566341",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006604,
                        content: "这些应该足够了，回去交给它吧。",
                        npc: 100001,
                        next: 71006605,
                    },
                ],
            },
            {
                id: "17495423373383106626",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006605,
                        content: "小青蛙，好耶，小青蛙，好～咕呱咕呱。",
                        npc: 818062,
                        next: 71006606,
                    },
                    {
                        id: 71006606,
                        content: "（就这样，无由生消失在了你的面前。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 208604,
        name: "百年春留念",
        level: [50, 59],
        regionId: 1041,
        subRegionId: 104110,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1735279803250236065",
                type: "TalkNode",
                name: "拍照开车",
                dialogues: [
                    {
                        id: 71006801,
                        content: "喂，那边的朋友，能帮我拍张照吗？",
                        npc: 818041,
                        next: 71006802,
                    },
                ],
            },
            {
                id: "1735279818413236380",
                type: "TalkNode",
                name: "交互开车",
                dialogues: [
                    {
                        id: 71006802,
                        content: "这位朋友，你能帮我拍几张照片吗？难得来一趟百年春，不留点合影就太可惜了。",
                        npc: 818041,
                        options: [
                            {
                                id: 710068021,
                                content: "（接受。）",
                                next: 71006804,
                            },
                            {
                                id: 710068022,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71006804,
                        content: "太好了，记得把我后面的这条白龙也拍进去哦，我很喜欢它的造型。",
                        npc: 818041,
                        next: 71006805,
                    },
                ],
            },
            {
                id: "1735279994504939388",
                type: "TalkNode",
                name: "完成对话",
                dialogues: [
                    {
                        id: 71006805,
                        content: "你拍得也太好了，真棒呀，多谢多谢。",
                        npc: 818041,
                    },
                ],
            },
        ],
    },
    {
        id: 208605,
        name: "百年春留念",
        level: [60, 65],
        regionId: 1041,
        subRegionId: 104110,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1735279803250236065",
                type: "TalkNode",
                name: "拍照开车",
                dialogues: [
                    {
                        id: 71006801,
                        content: "喂，那边的朋友，能帮我拍张照吗？",
                        npc: 818041,
                        next: 71006802,
                    },
                ],
            },
            {
                id: "1735279818413236380",
                type: "TalkNode",
                name: "交互开车",
                dialogues: [
                    {
                        id: 71006802,
                        content: "这位朋友，你能帮我拍几张照片吗？难得来一趟百年春，不留点合影就太可惜了。",
                        npc: 818041,
                        options: [
                            {
                                id: 710068021,
                                content: "（接受。）",
                                next: 71006804,
                            },
                            {
                                id: 710068022,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71006804,
                        content: "太好了，记得把我后面的这条白龙也拍进去哦，我很喜欢它的造型。",
                        npc: 818041,
                        next: 71006805,
                    },
                ],
            },
            {
                id: "1735279994504939388",
                type: "TalkNode",
                name: "完成对话",
                dialogues: [
                    {
                        id: 71006805,
                        content: "你拍得也太好了，真棒呀，多谢多谢。",
                        npc: 818041,
                    },
                ],
            },
        ],
    },
    {
        id: 208723,
        name: "永不下课",
        level: [40, 49],
        regionId: 1041,
        subRegionId: 104110,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1749801469347620",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71006701,
                        content: "这么简单的题要是再答错，今晚就给我留下来抄一百遍吧。",
                        npc: 818064,
                        next: 71006702,
                    },
                    {
                        id: 71006702,
                        content: "（愤怒的声音从远处传来，过去看看发生了什么吧。）",
                        npc: 800006,
                        next: 71006703,
                    },
                ],
            },
            {
                id: "17498015409311395",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006703,
                        content: "这是怎么了？",
                        npc: 100001,
                        next: 71006704,
                    },
                    {
                        id: 71006704,
                        content: "呼……这孩子连大风九章都默写不下来。这点定性都没有，以后还怎么精进学业？",
                        npc: 818064,
                        next: 71006705,
                    },
                    {
                        id: 71006705,
                        content: "不行，越想越气，我去喝口茶冷静一下，你帮我盯一下吧。",
                        npc: 818064,
                        options: [
                            {
                                id: 710067051,
                                content: "（接受。）",
                                next: 71006706,
                            },
                            {
                                id: 710067052,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71006706,
                        content: "劳烦你了，我很快回来。",
                        npc: 818064,
                        next: 71006707,
                    },
                ],
            },
            {
                id: "17579058737373845245",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006707,
                        content: "呜呜呜呜……下一句到底是什么来着……",
                        npc: 818063,
                        next: 71006708,
                    },
                    {
                        id: 71006708,
                        content: "这位朋友，你能不能也帮帮我呀……",
                        npc: 818063,
                        next: 71006709,
                    },
                ],
            },
            {
                id: "17498019449754217",
                type: "TalkNode",
                name: "对话节点",
                next: ["174980220162410143", "17498020109305787"],
                dialogues: [
                    {
                        id: 71006709,
                        content: "我写到“著真去伪，赤心为诚。”了，但下一句怎么都想不起来，你能帮我翻下书看看后面是什么吗？",
                        npc: 818063,
                        options: [
                            {
                                id: 710067091,
                                content: "（欣然接受。）",
                                next: 71006712,
                            },
                            {
                                id: 710067092,
                                content: "（严词拒绝。）",
                                next: 71006711,
                                impr: [1041, "Morality", 1],
                            },
                        ],
                    },
                    {
                        id: 71006712,
                        content: "真是帮了大忙了！谢谢你谢谢你！",
                        npc: 818063,
                        next: 71006713,
                    },
                    {
                        id: 71006711,
                        content: "不……我想出去玩啊……",
                        npc: 818063,
                        next: 71006717,
                    },
                ],
            },
            {
                id: "17498020673127504",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006713,
                        content: "（你翻开抄写着大风九章的册子，“著真去伪，赤心为诚。”下一句是“妄言欺众，不可为也。”）",
                        npc: 800006,
                        next: 71006714,
                    },
                    {
                        id: 71006714,
                        content: "找到了，回去告诉他答案吧。",
                        npc: 100001,
                        next: 71006713,
                    },
                ],
            },
            {
                id: "174980220162410143",
                type: "TalkNode",
                name: "对话节点",
                next: ["1749814544722647449", "1749814578909648123", "1749814580465648178"],
                dialogues: [
                    {
                        id: 71006715,
                        content: "你可算回来了，快快快，下一句是什么？",
                        npc: 818063,
                    },
                ],
            },
            {
                id: "17498020109305787",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006717,
                        content: "哼，这都能错！今晚给我再抄五百遍，少一遍都不准走！",
                        npc: 818064,
                        next: 71006718,
                    },
                    {
                        id: 71006718,
                        content: "不——",
                        npc: 818063,
                        next: 71006719,
                    },
                    {
                        id: 71006719,
                        content: "谢谢你帮我盯着他了，这是给你的谢礼，还请收下。",
                        npc: 818064,
                    },
                ],
            },
            {
                id: "1749814544722647449",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006720,
                        content: "你看，只要沉下心来仔细回想，这不是能写出来吗！",
                        npc: 818064,
                        next: 71006721,
                    },
                    {
                        id: 71006721,
                        content: "好耶，出去玩喽！",
                        npc: 818063,
                        next: 71006722,
                    },
                    {
                        id: 71006722,
                        content: "站住！因为你今日的默写达标，所以只用再抄五十遍就行，抄完再走。",
                        npc: 818064,
                        next: 71006723,
                    },
                    {
                        id: 71006723,
                        content: "不——",
                        npc: 818063,
                        next: 71006724,
                    },
                    {
                        id: 71006724,
                        content: "谢谢你帮我盯着他了，这是给你的谢礼，还请收下。",
                        npc: 818064,
                    },
                ],
            },
            {
                id: "1749814578909648123",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006717,
                        content: "哼，这都能错！今晚给我再抄五百遍，少一遍都不准走！",
                        npc: 818064,
                        next: 71006718,
                    },
                    {
                        id: 71006718,
                        content: "不——",
                        npc: 818063,
                        next: 71006719,
                    },
                    {
                        id: 71006719,
                        content: "谢谢你帮我盯着他了，这是给你的谢礼，还请收下。",
                        npc: 818064,
                    },
                ],
            },
            {
                id: "1749814580465648178",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006717,
                        content: "哼，这都能错！今晚给我再抄五百遍，少一遍都不准走！",
                        npc: 818064,
                        next: 71006718,
                    },
                    {
                        id: 71006718,
                        content: "不——",
                        npc: 818063,
                        next: 71006719,
                    },
                    {
                        id: 71006719,
                        content: "谢谢你帮我盯着他了，这是给你的谢礼，还请收下。",
                        npc: 818064,
                    },
                ],
            },
        ],
    },
    {
        id: 208724,
        name: "永不下课",
        level: [50, 59],
        regionId: 1041,
        subRegionId: 104110,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1749801469347620",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71006701,
                        content: "这么简单的题要是再答错，今晚就给我留下来抄一百遍吧。",
                        npc: 818064,
                        next: 71006702,
                    },
                    {
                        id: 71006702,
                        content: "（愤怒的声音从远处传来，过去看看发生了什么吧。）",
                        npc: 800006,
                        next: 71006703,
                    },
                ],
            },
            {
                id: "17498015409311395",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006703,
                        content: "这是怎么了？",
                        npc: 100001,
                        next: 71006704,
                    },
                    {
                        id: 71006704,
                        content: "呼……这孩子连大风九章都默写不下来。这点定性都没有，以后还怎么精进学业？",
                        npc: 818064,
                        next: 71006705,
                    },
                    {
                        id: 71006705,
                        content: "不行，越想越气，我去喝口茶冷静一下，你帮我盯一下吧。",
                        npc: 818064,
                        options: [
                            {
                                id: 710067051,
                                content: "（接受。）",
                                next: 71006706,
                            },
                            {
                                id: 710067052,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71006706,
                        content: "劳烦你了，我很快回来。",
                        npc: 818064,
                        next: 71006707,
                    },
                ],
            },
            {
                id: "17579058737373845245",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006707,
                        content: "呜呜呜呜……下一句到底是什么来着……",
                        npc: 818063,
                        next: 71006708,
                    },
                    {
                        id: 71006708,
                        content: "这位朋友，你能不能也帮帮我呀……",
                        npc: 818063,
                        next: 71006709,
                    },
                ],
            },
            {
                id: "17498019449754217",
                type: "TalkNode",
                name: "对话节点",
                next: ["174980220162410143", "17498020109305787"],
                dialogues: [
                    {
                        id: 71006709,
                        content: "我写到“著真去伪，赤心为诚。”了，但下一句怎么都想不起来，你能帮我翻下书看看后面是什么吗？",
                        npc: 818063,
                        options: [
                            {
                                id: 710067091,
                                content: "（欣然接受。）",
                                next: 71006712,
                            },
                            {
                                id: 710067092,
                                content: "（严词拒绝。）",
                                next: 71006711,
                                impr: [1041, "Morality", 1],
                            },
                        ],
                    },
                    {
                        id: 71006712,
                        content: "真是帮了大忙了！谢谢你谢谢你！",
                        npc: 818063,
                        next: 71006713,
                    },
                    {
                        id: 71006711,
                        content: "不……我想出去玩啊……",
                        npc: 818063,
                        next: 71006717,
                    },
                ],
            },
            {
                id: "17498020673127504",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006713,
                        content: "（你翻开抄写着大风九章的册子，“著真去伪，赤心为诚。”下一句是“妄言欺众，不可为也。”）",
                        npc: 800006,
                        next: 71006714,
                    },
                    {
                        id: 71006714,
                        content: "找到了，回去告诉他答案吧。",
                        npc: 100001,
                        next: 71006713,
                    },
                ],
            },
            {
                id: "174980220162410143",
                type: "TalkNode",
                name: "对话节点",
                next: ["1749814544722647449", "1749814578909648123", "1749814580465648178"],
                dialogues: [
                    {
                        id: 71006715,
                        content: "你可算回来了，快快快，下一句是什么？",
                        npc: 818063,
                    },
                ],
            },
            {
                id: "17498020109305787",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006717,
                        content: "哼，这都能错！今晚给我再抄五百遍，少一遍都不准走！",
                        npc: 818064,
                        next: 71006718,
                    },
                    {
                        id: 71006718,
                        content: "不——",
                        npc: 818063,
                        next: 71006719,
                    },
                    {
                        id: 71006719,
                        content: "谢谢你帮我盯着他了，这是给你的谢礼，还请收下。",
                        npc: 818064,
                    },
                ],
            },
            {
                id: "1749814544722647449",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006720,
                        content: "你看，只要沉下心来仔细回想，这不是能写出来吗！",
                        npc: 818064,
                        next: 71006721,
                    },
                    {
                        id: 71006721,
                        content: "好耶，出去玩喽！",
                        npc: 818063,
                        next: 71006722,
                    },
                    {
                        id: 71006722,
                        content: "站住！因为你今日的默写达标，所以只用再抄五十遍就行，抄完再走。",
                        npc: 818064,
                        next: 71006723,
                    },
                    {
                        id: 71006723,
                        content: "不——",
                        npc: 818063,
                        next: 71006724,
                    },
                    {
                        id: 71006724,
                        content: "谢谢你帮我盯着他了，这是给你的谢礼，还请收下。",
                        npc: 818064,
                    },
                ],
            },
            {
                id: "1749814578909648123",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006717,
                        content: "哼，这都能错！今晚给我再抄五百遍，少一遍都不准走！",
                        npc: 818064,
                        next: 71006718,
                    },
                    {
                        id: 71006718,
                        content: "不——",
                        npc: 818063,
                        next: 71006719,
                    },
                    {
                        id: 71006719,
                        content: "谢谢你帮我盯着他了，这是给你的谢礼，还请收下。",
                        npc: 818064,
                    },
                ],
            },
            {
                id: "1749814580465648178",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006717,
                        content: "哼，这都能错！今晚给我再抄五百遍，少一遍都不准走！",
                        npc: 818064,
                        next: 71006718,
                    },
                    {
                        id: 71006718,
                        content: "不——",
                        npc: 818063,
                        next: 71006719,
                    },
                    {
                        id: 71006719,
                        content: "谢谢你帮我盯着他了，这是给你的谢礼，还请收下。",
                        npc: 818064,
                    },
                ],
            },
        ],
    },
    {
        id: 208733,
        name: "永不下课",
        level: [40, 49],
        regionId: 1041,
        subRegionId: 104110,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1749801469347620",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71006701,
                        content: "这么简单的题要是再答错，今晚就给我留下来抄一百遍吧。",
                        npc: 818064,
                        next: 71006702,
                    },
                    {
                        id: 71006702,
                        content: "（愤怒的声音从远处传来，过去看看发生了什么吧。）",
                        npc: 800006,
                        next: 71006703,
                    },
                ],
            },
            {
                id: "17498015409311395",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006703,
                        content: "这是怎么了？",
                        npc: 100001,
                        next: 71006704,
                    },
                    {
                        id: 71006704,
                        content: "呼……这孩子连大风九章都默写不下来。这点定性都没有，以后还怎么精进学业？",
                        npc: 818064,
                        next: 71006705,
                    },
                    {
                        id: 71006705,
                        content: "不行，越想越气，我去喝口茶冷静一下，你帮我盯一下吧。",
                        npc: 818064,
                        options: [
                            {
                                id: 710067051,
                                content: "（接受。）",
                                next: 71006706,
                            },
                            {
                                id: 710067052,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71006706,
                        content: "劳烦你了，我很快回来。",
                        npc: 818064,
                        next: 71006707,
                    },
                ],
            },
            {
                id: "17579058737373845245",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006707,
                        content: "呜呜呜呜……下一句到底是什么来着……",
                        npc: 818063,
                        next: 71006708,
                    },
                    {
                        id: 71006708,
                        content: "这位朋友，你能不能也帮帮我呀……",
                        npc: 818063,
                        next: 71006709,
                    },
                ],
            },
            {
                id: "17498019449754217",
                type: "TalkNode",
                name: "对话节点",
                next: ["174980220162410143", "17498020109305787"],
                dialogues: [
                    {
                        id: 71006709,
                        content: "我写到“著真去伪，赤心为诚。”了，但下一句怎么都想不起来，你能帮我翻下书看看后面是什么吗？",
                        npc: 818063,
                        options: [
                            {
                                id: 710067091,
                                content: "（欣然接受。）",
                                next: 71006712,
                            },
                            {
                                id: 710067092,
                                content: "（严词拒绝。）",
                                next: 71006711,
                                impr: [1041, "Morality", 1],
                            },
                        ],
                    },
                    {
                        id: 71006712,
                        content: "真是帮了大忙了！谢谢你谢谢你！",
                        npc: 818063,
                        next: 71006713,
                    },
                    {
                        id: 71006711,
                        content: "不……我想出去玩啊……",
                        npc: 818063,
                        next: 71006717,
                    },
                ],
            },
            {
                id: "17498020673127504",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006713,
                        content: "（你翻开抄写着大风九章的册子，“著真去伪，赤心为诚。”下一句是“妄言欺众，不可为也。”）",
                        npc: 800006,
                        next: 71006714,
                    },
                    {
                        id: 71006714,
                        content: "找到了，回去告诉他答案吧。",
                        npc: 100001,
                        next: 71006713,
                    },
                ],
            },
            {
                id: "174980220162410143",
                type: "TalkNode",
                name: "对话节点",
                next: ["1749814544722647449", "1749814578909648123", "1749814580465648178"],
                dialogues: [
                    {
                        id: 71006715,
                        content: "你可算回来了，快快快，下一句是什么？",
                        npc: 818063,
                    },
                ],
            },
            {
                id: "17498020109305787",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006717,
                        content: "哼，这都能错！今晚给我再抄五百遍，少一遍都不准走！",
                        npc: 818064,
                        next: 71006718,
                    },
                    {
                        id: 71006718,
                        content: "不——",
                        npc: 818063,
                        next: 71006719,
                    },
                    {
                        id: 71006719,
                        content: "谢谢你帮我盯着他了，这是给你的谢礼，还请收下。",
                        npc: 818064,
                    },
                ],
            },
            {
                id: "1749814544722647449",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006720,
                        content: "你看，只要沉下心来仔细回想，这不是能写出来吗！",
                        npc: 818064,
                        next: 71006721,
                    },
                    {
                        id: 71006721,
                        content: "好耶，出去玩喽！",
                        npc: 818063,
                        next: 71006722,
                    },
                    {
                        id: 71006722,
                        content: "站住！因为你今日的默写达标，所以只用再抄五十遍就行，抄完再走。",
                        npc: 818064,
                        next: 71006723,
                    },
                    {
                        id: 71006723,
                        content: "不——",
                        npc: 818063,
                        next: 71006724,
                    },
                    {
                        id: 71006724,
                        content: "谢谢你帮我盯着他了，这是给你的谢礼，还请收下。",
                        npc: 818064,
                    },
                ],
            },
            {
                id: "1749814578909648123",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006717,
                        content: "哼，这都能错！今晚给我再抄五百遍，少一遍都不准走！",
                        npc: 818064,
                        next: 71006718,
                    },
                    {
                        id: 71006718,
                        content: "不——",
                        npc: 818063,
                        next: 71006719,
                    },
                    {
                        id: 71006719,
                        content: "谢谢你帮我盯着他了，这是给你的谢礼，还请收下。",
                        npc: 818064,
                    },
                ],
            },
            {
                id: "1749814580465648178",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006717,
                        content: "哼，这都能错！今晚给我再抄五百遍，少一遍都不准走！",
                        npc: 818064,
                        next: 71006718,
                    },
                    {
                        id: 71006718,
                        content: "不——",
                        npc: 818063,
                        next: 71006719,
                    },
                    {
                        id: 71006719,
                        content: "谢谢你帮我盯着他了，这是给你的谢礼，还请收下。",
                        npc: 818064,
                    },
                ],
            },
        ],
    },
    {
        id: 208734,
        name: "永不下课",
        level: [50, 59],
        regionId: 1041,
        subRegionId: 104110,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1749801469347620",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71006701,
                        content: "这么简单的题要是再答错，今晚就给我留下来抄一百遍吧。",
                        npc: 818064,
                        next: 71006702,
                    },
                    {
                        id: 71006702,
                        content: "（愤怒的声音从远处传来，过去看看发生了什么吧。）",
                        npc: 800006,
                        next: 71006703,
                    },
                ],
            },
            {
                id: "17498015409311395",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006703,
                        content: "这是怎么了？",
                        npc: 100001,
                        next: 71006704,
                    },
                    {
                        id: 71006704,
                        content: "呼……这孩子连大风九章都默写不下来。这点定性都没有，以后还怎么精进学业？",
                        npc: 818064,
                        next: 71006705,
                    },
                    {
                        id: 71006705,
                        content: "不行，越想越气，我去喝口茶冷静一下，你帮我盯一下吧。",
                        npc: 818064,
                        options: [
                            {
                                id: 710067051,
                                content: "（接受。）",
                                next: 71006706,
                            },
                            {
                                id: 710067052,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71006706,
                        content: "劳烦你了，我很快回来。",
                        npc: 818064,
                        next: 71006707,
                    },
                ],
            },
            {
                id: "17579058737373845245",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006707,
                        content: "呜呜呜呜……下一句到底是什么来着……",
                        npc: 818063,
                        next: 71006708,
                    },
                    {
                        id: 71006708,
                        content: "这位朋友，你能不能也帮帮我呀……",
                        npc: 818063,
                        next: 71006709,
                    },
                ],
            },
            {
                id: "17498019449754217",
                type: "TalkNode",
                name: "对话节点",
                next: ["174980220162410143", "17498020109305787"],
                dialogues: [
                    {
                        id: 71006709,
                        content: "我写到“著真去伪，赤心为诚。”了，但下一句怎么都想不起来，你能帮我翻下书看看后面是什么吗？",
                        npc: 818063,
                        options: [
                            {
                                id: 710067091,
                                content: "（欣然接受。）",
                                next: 71006712,
                            },
                            {
                                id: 710067092,
                                content: "（严词拒绝。）",
                                next: 71006711,
                                impr: [1041, "Morality", 1],
                            },
                        ],
                    },
                    {
                        id: 71006712,
                        content: "真是帮了大忙了！谢谢你谢谢你！",
                        npc: 818063,
                        next: 71006713,
                    },
                    {
                        id: 71006711,
                        content: "不……我想出去玩啊……",
                        npc: 818063,
                        next: 71006717,
                    },
                ],
            },
            {
                id: "17498020673127504",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006713,
                        content: "（你翻开抄写着大风九章的册子，“著真去伪，赤心为诚。”下一句是“妄言欺众，不可为也。”）",
                        npc: 800006,
                        next: 71006714,
                    },
                    {
                        id: 71006714,
                        content: "找到了，回去告诉他答案吧。",
                        npc: 100001,
                        next: 71006713,
                    },
                ],
            },
            {
                id: "174980220162410143",
                type: "TalkNode",
                name: "对话节点",
                next: ["1749814544722647449", "1749814578909648123", "1749814580465648178"],
                dialogues: [
                    {
                        id: 71006715,
                        content: "你可算回来了，快快快，下一句是什么？",
                        npc: 818063,
                    },
                ],
            },
            {
                id: "17498020109305787",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006717,
                        content: "哼，这都能错！今晚给我再抄五百遍，少一遍都不准走！",
                        npc: 818064,
                        next: 71006718,
                    },
                    {
                        id: 71006718,
                        content: "不——",
                        npc: 818063,
                        next: 71006719,
                    },
                    {
                        id: 71006719,
                        content: "谢谢你帮我盯着他了，这是给你的谢礼，还请收下。",
                        npc: 818064,
                    },
                ],
            },
            {
                id: "1749814544722647449",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006720,
                        content: "你看，只要沉下心来仔细回想，这不是能写出来吗！",
                        npc: 818064,
                        next: 71006721,
                    },
                    {
                        id: 71006721,
                        content: "好耶，出去玩喽！",
                        npc: 818063,
                        next: 71006722,
                    },
                    {
                        id: 71006722,
                        content: "站住！因为你今日的默写达标，所以只用再抄五十遍就行，抄完再走。",
                        npc: 818064,
                        next: 71006723,
                    },
                    {
                        id: 71006723,
                        content: "不——",
                        npc: 818063,
                        next: 71006724,
                    },
                    {
                        id: 71006724,
                        content: "谢谢你帮我盯着他了，这是给你的谢礼，还请收下。",
                        npc: 818064,
                    },
                ],
            },
            {
                id: "1749814578909648123",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006717,
                        content: "哼，这都能错！今晚给我再抄五百遍，少一遍都不准走！",
                        npc: 818064,
                        next: 71006718,
                    },
                    {
                        id: 71006718,
                        content: "不——",
                        npc: 818063,
                        next: 71006719,
                    },
                    {
                        id: 71006719,
                        content: "谢谢你帮我盯着他了，这是给你的谢礼，还请收下。",
                        npc: 818064,
                    },
                ],
            },
            {
                id: "1749814580465648178",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006717,
                        content: "哼，这都能错！今晚给我再抄五百遍，少一遍都不准走！",
                        npc: 818064,
                        next: 71006718,
                    },
                    {
                        id: 71006718,
                        content: "不——",
                        npc: 818063,
                        next: 71006719,
                    },
                    {
                        id: 71006719,
                        content: "谢谢你帮我盯着他了，这是给你的谢礼，还请收下。",
                        npc: 818064,
                    },
                ],
            },
        ],
    },
    {
        id: 208753,
        name: "永不下课",
        level: [40, 49],
        regionId: 1041,
        subRegionId: 104110,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1749801469347620",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71006701,
                        content: "这么简单的题要是再答错，今晚就给我留下来抄一百遍吧。",
                        npc: 818064,
                        next: 71006702,
                    },
                    {
                        id: 71006702,
                        content: "（愤怒的声音从远处传来，过去看看发生了什么吧。）",
                        npc: 800006,
                        next: 71006703,
                    },
                ],
            },
            {
                id: "17498015409311395",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006703,
                        content: "这是怎么了？",
                        npc: 100001,
                        next: 71006704,
                    },
                    {
                        id: 71006704,
                        content: "呼……这孩子连大风九章都默写不下来。这点定性都没有，以后还怎么精进学业？",
                        npc: 818064,
                        next: 71006705,
                    },
                    {
                        id: 71006705,
                        content: "不行，越想越气，我去喝口茶冷静一下，你帮我盯一下吧。",
                        npc: 818064,
                        options: [
                            {
                                id: 710067051,
                                content: "（接受。）",
                                next: 71006706,
                            },
                            {
                                id: 710067052,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71006706,
                        content: "劳烦你了，我很快回来。",
                        npc: 818064,
                        next: 71006707,
                    },
                ],
            },
            {
                id: "17579058737373845245",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006707,
                        content: "呜呜呜呜……下一句到底是什么来着……",
                        npc: 818063,
                        next: 71006708,
                    },
                    {
                        id: 71006708,
                        content: "这位朋友，你能不能也帮帮我呀……",
                        npc: 818063,
                        next: 71006709,
                    },
                ],
            },
            {
                id: "17498019449754217",
                type: "TalkNode",
                name: "对话节点",
                next: ["174980220162410143", "17498020109305787"],
                dialogues: [
                    {
                        id: 71006709,
                        content: "我写到“著真去伪，赤心为诚。”了，但下一句怎么都想不起来，你能帮我翻下书看看后面是什么吗？",
                        npc: 818063,
                        options: [
                            {
                                id: 710067091,
                                content: "（欣然接受。）",
                                next: 71006712,
                            },
                            {
                                id: 710067092,
                                content: "（严词拒绝。）",
                                next: 71006711,
                                impr: [1041, "Morality", 1],
                            },
                        ],
                    },
                    {
                        id: 71006712,
                        content: "真是帮了大忙了！谢谢你谢谢你！",
                        npc: 818063,
                        next: 71006713,
                    },
                    {
                        id: 71006711,
                        content: "不……我想出去玩啊……",
                        npc: 818063,
                        next: 71006717,
                    },
                ],
            },
            {
                id: "17498020673127504",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006713,
                        content: "（你翻开抄写着大风九章的册子，“著真去伪，赤心为诚。”下一句是“妄言欺众，不可为也。”）",
                        npc: 800006,
                        next: 71006714,
                    },
                    {
                        id: 71006714,
                        content: "找到了，回去告诉他答案吧。",
                        npc: 100001,
                        next: 71006713,
                    },
                ],
            },
            {
                id: "174980220162410143",
                type: "TalkNode",
                name: "对话节点",
                next: ["1749814544722647449", "1749814578909648123", "1749814580465648178"],
                dialogues: [
                    {
                        id: 71006715,
                        content: "你可算回来了，快快快，下一句是什么？",
                        npc: 818063,
                    },
                ],
            },
            {
                id: "17498020109305787",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006717,
                        content: "哼，这都能错！今晚给我再抄五百遍，少一遍都不准走！",
                        npc: 818064,
                        next: 71006718,
                    },
                    {
                        id: 71006718,
                        content: "不——",
                        npc: 818063,
                        next: 71006719,
                    },
                    {
                        id: 71006719,
                        content: "谢谢你帮我盯着他了，这是给你的谢礼，还请收下。",
                        npc: 818064,
                    },
                ],
            },
            {
                id: "1749814544722647449",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006720,
                        content: "你看，只要沉下心来仔细回想，这不是能写出来吗！",
                        npc: 818064,
                        next: 71006721,
                    },
                    {
                        id: 71006721,
                        content: "好耶，出去玩喽！",
                        npc: 818063,
                        next: 71006722,
                    },
                    {
                        id: 71006722,
                        content: "站住！因为你今日的默写达标，所以只用再抄五十遍就行，抄完再走。",
                        npc: 818064,
                        next: 71006723,
                    },
                    {
                        id: 71006723,
                        content: "不——",
                        npc: 818063,
                        next: 71006724,
                    },
                    {
                        id: 71006724,
                        content: "谢谢你帮我盯着他了，这是给你的谢礼，还请收下。",
                        npc: 818064,
                    },
                ],
            },
            {
                id: "1749814578909648123",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006717,
                        content: "哼，这都能错！今晚给我再抄五百遍，少一遍都不准走！",
                        npc: 818064,
                        next: 71006718,
                    },
                    {
                        id: 71006718,
                        content: "不——",
                        npc: 818063,
                        next: 71006719,
                    },
                    {
                        id: 71006719,
                        content: "谢谢你帮我盯着他了，这是给你的谢礼，还请收下。",
                        npc: 818064,
                    },
                ],
            },
            {
                id: "1749814580465648178",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006717,
                        content: "哼，这都能错！今晚给我再抄五百遍，少一遍都不准走！",
                        npc: 818064,
                        next: 71006718,
                    },
                    {
                        id: 71006718,
                        content: "不——",
                        npc: 818063,
                        next: 71006719,
                    },
                    {
                        id: 71006719,
                        content: "谢谢你帮我盯着他了，这是给你的谢礼，还请收下。",
                        npc: 818064,
                    },
                ],
            },
        ],
    },
    {
        id: 208754,
        name: "永不下课",
        level: [50, 59],
        regionId: 1041,
        subRegionId: 104110,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1749801469347620",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71006701,
                        content: "这么简单的题要是再答错，今晚就给我留下来抄一百遍吧。",
                        npc: 818064,
                        next: 71006702,
                    },
                    {
                        id: 71006702,
                        content: "（愤怒的声音从远处传来，过去看看发生了什么吧。）",
                        npc: 800006,
                        next: 71006703,
                    },
                ],
            },
            {
                id: "17498015409311395",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006703,
                        content: "这是怎么了？",
                        npc: 100001,
                        next: 71006704,
                    },
                    {
                        id: 71006704,
                        content: "呼……这孩子连大风九章都默写不下来。这点定性都没有，以后还怎么精进学业？",
                        npc: 818064,
                        next: 71006705,
                    },
                    {
                        id: 71006705,
                        content: "不行，越想越气，我去喝口茶冷静一下，你帮我盯一下吧。",
                        npc: 818064,
                        options: [
                            {
                                id: 710067051,
                                content: "（接受。）",
                                next: 71006706,
                            },
                            {
                                id: 710067052,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71006706,
                        content: "劳烦你了，我很快回来。",
                        npc: 818064,
                        next: 71006707,
                    },
                ],
            },
            {
                id: "17579058737373845245",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006707,
                        content: "呜呜呜呜……下一句到底是什么来着……",
                        npc: 818063,
                        next: 71006708,
                    },
                    {
                        id: 71006708,
                        content: "这位朋友，你能不能也帮帮我呀……",
                        npc: 818063,
                        next: 71006709,
                    },
                ],
            },
            {
                id: "17498019449754217",
                type: "TalkNode",
                name: "对话节点",
                next: ["174980220162410143", "17498020109305787"],
                dialogues: [
                    {
                        id: 71006709,
                        content: "我写到“著真去伪，赤心为诚。”了，但下一句怎么都想不起来，你能帮我翻下书看看后面是什么吗？",
                        npc: 818063,
                        options: [
                            {
                                id: 710067091,
                                content: "（欣然接受。）",
                                next: 71006712,
                            },
                            {
                                id: 710067092,
                                content: "（严词拒绝。）",
                                next: 71006711,
                                impr: [1041, "Morality", 1],
                            },
                        ],
                    },
                    {
                        id: 71006712,
                        content: "真是帮了大忙了！谢谢你谢谢你！",
                        npc: 818063,
                        next: 71006713,
                    },
                    {
                        id: 71006711,
                        content: "不……我想出去玩啊……",
                        npc: 818063,
                        next: 71006717,
                    },
                ],
            },
            {
                id: "17498020673127504",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006713,
                        content: "（你翻开抄写着大风九章的册子，“著真去伪，赤心为诚。”下一句是“妄言欺众，不可为也。”）",
                        npc: 800006,
                        next: 71006714,
                    },
                    {
                        id: 71006714,
                        content: "找到了，回去告诉他答案吧。",
                        npc: 100001,
                        next: 71006713,
                    },
                ],
            },
            {
                id: "174980220162410143",
                type: "TalkNode",
                name: "对话节点",
                next: ["1749814544722647449", "1749814578909648123", "1749814580465648178"],
                dialogues: [
                    {
                        id: 71006715,
                        content: "你可算回来了，快快快，下一句是什么？",
                        npc: 818063,
                    },
                ],
            },
            {
                id: "17498020109305787",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006717,
                        content: "哼，这都能错！今晚给我再抄五百遍，少一遍都不准走！",
                        npc: 818064,
                        next: 71006718,
                    },
                    {
                        id: 71006718,
                        content: "不——",
                        npc: 818063,
                        next: 71006719,
                    },
                    {
                        id: 71006719,
                        content: "谢谢你帮我盯着他了，这是给你的谢礼，还请收下。",
                        npc: 818064,
                    },
                ],
            },
            {
                id: "1749814544722647449",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006720,
                        content: "你看，只要沉下心来仔细回想，这不是能写出来吗！",
                        npc: 818064,
                        next: 71006721,
                    },
                    {
                        id: 71006721,
                        content: "好耶，出去玩喽！",
                        npc: 818063,
                        next: 71006722,
                    },
                    {
                        id: 71006722,
                        content: "站住！因为你今日的默写达标，所以只用再抄五十遍就行，抄完再走。",
                        npc: 818064,
                        next: 71006723,
                    },
                    {
                        id: 71006723,
                        content: "不——",
                        npc: 818063,
                        next: 71006724,
                    },
                    {
                        id: 71006724,
                        content: "谢谢你帮我盯着他了，这是给你的谢礼，还请收下。",
                        npc: 818064,
                    },
                ],
            },
            {
                id: "1749814578909648123",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006717,
                        content: "哼，这都能错！今晚给我再抄五百遍，少一遍都不准走！",
                        npc: 818064,
                        next: 71006718,
                    },
                    {
                        id: 71006718,
                        content: "不——",
                        npc: 818063,
                        next: 71006719,
                    },
                    {
                        id: 71006719,
                        content: "谢谢你帮我盯着他了，这是给你的谢礼，还请收下。",
                        npc: 818064,
                    },
                ],
            },
            {
                id: "1749814580465648178",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006717,
                        content: "哼，这都能错！今晚给我再抄五百遍，少一遍都不准走！",
                        npc: 818064,
                        next: 71006718,
                    },
                    {
                        id: 71006718,
                        content: "不——",
                        npc: 818063,
                        next: 71006719,
                    },
                    {
                        id: 71006719,
                        content: "谢谢你帮我盯着他了，这是给你的谢礼，还请收下。",
                        npc: 818064,
                    },
                ],
            },
        ],
    },
    {
        id: 208804,
        name: "迷糊渔人",
        level: [50, 59],
        regionId: 1041,
        subRegionId: 104106,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17388223998121626",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006901,
                        content: "哎呀哎呀，这可糟了……",
                        npc: 818065,
                        next: 71006902,
                    },
                ],
            },
            {
                id: "17388224438242474",
                type: "TalkNode",
                name: "对话节点",
                next: ["17498997048213385", "17501470335791267046"],
                dialogues: [
                    {
                        id: 71006902,
                        content: "这位朋友，我不小心把酒壶、鱼饵还有鱼竿全掉水里了，你能不能帮我钓几条鱼上来啊，不然回去又要被大伙嘲笑了。",
                        npc: 818065,
                        options: [
                            {
                                id: 710069021,
                                content: "（接受。）",
                                next: 71006903,
                            },
                            {
                                id: 710069022,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71006903,
                        content: "好好好，拜托你了。",
                        npc: 818065,
                        next: 71006904,
                    },
                ],
            },
            {
                id: "17388225288744588",
                type: "TalkNode",
                name: "钓鱼成功对话",
                dialogues: [
                    {
                        id: 71006904,
                        content: "怎么还能钓上这种鱼，总不会是被我的酒壶吸引过来的吧？！算了算了，以后再研究。",
                        npc: 818065,
                        next: 71006905,
                    },
                    {
                        id: 71006905,
                        content: "谢谢你今天帮我钓的这些鱼啊，帮大忙了！",
                        npc: 818065,
                    },
                ],
            },
            {
                id: "17498997048213385",
                type: "TalkNode",
                name: "钓鱼成功对话",
                dialogues: [
                    {
                        id: 71006904,
                        content: "怎么还能钓上这种鱼，总不会是被我的酒壶吸引过来的吧？！算了算了，以后再研究。",
                        npc: 818065,
                        next: 71006905,
                    },
                    {
                        id: 71006905,
                        content: "谢谢你今天帮我钓的这些鱼啊，帮大忙了！",
                        npc: 818065,
                    },
                ],
            },
            {
                id: "17501470335791267046",
                type: "TalkNode",
                name: "钓鱼成功对话",
                dialogues: [
                    {
                        id: 71006904,
                        content: "怎么还能钓上这种鱼，总不会是被我的酒壶吸引过来的吧？！算了算了，以后再研究。",
                        npc: 818065,
                        next: 71006905,
                    },
                    {
                        id: 71006905,
                        content: "谢谢你今天帮我钓的这些鱼啊，帮大忙了！",
                        npc: 818065,
                    },
                ],
            },
        ],
    },
    {
        id: 208805,
        name: "迷糊渔人",
        level: [60, 65],
        regionId: 1041,
        subRegionId: 104106,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17388223998121626",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006901,
                        content: "哎呀哎呀，这可糟了……",
                        npc: 818065,
                        next: 71006902,
                    },
                ],
            },
            {
                id: "17388224438242474",
                type: "TalkNode",
                name: "对话节点",
                next: ["17498997048213385", "17501470335791267046"],
                dialogues: [
                    {
                        id: 71006902,
                        content: "这位朋友，我不小心把酒壶、鱼饵还有鱼竿全掉水里了，你能不能帮我钓几条鱼上来啊，不然回去又要被大伙嘲笑了。",
                        npc: 818065,
                        options: [
                            {
                                id: 710069021,
                                content: "（接受。）",
                                next: 71006903,
                            },
                            {
                                id: 710069022,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71006903,
                        content: "好好好，拜托你了。",
                        npc: 818065,
                        next: 71006904,
                    },
                ],
            },
            {
                id: "17388225288744588",
                type: "TalkNode",
                name: "钓鱼成功对话",
                dialogues: [
                    {
                        id: 71006904,
                        content: "怎么还能钓上这种鱼，总不会是被我的酒壶吸引过来的吧？！算了算了，以后再研究。",
                        npc: 818065,
                        next: 71006905,
                    },
                    {
                        id: 71006905,
                        content: "谢谢你今天帮我钓的这些鱼啊，帮大忙了！",
                        npc: 818065,
                    },
                ],
            },
            {
                id: "17498997048213385",
                type: "TalkNode",
                name: "钓鱼成功对话",
                dialogues: [
                    {
                        id: 71006904,
                        content: "怎么还能钓上这种鱼，总不会是被我的酒壶吸引过来的吧？！算了算了，以后再研究。",
                        npc: 818065,
                        next: 71006905,
                    },
                    {
                        id: 71006905,
                        content: "谢谢你今天帮我钓的这些鱼啊，帮大忙了！",
                        npc: 818065,
                    },
                ],
            },
            {
                id: "17501470335791267046",
                type: "TalkNode",
                name: "钓鱼成功对话",
                dialogues: [
                    {
                        id: 71006904,
                        content: "怎么还能钓上这种鱼，总不会是被我的酒壶吸引过来的吧？！算了算了，以后再研究。",
                        npc: 818065,
                        next: 71006905,
                    },
                    {
                        id: 71006905,
                        content: "谢谢你今天帮我钓的这些鱼啊，帮大忙了！",
                        npc: 818065,
                    },
                ],
            },
        ],
    },
    {
        id: 210205,
        name: "山体坍塌",
        level: [60, 65],
        regionId: 1041,
        subRegionId: 104105,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1766041260859354515",
                type: "TalkNode",
                name: "开车",
                dialogues: [
                    {
                        id: 71008301,
                        content: "（坍塌的碎石挡住了前路，将它们清理掉吧。）",
                        npc: 800006,
                        next: 71008302,
                    },
                ],
            },
            {
                id: "1766041260859354516",
                type: "TalkNode",
                name: "完成开车",
                dialogues: [
                    {
                        id: 71008302,
                        content: "（清理碎石的响动将周围的敌人吸引了过来，击退它们吧。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 301802,
        name: "暴力巡逻",
        level: [30, 39],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17253605906203599",
                type: "TalkNode",
                name: "老头开车对话",
                dialogues: [
                    {
                        id: 71001801,
                        content: "老长官，我们都说了没事的，你想太多啦。",
                        npc: 818059,
                        next: 71001802,
                    },
                    {
                        id: 71001802,
                        content: "你们完全没发现潜藏在暗地里的危险！冰湖城交到你们这一代人手中真是完了！",
                        npc: 818009,
                        next: 71001803,
                    },
                ],
            },
            {
                id: "17253606006773844",
                type: "TalkNode",
                name: "与老头交互对话",
                next: [
                    "172536138977610439",
                    "17253609393427737",
                    "172536156905613134",
                    "172536159003213800",
                    "172536156905613131",
                    "172536162102314896",
                    "172536168258416156",
                ],
                dialogues: [
                    {
                        id: 71001803,
                        content: "老先生，你先消消气，有什么我能帮忙的吗？",
                        npc: 100001,
                        next: 71001804,
                    },
                    {
                        id: 71001804,
                        content: "眼看着冰湖城潜藏的不法之徒越来越多了，唉，真是一代不如一代！",
                        npc: 818009,
                        next: 71001805,
                    },
                    {
                        id: 71001805,
                        content: "治安署那群懒惰的小年轻不管，我就自己来管！{性别：小伙子|小姑娘}，你这么热心，就来搭把手吧！",
                        npc: 818009,
                    },
                ],
            },
            {
                id: "17308785572164454",
                type: "TalkNode",
                name: "拒绝对话",
                dialogues: [
                    {
                        id: 71001812,
                        content: "哼，本来也不指望别人！你走吧。",
                        npc: 818009,
                    },
                ],
            },
            {
                id: "172536138977610439",
                type: "TalkNode",
                name: "老头巡逻对话1",
                next: ["172536156905613134", "172536159003213800", "172536156905613131", "172536162102314896", "172536168258416156"],
                dialogues: [
                    {
                        id: 71001806,
                        content: "哼……",
                        npc: 818009,
                        next: 71001809,
                    },
                ],
            },
            {
                id: "17253609393427737",
                type: "TalkNode",
                name: "小混混开车",
                dialogues: [
                    {
                        id: 71001809,
                        content: "动手！",
                        npc: 818011,
                        next: 71001810,
                    },
                    {
                        id: 71001810,
                        content: "看吧！渣滓出现了，冰湖城根本不像表面那样安全，老夫这就来制裁你们！",
                        npc: 818009,
                        next: 71001813,
                    },
                    {
                        id: 71001813,
                        content: "（老人二话不说便冲了上去，为了不闹出人命，现在该由你来制止这场混乱的私斗了。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "172536156905613134",
                type: "TalkNode",
                name: "与老头对话",
                dialogues: [
                    {
                        id: 71001811,
                        content: "辛苦你了，年轻人，冰湖城的治安，以后只能靠你和我了啊。",
                        npc: 818009,
                    },
                ],
            },
            {
                id: "172536159003213800",
                type: "TalkNode",
                name: "老头巡逻对话2",
                next: ["172536156905613134", "172536162102314896", "172536168258416156"],
                dialogues: [
                    {
                        id: 71001807,
                        content: "啧……………………",
                        npc: 818009,
                        next: 71001809,
                    },
                ],
            },
            {
                id: "172536156905613131",
                type: "TalkNode",
                name: "小混混开车",
                next: ["172536156905613134"],
                dialogues: [
                    {
                        id: 71001809,
                        content: "动手！",
                        npc: 818011,
                        next: 71001810,
                    },
                    {
                        id: 71001810,
                        content: "看吧！渣滓出现了，冰湖城根本不像表面那样安全，老夫这就来制裁你们！",
                        npc: 818009,
                        next: 71001813,
                    },
                    {
                        id: 71001813,
                        content: "（老人二话不说便冲了上去，为了不闹出人命，现在该由你来制止这场混乱的私斗了。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "172536162102314896",
                type: "TalkNode",
                name: "小混混开车",
                next: ["172536156905613134"],
                dialogues: [
                    {
                        id: 71001809,
                        content: "动手！",
                        npc: 818011,
                        next: 71001810,
                    },
                    {
                        id: 71001810,
                        content: "看吧！渣滓出现了，冰湖城根本不像表面那样安全，老夫这就来制裁你们！",
                        npc: 818009,
                        next: 71001813,
                    },
                    {
                        id: 71001813,
                        content: "（老人二话不说便冲了上去，为了不闹出人命，现在该由你来制止这场混乱的私斗了。）",
                        npc: 800006,
                        next: 71001811,
                    },
                ],
            },
            {
                id: "172536168258416156",
                type: "TalkNode",
                name: "与老头对话",
                dialogues: [
                    {
                        id: 71001808,
                        content: "啧，这回藏得还挺深啊，不过我是不会放弃的！你们这群渣滓，都给我等着吧……",
                        npc: 818009,
                    },
                ],
            },
        ],
    },
    {
        id: 301803,
        name: "暴力巡逻",
        level: [40, 49],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17253605906203599",
                type: "TalkNode",
                name: "老头开车对话",
                dialogues: [
                    {
                        id: 71001801,
                        content: "老长官，我们都说了没事的，你想太多啦。",
                        npc: 818059,
                        next: 71001802,
                    },
                    {
                        id: 71001802,
                        content: "你们完全没发现潜藏在暗地里的危险！冰湖城交到你们这一代人手中真是完了！",
                        npc: 818009,
                        next: 71001803,
                    },
                ],
            },
            {
                id: "17253606006773844",
                type: "TalkNode",
                name: "与老头交互对话",
                next: [
                    "172536138977610439",
                    "17253609393427737",
                    "172536156905613134",
                    "172536159003213800",
                    "172536156905613131",
                    "172536162102314896",
                    "172536168258416156",
                ],
                dialogues: [
                    {
                        id: 71001803,
                        content: "老先生，你先消消气，有什么我能帮忙的吗？",
                        npc: 100001,
                        next: 71001804,
                    },
                    {
                        id: 71001804,
                        content: "眼看着冰湖城潜藏的不法之徒越来越多了，唉，真是一代不如一代！",
                        npc: 818009,
                        next: 71001805,
                    },
                    {
                        id: 71001805,
                        content: "治安署那群懒惰的小年轻不管，我就自己来管！{性别：小伙子|小姑娘}，你这么热心，就来搭把手吧！",
                        npc: 818009,
                    },
                ],
            },
            {
                id: "17308785572164454",
                type: "TalkNode",
                name: "拒绝对话",
                dialogues: [
                    {
                        id: 71001812,
                        content: "哼，本来也不指望别人！你走吧。",
                        npc: 818009,
                    },
                ],
            },
            {
                id: "172536138977610439",
                type: "TalkNode",
                name: "老头巡逻对话1",
                next: ["172536156905613134", "172536159003213800", "172536156905613131", "172536162102314896", "172536168258416156"],
                dialogues: [
                    {
                        id: 71001806,
                        content: "哼……",
                        npc: 818009,
                        next: 71001809,
                    },
                ],
            },
            {
                id: "17253609393427737",
                type: "TalkNode",
                name: "小混混开车",
                dialogues: [
                    {
                        id: 71001809,
                        content: "动手！",
                        npc: 818011,
                        next: 71001810,
                    },
                    {
                        id: 71001810,
                        content: "看吧！渣滓出现了，冰湖城根本不像表面那样安全，老夫这就来制裁你们！",
                        npc: 818009,
                        next: 71001813,
                    },
                    {
                        id: 71001813,
                        content: "（老人二话不说便冲了上去，为了不闹出人命，现在该由你来制止这场混乱的私斗了。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "172536156905613134",
                type: "TalkNode",
                name: "与老头对话",
                dialogues: [
                    {
                        id: 71001811,
                        content: "辛苦你了，年轻人，冰湖城的治安，以后只能靠你和我了啊。",
                        npc: 818009,
                    },
                ],
            },
            {
                id: "172536159003213800",
                type: "TalkNode",
                name: "老头巡逻对话2",
                next: ["172536156905613134", "172536162102314896", "172536168258416156"],
                dialogues: [
                    {
                        id: 71001807,
                        content: "啧……………………",
                        npc: 818009,
                        next: 71001809,
                    },
                ],
            },
            {
                id: "172536156905613131",
                type: "TalkNode",
                name: "小混混开车",
                next: ["172536156905613134"],
                dialogues: [
                    {
                        id: 71001809,
                        content: "动手！",
                        npc: 818011,
                        next: 71001810,
                    },
                    {
                        id: 71001810,
                        content: "看吧！渣滓出现了，冰湖城根本不像表面那样安全，老夫这就来制裁你们！",
                        npc: 818009,
                        next: 71001813,
                    },
                    {
                        id: 71001813,
                        content: "（老人二话不说便冲了上去，为了不闹出人命，现在该由你来制止这场混乱的私斗了。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "172536162102314896",
                type: "TalkNode",
                name: "小混混开车",
                next: ["172536156905613134"],
                dialogues: [
                    {
                        id: 71001809,
                        content: "动手！",
                        npc: 818011,
                        next: 71001810,
                    },
                    {
                        id: 71001810,
                        content: "看吧！渣滓出现了，冰湖城根本不像表面那样安全，老夫这就来制裁你们！",
                        npc: 818009,
                        next: 71001813,
                    },
                    {
                        id: 71001813,
                        content: "（老人二话不说便冲了上去，为了不闹出人命，现在该由你来制止这场混乱的私斗了。）",
                        npc: 800006,
                        next: 71001811,
                    },
                ],
            },
            {
                id: "172536168258416156",
                type: "TalkNode",
                name: "与老头对话",
                dialogues: [
                    {
                        id: 71001808,
                        content: "啧，这回藏得还挺深啊，不过我是不会放弃的！你们这群渣滓，都给我等着吧……",
                        npc: 818009,
                    },
                ],
            },
        ],
    },
    {
        id: 301804,
        name: "暴力巡逻",
        level: [50, 59],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17253605906203599",
                type: "TalkNode",
                name: "老头开车对话",
                dialogues: [
                    {
                        id: 71001801,
                        content: "老长官，我们都说了没事的，你想太多啦。",
                        npc: 818059,
                        next: 71001802,
                    },
                    {
                        id: 71001802,
                        content: "你们完全没发现潜藏在暗地里的危险！冰湖城交到你们这一代人手中真是完了！",
                        npc: 818009,
                        next: 71001803,
                    },
                ],
            },
            {
                id: "17253606006773844",
                type: "TalkNode",
                name: "与老头交互对话",
                next: [
                    "172536138977610439",
                    "17253609393427737",
                    "172536156905613134",
                    "172536159003213800",
                    "172536156905613131",
                    "172536162102314896",
                    "172536168258416156",
                ],
                dialogues: [
                    {
                        id: 71001803,
                        content: "老先生，你先消消气，有什么我能帮忙的吗？",
                        npc: 100001,
                        next: 71001804,
                    },
                    {
                        id: 71001804,
                        content: "眼看着冰湖城潜藏的不法之徒越来越多了，唉，真是一代不如一代！",
                        npc: 818009,
                        next: 71001805,
                    },
                    {
                        id: 71001805,
                        content: "治安署那群懒惰的小年轻不管，我就自己来管！{性别：小伙子|小姑娘}，你这么热心，就来搭把手吧！",
                        npc: 818009,
                    },
                ],
            },
            {
                id: "17308785572164454",
                type: "TalkNode",
                name: "拒绝对话",
                dialogues: [
                    {
                        id: 71001812,
                        content: "哼，本来也不指望别人！你走吧。",
                        npc: 818009,
                    },
                ],
            },
            {
                id: "172536138977610439",
                type: "TalkNode",
                name: "老头巡逻对话1",
                next: ["172536156905613134", "172536159003213800", "172536156905613131", "172536162102314896", "172536168258416156"],
                dialogues: [
                    {
                        id: 71001806,
                        content: "哼……",
                        npc: 818009,
                        next: 71001809,
                    },
                ],
            },
            {
                id: "17253609393427737",
                type: "TalkNode",
                name: "小混混开车",
                dialogues: [
                    {
                        id: 71001809,
                        content: "动手！",
                        npc: 818011,
                        next: 71001810,
                    },
                    {
                        id: 71001810,
                        content: "看吧！渣滓出现了，冰湖城根本不像表面那样安全，老夫这就来制裁你们！",
                        npc: 818009,
                        next: 71001813,
                    },
                    {
                        id: 71001813,
                        content: "（老人二话不说便冲了上去，为了不闹出人命，现在该由你来制止这场混乱的私斗了。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "172536156905613134",
                type: "TalkNode",
                name: "与老头对话",
                dialogues: [
                    {
                        id: 71001811,
                        content: "辛苦你了，年轻人，冰湖城的治安，以后只能靠你和我了啊。",
                        npc: 818009,
                    },
                ],
            },
            {
                id: "172536159003213800",
                type: "TalkNode",
                name: "老头巡逻对话2",
                next: ["172536156905613134", "172536162102314896", "172536168258416156"],
                dialogues: [
                    {
                        id: 71001807,
                        content: "啧……………………",
                        npc: 818009,
                        next: 71001809,
                    },
                ],
            },
            {
                id: "172536156905613131",
                type: "TalkNode",
                name: "小混混开车",
                next: ["172536156905613134"],
                dialogues: [
                    {
                        id: 71001809,
                        content: "动手！",
                        npc: 818011,
                        next: 71001810,
                    },
                    {
                        id: 71001810,
                        content: "看吧！渣滓出现了，冰湖城根本不像表面那样安全，老夫这就来制裁你们！",
                        npc: 818009,
                        next: 71001813,
                    },
                    {
                        id: 71001813,
                        content: "（老人二话不说便冲了上去，为了不闹出人命，现在该由你来制止这场混乱的私斗了。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "172536162102314896",
                type: "TalkNode",
                name: "小混混开车",
                next: ["172536156905613134"],
                dialogues: [
                    {
                        id: 71001809,
                        content: "动手！",
                        npc: 818011,
                        next: 71001810,
                    },
                    {
                        id: 71001810,
                        content: "看吧！渣滓出现了，冰湖城根本不像表面那样安全，老夫这就来制裁你们！",
                        npc: 818009,
                        next: 71001813,
                    },
                    {
                        id: 71001813,
                        content: "（老人二话不说便冲了上去，为了不闹出人命，现在该由你来制止这场混乱的私斗了。）",
                        npc: 800006,
                        next: 71001811,
                    },
                ],
            },
            {
                id: "172536168258416156",
                type: "TalkNode",
                name: "与老头对话",
                dialogues: [
                    {
                        id: 71001808,
                        content: "啧，这回藏得还挺深啊，不过我是不会放弃的！你们这群渣滓，都给我等着吧……",
                        npc: 818009,
                    },
                ],
            },
        ],
    },
    {
        id: 302605,
        name: "皎皎特快，送啥都快",
        level: [60, 65],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17331254687981655",
                type: "TalkNode",
                name: "外送皎皎超时开车对话",
                dialogues: [
                    {
                        id: 71002201,
                        content: "咱不想……不想……不想上工啊……",
                        npc: 818019,
                        next: 71002202,
                    },
                ],
            },
            {
                id: "17331254687981657",
                type: "TalkNode",
                name: "交互对话选项",
                next: ["17331277353543763049", "17331254688011685", "17331254688001672", "17389091680505787", "17331254688011680"],
                dialogues: [
                    {
                        id: 71002202,
                        content: "唉，老板非要搞什么什么——“让银色和平饭店的饭菜走进千家万户”，但他完全没考虑过咱们这些跑腿的苦哇！",
                        npc: 818019,
                        next: 71002203,
                    },
                    {
                        id: 71002203,
                        content: "需要帮忙吗？",
                        npc: 100001,
                        next: 71002204,
                    },
                    {
                        id: 71002204,
                        content: "需要，我非常需要一个人替我上工，不花钱的那种！唉……可惜根本没有这种好事！",
                        npc: 818019,
                        next: 71002205,
                    },
                    {
                        id: 71002205,
                        content: "你如果非要帮我拎点东西的话，那我除了谢谢，最多只能请你去泪湖边喝水喝到饱了。",
                        npc: 818019,
                        next: 71002206,
                    },
                ],
            },
            {
                id: "17331254687991664",
                type: "TalkNode",
                name: "皎皎遇到小混混开车",
                next: ["17331254688011685", "17331254688001672", "17389091680505787", "17331254688011680"],
                dialogues: [
                    {
                        id: 71002206,
                        content: "这皎皎身上带了不少吃的？哥几个今天看来有口福了呀。",
                        npc: 818057,
                        next: 71002207,
                    },
                    {
                        id: 71002207,
                        content: "不能给你们！这些菜送不到客人那的话我工钱就要被扣光了……",
                        npc: 818019,
                        next: 71002208,
                    },
                    {
                        id: 71002208,
                        content: "关我们啥事，拿来吧你！",
                        npc: 818057,
                        next: 71002209,
                    },
                    {
                        id: 71002209,
                        content: "住手！",
                        npc: 100001,
                        next: 71002210,
                    },
                ],
            },
            {
                id: "17331277353543763049",
                type: "TalkNode",
                name: "皎皎获救开车",
                next: ["17331254688001672", "17389091680505787", "17331254688011680"],
                dialogues: [
                    {
                        id: 71002210,
                        content: "呼……还好汤没洒，我们快送过去吧……",
                        npc: 818019,
                        next: 71002211,
                    },
                ],
            },
            {
                id: "17331254688011685",
                type: "TalkNode",
                name: "拿上外卖",
                next: ["17389091680505787", "17331254688011680"],
                dialogues: [
                    {
                        id: 71002211,
                        content: "搞定搞定，还差最后一份！真是的，老板能不能少点奇思妙想哇……",
                        npc: 818019,
                        next: 71002212,
                    },
                ],
            },
            {
                id: "17331254688001672",
                type: "TalkNode",
                name: "皎皎堵路抱怨开车",
                next: ["17331254688011680"],
                dialogues: [
                    {
                        id: 71002212,
                        content: "这种杂物是怎么堆到大路上的啊……可恶！怎么今天所有东西都在跟我作对！",
                        npc: 818019,
                        next: 71002218,
                    },
                    {
                        id: 71002218,
                        content: "不干了不干了！我要和老板说，这破活我不干啦！",
                        npc: 818019,
                        next: 71002213,
                    },
                    {
                        id: 71002213,
                        content: "你把吃的拿好，我来清理这些东西吧。",
                        npc: 100001,
                        next: 71002214,
                    },
                ],
            },
            {
                id: "17389091680505787",
                type: "TalkNode",
                name: "清理完成开车",
                dialogues: [
                    {
                        id: 71002214,
                        content: "居然都清完了！那这时间还来得及！冲冲冲冲冲！",
                        npc: 818019,
                        next: 71002215,
                    },
                ],
            },
            {
                id: "17331254688011680",
                type: "TalkNode",
                name: "皎皎未超时对话",
                dialogues: [
                    {
                        id: 71002215,
                        content: "总算都送到了……要不是有你，我一点工钱都拿不到了。呼……休息好了，咱也该回去继续干活了。",
                        npc: 818019,
                        next: 71002216,
                    },
                    {
                        id: 71002216,
                        content: "说好的辞职呢？",
                        npc: 100001,
                        next: 71002217,
                    },
                    {
                        id: 71002217,
                        content: "（外送皎皎拍了拍身上的灰尘便转身离开了。回答你问题的答案，也被藏在了她转身时的那一声叹息之中。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 302705,
        name: "“走钢丝”",
        level: [60, 65],
        regionId: 1013,
        subRegionId: 101303,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17262136826741451",
                type: "TalkNode",
                name: "NPC开车",
                dialogues: [
                    {
                        id: 71002301,
                        content: "嘶……刚刚那下没摔坏吧……",
                        npc: 818020,
                        next: 71002302,
                    },
                ],
            },
            {
                id: "17262150429422848",
                type: "TalkNode",
                name: "NPC对话选项",
                next: ["172621726272911179", "172621729332911595"],
                dialogues: [
                    {
                        id: 71002302,
                        content: "谁？！",
                        npc: 818020,
                        next: 71002303,
                    },
                    {
                        id: 71002303,
                        content: "嗯……咳，只是路过的狩月人啊。诶，我说，要不要来帮我个忙？就测下这玩意儿好不好用，很容易的！我会付你报酬。",
                        npc: 818020,
                    },
                ],
            },
            {
                id: "17262151946634289",
                type: "TalkNode",
                name: "NPC开启机关开车",
                next: ["172621729332911595"],
                dialogues: [
                    {
                        id: 71002304,
                        content: "坚持15秒就差不多了，加油！",
                        npc: 818020,
                        next: 71002305,
                    },
                ],
            },
            {
                id: "172621726272911179",
                type: "TalkNode",
                name: "未受伤对话",
                dialogues: [
                    {
                        id: 71002305,
                        content:
                            "居然全都躲过去了……不是说这是从艾利西安缴获的宝贝吗，我看跟破铜烂铁也没啥区别——啊没没，没什么，这些钱给你，别到处乱说啊。",
                        npc: 818020,
                    },
                ],
            },
            {
                id: "172621729332911595",
                type: "TalkNode",
                name: "受伤对话",
                dialogues: [
                    {
                        id: 71002306,
                        content:
                            "这人被打到怎么还活蹦乱跳的……不是说这是艾利西安缴获的宝贝吗，到底行不行啊——啊没没，没什么，这些钱给你，别到处乱说啊。",
                        npc: 818020,
                    },
                ],
            },
        ],
    },
    {
        id: 302802,
        name: "探险家大宝贝！",
        level: [30, 39],
        regionId: 1013,
        subRegionId: 101301,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1726642390063168308",
                type: "TalkNode",
                name: "npc开车对话",
                dialogues: [
                    {
                        id: 71002401,
                        content: "怎么勘探器还没干活就坏了，我的修理工具呢……",
                        npc: 818015,
                        next: 71002402,
                    },
                ],
            },
            {
                id: "1726643263425170183",
                type: "TalkNode",
                name: "皎皎npc选项对话",
                next: ["17266472150439078", "172664731297311071", "172664729217210673"],
                dialogues: [
                    {
                        id: 71002402,
                        content: "我们在这种地方都能遇到，太有缘了吧！既然你来了，那要不要帮忙照看下我的宝贝勘探器？",
                        npc: 818015,
                    },
                ],
            },
            {
                id: "17266461778812492",
                type: "TalkNode",
                name: "修理开车对话",
                next: ["172664731297311071", "172664729217210673"],
                dialogues: [
                    {
                        id: 71002403,
                        content: "好耶，你就在它边上不要走动哦，我找到工具了就回来！",
                        npc: 818015,
                        next: 71002404,
                    },
                    {
                        id: 71002404,
                        content: "看起来是有几个零件卡住了，把它们弄开的话应该会更好修一些。",
                        npc: 100001,
                        next: 71002405,
                    },
                ],
            },
            {
                id: "17266472150439078",
                type: "TalkNode",
                name: "秽兽出现开车对话",
                next: ["172664729217210673"],
                dialogues: [
                    {
                        id: 71002405,
                        content: "（勘探器的响动将周围的秽兽吸引了过来，击退它们吧。）",
                        npc: 800006,
                        next: 71002407,
                    },
                ],
            },
            {
                id: "172664731297311071",
                type: "TalkNode",
                name: "修理完成对话",
                dialogues: [
                    {
                        id: 71002406,
                        content: "诶，你还帮我把卡住的零件掰开了吗，好感动！",
                        npc: 818015,
                    },
                ],
            },
            {
                id: "172664729217210673",
                type: "TalkNode",
                name: "击杀秽兽后的对话",
                dialogues: [
                    {
                        id: 71002407,
                        content: "久等啦！我就知道交给你照看肯定没问题！",
                        npc: 818015,
                    },
                ],
            },
        ],
    },
    {
        id: 302803,
        name: "探险家大宝贝！",
        level: [40, 49],
        regionId: 1013,
        subRegionId: 101301,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1726642390063168308",
                type: "TalkNode",
                name: "npc开车对话",
                dialogues: [
                    {
                        id: 71002401,
                        content: "怎么勘探器还没干活就坏了，我的修理工具呢……",
                        npc: 818015,
                        next: 71002402,
                    },
                ],
            },
            {
                id: "1726643263425170183",
                type: "TalkNode",
                name: "皎皎npc选项对话",
                next: ["17266472150439078", "172664731297311071", "172664729217210673"],
                dialogues: [
                    {
                        id: 71002402,
                        content: "我们在这种地方都能遇到，太有缘了吧！既然你来了，那要不要帮忙照看下我的宝贝勘探器？",
                        npc: 818015,
                    },
                ],
            },
            {
                id: "17266461778812492",
                type: "TalkNode",
                name: "修理开车对话",
                next: ["172664731297311071", "172664729217210673"],
                dialogues: [
                    {
                        id: 71002403,
                        content: "好耶，你就在它边上不要走动哦，我找到工具了就回来！",
                        npc: 818015,
                        next: 71002404,
                    },
                    {
                        id: 71002404,
                        content: "看起来是有几个零件卡住了，把它们弄开的话应该会更好修一些。",
                        npc: 100001,
                        next: 71002405,
                    },
                ],
            },
            {
                id: "17266472150439078",
                type: "TalkNode",
                name: "秽兽出现开车对话",
                next: ["172664729217210673"],
                dialogues: [
                    {
                        id: 71002405,
                        content: "（勘探器的响动将周围的秽兽吸引了过来，击退它们吧。）",
                        npc: 800006,
                        next: 71002407,
                    },
                ],
            },
            {
                id: "172664731297311071",
                type: "TalkNode",
                name: "修理完成对话",
                dialogues: [
                    {
                        id: 71002406,
                        content: "诶，你还帮我把卡住的零件掰开了吗，好感动！",
                        npc: 818015,
                    },
                ],
            },
            {
                id: "172664729217210673",
                type: "TalkNode",
                name: "击杀秽兽后的对话",
                dialogues: [
                    {
                        id: 71002407,
                        content: "久等啦！我就知道交给你照看肯定没问题！",
                        npc: 818015,
                    },
                ],
            },
        ],
    },
    {
        id: 303003,
        name: "疏通水道",
        level: [40, 49],
        regionId: 1017,
        subRegionId: 101702,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17283558589831688",
                type: "TalkNode",
                name: "士兵npc开车对话",
                next: ["17283754155976195"],
                dialogues: [
                    {
                        id: 71002501,
                        content: "唉……这破下水道怎么又堵了……",
                        npc: 818021,
                        next: 71002502,
                    },
                ],
            },
            {
                id: "17283558999162442",
                type: "TalkNode",
                name: "与npc对话接取任务",
                next: ["17283561288275796", "17283561687956868", "17283562494248687"],
                dialogues: [
                    {
                        id: 71002502,
                        content: "发生什么了？",
                        npc: 100001,
                        next: 71002503,
                    },
                    {
                        id: 71002503,
                        content: "这片下水道堵住了，长官给了我个说明书，但我根本看不懂啊……你能帮帮我吗？",
                        npc: 818021,
                        options: [
                            {
                                id: 710025041,
                                content: "（接受。）",
                                next: 71002505,
                            },
                            {
                                id: 710025042,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71002505,
                        content: "说明书上说，遇到下水道堵塞只要开启三道闸门放水强冲即可。",
                        npc: 100001,
                        next: 71002511,
                    },
                    {
                        id: 71002511,
                        content: "原来是这样啊，那你能示范一下怎么操作吗，我看着学一下。",
                        npc: 818021,
                        next: 71002507,
                    },
                ],
            },
            {
                id: "17283754155976195",
                type: "TalkNode",
                name: "提前销毁垃圾与npc交付任务",
                dialogues: [
                    {
                        id: 71002510,
                        content: "嘿，你这法子也不赖嘛，来来，这是给你的报酬。",
                        npc: 818021,
                    },
                ],
            },
            {
                id: "17283561288275796",
                type: "TalkNode",
                name: "连线完成开车对话",
                next: ["17283562494248687"],
                dialogues: [
                    {
                        id: 71002507,
                        content: "好嘞，接下来第二个在那边。",
                        npc: 818021,
                        next: 71002508,
                    },
                ],
            },
            {
                id: "17283561687956868",
                type: "TalkNode",
                name: "转圈完成开车对话",
                dialogues: [
                    {
                        id: 71002508,
                        content: "第三个我看看啊……找到了，就在那！",
                        npc: 818021,
                        next: 71002509,
                    },
                ],
            },
            {
                id: "17283562494248687",
                type: "TalkNode",
                name: "与npc交付任务",
                dialogues: [
                    {
                        id: 71002509,
                        content: "好，我已经完全掌握了！这是我的一点心意，辛苦你啦！",
                        npc: 818021,
                    },
                ],
            },
        ],
    },
    {
        id: 303004,
        name: "疏通水道",
        level: [50, 59],
        regionId: 1017,
        subRegionId: 101702,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17283558589831688",
                type: "TalkNode",
                name: "士兵npc开车对话",
                next: ["17283754155976195"],
                dialogues: [
                    {
                        id: 71002501,
                        content: "唉……这破下水道怎么又堵了……",
                        npc: 818021,
                        next: 71002502,
                    },
                ],
            },
            {
                id: "17283558999162442",
                type: "TalkNode",
                name: "与npc对话接取任务",
                next: ["17283561288275796", "17283561687956868", "17283562494248687"],
                dialogues: [
                    {
                        id: 71002502,
                        content: "发生什么了？",
                        npc: 100001,
                        next: 71002503,
                    },
                    {
                        id: 71002503,
                        content: "这片下水道堵住了，长官给了我个说明书，但我根本看不懂啊……你能帮帮我吗？",
                        npc: 818021,
                        options: [
                            {
                                id: 710025041,
                                content: "（接受。）",
                                next: 71002505,
                            },
                            {
                                id: 710025042,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71002505,
                        content: "说明书上说，遇到下水道堵塞只要开启三道闸门放水强冲即可。",
                        npc: 100001,
                        next: 71002511,
                    },
                    {
                        id: 71002511,
                        content: "原来是这样啊，那你能示范一下怎么操作吗，我看着学一下。",
                        npc: 818021,
                        next: 71002507,
                    },
                ],
            },
            {
                id: "17283754155976195",
                type: "TalkNode",
                name: "提前销毁垃圾与npc交付任务",
                dialogues: [
                    {
                        id: 71002510,
                        content: "嘿，你这法子也不赖嘛，来来，这是给你的报酬。",
                        npc: 818021,
                    },
                ],
            },
            {
                id: "17283561288275796",
                type: "TalkNode",
                name: "连线完成开车对话",
                next: ["17283562494248687"],
                dialogues: [
                    {
                        id: 71002507,
                        content: "好嘞，接下来第二个在那边。",
                        npc: 818021,
                        next: 71002508,
                    },
                ],
            },
            {
                id: "17283561687956868",
                type: "TalkNode",
                name: "转圈完成开车对话",
                dialogues: [
                    {
                        id: 71002508,
                        content: "第三个我看看啊……找到了，就在那！",
                        npc: 818021,
                        next: 71002509,
                    },
                ],
            },
            {
                id: "17283562494248687",
                type: "TalkNode",
                name: "与npc交付任务",
                dialogues: [
                    {
                        id: 71002509,
                        content: "好，我已经完全掌握了！这是我的一点心意，辛苦你啦！",
                        npc: 818021,
                    },
                ],
            },
        ],
    },
    {
        id: 303103,
        name: "高效开采",
        level: [40, 49],
        regionId: 1013,
        subRegionId: 101304,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17283911971911434",
                type: "TalkNode",
                name: "npc开车对话",
                next: ["17283915532677012", "1730189092375207466"],
                dialogues: [
                    {
                        id: 71002601,
                        content: "可恶，这镐子也太不耐用了，剩下这些石头咋办呢，总不能让我用手挖吧……",
                        npc: 818023,
                        next: 71002602,
                    },
                ],
            },
            {
                id: "17283914455534287",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71002602,
                        content: "看你的打扮，也是狩月人吧。我接的这个挖石头委托一个人做不完了，你要不要跟我一起？报酬直接分你一半。",
                        npc: 818023,
                        options: [
                            {
                                id: 710026021,
                                content: "（接受。）",
                                next: 71002603,
                            },
                            {
                                id: 710026022,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71002603,
                        content: "好，剩下的这些就交给你了，我来整理下之前挖好的。",
                        npc: 818023,
                    },
                ],
            },
            {
                id: "17283915532677012",
                type: "TalkNode",
                name: "正常对话",
                dialogues: [
                    {
                        id: 71002605,
                        content: "辛苦你了，这是说好的报酬。",
                        npc: 818023,
                    },
                ],
            },
            {
                id: "1730189092375207466",
                type: "TalkNode",
                name: "落石对话",
                dialogues: [
                    {
                        id: 71002604,
                        content: "原来还有这种办法，太厉害了！",
                        npc: 818023,
                        next: 71002605,
                    },
                    {
                        id: 71002605,
                        content: "辛苦你了，这是说好的报酬。",
                        npc: 818023,
                    },
                ],
            },
        ],
    },
    {
        id: 303104,
        name: "高效开采",
        level: [50, 59],
        regionId: 1013,
        subRegionId: 101304,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17283911971911434",
                type: "TalkNode",
                name: "npc开车对话",
                next: ["17283915532677012", "1730189092375207466"],
                dialogues: [
                    {
                        id: 71002601,
                        content: "可恶，这镐子也太不耐用了，剩下这些石头咋办呢，总不能让我用手挖吧……",
                        npc: 818023,
                        next: 71002602,
                    },
                ],
            },
            {
                id: "17283914455534287",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71002602,
                        content: "看你的打扮，也是狩月人吧。我接的这个挖石头委托一个人做不完了，你要不要跟我一起？报酬直接分你一半。",
                        npc: 818023,
                        options: [
                            {
                                id: 710026021,
                                content: "（接受。）",
                                next: 71002603,
                            },
                            {
                                id: 710026022,
                                content: "（拒绝。）",
                            },
                        ],
                    },
                    {
                        id: 71002603,
                        content: "好，剩下的这些就交给你了，我来整理下之前挖好的。",
                        npc: 818023,
                    },
                ],
            },
            {
                id: "17283915532677012",
                type: "TalkNode",
                name: "正常对话",
                dialogues: [
                    {
                        id: 71002605,
                        content: "辛苦你了，这是说好的报酬。",
                        npc: 818023,
                    },
                ],
            },
            {
                id: "1730189092375207466",
                type: "TalkNode",
                name: "落石对话",
                dialogues: [
                    {
                        id: 71002604,
                        content: "原来还有这种办法，太厉害了！",
                        npc: 818023,
                        next: 71002605,
                    },
                    {
                        id: 71002605,
                        content: "辛苦你了，这是说好的报酬。",
                        npc: 818023,
                    },
                ],
            },
        ],
    },
    {
        id: 303402,
        name: "集团进军",
        level: [30, 39],
        regionId: 1021,
        subRegionId: 102101,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17284621083081025",
                type: "TalkNode",
                name: "开车对话",
                next: ["1731230717892630959"],
                dialogues: [
                    {
                        id: 71002901,
                        content: "（敌人在士官的指挥下稳步向你推进，尽快击败士官，打乱对方的指挥吧。）",
                        npc: 800006,
                        next: 71002903,
                    },
                ],
            },
            {
                id: "1731230657043629799",
                type: "TalkNode",
                name: "战局僵持引来了更多的士兵",
                dialogues: [
                    {
                        id: 71002903,
                        content: "（士官呼叫了新的援军，更多的敌人向你袭来了。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "1731230717892630959",
                type: "TalkNode",
                name: "精准的斩首",
                dialogues: [
                    {
                        id: 71002902,
                        content: "（敌人在你冷静而正确的应对中溃败。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 303403,
        name: "集团进军",
        level: [40, 49],
        regionId: 1021,
        subRegionId: 102101,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17284621083081025",
                type: "TalkNode",
                name: "开车对话",
                next: ["1731230717892630959"],
                dialogues: [
                    {
                        id: 71002901,
                        content: "（敌人在士官的指挥下稳步向你推进，尽快击败士官，打乱对方的指挥吧。）",
                        npc: 800006,
                        next: 71002903,
                    },
                ],
            },
            {
                id: "1731230657043629799",
                type: "TalkNode",
                name: "战局僵持引来了更多的士兵",
                dialogues: [
                    {
                        id: 71002903,
                        content: "（士官呼叫了新的援军，更多的敌人向你袭来了。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "1731230717892630959",
                type: "TalkNode",
                name: "精准的斩首",
                dialogues: [
                    {
                        id: 71002902,
                        content: "（敌人在你冷静而正确的应对中溃败。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 303502,
        name: "历战的阴影",
        level: [30, 39],
        regionId: 1021,
        subRegionId: 102102,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1728628970815830",
                type: "TalkNode",
                name: "任务开车",
                next: ["17286298285194759", "17286300497369245"],
                dialogues: [
                    {
                        id: 71003001,
                        content: "（游荡的秽兽不安地嘶吼着，为附近笼罩起一丝不详的气息。尽快击退它们吧。）",
                        npc: 800006,
                        next: 71003004,
                    },
                ],
            },
            {
                id: "17301682153821991",
                type: "TalkNode",
                name: "完成任务开车",
                dialogues: [
                    {
                        id: 71003004,
                        content: "（不祥的气息随着这些秽兽一同消失了，你知道，这附近暂时安全了。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17286298285194759",
                type: "TalkNode",
                name: "击杀第一波开车",
                next: ["17301682153821991"],
                dialogues: [
                    {
                        id: 71003002,
                        content: "（笼罩于此的不详气息越发凝重，你知道，有什么东西就要降临了。）",
                        npc: 800006,
                        next: 71003004,
                    },
                ],
            },
            {
                id: "17286300497369245",
                type: "TalkNode",
                name: "历战者出现开车",
                dialogues: [
                    {
                        id: 71003003,
                        content: "（争斗的声响引来了不屈的灾厄，不详的化身终于降临于此。击败它吧，就像过去的无数次一样。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 303503,
        name: "历战的阴影",
        level: [40, 49],
        regionId: 1021,
        subRegionId: 102102,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1728628970815830",
                type: "TalkNode",
                name: "任务开车",
                next: ["17286298285194759", "17286300497369245"],
                dialogues: [
                    {
                        id: 71003001,
                        content: "（游荡的秽兽不安地嘶吼着，为附近笼罩起一丝不详的气息。尽快击退它们吧。）",
                        npc: 800006,
                        next: 71003004,
                    },
                ],
            },
            {
                id: "17301682153821991",
                type: "TalkNode",
                name: "完成任务开车",
                dialogues: [
                    {
                        id: 71003004,
                        content: "（不祥的气息随着这些秽兽一同消失了，你知道，这附近暂时安全了。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17286298285194759",
                type: "TalkNode",
                name: "击杀第一波开车",
                next: ["17301682153821991"],
                dialogues: [
                    {
                        id: 71003002,
                        content: "（笼罩于此的不详气息越发凝重，你知道，有什么东西就要降临了。）",
                        npc: 800006,
                        next: 71003004,
                    },
                ],
            },
            {
                id: "17286300497369245",
                type: "TalkNode",
                name: "历战者出现开车",
                dialogues: [
                    {
                        id: 71003003,
                        content: "（争斗的声响引来了不屈的灾厄，不详的化身终于降临于此。击败它吧，就像过去的无数次一样。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 303504,
        name: "历战的阴影",
        level: [50, 59],
        regionId: 1021,
        subRegionId: 102102,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1728628970815830",
                type: "TalkNode",
                name: "任务开车",
                next: ["17286298285194759", "17286300497369245"],
                dialogues: [
                    {
                        id: 71003001,
                        content: "（游荡的秽兽不安地嘶吼着，为附近笼罩起一丝不详的气息。尽快击退它们吧。）",
                        npc: 800006,
                        next: 71003004,
                    },
                ],
            },
            {
                id: "17301682153821991",
                type: "TalkNode",
                name: "完成任务开车",
                dialogues: [
                    {
                        id: 71003004,
                        content: "（不祥的气息随着这些秽兽一同消失了，你知道，这附近暂时安全了。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17286298285194759",
                type: "TalkNode",
                name: "击杀第一波开车",
                next: ["17301682153821991"],
                dialogues: [
                    {
                        id: 71003002,
                        content: "（笼罩于此的不详气息越发凝重，你知道，有什么东西就要降临了。）",
                        npc: 800006,
                        next: 71003004,
                    },
                ],
            },
            {
                id: "17286300497369245",
                type: "TalkNode",
                name: "历战者出现开车",
                dialogues: [
                    {
                        id: 71003003,
                        content: "（争斗的声响引来了不屈的灾厄，不详的化身终于降临于此。击败它吧，就像过去的无数次一样。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 303805,
        name: "解救魔灵",
        level: [60, 65],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17309718779544631",
                type: "TalkNode",
                name: "解救宠物开车",
                dialogues: [
                    {
                        id: 71003101,
                        content: "（最近多了好些觊觎魔灵的家伙，击退他们，救下眼前这只可怜的魔灵吧。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17310515645821047796",
                type: "TalkNode",
                name: "击杀初始士兵开车",
                dialogues: [
                    {
                        id: 71003102,
                        content: "（更多敌人从远处冲了过来。）",
                        npc: 800006,
                        next: 71003103,
                    },
                ],
            },
            {
                id: "17310519710431049226",
                type: "TalkNode",
                name: "击杀初始士兵开车",
                dialogues: [
                    {
                        id: 71003103,
                        content: "（现在，这只魔灵安全了。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17309644977061030347",
                type: "TalkNode",
                name: "解救宠物开车",
                dialogues: [
                    {
                        id: 71003101,
                        content: "（最近多了好些觊觎魔灵的家伙，击退他们，救下眼前这只可怜的魔灵吧。）",
                        npc: 800006,
                        next: 71003102,
                    },
                ],
            },
        ],
    },
    {
        id: 304604,
        name: "紧急警报",
        level: [50, 59],
        regionId: 1021,
        subRegionId: 102102,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1733301967132381",
                type: "TalkNode",
                name: "磁暴机出现开车",
                next: ["17333020012021437", "17333019938241163"],
                dialogues: [
                    {
                        id: 71003601,
                        content: "（四周突然响起了刺耳的警报，大量磁暴机朝你涌了过来。）",
                        npc: 800006,
                        next: 71003602,
                    },
                ],
            },
            {
                id: "1733301985076892",
                type: "TalkNode",
                name: "磁暴机出现开车",
                next: ["17333019938241163"],
                dialogues: [
                    {
                        id: 71003602,
                        content: "（警报愈发响亮，更多敌人朝你涌了过来。）",
                        npc: 800006,
                        next: 71003604,
                    },
                ],
            },
            {
                id: "17333020012021437",
                type: "TalkNode",
                name: "磁暴机出现开车",
                dialogues: [
                    {
                        id: 71003604,
                        content: "（伴随着所有敌人倒下，四周总算重归寂静。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17333019938241163",
                type: "TalkNode",
                name: "磁暴机出现开车",
                dialogues: [
                    {
                        id: 71003603,
                        content: "（在逐渐安静的警报声中，最后一批敌人抵达了此处。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 304705,
        name: "皎皎特快，送啥都快",
        level: [60, 65],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1733390377241859",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71003701,
                        content: "咱不想……不想……不想上工啊……",
                        npc: 818019,
                        next: 71003702,
                    },
                ],
            },
            {
                id: "1733390377241860",
                type: "TalkNode",
                name: "交互对话",
                next: ["17389193325263037998", "17333922705951264955", "1733390377241879"],
                dialogues: [
                    {
                        id: 71003702,
                        content: "可恶……怎么这次还要往泪湖送吃的啊。大家就不能挑点正常的地方吃饭吗！不怕出事吗！跑死我了……",
                        npc: 818019,
                        next: 71003703,
                    },
                    {
                        id: 71003703,
                        content: "需要帮忙吗？",
                        npc: 100001,
                        next: 71003704,
                    },
                    {
                        id: 71003704,
                        content: "需要！我需要你狠狠咬几口这些麻烦的客人，还要朝他们丢一大堆雪球！让他们以后别在这么难找的地方叫人送菜了。",
                        npc: 818019,
                        options: [
                            {
                                id: 710037041,
                                content: "收到收到，嗷呜嗷呜嗷呜。",
                                next: 71003705,
                            },
                            {
                                id: 710037042,
                                content: "你又在被工作压榨得说气话了。",
                                next: 71003705,
                            },
                        ],
                    },
                    {
                        id: 71003705,
                        content: "唉……也就只能嘴上过过瘾了，你来了就陪咱一起去吧，多个人路上还能解解闷。上工上工……",
                        npc: 818019,
                        next: 71003706,
                    },
                ],
            },
            {
                id: "1733390377241867",
                type: "TalkNode",
                name: "冰柱开车",
                next: ["17333922705951264955", "1733390377241879"],
                dialogues: [
                    {
                        id: 71003706,
                        content: "这些冰渣渣掉进菜里就不好了，有没有什么办法把它们清理掉呢……",
                        npc: 818019,
                        next: 71003707,
                    },
                ],
            },
            {
                id: "17389193325263037998",
                type: "TalkNode",
                name: "打完冰锥开车",
                next: ["1733390377241879"],
                dialogues: [
                    {
                        id: 71003707,
                        content: "诶，好快！菜都还是暖的呢，我们快点送过去吧，不然老板又要唠唠叨叨了。",
                        npc: 818019,
                        next: 71003708,
                    },
                ],
            },
            {
                id: "17333922705951264955",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71003708,
                        content: "救命啊，至少让我吃饱了再死！",
                        npc: 818029,
                        next: 71003709,
                    },
                    {
                        id: 71003709,
                        content: "居然真出事了啊！我们过去救他吧，如果他在老板面前夸夸我，老板说不定会给咱加工钱呢，嘿嘿，嘿嘿嘿……",
                        npc: 818019,
                        next: 71003710,
                    },
                ],
            },
            {
                id: "1733390377241879",
                type: "TalkNode",
                name: "订餐人和外送皎皎对话",
                dialogues: [
                    {
                        id: 71003710,
                        content: "碍眼的家伙没了，还有新鲜的饭菜，配着泪湖的美景，真是一大享受啊~",
                        npc: 818024,
                        next: 71003711,
                    },
                    {
                        id: 71003711,
                        content: "啊，那个……客人，你还没付钱……",
                        npc: 818019,
                        next: 71003712,
                    },
                    {
                        id: 71003712,
                        content: "嗯？你不就是个跑腿的吗，站在这干啥？餐钱等我下次去你们餐厅再结。",
                        npc: 818024,
                        next: 71003713,
                    },
                    {
                        id: 71003713,
                        content: "可是……这样咱没法交差呀……",
                        npc: 818019,
                        next: 71003714,
                    },
                    {
                        id: 71003714,
                        content: "（你将一切看在眼里，迈步跟了上去。没有人注意到，你背在身后的手上已经悄悄攒出了一枚雪球，蓄势待发。）",
                        npc: 800006,
                        next: 71003715,
                    },
                    {
                        id: 71003715,
                        content: "啊！哪来的雪球，好冰好冰！啊啊啊啊我的饭掉水里了！不————",
                        npc: 818024,
                    },
                ],
            },
        ],
    },
    {
        id: 305304,
        name: "解救魔灵",
        level: [50, 59],
        regionId: 1001,
        subRegionId: 100103,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17339943404071659",
                type: "TalkNode",
                name: "解救宠物开车",
                dialogues: [
                    {
                        id: 71003101,
                        content: "（最近多了好些觊觎魔灵的家伙，击退他们，救下眼前这只可怜的魔灵吧。）",
                        npc: 800006,
                        next: 71003102,
                    },
                ],
            },
            {
                id: "17339943404071665",
                type: "TalkNode",
                name: "击杀初始士兵开车",
                dialogues: [
                    {
                        id: 71003102,
                        content: "（更多敌人从远处冲了过来。）",
                        npc: 800006,
                        next: 71003103,
                    },
                ],
            },
            {
                id: "17339943404071666",
                type: "TalkNode",
                name: "击杀初始士兵开车",
                dialogues: [
                    {
                        id: 71003103,
                        content: "（现在，这只魔灵安全了。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 305503,
        name: "解救魔灵",
        level: [40, 49],
        regionId: 1021,
        subRegionId: 102101,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17496245223333461361",
                type: "TalkNode",
                name: "解救宠物开车",
                next: ["17496245223343461368"],
                dialogues: [
                    {
                        id: 71004401,
                        content: "（游荡的秽兽挤满了四周，先击退它们，再去解救魔灵吧。）",
                        npc: 800006,
                        next: 71004402,
                    },
                ],
            },
            {
                id: "17496245223343461367",
                type: "TalkNode",
                name: "击杀秽兽开车",
                dialogues: [
                    {
                        id: 71004402,
                        content: "（争斗的声响引来了不屈的灾厄，不详的化身终于降临于此。击败它吧，就像过去的无数次一样。）",
                        npc: 800006,
                        next: 71004403,
                    },
                ],
            },
            {
                id: "17496245223343461368",
                type: "TalkNode",
                name: "击杀初始士兵开车",
                dialogues: [
                    {
                        id: 71004403,
                        content: "（附近暂时安全了，趁现在解救魔灵吧。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 305604,
        name: "物资回收",
        level: [50, 59],
        regionId: 1021,
        subRegionId: 102102,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1734946732439697248",
                type: "TalkNode",
                name: "遇见秽兽开车对话",
                next: ["1734946718932696931"],
                dialogues: [
                    {
                        id: 71004502,
                        content: "（不详的化身终于降临于此，击败它后再回收物资吧。）",
                        npc: 800006,
                        next: 71004503,
                    },
                ],
            },
            {
                id: "17345133751031367225",
                type: "TalkNode",
                name: "遇到指挥官开车",
                next: ["17349380967271361"],
                dialogues: [
                    {
                        id: 71004501,
                        content: "（敌人站在要回收的物资前，击败他们吧。）",
                        npc: 800006,
                        next: 71004503,
                    },
                ],
            },
            {
                id: "1734946718932696931",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71004503,
                        content: "（附近暂时安全了，趁现在回收所有物资吧。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17349380967271361",
                type: "TalkNode",
                name: "完成开车",
                dialogues: [
                    {
                        id: 71004503,
                        content: "（附近暂时安全了，趁现在回收所有物资吧。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 305605,
        name: "物资回收",
        level: [60, 65],
        regionId: 1021,
        subRegionId: 102102,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1734946732439697248",
                type: "TalkNode",
                name: "遇见秽兽开车对话",
                next: ["1734946718932696931"],
                dialogues: [
                    {
                        id: 71004502,
                        content: "（不详的化身终于降临于此，击败它后再回收物资吧。）",
                        npc: 800006,
                        next: 71004503,
                    },
                ],
            },
            {
                id: "17345133751031367225",
                type: "TalkNode",
                name: "遇到指挥官开车",
                next: ["17349380967271361"],
                dialogues: [
                    {
                        id: 71004501,
                        content: "（敌人站在要回收的物资前，击败他们吧。）",
                        npc: 800006,
                        next: 71004503,
                    },
                ],
            },
            {
                id: "1734946718932696931",
                type: "TalkNode",
                name: "开车对话",
                dialogues: [
                    {
                        id: 71004503,
                        content: "（附近暂时安全了，趁现在回收所有物资吧。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17349380967271361",
                type: "TalkNode",
                name: "完成开车",
                dialogues: [
                    {
                        id: 71004503,
                        content: "（附近暂时安全了，趁现在回收所有物资吧。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 305804,
        name: "趋光性",
        level: [50, 59],
        regionId: 1021,
        subRegionId: 102102,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17347740680422272057",
                type: "TalkNode",
                name: "拾取开车",
                next: ["17349199775691487", "17349224256022046976"],
                dialogues: [
                    {
                        id: 71004701,
                        content: "（远处闪闪发光的东西吸引了你的注意，靠近看看到底是什么吧。）",
                        npc: 800006,
                        next: 71004702,
                    },
                ],
            },
            {
                id: "17347742024902273153",
                type: "TalkNode",
                name: "战斗开车",
                next: ["17349224256022046976"],
                dialogues: [
                    {
                        id: 71004702,
                        content: "（在你捡起物资的一瞬间，警报响起，大量敌人朝你涌了过来，击退他们吧。）",
                        npc: 800006,
                        next: 71004703,
                    },
                ],
            },
            {
                id: "17349199775691487",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71004703,
                        content: "（警报解除，又一批敌人循着声响赶到了此处，击退他们吧。）",
                        npc: 800006,
                        next: 71004704,
                    },
                ],
            },
            {
                id: "17349224256022046976",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71004704,
                        content: "（伴随着所有敌人倒下，四周总算重归寂静。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 305805,
        name: "趋光性",
        level: [60, 65],
        regionId: 1021,
        subRegionId: 102102,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17347740680422272057",
                type: "TalkNode",
                name: "拾取开车",
                next: ["17349199775691487", "17349224256022046976"],
                dialogues: [
                    {
                        id: 71004701,
                        content: "（远处闪闪发光的东西吸引了你的注意，靠近看看到底是什么吧。）",
                        npc: 800006,
                        next: 71004702,
                    },
                ],
            },
            {
                id: "17347742024902273153",
                type: "TalkNode",
                name: "战斗开车",
                next: ["17349224256022046976"],
                dialogues: [
                    {
                        id: 71004702,
                        content: "（在你捡起物资的一瞬间，警报响起，大量敌人朝你涌了过来，击退他们吧。）",
                        npc: 800006,
                        next: 71004703,
                    },
                ],
            },
            {
                id: "17349199775691487",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71004703,
                        content: "（警报解除，又一批敌人循着声响赶到了此处，击退他们吧。）",
                        npc: 800006,
                        next: 71004704,
                    },
                ],
            },
            {
                id: "17349224256022046976",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71004704,
                        content: "（伴随着所有敌人倒下，四周总算重归寂静。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 306105,
        name: "解救魔灵",
        level: [60, 65],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17352033481294260800",
                type: "TalkNode",
                name: "解救宠物开车",
                dialogues: [
                    {
                        id: 71003101,
                        content: "（最近多了好些觊觎魔灵的家伙，击退他们，救下眼前这只可怜的魔灵吧。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17352033481294260808",
                type: "TalkNode",
                name: "解救宠物开车",
                dialogues: [
                    {
                        id: 71003101,
                        content: "（最近多了好些觊觎魔灵的家伙，击退他们，救下眼前这只可怜的魔灵吧。）",
                        npc: 800006,
                        next: 71003102,
                    },
                ],
            },
            {
                id: "17352033481294260814",
                type: "TalkNode",
                name: "击杀初始士兵开车",
                dialogues: [
                    {
                        id: 71003102,
                        content: "（更多敌人从远处冲了过来。）",
                        npc: 800006,
                        next: 71003103,
                    },
                ],
            },
            {
                id: "17352033481294260815",
                type: "TalkNode",
                name: "击杀初始士兵开车",
                dialogues: [
                    {
                        id: 71003103,
                        content: "（现在，这只魔灵安全了。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 306204,
        name: "冰湖留念",
        level: [50, 59],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1749799107834369970",
                type: "TalkNode",
                name: "拍照开车",
                dialogues: [
                    {
                        id: 71005001,
                        content: "喂，那边的朋友，能帮我拍张照吗？",
                        npc: 818041,
                        next: 71005002,
                    },
                ],
            },
            {
                id: "1749799107834369971",
                type: "TalkNode",
                name: "交互开车",
                dialogues: [
                    {
                        id: 71005002,
                        content: "这位朋友，你能帮我拍几张照片吗？难得来一趟冰湖城，不留点合影就太可惜了。",
                        npc: 818041,
                        options: [
                            {
                                id: 710050021,
                                content: "（接受。）",
                                next: 71005004,
                            },
                            {
                                id: 710050022,
                                content: "（拒绝。）",
                                next: 71005005,
                            },
                        ],
                    },
                    {
                        id: 71005004,
                        content: "太好了，记得把我后面的这栋房子也拍进去哦，我很喜欢它的造型。",
                        npc: 818041,
                        next: 71005005,
                    },
                ],
            },
            {
                id: "1749799107834369975",
                type: "TalkNode",
                name: "完成对话",
                dialogues: [
                    {
                        id: 71005005,
                        content: "你拍得也太好了，真棒呀，多谢多谢。",
                        npc: 818041,
                    },
                ],
            },
        ],
    },
    {
        id: 306205,
        name: "冰湖留念",
        level: [60, 65],
        regionId: 1011,
        subRegionId: 101101,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1749799107834369970",
                type: "TalkNode",
                name: "拍照开车",
                dialogues: [
                    {
                        id: 71005001,
                        content: "喂，那边的朋友，能帮我拍张照吗？",
                        npc: 818041,
                        next: 71005002,
                    },
                ],
            },
            {
                id: "1749799107834369971",
                type: "TalkNode",
                name: "交互开车",
                dialogues: [
                    {
                        id: 71005002,
                        content: "这位朋友，你能帮我拍几张照片吗？难得来一趟冰湖城，不留点合影就太可惜了。",
                        npc: 818041,
                        options: [
                            {
                                id: 710050021,
                                content: "（接受。）",
                                next: 71005004,
                            },
                            {
                                id: 710050022,
                                content: "（拒绝。）",
                                next: 71005005,
                            },
                        ],
                    },
                    {
                        id: 71005004,
                        content: "太好了，记得把我后面的这栋房子也拍进去哦，我很喜欢它的造型。",
                        npc: 818041,
                        next: 71005005,
                    },
                ],
            },
            {
                id: "1749799107834369975",
                type: "TalkNode",
                name: "完成对话",
                dialogues: [
                    {
                        id: 71005005,
                        content: "你拍得也太好了，真棒呀，多谢多谢。",
                        npc: 818041,
                    },
                ],
            },
        ],
    },
    {
        id: 306304,
        name: "钩直饵咸",
        level: [50, 59],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17389950098501183",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005101,
                        content: "鱼来，鱼来。",
                        npc: 818045,
                        next: 71005102,
                    },
                ],
            },
            {
                id: "1735554997612596",
                type: "TalkNode",
                name: "你好，嘘",
                dialogues: [
                    {
                        id: 71005102,
                        content: "你在干什么？",
                        npc: 100001,
                        next: 71005103,
                    },
                    {
                        id: 71005103,
                        content: "钓鱼呢，等会再说。",
                        npc: 818045,
                        next: 71005104,
                    },
                ],
            },
            {
                id: "17355550413021357",
                type: "TalkNode",
                name: "你怎么不用鱼竿，嘘",
                dialogues: [
                    {
                        id: 71005104,
                        content: "（你在一旁等了许久，男人一条鱼都没钓上来。）",
                        npc: 800006,
                        next: 71005105,
                    },
                    {
                        id: 71005105,
                        content: "这样能钓上什么鱼啊？",
                        npc: 100001,
                        next: 71005106,
                    },
                    {
                        id: 71005106,
                        content: "别说话，看着就好。",
                        npc: 818045,
                        next: 71005107,
                    },
                ],
            },
            {
                id: "1735557002865702550",
                type: "TalkNode",
                name: "鱼都被你惊走了",
                next: ["17355573687811404590", "17355573702351404645"],
                dialogues: [
                    {
                        id: 71005107,
                        content: "（你在一旁等了许久，男人还是一条鱼都没钓上来。）",
                        npc: 800006,
                        next: 71005108,
                    },
                    {
                        id: 71005108,
                        content: "鱼来，鱼来。",
                        npc: 818045,
                        next: 71005109,
                    },
                    {
                        id: 71005109,
                        content: "我觉得钓鱼至少得有个鱼竿吧，而不是嘴上说说就能钓到。",
                        npc: 100001,
                        next: 71005110,
                    },
                    {
                        id: 71005110,
                        content: "这是我与无数人交流后掌握的最新钓鱼技巧，钓到的鱼那是又大又好，不信你去钓一条我们比比看。",
                        npc: 818045,
                        next: 71005131,
                    },
                ],
            },
            {
                id: "17355573675241404536",
                type: "TalkNode",
                name: "踩冰",
                next: ["1735645444397714471", "17356334967945608"],
                dialogues: [
                    {
                        id: 71005131,
                        content: "我钓到了，你的鱼呢？",
                        npc: 100001,
                        next: 71005132,
                    },
                    {
                        id: 71005132,
                        content: "嗯，你这确实是条大鱼，但跟我要钓的相比还是差了点。",
                        npc: 818045,
                        next: 71005133,
                    },
                    {
                        id: 71005133,
                        content: "那边几块浮冰害我的鱼不咬钩了，你去把它们踩碎再回来看看吧。",
                        npc: 818045,
                    },
                ],
            },
            {
                id: "17355573687811404590",
                type: "TalkNode",
                name: "绝世钓鱼鱼竿，去那边取",
                next: ["1735645444397714471", "17356335895467301"],
                dialogues: [
                    {
                        id: 71005121,
                        content: "我钓到了，你的鱼呢？",
                        npc: 100001,
                        next: 71005122,
                    },
                    {
                        id: 71005122,
                        content: "嗯，你这确实是条大鱼，但跟我要钓的相比还是差了点。",
                        npc: 818045,
                        next: 71005123,
                    },
                    {
                        id: 71005123,
                        content: "我听到那边有秽兽的动静，害我的鱼都不咬钩了，你去把它们赶走再回来看看吧。",
                        npc: 818045,
                    },
                ],
            },
            {
                id: "17355573702351404645",
                type: "TalkNode",
                name: "绝世钓鱼饵料秘方，去采集",
                next: ["17356338232029631"],
                dialogues: [
                    {
                        id: 71005111,
                        content: "我钓到了，你的鱼呢？",
                        npc: 100001,
                        next: 71005112,
                    },
                    {
                        id: 71005112,
                        content: "嗯，你这确实是条大鱼，但跟我要钓的相比还是差了点。",
                        npc: 818045,
                        next: 71005113,
                    },
                    {
                        id: 71005113,
                        content: "我闻到那边有莲草的味道，害我的鱼都不咬钩了，你去把它们拔了再回来看看吧。",
                        npc: 818045,
                    },
                ],
            },
            {
                id: "1735645444397714471",
                type: "TalkNode",
                name: "别打别打",
                next: ["17356335453556437"],
                dialogues: [
                    {
                        id: 71005141,
                        content: "看来只有一种办法能让你说真话了。",
                        npc: 100001,
                        next: 71005142,
                    },
                ],
            },
            {
                id: "17356334967945608",
                type: "TalkNode",
                name: "身法不错开车",
                next: ["17356334890285417"],
                dialogues: [
                    {
                        id: 71005134,
                        content: "男人说的问题解决掉了，回去看看吧。",
                        npc: 100001,
                        next: 71005135,
                    },
                ],
            },
            {
                id: "17356335895467301",
                type: "TalkNode",
                name: "Fix或者开车对话这就是鱼竿，回去吧",
                next: ["17356335786477207"],
                dialogues: [
                    {
                        id: 71005124,
                        content: "男人说的问题解决掉了，回去看看吧。",
                        npc: 100001,
                        next: 71005125,
                    },
                ],
            },
            {
                id: "17356334890285417",
                type: "TalkNode",
                name: "主动对话完成",
                dialogues: [
                    {
                        id: 71005135,
                        content: "弄好了，你说的鱼呢。",
                        npc: 100001,
                        next: 71005136,
                    },
                    {
                        id: 71005136,
                        content: "已经钓上了，你看。",
                        npc: 818045,
                        next: 71005137,
                    },
                    {
                        id: 71005137,
                        content: "（男人说完指了指你。）",
                        npc: 800006,
                        next: 71005138,
                    },
                    {
                        id: 71005138,
                        content: "钓鱼钓的也可以不是鱼。撒下几句话，做一些奇怪的事，就会有无数鱼争相咬钩。",
                        npc: 818045,
                        next: 71005139,
                    },
                    {
                        id: 71005139,
                        content: "这就是我与无数人交流后学到的感悟，希望以后你不会再被别人撒下的“鱼饵”戏弄。",
                        npc: 818045,
                        next: 71005140,
                    },
                    {
                        id: 71005140,
                        content: "折腾了你半天真是抱歉。这些是我的赔礼，对不起了。",
                        npc: 818045,
                    },
                ],
            },
            {
                id: "17356335786477207",
                type: "TalkNode",
                name: "主动对话完成",
                dialogues: [
                    {
                        id: 71005125,
                        content: "弄好了，你说的鱼呢。",
                        npc: 100001,
                        next: 71005126,
                    },
                    {
                        id: 71005126,
                        content: "已经钓上了，你看。",
                        npc: 818045,
                        next: 71005127,
                    },
                    {
                        id: 71005127,
                        content: "（男人说完指了指你。）",
                        npc: 800006,
                        next: 71005128,
                    },
                    {
                        id: 71005128,
                        content: "钓鱼钓的也可以不是鱼。撒下几句话，做一些奇怪的事，自会有无数鱼争相咬钩。",
                        npc: 818045,
                        next: 71005129,
                    },
                    {
                        id: 71005129,
                        content: "这就是我与无数人交流后学到的感悟，希望以后你不会再被别人撒下的“鱼饵”戏弄。",
                        npc: 818045,
                        next: 71005130,
                    },
                    {
                        id: 71005130,
                        content: "折腾了你半天真是抱歉。这些是我的赔礼，对不起了。",
                        npc: 818045,
                    },
                ],
            },
            {
                id: "17356338232029631",
                type: "TalkNode",
                name: "Fix或者开车对话这就是鱼饵材料，回去吧",
                next: ["17356338232029630"],
                dialogues: [
                    {
                        id: 71005114,
                        content: "男人说的问题解决掉了，回去看看吧。",
                        npc: 100001,
                        next: 71005115,
                    },
                ],
            },
            {
                id: "17356335453556437",
                type: "TalkNode",
                name: "主动对话求饶",
                dialogues: [
                    {
                        id: 71005142,
                        content: "我错了我错了，我就是看到经常有人随便讲几句话，就把一大波人耍得团团转，所以就想验证一下试试……",
                        npc: 818045,
                        next: 71005143,
                    },
                    {
                        id: 71005143,
                        content: "折腾了你半天真是抱歉。这些是我的赔礼，对不起了。",
                        npc: 818045,
                    },
                ],
            },
            {
                id: "17356338232029630",
                type: "TalkNode",
                name: "主动对话完成",
                dialogues: [
                    {
                        id: 71005115,
                        content: "弄好了，你说的鱼呢。",
                        npc: 100001,
                        next: 71005116,
                    },
                    {
                        id: 71005116,
                        content: "已经钓上了，你看。",
                        npc: 818045,
                        next: 71005117,
                    },
                    {
                        id: 71005117,
                        content: "（男人说完指了指你。）",
                        npc: 800006,
                        next: 71005118,
                    },
                    {
                        id: 71005118,
                        content: "钓鱼钓的也可以不是鱼。撒下几句话，做一些奇怪的事，自会有无数鱼争相咬钩。",
                        npc: 818045,
                        next: 71005119,
                    },
                    {
                        id: 71005119,
                        content: "这就是我与无数人交流后学到的感悟，希望以后你不会再被别人撒下的“鱼饵”戏弄。",
                        npc: 818045,
                        next: 71005120,
                    },
                    {
                        id: 71005120,
                        content: "折腾了你半天真是抱歉。这些是我的赔礼，对不起了。",
                        npc: 818045,
                    },
                ],
            },
        ],
    },
    {
        id: 306305,
        name: "钩直饵咸",
        level: [60, 65],
        regionId: 1011,
        subRegionId: 101103,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17389950098501183",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71005101,
                        content: "鱼来，鱼来。",
                        npc: 818045,
                        next: 71005102,
                    },
                ],
            },
            {
                id: "1735554997612596",
                type: "TalkNode",
                name: "你好，嘘",
                dialogues: [
                    {
                        id: 71005102,
                        content: "你在干什么？",
                        npc: 100001,
                        next: 71005103,
                    },
                    {
                        id: 71005103,
                        content: "钓鱼呢，等会再说。",
                        npc: 818045,
                        next: 71005104,
                    },
                ],
            },
            {
                id: "17355550413021357",
                type: "TalkNode",
                name: "你怎么不用鱼竿，嘘",
                dialogues: [
                    {
                        id: 71005104,
                        content: "（你在一旁等了许久，男人一条鱼都没钓上来。）",
                        npc: 800006,
                        next: 71005105,
                    },
                    {
                        id: 71005105,
                        content: "这样能钓上什么鱼啊？",
                        npc: 100001,
                        next: 71005106,
                    },
                    {
                        id: 71005106,
                        content: "别说话，看着就好。",
                        npc: 818045,
                        next: 71005107,
                    },
                ],
            },
            {
                id: "1735557002865702550",
                type: "TalkNode",
                name: "鱼都被你惊走了",
                next: ["17355573687811404590", "17355573702351404645"],
                dialogues: [
                    {
                        id: 71005107,
                        content: "（你在一旁等了许久，男人还是一条鱼都没钓上来。）",
                        npc: 800006,
                        next: 71005108,
                    },
                    {
                        id: 71005108,
                        content: "鱼来，鱼来。",
                        npc: 818045,
                        next: 71005109,
                    },
                    {
                        id: 71005109,
                        content: "我觉得钓鱼至少得有个鱼竿吧，而不是嘴上说说就能钓到。",
                        npc: 100001,
                        next: 71005110,
                    },
                    {
                        id: 71005110,
                        content: "这是我与无数人交流后掌握的最新钓鱼技巧，钓到的鱼那是又大又好，不信你去钓一条我们比比看。",
                        npc: 818045,
                        next: 71005131,
                    },
                ],
            },
            {
                id: "17355573675241404536",
                type: "TalkNode",
                name: "踩冰",
                next: ["1735645444397714471", "17356334967945608"],
                dialogues: [
                    {
                        id: 71005131,
                        content: "我钓到了，你的鱼呢？",
                        npc: 100001,
                        next: 71005132,
                    },
                    {
                        id: 71005132,
                        content: "嗯，你这确实是条大鱼，但跟我要钓的相比还是差了点。",
                        npc: 818045,
                        next: 71005133,
                    },
                    {
                        id: 71005133,
                        content: "那边几块浮冰害我的鱼不咬钩了，你去把它们踩碎再回来看看吧。",
                        npc: 818045,
                    },
                ],
            },
            {
                id: "17355573687811404590",
                type: "TalkNode",
                name: "绝世钓鱼鱼竿，去那边取",
                next: ["1735645444397714471", "17356335895467301"],
                dialogues: [
                    {
                        id: 71005121,
                        content: "我钓到了，你的鱼呢？",
                        npc: 100001,
                        next: 71005122,
                    },
                    {
                        id: 71005122,
                        content: "嗯，你这确实是条大鱼，但跟我要钓的相比还是差了点。",
                        npc: 818045,
                        next: 71005123,
                    },
                    {
                        id: 71005123,
                        content: "我听到那边有秽兽的动静，害我的鱼都不咬钩了，你去把它们赶走再回来看看吧。",
                        npc: 818045,
                    },
                ],
            },
            {
                id: "17355573702351404645",
                type: "TalkNode",
                name: "绝世钓鱼饵料秘方，去采集",
                next: ["17356338232029631"],
                dialogues: [
                    {
                        id: 71005111,
                        content: "我钓到了，你的鱼呢？",
                        npc: 100001,
                        next: 71005112,
                    },
                    {
                        id: 71005112,
                        content: "嗯，你这确实是条大鱼，但跟我要钓的相比还是差了点。",
                        npc: 818045,
                        next: 71005113,
                    },
                    {
                        id: 71005113,
                        content: "我闻到那边有莲草的味道，害我的鱼都不咬钩了，你去把它们拔了再回来看看吧。",
                        npc: 818045,
                    },
                ],
            },
            {
                id: "1735645444397714471",
                type: "TalkNode",
                name: "别打别打",
                next: ["17356335453556437"],
                dialogues: [
                    {
                        id: 71005141,
                        content: "看来只有一种办法能让你说真话了。",
                        npc: 100001,
                        next: 71005142,
                    },
                ],
            },
            {
                id: "17356334967945608",
                type: "TalkNode",
                name: "身法不错开车",
                next: ["17356334890285417"],
                dialogues: [
                    {
                        id: 71005134,
                        content: "男人说的问题解决掉了，回去看看吧。",
                        npc: 100001,
                        next: 71005135,
                    },
                ],
            },
            {
                id: "17356335895467301",
                type: "TalkNode",
                name: "Fix或者开车对话这就是鱼竿，回去吧",
                next: ["17356335786477207"],
                dialogues: [
                    {
                        id: 71005124,
                        content: "男人说的问题解决掉了，回去看看吧。",
                        npc: 100001,
                        next: 71005125,
                    },
                ],
            },
            {
                id: "17356334890285417",
                type: "TalkNode",
                name: "主动对话完成",
                dialogues: [
                    {
                        id: 71005135,
                        content: "弄好了，你说的鱼呢。",
                        npc: 100001,
                        next: 71005136,
                    },
                    {
                        id: 71005136,
                        content: "已经钓上了，你看。",
                        npc: 818045,
                        next: 71005137,
                    },
                    {
                        id: 71005137,
                        content: "（男人说完指了指你。）",
                        npc: 800006,
                        next: 71005138,
                    },
                    {
                        id: 71005138,
                        content: "钓鱼钓的也可以不是鱼。撒下几句话，做一些奇怪的事，就会有无数鱼争相咬钩。",
                        npc: 818045,
                        next: 71005139,
                    },
                    {
                        id: 71005139,
                        content: "这就是我与无数人交流后学到的感悟，希望以后你不会再被别人撒下的“鱼饵”戏弄。",
                        npc: 818045,
                        next: 71005140,
                    },
                    {
                        id: 71005140,
                        content: "折腾了你半天真是抱歉。这些是我的赔礼，对不起了。",
                        npc: 818045,
                    },
                ],
            },
            {
                id: "17356335786477207",
                type: "TalkNode",
                name: "主动对话完成",
                dialogues: [
                    {
                        id: 71005125,
                        content: "弄好了，你说的鱼呢。",
                        npc: 100001,
                        next: 71005126,
                    },
                    {
                        id: 71005126,
                        content: "已经钓上了，你看。",
                        npc: 818045,
                        next: 71005127,
                    },
                    {
                        id: 71005127,
                        content: "（男人说完指了指你。）",
                        npc: 800006,
                        next: 71005128,
                    },
                    {
                        id: 71005128,
                        content: "钓鱼钓的也可以不是鱼。撒下几句话，做一些奇怪的事，自会有无数鱼争相咬钩。",
                        npc: 818045,
                        next: 71005129,
                    },
                    {
                        id: 71005129,
                        content: "这就是我与无数人交流后学到的感悟，希望以后你不会再被别人撒下的“鱼饵”戏弄。",
                        npc: 818045,
                        next: 71005130,
                    },
                    {
                        id: 71005130,
                        content: "折腾了你半天真是抱歉。这些是我的赔礼，对不起了。",
                        npc: 818045,
                    },
                ],
            },
            {
                id: "17356338232029631",
                type: "TalkNode",
                name: "Fix或者开车对话这就是鱼饵材料，回去吧",
                next: ["17356338232029630"],
                dialogues: [
                    {
                        id: 71005114,
                        content: "男人说的问题解决掉了，回去看看吧。",
                        npc: 100001,
                        next: 71005115,
                    },
                ],
            },
            {
                id: "17356335453556437",
                type: "TalkNode",
                name: "主动对话求饶",
                dialogues: [
                    {
                        id: 71005142,
                        content: "我错了我错了，我就是看到经常有人随便讲几句话，就把一大波人耍得团团转，所以就想验证一下试试……",
                        npc: 818045,
                        next: 71005143,
                    },
                    {
                        id: 71005143,
                        content: "折腾了你半天真是抱歉。这些是我的赔礼，对不起了。",
                        npc: 818045,
                    },
                ],
            },
            {
                id: "17356338232029630",
                type: "TalkNode",
                name: "主动对话完成",
                dialogues: [
                    {
                        id: 71005115,
                        content: "弄好了，你说的鱼呢。",
                        npc: 100001,
                        next: 71005116,
                    },
                    {
                        id: 71005116,
                        content: "已经钓上了，你看。",
                        npc: 818045,
                        next: 71005117,
                    },
                    {
                        id: 71005117,
                        content: "（男人说完指了指你。）",
                        npc: 800006,
                        next: 71005118,
                    },
                    {
                        id: 71005118,
                        content: "钓鱼钓的也可以不是鱼。撒下几句话，做一些奇怪的事，自会有无数鱼争相咬钩。",
                        npc: 818045,
                        next: 71005119,
                    },
                    {
                        id: 71005119,
                        content: "这就是我与无数人交流后学到的感悟，希望以后你不会再被别人撒下的“鱼饵”戏弄。",
                        npc: 818045,
                        next: 71005120,
                    },
                    {
                        id: 71005120,
                        content: "折腾了你半天真是抱歉。这些是我的赔礼，对不起了。",
                        npc: 818045,
                    },
                ],
            },
        ],
    },
    {
        id: 306802,
        name: "解救魔灵",
        level: [30, 39],
        regionId: 1017,
        subRegionId: 101701,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1736505932733239581",
                type: "TalkNode",
                name: "解救宠物开车",
                next: ["1736505932733239588"],
                dialogues: [
                    {
                        id: 71004401,
                        content: "（游荡的秽兽挤满了四周，先击退它们，再去解救魔灵吧。）",
                        npc: 800006,
                        next: 71004402,
                    },
                ],
            },
            {
                id: "1736505932733239587",
                type: "TalkNode",
                name: "击杀秽兽开车",
                dialogues: [
                    {
                        id: 71004402,
                        content: "（争斗的声响引来了不屈的灾厄，不详的化身终于降临于此。击败它吧，就像过去的无数次一样。）",
                        npc: 800006,
                        next: 71004403,
                    },
                ],
            },
            {
                id: "1736505932733239588",
                type: "TalkNode",
                name: "击杀初始士兵开车",
                dialogues: [
                    {
                        id: 71004403,
                        content: "（附近暂时安全了，趁现在解救魔灵吧。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 307105,
        name: "解救魔灵",
        level: [60, 65],
        regionId: 1013,
        subRegionId: 101301,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17369209818721285",
                type: "TalkNode",
                name: "解救宠物开车",
                dialogues: [
                    {
                        id: 71003101,
                        content: "（最近多了好些觊觎魔灵的家伙，击退他们，救下眼前这只可怜的魔灵吧。）",
                        npc: 800006,
                        next: 71003102,
                    },
                ],
            },
            {
                id: "17369209818731291",
                type: "TalkNode",
                name: "击杀初始士兵开车",
                dialogues: [
                    {
                        id: 71003102,
                        content: "（更多敌人从远处冲了过来。）",
                        npc: 800006,
                        next: 71003103,
                    },
                ],
            },
            {
                id: "17369209818731292",
                type: "TalkNode",
                name: "击杀初始士兵开车",
                dialogues: [
                    {
                        id: 71003103,
                        content: "（现在，这只魔灵安全了。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 307402,
        name: "解救魔灵",
        level: [30, 39],
        regionId: 1013,
        subRegionId: 101304,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1737027326082541520",
                type: "TalkNode",
                name: "解救宠物开车",
                dialogues: [
                    {
                        id: 71003101,
                        content: "（最近多了好些觊觎魔灵的家伙，击退他们，救下眼前这只可怜的魔灵吧。）",
                        npc: 800006,
                        next: 71006002,
                    },
                ],
            },
            {
                id: "1737027326082541526",
                type: "TalkNode",
                name: "击杀初始秽兽开车",
                dialogues: [
                    {
                        id: 71006002,
                        content: "（争斗的声响引来了更多秽兽。）",
                        npc: 800006,
                        next: 71006003,
                    },
                ],
            },
            {
                id: "1737027326082541527",
                type: "TalkNode",
                name: "击杀初始秽兽开车",
                dialogues: [
                    {
                        id: 71006003,
                        content: "（附近暂时安全了，趁现在解救魔灵吧。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 307403,
        name: "解救魔灵",
        level: [40, 49],
        regionId: 1013,
        subRegionId: 101304,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1737027326082541520",
                type: "TalkNode",
                name: "解救宠物开车",
                dialogues: [
                    {
                        id: 71003101,
                        content: "（最近多了好些觊觎魔灵的家伙，击退他们，救下眼前这只可怜的魔灵吧。）",
                        npc: 800006,
                        next: 71006002,
                    },
                ],
            },
            {
                id: "1737027326082541526",
                type: "TalkNode",
                name: "击杀初始秽兽开车",
                dialogues: [
                    {
                        id: 71006002,
                        content: "（争斗的声响引来了更多秽兽。）",
                        npc: 800006,
                        next: 71006003,
                    },
                ],
            },
            {
                id: "1737027326082541527",
                type: "TalkNode",
                name: "击杀初始秽兽开车",
                dialogues: [
                    {
                        id: 71006003,
                        content: "（附近暂时安全了，趁现在解救魔灵吧。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 307504,
        name: "解救魔灵",
        level: [50, 59],
        regionId: 1017,
        subRegionId: 101702,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1737101904953561124",
                type: "TalkNode",
                name: "解救宠物开车",
                dialogues: [
                    {
                        id: 71003101,
                        content: "（最近多了好些觊觎魔灵的家伙，击退他们，救下眼前这只可怜的魔灵吧。）",
                        npc: 800006,
                        next: 71003102,
                    },
                ],
            },
            {
                id: "1737103117492751694",
                type: "TalkNode",
                name: "击杀初始秽兽开车",
                dialogues: [
                    {
                        id: 71003102,
                        content: "（更多敌人从远处冲了过来。）",
                        npc: 800006,
                        next: 71003103,
                    },
                ],
            },
            {
                id: "1737103117492751683",
                type: "TalkNode",
                name: "击杀初始秽兽开车",
                dialogues: [
                    {
                        id: 71003103,
                        content: "（现在，这只魔灵安全了。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 307505,
        name: "解救魔灵",
        level: [60, 65],
        regionId: 1017,
        subRegionId: 101702,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "1737101904953561124",
                type: "TalkNode",
                name: "解救宠物开车",
                dialogues: [
                    {
                        id: 71003101,
                        content: "（最近多了好些觊觎魔灵的家伙，击退他们，救下眼前这只可怜的魔灵吧。）",
                        npc: 800006,
                        next: 71003102,
                    },
                ],
            },
            {
                id: "1737103117492751694",
                type: "TalkNode",
                name: "击杀初始秽兽开车",
                dialogues: [
                    {
                        id: 71003102,
                        content: "（更多敌人从远处冲了过来。）",
                        npc: 800006,
                        next: 71003103,
                    },
                ],
            },
            {
                id: "1737103117492751683",
                type: "TalkNode",
                name: "击杀初始秽兽开车",
                dialogues: [
                    {
                        id: 71003103,
                        content: "（现在，这只魔灵安全了。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 308005,
        name: "探险家大宝贝！",
        level: [60, 65],
        regionId: 1017,
        subRegionId: 101701,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "174116384118972",
                type: "TalkNode",
                name: "npc开车对话",
                dialogues: [
                    {
                        id: 71002401,
                        content: "怎么勘探器还没干活就坏了，我的修理工具呢……",
                        npc: 818015,
                        next: 71002402,
                    },
                ],
            },
            {
                id: "174116384118973",
                type: "TalkNode",
                name: "皎皎npc选项对话",
                next: ["174116384119082", "174116384119086", "174116384119085"],
                dialogues: [
                    {
                        id: 71002402,
                        content: "我们在这种地方都能遇到，太有缘了吧！既然你来了，那要不要帮忙照看下我的宝贝勘探器？",
                        npc: 818015,
                    },
                ],
            },
            {
                id: "174116384118978",
                type: "TalkNode",
                name: "修理开车对话",
                next: ["174116384119086", "174116384119085"],
                dialogues: [
                    {
                        id: 71002403,
                        content: "好耶，你就在它边上不要走动哦，我找到工具了就回来！",
                        npc: 818015,
                        next: 71002404,
                    },
                    {
                        id: 71002404,
                        content: "看起来是有几个零件卡住了，把它们弄开的话应该会更好修一些。",
                        npc: 100001,
                        next: 71002405,
                    },
                ],
            },
            {
                id: "174116384119082",
                type: "TalkNode",
                name: "秽兽出现开车对话",
                next: ["174116384119085"],
                dialogues: [
                    {
                        id: 71002405,
                        content: "（勘探器的响动将周围的秽兽吸引了过来，击退它们吧。）",
                        npc: 800006,
                        next: 71002407,
                    },
                ],
            },
            {
                id: "174116384119086",
                type: "TalkNode",
                name: "修理完成对话",
                dialogues: [
                    {
                        id: 71002406,
                        content: "诶，你还帮我把卡住的零件掰开了吗，好感动！",
                        npc: 818015,
                    },
                ],
            },
            {
                id: "174116384119085",
                type: "TalkNode",
                name: "击杀秽兽后的对话",
                dialogues: [
                    {
                        id: 71002407,
                        content: "久等啦！我就知道交给你照看肯定没问题！",
                        npc: 818015,
                    },
                ],
            },
        ],
    },
    {
        id: 308314,
        name: "非常大脑",
        level: [50, 59],
        regionId: 1041,
        subRegionId: 104108,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1749111095710611457",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006501,
                        content: "有奖竞猜有奖竞猜，那边那位朋友要不要来看看呀。",
                        npc: 818060,
                        next: 71006502,
                    },
                ],
            },
            {
                id: "1749111194626611773",
                type: "TalkNode",
                name: "对话节点",
                next: [
                    "17495601331721460",
                    "17496265097285593813",
                    "17496265124845593884",
                    "17496263463945591037",
                    "17496264928005593424",
                    "17496264954145593498",
                ],
                dialogues: [
                    {
                        id: 71006502,
                        content:
                            "恰逢奉香大典临近，本店特推出节庆活动，在举办一个叫非常大脑的智力问答活动，答错也有安慰奖，要不要来挑战一下？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065021,
                                content: "（接受。）",
                                next: 71006504,
                            },
                            {
                                id: 710065022,
                                content: "（拒绝。）",
                                next: 71006505,
                            },
                        ],
                    },
                    {
                        id: 71006504,
                        content: "好，你先稍作休息，我们马上开始。",
                        npc: 818060,
                        next: 71006505,
                    },
                ],
            },
            {
                id: "17496258995435585626",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006505,
                        content: "喂，那边的朋友先别急着去答题，要不要听听我的提议？",
                        npc: 818061,
                        next: 71006506,
                    },
                ],
            },
            {
                id: "17495602613271904",
                type: "TalkNode",
                name: "对话节点",
                next: ["17496263463945591037", "17496264928005593424", "17496264954145593498"],
                dialogues: [
                    {
                        id: 71006506,
                        content: "那家伙净出一些麻烦的脑筋急转弯，你要是帮我搬下货，我就直接告诉你答案。如何？这样也省得你动脑子了。",
                        npc: 818061,
                        options: [
                            {
                                id: 710065071,
                                content: "好啊，还是你这办法省事。",
                                next: 71006507,
                            },
                            {
                                id: 710065072,
                                content: "算了，我想自己找到答案。",
                                next: 71006519,
                            },
                        ],
                    },
                    {
                        id: 71006507,
                        content: "辛苦了，货就在那边的船上。",
                        npc: 818061,
                        next: 71006509,
                    },
                    {
                        id: 71006519,
                        content: "好吧好吧，还是年轻人有干劲，那你加油。",
                        npc: 818061,
                        next: 71006506,
                    },
                ],
            },
            {
                id: "17495601331721460",
                type: "TalkNode",
                name: "对话节点",
                next: ["17562954699533484"],
                dialogues: [
                    {
                        id: 71006511,
                        content: "休息好了吗？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065111,
                                content: "开始吧。",
                            },
                            {
                                id: 710065112,
                                content: "再等等。",
                                next: 71006520,
                            },
                        ],
                    },
                    {
                        id: 71006520,
                        content: "嗯，准备好了再来找我吧！",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17496265097285593813",
                type: "TalkNode",
                name: "对话节点",
                next: ["17562954919003854"],
                dialogues: [
                    {
                        id: 71006512,
                        content: "休息好了吗？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065121,
                                content: "开始吧。",
                            },
                            {
                                id: 710065122,
                                content: "再等等。",
                                next: 71006520,
                            },
                        ],
                    },
                    {
                        id: 71006520,
                        content: "嗯，准备好了再来找我吧！",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17496265124845593884",
                type: "TalkNode",
                name: "对话节点",
                next: ["17562955152104298"],
                dialogues: [
                    {
                        id: 71006513,
                        content: "休息好了吗？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065131,
                                content: "开始吧。",
                            },
                            {
                                id: 710065132,
                                content: "再等等。",
                                next: 71006520,
                            },
                        ],
                    },
                    {
                        id: 71006520,
                        content: "嗯，准备好了再来找我吧！",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17562954699533484",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006514,
                        content:
                            "请听题！织星客丢了一件商品，经过调查找到了甲乙丙三人。甲指责：“是乙偷的！”。乙声称：“是丙偷的！”。丙说：“确实是我偷的！”。仅一人说了真话，请问到底是谁偷走了商品？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065141,
                                content: "是甲偷的。",
                                next: 71006518,
                            },
                            {
                                id: 710065142,
                                content: "是乙偷的。",
                                next: 71006517,
                            },
                            {
                                id: 710065143,
                                content: "是丙偷的。",
                                next: 71006518,
                            },
                        ],
                    },
                    {
                        id: 71006518,
                        content: "回答错误，这是你的安慰奖，欢迎下次再来挑战哦～",
                        npc: 818060,
                    },
                    {
                        id: 71006517,
                        content: "恭喜你答对了！这是为你准备的豪华奖品，请拿好～",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17496263463945591037",
                type: "TalkNode",
                name: "对话节点",
                next: ["17503182427321933109", "17495601331721460"],
                dialogues: [
                    {
                        id: 71006509,
                        content: "辛苦了，他今天这个问题应该选第二个。",
                        npc: 818061,
                        next: 71006511,
                    },
                ],
            },
            {
                id: "17496264928005593424",
                type: "TalkNode",
                name: "对话节点",
                next: ["17503182427321933111", "17496265097285593813"],
                dialogues: [
                    {
                        id: 71006510,
                        content: "辛苦了，他今天这个问题应该选第三个。",
                        npc: 818061,
                        next: 71006512,
                    },
                ],
            },
            {
                id: "17496264954145593498",
                type: "TalkNode",
                name: "对话节点",
                next: ["17503182427321933113", "17496265124845593884"],
                dialogues: [
                    {
                        id: 71006508,
                        content: "辛苦了，他今天这个问题应该选第一个。",
                        npc: 818061,
                        next: 71006513,
                    },
                ],
            },
            {
                id: "17562954919003854",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006515,
                        content: "请听题！锦鲤皎皎的好友有三个皎皎朋友，第一个叫黄金皎皎，第二个叫白银皎皎，第三个叫什么？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065151,
                                content: "青铜皎皎。",
                                next: 71006518,
                            },
                            {
                                id: 710065152,
                                content: "黑铁皎皎。",
                                next: 71006518,
                            },
                            {
                                id: 710065153,
                                content: "锦鲤皎皎。",
                                next: 71006517,
                            },
                        ],
                    },
                    {
                        id: 71006518,
                        content: "回答错误，这是你的安慰奖，欢迎下次再来挑战哦～",
                        npc: 818060,
                    },
                    {
                        id: 71006517,
                        content: "恭喜你答对了！这是为你准备的豪华奖品，请拿好～",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17562955152104298",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006516,
                        content:
                            "请听题！三人前后排队，各带帽子一顶，帽子颜色可能会出现红、黄、蓝其中一种。最后一人能看到前两人的帽子，中间的人只能看前面。最后一人沉默，接着中间人也沉默。第一人说自己戴黄帽。已知至少一人戴黄帽。下列哪个说法是正确的？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065161,
                                content: "第一个人说得对。",
                                next: 71006517,
                            },
                            {
                                id: 710065162,
                                content: "最后一人沉默说明前两人都戴蓝帽，所以第一人错。",
                                next: 71006518,
                            },
                            {
                                id: 710065163,
                                content: "中间人沉默说明第一人戴红帽，所以第一人错。",
                                next: 71006518,
                            },
                        ],
                    },
                    {
                        id: 71006517,
                        content: "恭喜你答对了！这是为你准备的豪华奖品，请拿好～",
                        npc: 818060,
                    },
                    {
                        id: 71006518,
                        content: "回答错误，这是你的安慰奖，欢迎下次再来挑战哦～",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17503182427321933109",
                type: "TalkNode",
                name: "对话节点",
                next: ["17562956549245783"],
                dialogues: [
                    {
                        id: 71006511,
                        content: "休息好了吗？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065111,
                                content: "开始吧。",
                                next: 71006514,
                            },
                            {
                                id: 710065112,
                                content: "再等等。",
                                next: 71006520,
                            },
                        ],
                    },
                    {
                        id: 71006520,
                        content: "嗯，准备好了再来找我吧！",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17503182427321933111",
                type: "TalkNode",
                name: "对话节点",
                next: ["17562956549245784"],
                dialogues: [
                    {
                        id: 71006512,
                        content: "休息好了吗？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065121,
                                content: "开始吧。",
                                next: 71006515,
                            },
                            {
                                id: 710065122,
                                content: "再等等。",
                                next: 71006520,
                            },
                        ],
                    },
                    {
                        id: 71006520,
                        content: "嗯，准备好了再来找我吧！",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17503182427321933113",
                type: "TalkNode",
                name: "对话节点",
                next: ["17562956549245785"],
                dialogues: [
                    {
                        id: 71006513,
                        content: "休息好了吗？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065131,
                                content: "开始吧。",
                                next: 71006516,
                            },
                            {
                                id: 710065132,
                                content: "再等等。",
                                next: 71006520,
                            },
                        ],
                    },
                    {
                        id: 71006520,
                        content: "嗯，准备好了再来找我吧！",
                        npc: 818060,
                        next: 71006511,
                    },
                ],
            },
            {
                id: "17562956549245783",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006514,
                        content:
                            "请听题！织星客丢了一件商品，经过调查找到了甲乙丙三人。甲指责：“是乙偷的！”。乙声称：“是丙偷的！”。丙说：“确实是我偷的！”。仅一人说了真话，请问到底是谁偷走了商品？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065141,
                                content: "是甲偷的。",
                                next: 71006518,
                            },
                            {
                                id: 710065142,
                                content: "是乙偷的。",
                                next: 71006517,
                            },
                            {
                                id: 710065143,
                                content: "是丙偷的。",
                                next: 71006518,
                            },
                        ],
                    },
                    {
                        id: 71006518,
                        content: "回答错误，这是你的安慰奖，欢迎下次再来挑战哦～",
                        npc: 818060,
                    },
                    {
                        id: 71006517,
                        content: "恭喜你答对了！这是为你准备的豪华奖品，请拿好～",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17562956549245784",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006515,
                        content: "请听题！锦鲤皎皎的好友有三个皎皎朋友，第一个叫黄金皎皎，第二个叫白银皎皎，第三个叫什么？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065151,
                                content: "青铜皎皎。",
                                next: 71006518,
                                impr: [1041, "Wisdom", 1],
                            },
                            {
                                id: 710065152,
                                content: "黑铁皎皎。",
                                next: 71006518,
                                impr: [1041, "Wisdom", 1],
                            },
                            {
                                id: 710065153,
                                content: "锦鲤皎皎。",
                                next: 71006517,
                                impr: [1041, "Wisdom", 1],
                            },
                        ],
                    },
                    {
                        id: 71006518,
                        content: "回答错误，这是你的安慰奖，欢迎下次再来挑战哦～",
                        npc: 818060,
                    },
                    {
                        id: 71006517,
                        content: "恭喜你答对了！这是为你准备的豪华奖品，请拿好～",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17562956549245785",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006516,
                        content:
                            "请听题！三人前后排队，各带帽子一顶，帽子颜色可能会出现红、黄、蓝其中一种。最后一人能看到前两人的帽子，中间的人只能看前面。最后一人沉默，接着中间人也沉默。第一人说自己戴黄帽。已知至少一人戴黄帽。下列哪个说法是正确的？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065161,
                                content: "第一个人说得对。",
                                next: 71006517,
                            },
                            {
                                id: 710065162,
                                content: "最后一人沉默说明前两人都戴蓝帽，所以第一人错。",
                                next: 71006518,
                            },
                            {
                                id: 710065163,
                                content: "中间人沉默说明第一人戴红帽，所以第一人错。",
                                next: 71006518,
                            },
                        ],
                    },
                    {
                        id: 71006517,
                        content: "恭喜你答对了！这是为你准备的豪华奖品，请拿好～",
                        npc: 818060,
                    },
                    {
                        id: 71006518,
                        content: "回答错误，这是你的安慰奖，欢迎下次再来挑战哦～",
                        npc: 818060,
                    },
                ],
            },
        ],
    },
    {
        id: 308315,
        name: "非常大脑",
        level: [60, 65],
        regionId: 1041,
        subRegionId: 104108,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1749111095710611457",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006501,
                        content: "有奖竞猜有奖竞猜，那边那位朋友要不要来看看呀。",
                        npc: 818060,
                        next: 71006502,
                    },
                ],
            },
            {
                id: "1749111194626611773",
                type: "TalkNode",
                name: "对话节点",
                next: [
                    "17495601331721460",
                    "17496265097285593813",
                    "17496265124845593884",
                    "17496263463945591037",
                    "17496264928005593424",
                    "17496264954145593498",
                ],
                dialogues: [
                    {
                        id: 71006502,
                        content:
                            "恰逢奉香大典临近，本店特推出节庆活动，在举办一个叫非常大脑的智力问答活动，答错也有安慰奖，要不要来挑战一下？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065021,
                                content: "（接受。）",
                                next: 71006504,
                            },
                            {
                                id: 710065022,
                                content: "（拒绝。）",
                                next: 71006505,
                            },
                        ],
                    },
                    {
                        id: 71006504,
                        content: "好，你先稍作休息，我们马上开始。",
                        npc: 818060,
                        next: 71006505,
                    },
                ],
            },
            {
                id: "17496258995435585626",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006505,
                        content: "喂，那边的朋友先别急着去答题，要不要听听我的提议？",
                        npc: 818061,
                        next: 71006506,
                    },
                ],
            },
            {
                id: "17495602613271904",
                type: "TalkNode",
                name: "对话节点",
                next: ["17496263463945591037", "17496264928005593424", "17496264954145593498"],
                dialogues: [
                    {
                        id: 71006506,
                        content: "那家伙净出一些麻烦的脑筋急转弯，你要是帮我搬下货，我就直接告诉你答案。如何？这样也省得你动脑子了。",
                        npc: 818061,
                        options: [
                            {
                                id: 710065071,
                                content: "好啊，还是你这办法省事。",
                                next: 71006507,
                            },
                            {
                                id: 710065072,
                                content: "算了，我想自己找到答案。",
                                next: 71006519,
                            },
                        ],
                    },
                    {
                        id: 71006507,
                        content: "辛苦了，货就在那边的船上。",
                        npc: 818061,
                        next: 71006509,
                    },
                    {
                        id: 71006519,
                        content: "好吧好吧，还是年轻人有干劲，那你加油。",
                        npc: 818061,
                        next: 71006506,
                    },
                ],
            },
            {
                id: "17495601331721460",
                type: "TalkNode",
                name: "对话节点",
                next: ["17562954699533484"],
                dialogues: [
                    {
                        id: 71006511,
                        content: "休息好了吗？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065111,
                                content: "开始吧。",
                            },
                            {
                                id: 710065112,
                                content: "再等等。",
                                next: 71006520,
                            },
                        ],
                    },
                    {
                        id: 71006520,
                        content: "嗯，准备好了再来找我吧！",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17496265097285593813",
                type: "TalkNode",
                name: "对话节点",
                next: ["17562954919003854"],
                dialogues: [
                    {
                        id: 71006512,
                        content: "休息好了吗？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065121,
                                content: "开始吧。",
                            },
                            {
                                id: 710065122,
                                content: "再等等。",
                                next: 71006520,
                            },
                        ],
                    },
                    {
                        id: 71006520,
                        content: "嗯，准备好了再来找我吧！",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17496265124845593884",
                type: "TalkNode",
                name: "对话节点",
                next: ["17562955152104298"],
                dialogues: [
                    {
                        id: 71006513,
                        content: "休息好了吗？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065131,
                                content: "开始吧。",
                            },
                            {
                                id: 710065132,
                                content: "再等等。",
                                next: 71006520,
                            },
                        ],
                    },
                    {
                        id: 71006520,
                        content: "嗯，准备好了再来找我吧！",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17562954699533484",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006514,
                        content:
                            "请听题！织星客丢了一件商品，经过调查找到了甲乙丙三人。甲指责：“是乙偷的！”。乙声称：“是丙偷的！”。丙说：“确实是我偷的！”。仅一人说了真话，请问到底是谁偷走了商品？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065141,
                                content: "是甲偷的。",
                                next: 71006518,
                            },
                            {
                                id: 710065142,
                                content: "是乙偷的。",
                                next: 71006517,
                            },
                            {
                                id: 710065143,
                                content: "是丙偷的。",
                                next: 71006518,
                            },
                        ],
                    },
                    {
                        id: 71006518,
                        content: "回答错误，这是你的安慰奖，欢迎下次再来挑战哦～",
                        npc: 818060,
                    },
                    {
                        id: 71006517,
                        content: "恭喜你答对了！这是为你准备的豪华奖品，请拿好～",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17496263463945591037",
                type: "TalkNode",
                name: "对话节点",
                next: ["17503182427321933109", "17495601331721460"],
                dialogues: [
                    {
                        id: 71006509,
                        content: "辛苦了，他今天这个问题应该选第二个。",
                        npc: 818061,
                        next: 71006511,
                    },
                ],
            },
            {
                id: "17496264928005593424",
                type: "TalkNode",
                name: "对话节点",
                next: ["17503182427321933111", "17496265097285593813"],
                dialogues: [
                    {
                        id: 71006510,
                        content: "辛苦了，他今天这个问题应该选第三个。",
                        npc: 818061,
                        next: 71006512,
                    },
                ],
            },
            {
                id: "17496264954145593498",
                type: "TalkNode",
                name: "对话节点",
                next: ["17503182427321933113", "17496265124845593884"],
                dialogues: [
                    {
                        id: 71006508,
                        content: "辛苦了，他今天这个问题应该选第一个。",
                        npc: 818061,
                        next: 71006513,
                    },
                ],
            },
            {
                id: "17562954919003854",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006515,
                        content: "请听题！锦鲤皎皎的好友有三个皎皎朋友，第一个叫黄金皎皎，第二个叫白银皎皎，第三个叫什么？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065151,
                                content: "青铜皎皎。",
                                next: 71006518,
                            },
                            {
                                id: 710065152,
                                content: "黑铁皎皎。",
                                next: 71006518,
                            },
                            {
                                id: 710065153,
                                content: "锦鲤皎皎。",
                                next: 71006517,
                            },
                        ],
                    },
                    {
                        id: 71006518,
                        content: "回答错误，这是你的安慰奖，欢迎下次再来挑战哦～",
                        npc: 818060,
                    },
                    {
                        id: 71006517,
                        content: "恭喜你答对了！这是为你准备的豪华奖品，请拿好～",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17562955152104298",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006516,
                        content:
                            "请听题！三人前后排队，各带帽子一顶，帽子颜色可能会出现红、黄、蓝其中一种。最后一人能看到前两人的帽子，中间的人只能看前面。最后一人沉默，接着中间人也沉默。第一人说自己戴黄帽。已知至少一人戴黄帽。下列哪个说法是正确的？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065161,
                                content: "第一个人说得对。",
                                next: 71006517,
                            },
                            {
                                id: 710065162,
                                content: "最后一人沉默说明前两人都戴蓝帽，所以第一人错。",
                                next: 71006518,
                            },
                            {
                                id: 710065163,
                                content: "中间人沉默说明第一人戴红帽，所以第一人错。",
                                next: 71006518,
                            },
                        ],
                    },
                    {
                        id: 71006517,
                        content: "恭喜你答对了！这是为你准备的豪华奖品，请拿好～",
                        npc: 818060,
                    },
                    {
                        id: 71006518,
                        content: "回答错误，这是你的安慰奖，欢迎下次再来挑战哦～",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17503182427321933109",
                type: "TalkNode",
                name: "对话节点",
                next: ["17562956549245783"],
                dialogues: [
                    {
                        id: 71006511,
                        content: "休息好了吗？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065111,
                                content: "开始吧。",
                                next: 71006514,
                            },
                            {
                                id: 710065112,
                                content: "再等等。",
                                next: 71006520,
                            },
                        ],
                    },
                    {
                        id: 71006520,
                        content: "嗯，准备好了再来找我吧！",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17503182427321933111",
                type: "TalkNode",
                name: "对话节点",
                next: ["17562956549245784"],
                dialogues: [
                    {
                        id: 71006512,
                        content: "休息好了吗？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065121,
                                content: "开始吧。",
                                next: 71006515,
                            },
                            {
                                id: 710065122,
                                content: "再等等。",
                                next: 71006520,
                            },
                        ],
                    },
                    {
                        id: 71006520,
                        content: "嗯，准备好了再来找我吧！",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17503182427321933113",
                type: "TalkNode",
                name: "对话节点",
                next: ["17562956549245785"],
                dialogues: [
                    {
                        id: 71006513,
                        content: "休息好了吗？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065131,
                                content: "开始吧。",
                                next: 71006516,
                            },
                            {
                                id: 710065132,
                                content: "再等等。",
                                next: 71006520,
                            },
                        ],
                    },
                    {
                        id: 71006520,
                        content: "嗯，准备好了再来找我吧！",
                        npc: 818060,
                        next: 71006511,
                    },
                ],
            },
            {
                id: "17562956549245783",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006514,
                        content:
                            "请听题！织星客丢了一件商品，经过调查找到了甲乙丙三人。甲指责：“是乙偷的！”。乙声称：“是丙偷的！”。丙说：“确实是我偷的！”。仅一人说了真话，请问到底是谁偷走了商品？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065141,
                                content: "是甲偷的。",
                                next: 71006518,
                            },
                            {
                                id: 710065142,
                                content: "是乙偷的。",
                                next: 71006517,
                            },
                            {
                                id: 710065143,
                                content: "是丙偷的。",
                                next: 71006518,
                            },
                        ],
                    },
                    {
                        id: 71006518,
                        content: "回答错误，这是你的安慰奖，欢迎下次再来挑战哦～",
                        npc: 818060,
                    },
                    {
                        id: 71006517,
                        content: "恭喜你答对了！这是为你准备的豪华奖品，请拿好～",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17562956549245784",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006515,
                        content: "请听题！锦鲤皎皎的好友有三个皎皎朋友，第一个叫黄金皎皎，第二个叫白银皎皎，第三个叫什么？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065151,
                                content: "青铜皎皎。",
                                next: 71006518,
                                impr: [1041, "Wisdom", 1],
                            },
                            {
                                id: 710065152,
                                content: "黑铁皎皎。",
                                next: 71006518,
                                impr: [1041, "Wisdom", 1],
                            },
                            {
                                id: 710065153,
                                content: "锦鲤皎皎。",
                                next: 71006517,
                                impr: [1041, "Wisdom", 1],
                            },
                        ],
                    },
                    {
                        id: 71006518,
                        content: "回答错误，这是你的安慰奖，欢迎下次再来挑战哦～",
                        npc: 818060,
                    },
                    {
                        id: 71006517,
                        content: "恭喜你答对了！这是为你准备的豪华奖品，请拿好～",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17562956549245785",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006516,
                        content:
                            "请听题！三人前后排队，各带帽子一顶，帽子颜色可能会出现红、黄、蓝其中一种。最后一人能看到前两人的帽子，中间的人只能看前面。最后一人沉默，接着中间人也沉默。第一人说自己戴黄帽。已知至少一人戴黄帽。下列哪个说法是正确的？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065161,
                                content: "第一个人说得对。",
                                next: 71006517,
                            },
                            {
                                id: 710065162,
                                content: "最后一人沉默说明前两人都戴蓝帽，所以第一人错。",
                                next: 71006518,
                            },
                            {
                                id: 710065163,
                                content: "中间人沉默说明第一人戴红帽，所以第一人错。",
                                next: 71006518,
                            },
                        ],
                    },
                    {
                        id: 71006517,
                        content: "恭喜你答对了！这是为你准备的豪华奖品，请拿好～",
                        npc: 818060,
                    },
                    {
                        id: 71006518,
                        content: "回答错误，这是你的安慰奖，欢迎下次再来挑战哦～",
                        npc: 818060,
                    },
                ],
            },
        ],
    },
    {
        id: 308334,
        name: "非常大脑",
        level: [50, 59],
        regionId: 1041,
        subRegionId: 104108,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1749111095710611457",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006501,
                        content: "有奖竞猜有奖竞猜，那边那位朋友要不要来看看呀。",
                        npc: 818060,
                        next: 71006502,
                    },
                ],
            },
            {
                id: "1749111194626611773",
                type: "TalkNode",
                name: "对话节点",
                next: [
                    "17495601331721460",
                    "17496265097285593813",
                    "17496265124845593884",
                    "17496263463945591037",
                    "17496264928005593424",
                    "17496264954145593498",
                ],
                dialogues: [
                    {
                        id: 71006502,
                        content:
                            "恰逢奉香大典临近，本店特推出节庆活动，在举办一个叫非常大脑的智力问答活动，答错也有安慰奖，要不要来挑战一下？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065021,
                                content: "（接受。）",
                                next: 71006504,
                            },
                            {
                                id: 710065022,
                                content: "（拒绝。）",
                                next: 71006505,
                            },
                        ],
                    },
                    {
                        id: 71006504,
                        content: "好，你先稍作休息，我们马上开始。",
                        npc: 818060,
                        next: 71006505,
                    },
                ],
            },
            {
                id: "17496258995435585626",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006505,
                        content: "喂，那边的朋友先别急着去答题，要不要听听我的提议？",
                        npc: 818061,
                        next: 71006506,
                    },
                ],
            },
            {
                id: "17495602613271904",
                type: "TalkNode",
                name: "对话节点",
                next: ["17496263463945591037", "17496264928005593424", "17496264954145593498"],
                dialogues: [
                    {
                        id: 71006506,
                        content: "那家伙净出一些麻烦的脑筋急转弯，你要是帮我搬下货，我就直接告诉你答案。如何？这样也省得你动脑子了。",
                        npc: 818061,
                        options: [
                            {
                                id: 710065071,
                                content: "好啊，还是你这办法省事。",
                                next: 71006507,
                            },
                            {
                                id: 710065072,
                                content: "算了，我想自己找到答案。",
                                next: 71006519,
                            },
                        ],
                    },
                    {
                        id: 71006507,
                        content: "辛苦了，货就在那边的船上。",
                        npc: 818061,
                        next: 71006509,
                    },
                    {
                        id: 71006519,
                        content: "好吧好吧，还是年轻人有干劲，那你加油。",
                        npc: 818061,
                        next: 71006506,
                    },
                ],
            },
            {
                id: "17495601331721460",
                type: "TalkNode",
                name: "对话节点",
                next: ["17562954699533484"],
                dialogues: [
                    {
                        id: 71006511,
                        content: "休息好了吗？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065111,
                                content: "开始吧。",
                            },
                            {
                                id: 710065112,
                                content: "再等等。",
                                next: 71006520,
                            },
                        ],
                    },
                    {
                        id: 71006520,
                        content: "嗯，准备好了再来找我吧！",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17496265097285593813",
                type: "TalkNode",
                name: "对话节点",
                next: ["17562954919003854"],
                dialogues: [
                    {
                        id: 71006512,
                        content: "休息好了吗？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065121,
                                content: "开始吧。",
                            },
                            {
                                id: 710065122,
                                content: "再等等。",
                                next: 71006520,
                            },
                        ],
                    },
                    {
                        id: 71006520,
                        content: "嗯，准备好了再来找我吧！",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17496265124845593884",
                type: "TalkNode",
                name: "对话节点",
                next: ["17562955152104298"],
                dialogues: [
                    {
                        id: 71006513,
                        content: "休息好了吗？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065131,
                                content: "开始吧。",
                            },
                            {
                                id: 710065132,
                                content: "再等等。",
                                next: 71006520,
                            },
                        ],
                    },
                    {
                        id: 71006520,
                        content: "嗯，准备好了再来找我吧！",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17562954699533484",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006514,
                        content:
                            "请听题！织星客丢了一件商品，经过调查找到了甲乙丙三人。甲指责：“是乙偷的！”。乙声称：“是丙偷的！”。丙说：“确实是我偷的！”。仅一人说了真话，请问到底是谁偷走了商品？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065141,
                                content: "是甲偷的。",
                                next: 71006518,
                            },
                            {
                                id: 710065142,
                                content: "是乙偷的。",
                                next: 71006517,
                            },
                            {
                                id: 710065143,
                                content: "是丙偷的。",
                                next: 71006518,
                            },
                        ],
                    },
                    {
                        id: 71006518,
                        content: "回答错误，这是你的安慰奖，欢迎下次再来挑战哦～",
                        npc: 818060,
                    },
                    {
                        id: 71006517,
                        content: "恭喜你答对了！这是为你准备的豪华奖品，请拿好～",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17496263463945591037",
                type: "TalkNode",
                name: "对话节点",
                next: ["17503182427321933109", "17495601331721460"],
                dialogues: [
                    {
                        id: 71006509,
                        content: "辛苦了，他今天这个问题应该选第二个。",
                        npc: 818061,
                        next: 71006511,
                    },
                ],
            },
            {
                id: "17496264928005593424",
                type: "TalkNode",
                name: "对话节点",
                next: ["17503182427321933111", "17496265097285593813"],
                dialogues: [
                    {
                        id: 71006510,
                        content: "辛苦了，他今天这个问题应该选第三个。",
                        npc: 818061,
                        next: 71006512,
                    },
                ],
            },
            {
                id: "17496264954145593498",
                type: "TalkNode",
                name: "对话节点",
                next: ["17503182427321933113", "17496265124845593884"],
                dialogues: [
                    {
                        id: 71006508,
                        content: "辛苦了，他今天这个问题应该选第一个。",
                        npc: 818061,
                        next: 71006513,
                    },
                ],
            },
            {
                id: "17562954919003854",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006515,
                        content: "请听题！锦鲤皎皎的好友有三个皎皎朋友，第一个叫黄金皎皎，第二个叫白银皎皎，第三个叫什么？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065151,
                                content: "青铜皎皎。",
                                next: 71006518,
                            },
                            {
                                id: 710065152,
                                content: "黑铁皎皎。",
                                next: 71006518,
                            },
                            {
                                id: 710065153,
                                content: "锦鲤皎皎。",
                                next: 71006517,
                            },
                        ],
                    },
                    {
                        id: 71006518,
                        content: "回答错误，这是你的安慰奖，欢迎下次再来挑战哦～",
                        npc: 818060,
                    },
                    {
                        id: 71006517,
                        content: "恭喜你答对了！这是为你准备的豪华奖品，请拿好～",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17562955152104298",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006516,
                        content:
                            "请听题！三人前后排队，各带帽子一顶，帽子颜色可能会出现红、黄、蓝其中一种。最后一人能看到前两人的帽子，中间的人只能看前面。最后一人沉默，接着中间人也沉默。第一人说自己戴黄帽。已知至少一人戴黄帽。下列哪个说法是正确的？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065161,
                                content: "第一个人说得对。",
                                next: 71006517,
                            },
                            {
                                id: 710065162,
                                content: "最后一人沉默说明前两人都戴蓝帽，所以第一人错。",
                                next: 71006518,
                            },
                            {
                                id: 710065163,
                                content: "中间人沉默说明第一人戴红帽，所以第一人错。",
                                next: 71006518,
                            },
                        ],
                    },
                    {
                        id: 71006517,
                        content: "恭喜你答对了！这是为你准备的豪华奖品，请拿好～",
                        npc: 818060,
                    },
                    {
                        id: 71006518,
                        content: "回答错误，这是你的安慰奖，欢迎下次再来挑战哦～",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17503182427321933109",
                type: "TalkNode",
                name: "对话节点",
                next: ["17562956549245783"],
                dialogues: [
                    {
                        id: 71006511,
                        content: "休息好了吗？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065111,
                                content: "开始吧。",
                                next: 71006514,
                            },
                            {
                                id: 710065112,
                                content: "再等等。",
                                next: 71006520,
                            },
                        ],
                    },
                    {
                        id: 71006520,
                        content: "嗯，准备好了再来找我吧！",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17503182427321933111",
                type: "TalkNode",
                name: "对话节点",
                next: ["17562956549245784"],
                dialogues: [
                    {
                        id: 71006512,
                        content: "休息好了吗？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065121,
                                content: "开始吧。",
                                next: 71006515,
                            },
                            {
                                id: 710065122,
                                content: "再等等。",
                                next: 71006520,
                            },
                        ],
                    },
                    {
                        id: 71006520,
                        content: "嗯，准备好了再来找我吧！",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17503182427321933113",
                type: "TalkNode",
                name: "对话节点",
                next: ["17562956549245785"],
                dialogues: [
                    {
                        id: 71006513,
                        content: "休息好了吗？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065131,
                                content: "开始吧。",
                                next: 71006516,
                            },
                            {
                                id: 710065132,
                                content: "再等等。",
                                next: 71006520,
                            },
                        ],
                    },
                    {
                        id: 71006520,
                        content: "嗯，准备好了再来找我吧！",
                        npc: 818060,
                        next: 71006511,
                    },
                ],
            },
            {
                id: "17562956549245783",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006514,
                        content:
                            "请听题！织星客丢了一件商品，经过调查找到了甲乙丙三人。甲指责：“是乙偷的！”。乙声称：“是丙偷的！”。丙说：“确实是我偷的！”。仅一人说了真话，请问到底是谁偷走了商品？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065141,
                                content: "是甲偷的。",
                                next: 71006518,
                            },
                            {
                                id: 710065142,
                                content: "是乙偷的。",
                                next: 71006517,
                            },
                            {
                                id: 710065143,
                                content: "是丙偷的。",
                                next: 71006518,
                            },
                        ],
                    },
                    {
                        id: 71006518,
                        content: "回答错误，这是你的安慰奖，欢迎下次再来挑战哦～",
                        npc: 818060,
                    },
                    {
                        id: 71006517,
                        content: "恭喜你答对了！这是为你准备的豪华奖品，请拿好～",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17562956549245784",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006515,
                        content: "请听题！锦鲤皎皎的好友有三个皎皎朋友，第一个叫黄金皎皎，第二个叫白银皎皎，第三个叫什么？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065151,
                                content: "青铜皎皎。",
                                next: 71006518,
                                impr: [1041, "Wisdom", 1],
                            },
                            {
                                id: 710065152,
                                content: "黑铁皎皎。",
                                next: 71006518,
                                impr: [1041, "Wisdom", 1],
                            },
                            {
                                id: 710065153,
                                content: "锦鲤皎皎。",
                                next: 71006517,
                                impr: [1041, "Wisdom", 1],
                            },
                        ],
                    },
                    {
                        id: 71006518,
                        content: "回答错误，这是你的安慰奖，欢迎下次再来挑战哦～",
                        npc: 818060,
                    },
                    {
                        id: 71006517,
                        content: "恭喜你答对了！这是为你准备的豪华奖品，请拿好～",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17562956549245785",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006516,
                        content:
                            "请听题！三人前后排队，各带帽子一顶，帽子颜色可能会出现红、黄、蓝其中一种。最后一人能看到前两人的帽子，中间的人只能看前面。最后一人沉默，接着中间人也沉默。第一人说自己戴黄帽。已知至少一人戴黄帽。下列哪个说法是正确的？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065161,
                                content: "第一个人说得对。",
                                next: 71006517,
                            },
                            {
                                id: 710065162,
                                content: "最后一人沉默说明前两人都戴蓝帽，所以第一人错。",
                                next: 71006518,
                            },
                            {
                                id: 710065163,
                                content: "中间人沉默说明第一人戴红帽，所以第一人错。",
                                next: 71006518,
                            },
                        ],
                    },
                    {
                        id: 71006517,
                        content: "恭喜你答对了！这是为你准备的豪华奖品，请拿好～",
                        npc: 818060,
                    },
                    {
                        id: 71006518,
                        content: "回答错误，这是你的安慰奖，欢迎下次再来挑战哦～",
                        npc: 818060,
                    },
                ],
            },
        ],
    },
    {
        id: 308335,
        name: "非常大脑",
        level: [60, 65],
        regionId: 1041,
        subRegionId: 104108,
        chance: 5,
        completeNum: -1,
        dayLimit: true,
        reward: [51004],
        nodes: [
            {
                id: "1749111095710611457",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006501,
                        content: "有奖竞猜有奖竞猜，那边那位朋友要不要来看看呀。",
                        npc: 818060,
                        next: 71006502,
                    },
                ],
            },
            {
                id: "1749111194626611773",
                type: "TalkNode",
                name: "对话节点",
                next: [
                    "17495601331721460",
                    "17496265097285593813",
                    "17496265124845593884",
                    "17496263463945591037",
                    "17496264928005593424",
                    "17496264954145593498",
                ],
                dialogues: [
                    {
                        id: 71006502,
                        content:
                            "恰逢奉香大典临近，本店特推出节庆活动，在举办一个叫非常大脑的智力问答活动，答错也有安慰奖，要不要来挑战一下？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065021,
                                content: "（接受。）",
                                next: 71006504,
                            },
                            {
                                id: 710065022,
                                content: "（拒绝。）",
                                next: 71006505,
                            },
                        ],
                    },
                    {
                        id: 71006504,
                        content: "好，你先稍作休息，我们马上开始。",
                        npc: 818060,
                        next: 71006505,
                    },
                ],
            },
            {
                id: "17496258995435585626",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006505,
                        content: "喂，那边的朋友先别急着去答题，要不要听听我的提议？",
                        npc: 818061,
                        next: 71006506,
                    },
                ],
            },
            {
                id: "17495602613271904",
                type: "TalkNode",
                name: "对话节点",
                next: ["17496263463945591037", "17496264928005593424", "17496264954145593498"],
                dialogues: [
                    {
                        id: 71006506,
                        content: "那家伙净出一些麻烦的脑筋急转弯，你要是帮我搬下货，我就直接告诉你答案。如何？这样也省得你动脑子了。",
                        npc: 818061,
                        options: [
                            {
                                id: 710065071,
                                content: "好啊，还是你这办法省事。",
                                next: 71006507,
                            },
                            {
                                id: 710065072,
                                content: "算了，我想自己找到答案。",
                                next: 71006519,
                            },
                        ],
                    },
                    {
                        id: 71006507,
                        content: "辛苦了，货就在那边的船上。",
                        npc: 818061,
                        next: 71006509,
                    },
                    {
                        id: 71006519,
                        content: "好吧好吧，还是年轻人有干劲，那你加油。",
                        npc: 818061,
                        next: 71006506,
                    },
                ],
            },
            {
                id: "17495601331721460",
                type: "TalkNode",
                name: "对话节点",
                next: ["17562954699533484"],
                dialogues: [
                    {
                        id: 71006511,
                        content: "休息好了吗？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065111,
                                content: "开始吧。",
                            },
                            {
                                id: 710065112,
                                content: "再等等。",
                                next: 71006520,
                            },
                        ],
                    },
                    {
                        id: 71006520,
                        content: "嗯，准备好了再来找我吧！",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17496265097285593813",
                type: "TalkNode",
                name: "对话节点",
                next: ["17562954919003854"],
                dialogues: [
                    {
                        id: 71006512,
                        content: "休息好了吗？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065121,
                                content: "开始吧。",
                            },
                            {
                                id: 710065122,
                                content: "再等等。",
                                next: 71006520,
                            },
                        ],
                    },
                    {
                        id: 71006520,
                        content: "嗯，准备好了再来找我吧！",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17496265124845593884",
                type: "TalkNode",
                name: "对话节点",
                next: ["17562955152104298"],
                dialogues: [
                    {
                        id: 71006513,
                        content: "休息好了吗？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065131,
                                content: "开始吧。",
                            },
                            {
                                id: 710065132,
                                content: "再等等。",
                                next: 71006520,
                            },
                        ],
                    },
                    {
                        id: 71006520,
                        content: "嗯，准备好了再来找我吧！",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17562954699533484",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006514,
                        content:
                            "请听题！织星客丢了一件商品，经过调查找到了甲乙丙三人。甲指责：“是乙偷的！”。乙声称：“是丙偷的！”。丙说：“确实是我偷的！”。仅一人说了真话，请问到底是谁偷走了商品？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065141,
                                content: "是甲偷的。",
                                next: 71006518,
                            },
                            {
                                id: 710065142,
                                content: "是乙偷的。",
                                next: 71006517,
                            },
                            {
                                id: 710065143,
                                content: "是丙偷的。",
                                next: 71006518,
                            },
                        ],
                    },
                    {
                        id: 71006518,
                        content: "回答错误，这是你的安慰奖，欢迎下次再来挑战哦～",
                        npc: 818060,
                    },
                    {
                        id: 71006517,
                        content: "恭喜你答对了！这是为你准备的豪华奖品，请拿好～",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17496263463945591037",
                type: "TalkNode",
                name: "对话节点",
                next: ["17503182427321933109", "17495601331721460"],
                dialogues: [
                    {
                        id: 71006509,
                        content: "辛苦了，他今天这个问题应该选第二个。",
                        npc: 818061,
                        next: 71006511,
                    },
                ],
            },
            {
                id: "17496264928005593424",
                type: "TalkNode",
                name: "对话节点",
                next: ["17503182427321933111", "17496265097285593813"],
                dialogues: [
                    {
                        id: 71006510,
                        content: "辛苦了，他今天这个问题应该选第三个。",
                        npc: 818061,
                        next: 71006512,
                    },
                ],
            },
            {
                id: "17496264954145593498",
                type: "TalkNode",
                name: "对话节点",
                next: ["17503182427321933113", "17496265124845593884"],
                dialogues: [
                    {
                        id: 71006508,
                        content: "辛苦了，他今天这个问题应该选第一个。",
                        npc: 818061,
                        next: 71006513,
                    },
                ],
            },
            {
                id: "17562954919003854",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006515,
                        content: "请听题！锦鲤皎皎的好友有三个皎皎朋友，第一个叫黄金皎皎，第二个叫白银皎皎，第三个叫什么？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065151,
                                content: "青铜皎皎。",
                                next: 71006518,
                            },
                            {
                                id: 710065152,
                                content: "黑铁皎皎。",
                                next: 71006518,
                            },
                            {
                                id: 710065153,
                                content: "锦鲤皎皎。",
                                next: 71006517,
                            },
                        ],
                    },
                    {
                        id: 71006518,
                        content: "回答错误，这是你的安慰奖，欢迎下次再来挑战哦～",
                        npc: 818060,
                    },
                    {
                        id: 71006517,
                        content: "恭喜你答对了！这是为你准备的豪华奖品，请拿好～",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17562955152104298",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006516,
                        content:
                            "请听题！三人前后排队，各带帽子一顶，帽子颜色可能会出现红、黄、蓝其中一种。最后一人能看到前两人的帽子，中间的人只能看前面。最后一人沉默，接着中间人也沉默。第一人说自己戴黄帽。已知至少一人戴黄帽。下列哪个说法是正确的？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065161,
                                content: "第一个人说得对。",
                                next: 71006517,
                            },
                            {
                                id: 710065162,
                                content: "最后一人沉默说明前两人都戴蓝帽，所以第一人错。",
                                next: 71006518,
                            },
                            {
                                id: 710065163,
                                content: "中间人沉默说明第一人戴红帽，所以第一人错。",
                                next: 71006518,
                            },
                        ],
                    },
                    {
                        id: 71006517,
                        content: "恭喜你答对了！这是为你准备的豪华奖品，请拿好～",
                        npc: 818060,
                    },
                    {
                        id: 71006518,
                        content: "回答错误，这是你的安慰奖，欢迎下次再来挑战哦～",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17503182427321933109",
                type: "TalkNode",
                name: "对话节点",
                next: ["17562956549245783"],
                dialogues: [
                    {
                        id: 71006511,
                        content: "休息好了吗？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065111,
                                content: "开始吧。",
                                next: 71006514,
                            },
                            {
                                id: 710065112,
                                content: "再等等。",
                                next: 71006520,
                            },
                        ],
                    },
                    {
                        id: 71006520,
                        content: "嗯，准备好了再来找我吧！",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17503182427321933111",
                type: "TalkNode",
                name: "对话节点",
                next: ["17562956549245784"],
                dialogues: [
                    {
                        id: 71006512,
                        content: "休息好了吗？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065121,
                                content: "开始吧。",
                                next: 71006515,
                            },
                            {
                                id: 710065122,
                                content: "再等等。",
                                next: 71006520,
                            },
                        ],
                    },
                    {
                        id: 71006520,
                        content: "嗯，准备好了再来找我吧！",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17503182427321933113",
                type: "TalkNode",
                name: "对话节点",
                next: ["17562956549245785"],
                dialogues: [
                    {
                        id: 71006513,
                        content: "休息好了吗？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065131,
                                content: "开始吧。",
                                next: 71006516,
                            },
                            {
                                id: 710065132,
                                content: "再等等。",
                                next: 71006520,
                            },
                        ],
                    },
                    {
                        id: 71006520,
                        content: "嗯，准备好了再来找我吧！",
                        npc: 818060,
                        next: 71006511,
                    },
                ],
            },
            {
                id: "17562956549245783",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006514,
                        content:
                            "请听题！织星客丢了一件商品，经过调查找到了甲乙丙三人。甲指责：“是乙偷的！”。乙声称：“是丙偷的！”。丙说：“确实是我偷的！”。仅一人说了真话，请问到底是谁偷走了商品？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065141,
                                content: "是甲偷的。",
                                next: 71006518,
                            },
                            {
                                id: 710065142,
                                content: "是乙偷的。",
                                next: 71006517,
                            },
                            {
                                id: 710065143,
                                content: "是丙偷的。",
                                next: 71006518,
                            },
                        ],
                    },
                    {
                        id: 71006518,
                        content: "回答错误，这是你的安慰奖，欢迎下次再来挑战哦～",
                        npc: 818060,
                    },
                    {
                        id: 71006517,
                        content: "恭喜你答对了！这是为你准备的豪华奖品，请拿好～",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17562956549245784",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006515,
                        content: "请听题！锦鲤皎皎的好友有三个皎皎朋友，第一个叫黄金皎皎，第二个叫白银皎皎，第三个叫什么？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065151,
                                content: "青铜皎皎。",
                                next: 71006518,
                                impr: [1041, "Wisdom", 1],
                            },
                            {
                                id: 710065152,
                                content: "黑铁皎皎。",
                                next: 71006518,
                                impr: [1041, "Wisdom", 1],
                            },
                            {
                                id: 710065153,
                                content: "锦鲤皎皎。",
                                next: 71006517,
                                impr: [1041, "Wisdom", 1],
                            },
                        ],
                    },
                    {
                        id: 71006518,
                        content: "回答错误，这是你的安慰奖，欢迎下次再来挑战哦～",
                        npc: 818060,
                    },
                    {
                        id: 71006517,
                        content: "恭喜你答对了！这是为你准备的豪华奖品，请拿好～",
                        npc: 818060,
                    },
                ],
            },
            {
                id: "17562956549245785",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71006516,
                        content:
                            "请听题！三人前后排队，各带帽子一顶，帽子颜色可能会出现红、黄、蓝其中一种。最后一人能看到前两人的帽子，中间的人只能看前面。最后一人沉默，接着中间人也沉默。第一人说自己戴黄帽。已知至少一人戴黄帽。下列哪个说法是正确的？",
                        npc: 818060,
                        options: [
                            {
                                id: 710065161,
                                content: "第一个人说得对。",
                                next: 71006517,
                            },
                            {
                                id: 710065162,
                                content: "最后一人沉默说明前两人都戴蓝帽，所以第一人错。",
                                next: 71006518,
                            },
                            {
                                id: 710065163,
                                content: "中间人沉默说明第一人戴红帽，所以第一人错。",
                                next: 71006518,
                            },
                        ],
                    },
                    {
                        id: 71006517,
                        content: "恭喜你答对了！这是为你准备的豪华奖品，请拿好～",
                        npc: 818060,
                    },
                    {
                        id: 71006518,
                        content: "回答错误，这是你的安慰奖，欢迎下次再来挑战哦～",
                        npc: 818060,
                    },
                ],
            },
        ],
    },
    {
        id: 308404,
        name: "解救魔灵",
        level: [50, 59],
        regionId: 1041,
        subRegionId: 104107,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17344917015822641",
                type: "TalkNode",
                name: "解救宠物开车",
                next: ["17344917015822648"],
                dialogues: [
                    {
                        id: 71007301,
                        content: "（游荡的敌人挤满了四周，先击退它们，再去解救魔灵吧。）",
                        npc: 800006,
                        next: 71007302,
                    },
                ],
            },
            {
                id: "17344917015822647",
                type: "TalkNode",
                name: "击杀秽兽开车",
                dialogues: [
                    {
                        id: 71007302,
                        content: "（争斗的声响引来了更多敌人。）",
                        npc: 800006,
                        next: 71007303,
                    },
                ],
            },
            {
                id: "17344917015822648",
                type: "TalkNode",
                name: "击杀怪物开车",
                dialogues: [
                    {
                        id: 71007303,
                        content: "（附近暂时安全了，趁现在解救魔灵吧。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 308405,
        name: "解救魔灵",
        level: [60, 65],
        regionId: 1041,
        subRegionId: 104107,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17344917015822641",
                type: "TalkNode",
                name: "解救宠物开车",
                next: ["17344917015822648"],
                dialogues: [
                    {
                        id: 71007301,
                        content: "（游荡的敌人挤满了四周，先击退它们，再去解救魔灵吧。）",
                        npc: 800006,
                        next: 71007302,
                    },
                ],
            },
            {
                id: "17344917015822647",
                type: "TalkNode",
                name: "击杀秽兽开车",
                dialogues: [
                    {
                        id: 71007302,
                        content: "（争斗的声响引来了更多敌人。）",
                        npc: 800006,
                        next: 71007303,
                    },
                ],
            },
            {
                id: "17344917015822648",
                type: "TalkNode",
                name: "击杀怪物开车",
                dialogues: [
                    {
                        id: 71007303,
                        content: "（附近暂时安全了，趁现在解救魔灵吧。）",
                        npc: 800006,
                    },
                ],
            },
        ],
    },
    {
        id: 310305,
        name: "茂盛的山瑚",
        level: [60, 65],
        regionId: 1041,
        subRegionId: 104103,
        chance: 5,
        completeNum: -1,
        dayLimit: false,
        reward: [51003],
        nodes: [
            {
                id: "17660421484711769199",
                type: "TalkNode",
                name: "对话节点",
                next: ["17660444659281775357", "17660444249131774844"],
                dialogues: [
                    {
                        id: 71008201,
                        content: "（附近生长着不少山瑚，若是有空，不妨收集一些吧。）",
                        npc: 800006,
                        next: 71008204,
                    },
                ],
            },
            {
                id: "1768462477049862",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71008204,
                        content: "（成功收集完了附近的所有山瑚，是时候离开了。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17660444659281775357",
                type: "TalkNode",
                name: "对话节点",
                dialogues: [
                    {
                        id: 71008203,
                        content: "（虽然出现了一点小意外，但最后总算是顺利收集完了附近的所有山瑚。）",
                        npc: 800006,
                    },
                ],
            },
            {
                id: "17660444249131774844",
                type: "TalkNode",
                name: "对话节点",
                next: ["17660444659281775357"],
                dialogues: [
                    {
                        id: 71008202,
                        content: "（收集山瑚的响动将周围的敌人吸引了过来，击退它们吧。）",
                        npc: 800006,
                        next: 71008203,
                    },
                ],
            },
        ],
    },
]

export const dynQuestMap = t.reduce((acc, cur) => {
    acc.set(cur.id, cur)
    return acc
}, new Map<number, DynQuest>())

export default t
