import { describe, expect, it } from "vitest"
import { raceLotteryData } from "@/data/d/race-lottery.data"
import { mergeRaceLotteryBuffIds, parseRaceLotteryOcr } from "./race-lottery-ocr"

const players = [{ playerId: 4093, name: "无忧安眠" }]
const buffs = [
    { buffId: 2005, name: "错食过期罐" },
    { buffId: 2004, name: "浴室误滑倒" },
    { buffId: 2002, name: "习惯性崴脚" },
]

describe("parseRaceLotteryOcr", () => {
    it("识别选手名称与状态词条", () => {
        expect(parseRaceLotteryOcr("NO.\n无忧安眠\n16\n状态1：错食过期罐\n状态2：浴室澡滑倒\n状态3：习惯性崴脚", players, buffs)).toEqual({
            playerId: 4093,
            playerName: "无忧安眠",
            buffIds: [2005, 2004, 2002],
        })
    })

    it("识别实际截图中的选手与三个状态词条", () => {
        const actualPlayers = raceLotteryData.players.map(player => ({ playerId: player.playerId, name: player.name }))
        const actualBuffs = [
            ...raceLotteryData.outsideBuffs.map(buff => ({ buffId: buff.rumorId, name: buff.name })),
            ...raceLotteryData.insideBuffs.map(buff => ({ buffId: buff.insideBuffId, name: buff.name })),
        ]

        expect(
            parseRaceLotteryOcr(
                "一路箱北\n04\n1.00\n初始速度\n状态1：赛前特供餐\n状态2：紧张焦虑\n状态3：错食过期罐",
                actualPlayers,
                actualBuffs
            )
        ).toEqual({
            playerId: 4073,
            playerName: "一路箱北",
            buffIds: [1002, 2003, 2005],
        })
    })

    it("没有选手或状态时返回空结果", () => {
        expect(parseRaceLotteryOcr("1.00\n初始速度", players, buffs)).toEqual({
            playerId: null,
            playerName: null,
            buffIds: [0, 0, 0],
        })
    })

    it("按提交顺序合并三个状态位置并去重", () => {
        expect(
            mergeRaceLotteryBuffIds([
                [1004, 1002, 0],
                [0, 0, 1003],
                [1004, 0, 1003],
            ])
        ).toEqual([1004, 1002, 1003])
    })
})
