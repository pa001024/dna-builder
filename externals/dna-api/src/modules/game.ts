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
    async defaultRoleForTool(type: number = 1, otherUserId?: string) {
        const data = { otherUserId, type }
        if (!otherUserId) {
            delete data.otherUserId
        }
        return await this._dna_request<DNARoleEntity>("role/defaultRoleForTool", data, { sign: true, token: true, tokenSig: true })
    }

    async getMhSwitchStatus() {
        return await this._dna_request<DNAPushStringBean>("user/push/getMhSwitchStatus")
    }

    async getRoleDetail(char_id: number | string, char_eid: string, otherUserId?: string) {
        const data = { charId: char_id, charEid: char_eid, type: 1, otherUserId }
        return await this._dna_request<DNACharDetailEntity>("role/getCharDetail", data)
    }

    async getShortNoteInfo() {
        return await this._dna_request<DNAShortNoteEntity>("role/getShortNoteInfo")
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
