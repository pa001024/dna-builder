import { defineStore } from "pinia"
import gameData from "../data/data.json"
import { LeveledChar, LeveledMod, LeveledBuff, LeveledWeapon, CharBuild } from "../data"
import { useCharSettings } from "./charSettings"
import { useInvStore } from "./inv"
import { useLocalStorage } from "@vueuse/core"

// Character data type
interface Character {
    id: number
    名称: string
    属性: string
    基础攻击: number
    基础生命: number
    基础护盾: number
    基础防御: number
    基础神智: number
    技能: Array<{
        名称: string
        类型: string
        字段: Array<{ 名称: string; 值: number | number[] }>
    }>
}

// Skill cooldown state
interface SkillCooldown {
    skill1: number // Q skill cooldown remaining
    skill2: number // E skill cooldown remaining
    maxSkill1: number // Q skill max cooldown
    maxSkill2: number // E skill max cooldown
}

export const useFPSGameStore = defineStore("fpsGame", {
    state: () => {
        return {
            // Game State
            gameState: "menu" as "menu" | "character-select" | "playing" | "paused" | "gameover",
            score: 0,
            highScore: 0,

            // DPS Tracking
            totalDamage: 0,
            combatStartTime: 0,
            isInCombat: false,
            damageHistory: [] as Array<{ time: number; damage: number }>,

            // Character
            selectedCharacter: null as Character | null,
            selectedCharName: useLocalStorage("fpsGame.selectedChar", "妮芙尔夫人"),

            // Player Stats
            playerHealth: 100,
            maxHealth: 100,
            sanity: 180, // 神智
            maxSanity: 180,
            currentAmmo: 30,
            maxAmmo: 30,
            reserveAmmo: 90,

            // Skill System
            skillCooldowns: {
                skill1: 0,
                skill2: 0,
                maxSkill1: 3, // Q skill cooldown in seconds
                maxSkill2: 8, // E skill cooldown in seconds
            } as SkillCooldown,

            // Settings
            mouseSensitivity: 0.002,
            volume: 0.7,
            difficulty: "medium" as "easy" | "medium" | "hard",
        }
    },

    getters: {
        characters: () => gameData.char as Character[],

        charSettings(): any {
            if (!this.selectedCharName) return null
            return useCharSettings({ value: this.selectedCharName } as any)
        },

        isPlaying(): boolean {
            return this.gameState === "playing"
        },

        isPaused(): boolean {
            return this.gameState === "paused"
        },

        healthPercentage(): number {
            return (this.playerHealth / this.maxHealth) * 100
        },

        sanityPercentage(): number {
            return (this.sanity / this.maxSanity) * 100
        },

        skill1Ready(): boolean {
            return this.skillCooldowns.skill1 <= 0
        },

        skill2Ready(): boolean {
            return this.skillCooldowns.skill2 <= 0
        },

        skill1Percentage(): number {
            return this.skillCooldowns.skill1 <= 0 ? 100 : (1 - this.skillCooldowns.skill1 / this.skillCooldowns.maxSkill1) * 100
        },

        skill2Percentage(): number {
            return this.skillCooldowns.skill2 <= 0 ? 100 : (1 - this.skillCooldowns.skill2 / this.skillCooldowns.maxSkill2) * 100
        },

        charBuild(): CharBuild | null {
            if (!this.selectedCharacter || !this.charSettings) return null

            const settings = this.charSettings
            const inv = useInvStore()

            return new CharBuild({
                char: new LeveledChar(this.selectedCharacter.名称, settings.charLevel),
                auraMod: settings.auraMod && new LeveledMod(settings.auraMod),
                charMods: settings.charMods
                    .filter((v: any): v is [number, number] => v !== null)
                    .map((v: [number, number]) => new LeveledMod(v[0], v[1], inv.getBuffLv(v[0]))),
                meleeMods: settings.meleeMods
                    .filter((v: any): v is [number, number] => v !== null)
                    .map((v: [number, number]) => new LeveledMod(v[0], v[1], inv.getBuffLv(v[0]))),
                rangedMods: settings.rangedMods
                    .filter((v: any): v is [number, number] => v !== null)
                    .map((v: [number, number]) => new LeveledMod(v[0], v[1], inv.getBuffLv(v[0]))),
                skillWeaponMods: settings.skillWeaponMods
                    .filter((v: any): v is [number, number] => v !== null)
                    .map((v: [number, number]) => new LeveledMod(v[0], v[1], inv.getBuffLv(v[0]))),
                skillLevel: settings.charSkillLevel,
                buffs: settings.buffs.map((v: [string, number]) => new LeveledBuff(v[0], v[1])),
                melee: new LeveledWeapon(
                    settings.meleeWeapon,
                    settings.meleeWeaponRefine,
                    settings.meleeWeaponLevel,
                    inv.getBuffLv(settings.meleeWeapon),
                ),
                ranged: new LeveledWeapon(
                    settings.rangedWeapon,
                    settings.rangedWeaponRefine,
                    settings.rangedWeaponLevel,
                    inv.getBuffLv(settings.rangedWeapon),
                ),
                baseName: settings.baseName,
                imbalance: settings.imbalance,
                hpPercent: settings.hpPercent,
                resonanceGain: settings.resonanceGain,
                enemyType: settings.enemyType,
                enemyLevel: settings.enemyLevel,
                enemyResistance: settings.enemyResistance,
                enemyHpType: settings.enemyHpType,
                targetFunction: settings.targetFunction,
            })
        },

        currentDPS(): number {
            if (!this.isInCombat || this.totalDamage === 0) return 0
            const currentTime = Date.now()
            const combatTime = (currentTime - this.combatStartTime) / 1000 // seconds
            if (combatTime <= 0) return 0
            return Math.round(this.totalDamage / combatTime)
        },
    },

    actions: {
        selectCharacter(character: Character) {
            this.selectedCharacter = character
            this.selectedCharName = character.名称
            // Update player stats based on character
            this.maxHealth = Math.floor(character.基础生命 / 10)
            this.maxSanity = character.基础神智
        },

        recordDamage(damage: number) {
            this.totalDamage += damage
            const currentTime = Date.now()

            // Start combat on first damage
            if (!this.isInCombat) {
                this.isInCombat = true
                this.combatStartTime = currentTime
            }

            // Add to damage history
            this.damageHistory.push({ time: currentTime, damage })

            // Remove old damage records (keep only last 10 seconds for accurate DPS)
            const tenSecondsAgo = currentTime - 10000
            this.damageHistory = this.damageHistory.filter((d) => d.time > tenSecondsAgo)
        },

        resetCombat() {
            this.totalDamage = 0
            this.combatStartTime = 0
            this.isInCombat = false
            this.damageHistory = []
        },

        startGame() {
            if (!this.selectedCharacter) {
                this.gameState = "character-select"
                return
            }
            this.gameState = "playing"
            this.score = 0
            this.playerHealth = this.maxHealth
            this.sanity = this.maxSanity
            this.currentAmmo = this.maxAmmo
            this.reserveAmmo = 90
            this.skillCooldowns.skill1 = 0
            this.skillCooldowns.skill2 = 0
            this.resetCombat()
        },

        pauseGame() {
            if (this.gameState === "playing") {
                this.gameState = "paused"
            }
        },

        resumeGame() {
            if (this.gameState === "paused") {
                this.gameState = "playing"
            }
        },

        endGame() {
            this.gameState = "gameover"
            if (this.score > this.highScore) {
                this.highScore = this.score
            }
        },

        takeDamage(amount: number) {
            this.playerHealth = Math.max(0, this.playerHealth - amount)
            if (this.playerHealth === 0) {
                this.endGame()
            }
        },

        useSanity(amount: number): boolean {
            if (this.sanity >= amount) {
                this.sanity -= amount
                return true
            }
            return false
        },

        shoot(): boolean {
            if (this.currentAmmo > 0) {
                this.currentAmmo--
                return true
            }
            return false
        },

        reload() {
            if (this.reserveAmmo > 0 && this.currentAmmo < this.maxAmmo) {
                const needed = this.maxAmmo - this.currentAmmo
                const toReload = Math.min(needed, this.reserveAmmo)
                this.currentAmmo += toReload
                this.reserveAmmo -= toReload
            }
        },

        useSkill1(): boolean {
            // Q skill - 日食/月猎
            if (!this.skill1Ready || !this.selectedCharacter) return false

            const skill = this.selectedCharacter.技能[0]
            const costField = skill.字段.find((f) => f.名称.includes("神智消耗"))
            const cost = (costField?.值 as number) || 12

            if (this.useSanity(cost)) {
                this.skillCooldowns.skill1 = this.skillCooldowns.maxSkill1
                return true
            }
            return false
        },

        useSkill2(): boolean {
            // E skill - 雾海安魂 (ult)
            if (!this.skill2Ready || !this.selectedCharacter) return false

            const skill = this.selectedCharacter.技能[1]
            const costField = skill.字段.find((f) => f.名称 === "神智消耗")
            const cost = (costField?.值 as number) || 120

            if (this.useSanity(cost)) {
                this.skillCooldowns.skill2 = this.skillCooldowns.maxSkill2
                return true
            }
            return false
        },

        updateCooldowns(deltaTime: number) {
            if (this.skillCooldowns.skill1 > 0) {
                this.skillCooldowns.skill1 = Math.max(0, this.skillCooldowns.skill1 - deltaTime)
            }
            if (this.skillCooldowns.skill2 > 0) {
                this.skillCooldowns.skill2 = Math.max(0, this.skillCooldowns.skill2 - deltaTime)
            }
        },

        addScore(points: number) {
            this.score += points
        },

        resetToMenu() {
            this.gameState = "menu"
            this.score = 0
            this.playerHealth = this.maxHealth
            this.sanity = this.maxSanity
            this.currentAmmo = this.maxAmmo
            this.reserveAmmo = 90
            this.skillCooldowns.skill1 = 0
            this.skillCooldowns.skill2 = 0
            this.resetCombat()
        },

        calculateDamage(skillIndex?: number): number {
            if (!this.charBuild) return 10 // Fallback default damage

            try {
                // Get character attributes
                const attrs = this.charBuild.calculateAttributes()

                // Base damage from attack stat
                let baseDamage = attrs.攻击 || 10

                // Apply skill multipliers
                if (skillIndex === 0) {
                    // Q skill - use skill damage multiplier
                    baseDamage = baseDamage * (attrs.技能伤害 || 1) * 2.5
                } else if (skillIndex === 1) {
                    // E skill - ultimate damage
                    baseDamage = baseDamage * (attrs.技能伤害 || 1) * 5
                } else {
                    // Normal attack
                    baseDamage = baseDamage * (attrs.武器伤害 || 1)
                }

                // Add independent damage increase
                const independentDmg = attrs.独立增伤 || 0
                baseDamage = baseDamage * (1 + independentDmg / 100)

                return Math.round(baseDamage)
            } catch (error) {
                console.error("Damage calculation error:", error)
                return 10
            }
        },
    },
})
