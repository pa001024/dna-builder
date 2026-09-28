/**
 * RAG 语料切块与词法索引的单元测试。
 *
 * 覆盖三件跨端契约相关的事：
 * 1. 锚点格式稳定（服务端索引与客户端还原靠它对齐）；
 * 2. 内容指纹确定性（版本漂移校验靠它）；
 * 3. 剧情正文清理口径与展示层一致（引用片段与页面内容对不上就是事故）。
 */

import i18next from "i18next"
import { beforeAll, describe, expect, it } from "vitest"
import charData from "@/data/d/char.data"
import type { QuestItem } from "@/data/d/quest.data"
import type { QuestChain } from "@/data/d/questchain.data"
import {
    buildEntryChunks,
    buildProfileChunks,
    buildStoryChunks,
    buildSummaryChunks,
    buildVoiceChunks,
    cleanStoryContent,
} from "@/data/rag/chunks"
import {
    entryAnchor,
    profileAnchor,
    RAG_PROFILE_MODULE,
    ragChunkHash,
    ragKindFingerprints,
    storyDialogueAnchor,
    storyOptionAnchor,
    summaryAnchor,
    voiceAnchor,
} from "@/data/rag/types"
import { getRagCorpus } from "@/utils/rag/corpus"
import { buildLexicalIndex, searchLexical } from "@/utils/rag/lexical"
import { createIndexedCorpus, runRagQuery } from "@/utils/rag/query"
import { ragSearch } from "@/utils/rag/search"

// 全库条目索引的标题由 i18next 渲染（未初始化时取不到标题，条目将不可按名检索），
// 这里初始化一个空资源实例：`t()` 会原样返回键，行为与线上「未收录译文」时一致
beforeAll(async () => {
    if (!i18next.isInitialized) {
        await i18next.init({ lng: "zh-CN", resources: {} })
    }
})

/** 构造一份最小剧情数据：两条对话 + 一个选项 */
function createFixture() {
    const chains: QuestChain[] = [
        {
            id: 9001,
            name: "测试任务链",
            chapterName: "夜航篇",
            chapterNumber: "1",
            episode: "第一幕",
            type: 1,
            quests: [{ id: 91001 }],
        },
    ]
    const questItems = new Map<number, QuestItem>([
        [
            91001,
            {
                id: 91001,
                name: "测试任务",
                nodes: [
                    {
                        id: "n1",
                        type: "DialogNode",
                        dialogues: [
                            { id: 5001, speakerName: "黎瑟", content: "<H>雪</>？{nickname}也在。" },
                            {
                                id: 5002,
                                content: "",
                                options: [
                                    { id: 6001, content: "我们一起走。" },
                                    { id: 6002, content: "" },
                                ],
                            },
                        ],
                    },
                ],
            } as QuestItem,
        ],
    ])

    return { chains, questItems }
}

describe("RAG 切块", () => {
    it("剧情锚点按 任务链:任务:对话/选项 生成，且顺序即剧情顺序", () => {
        const { chains, questItems } = createFixture()
        const chunks = buildStoryChunks({ lang: "zh", chains, questItems, npcNames: new Map() })

        // 空正文的对话与空选项不入索引
        expect(chunks.map(chunk => chunk.anchor)).toEqual([storyDialogueAnchor(9001, 91001, 5001), storyOptionAnchor(9001, 91001, 6001)])
        expect(chunks[0]?.kind).toBe("story")
        expect(chunks[0]?.title).toBe("黎瑟")
        expect(chunks[0]?.path).toBe("/db/questchain/9001/91001")
    })

    it("剧情正文清理与展示层同口径（去标签、换昵称占位符）", () => {
        const { chains, questItems } = createFixture()
        const chunks = buildStoryChunks({ lang: "zh", chains, questItems, npcNames: new Map() })

        expect(chunks[0]?.text).toBe("雪？维塔也在。")
        expect(cleanStoryContent("<W>警告</>：{nickname2}")).toBe("警告：墨斯")
        expect(cleanStoryContent(undefined)).toBe("")
    })

    it("重复锚点（同一段对话被多个分支复用）只保留首次出现", () => {
        const { chains, questItems } = createFixture()
        // 同一条对话在两个节点里各出现一次：数据里真实存在（中文实测 19,258 行中有 404 行是这种重复）
        const quest = questItems.get(91001)!
        quest.nodes = [...(quest.nodes ?? []), ...(quest.nodes ?? [])]

        const chunks = buildStoryChunks({ lang: "zh", chains, questItems, npcNames: new Map() })

        expect(chunks.length).toBe(2)
        expect(new Set(chunks.map(chunk => chunk.anchor)).size).toBe(2)
    })

    it("内容指纹是确定性的：同文本同值、异文本异值", () => {
        expect(ragChunkHash("同一段文本")).toBe(ragChunkHash("同一段文本"))
        expect(ragChunkHash("同一段文本")).not.toBe(ragChunkHash("同一段文"))
        expect(ragChunkHash("")).toMatch(/^[0-9a-f]{16}$/)
    })

    it("语料指纹按种类分别计算：与顺序无关、只随本种类内容变化（数据包清单与服务端靠它对齐）", () => {
        const chunks = [
            { kind: "story" as const, anchor: "story:1:1:d1", hash: "aaaa" },
            { kind: "voice" as const, anchor: "voice:2:3", hash: "bbbb" },
            { kind: "story" as const, anchor: "story:1:1:d2", hash: "cccc" },
            { kind: "summary" as const, anchor: "summary:1", hash: "dddd" },
        ]
        const fingerprints = ragKindFingerprints(chunks)

        // 只含有内容的种类，每类一份指纹
        expect(Object.keys(fingerprints).sort()).toEqual(["story", "summary", "voice"])
        expect(fingerprints.story).toMatch(/^[0-9a-f]{16}$/)

        // 顺序无关：服务端建索引与数据包构建的切块顺序不必相同
        expect(ragKindFingerprints([...chunks].reverse())).toEqual(fingerprints)

        // 改一个 story chunk：只有 story 的指纹变，其它种类不受影响——这是「部分模块更新可复用其余模块」的前提
        const storyChanged = ragKindFingerprints([{ ...chunks[0]!, hash: "xxxx" }, ...chunks.slice(1)])
        expect(storyChanged.story).not.toBe(fingerprints.story)
        expect(storyChanged.voice).toBe(fingerprints.voice)
        expect(storyChanged.summary).toBe(fingerprints.summary)

        // 锚点变化同样会被捕捉
        const anchorChanged = ragKindFingerprints([chunks[0]!, { ...chunks[1]!, anchor: "voice:2:9" }, chunks[2]!, chunks[3]!])
        expect(anchorChanged.voice).not.toBe(fingerprints.voice)
        expect(anchorChanged.story).toBe(fingerprints.story)

        expect(ragKindFingerprints([])).toEqual({})
    })

    it("剧情 AI 总结按任务链锚点生成，无总结 / 空总结的任务链跳过", () => {
        const { chains } = createFixture()

        const chunks = buildSummaryChunks({
            lang: "zh",
            chains,
            summaries: { 9001: "这一章讲的是测试。", 9999: "任务链不存在，不该产出 chunk" },
        })

        expect(chunks).toHaveLength(1)
        expect(chunks[0]?.anchor).toBe(summaryAnchor(9001))
        expect(chunks[0]?.kind).toBe("summary")
        expect(chunks[0]?.title).toBe("测试任务链")
        expect(chunks[0]?.text).toBe("这一章讲的是测试。")
        // 总结只对应整条链，路径落在任务链页而不是「任务链 + 任务」的正文页
        expect(chunks[0]?.path).toBe("/db/questchain/9001")
        // meta 带「剧情总结」标记：模型与用户按「某某剧情总结」检索时能落到这类语料
        expect(chunks[0]?.meta).toContain("剧情总结")

        expect(buildSummaryChunks({ lang: "zh", chains, summaries: {} })).toEqual([])
        expect(buildSummaryChunks({ lang: "zh", chains, summaries: { 9001: "<H></>" } })).toEqual([])
    })

    it("语音与条目按各自锚点格式生成", () => {
        const voiceChunks = buildVoiceChunks({
            lang: "zh",
            voices: [{ id: 77, charId: 1001, name: "初见", res: "x", text: "我回来了。" }],
            charNames: new Map([[1001, "主角"]]),
        })
        expect(voiceChunks[0]?.anchor).toBe(voiceAnchor(1001, 77))
        expect(voiceChunks[0]?.meta).toBe("主角 初见")

        const entryChunks = buildEntryChunks({
            lang: "zh",
            entries: [
                {
                    id: "char:1001",
                    title: "主角",
                    subtitle: "属性:暗",
                    typeLabel: "角色",
                    path: "/db/char/1001",
                    searchText: "生日 01-01",
                },
            ],
        })
        expect(entryChunks[0]?.anchor).toBe(entryAnchor("char", "1001"))
        expect(entryChunks[0]?.module).toBe("char")
        expect(entryChunks[0]?.entityId).toBe("1001")
        // 详情页字段（生日）进正文，因此可直接被关键词命中
        expect(entryChunks[0]?.text).toContain("01-01")
    })

    it("角色档案按 角色:档案 锚点生成，标题带角色名、正文与展示层同口径清洗", () => {
        const chunks = buildProfileChunks({
            lang: "zh",
            profiles: [
                { id: 1001, charId: 1101, name: "见证·其一", unlock: "角色等级达到20级", text: "<H>雪</>？{nickname}也在。" },
                { id: 1002, charId: 1101, name: "见证·其二", unlock: "角色等级达到30级", text: "   " },
            ],
            charNames: new Map([[1101, "贝蕾妮卡"]]),
        })

        // 空正文（只有空白）的档案不入索引
        expect(chunks).toHaveLength(1)
        expect(chunks[0]?.anchor).toBe(profileAnchor(1101, 1001))
        expect(chunks[0]?.kind).toBe("profile")
        // 档案带模块归属，因此 rag_search 的 modules 过滤（charprofile）能命中它
        expect(chunks[0]?.module).toBe(RAG_PROFILE_MODULE)
        // 档案名在各角色间高度重复，标题必须带上角色名才能区分主体
        expect(chunks[0]?.title).toBe("贝蕾妮卡 · 见证·其一")
        // 正文与角色详情页「档案」标签同口径：去样式标签、替换昵称占位符
        expect(chunks[0]?.text).toBe("雪？维塔也在。")
        expect(chunks[0]?.meta).toContain("角色档案")
        expect(chunks[0]?.path).toBe("/db/char/1101")
    })
})

describe("词法索引（BM25）", () => {
    const chunks = buildEntryChunks({
        lang: "zh",
        entries: [
            { id: "char:1", title: "黎瑟", subtitle: "属性:暗", typeLabel: "角色", path: "/db/char/1", searchText: "夜航者小队" },
            { id: "mod:1", title: "充盈·巧力", subtitle: "类型:技能", typeLabel: "魔之楔", path: "/db/mod/1", searchText: "" },
            { id: "char:2", title: "Rhythm", subtitle: "属性:光", typeLabel: "角色", path: "/db/char/2", searchText: "" },
            ...Array.from({ length: 40 }, (_unused, index) => ({
                id: `ach:${index}`,
                title: `成就 ${index}`,
                subtitle: "与检索无关的填充条目",
                typeLabel: "成就",
                path: `/db/achievement/${index}`,
                searchText: "占位文本，用来稀释词频",
            })),
        ],
    })
    const index = buildLexicalIndex(chunks)

    it("标题精确命中排在最前，并标记命中原因", () => {
        const hits = searchLexical(index, "黎瑟", { limit: 3 })
        expect(hits[0]?.chunk.anchor).toBe(entryAnchor("char", "1"))
        expect(hits[0]?.matchedBy).toBe("title")
    })

    it("中文按 unigram 支持部分匹配（只写一个字也能命中）", () => {
        const hits = searchLexical(index, "充盈", { limit: 3 })
        expect(hits[0]?.chunk.anchor).toBe(entryAnchor("mod", "1"))
    })

    it("拉丁词支持前缀召回", () => {
        const hits = searchLexical(index, "Rhy", { limit: 3 })
        expect(hits.some(hit => hit.chunk.anchor === entryAnchor("char", "2"))).toBe(true)
    })

    it("预过滤可以按模块收窄", () => {
        const hits = searchLexical(index, "黎瑟", { limit: 10, filter: chunk => chunk.kind === "entry" && chunk.module === "mod" })
        expect(hits).toHaveLength(0)
    })

    it("查空串返回空结果而不是全量", () => {
        expect(searchLexical(index, "   ")).toEqual([])
    })
})

describe("向量通道融合", () => {
    /** 三条互不相同的语料，用于验证「关键词一条都不命中、仅靠向量也能召回」 */
    const chunks = buildEntryChunks({
        lang: "zh",
        entries: [
            { id: "char:1", title: "黎瑟", subtitle: "属性:暗", typeLabel: "角色", path: "/db/char/1", searchText: "" },
            { id: "char:2", title: "芙罗拉", subtitle: "属性:光", typeLabel: "角色", path: "/db/char/2", searchText: "" },
            { id: "char:3", title: "幻景", subtitle: "属性:风", typeLabel: "角色", path: "/db/char/3", searchText: "" },
        ],
    })
    const corpus = createIndexedCorpus(chunks)

    it("向量命中能与词法结果融合，并标记命中原因", () => {
        const result = runRagQuery(corpus, ["黎瑟"], { limit: 5 }, [{ anchor: entryAnchor("char", "3"), score: 0.91 }])

        expect(result.hits.length).toBe(2)
        expect(result.hits.map(hit => hit.anchor)).toContain(entryAnchor("char", "3"))

        const vectorOnly = result.hits.find(hit => hit.anchor === entryAnchor("char", "3"))
        expect(vectorOnly?.matchedBy).toContain("vector")

        const lexicalOnly = result.hits.find(hit => hit.anchor === entryAnchor("char", "1"))
        expect(lexicalOnly?.matchedBy).not.toContain("vector")
    })

    it("锚点在本地语料里不存在时忽略该向量命中（服务端索引与本地数据包不一致的情况）", () => {
        const result = runRagQuery(corpus, ["黎瑟"], { limit: 5 }, [{ anchor: "story:1:2:d3", score: 0.99 }])

        expect(result.hits.map(hit => hit.anchor)).toEqual([entryAnchor("char", "1")])
    })

    it("没有向量命中时保持 BM25 原始分数排序", () => {
        const result = runRagQuery(corpus, ["黎瑟"], { limit: 5 })

        // 单变体无向量：分数是 BM25 分（远大于 RRF 的 1/60 量级），便于调试与阈值判断
        expect(result.hits[0]!.score).toBeGreaterThan(1)
    })
})

describe("ragSearch 统一召回", () => {
    it("中文提问能命中剧情台词并给出上下文片段与出处", async () => {
        // 用真实语料里的一条台词做查询：断言「同一行」被召回，而不是依赖人工挑选的关键词
        const corpus = await getRagCorpus("zh")
        const storyChunk = corpus.chunks.find(chunk => chunk.kind === "story" && chunk.text.length >= 6)
        expect(storyChunk).toBeDefined()

        const result = await ragSearch(storyChunk!.text.slice(0, 6), { lang: "zh", limit: 10 })

        expect(result.hits.length).toBeGreaterThan(0)
        expect(result.note).toContain("数据语言：zh")

        const hit = result.hits.find(item => item.anchor === storyChunk!.anchor)
        expect(hit).toBeDefined()
        expect(hit?.kind).toBe("story")
        expect(hit?.path).toBe(storyChunk!.path)
        expect(hit?.path).toMatch(/^\/db\/questchain\/\d+\/\d+$/)
        // 片段里用 `> ` 标出命中行，并带上同一任务内的前后行
        expect(hit?.snippet).toContain("> ")
    }, 60000)

    it("限定模块时只返回条目语料", async () => {
        const charName = charData[0]!.名称
        const result = await ragSearch(charName, { lang: "zh", modules: ["char"], limit: 5 })

        expect(result.hits.length).toBeGreaterThan(0)
        expect(result.hits.every(hit => hit.kind === "entry" && hit.module === "char")).toBe(true)
        expect(result.hits.some(hit => hit.title === charName)).toBe(true)
    }, 60000)

    it("空关键词给出语料规模提示而不是抛错", async () => {
        const result = await ragSearch("  ", { lang: "zh" })

        expect(result.hits).toEqual([])
        expect(result.note).toContain("关键词为空")
    }, 60000)

    it("检索结果不返回隐藏的搜索文本字段（只给正文与片段）", async () => {
        const result = await ragSearch("黎瑟", { lang: "zh", limit: 5 })

        for (const hit of result.hits) {
            expect(hit).not.toHaveProperty("searchText")
            // 剧情总结是整段梗概，上限放宽到 400 字；其余语料仍按台词行的 320 字口径
            expect(hit.text.length).toBeLessThanOrEqual(hit.kind === "summary" ? 401 : 321)
            expect(hit.snippet.length).toBeLessThanOrEqual(601)
        }
    }, 60000)

    it("kind=summary 只返回任务链剧情总结，正文是整链梗概且不截断", async () => {
        const corpus = await getRagCorpus("zh")
        const summaryChunk = corpus.chunks.find(chunk => chunk.kind === "summary" && chunk.text.length > 60)
        expect(summaryChunk).toBeDefined()

        // 用总结正文里的原话检索：验证总结确实进了语料（而不是只在数据文件里）
        const result = await ragSearch(summaryChunk!.text.slice(0, 20), { lang: "zh", kinds: ["summary"], limit: 5 })

        expect(result.hits.length).toBeGreaterThan(0)
        expect(result.hits.every(hit => hit.kind === "summary")).toBe(true)

        const hit = result.hits.find(item => item.anchor === summaryChunk!.anchor)
        expect(hit).toBeDefined()
        // 整段梗概原样返回（不被 320 字的台词口径截断），路径指向任务链页面
        expect(hit?.text).toBe(summaryChunk!.text)
        expect(hit?.path).toMatch(/^\/db\/questchain\/\d+$/)
    }, 60000)

    it("角色数据可用时能命中角色条目（数据包已水合的真实数据）", async () => {
        const firstChar = charData[0]
        expect(firstChar).toBeDefined()

        const result = await ragSearch(firstChar!.名称, { lang: "zh", limit: 5 })
        expect(result.hits.some(hit => hit.kind === "entry" && hit.module === "char")).toBe(true)
    }, 60000)

    it("kind=profile 只返回角色档案，且档案正文确实进了语料", async () => {
        const corpus = await getRagCorpus("zh")
        const profileChunk = corpus.chunks.find(chunk => chunk.kind === "profile" && chunk.text.replace(/\s+/g, "").length > 30)
        expect(profileChunk).toBeDefined()

        // 用档案正文里的原话检索：验证档案确实进了语料（而不是只在数据文件里）
        const phrase = profileChunk!.text.replace(/\s+/g, "").slice(0, 12)
        const result = await ragSearch(phrase, { lang: "zh", kinds: ["profile"], limit: 5 })

        expect(result.hits.length).toBeGreaterThan(0)
        expect(result.hits.every(hit => hit.kind === "profile" && hit.module === RAG_PROFILE_MODULE)).toBe(true)

        const hit = result.hits.find(item => item.anchor === profileChunk!.anchor)
        expect(hit).toBeDefined()
        expect(hit?.path).toBe(profileChunk!.path)
        // 标题是「角色名 · 档案名」：引用时能看出这条档案属于谁
        expect(hit?.title).toContain("·")
    }, 60000)

    it("按 modules 限定角色档案时只返回档案语料", async () => {
        const result = await ragSearch("见证", { lang: "zh", modules: [RAG_PROFILE_MODULE], limit: 5 })

        expect(result.hits.length).toBeGreaterThan(0)
        expect(result.hits.every(hit => hit.kind === "profile")).toBe(true)
    }, 60000)
})
