import { CharBuild } from "../../data"
import { SkillBase } from "./SkillBase"
import { LiseSkillE, LiseSkillQ } from "./LiseSkills"

export { SkillBase }

export const SkillBehaviorsRegistry: Record<
    string,
    { E: new (charBuild: CharBuild) => SkillBase; Q: new (charBuild: CharBuild) => SkillBase }
> = {
    黎瑟: { E: LiseSkillE, Q: LiseSkillQ },
}

export function getSkillBehaviors(
    charName: string,
): { E: new (charBuild: CharBuild) => SkillBase; Q: new (charBuild: CharBuild) => SkillBase } | null {
    for (const key in SkillBehaviorsRegistry) {
        if (charName.includes(key)) {
            return SkillBehaviorsRegistry[key]
        }
    }
    return null
}
