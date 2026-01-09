import { DNASubModule, DNABaseAPI } from "./base"
import {
    DNACancleStatus,
    DNACommonBooleanBean,
    DNAPrivateSetBean,
    DNAUserAddressBean,
    DNAsettingBlackBean,
    DNAsettingMsgShiledBean,
    DNAsettingPostShiledBean,
    DNANotifySwitchEntity,
} from "../type-generated"

export class SettingAPI extends DNASubModule {
    constructor(base: DNABaseAPI) {
        super(base)
    }
    async addAddress(receiverName: string, receiverMobile: string, receiverAddress: string) {
        return await this._dna_request("user/more/userAddressAdd", { receiverName, receiverMobile, receiverAddress })
    }

    async blackUser(toUserId: string, type: number) {
        return await this._dna_request("user/blackUser", { toUserId, type })
    }

    async cancelCode(code: string) {
        return await this._dna_request("user/more/cancelCode", { code })
    }

    async cancel(cancelType: number, operateType: number, position: string, cancelReason: number | null, reasonDetail: string) {
        return await this._dna_request("user/more/cancel", { cancelType, operateType, position, cancelReason, reasonDetail })
    }

    async deleteAddress(addressId: number) {
        return await this._dna_request<DNACommonBooleanBean>("user/more/deleteUserAddress", { addressId })
    }

    async editAddress(addressId: number, receiverName: string, receiverMobile: string, receiverAddress: string) {
        return await this._dna_request<DNACommonBooleanBean>("user/more/userAddressEdit", {
            addressId,
            receiverName,
            receiverMobile,
            receiverAddress,
        })
    }

    async feedback(listPic: string, proDesc: string, mobile: string, isLogin: number) {
        return await this._dna_request("user/more/feedback", { listPic, proDesc, mobile, isLogin })
    }

    async getCancelStatus() {
        return await this._dna_request<DNACancleStatus>("user/more/getCancelStatus")
    }

    async getNotifySwitch() {
        return await this._dna_request<DNANotifySwitchEntity>("user/push/getSwitchStatus")
    }

    async getPrivateSet() {
        return await this._dna_request<DNAPrivateSetBean>("user/getPrivateSet")
    }

    async getUserAddress(userId: number, type: number) {
        return await this._dna_request<DNAUserAddressBean>("user/more/getUserAddress", { userId, type })
    }

    async getUserBlackList(pageIndex: number, pageSize: number) {
        return await this._dna_request<DNAsettingBlackBean>("user/getUserBlackList", { pageIndex, pageSize })
    }

    async msgListDetail(pageNo: number, pageSize: number, type: number) {
        return await this._dna_request<DNAsettingMsgShiledBean>("user/block/listDetail", { pageNo, pageSize, type })
    }

    async postListDetail(pageNo: number, pageSize: number, type: number) {
        return await this._dna_request<DNAsettingPostShiledBean>("user/block/listDetail", { pageNo, pageSize, type })
    }

    async privateSet(operateType: number, option: number) {
        return await this._dna_request("user/privateSet", { operateType, option })
    }

    async sendSms(mobile: string, timeStamp: string, type: number) {
        return await this._dna_request("user/sms/sendSms", { mobile, timeStamp, type })
    }

    async setDefaultAddress(addressId: number) {
        return await this._dna_request<DNACommonBooleanBean>("user/more/setDefaultAddress", { addressId })
    }

    async setNotifySwitch(operateType: number, switchType: number) {
        return await this._dna_request("user/push/updateSwitchStatus", { operateType, switchType })
    }

    async uploadFeedBack(file: File) {
        const data = new FormData()
        data.append("parts", file)
        return await this.fileUpload("user/img/uploadFeedBack", data)
    }
}
