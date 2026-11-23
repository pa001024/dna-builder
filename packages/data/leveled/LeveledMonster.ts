import { mobLevelUp } from "../d/levelup.data"

export interface Monster {
    id: number
    n: string
    t?: "Rescue_Elite_Monster" | "Elite_Monster" | "Boss"
    f?: number
    atk: number
    def: number
    hp: number
    es?: number
    tn?: number
    icon?: string
    tags?: string[]
}

export interface DynamicMonster extends Monster {
    currentHP: number
    currentShield: number
    currentTN: number
}

export type LeveledMonsterResolver = (id: number) => Monster | undefined

let leveledMonsterResolver: LeveledMonsterResolver | undefined

export function setLeveledMonsterResolver(resolver: LeveledMonsterResolver) {
    leveledMonsterResolver = resolver
}

/** 怪物等级曲线（上游 `Script/Datas/LevelUp.lua` 全量等级行），由 `tools/import-i18n-data.ts` 生成。 */
export const MOB_LEVEL_UP = mobLevelUp

export class LeveledMonster implements DynamicMonster {
    id: number
    n: string
    t?: "Rescue_Elite_Monster" | "Elite_Monster" | "Boss"
    f: number
    atk: number
    def: number
    hp: number
    es?: number
    tn?: number

    _等级: number = 1
    _baseData: Monster

    currentHP: number
    currentShield: number
    currentTN: number

    constructor(
        id: number | Monster,
        等级 = 180,
        public isRouge = false,
        public hpMultiplier = 1
    ) {
        const mData = typeof id === "number" ? leveledMonsterResolver?.(id) : id
        if (!mData) {
            throw new Error(typeof id === "number" ? `怪物 "${id}" 未在静态表中找到` : "怪物数据不能为空")
        }
        this._baseData = mData
        this.id = mData.id
        this.n = mData.n
        this.f = mData.f || 0
        this.atk = mData.atk
        this.def = mData.def
        this.hp = Math.round(mData.hp * this.hpMultiplier)
        if (mData.t !== undefined) this.t = mData.t
        if (mData.es !== undefined) this.es = Math.round(mData.es * this.hpMultiplier)
        if (mData.tn !== undefined) this.tn = mData.tn

        this.currentHP = this.hp
        this.currentShield = this.es || 0
        this.currentTN = this.tn || 0

        if (等级 > 1) {
            this.等级 = 等级
        }
    }

    get currentHPType() {
        if (this.currentShield > 0) {
            return "护盾"
        }
        return "生命"
    }

    get currentHPValue() {
        if (this.currentHPType === "护盾") {
            return this.currentShield
        }
        return this.currentHP
    }

    resetHP() {
        this.currentHP = this.hp
        this.currentShield = this.es || 0
    }

    public clone() {
        const monster = new LeveledMonster(this._baseData, this._等级, this.isRouge, this.hpMultiplier)
        monster.currentHP = this.currentHP
        monster.currentShield = this.currentShield
        monster.currentTN = this.currentTN
        return monster
    }

    get 等级(): number {
        return this._等级
    }

    set 等级(value: number) {
        if (value !== undefined) {
            const _new = Math.max(1, Math.min(MOB_LEVEL_UP.length, value))
            if (this._等级 !== _new) {
                this._等级 = _new
                this.updatePropertiesByLevel(_new)
            }
        }
    }

    private updatePropertiesByLevel(level: number): void {
        const clampedLevel = Math.max(1, Math.min(MOB_LEVEL_UP.length, level))

        const multiplier = MOB_LEVEL_UP[clampedLevel - 1]

        this.atk = Math.round(this._baseData.atk * multiplier.atk)
        this.hp = Math.round(this._baseData.hp * (this.isRouge ? multiplier.rhp : multiplier.hp) * this.hpMultiplier)
        if (this.es !== undefined) {
            this.es = Math.round((this._baseData.es || 0) * (this.isRouge ? multiplier.res : multiplier.es) * this.hpMultiplier)
        }
        this.resetHP()
    }

    static properties = ["n", "t", "f", "atk", "def", "hp", "es", "tn"] as const

    getProperties(): Partial<Monster> {
        const properties: Partial<Monster> = {}
        LeveledMonster.properties.forEach(prop => {
            if (this[prop] !== undefined) properties[prop] = this[prop] as any
        })
        return properties
    }

    getHPByLevel(level: number): number {
        const clampedLevel = Math.max(1, Math.min(MOB_LEVEL_UP.length, level))
        return Math.round(
            this._baseData.hp * (this.isRouge ? MOB_LEVEL_UP[clampedLevel - 1].rhp : MOB_LEVEL_UP[clampedLevel - 1].hp) * this.hpMultiplier
        )
    }

    get url() {
        return LeveledMonster.url(this._baseData.icon)
    }
    static url(icon?: string) {
        return icon ? `/imgs/webp/T_Head_${icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
    }
}
