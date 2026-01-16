import { DNASubModule } from "./base"

export interface DNAMapMatterCategorizeOption {
    icon: string
    id: number
    matters: DNAMapMatter[]
    name: string
    sort?: number
}

export interface DNAMatterCategorizeDetail {
    icon: string
    id: number
    matters: DNAMapMatterDetail[]
    name: string
    sort?: number
}

export interface DNAMapMatter {
    icon: string
    id: number
    mapMatterCategorizeId: number
    name: string
    sort: number
}

export interface DNAMapCategorizeListRes {
    list: DNAMatterCategorizeList[]
}

export interface DNAMatterCategorizeList {
    id: number
    maps: DNAMap[]
    name: string
}

export interface DNAMapDetailRes {
    floors: DNAMapFloor[]
    matterCategorizes: DNAMatterCategorizeDetail[]
    map: DNAMap
    userSites: DNAMapSite[]
}

export interface DNAMap {
    id: number
    name: string
    pid?: number
}

export interface DNAMapMatterDetail extends DNAMapMatter {
    sites: DNAMapSite[]
}

export interface DNAMapSite {
    id: number
    isHide: number
    mapFloorId: number
    mapId: number
    mapMatterId: number
    x: number
    y: number
}

export interface DNAMapFloor {
    floor: number
    id: number
    name: string
    pic: string
}

export interface DNAMapSiteDetailRes {
    contributes: DNAMapContribute[]
    description: string
    id: number
    isDel: number
    isHide: number
    mapFloorId: number
    mapId: number
    mapMatterCategorizeId: number
    mapMatterId: number
    pic: string
    script: string
    url: string
    urlDesc: string
    urlIcon: string
    x: number
    y: number
}

interface DNAMapContribute {
    userHeadUrl: string
    userId: string
    userName: string
}

export interface DNAEmoji {
    content: string[]
    gameId: number
    icon: string
    size: number
    title: string
    url: string
}

export class H5API extends DNASubModule {
    async getMapMatterCategorizeOptions() {
        return await this._dna_request_h5<DNAMapMatterCategorizeOption[]>("map/matter/categorize/getOptions")
    }

    async getMapCategorizeList() {
        return await this._dna_request_h5<DNAMapCategorizeListRes>("map/categorize/list")
    }

    async getMapDetail(id: number) {
        return await this._dna_request_h5<DNAMapDetailRes>("map/detail", { id })
    }

    async getMapSiteDetail(id: number) {
        return await this._dna_request_h5<DNAMapSiteDetailRes>("map/site/detail", { id })
    }

    async getEmojiList() {
        return await this._dna_request_h5<DNAEmoji[]>("config/getEmoji")
    }
}
