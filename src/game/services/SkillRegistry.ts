import { LeveledSkillField } from "../../data/leveled/LeveledSkill"
import { BaseSkill } from "./BaseSkill"
import { LiseSkillE, LiseSkillQ } from "./skills/Lise"
import { VoxelEngine } from "./VoxelEngine"

/**
 * 技能注册表
 * 用于统一管理所有可用技能的元数据与实例
 */
export const SkillRegistry = {
    /**
     * 注册新技能
     * @param id 技能ID
     * @param skill 技能实例
     */
    register(id: number, skill: new (engine: VoxelEngine, fields: LeveledSkillField[]) => BaseSkill): void {
        if (!id || !skill) {
            throw new Error("技能名称与实例不能为空")
        }
        if (this._skills.has(id)) {
            throw new Error(`技能 "${id}" 已存在`)
        }
        this._skills.set(id, skill)
    },

    /**
     * 获取指定技能
     * @param id 技能ID
     * @returns 技能实例
     */
    get(id: number): new (engine: VoxelEngine, fields: LeveledSkillField[]) => BaseSkill {
        if (!this._skills.has(id)) {
            throw new Error(`技能 "${id}" 未注册`)
        }
        return this._skills.get(id)
    },

    /**
     * 获取所有已注册技能ID
     */
    list(): number[] {
        return Array.from(this._skills.keys())
    },

    /** 内部技能映射表 */
    _skills: new Map<number, any>(),
}

SkillRegistry.register(410101, LiseSkillE)
SkillRegistry.register(410102, LiseSkillQ)
