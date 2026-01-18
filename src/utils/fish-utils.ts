import { type Fish, type FishingSpot, fishMap } from "@/data"

const RANDOM_LENGTH_FISH_IDS = [
    // 鳌虾
    1203, 120301,
    // 长须翁
    1201, 120101,
]
/**
 * 通用定价计算函数
 * @param fish 鱼数据对象（包含基准长度、价格参数、长度范围等）
 * @param actualLength 随机实际目标长度（在length范围内随机）
 * @returns 最终计算价格（数值类型）
 */
export function calculateFishPrice(fish: Fish, actualLength?: number): { fish: Fish; price: number; length: number } {
    if (!RANDOM_LENGTH_FISH_IDS.includes(fish.id)) {
        actualLength = fish.length[1]
    } else {
        actualLength = Math.min(
            Math.max(actualLength || Math.random() * (fish.length[1] - fish.length[0]) + fish.length[0], fish.length[0]),
            fish.length[1]
        )
    }
    const minLength = fish.length[0]
    const maxLength = fish.length[1]
    // 步骤2：提取公式核心参数（基于之前推导的定价逻辑，补充price3说明：
    // 因Fish接口未直接定义price3，基于样本数据对应关系，此处假设若需完整计算，可扩展接口或从price数组后续元素取值，
    // 此处先保留公式核心逻辑，同时处理除数为0的边界情况（length1 === length2时）
    const deltaLTotal = maxLength - minLength
    const deltaL = actualLength - minLength

    // 步骤3：按照推导的核心公式计算实际价格
    let finalPrice: number
    if (deltaLTotal <= 0) {
        // 长度范围无波动（length1 === length2），直接取上限价格
        finalPrice = fish.price[0] + (fish.price[1] - 1) * fish.price[2]
    } else {
        // 核心定价公式：P = price[0] + ((price[1] - 1) * price[2] * (L - minLength)) / (maxLength - minLength)
        const priceRatio = ((fish.price[1] - 1) * fish.price[2] * deltaL) / deltaLTotal
        finalPrice = fish.price[0] + priceRatio
    }

    // 步骤4：处理价格精度，与样本数据格式对齐（保留1位小数或取整）
    finalPrice = Number(finalPrice.toFixed(1))

    // 步骤5：返回指定格式的结果对象
    return {
        fish: fish,
        price: finalPrice,
        length: actualLength,
    }
}

/**
 * 获取随机鱼
 * @param spot 钓鱼地点
 * @param time 钓鱼时间  1=上午 2=下午 3=夜晚
 * @param lure 鱼饵 0=普通 1=同类相吸 2=好翅爱吃
 * @returns 随机鱼
 */
export function getRandomFish(spot: FishingSpot, time: 1 | 2 | 3, lure: 0 | 1 | 2 = 0): { fish: Fish; actualLength: number } {
    const AddVariationProb = lure === 1 ? 0.3 : 0
    const AddRareFishProb = lure === 2 ? 1 : 0
    const fishs = spot.weights
        .map((weight, index) => {
            const fish = fishMap.get(spot.fishIds[index])!
            return {
                weight: fish.type > 1 ? weight * (1 + AddRareFishProb) : weight,
                fish: { ...fish, varProb: (fish.varProb || 0) * (1 + AddVariationProb) },
            }
        })
        .filter(fish => fish.fish.appear.includes(time))
    const totalWeight = fishs.reduce((acc, cur) => acc + cur.weight, 0)
    const randomWeight = Math.random() * totalWeight
    let currentWeight = 0
    for (const fishGroup of fishs) {
        currentWeight += fishGroup.weight
        if (randomWeight <= currentWeight) {
            const fish = fishGroup.fish
            return {
                fish,
                actualLength: fish.type > 1 ? fish.length[1] : Math.random() * (fish.length[1] - fish.length[0]) + fish.length[0],
            }
        }
    }
    return {
        fish: fishs[0].fish,
        actualLength:
            fishs[0].fish.type > 1
                ? fishs[0].fish.length[1]
                : Math.random() * (fishs[0].fish.length[1] - fishs[0].fish.length[0]) + fishs[0].fish.length[0],
    }
}
