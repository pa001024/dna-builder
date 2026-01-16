import type {
    DNAAliProductConfigBean,
    DNAAliProductListBean,
    DNAApplyStatusBean,
    DNACommonBooleanBean,
    DNACreatorDescriptionBean,
    DNACustomCreativeDesc,
    DNAGoldBuyBean,
    DNAGoldDrawBean,
    DNAGoldGoodsEntity,
    DNAGoldRealBean,
    DNAGoldRecordEntity,
    DNAGoldTotalBean,
    DNALookPageBean,
    DNALuckyDrawBean,
    DNAUserAddressBean,
    DNAUserExperienceRecordEntity,
    DNAUserGameLevelEntity,
    DNAUserTaskProcessEntity,
    DNAWinListBean,
} from "../type-generated"
import { DNASubModule } from "./base"

export class UserGrowingAPI extends DNASubModule {
    async addAddress(receiverName: string, receiverMobile: string, receiverAddress: string) {
        return await this._dna_request("user/more/userAddressAdd", { receiverName, receiverMobile, receiverAddress })
    }

    async apply(
        type: number,
        id: number | null,
        concatWay: string,
        otherPlatform: string,
        otherPlatformUrl: string,
        otherPlatformFans: string,
        materialUrl: string,
        gameId: number | null
    ) {
        return await this._dna_request<DNAApplyStatusBean>("user/creator/apply", {
            type,
            id,
            concatWay,
            otherPlatform,
            otherPlatformUrl,
            otherPlatformFans,
            materialUrl,
            gameId,
        })
    }

    async awardList(drawId: number) {
        return await this._dna_request<DNAWinListBean>("encourage/draw/awardList", { drawId })
    }

    async awardWin(drawId: number, fullName: string, mobile: string, address: string) {
        return await this._dna_request("/encourage/draw/awardWin", { drawId, fullName, mobile, address })
    }

    async buyGold(drawId: number, count: number) {
        return await this._dna_request<DNAGoldBuyBean>("encourage/draw/buy", { drawId, count })
    }

    async buyProduct(address: string, fullName: string, mobile: string, productId: number) {
        return await this._dna_request("/encourage/store/buyProduct", { address, fullName, mobile, productId })
    }

    async deleteAddress(addressId: number) {
        return await this._dna_request<DNACommonBooleanBean>("user/more/deleteUserAddress", { addressId })
    }

    async drawDetail(drawId: number) {
        return await this._dna_request<DNAGoldDrawBean>("encourage/draw/detail", { drawId })
    }

    async editAddress(addressId: number, receiverName: string, receiverMobile: string, receiverAddress: string) {
        return await this._dna_request<DNACommonBooleanBean>("user/more/userAddressEdit", {
            addressId,
            receiverName,
            receiverMobile,
            receiverAddress,
        })
    }

    async getAliProductConfig() {
        return await this._dna_request<DNAAliProductConfigBean>("encourage/store/ali/getAliStoreConfigAndBanner")
    }

    async getAliProductList(gameId: number | null, pageIndex: number, pageSize: number) {
        return await this._dna_request<DNAAliProductListBean>("encourage/store/ali/productList", { gameId, pageIndex, pageSize })
    }

    async getApplyPage() {
        return await this._dna_request<DNACustomCreativeDesc>("user/creator/getApplyPage")
    }

    async getExpLogsList(gameId: number, pageIndex: number, pageSize: number) {
        return await this._dna_request<DNAUserExperienceRecordEntity>("encourage/level/getExpLogs", { gameId, pageIndex, pageSize })
    }

    async getGameCreator() {
        return await this._dna_request<DNACreatorDescriptionBean>("config/identification/getGameCreator")
    }

    async getGoldDetailList(pageIndex: number, pageSize: number, type: number, storeType: number) {
        return await this._dna_request<DNAGoldRecordEntity>("encourage/gold/getGoldLogs", { pageIndex, pageSize, type, storeType })
    }

    async getProductList(gameId: number | null, pageIndex: number, pageSize: number, storeType: number) {
        return await this._dna_request<DNAGoldGoodsEntity>("encourage/store/productList", { gameId, pageIndex, pageSize, storeType })
    }

    async getTotalGold(type?: number) {
        if (type !== undefined) {
            return await this._dna_request<DNAGoldTotalBean>("encourage/gold/getTotalGold", { type })
        }
        return await this._dna_request<DNAGoldTotalBean>("encourage/gold/getTotalGold")
    }

    async getUserAddress(userId: number, type: number) {
        return await this._dna_request<DNAUserAddressBean>("user/more/getUserAddress", { userId, type })
    }

    async getUserGameLevel(gameId: number | null, ifProcess: number, otherUserId: number | null) {
        return await this._dna_request<DNAUserGameLevelEntity>("encourage/level/getUserGameLevelDetail", {
            gameId,
            ifProcess,
            otherUserId,
        })
    }

    async getUserGameTaskProcess(gameId: number, userId: number) {
        return await this._dna_request<DNAUserTaskProcessEntity>("encourage/level/getTaskProcess", { gameId, userId })
    }

    async list(pageIndex: number, pageSize: number, queryType: number | null, gameId: number | null) {
        return await this._dna_request<DNALuckyDrawBean>("encourage/draw/list", { pageIndex, pageSize, queryType, gameId })
    }

    async page() {
        return await this._dna_request<DNALookPageBean>("user/creator/page")
    }

    async productDetail(productId: number) {
        return await this._dna_request<DNAGoldRealBean>("encourage/store/productDetail", { productId })
    }

    async setDefaultAddress(addressId: number) {
        return await this._dna_request<DNACommonBooleanBean>("user/more/setDefaultAddress", { addressId })
    }

    async uploadImage(file: File) {
        const data = new FormData()
        data.append("parts", file)
        return await this.fileUpload("user/img/uploadHead", data)
    }
}
