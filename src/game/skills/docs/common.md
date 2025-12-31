# 角色技能实现通用要点

## 技能系统架构

### 基础类结构

- **SkillBase**: 所有技能的基类，提供通用接口和属性
- **LeveledSkill**: 技能数据类，包含等级相关的属性计算
- **SkillType**: 技能类型枚举（INSTANT, CHANNEL, DASH, AREA, PROJECTILE, BUFF, PASSIVE）

### 数据获取方式

#### LeveledSkill数据结构

```typescript
// 从CharBuild获取技能数据
const leveledSkill = this.charBuild.skills?.find(skill => skill.名称 === this.name)

// 获取技能字段
const field = leveledSkill.字段.find(field => field.名称 === "字段名称")
// 获取值
const value = field?.值
// 获取属性影响
const attrEffect = field?.属性影响 // maybe "效益,耐久" or "技能威力" e.t.c.
- 威力影响: 乘法
- 耐久影响: 对持续时间: 乘法, 对每秒神智消耗值: 每秒神智消耗值 = 基础值* Math.max(0.25,(2-效益)/耐久)
- 效益影响: 神智消耗 = 基础值* (2-效益)  每秒神智消耗值 = 基础值* Math.max(0.25,(2-效益)/耐久)
- 范围影响: 乘法
// 示例: 范围影响 = 基础值 * 范围
const rangeField = leveledSkill.字段.find(field => field.名称.includes("技能范围"))
const rangeFieldAttrEffect = rangeField?.属性影响
// 获取范围值
const rangeValue = rangeField?.值
// 计算属性影响
const attrs = this.charBuild.calculateAttributes()
const rangeValueFinal = rangeValue * (rangeFieldAttrEffect?.includes("技能范围") ? attrs.范围 : 1)


// 常用属性
- 神智消耗值: leveledSkill.神智消耗值
- 每秒神智消耗值: leveledSkill.每秒神智消耗值
- 伤害值: leveledSkill.伤害值
```

#### CharBuild.calculateAttributes

```typescript
// 获取角色属性
const attrs = this.charBuild.calculateAttributes()

// 常用属性
- 威力: attrs.威力
- 耐久: attrs.耐久
- 效益: attrs.效益
- 范围: attrs.范围
- 神智: attrs.神智
```

## 技能实现模式

### 1. 瞬发技能 (INSTANT)

```typescript
export class SomeInstantSkill extends SkillBase {
    name = "技能名称"
    type = SkillType.INSTANT
    cooldown = 冷却时间

    onCast(state: GameState, playerPosition: { x: number; y: number }): void {
        // 获取技能数据
        const leveledSkill = this.getLeveledSkill()

        // 执行技能逻辑
        this.dealDamage(state, playerPosition)
    }

    private getLeveledSkill() {
        return this.charBuild.skills?.find((skill) => skill.名称 === this.name)
    }
}
```

### 2. 持续施法技能 (CHANNEL)

```typescript
export class SomeChannelSkill extends SkillBase {
    name = "技能名称"
    type = SkillType.CHANNEL
    cooldown = 冷却时间
    duration = 持续时间
    tickRate = 触发频率

    private lastTickTime = 0

    initialize(state: GameState, playerPosition: { x: number; y: number }): void {
        this.lastTickTime = Date.now()
        // 初始化逻辑
    }

    update(dt: number, state: GameState): boolean {
        const now = Date.now()
        const timeSinceLastTick = (now - this.lastTickTime) / 1000

        if (timeSinceLastTick >= this.tickRate!) {
            // 执行周期性逻辑
            this.performPeriodicAction(state)
            this.lastTickTime = now
        }

        return true // 继续保持活跃
    }

    onEnd(state: GameState): void {
        // 清理逻辑
    }
}
```

### 3. 突进技能 (DASH)

```typescript
export class SomeDashSkill extends SkillBase {
    name = "技能名称"
    type = SkillType.DASH
    cooldown = 冷却时间
    range = 技能范围

    onCast(state: GameState, playerPosition: { x: number; y: number }): void {
        // 计算方向
        const dx = state.input.mousePosition.x - playerPosition.x
        const dy = state.input.mousePosition.y - playerPosition.y
        const length = Math.hypot(dx, dy)
        const direction = { x: dx / length, y: dy / length }

        // 执行突进逻辑
        this.performDash(state, playerPosition, direction)
    }
}
```

### 4. 被动技能 (PASSIVE)

```typescript
export class SomePassiveSkill extends SkillBase {
    name = "技能名称"
    type = SkillType.PASSIVE
    cooldown = 0

    initialize(state: GameState, playerPosition: { x: number; y: number }): void {
        // 设置监听器
        this.setupListeners(state)
    }

    private setupListeners(state: GameState): void {
        // 监听游戏事件并应用被动效果
    }
}
```

## 状态管理系统

### 玩家状态扩展

```typescript
// 扩展PlayerState接口以支持技能特定状态
interface ExtendedPlayerState extends PlayerState {
    // 神智系统
    sanity?: number
    maxSanity?: number

    // 电能系统
    electricEnergy?: number
    maxElectricEnergy?: number

    // 增益效果
    damageBoostEndTime?: number
    damageBoostAmount?: number

    // 状态标记
    electricFieldBurst?: boolean
    movementSpeedBoost?: number
}
```

### 资源消耗模式

```typescript
// 安全的资源消耗方法
private consumeResource(state: GameState, resourceType: string, amount: number): boolean {
    const playerState = state.player as any
    const currentAmount = playerState[resourceType] || 0
    const maxAmount = playerState[`max${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)}`] || 100

    if (currentAmount >= amount) {
        playerState[resourceType] = Math.max(0, currentAmount - amount)
        return true
    }

    return false // 资源不足
}
```

## 伤害计算系统

### 基础伤害计算

```typescript
private calculateDamage(damageType?: string): number {
    const baseDamage = this.charBuild.calculateRandomDamage(this.name)
    const leveledSkill = this.getLeveledSkill()

    if (!leveledSkill) return baseDamage

    // 根据伤害类型获取对应的倍率
    const damageField = leveledSkill.字段.find(field =>
        damageType ? field.名称.includes(damageType) : field.名称 === "伤害"
    )

    const damageMultiplier = (damageField?.值 || 100) / 100
    return baseDamage * damageMultiplier
}
```

### 伤害应用

```typescript
private applyDamage(state: GameState, target: any, damage: number): void {
    const element = state.player.charData.属性

    // 应用伤害
    CollisionSystem.applyDamage(state, damage)

    // 显示伤害数字
    state.damageNumbers.push(new DamageNumberEntity(target.position, damage, element))
}
```

## 效果持续时间管理

### 增益效果管理

```typescript
private applyBuff(state: GameState, buffType: string, duration: number, amount: number): void {
    const playerState = state.player as any
    const now = Date.now()

    switch (buffType) {
        case "damageBoost":
            playerState.damageBoostEndTime = now + duration
            playerState.damageBoostAmount = amount
            break
        case "movementSpeed":
            playerState.movementSpeedBoost = amount
            break
        // 其他增益效果...
    }
}

private checkBuffExpired(state: GameState, buffType: string): boolean {
    const playerState = state.player as any
    const now = Date.now()

    switch (buffType) {
        case "damageBoost":
            return now > (playerState.damageBoostEndTime || 0)
        default:
            return false
    }
}
```

## 通用工具方法

### 辅助方法

```typescript
// 获取LeveledSkill实例
private getLeveledSkill() {
    return this.charBuild.skills?.find(skill => skill.名称 === this.name)
}

// 获取角色属性
private getCharacterAttributes() {
    return this.charBuild.calculateAttributes()
}

// 计算距离
private calculateDistance(pos1: { x: number; y: number }, pos2: { x: number; y: number }): number {
    return Math.hypot(pos1.x - pos2.x, pos1.y - pos2.y)
}

// 检查范围内目标
private getTargetsInRange(state: GameState, center: { x: number; y: number }, range: number): any[] {
    return state.enemies.filter(enemy =>
        this.calculateDistance(center, enemy.position) <= range
    )
}
```

## 最佳实践

### 1. 数据驱动

- 所有数值从LeveledSkill和CharBuild.calculateAttributes获取
- 避免硬编码数值，提高可维护性

### 2. 类型安全

- 使用适当的类型断言和检查
- 为扩展的PlayerState属性提供默认值

### 3. 性能优化

- 缓存计算结果，避免重复计算
- 合理使用对象池，减少内存分配

### 4. 错误处理

- 提供合理的默认值
- 检查必要的数据是否存在

### 5. 代码复用

- 提取通用逻辑到基类或工具方法
- 使用组合而非继承来实现复杂功能

## 调试和测试

### 调试技巧

```typescript
// 添加调试日志
console.log(`技能 ${this.name} 等级 ${this.getLeveledSkill()?.等级}, 伤害倍率 ${damageMultiplier}`)

// 验证数据完整性
if (!this.getLeveledSkill()) {
    console.warn(`技能 ${this.name} 数据未找到`)
}
```

### 测试要点

- 验证技能数据获取是否正确
- 测试资源消耗和恢复逻辑
- 检查效果持续时间的准确性
- 验证伤害计算的正确性
