import { CharBuild } from "../../data"
import { SkillBase } from "./SkillBase"
import { LiseSkillE, LiseSkillQ } from "./LiseSkills"
import { LynnSkillE, LynnSkillQ } from "./LynnSkills"
import { SageSkillE, SageSkillQ } from "./SageSkills"
import { NifSkillE, NifSkillQ } from "./NifSkills"

export { SkillBase }

export const SkillBehaviorsRegistry: Record<
    string,
    { E: new (charBuild: CharBuild) => SkillBase; Q: new (charBuild: CharBuild) => SkillBase }
> = {
    黎瑟: { E: LiseSkillE, Q: LiseSkillQ },
    琳恩: { E: LynnSkillE, Q: LynnSkillQ },
    赛琪: { E: SageSkillE, Q: SageSkillQ },
    妮弗尔: { E: NifSkillE, Q: NifSkillQ },
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
