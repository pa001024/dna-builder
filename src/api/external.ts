// 用不了 完全错误的数据
export async function getInstanceInfo() {
    interface Result {
        code: number
        msg: string
        data: Datum[]
        meta: Meta
    }

    interface Meta {
        request_id: string
        trace_id: string
    }

    interface Datum {
        instances: Instance[]
    }

    interface Instance {
        id: number
        name: string
    }
    try {
        const res = await fetch("https://www.gamekee.com/v1/dna/instanceInfo", {
            headers: {
                "game-alias": "dna",
            },
        })
        const data = (await res.json()) as Result
        return data.data.map(d => d.instances.map(v => v.name))
    } catch (error) {
        console.error(error)
    }
}

export async function getActivityInfo() {
    interface Result {
        code: number
        msg: string
        data: Datum[]
        meta: Meta
    }

    interface Meta {
        request_id: string
        trace_id: string
        pagination: Pagination
    }

    interface Pagination {
        page_no: number
        limit: number
        page_total: number
        total: number
    }

    interface Datum {
        id: number
        title: string
        link_url: string
        picture: string
        description: string
        begin_at: number
        end_at: number
        importance: number
        count_down: number
        creator_uid: number
        sort: number
        pub_area: string
        tag: string
        image_list: string
        big_picture: string
        activity_kind_id: number
        activity_kind_name: string
        activity_state: number
    }
    try {
        const res = await fetch(
            "https://www.gamekee.com/v1/activity/page-list?importance=0&sort=-1&keyword=&limit=999&page_no=1&serverId=110&status=0",
            {
                headers: {
                    "game-alias": "dna",
                },
            }
        )
        const data = (await res.json()) as Result
        return data.data.map(v => ({
            title: v.title,
            description: v.description,
            begin_at: v.begin_at,
            end_at: v.end_at,
        }))
    } catch (error) {
        console.error(error)
    }
}
