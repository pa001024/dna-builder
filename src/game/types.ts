/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three"

export interface VoxelData {
    x: number
    y: number
    z: number
    color: number
}

export enum Faction {
    PLAYER = "PLAYER",
    MONSTER = "MONSTER",
}

export interface BaseEntity {
    id: string
    position: THREE.Vector3
    mesh: THREE.Object3D
    isDead: boolean
}

export interface Monster extends BaseEntity {
    name: string
    level: number
    maxHP: number
    currentHP: number
    maxShield: number
    currentShield: number
    attack: number
    defense: number
    faction: Faction
    speed: number
    hpBarRef?: HTMLDivElement
    screenPosition?: { x: number; y: number } // 屏幕坐标
}

export interface FloatingText {
    id: string
    position: THREE.Vector3
    text: string
    color: string
    life: number // 0 to 1
    opacity: number
    screenPosition?: { x: number; y: number } // 屏幕坐标
}

export interface PlayerStats {
    maxHP: number
    currentHP: number
    maxShield: number
    currentShield: number
    maxSanity: number // 神智
    currentSanity: number
    electricEnergy: number // 电能
    attack: number
    defense: number
    moveSpeed: number
    activeBuffs: string[] // 当前激活的BUFF名称列表
}

export interface GameSettings {
    monsterCount: number
    monsterLevel: number
    spawnType: "random" | "ring"
    autoLevelUp: boolean
    autoLevelInterval: number // seconds
    spawnInterval: number // seconds
    sanityRegenAmount: number // 神智回复量
    sanityRegenInterval: number // 神智回复间隔(秒)
}

export interface DamageEvent {
    damage: number
    critLevel: number // 暴击等级，0表示普通伤害，1表示一级暴击，2表示二级暴击等
    element: "physical" | "lightning" | "fire"
    targetId: string
}
