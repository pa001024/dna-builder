/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three"
import { VoxelEngine } from "./VoxelEngine"
import { Monster } from "../types"

// --- Helper: Distance from point to line segment ---
// p: point, a: line start, b: line end
export function distanceToSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
    const pa = p.clone().sub(a)
    const ba = b.clone().sub(a)
    const h = Math.min(1, Math.max(0, pa.dot(ba) / ba.dot(ba)))
    return pa.sub(ba.multiplyScalar(h)).length()
}

// --- Base Skill Class ---
export abstract class BaseSkill {
    protected engine: VoxelEngine
    public name: string
    public cooldown: number = 0
    public currentCooldown: number = 0

    constructor(engine: VoxelEngine, name: string) {
        this.engine = engine
        this.name = name
    }

    // Attempt to cast the skill
    public tryCast(): void {
        if (this.currentCooldown > 0) return
        this.onCast()
    }

    // Actual logic to be implemented by subclasses
    protected abstract onCast(): void

    // Per-frame update
    public update(dt: number): void {
        if (this.currentCooldown > 0) {
            this.currentCooldown -= dt
        }
        this.onUpdate(dt)
    }

    protected onUpdate(_dt: number): void {}

    // 辅助函数：使用引擎的计算器应用伤害
    protected applyDamage(target: Monster, subSkill?: string) {
        this.engine.applySkillDamage(target, subSkill ? `${this.name}::${subSkill}` : this.name)
    }
}
