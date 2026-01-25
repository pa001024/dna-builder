import type {
    DNACharDetailEntity,
    DNAPushStringBean,
    DNARoleEntity,
    DNAShortNoteEntity,
    DNASoulTaskBean,
    DNAWeaponDetailEntity,
} from "../type-generated"
import { DNASubModule } from "./base"

export class GameAPI extends DNASubModule {
    async defaultRoleForTool(type: number = 1, otherUserId = "") {
        const data = { otherUserId, type }
        return await this._dna_request<DNARoleEntity>("role/defaultRoleForTool", data, { sign: true })
    }

    async getMhSwitchStatus() {
        return await this._dna_request<DNAPushStringBean>("user/push/getMhSwitchStatus")
    }

    async getRoleDetail(char_id: number | string, char_eid: string, otherUserId?: string) {
        const data = { charId: char_id, charEid: char_eid, type: 1, otherUserId }
        return await this._dna_request<DNACharDetailEntity>("role/getCharDetail", data)
    }

    /**
     * 获取铸造信息
     */
    async getShortNoteInfo() {
        return await this._dna_request<DNAShortNoteEntity>("role/getShortNoteInfo", undefined, { sign: true })
    }

    async getWeaponDetail(weapon_id: number | string, weapon_eid: string, otherUserId?: string) {
        const data = { weaponId: weapon_id, weaponEid: weapon_eid, type: 1, otherUserId }
        return await this._dna_request<DNAWeaponDetailEntity>("role/getWeaponDetail", data)
    }

    async updateMhSwitchStatus(config: string) {
        return await this._dna_request("user/push/updateMhSwitchStatus", { config })
    }

    async soulTask() {
        return await this._dna_request<DNASoulTaskBean>("role/soul/task")
    }
}
