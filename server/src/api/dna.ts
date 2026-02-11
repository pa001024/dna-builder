import { fetch } from "bun"
import { DNAAPI } from "dna-api"

export const getDNAAPI = () => {
    const dnaAPI = new DNAAPI({
        dev_code: process.env.DEV_CODE!,
        token: process.env.USER_TOKEN,
        fetchFn: fetch,
        mode: "android",
    })
    return dnaAPI
}
